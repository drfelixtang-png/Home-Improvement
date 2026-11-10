// Analytics sections shown on each Finance tab. The sums live in finAnalytics.ts.
import { useMemo, useState } from 'react'
import { vanDate } from './me'
import { holdingPrice, netWorth, ownerName, savePortfolioSnapshot, toCad } from './finance'
import type { Finance, Fx } from './finance'
import * as A from './finAnalytics'
import { shortAddress } from './finAnalytics'
import type { Slice } from './finAnalytics'

function money(v: number): string {
  return `${v < 0 ? '−' : ''}CA$${Math.abs(v).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
}
const pct = (x: number | null | undefined, digits = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : `${(x * 100).toFixed(digits)}%`)

// A pie (drawn as a ring) with the largest share in the middle.
function Pie({ rows, sum, title, tone }: { rows: Slice[]; sum: number; title: string; tone: (r: Slice, i: number) => number }) {
  let at = 0
  const top = rows.reduce((a, b) => (b.value > a.value ? b : a), rows[0])
  return (
    <svg className="fin-pie" viewBox="0 0 42 42" role="img" aria-label={`${title}: ${rows.map((r) => `${r.label} ${pct(r.value / sum)}`).join(', ')}`}>
      <circle cx="21" cy="21" r="15.9155" className="pie-bg" />
      {rows.map((r, i) => {
        const share = (r.value / sum) * 100
        const el = (
          <circle key={r.label} cx="21" cy="21" r="15.9155" className={`pie-seg s${tone(r, i)}`}
            strokeDasharray={`${Math.max(0, share - 0.4)} ${100 - Math.max(0, share - 0.4)}`} strokeDashoffset={25 - at}>
            <title>{`${r.label} ${pct(r.value / sum, 1)}`}</title>
          </circle>
        )
        at += share
        return el
      })}
      {top && <text x="21" y="22.5" textAnchor="middle" className="pie-pct">{pct(top.value / sum)}</text>}
      {top && <text x="21" y="27" textAnchor="middle" className="pie-lbl">{top.label.length > 14 ? `${top.label.slice(0, 13)}…` : top.label}</text>}
    </svg>
  )
}

// A pie and a table of label, amount and share.
// Risk levels use their own colours: green for very low through red for very high, grey when not rated.
const RISK_TONE: Record<string, number> = { '1': 12, '2': 13, '3': 14, '4': 15, '5': 16 }
export function Breakdown({ title, items, show, note, max = 12, risk = false }: { title: string; items: Slice[]; show: boolean; note?: string; max?: number; risk?: boolean }) {
  const tone = (r: Slice, i: number) => (risk ? RISK_TONE[r.label[0]] ?? 8 : i % 10)
  const pos = items.filter((x) => x.value > 0)
  const sum = pos.reduce((s, x) => s + x.value, 0)
  const neg = items.filter((x) => x.value < 0)
  const shown = pos.slice(0, max)
  const rest = pos.slice(max).reduce((s, x) => s + x.value, 0)
  const rows = rest > 0 ? [...shown, { label: 'Everything else', value: rest }] : shown
  return (
    <div className="fin-bd">
      <h4>{title}</h4>
      <div className="fin-bd-body">
        <Pie rows={rows} sum={sum} title={title} tone={tone} />
      <table className="tbl fin-bd-tbl">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label}>
              <td><span className={`dot-c c${tone(r, i)}`} aria-hidden="true" />{r.label}</td>
              <td className="n">{show ? money(r.value) : '••••'}</td>
              <td className="n">{pct(r.value / sum, 1)}</td>
            </tr>
          ))}
          {neg.map((r) => <tr key={r.label} className="muted"><td>{r.label}</td><td className="n">{show ? money(r.value) : '••••'}</td><td className="n" /></tr>)}
        </tbody>
      </table>
      </div>
      {note && <p className="sub">{note}</p>}
    </div>
  )
}

function Ratio({ value, label, tone }: { value: string; label: string; tone?: 'good' | 'warn' | 'crit' }) {
  return <div className="stat"><b className={tone === 'warn' ? 'warn' : tone === 'crit' ? 'crit' : tone === 'good' ? 'up' : ''}>{value}</b><span>{label}</span></div>
}

// ================================================================= overview
export function OverviewAnalytics({ f, fx, show }: { f: Finance; fx: Fx; show: boolean }) {
  const o = useMemo(() => A.overview(f, fx), [f, fx])
  const change = o.sinceAug2024 ? (o.total - o.sinceAug2024) / o.sinceAug2024 : null
  const propertyShare = o.byClass.filter((x) => x.label.startsWith('Property')).reduce((s, x) => s + x.value, 0) / (o.total || 1)
  return (
    <section className="sub-panel span-2">
      <h3>How it is spread 資產分佈</h3>
      <div className="stats wide fin-stats">
        <Ratio value={pct(propertyShare)} label="In property" tone={propertyShare > 0.7 ? 'warn' : undefined} />
        <Ratio value={show ? money(o.freedom) : '••••'} label="Net worth without your home 可動用資產" />
        <Ratio value={o.riskAvg ? o.riskAvg.toFixed(1) : '-'} label="Average risk of money outside property (1 to 5)" />
        <Ratio value={change === null ? '-' : `${change >= 0 ? '+' : '−'}${pct(Math.abs(change), 1)}`} label="Change since August 2024" tone={change !== null && change < 0 ? 'crit' : 'good'} />
      </div>
      <div className="fin-bd-grid">
        <Breakdown title="By type of asset 資產類別" items={o.byClass} show={show} />
        <Breakdown title="By owner 擁有人" items={o.byOwner} show={show} note="Money you manage for others is included, as you chose; it is not yours to spend." />
        <Breakdown title="By currency 貨幣" items={o.byCurrency} show={show} note="Property and Canadian accounts are in CAD." />
        <Breakdown title="How quickly it can be used 流動性" items={o.byLiquidity} show={show} />
        <Breakdown title="Risk of money outside property 風險" items={o.riskOfMoney} show={show} risk note="Cash and GICs count as 1. Each stock has its own rating under Investments. Accounts without a holdings list are not rated." />
      </div>
      <p className="sub">The change since August 2024 compares with the old spreadsheet, which counted different properties, a mortgage and fewer accounts.</p>
    </section>
  )
}

// ================================================================= investments
export function InvestAnalytics({ f, fx, show }: { f: Finance; fx: Fx; show: boolean }) {
  const i = useMemo(() => A.investments(f, fx), [f, fx])
  const highRisk = i.byRisk.filter((x) => /^[45]/.test(x.label)).reduce((s, x) => s + x.value, 0) / (i.sum || 1)
  return (
    <section className="sub-panel span-2">
      <h3>Analysis 投資分析</h3>
      <div className="stats wide fin-stats">
        <Ratio value={i.top1 ? pct(i.top1.pct) : '-'} label={`Largest holding${i.top1 ? `: ${i.top1.name}` : ''}`} tone={i.top1 && i.top1.pct > 0.2 ? 'warn' : undefined} />
        <Ratio value={pct(i.top5)} label="Top 5 holdings" tone={i.top5 > 0.6 ? 'warn' : undefined} />
        <Ratio value={i.effectiveN.toFixed(1)} label={`Works like this many equal holdings (of ${i.listedCount})`} tone={i.effectiveN < 8 ? 'warn' : undefined} />
        <Ratio value={i.riskAvg ? i.riskAvg.toFixed(1) : '-'} label={`Average risk, 1 to 5 (${pct(i.ratedShare)} rated)`} />
        <Ratio value={pct(highRisk)} label="High or very high risk" tone={highRisk > 0.5 ? 'crit' : highRisk > 0.3 ? 'warn' : undefined} />
        <Ratio value={show ? money(i.div12) : '••••'} label={`Dividends in 12 months${i.divBase ? `, ${pct(i.div12 / i.divBase, 1)} yield on RBC stocks` : ''}`} />
      </div>
      <div className="fin-bd-grid">
        <Breakdown title="By sector 行業" items={i.bySector} show={show} />
        <Breakdown title="By risk level 風險" items={i.byRisk} show={show} risk note="1 very low (insured deposits), 2 low (utilities, REITs, stablecoin in a cold wallet), 3 medium (large established companies), 4 high (single China or emerging market stocks), 5 very high (crypto, troubled developers, newly listed). Change a rating with Edit under By account." />
        <Breakdown title="By type 種類" items={i.byType} show={show} />
        <Breakdown title="By owner 擁有人" items={i.byOwner} show={show} />
      </div>
      {(i.gainers.length > 0 || i.losers.length > 0) && (
        <div className="fin-movers">
          <h4>Biggest moves today 今日升跌</h4>
          <ul className="kv">
            {[...i.gainers, ...i.losers].map((x) => (
              <li key={x.p.holding!.id}><span>{x.p.label} <span className="sub inline">{x.p.holding!.symbol}</span></span><b className={x.move >= 0 ? 'up' : 'dn'}>{x.pct! >= 0 ? '+' : '−'}{Math.abs(x.pct!).toFixed(2)}%{show ? ` · ${x.move >= 0 ? '+' : '−'}${money(Math.abs(x.move))}` : ''}</b></li>
            ))}
          </ul>
        </div>
      )}
      <p className="sub">Accounts without a holdings list appear as one line each and are not rated. Send their holdings to include them by sector and risk. Dividends come from the imported statements{i.divFrom ? `, ${i.divFrom.slice(0, 7)} to ${i.divTo.slice(0, 7)}` : ''}. Gains since purchase are not shown because purchase prices are not stored.</p>
    </section>
  )
}

// ================================================================= accounts
export function AccountsAnalytics({ f, fx, show }: { f: Finance; fx: Fx; show: boolean }) {
  const a = useMemo(() => A.accounts(f, fx), [f, fx])
  const totalNow = netWorth(f, fx).accounts
  return (
    <section className="sub-panel span-2">
      <h3>Where the money sits 存放分佈</h3>
      <div className="fin-bd-grid">
        <Breakdown title="By bank or platform 機構" items={a.byInstitution} show={show} />
        <Breakdown title="By kind 種類" items={a.byKind} show={show} />
      </div>
      <h4>Deposit insurance check 存款保障</h4>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Owner</th><th>Bank</th><th className="n">Deposits</th><th className="n">Covered up to</th><th>Status</th></tr></thead>
        <tbody>
          {a.insurance.map((d) => (
            <tr key={`${d.owner}${d.bank}${d.cur}`}>
              <td>{ownerName(d.owner, true)}</td>
              <td>{d.bank}<span className="sub">{d.cur === 'HKD' ? 'Hong Kong Deposit Protection Scheme' : 'CDIC'}</span></td>
              <td className="n">{show ? `${d.cur === 'HKD' ? 'HK$' : 'CA$'}${Math.round(d.native).toLocaleString('en-CA')}` : '••••'}</td>
              <td className="n">{d.cur === 'HKD' ? 'HK$800,000' : 'CA$100,000'}</td>
              <td>{d.over > 0 ? <span className="pill out">{show ? `${d.cur === 'HKD' ? 'HK$' : 'CA$'}${Math.round(d.over).toLocaleString('en-CA')} above` : 'Above the limit'}</span> : <span className="pill in">Within</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="sub">CDIC covers up to CA$100,000 per person, per bank, for each category (for example in your own name, joint, TFSA or RRSP), so some of this may be covered under other categories. GICs longer than five years and brokerage accounts are not covered by CDIC; brokerage accounts have CIPF protection if the firm fails. Hong Kong bank deposits are covered up to HK$800,000 per person, per bank. Spreading large GICs across banks keeps them inside the limits.</p>
      <p className="sub">{a.prevDate && a.prevTotal !== null ? `Since the snapshot on ${a.prevDate}, accounts changed by ${show ? money(totalNow - a.prevTotal) : '••••'}.` : 'Only one balance snapshot so far. After the next one, this shows how much the accounts changed.'}</p>
    </section>
  )
}

// ================================================================= income and spending
function Bars({ series, show, yearly = false }: { series: { m: string; inc: number; exp: number; g?: number[] }[]; show: boolean; yearly?: boolean }) {
  const max = Math.max(1, ...series.flatMap((s) => [s.inc, s.exp]))
  const W = 720, H = 180, B = 22, bw = (W / series.length) * 0.36
  const scale = (v: number) => (Math.max(0, v) / max) * (H - B - 8)
  return (
    <svg className="fin-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={yearly ? 'Income by type and spending by year' : 'Income by type and spending by month'}>
      {series.map((s, i) => {
        const x = (i + 0.5) * (W / series.length)
        const h2 = scale(s.exp)
        let top = H - B
        return (
          <g key={s.m}>
            {(s.g ?? [s.inc]).map((v, k) => {
              const h = scale(v)
              if (h <= 0) return null
              top -= h
              return <rect key={k} x={x - bw - 1} y={top} width={bw} height={h} className={s.g ? `bar-g${k}` : 'bar-in'}><title>{`${s.m} ${s.g ? A.INCOME_GROUPS[k] : 'income'} ${show ? money(v) : ''}`}</title></rect>
            })}
            <rect x={x + 1} y={H - B - h2} width={bw} height={h2} className="bar-out"><title>{`${s.m} spending ${show ? money(s.exp) : ''}`}</title></rect>
            <text x={x} y={H - 6} textAnchor="middle">{yearly ? `'${s.m.slice(2)}` : s.m.slice(2).replace('-', '/')}</text>
          </g>
        )
      })}
    </svg>
  )
}

