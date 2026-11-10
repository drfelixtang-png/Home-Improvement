// Retirement plan: how much can be spent each month so the money lasts to a chosen age.
// Everything is in today's dollars: returns are turned into "real" returns after inflation,
// so a spending amount keeps its buying power every year. Settings live in the private database.
import { accountAmount, addMonth, latestBalances, monthly, monthsBack, netWorth, ownerName, saveFinSettings, toCad } from './finance'
import type { Finance, FinSettings, Fx } from './finance'
import { incomeGroup } from './finAnalytics'

export interface Scenario { key: string; label: string; ret: number; infl: number }
export interface PlanSettings {
  monthly?: number            // spending to test, today's dollars a month
  income?: number             // other income a month (today's dollars), for example rent not already in the pot
  leave?: number              // money to leave at the end, today's dollars
  exclude?: string[]          // owners (or 'property') left out of the money to live on
  scenarios?: Scenario[]
  stress_drop?: number        // stress test: % fall in stocks in the first year
}
export const DEFAULT_SCENARIOS: Scenario[] = [
  { key: 'cautious', label: 'Cautious', ret: 4.0, infl: 3.0 },
  { key: 'middle', label: 'Middle', ret: 5.0, infl: 2.5 },
  { key: 'hopeful', label: 'Hopeful', ret: 6.0, infl: 2.0 },
]
export const HORIZONS = [90, 95, 100, 110, 120, 130]
export const MAX_AGE = 130

export interface Person { key: string; name: string; born: string }

const ageOn = (born: string, today: string) => {
  const [by, bm, bd] = born.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}
export const realRate = (s: Scenario) => (1 + s.ret / 100) / (1 + s.infl / 100) - 1

// The money to live on, split into parts that can be switched on or off.
export function pot(f: Finance, fx: Fx, exclude: string[]) {
  const w = netWorth(f, fx)
  const parts = w.byOwner.map((o) => ({ key: o.owner, label: ownerName(o.owner, true), value: o.total }))
  const others = w.properties.filter((x) => !x.p.details?.primary_home)
  const propValue = others.reduce((s, x) => s + x.equity, 0)
  if (propValue) parts.push({ key: 'property', label: `Other property, your share (${others.length})`, value: propValue })
  const home = w.properties.find((x) => x.p.details?.primary_home)?.equity ?? 0
  const included = parts.filter((p) => !exclude.includes(p.key))
  return { parts, home, total: included.reduce((s, p) => s + p.value, 0) }
}

// Largest steady yearly spending (start of each year) that leaves `leave` after `years` years.
export function maxSpendYear(P: number, years: number, r: number, income: number, leave: number): number {
  if (years <= 0) return 0
  const v = Math.pow(1 + r, -years)
  const usable = P - leave * v
  if (Math.abs(r) < 1e-9) return income + usable / years
  return income + (usable * r) / ((1 - v) * (1 + r))
}

// Year-by-year balance with a different real return each year (rates[i] for year i, the last rate repeating).
export function projectRates(P: number, spendYear: number, rates: number[], income: number, years: number): number[] {
  const out = [P]
  let b = P
  for (let i = 0; i < years; i++) {
    b = (b - spendYear + income) * (1 + rates[Math.min(i, rates.length - 1)])
    out.push(Math.max(0, b))
    if (b <= 0) { for (let j = i + 1; j < years; j++) out.push(0); break }
  }
  return out
}
// Largest steady yearly spending that still leaves `leave` after `years` years with the given yearly returns (found by halving).
export function maxSpendRates(P: number, years: number, rates: number[], income: number, leave: number): number {
  if (years <= 0) return 0
  const end = (spend: number) => { let b = P; for (let i = 0; i < years; i++) b = (b - spend + income) * (1 + rates[Math.min(i, rates.length - 1)]); return b }
  let lo = 0, hi = Math.max(1, P + income * years)
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (end(mid) >= leave) lo = mid; else hi = mid }
  return lo
}

