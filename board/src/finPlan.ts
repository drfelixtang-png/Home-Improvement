// Retirement plan: how much can be spent each month so the money lasts to a chosen age.
// Everything is in today's dollars: returns are turned into "real" returns after inflation,
// so a spending amount keeps its buying power every year. Settings live in the private database.
import { netWorth, ownerName, saveFinSettings, toCad } from './finance'
import type { Finance, FinSettings, Fx } from './finance'

export interface Scenario { key: string; label: string; ret: number; infl: number }
export interface PlanSettings {
  monthly?: number            // spending to test, today's dollars a month
  income?: number             // other income a month (today's dollars), for example rent not already in the pot
  leave?: number              // money to leave at the end, today's dollars
  exclude?: string[]          // owners (or 'property') left out of the money to live on
  scenarios?: Scenario[]
}
export const DEFAULT_SCENARIOS: Scenario[] = [
  { key: 'cautious', label: 'Cautious', ret: 4.0, infl: 3.0 },
  { key: 'middle', label: 'Middle', ret: 5.0, infl: 2.5 },
  { key: 'hopeful', label: 'Hopeful', ret: 6.0, infl: 2.0 },
]
export const HORIZONS = [90, 95, 100]

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

export function plan(f: Finance, fx: Fx, people: Person[], today: string) {
  const s = ((f.settings as FinSettings & { retirement?: PlanSettings }).retirement ?? {})
  const scenarios = s.scenarios?.length ? s.scenarios : DEFAULT_SCENARIOS
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
  const years = 100 - startAge
  const paths = scenarios.map((sc) => {
    const r = realRate(sc)
    const path = project(p.total, monthly * 12, r, income * 12, years)
    const runOut = path.findIndex((v, i) => i > 0 && v <= 0)
    return { sc, path, lastsTo: runOut === -1 ? null : startAge + runOut, at90: path[Math.max(0, 90 - startAge)] ?? 0, at100: path[years] ?? 0 }
  })
  return { s, scenarios, monthly, income, leave, exclude, pot: p, ages, youngest, startAge, table, paths }
}

export async function savePlan(userId: string, f: Finance, patch: PlanSettings): Promise<void> {
  const cur = (f.settings as FinSettings & { retirement?: PlanSettings }).retirement ?? {}
  await saveFinSettings(userId, f.settings, { retirement: { ...cur, ...patch } } as Partial<FinSettings>)
}
