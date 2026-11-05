// Finance page: data, currency conversion and the sums behind each section.
// Every figure lives in the private database (owner-only row security); nothing personal is in this file.
import { supabase } from '../../src/lib/supabase'
import { feeds } from './data'
import type { Quote } from './data'

export type Cur = 'CAD' | 'USD' | 'HKD'
export type AccountKind = 'cash' | 'gic' | 'investment' | 'credit_card' | 'loan' | 'other'

export interface FinAccount {
  id: string; owner: string; institution: string; name: string; kind: AccountKind
  currency: Cur; sort: number; active: boolean; note: string
}
export interface FinBalance { id: string; account_id: string; as_of: string; amount: number; note: string }
export interface FinProperty {
  id: string; key: string; address: string; share: number; status: 'held' | 'sold' | 'operated'; use: string
  value: number | null; value_source: string; value_as_of: string | null; mortgage: number
  sold_on: string | null; sale_price: number | null; cost: number | null; note: string; sort: number
}
export interface FinIe {
  id: string; month: string; kind: 'income' | 'expense'; line: string; amount: number
  currency: Cur; covers_months: number; source: string; note: string
}
export interface FinHistory { as_of: string; measure: string; category: string | null; amount: number; currency: Cur; note: string }
export interface FinHolding {
  id: string; account_id: string; symbol: string; name: string; name_zh: string
  shares: number; currency: Cur; last_price: number | null; updated_at: string
}
export type TxKind = 'income' | 'expense' | 'transfer' | 'capital'
export interface FinTransaction {
  id: string; account: string; posted_on: string; amount: number; currency: Cur; description: string
  kind: TxKind; line: string; reviewed: boolean; source: string
}
export interface FinArchive { id: string; name: string; as_of: string | null; data: unknown[][] }
export interface FinSettings {
  target?: { cash_months: number; safe_months: number; note?: string }
  spending_estimate?: { monthly: number; currency: Cur; source?: string }
  saving_target?: { amount: number; currency: Cur; source?: string }
  income_lines?: string[]
  expense_lines?: string[]
}

export interface Finance {
  accounts: FinAccount[]; balances: FinBalance[]; properties: FinProperty[]; ie: FinIe[]
  history: FinHistory[]; archive: FinArchive[]; settings: FinSettings
  holdings: FinHolding[]; prices: Record<string, Quote>
  transactions: FinTransaction[]
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

async function all<T>(table: string, order: string): Promise<T[]> {
  // The API returns at most 1,000 rows per request, so page through.
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order).order('id').range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return out
  }
}

export async function loadFinance(): Promise<Finance> {
  const [accounts, balances, properties, ie, history, archive, settings, holdingRows, txRows] = await Promise.all([
    all<FinAccount>('fin_accounts', 'sort'),
    all<FinBalance>('fin_balances', 'as_of'),
    all<FinProperty>('fin_properties', 'sort'),
    all<FinIe>('fin_ie', 'month'),
    all<FinHistory>('fin_history', 'as_of'),
    all<FinArchive>('fin_archive', 'as_of'),
    supabase.from('fin_settings').select('data').maybeSingle(),
    all<FinHolding>('fin_holdings', 'symbol'),
    all<FinTransaction>('fin_transactions', 'posted_on'),
  ])
  const transactions = txRows.map((t) => ({ ...t, amount: Number(t.amount) }))
  if (settings.error) throw settings.error
  const holdings = holdingRows.map((h) => ({ ...h, shares: Number(h.shares), last_price: n(h.last_price) })).filter((h) => h.shares > 0)
  return {
    holdings,
    prices: await loadPrices([...new Set(holdings.map((h) => h.symbol))]),
    accounts,
    balances: balances.map((b) => ({ ...b, amount: Number(b.amount) })),
    properties: properties.map((p) => ({
      ...p, share: Number(p.share), value: n(p.value), mortgage: Number(p.mortgage ?? 0), sale_price: n(p.sale_price), cost: n(p.cost),
    })),
    ie: [...ie.map((r) => ({ ...r, amount: Number(r.amount), covers_months: Number(r.covers_months || 1) })), ...txToIe(transactions)],
    transactions,
    history: history.map((h) => ({ ...h, amount: Number(h.amount) })),
    archive,
    settings: (settings.data?.data ?? {}) as FinSettings,
  }
}