// Year-by-year balance with a steady spending amount; stops when the money runs out.
export function project(P: number, spendYear: number, r: number, income: number, years: number): number[] {
  const out = [P]
  let b = P
  for (let i = 0; i < years; i++) {
    b = (b - spendYear + income) * (1 + r)
    out.push(Math.max(0, b))
    if (b <= 0) { for (let j = i + 1; j < years; j++) out.push(0); break }
  }
  return out
}


// ---------------------------------------------------------------- suggested scenarios
// Starting values for Cautious, Middle and Hopeful, worked out from the past returns and inflation table
// (an equal one-third blend of Canada, the United States and Hong Kong) and the mix of the money counted:
// stocks earn the blended stock return, cash and GICs the current 1-year GIC rate, and other property
// keeps pace with inflation (its rent is counted separately as other income).
type RefRow = { place: string; inflation?: boolean; y1: number; y3: number; y5: number; y10: number }
const WINDOWS = ['y1', 'y3', 'y5', 'y10'] as const
export interface Suggestion { scenarios: Scenario[]; stockBlend: Record<string, number>; inflBlend: Record<string, number>; shares: { stocks: number; safe: number; property: number }; safeRate: number }
export function mixOf(f: Finance, fx: Fx, exclude: string[]) {
  const latest = latestBalances(f)
  let stocks = 0, safe = 0
  for (const a of f.accounts.filter((x) => x.active && !exclude.includes(x.owner))) {
    const amt = accountAmount(f, a.id, latest, fx)
    if (amt === null) continue
    const v = toCad(amt, a.currency, fx)
    if (a.kind === 'investment') stocks += v; else safe += v
  }
  const w = netWorth(f, fx)
  const property = exclude.includes('property') ? 0 : w.properties.filter((x) => !x.p.details?.primary_home).reduce((t, x) => t + x.equity, 0)
  return { stocks, safe, property }
}
export function suggest(f: Finance, fx: Fx, exclude: string[]): Suggestion | null {
  const rows = ((f.settings as FinSettings & { market_reference?: { rows?: RefRow[] } }).market_reference?.rows ?? [])
  const stockRows = rows.filter((r) => !r.inflation), inflRows = rows.filter((r) => r.inflation)
  if (!stockRows.length || !inflRows.length) return null
  const avg = (rs: RefRow[], k: typeof WINDOWS[number]) => rs.reduce((t, r) => t + r[k], 0) / rs.length
  const stockBlend = Object.fromEntries(WINDOWS.map((k) => [k, avg(stockRows, k)])) as Record<string, number>
  const inflBlend = Object.fromEntries(WINDOWS.map((k) => [k, avg(inflRows, k)])) as Record<string, number>
  const m = mixOf(f, fx, exclude)
  const total = Math.max(1, m.stocks + m.safe + m.property)
  const shares = { stocks: Math.max(0, m.stocks) / total, safe: Math.max(0, m.safe) / total, property: Math.max(0, m.property) / total }
  const safeRate = (f.settings as FinSettings & { rate_benchmarks?: { CAD?: { gic1y?: number } } }).rate_benchmarks?.CAD?.gic1y ?? 3.5
  const ret = (stock: number, infl: number) => shares.stocks * stock + shares.safe * safeRate + shares.property * infl
  const r1 = (v: number) => Math.round(v * 10) / 10
  const stocksAll = WINDOWS.map((k) => stockBlend[k]), inflAll = WINDOWS.map((k) => inflBlend[k])
  const cautious = { stock: Math.min(...stocksAll), infl: Math.max(...inflAll) }
  const middle = { stock: stockBlend.y10, infl: inflBlend.y10 }
  const hopeful = { stock: (stockBlend.y5 + stockBlend.y10) / 2, infl: Math.min(...inflAll) }
  return {
    stockBlend, inflBlend, shares, safeRate,
    scenarios: [
      { key: 'cautious', label: 'Cautious', ret: r1(ret(cautious.stock, cautious.infl)), infl: r1(cautious.infl) },
      { key: 'middle', label: 'Middle (most likely)', ret: r1(ret(middle.stock, middle.infl)), infl: r1(middle.infl) },
      { key: 'hopeful', label: 'Hopeful', ret: r1(ret(hopeful.stock, hopeful.infl)), infl: r1(hopeful.infl) },
    ],
  }
}

