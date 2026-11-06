// Finance overview: the issues, decisions and things to watch, worked out from the data on each tab.
// Each rule returns at most one issue; a stable key lets the owner mark it done or hide it for a while.
import { mix, netWorth, ownerManager, ownerName, toCad } from './finance'
import type { Finance, Fx } from './finance'
import * as A from './finAnalytics'

export type Level = 'act' | 'decide' | 'watch'
export interface Issue {
  key: string
  level: Level
  area: string
  title: string
  // Text with amounts; `m` formats money, or hides it when amounts are hidden.
  detail: (m: (v: number) => string) => string
  action: string
  tab: string
}
export interface Good { title: string; detail: (m: (v: number) => string) => string }

const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`
const monthName = (iso: string) => new Date(`${iso.slice(0, 7)}-15`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })

export function findIssues(f: Finance, fx: Fx, today: string): { issues: Issue[]; good: Good[] } {
  const issues: Issue[] = []
  const good: Good[] = []
  const w = netWorth(f, fx)
  const est = f.settings.spending_estimate
  const spend = est ? toCad(est.monthly, est.currency, fx) : 0
  const m = mix(w, f.settings, spend)
  const inv = A.investments(f, fx)
  const acc = A.accounts(f, fx)
  const cf = A.cashflow(f, fx, 'last12', today)

  // ---------------------------------------------------------------- dated reminders saved in the settings
  type Reminder = { key: string; level: Level; due?: string; tab: string; area: string; title: string; detail: string; action: string }
  for (const r of ((f.settings as { reminders?: Reminder[] }).reminders ?? [])) {
    const left = r.due ? days(today, r.due) : null
    if (left !== null && left < -30) continue
    issues.push({
      key: `fin:${r.key}`, level: left !== null && left <= 14 ? 'act' : r.level, area: r.area, tab: r.tab,
      title: r.due ? `${r.title} (by ${new Date(`${r.due}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}${left !== null ? left < 0 ? ', overdue' : `, ${left} days` : ''})` : r.title,
      detail: () => r.detail, action: r.action,
    })
  }

  // ---------------------------------------------------------------- backup
  const lastBackup = (f.settings as { last_backup?: string }).last_backup
  if (!lastBackup || days(lastBackup, today) > 31) {
    issues.push({
      key: `fin:backup:${today.slice(0, 7)}`, level: 'act', area: 'Records', tab: 'overview',
      title: lastBackup ? `Last backup was ${days(lastBackup, today)} days ago` : 'No backup downloaded yet',
      detail: () => 'The database plan keeps no backups, so a downloaded file is the only copy of your data outside the database.',
      action: 'Press "Download backup" at the bottom of the Overview and keep the file somewhere private.',
    })
  }

  // ---------------------------------------------------------------- accounts
  for (const d of acc.insurance.filter((x) => x.over > 0)) {
    const sym = d.cur === 'HKD' ? 'HK$' : 'CA$'
    issues.push({
      key: `fin:insurance:${d.owner}:${d.bank}`, level: 'decide', area: 'Accounts', tab: 'accounts',
      title: `${ownerName(d.owner, true)}: deposits at ${d.bank} are above the insurance limit`,
      detail: (mm) => `About ${d.cur === 'HKD' ? `${sym}${Math.round(d.over).toLocaleString('en-CA')} (${mm(d.over / fx.cadHkd)})` : mm(d.over)} is above the ${d.cur === 'HKD' ? 'HK$800,000 Deposit Protection Scheme' : 'CA$100,000 CDIC'} limit.`,
      action: d.cur === 'HKD'
        ? 'Move the amount above HK$800,000 to another bank, or accept the risk.'
        : 'Spread GICs across other banks when they renew, or confirm part of it is under another CDIC category (joint, TFSA, RRSP).',
    })
  }
  const lastSnap = [...new Set(f.balances.map((b) => b.as_of))].sort().pop()
  if (lastSnap && days(lastSnap, today) > 90) {
    issues.push({
      key: `fin:balances:${lastSnap}`, level: 'act', area: 'Accounts', tab: 'accounts',
      title: 'Bank balances are out of date', detail: () => `The last balance snapshot is from ${lastSnap}, ${days(lastSnap, today)} days ago.`,
      action: 'Press "New snapshot" and type the balances from your banking apps.',
    })
  }

  // ---------------------------------------------------------------- money mix
  if (spend > 0 && m.cash < m.cashTarget) {
    issues.push({
      key: 'fin:cash-low', level: 'act', area: 'Net worth', tab: 'networth',
      title: 'Cash is below 6 months of spending', detail: (mm) => `Cash is ${mm(m.cash)}; the rule asks for ${mm(m.cashTarget)}.`,
      action: 'Move money from GICs or investments into a savings account.',
    })
  } else if (spend > 0 && m.safe > m.safeTarget * 1.5) {
    issues.push({
      key: 'fin:excess-safe', level: 'decide', area: 'Net worth', tab: 'networth',
      title: `Cash and GICs cover about ${Math.round(m.safe / spend)} months of spending; the rule is ${f.settings.target?.safe_months ?? 24}`,
      detail: (mm) => `About ${mm(m.safe - m.safeTarget)} is above the rule. Money in cash and GICs is safe but may not keep up with inflation over many years.`,
      action: 'Decide how much to keep safe, and whether to invest part of the rest or change the rule.',
    })
  }

  // ---------------------------------------------------------------- income and spending
  if (est && /August 2024|Aug 2024/.test(est.source ?? '')) {
    issues.push({
      key: 'fin:spend-estimate', level: 'act', area: 'Income and spending', tab: 'cashflow',
      title: 'The monthly spending estimate is still the August 2024 budget',
      detail: (mm) => `The estimate is ${mm(spend)} a month.${cf.recordedMonths ? ` The imported statements alone show about ${mm(cf.avgSpend)} a month over ${cf.recordedMonths} recorded months; accounts not imported yet would add to it.` : ''}`,
      action: 'Once all household accounts are imported, set the monthly spending on the Net worth tab to the recorded average.',
    })
  }
  const review = f.transactions.filter((t) => !t.reviewed).length
  if (review) {
    issues.push({
      key: `fin:review:${review}`, level: 'act', area: 'Income and spending', tab: 'cashflow',
      title: `${review} bank transactions are waiting for a category`, detail: () => 'They count with a best guess until you confirm them.',
      action: 'Open "Bank statements", then "To review", and confirm each one.',
    })
  }
  const lastTx = f.transactions.map((t) => t.posted_on).sort().pop()
  if (lastTx && days(lastTx, today) > 45) {
    issues.push({
      key: `fin:statements:${lastTx.slice(0, 7)}`, level: 'act', area: 'Income and spending', tab: 'cashflow',
      title: `Bank statements stop at ${lastTx}`,
      detail: () => `Spending and income after ${monthName(lastTx)} use the estimate, not real figures.`,
      action: 'Export the RBC, TD and TD Visa activity since then into the "Temp Bank Statement Input" folder in Google Drive.',
    })
  }
  // Household bank and card accounts (not money managed for others) at banks with no imported statements.
  const imported = new Set(f.transactions.map((t) => t.account.split(' ')[0].toUpperCase()))
  const missingBanks = [...new Set(f.accounts
    .filter((a) => a.active && (a.kind === 'cash' || a.kind === 'credit_card') && a.currency === 'CAD' && !ownerManager(a.owner))
    .map((a) => a.institution.split(' ')[0])
    .filter((b) => !imported.has(b.toUpperCase())))]
  if (f.transactions.length && missingBanks.length) {
    issues.push({
      key: `fin:statements:missing:${missingBanks.join(',')}`, level: 'act', area: 'Income and spending', tab: 'cashflow',
      title: `Accounts at ${missingBanks.join(', ')} are not in the bank statements`,
      detail: () => 'Household spending is only partly recorded, so savings rate and spending figures are too low. Other people\'s accounts at banks already imported may be missing too.',
      action: 'Export the activity of every household account into the Google Drive folder.',
    })
  }
  if (cf.income > 0 && spend > 0) {
    const avgIncome = cf.income / 12
    if (avgIncome < spend) {
      const years = (m.safe / (spend - avgIncome)) / 12
      issues.push({
        key: 'fin:income-gap', level: 'watch', area: 'Income and spending', tab: 'cashflow',
        title: 'Spending is higher than income',
        detail: (mm) => `Income averaged ${mm(avgIncome)} a month over the last 12 months against estimated spending of ${mm(spend)}. Cash and GICs would cover the gap for about ${Math.round(years)} years.`,
        action: 'No action needed now; keep an eye on it as income from the rentals changes.',
      })
    }
  }
  // A property income line whose recent payouts include a zero.
  for (const p of f.properties) {
    const line = typeof p.details?.income_line === 'string' ? p.details.income_line : null
    if (!line) continue
    const rows = f.ie.filter((r) => r.line === line).sort((a, b) => a.month.localeCompare(b.month))
    const zero = rows.slice(-3).find((r) => r.amount === 0)
    if (!zero) continue
    issues.push({
      key: `fin:payout-zero:${p.key}:${zero.month}`, level: 'watch', area: 'Property', tab: 'property',
      title: `No payout from ${A.shortAddress(p.address)} in ${monthName(zero.month)}`, detail: () => 'A regular payout was skipped, so property income is lower this year.',
      action: 'Ask the co-owners why it was skipped and when payouts return to normal.',
    })
  }

  // ---------------------------------------------------------------- investments
  const other = f.accounts.filter((a) => a.active && a.kind === 'investment' && !f.holdings.some((h) => h.account_id === a.id))
  if (other.length) {
    issues.push({
      key: `fin:no-holdings:${other.length}`, level: 'act', area: 'Investments', tab: 'investments',
      title: `${other.length} investment accounts have no holdings list`,
      detail: () => `${pct(1 - inv.ratedShare)} of investments cannot be checked for sector, risk or concentration: ${other.map((a) => `${ownerName(a.owner)}'s ${a.institution} ${a.name}`).join(', ')}.`,
      action: 'Send screenshots of their holdings, or add each stock under Investments, "By account, to edit".',
    })
  }
  if (inv.top1 && inv.top1.pct > 0.2) {
    issues.push({
      key: `fin:concentration:${inv.top1.name}`, level: 'decide', area: 'Investments', tab: 'investments',
      title: `${inv.top1.name} is ${pct(inv.top1.pct)} of all investments`, detail: () => `The top 5 holdings are ${pct(inv.top5)} of investments.`,
      action: 'Decide whether to reduce it so one company cannot hurt the whole portfolio.',
    })
  }
  const high = inv.byRisk.filter((x) => /^[45]/.test(x.label)).reduce((s, x) => s + x.value, 0) / (inv.sum || 1)
  if (high > 0.3) {
    issues.push({
      key: 'fin:high-risk', level: 'decide', area: 'Investments', tab: 'investments',
      title: `${pct(high)} of investments are rated high or very high risk`, detail: () => 'Mostly single Hong Kong and China stocks, crypto and newly listed shares.',
      action: 'Decide whether this level of risk suits retirement, for your own money and for money you manage for others.',
    })
  }
  // Holdings that have lost most of their value since the first snapshot.
  const dates = [...new Set(f.snapshots.map((r) => r.as_of))].sort()
  if (dates.length > 1) {
    const first = dates[0], last = dates[dates.length - 1]
    const val = (d: string, sym: string) => f.snapshots.filter((r) => r.as_of === d && r.symbol === sym).reduce((s, r) => s + r.value_cad, 0)
    const losers = [...new Set(f.snapshots.filter((r) => r.as_of === last).map((r) => `${r.symbol}|${r.name}`))]
      .map((s) => { const [sym, name] = s.split('|'); const a = val(first, sym), b = val(last, sym); return { name, a, b, ch: a ? (b - a) / a : 0 } })
      .filter((x) => x.a > 0 && x.ch < -0.4)
    if (losers.length) {
      issues.push({
        key: `fin:losers:${losers.map((x) => x.name).join(',')}`, level: 'decide', area: 'Investments', tab: 'investments',
        title: `${losers.length === 1 ? `${losers[0].name} is` : `${losers.length} holdings are`} down more than 40% since ${monthName(first)}`,
        detail: (mm) => losers.map((x) => `${x.name} ${pct(x.ch)} (now ${mm(x.b)})`).join(', '),
        action: losers.length === 1 ? 'Decide whether to keep it or sell it and simplify the account.' : 'Decide for each one whether to keep it or sell it and simplify the account.',
      })
    }
    const prev = dates.length > 1 ? dates[dates.length - 2] : null
    const tot = (d: string) => f.snapshots.filter((r) => r.as_of === d).reduce((s, r) => s + r.value_cad, 0)
    if (prev && tot(last) < tot(prev) * 0.9) {
      issues.push({
        key: `fin:portfolio-drop:${last}`, level: 'watch', area: 'Investments', tab: 'investments',
        title: `The portfolio fell ${pct(1 - tot(last) / tot(prev))} between snapshots`, detail: (mm) => `${mm(tot(prev))} on ${prev} to ${mm(tot(last))} on ${last}.`,
        action: 'No action needed unless you plan to sell; check whether one holding caused most of it.',
      })
    }
  }
  const saved = f.snapshots.filter((r) => r.source === 'saved').map((r) => r.as_of).sort().pop()
  const [y, mo, d] = today.split('-').map(Number)
  const dueDate = mo === 6 || mo === 12 ? `${y}-${String(mo).padStart(2, '0')}-${mo === 6 ? '30' : '31'}` : null
  if (dueDate && d >= 20 && (!saved || saved < `${y}-${String(mo).padStart(2, '0')}-01`)) {
    issues.push({
      key: `fin:snapshot:${dueDate}`, level: 'act', area: 'Investments', tab: 'investments',
      title: 'Half-year portfolio snapshot is due', detail: () => `Save it on ${dueDate}, after the markets close.`,
      action: 'Press "Save today\'s snapshot" under Investments.',
    })
  }
  const aave = f.holdings.filter((h) => h.asset_type === 'stablecoin' && f.accounts.find((a) => a.id === h.account_id)?.institution === 'MetaMask')
  if (aave.length) {
    const v = aave.reduce((s, h) => s + toCad(h.shares * (f.prices[h.symbol]?.price ?? h.last_price ?? 1), h.currency, fx), 0)
    issues.push({
      key: 'fin:aave', level: 'watch', area: 'Investments', tab: 'investments',
      title: 'Tether lent on Aave carries platform and stablecoin risk', detail: (mm) => `About ${mm(v)} is supplied on Aave v3 (${[...new Set(aave.map((h) => ownerName(f.accounts.find((a) => a.id === h.account_id)?.owner ?? '')))].join(', ')}); it is not insured.`,
      action: 'Check the balances every few months and update them under "By account, to edit".',
    })
  }

  // ---------------------------------------------------------------- property
  const prop = A.property(f, fx, today)
  const propShare = prop.filter((r) => r.p.status === 'held').reduce((s, r) => s + r.pctOfWorth, 0)
  if (propShare > 0.6) {
    issues.push({
      key: 'fin:property-share', level: 'watch', area: 'Property', tab: 'property',
      title: `${pct(propShare)} of net worth is in property`, detail: () => 'Property is slow to sell, so most of your wealth cannot be used quickly.',
      action: 'No action needed; keep it in mind when deciding where new money goes.',
    })
  }
  for (const r of prop.filter((x) => x.p.status === 'held' && x.change !== null && x.change < -0.05)) {
    issues.push({
      key: `fin:assessment:${r.p.key}:${r.p.value_as_of}`, level: 'watch', area: 'Property', tab: 'property',
      title: `${A.shortAddress(r.p.address)} assessment fell ${pct(Math.abs(r.change!), 1)}`,
      detail: () => 'A lower assessment can lower property tax. BC Assessment appeals are due by 31 January after the notice arrives.',
      action: 'If the value looks wrong compared with similar homes nearby, ask BC Assessment for a review before 31 January.',
    })
  }
  if (!fx.live) {
    issues.push({
      key: `fin:fx:${today}`, level: 'watch', area: 'Records', tab: 'networth',
      title: 'Live exchange rates are not available', detail: () => 'US and Hong Kong amounts use estimated rates today.', action: 'Refresh the page later.',
    })
  }

  // ---------------------------------------------------------------- going well
  if (w.debt > -10000) good.push({ title: 'No mortgage and almost no debt', detail: (mm) => `Only ${mm(Math.abs(w.debt))} owing on credit cards.` })
  if (spend > 0 && m.cash >= m.cashTarget) good.push({ title: 'Emergency cash is covered', detail: (mm) => `Cash of ${mm(m.cash)} is more than 6 months of spending.` })
  if (spend > 0 && m.safe >= m.safeTarget) good.push({ title: 'Two years of spending is safe', detail: (mm) => `Cash and GICs of ${mm(m.safe)} cover the 24-month rule.` })
  if (!review && f.transactions.length) good.push({ title: 'All bank transactions are reviewed', detail: () => `${f.transactions.length} transactions sorted.` })
  if (acc.insurance.length && !acc.insurance.some((x) => x.over > 0)) good.push({ title: 'All deposits are inside insurance limits', detail: () => '' })
  const order: Record<Level, number> = { act: 0, decide: 1, watch: 2 }
  return { issues: issues.sort((a, b) => order[a.level] - order[b.level]), good }
}
