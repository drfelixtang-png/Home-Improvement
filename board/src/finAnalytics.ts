// Finance analytics: the sums behind the breakdowns on each Finance tab. All amounts are in CAD.
import {
  addMonth, holdingPrice, holdingsOf, latestBalances, monthly, monthsBack, netWorth, sumMap, toCad,
} from './finance'
import type { Cur, Finance, FinAccount, FinHolding, Fx } from './finance'

export interface Slice { label: string; value: number; note?: string }

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
const slices = (m: Map<string, number>, sort = true): Slice[] => {
  const out = [...m].map(([label, value]) => ({ label, value }))
  return sort ? out.sort((a, b) => b.value - a.value) : out
}
export const total = (xs: Slice[]) => xs.reduce((s, x) => s + x.value, 0)
export const isCrypto = (h: FinHolding) => h.asset_type === 'crypto' || h.asset_type === 'stablecoin'
export const shortAddress = (a: string) => a.split(',')[0]
export const OWNER_NAME: Record<string, string> = { felix: 'Felix', norina: 'Norina', felicia: 'Felicia (managed)', joint: 'Joint' }

// Every piece of the net worth, in CAD, with the facts the breakdowns need.
interface Piece {
  label: string; value: number; cls: string; owner: string; currency: Cur
  liquidity: string; risk: number | null; sector: string; type: string; institution: string; account?: FinAccount; holding?: FinHolding
}

export function pieces(f: Finance, fx: Fx): Piece[] {
  const out: Piece[] = []
  for (const p of f.properties.filter((x) => x.status === 'held')) {
    out.push({
      label: shortAddress(p.address), value: ((p.value ?? 0) - p.mortgage) * p.share, cls: `Property: ${shortAddress(p.address)}`,
      owner: 'property', currency: 'CAD', liquidity: 'Property, slow to sell', risk: null, sector: 'Real estate', type: 'property', institution: '',
    })
  }
  const latest = latestBalances(f)
  for (const a of f.accounts.filter((x) => x.active)) {
    const hs = holdingsOf(f, a.id)
    if (hs.length) {
      for (const h of hs) {
        out.push({
          label: h.name, value: toCad(h.shares * holdingPrice(f, h), h.currency, fx), cls: isCrypto(h) ? 'Crypto' : 'Stocks and funds',
          owner: a.owner, currency: h.currency, liquidity: 'Available within days', risk: h.risk, sector: h.sector || 'Not set',
          type: h.asset_type, institution: a.institution, account: a, holding: h,
        })
      }
      continue
    }
    const b = latest.get(a.id)
    if (!b) continue
    const v = toCad(b.amount, a.currency, fx)
    const cls = a.kind === 'cash' ? 'Cash' : a.kind === 'gic' ? 'GICs' : a.kind === 'investment' ? 'Stocks and funds' : a.kind === 'credit_card' || a.kind === 'loan' ? 'Owing on cards and loans' : 'Other'
    out.push({
      label: `${a.institution} ${a.name}`, value: v, cls, owner: a.owner, currency: a.currency,
      liquidity: a.kind === 'gic' ? 'Locked in terms (GICs)' : 'Available within days',
      risk: a.kind === 'cash' || a.kind === 'gic' || a.kind === 'credit_card' ? 1 : null,
      sector: a.kind === 'investment' ? 'Not set (no holdings list)' : 'Cash and deposits', type: a.kind, institution: a.institution, account: a,
    })
  }
  return out
}

const group = (ps: Piece[], key: (p: Piece) => string): Slice[] => {
  const m = new Map<string, number>()
  for (const p of ps) add(m, key(p), p.value)
  return slices(m).filter((x) => Math.abs(x.value) > 0.5)
}

export const RISK_LABEL: Record<number, string> = { 1: '1 Very low', 2: '2 Low', 3: '3 Medium', 4: '4 High', 5: '5 Very high' }
export const riskLabel = (r: number | null) => (r ? RISK_LABEL[r] : 'Not rated')

