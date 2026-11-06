// Recent spending against the same months a year earlier, budgets, and recurring bills.
import { supabase } from '../../src/lib/supabase'
import { addMonth, monthly, saveFinSettings, toCad } from './finance'
import type { Finance, FinSettings, FinTransaction, Fx } from './finance'
import { categoryOf, incomeType } from './finAnalytics'

export type Budget = Record<string, number>
export const budgetOf = (s: FinSettings): Budget => ((s as FinSettings & { budget?: Budget }).budget ?? {})
export async function saveBudget(userId: string, s: FinSettings, budget: Budget): Promise<void> {
  await saveFinSettings(userId, s, { budget } as Partial<FinSettings>)
}

// The last month that bank statements fully cover (a month ending before the 25th counts as partial).
export function lastFullMonth(f: Finance): string | null {
  const last = f.transactions.map((t) => t.posted_on).sort().pop()
  if (!last) return null
  return Number(last.slice(8, 10)) >= 25 ? last.slice(0, 7) : addMonth(last.slice(0, 7), -1)
}

const monthLabel = (ym: string) => new Date(`${ym}-15`).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
export const periodLabel = (ms: string[]) => `${monthLabel(ms[0])} to ${monthLabel(ms[ms.length - 1])}`

export interface CompareRow { category: string; now: number; before: number; diff: number; pct: number | null; flag: 'up' | 'down' | null; budget: number | null }

export function recent(f: Finance, fx: Fx, span = 3) {
  const end = lastFullMonth(f)
  if (!end) return null
  const now = Array.from({ length: span }, (_, i) => addMonth(end, i - span + 1))
  const before = now.map((m) => addMonth(m, -12))
  const exp = monthly(f, fx, 'expense', [...now, ...before])
  const inc = monthly(f, fx, 'income', [...now, ...before])
  const byCat = (ms: string[]) => {
    const out = new Map<string, number>()
    for (const m of ms) for (const [l, v] of exp.get(m) ?? []) out.set(categoryOf(l), (out.get(categoryOf(l)) ?? 0) + v)
    return out
  }
  const incBy = (ms: string[]) => {
    const out = new Map<string, number>()
    for (const m of ms) for (const [l, v] of inc.get(m) ?? []) out.set(incomeType(l), (out.get(incomeType(l)) ?? 0) + v)
    return out
  }
  const a = byCat(now), b = byCat(before)
  const budget = budgetOf(f.settings)
  const rows: CompareRow[] = [...new Set([...a.keys(), ...b.keys(), ...Object.keys(budget)])].map((c) => {
    const n = a.get(c) ?? 0, p = b.get(c) ?? 0, diff = n - p
    const pct = p >= 50 ? diff / p : null
    const flag: CompareRow['flag'] = Math.abs(diff) >= 300 && (pct === null || Math.abs(pct) >= 0.25) ? (diff > 0 ? 'up' : 'down') : null
    return { category: c, now: n, before: p, diff, pct, flag, budget: budget[c] ? budget[c] * span : null }
  }).filter((r) => r.now || r.before || r.budget).sort((x, y) => Math.max(y.now, y.before) - Math.max(x.now, x.before))
  const ia = incBy(now), ib = incBy(before)
  const income = [...new Set([...ia.keys(), ...ib.keys()])].map((k) => ({ type: k, now: ia.get(k) ?? 0, before: ib.get(k) ?? 0 }))
  const largest = f.transactions
    .filter((t) => t.kind === 'expense' && now.includes(t.posted_on.slice(0, 7)))
    .map((t) => ({ t, cad: -toCad(t.amount, t.currency, fx) }))
    .sort((x, y) => y.cad - x.cad).slice(0, 6)
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0)
  return { now, before, rows, income, largest, spendNow: sum(a), spendBefore: sum(b), incomeNow: sum(ia), incomeBefore: sum(ib) }
}

// Suggested monthly budget per category: the average over the 12 months up to the last full statement month,
// counting only months that have recorded spending.
export function suggestions(f: Finance, fx: Fx): { category: string; monthly: number; months: number }[] {
  const end = lastFullMonth(f)
  if (!end) return []
  const months = Array.from({ length: 12 }, (_, i) => addMonth(end, i - 11))
  const exp = monthly(f, fx, 'expense', months)
  const recorded = months.filter((m) => exp.has(m))
  const tot = new Map<string, number>()
  for (const m of recorded) for (const [l, v] of exp.get(m) ?? []) tot.set(categoryOf(l), (tot.get(categoryOf(l)) ?? 0) + v)
  return [...tot].map(([category, v]) => ({ category, monthly: v / (recorded.length || 1), months: recorded.length }))
    .filter((x) => x.monthly > 0).sort((a, b) => b.monthly - a.monthly)
}

// ------------------------------------------------------------------ recurring bills
export type Frequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly'
export const PER_YEAR: Record<Frequency, number> = { monthly: 12, bimonthly: 6, quarterly: 4, semiannual: 2, yearly: 1 }
export const FREQ_LABEL: Record<Frequency, string> = { monthly: 'Monthly', bimonthly: 'Every 2 months', quarterly: 'Every 3 months', semiannual: 'Twice a year', yearly: 'Yearly' }
export interface Recurring {
  id: string; name: string; provider: string; category: string; place: string; amount: number | null
  frequency: Frequency; autopay: boolean | null; pay_from: string; match: string; active: boolean; note: string; sort: number
}

export async function loadRecurring(): Promise<Recurring[]> {
  const { data, error } = await supabase.from('fin_recurring').select('*').order('sort').order('name')
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, amount: r.amount === null ? null : Number(r.amount) })) as Recurring[]
}
export async function saveRecurring(userId: string, r: Partial<Recurring> & { name: string }): Promise<void> {
  const row = { ...r, user_id: userId }
  const { error } = r.id ? await supabase.from('fin_recurring').update(row).eq('id', r.id) : await supabase.from('fin_recurring').insert(row)
  if (error) throw error
}

// Statement payments that match a bill's pattern (case-insensitive).
export function paymentsFor(f: Finance, r: Recurring): FinTransaction[] {
  if (!r.match) return []
  let re: RegExp
  try { re = new RegExp(r.match, 'i') } catch { return [] }
  return f.transactions.filter((t) => t.amount < 0 && re.test(t.description)).sort((a, b) => a.posted_on.localeCompare(b.posted_on))
}