// Bank statement rows that count as income or spending, as monthly lines.
// Spending is stored as money out (negative), so it is flipped; refunds then reduce spending.
export function txToIe(tx: FinTransaction[]): FinIe[] {
  return tx.filter((t) => t.kind === 'income' || t.kind === 'expense').map((t) => ({
    id: `tx-${t.id}`, month: `${t.posted_on.slice(0, 7)}-01`, kind: t.kind as 'income' | 'expense', line: t.line,
    amount: t.kind === 'expense' ? -t.amount : t.amount, currency: t.currency, covers_months: 1, source: 'statement', note: '',
  }))
}

export async function updateTransactions(ids: string[], patch: Partial<Pick<FinTransaction, 'kind' | 'line' | 'reviewed'>>): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('fin_transactions').update(patch).in('id', ids)
  if (error) throw error
}

// ------------------------------------------------------------------ writes
export async function saveBalances(userId: string, asOf: string, rows: { account_id: string; amount: number }[]): Promise<void> {
  if (!rows.length) return
  const { error } = await supabase.from('fin_balances').upsert(
    rows.map((r) => ({ user_id: userId, account_id: r.account_id, as_of: asOf, amount: r.amount })),
    { onConflict: 'account_id,as_of' },
  )
  if (error) throw error
}

export async function addIe(userId: string, row: Omit<FinIe, 'id' | 'source'>): Promise<void> {
  const { error } = await supabase.from('fin_ie').insert({ ...row, user_id: userId, source: 'manual' })
  if (error) throw error
}