type YearRow = { m: string; inc: number; exp: number; recorded: number; partial: boolean }
function YearTable({ rows, show }: { rows: YearRow[]; show: boolean }) {
  const M = (v: number) => (show ? money(v) : '••••')
  return (
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>Year</th><th className="n">Income</th><th className="n">Spending</th><th className="n">Kept</th><th className="n">Spending a month</th></tr></thead>
      <tbody>{[...rows].reverse().map((r) => {
        const kept = r.inc - r.exp
        return (
          <tr key={r.m}>
            <td>{r.m}{r.partial ? ' (so far)' : ''}{r.recorded === 0 ? <span className="sub inline"> no spending records</span> : r.recorded < 12 && !r.partial ? <span className="sub inline"> {r.recorded} {r.recorded === 1 ? 'month' : 'months'} recorded</span> : null}</td>
            <td className="n">{r.inc ? M(r.inc) : '-'}</td>
            <td className="n">{r.exp ? M(r.exp) : '-'}</td>
            <td className={`n ${kept < 0 ? 'warn' : ''}`}>{r.inc || r.exp ? M(kept) : '-'}</td>
            <td className="n">{r.recorded ? M(r.exp / r.recorded) : '-'}</td>
          </tr>
        )
      })}</tbody>
    </table></div>
  )
}