// ------------------------------------------------------------------ overview
export function overview(f: Finance, fx: Fx) {
  const ps = pieces(f, fx)
  const w = netWorth(f, fx)
  const money = ps.filter((p) => p.owner !== 'property')
  const rated = money.filter((p) => p.risk !== null && p.value > 0)
  const riskAvg = rated.reduce((s, p) => s + p.value * (p.risk ?? 0), 0) / (total(rated.map((p) => ({ label: '', value: p.value }))) || 1)
  const home = w.properties.find((x) => x.p.key === 'railway')?.equity ?? 0
  return {
    total: w.total,
    byClass: group(ps, (p) => p.cls),
    byOwner: group(ps, (p) => (p.owner === 'property' ? 'Shared property' : OWNER_NAME[p.owner] ?? p.owner)),
    byCurrency: group(ps, (p) => p.currency),
    byLiquidity: group(ps, (p) => p.liquidity),
    riskOfMoney: group(money, (p) => riskLabel(p.risk)),
    riskAvg,
    home,
    freedom: w.total - home,
    sinceAug2024: (() => {
      const h = f.history.find((x) => x.measure === 'net_equity' && x.as_of === '2024-08-31')
      return h ? toCad(h.amount, h.currency, fx) : null
    })(),
  }
}

// ------------------------------------------------------------------ investments
export function investments(f: Finance, fx: Fx) {
  const inv = pieces(f, fx).filter((p) => p.cls === 'Stocks and funds' || p.cls === 'Crypto')
  const listed = inv.filter((p) => p.holding)
  const sum = total(inv)
  const weights = listed.map((p) => p.value / (total(listed) || 1))
  const sorted = [...listed].sort((a, b) => b.value - a.value)
  const rated = inv.filter((p) => p.risk !== null)
  const movers = listed.map((p) => {
    const q = f.prices[p.holding!.symbol]
    return { p, move: q?.change ? toCad(q.change * p.holding!.shares, p.holding!.currency, fx) : 0, pct: q?.changePct ?? null }
  }).filter((x) => x.pct !== null).sort((a, b) => b.move - a.move)
  // Dividends over the last 12 months of statement data.
  const divs = f.transactions.filter((t) => /^DIVIDEND|^TAX REFUND/.test(t.description))
  const lastDiv = divs.map((t) => t.posted_on).sort().pop()
  const from = lastDiv ? `${addMonth(lastDiv.slice(0, 7), -11)}-01` : ''
  const div12 = divs.filter((t) => t.posted_on >= from).reduce((s, t) => s + toCad(t.amount, t.currency, fx), 0)
  const divAccounts = new Set(divs.map((t) => t.account))
  const divBase = listed.filter((p) => p.account && [...divAccounts].some((d) => p.account!.institution.startsWith(d.split(' ')[0]))).reduce((s, p) => s + p.value, 0)
  return {
    sum,
    bySector: group(inv, (p) => p.sector),
    byRisk: group(inv, (p) => riskLabel(p.risk)),
    byType: group(inv, (p) => ({ stock: 'Single stocks', reit: 'REITs', fund: 'Funds', crypto: 'Crypto', stablecoin: 'Stablecoins', bond: 'Bonds', investment: 'Accounts without a holdings list' } as Record<string, string>)[p.type] ?? 'Other'),
    byOwner: group(inv, (p) => OWNER_NAME[p.owner] ?? p.owner),
    byCurrency: group(inv, (p) => p.currency),
    top1: sorted[0] ? { name: sorted[0].label, pct: sorted[0].value / (sum || 1) } : null,
    top5: total(sorted.slice(0, 5)) / (sum || 1),
    effectiveN: weights.length ? 1 / weights.reduce((s, x) => s + x * x, 0) : 0,
    listedCount: listed.length,
    riskAvg: rated.reduce((s, p) => s + p.value * (p.risk ?? 0), 0) / (total(rated) || 1),
    ratedShare: total(rated) / (sum || 1),
    gainers: movers.slice(0, 3).filter((x) => x.move > 0),
    losers: movers.slice(-3).reverse().filter((x) => x.move < 0),
    div12, divBase, divFrom: from, divTo: lastDiv ?? '',
  }
}

// ------------------------------------------------------------------ accounts
const bankGroup = (inst: string) => (inst.startsWith('Bank of China') ? 'Bank of China' : inst.startsWith('Bright Smart') ? 'Bright Smart' : inst.split(' ')[0])
const CA_BANKS = ['RBC', 'TD', 'BMO', 'CIBC', 'Scotiabank', 'HSBC Canada', 'EQ']
const HK_BANKS = ['Bank of China', 'HSBC']