export async function saveFinSettings(userId: string, current: FinSettings, patch: Partial<FinSettings>): Promise<void> {
  const { error } = await supabase.from('fin_settings').upsert({ user_id: userId, data: { ...current, ...patch } }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function updateProperty(id: string, patch: Partial<FinProperty>): Promise<void> {
  const { error } = await supabase.from('fin_properties').update(patch).eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------------ exchange rates
// From the markets feed: CAD=X is Canadian dollars per US dollar, CADHKD=X is Hong Kong dollars per Canadian dollar.
export interface Fx { usdCad: number; cadHkd: number; live: boolean }
export const FX_FALLBACK: Fx = { usdCad: 1.38, cadHkd: 5.6, live: false }

export async function loadFx(): Promise<Fx> {
  try {
    const res = await feeds<{ quotes: Quote[] }>('kind=markets&symbols=CAD%3DX,CADHKD%3DX')
    const usdCad = res.quotes.find((q) => q.symbol === 'CAD=X')?.price
    const cadHkd = res.quotes.find((q) => q.symbol === 'CADHKD=X')?.price
    if (usdCad && cadHkd) return { usdCad, cadHkd, live: true }
  } catch { /* fall back below */ }
  return FX_FALLBACK
}

// Live prices for stock holdings, 20 symbols per request (the feed's limit). A failure leaves the stored prices in use.
async function loadPrices(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {}
  for (let i = 0; i < symbols.length; i += 20) {
    try {
      const res = await feeds<{ quotes: Quote[] }>(`kind=markets&symbols=${symbols.slice(i, i + 20).map(encodeURIComponent).join(',')}`)
      for (const q of res.quotes) if (q.price) out[q.symbol] = q
    } catch { /* keep stored prices */ }
  }
  return out
}

export const holdingPrice = (f: Finance, h: FinHolding) => f.prices[h.symbol]?.price ?? h.last_price ?? 0
export const holdingsOf = (f: Finance, accountId: string) => f.holdings.filter((h) => h.account_id === accountId)

// An account's value in its own currency: its stocks at live prices when it has a holdings list, else its latest balance.
export function accountAmount(f: Finance, accountId: string, latest: Map<string, FinBalance>, fx: Fx): number | null {
  const hs = holdingsOf(f, accountId)
  const cur = f.accounts.find((a) => a.id === accountId)?.currency ?? 'CAD'
  if (hs.length) return hs.reduce((s, h) => s + convert(h.shares * holdingPrice(f, h), h.currency, cur, fx), 0)
  return latest.get(accountId)?.amount ?? null
}

export const fromCad = (amount: number, cur: Cur, fx: Fx) => (cur === 'USD' ? amount / fx.usdCad : cur === 'HKD' ? amount * fx.cadHkd : amount)
export const convert = (amount: number, from: Cur, to: Cur, fx: Fx) => (from === to ? amount : fromCad(toCad(amount, from, fx), to, fx))

export async function saveHolding(userId: string, row: { account_id: string; symbol: string; name: string; name_zh: string; shares: number; currency: Cur; last_price: number | null }): Promise<void> {
  const { error } = await supabase.from('fin_holdings').upsert({ ...row, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'account_id,symbol' })
  if (error) throw error
}

export function toCad(amount: number, cur: Cur, fx: Fx): number {
  if (cur === 'USD') return amount * fx.usdCad
  if (cur === 'HKD') return amount / fx.cadHkd
  return amount
}

// ------------------------------------------------------------------ sums
export function latestBalances(f: Finance): Map<string, FinBalance> {
  const m = new Map<string, FinBalance>()
  for (const b of f.balances) {
    const cur = m.get(b.account_id)
    if (!cur || b.as_of > cur.as_of) m.set(b.account_id, b)
  }
  return m
}

export interface Worth {
  asOf: string | null
  byOwner: { owner: string; total: number }[]
  byKind: Record<AccountKind, number>
  accounts: number
  property: number
  debt: number
  total: number
  properties: { p: FinProperty; equity: number }[]
}

export function netWorth(f: Finance, fx: Fx): Worth {
  const latest = latestBalances(f)
  const byKind: Record<AccountKind, number> = { cash: 0, gic: 0, investment: 0, credit_card: 0, loan: 0, other: 0 }
  const owners = new Map<string, number>()
  let asOf: string | null = null
  for (const a of f.accounts.filter((x) => x.active)) {
    const b = latest.get(a.id)
    const amt = accountAmount(f, a.id, latest, fx)
    if (amt === null) continue
    const v = toCad(amt, a.currency, fx)
    byKind[a.kind] += v
    owners.set(a.owner, (owners.get(a.owner) ?? 0) + v)
    if (b && (!asOf || b.as_of > asOf)) asOf = b.as_of
  }
  const properties = f.properties.filter((p) => p.status === 'held').map((p) => ({ p, equity: ((p.value ?? 0) - p.mortgage) * p.share }))
  const property = properties.reduce((s, x) => s + x.equity, 0)
  const accounts = Object.values(byKind).reduce((s, v) => s + v, 0)
  const debt = byKind.credit_card + byKind.loan
  return {
    asOf,
    byOwner: [...owners.entries()].map(([owner, total]) => ({ owner, total })),
    byKind, accounts, property, debt, total: accounts + property, properties,
  }
}

// Month helpers on "YYYY-MM-01" strings.
export const monthKey = (iso: string) => iso.slice(0, 7)
export function addMonth(ym: string, k: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + k, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export function monthsBack(ym: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonth(ym, i - count + 1))
}

// Income and spending by month, with lump sums (for example a 6-monthly distribution) spread over the months they cover.
export function monthly(f: Finance, fx: Fx, kind: 'income' | 'expense', months: string[]): Map<string, Map<string, number>> {
  const want = new Set(months)
  const out = new Map<string, Map<string, number>>()
  for (const r of f.ie) {
    if (r.kind !== kind) continue
    const per = toCad(r.amount, r.currency, fx) / r.covers_months
    for (let i = 0; i < r.covers_months; i++) {
      const ym = addMonth(monthKey(r.month), i)
      if (!want.has(ym)) continue
      const m = out.get(ym) ?? new Map<string, number>()
      m.set(r.line, (m.get(r.line) ?? 0) + per)
      out.set(ym, m)
    }
  }
  return out
}

export const sumMap = (m?: Map<string, number>) => (m ? [...m.values()].reduce((s, v) => s + v, 0) : 0)

// Spending by line for one calendar year, in CAD.
export function yearLines(f: Finance, fx: Fx, year: number, kind: 'income' | 'expense' = 'expense'): { line: string; total: number }[] {
  const m = new Map<string, number>()
  for (const r of f.ie) {
    if (r.kind !== kind || !r.month.startsWith(String(year))) continue
    m.set(r.line, (m.get(r.line) ?? 0) + toCad(r.amount, r.currency, fx))
  }
  return [...m.entries()].map(([line, total]) => ({ line, total })).sort((a, b) => b.total - a.total)
}

export function ieYears(f: Finance): number[] {
  return [...new Set(f.ie.map((r) => Number(r.month.slice(0, 4))))].sort((a, b) => b - a)
}

export interface Mix { cash: number; safe: number; invested: number; spend: number; cashTarget: number; safeTarget: number }
export function mix(w: Worth, s: FinSettings, spendCad: number): Mix {
  const cashMonths = s.target?.cash_months ?? 6
  const safeMonths = s.target?.safe_months ?? 24
  return {
    cash: w.byKind.cash + w.byKind.credit_card,
    safe: w.byKind.cash + w.byKind.credit_card + w.byKind.gic,
    invested: w.byKind.investment + w.byKind.other,
    spend: spendCad,
    cashTarget: cashMonths * spendCad,
    safeTarget: safeMonths * spendCad,
  }
}
