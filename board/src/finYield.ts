// Cash yield check: what each cash account and GIC earns now, against good current rates.
// Rates come from the interest lines in the imported statements where possible, otherwise from a rate typed in.
// The comparison rates (rate_benchmarks) and all amounts live in the private settings, never in this file.
import { latestBalances, saveFinSettings, toCad } from './finance'
import type { Cur, Finance, FinAccount, FinSettings, Fx } from './finance'

export interface RateBenchmarks {
  as_of: string
  CAD: { savings: number; savings_who: string; gic1y: number; gic1y_who: string }
  HKD?: { td3m: number; td3m_who: string; td_best: number; td_best_who: string }
  sources?: { label: string; url: string }[]
  note?: string
}
export interface AccountRate { rate?: number | null; keep?: number; note?: string; matures?: string }
export type YieldSettings = FinSettings & {
  rate_benchmarks?: RateBenchmarks
  account_rates?: Record<string, AccountRate>
  statement_accounts?: Record<string, string>
}

export interface YieldRow {
  a: FinAccount
  balance: number
  everyday: boolean
  keep: number
  rate: number | null
  basis: 'statement' | 'entered' | 'unknown'
  interest12: number | null
  months: number
  bench: number | null
  benchWho: string
  extraYear: number
  extraYearCad: number
}

const INTEREST = /INTEREST/i
const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000

export function yieldCheck(f: Finance, fx: Fx): { rows: YieldRow[]; bench: RateBenchmarks | null; extraCad: number; unknown: number } {
  const s = f.settings as YieldSettings
  const bench = s.rate_benchmarks ?? null
  const rates = s.account_rates ?? {}
  const map = s.statement_accounts ?? {}
  const latest = latestBalances(f)
  const rows: YieldRow[] = []
  for (const a of f.accounts.filter((x) => x.active && (x.kind === 'cash' || x.kind === 'gic'))) {
    const balance = latest.get(a.id)?.amount ?? 0
    if (balance < 500 || (a.currency !== 'CAD' && a.currency !== 'HKD')) continue
    const everyday = a.kind === 'cash' && /Chequing/i.test(a.name)
    const r = rates[a.id] ?? {}
    const keep = everyday ? balance : Math.min(balance, r.keep ?? 0)
    // Interest from the statements of every statement account mapped to this account.
    const labels = Object.entries(map).filter(([, id]) => id === a.id).map(([l]) => l)
    let rate: number | null = null
    let basis: YieldRow['basis'] = 'unknown'
    let interest12: number | null = null
    let months = 0
    if (labels.length) {
      const tx = f.transactions.filter((t) => labels.includes(t.account))
      const last = tx.map((t) => t.posted_on).sort().pop()
      const first = tx.map((t) => t.posted_on).sort()[0]
      if (last && first) {
        const from = new Date(new Date(last).getTime() - 365 * 86400000).toISOString().slice(0, 10)
        const start = first > from ? first : from
        // Monthly interest paid n times spans n - 1 months, so count the months inclusively.
        months = Math.min(12, Math.max(1, Math.round(daysBetween(start, last) / 30.4) + 1))
        interest12 = tx.filter((t) => t.posted_on > from && t.kind === 'income' && INTEREST.test(t.description)).reduce((x, t) => x + t.amount, 0)
        rate = balance ? (interest12 * (12 / months) / balance) * 100 : 0
        basis = 'statement'
      }
    }
    if (r.rate !== undefined && r.rate !== null) { rate = r.rate; basis = 'entered' }
    let b: number | null = null
    let who = ''
    if (bench) {
      if (a.currency === 'CAD') { b = a.kind === 'gic' ? bench.CAD.gic1y : bench.CAD.savings; who = a.kind === 'gic' ? bench.CAD.gic1y_who : bench.CAD.savings_who }
      else if (bench.HKD) { b = a.kind === 'gic' ? bench.HKD.td_best : bench.HKD.td3m; who = a.kind === 'gic' ? bench.HKD.td_best_who : bench.HKD.td3m_who }
    }
    const room = balance - keep
    const extraYear = !everyday && rate !== null && b !== null && b > rate ? (room * (b - rate)) / 100 : 0
    rows.push({ a, balance, everyday, keep, rate, basis, interest12, months, bench: b, benchWho: who, extraYear, extraYearCad: toCad(extraYear, a.currency as Cur, fx) })
  }
  rows.sort((x, y) => y.extraYearCad - x.extraYearCad || toCad(y.balance, y.a.currency, fx) - toCad(x.balance, x.a.currency, fx))
  return {
    rows, bench,
    extraCad: rows.reduce((x, r) => x + r.extraYearCad, 0),
    unknown: rows.filter((r) => !r.everyday && r.basis === 'unknown').length,
  }
}

export async function saveAccountRate(userId: string, f: Finance, id: string, patch: AccountRate): Promise<void> {
  const s = f.settings as YieldSettings
  const cur = s.account_rates ?? {}
  await saveFinSettings(userId, f.settings, { account_rates: { ...cur, [id]: { ...cur[id], ...patch } } } as Partial<FinSettings>)
}