export function CashflowAnalytics({ f, fx, show }: { f: Finance; fx: Fx; show: boolean }) {
  const opts = useMemo(() => A.periods(f), [f])
  const [period, setPeriod] = useState('last12')
  const c = useMemo(() => A.cashflow(f, fx, period, vanDate()), [f, fx, period])
  return (
    <section className="sub-panel span-2">
      <h3>
        Analysis 收支分析{' '}
        <select className="fin-year" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
          {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </h3>
      <div className="stats wide fin-stats">
        <Ratio value={show ? money(c.income) : '••••'} label="Income" />
        <Ratio value={show ? money(c.spending) : '••••'} label={`Spending (${c.recordedMonths} months recorded)`} />
        <Ratio value={pct(c.savingsRate)} label="Kept after spending (savings rate)" tone={c.savingsRate !== null && c.savingsRate < 0 ? 'crit' : 'good'} />
        <Ratio value={show ? money(c.avgSpend) : '••••'} label="Spending a month, recorded months" />
        <Ratio value={pct(c.steadyCover)} label="Spending covered by steady passive income (rent, investments, pensions)" tone={c.steadyCover !== null && c.steadyCover < 1 ? 'warn' : 'good'} />
        <Ratio value={pct(c.passiveCover)} label="With Airbnb income added" tone={c.passiveCover !== null && c.passiveCover < 1 ? 'warn' : 'good'} />
      </div>
      <Bars series={c.series} show={show} yearly={c.byYear} />
      <p className="sub legend">{A.INCOME_GROUPS.map((g, k) => <span key={g}><span className={`key g${k}`} /> {g} </span>)}<span className="key out" /> Spending</p>
      {c.byYear && <YearTable rows={c.series as unknown as YearRow[]} show={show} />}
      <div className="fin-bd-grid">
        <Breakdown title="Spending by category 支出類別" items={c.byCategory} show={show} />
        <Breakdown title="Fixed or flexible 固定或彈性" items={c.fixedFlex} show={show} note="Fixed costs are hard to cut quickly; flexible ones are where savings usually come from." />
        <Breakdown title="Where income comes from 收入來源" items={c.incomeTypes} show={show} note="Steady passive income is investment income, long-term rent and pensions. Airbnb income is passive too, but it moves with the seasons, so it is shown on its own." />
        <Breakdown title="Largest payees on statements 最大支出對象" items={c.payees} show={show} max={10} />
      </div>
      <p className="sub">Monthly spending is only as complete as the records: recent years come from the imported bank statements (accounts not imported yet are missing), earlier years from the old spreadsheet. Months without records do not count in the averages.</p>
    </section>
  )
}

// ================================================================= property
export function PropertyAnalytics({ f, fx, show }: { f: Finance; fx: Fx; show: boolean }) {
  const rows = useMemo(() => A.property(f, fx, vanDate()), [f, fx])
  const held = rows.filter((r) => r.p.status === 'held')
  const share = held.reduce((s, r) => s + r.pctOfWorth, 0)
  return (
    <section className="sub-panel span-2">
      <h3>Analysis 物業分析</h3>
      <div className="stats wide fin-stats">
        <Ratio value={pct(share)} label="Of net worth in property" tone={share > 0.7 ? 'warn' : undefined} />
        <Ratio value={show ? money(rows.reduce((s, r) => s + r.yearIncome, 0)) : '••••'} label="Property income, last 12 months" />
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Property</th><th className="n">Our equity</th><th className="n">Of net worth</th><th className="n">Assessment change</th><th className="n">Income, 12 months</th><th className="n">Yield on our equity</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.p.id} className={r.p.status === 'sold' ? 'muted' : ''}>
              <td>{A.shortAddress(r.p.address)}<span className="sub">{r.p.status === 'sold' ? `Sold ${r.p.sold_on?.slice(0, 7)}` : r.p.status === 'operated' ? 'Run, not owned' : r.p.status === 'record' ? `${r.p.details?.owner ?? 'Family'}, not counted` : r.p.use}</span></td>
              <td className="n">{r.p.status === 'sold' ? (r.realised !== null ? <span className="dn">{show ? money(r.realised) : '••••'}<span className="sub">realised, our share</span></span> : '-') : r.p.status !== 'held' ? '-' : show ? money(r.equity) : '••••'}</td>
              <td className="n">{r.p.status === 'held' ? pct(r.pctOfWorth, 1) : '-'}</td>
              <td className={`n ${r.change !== null && r.change < 0 ? 'dn' : 'up'}`}>{r.change === null ? '-' : `${r.change >= 0 ? '+' : '−'}${pct(Math.abs(r.change), 1)}`}{r.p.prev_value_as_of && <span className="sub">since {r.p.prev_value_as_of.slice(0, 4)}</span>}</td>
              <td className="n">{r.yearIncome ? (show ? money(r.yearIncome) : '••••') : '-'}</td>
              <td className="n">{pct(r.yieldPct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="sub">Yield is the income in the last 12 months divided by your share of the value, before tax and before costs paid by the property. A property that is not owned, or earns no rent, has no yield.</p>
    </section>
  )
}

// ================================================================= history
export function HistoryAnalytics({ f, fx, show }: { f: Finance; fx: Fx; show: boolean }) {
  const today = vanDate()
  const w = netWorth(f, fx)
  const h = useMemo(() => A.history(f, fx, w.total, today), [f, fx, w.total, today])
  return (
    <section className="sub-panel span-2">
      <h3>Growth and ratios 增長與比率</h3>
      <div className="stats wide fin-stats">
        <Ratio value={pct(h.cagr, 1)} label={`Average growth a year since ${h.since?.slice(0, 4) ?? '-'}`} tone={h.cagr !== null && h.cagr < 0 ? 'crit' : 'good'} />
        <Ratio value={h.best ? `${h.best.year} +${pct(h.best.growth, 0)}` : '-'} label="Best year" tone="good" />
        <Ratio value={h.worst ? `${h.worst.year} ${h.worst.growth! < 0 ? '−' : '+'}${pct(Math.abs(h.worst.growth!), 0)}` : '-'} label="Weakest year" tone={h.worst && h.worst.growth! < 0 ? 'crit' : undefined} />
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Year</th><th className="n">Net worth growth</th><th className="n">Savings rate</th><th className="n">Spending covered by passive income</th></tr></thead>
        <tbody>
          {h.rows.map((r) => (
            <tr key={r.year}>
              <td>{r.year}</td>
              <td className={`n ${r.growth !== null && r.growth < 0 ? 'dn' : 'up'}`}>{r.growth === null ? '-' : `${r.growth >= 0 ? '+' : '−'}${pct(Math.abs(r.growth), 1)}`}</td>
              <td className="n">{pct(r.savingsRate)}</td>
              <td className="n">{pct(r.passiveCover)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="sub">Average growth compares the first net worth in the old spreadsheet with today, at today&apos;s exchange rate{show ? '' : ''}. Savings rate is what was left after spending, as a share of income. When passive income covers 100% of spending, work becomes optional.</p>
    </section>
  )
}

// ================================================================= property assessment history
export function AssessmentChart({ f, show }: { f: Finance; show: boolean }) {
  const [mode, setMode] = useState<'whole' | 'share'>('whole')
  const props = f.properties.filter((p) => f.history.some((h) => h.measure === 'assessment' && h.category === p.key))
  const series = props
    .filter((p) => mode === 'whole' || p.share > 0)
    .map((p, i) => ({
      p, cls: `s${i % 10}`, dash: p.status !== 'held',
      pts: f.history.filter((h) => h.measure === 'assessment' && h.category === p.key)
        .sort((a, b) => a.as_of.localeCompare(b.as_of))
        .map((h) => ({ year: Number(h.as_of.slice(0, 4)) + 1, v: mode === 'share' ? h.amount * p.share : h.amount })),
    }))
  if (!series.length) return null
  const years = [...new Set(series.flatMap((s) => s.pts.map((x) => x.year)))].sort()
  const vals = series.flatMap((s) => s.pts.map((x) => x.v))
  const lo = Math.min(...vals) * 0.92, hi = Math.max(...vals) * 1.04
  const W = 720, H = 230, L = show ? 70 : 14, R = 16, T = 12, B = 26
  const X = (y: number) => L + ((y - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * (W - L - R)
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => lo + k * (hi - lo))
  const short = (v: number) => `CA$${(v / 1e6).toFixed(2)}M`
  return (
    <section className="sub-panel span-2">
      <h3>Assessed value by year 歷年評估價值</h3>
      <div className="fin-view" role="group" aria-label="Value shown">
        <button type="button" className={mode === 'whole' ? 'on' : ''} aria-pressed={mode === 'whole'} onClick={() => setMode('whole')}>Whole property</button>
        <button type="button" className={mode === 'share' ? 'on' : ''} aria-pressed={mode === 'share'} onClick={() => setMode('share')}>Your share</button>
      </div>
      <svg className="fin-chart assess" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="BC Assessment value of each property by year">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="grid" />
            {show && <text x={L - 6} y={Y(t) + 4} textAnchor="end">{short(t)}</text>}
          </g>
        ))}
        {years.map((y) => <text key={y} x={X(y)} y={H - 6} textAnchor="middle">{y}</text>)}
        {series.map((s) => (
          <g key={s.p.id}>
            <path d={s.pts.map((x, i) => `${i ? 'L' : 'M'}${X(x.year).toFixed(1)},${Y(x.v).toFixed(1)}`).join(' ')} className={`aline ${s.cls}`} strokeDasharray={s.dash ? '5 4' : undefined} />
            {s.pts.map((x) => <circle key={x.year} cx={X(x.year)} cy={Y(x.v)} r="3.5" className={`apt ${s.cls}`}><title>{`${shortAddress(s.p.address)} ${x.year}: ${show ? `CA$${Math.round(x.v).toLocaleString('en-CA')}` : 'hidden'}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <p className="sub legend">
        {series.map((s) => <span key={s.p.id} className="leg-item"><span className={`key-line ${s.cls}`} />{shortAddress(s.p.address)}{s.dash ? ` (${s.p.details?.owner ?? 'family'}, not counted)` : s.p.share < 1 ? ` (${Math.round(s.p.share * 100)}%)` : ''}</span>)}
      </p>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Year</th>{series.map((s) => <th key={s.p.id} className="n">{shortAddress(s.p.address)}</th>)}</tr></thead>
        <tbody>
          {[...years].reverse().map((y) => (
            <tr key={y}>
              <td>{y}</td>
              {series.map((s) => {
                const i = s.pts.findIndex((x) => x.year === y)
                const cur = s.pts[i], prev = i > 0 ? s.pts[i - 1] : null
                const ch = cur && prev ? (cur.v - prev.v) / prev.v : null
                return (
                  <td key={s.p.id} className="n">
                    {cur ? (show ? `CA$${Math.round(cur.v).toLocaleString('en-CA')}` : '••••') : '-'}
                    {ch !== null && <span className={`sub ${ch < 0 ? 'dn' : 'up'}`}>{ch >= 0 ? '+' : '−'}{pct(Math.abs(ch), 1)}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="sub">BC Assessment values as of 1 July of the year before. Over these five years: {series.map((s) => {
        const a = s.pts[0], b = s.pts[s.pts.length - 1]
        return a && b ? `${shortAddress(s.p.address)} ${b.v >= a.v ? '+' : '−'}${pct(Math.abs((b.v - a.v) / a.v), 1)}` : ''
      }).filter(Boolean).join(', ')}.</p>
    </section>
  )
}

// ================================================================= half-year portfolio snapshots
const TYPE_GROUP = (t: string) => (t === 'crypto' ? 'Crypto' : t === 'stablecoin' ? 'Stablecoins' : 'Stocks')
export function PortfolioSnapshots({ f, fx, show, userId, onDone }: { f: Finance; fx: Fx; show: boolean; userId: string; onDone: () => void }) {
  const [by, setBy] = useState<'owner' | 'type'>('type')
  const [msg, setMsg] = useState<string | null>(null)
  const dates = [...new Set(f.snapshots.map((r) => r.as_of))].sort()
  const today = vanDate()
  // Today's value from live prices, for comparison.
  const acct = new Map(f.accounts.map((a) => [a.id, a]))
  const live = f.holdings.map((h) => ({
    as_of: 'Today', symbol: h.symbol, name: h.name, owner: acct.get(h.account_id)?.owner ?? '', asset_type: h.asset_type,
    value_cad: toCad(h.shares * holdingPrice(f, h), h.currency, fx),
  }))
  const cols = [...dates, ...(dates.includes(today) ? [] : ['Today'])]
  const rowsOf = (d: string) => (d === 'Today' ? live : f.snapshots.filter((r) => r.as_of === d))
  const key = (r: { owner: string; asset_type: string }) => (by === 'owner' ? ownerName(r.owner, true) : TYPE_GROUP(r.asset_type))
  const groups = [...new Set(cols.flatMap((d) => rowsOf(d).map(key)))].sort()
  const table = cols.map((d) => {
    const rs = rowsOf(d)
    const g = Object.fromEntries(groups.map((k) => [k, rs.filter((r) => key(r) === k).reduce((s, r) => s + r.value_cad, 0)]))
    return { d, total: rs.reduce((s, r) => s + r.value_cad, 0), g }
  })
  if (!dates.length) return null
  const max = Math.max(...table.map((t) => t.total)) || 1
  const W = 720, H = 220, B = 26, T = 10, bw = (W / cols.length) * 0.55
  const label = (d: string) => (d === 'Today' ? 'Today' : `${d.slice(5, 7) === '06' ? 'Jun' : 'Dec'} ${d.slice(0, 4)}`)
  const symbols = [...new Set([...f.snapshots.map((r) => `${r.symbol}|${r.name}`), ...live.map((r) => `${r.symbol}|${r.name}`)])]
  const holdingRows = symbols.map((s) => {
    const [sym, name] = s.split('|')
    const vals = cols.map((d) => rowsOf(d).filter((r) => r.symbol === sym).reduce((t, r) => t + r.value_cad, 0))
    return { sym, name, vals }
  }).sort((a, b) => b.vals[b.vals.length - 1] - a.vals[a.vals.length - 1])
  const first = table[0], last = table[table.length - 1]
  const save = async () => {
    setMsg('Saving…')
    try { const n = await savePortfolioSnapshot(userId, f, fx, today); setMsg(`Saved ${n} holdings for ${today}.`); onDone() } catch (e) { setMsg(`Could not save: ${(e as Error).message}`) }
  }
  return (
    <section className="sub-panel span-2">
      <h3>Half-year snapshots 半年快照</h3>
      <div className="stats wide fin-stats">
        <Ratio value={show ? money(last.total) : '••••'} label={`${label(last.d)} 現值`} />
        <Ratio value={`${last.total >= first.total ? '+' : '−'}${pct(Math.abs(last.total - first.total) / (first.total || 1), 1)}`} label={`Since ${label(first.d)}`} tone={last.total >= first.total ? 'good' : 'crit'} />
        <Ratio value={show ? money(Math.max(...table.map((t) => t.total))) : '••••'} label={`Highest, ${label(table.reduce((a, b) => (b.total > a.total ? b : a)).d)}`} />
      </div>
      <div className="fin-view" role="group" aria-label="Split snapshots by">
        <button type="button" className={by === 'type' ? 'on' : ''} aria-pressed={by === 'type'} onClick={() => setBy('type')}>By type</button>
        <button type="button" className={by === 'owner' ? 'on' : ''} aria-pressed={by === 'owner'} onClick={() => setBy('owner')}>By owner</button>
      </div>
      <svg className="fin-chart assess" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Portfolio value at each half-year">
        {table.map((t, i) => {
          const x = (i + 0.5) * (W / cols.length) - bw / 2
          let y = H - B
          return (
            <g key={t.d}>
              {groups.map((k, j) => {
                const h = (t.g[k] / max) * (H - B - T)
                y -= h
                return <rect key={k} x={x} y={y} width={bw} height={Math.max(0, h)} className={`bar-seg c${j % 10}`}><title>{`${label(t.d)} ${k}: ${show ? money(t.g[k]) : pct(t.g[k] / (t.total || 1))}`}</title></rect>
              })}
              {show && <text x={x + bw / 2} y={H - B - (t.total / max) * (H - B - T) - 4} textAnchor="middle">{`${Math.round(t.total / 1000)}K`}</text>}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle">{label(t.d)}</text>
            </g>
          )
        })}
      </svg>
      <p className="sub legend">{groups.map((k, j) => <span key={k} className="leg-item"><span className={`dot-c c${j % 10}`} />{k}</span>)}</p>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Date</th><th className="n">Total</th><th className="n">Change</th>{groups.map((k) => <th key={k} className="n">{k}</th>)}</tr></thead>
        <tbody>
          {[...table].reverse().map((t) => {
            const i = table.indexOf(t)
            const prev = i > 0 ? table[i - 1].total : null
            const ch = prev ? (t.total - prev) / prev : null
            return (
              <tr key={t.d}>
                <td>{label(t.d)}</td>
                <td className="n">{show ? money(t.total) : '••••'}</td>
                <td className={`n ${ch !== null && ch < 0 ? 'dn' : 'up'}`}>{ch === null ? '-' : `${ch >= 0 ? '+' : '−'}${pct(Math.abs(ch), 1)}`}</td>
                {groups.map((k) => <td key={k} className="n">{show ? money(t.g[k]) : pct(t.g[k] / (t.total || 1))}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <details className="add-item">
        <summary>Each holding at each date 逐項明細</summary>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Holding</th>{cols.map((d) => <th key={d} className="n">{label(d)}</th>)}<th className="n">Change</th></tr></thead>
          <tbody>
            {holdingRows.map((r) => {
              const a = r.vals.find((v) => v > 0) ?? 0, b = r.vals[r.vals.length - 1]
              return (
                <tr key={r.sym}>
                  <td>{r.name}<span className="sub">{r.sym}</span></td>
                  {r.vals.map((v, i) => <td key={i} className="n">{v ? (show ? money(v) : '••••') : '-'}</td>)}
                  <td className={`n ${b < a ? 'dn' : 'up'}`}>{a && b ? `${b >= a ? '+' : '−'}${pct(Math.abs(b - a) / a, 0)}` : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </details>
      <div className="form-row">
        <button type="button" className="btn ghost" onClick={save}>Save today&apos;s snapshot 儲存今日快照</button>
        {msg && <span className="sub" role="status">{msg}</span>}
      </div>
      <p className="sub">Past snapshots were rebuilt from today&apos;s share counts and each date&apos;s closing price and exchange rate, because the holdings have not changed in over two years. Coinbase (50 shares) is included until it was sold on 30 June 2025 and SpaceX from its purchase on 12 June 2026. The Tether amounts on Aave are today&apos;s, so earlier interest is not shown. Investment accounts without a holdings list are not included. Press Save at the end of each June and December to keep the record going.</p>
    </section>
  )
}