export function plan(f: Finance, fx: Fx, people: Person[], today: string) {
  const s = ((f.settings as FinSettings & { retirement?: PlanSettings }).retirement ?? {})
  const suggestion = suggest(f, fx, s.exclude ?? [])
  const scenarios = s.scenarios?.length ? s.scenarios : suggestion?.scenarios ?? DEFAULT_SCENARIOS
  const est = f.settings.spending_estimate
  const monthly = s.monthly ?? (est ? toCad(est.monthly, est.currency, fx) : 5000)
  const income = s.income ?? 0
  const leave = s.leave ?? 0
  const exclude = s.exclude ?? []
  const p = pot(f, fx, exclude)
  const ages = people.map((x) => ({ ...x, age: ageOn(x.born, today) }))
  // Plan until the younger person reaches the age.
  const youngest = ages.length ? ages.reduce((a, b) => (a.age <= b.age ? a : b)) : null
  const startAge = youngest?.age ?? 50
  const table = scenarios.map((sc) => ({
    sc,
    r: realRate(sc),
    byAge: HORIZONS.map((h) => ({ h, monthly: maxSpendYear(p.total, h - startAge, realRate(sc), income * 12, leave) / 12 })),
  }))
  const years = MAX_AGE - startAge
  const atAges = (path: number[]) => HORIZONS.map((h) => ({ h, left: path[Math.max(0, h - startAge)] ?? 0 }))
  const paths = scenarios.map((sc) => {
    const r = realRate(sc)
    const path = project(p.total, monthly * 12, r, income * 12, years)
    const runOut = path.findIndex((v, i) => i > 0 && v <= 0)
    return { sc, path, lastsTo: runOut === -1 ? null : startAge + runOut, at: atAges(path) }
  })
  // Stress test: stocks fall in the first year, cash and GICs still earn the GIC rate, property holds its value;
  // after that the Middle scenario. Everything after inflation.
  const mid = scenarios.find((x) => x.key === 'middle') ?? scenarios[0]
  const drop = s.stress_drop ?? 30
  const m = mixOf(f, fx, exclude)
  const mTotal = Math.max(1, m.stocks + m.safe + m.property)
  const safeRate = (f.settings as FinSettings & { rate_benchmarks?: { CAD?: { gic1y?: number } } }).rate_benchmarks?.CAD?.gic1y ?? 3.5
  const firstNominal = (Math.max(0, m.stocks) * -drop + Math.max(0, m.safe) * safeRate + Math.max(0, m.property) * (mid?.infl ?? 2.5)) / mTotal
  const firstReal = (1 + firstNominal / 100) / (1 + (mid?.infl ?? 2.5) / 100) - 1
  const stressRates = [firstReal, mid ? realRate(mid) : 0.02]
  const stressPath = projectRates(p.total, monthly * 12, stressRates, income * 12, years)
  const sRun = stressPath.findIndex((v, i) => i > 0 && v <= 0)
  const stress = {
    drop, firstNominal, stockShare: Math.max(0, m.stocks) / mTotal, path: stressPath,
    lastsTo: sRun === -1 ? null : startAge + sRun, at: atAges(stressPath),
    byAge: HORIZONS.map((h) => ({ h, monthly: maxSpendRates(p.total, h - startAge, stressRates, income * 12, leave) / 12 })),
  }
  return { s, scenarios, suggestion, monthly, income, leave, exclude, pot: p, ages, youngest, startAge, table, paths, stress }
}

export async function savePlan(userId: string, f: Finance, patch: PlanSettings): Promise<void> {
  const cur = (f.settings as FinSettings & { retirement?: PlanSettings }).retirement ?? {}
  await saveFinSettings(userId, f.settings, { retirement: { ...cur, ...patch } } as Partial<FinSettings>)
}