export function accounts(f: Finance, fx: Fx) {
  const ps = pieces(f, fx).filter((p) => p.account)
  // Deposit insurance: CDIC covers CA$100,000 per person, per member bank, per category (approximate here);
  // Hong Kong's Deposit Protection Scheme covers HK$800,000 per person, per bank.
  const deposits = new Map<string, { owner: string; bank: string; cad: number; native: number; cur: Cur }>()
  for (const p of ps.filter((x) => x.cls === 'Cash' || x.cls === 'GICs')) {
    const bank = bankGroup(p.institution)
    const hk = HK_BANKS.includes(bank) && p.account!.currency === 'HKD'
    if (!hk && !CA_BANKS.includes(bank)) continue
    const k = `${p.owner}|${bank}|${hk ? 'HK' : 'CA'}`
    const cur = hk ? 'HKD' : 'CAD'
    const d = deposits.get(k) ?? { owner: p.owner, bank, cad: 0, native: 0, cur }
    d.cad += p.value; d.native += hk ? p.value * fx.cadHkd : p.value
    deposits.set(k, d)
  }
  const insurance = [...deposits.values()].map((d) => {
    const limit = d.cur === 'HKD' ? 800000 : 100000
    return { ...d, limit, over: Math.max(0, d.native - limit) }
  }).sort((a, b) => b.over - a.over || b.cad - a.cad)
  // Change since the previous snapshot date.
  const dates = [...new Set(f.balances.map((b) => b.as_of))].sort()
  const prevDate = dates.length > 1 ? dates[dates.length - 2] : null
  const prevTotal = prevDate ? f.balances.filter((b) => b.as_of === prevDate).reduce((s, b) => {
    const a = f.accounts.find((x) => x.id === b.account_id)
    return s + (a ? toCad(b.amount, a.currency, fx) : 0)
  }, 0) : null
  return {
    byInstitution: group(ps, (p) => bankGroup(p.institution)),
    byKind: group(ps, (p) => p.cls),
    insurance,
    prevDate, prevTotal,
  }
}

// ------------------------------------------------------------------ income and spending
const CATEGORY: [RegExp, string][] = [
  [/Mortgage|Property Tax|Gov't Rent|Home Maintenance/i, 'Housing'],
  [/Electricity|Gas Bill|Water|Communication|Phone/i, 'Utilities and phone'],
  [/Food/i, 'Food'],
  [/Car|Transport/i, 'Transport'],
  [/Insurance|Health|Medical/i, 'Insurance and health'],
  [/Income Tax/i, 'Taxes'],
  [/Travel/i, 'Travel'],
  [/Education/i, 'Education'],
  [/Allowance/i, 'Family support'],
  [/^Cash/i, 'Cash withdrawals'],
  [/Credit Card/i, 'Card spending, not itemised'],
  [/Rental licences|Norina temp work/i, 'Work and rental costs'],
]
export const categoryOf = (line: string) => CATEGORY.find(([re]) => re.test(line))?.[1] ?? 'Other'
const FIXED = new Set(['Housing', 'Utilities and phone', 'Insurance and health', 'Taxes', 'Education'])
export const incomeType = (line: string) =>
  /Investment income|distribution|Airbnb|Rental|^I\(/i.test(line) ? 'Passive (investments and rentals)' : /work|^E\(|^S\(|commission/i.test(line) ? 'Work' : 'Other'

export function periods(f: Finance): { key: string; label: string }[] {
  const years = [...new Set(f.ie.map((r) => r.month.slice(0, 4)))].sort().reverse()
  return [{ key: 'last12', label: 'Last 12 months' }, ...years.map((y) => ({ key: y, label: y }))]
}

export function cashflow(f: Finance, fx: Fx, period: string, today: string) {
  const months = period === 'last12' ? monthsBack(addMonth(today.slice(0, 7), -1), 12) : Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`)
  const inc = monthly(f, fx, 'income', months)
  const exp = monthly(f, fx, 'expense', months)
  const byLineExp = new Map<string, number>(); const byLineInc = new Map<string, number>()
  for (const mo of months) {
    for (const [l, v] of exp.get(mo) ?? []) add(byLineExp, l, v)
    for (const [l, v] of inc.get(mo) ?? []) add(byLineInc, l, v)
  }
  const cats = new Map<string, number>(); const fixed = new Map<string, number>(); const itype = new Map<string, number>()
  for (const [l, v] of byLineExp) { const c = categoryOf(l); add(cats, c, v); add(fixed, FIXED.has(c) ? 'Fixed (bills, housing, tax)' : 'Flexible (food, shopping, travel, cash)', v) }
  for (const [l, v] of byLineInc) add(itype, incomeType(l), v)
  const income = sumMap(byLineInc), spending = sumMap(byLineExp)
  const recorded = months.filter((m) => exp.has(m))
  const passive = itype.get('Passive (investments and rentals)') ?? 0
  // Largest payees from the bank statements in the period.
  const payees = new Map<string, number>()
  for (const t of f.transactions) if (t.kind === 'expense' && months.includes(t.posted_on.slice(0, 7))) add(payees, t.description, -toCad(t.amount, t.currency, fx))
  return {
    months, income, spending,
    series: months.map((m) => ({ m, inc: sumMap(inc.get(m)), exp: sumMap(exp.get(m)) })),
    byCategory: slices(cats), fixedFlex: slices(fixed), incomeTypes: slices(itype),
    savingsRate: income > 0 ? (income - spending) / income : null,
    avgSpend: recorded.length ? spending / recorded.length : 0,
    recordedMonths: recorded.length,
    passiveCover: spending > 0 ? passive / spending : null,
    payees: slices(payees).slice(0, 10),
  }
}

// ------------------------------------------------------------------ property
const PROPERTY_INCOME: Record<string, string> = { e41st: 'E 41st Ave distribution', nassau: 'Nassau Airbnb' }
export function property(f: Finance, fx: Fx, today: string) {
  const w = netWorth(f, fx)
  const months = monthsBack(addMonth(today.slice(0, 7), -1), 12)
  const inc = monthly(f, fx, 'income', months)
  const income12 = (line?: string) => (line ? months.reduce((s, m) => s + (inc.get(m)?.get(line) ?? 0), 0) : 0)
  return f.properties.map((p) => {
    const equity = p.status === 'held' ? ((p.value ?? 0) - p.mortgage) * p.share : 0
    const yearIncome = income12(PROPERTY_INCOME[p.key])
    return {
      p, equity, pctOfWorth: w.total ? equity / w.total : 0,
      change: p.prev_value && p.value ? (p.value - p.prev_value) / p.prev_value : null,
      yearIncome, yieldPct: equity > 0 && yearIncome ? yearIncome / equity : null,
      realised: p.status === 'sold' && p.sale_price && p.cost ? (p.sale_price - p.cost) * p.share : null,
    }
  })
}

// ------------------------------------------------------------------ history
export function history(f: Finance, fx: Fx, todayTotal: number, today: string) {
  const pts = f.history.filter((h) => h.measure === 'net_equity').map((h) => ({ d: h.as_of, v: toCad(h.amount, h.currency, fx) }))
  const first = pts[0]
  const years = first ? (new Date(today).getTime() - new Date(first.d).getTime()) / (365.25 * 86400000) : 0
  const cagr = first && first.v > 0 && years > 0 ? Math.pow(todayTotal / first.v, 1 / years) - 1 : null
  const by = new Map<string, Record<string, number>>()
  for (const h of f.history.filter((x) => x.measure.startsWith('yearly_'))) {
    const y = h.as_of.slice(0, 4)
    by.set(y, { ...(by.get(y) ?? {}), [h.measure.slice(7)]: toCad(h.amount, h.currency, fx) })
  }
  const rows = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([y, r], i, all) => {
    const prev = i ? all[i - 1][1].net_equity : undefined
    return {
      year: y,
      growth: prev ? (r.net_equity - prev) / prev : null,
      savingsRate: r.income ? r.net / r.income : null,
      passiveCover: r.expenses ? (r.passive_income ?? 0) / r.expenses : null,
    }
  })
  const withGrowth = rows.filter((r) => r.growth !== null)
  return {
    cagr, since: first?.d ?? null, rows: rows.reverse(),
    best: withGrowth.length ? withGrowth.reduce((a, b) => (b.growth! > a.growth! ? b : a)) : null,
    worst: withGrowth.length ? withGrowth.reduce((a, b) => (b.growth! < a.growth! ? b : a)) : null,
  }
}