// Past spending a month, for choosing the plan's spending. Averages count only months that have spending
// records, so gaps in the records do not pull the average down. One-time items and own transfers are not spending.
export interface PastWindow { years: number; from: string; to: string; recorded: number; months: number; avg: number; avgNoTax: number; incomeOther: number }
// Mortgage and home rent payments. Left out by default: in retirement the home is owned outright,
// and past mortgages (Hong Kong, the Shuswap project loan) would make past spending look higher than living costs.
export const HOUSING_PAYMENT = /^Mortgage|Rent paid|Home rent|Housing rent/i
export function pastSpending(f: Finance, fx: Fx, today: string, withHousing = false): { windows: PastWindow[]; byYear: { year: string; avg: number; recorded: number }[] } {
  const last = addMonth(today.slice(0, 7), -1)
  const months = monthsBack(last, 120)
  const exp = monthly(f, fx, 'expense', months)
  const inc = monthly(f, fx, 'income', months)
  // Income that continues in retirement and is not already earned by the money counted in the plan:
  // rent, Airbnb, pensions and other. Investment income is left out (the plan's return covers it), and so is past work income.
  const otherIncome = (m: string) => [...(inc.get(m) ?? [])].reduce((t, [l, v]) => t + (['Investment income', 'Work (past)'].includes(incomeGroup(l)) ? 0 : v), 0)
  const total = (m: string, noTax = false) => [...(exp.get(m) ?? [])].reduce((t, [l, v]) => t + ((noTax && /Income Tax/i.test(l)) || (!withHousing && HOUSING_PAYMENT.test(l)) ? 0 : v), 0)
  // A month counts as recorded when it has spending other than the payments being left out.
  const has = (m: string) => [...(exp.get(m) ?? [])].some(([l]) => withHousing || !HOUSING_PAYMENT.test(l))
  const windows = [1, 3, 5, 10].map((years) => {
    const ms = months.slice(-years * 12)
    const rec = ms.filter(has)
    const sum = rec.reduce((t, m) => t + total(m), 0), sumNoTax = rec.reduce((t, m) => t + total(m, true), 0)
    const incSum = rec.reduce((t, m) => t + otherIncome(m), 0)
    return { years, from: ms[0], to: last, recorded: rec.length, months: ms.length, avg: rec.length ? sum / rec.length : 0, avgNoTax: rec.length ? sumNoTax / rec.length : 0, incomeOther: rec.length ? incSum / rec.length : 0 }
  })
  const by = new Map<string, { sum: number; recorded: number }>()
  for (const m of months) {
    if (!has(m)) continue
    const y = m.slice(0, 4), r = by.get(y) ?? { sum: 0, recorded: 0 }
    r.sum += total(m); r.recorded += 1; by.set(y, r)
  }
  const years = [...new Set(months.map((m) => m.slice(0, 4)))]
  const first = years.findIndex((y) => by.has(y))
  return { windows, byYear: first < 0 ? [] : years.slice(first).map((year) => { const r = by.get(year); return { year, avg: r ? r.sum / r.recorded : 0, recorded: r?.recorded ?? 0 } }) }
}

// The monthly spending used across the Finance tabs: the last 5 years' average (mortgage and rent left out),
// unless a figure has been typed in as an override on the Net worth tab.
export function spendingMonthly(f: Finance, fx: Fx, today: string): { value: number; override: boolean; note: string } {
  const est = f.settings.spending_estimate
  if (est?.override) return { value: toCad(est.monthly, est.currency, fx), override: true, note: est.source ?? 'Typed in' }
  const w5 = pastSpending(f, fx, today, false).windows.find((w) => w.years === 5)
  if (w5?.recorded) return { value: w5.avg, override: false, note: `Last 5 years average (${w5.recorded} months with records), mortgage and rent left out` }
  return { value: est ? toCad(est.monthly, est.currency, fx) : 0, override: false, note: est?.source ?? 'No spending records yet' }
}
