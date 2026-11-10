import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { shortDate } from './format'
import { vanDate } from './me'
import {
  accountAmount, updateTransactions, addIe, addMonth, holdingPrice, holdingsOf, ieYears, latestBalances, mix, monthly, monthsBack, netWorth,
  saveBalances, saveFinSettings, saveHolding,
  sumMap, toCad, updateProperty, yearLines, yearOneTime,
} from './finance'
import { FinOverview } from './FinOverview'
import { YieldCheck } from './FinYield'
import { FinPlan } from './FinPlan'
import { spendingMonthly } from './finPlan'
import { FinStatements } from './FinStatements'
import { BudgetEditor, Bills } from './FinRecent'
import { AccountsAnalytics, AssessmentChart, PortfolioSnapshots, CashflowAnalytics, HistoryAnalytics, InvestAnalytics, OverviewAnalytics, PropertyAnalytics } from './FinAnalytics'
import { RISK_LABEL } from './finAnalytics'
import { ownerManager, ownerName } from './finance'
import type { AccountKind, Cur, Finance, FinAccount, FinHolding, FinProperty, FinTransaction, Fx, TxKind } from './finance'

type Lang = 'zh' | 'en'

const SHOW_KEY = 'morning-board-finance-show'
const FIN_TABS = [
  { key: 'overview', label: 'Overview', zh: '總覽' },
  { key: 'networth', label: 'Net worth', zh: '淨資產' },
  { key: 'investments', label: 'Investments', zh: '投資' },
  { key: 'accounts', label: 'Accounts', zh: '戶口' },
  { key: 'cashflow', label: 'Income and spending', zh: '收支' },
  { key: 'bills', label: 'Bills', zh: '固定支出' },
  { key: 'property', label: 'Property', zh: '物業' },
  { key: 'history', label: 'History', zh: '歷史' },
  { key: 'plan', label: 'Retirement', zh: '退休' },
  { key: 'statements', label: 'Statements', zh: '月結單' },
]
const KIND: Record<AccountKind, [string, string]> = {
  cash: ['Cash', '現金'], gic: ['GIC', '定期'], investment: ['Investment', '投資'],
  credit_card: ['Credit card', '信用卡'], loan: ['Loan', '貸款'], other: ['Other', '其他'],
}
const STATUS: Record<FinProperty['status'], string> = { held: 'Owned', sold: 'Sold', operated: 'Run, not owned', record: 'Family, record only' }

function money(v: number, digits = 0): string {
  const s = Math.abs(v).toLocaleString('en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${v < 0 ? '−' : ''}CA$${s}`
}
function short(v: number): string {
  const a = Math.abs(v)
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : String(Math.round(a))
  return `${v < 0 ? '−' : ''}CA$${s}`
}
function orig(v: number, cur: Cur): string {
  return money(v, 2).replace('CA$', cur === 'USD' ? 'US$' : cur === 'HKD' ? 'HK$' : 'CA$')
}
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

// ================================================================= small parts
function Bar({ value, target, label, sub, show }: { value: number; target: number; label: ReactNode; sub: string; show: boolean }) {
  const p = pctOf(value, target)
  const tone = p >= 100 ? 'ok' : p >= 75 ? 'warn' : 'crit'
  return (
    <div className="fin-bar">
      <div className="fin-bar-head"><span>{label}</span><b className={`tone-${tone === 'ok' ? 'good' : tone === 'warn' ? 'soon' : 'urgent'}`}>{p}%</b></div>
      <div className={`fin-track ${tone}`}><span style={{ width: `${Math.min(100, p)}%` }} /></div>
      <span className="sub">{show ? `${money(value)} of ${money(target)}` : `${p}% of the target`} · {sub}</span>
    </div>
  )
}

function Chart({ points, show }: { points: { x: string; y: number; label?: string }[]; show: boolean }) {
  if (points.length < 2) return <p className="empty">Not enough history for a chart.</p>
  const W = 720, H = 220, L = show ? 64 : 12, R = 12, T = 12, B = 26
  const t0 = new Date(points[0].x).getTime(), t1 = new Date(points[points.length - 1].x).getTime()
  const max = Math.max(...points.map((p) => p.y)) * 1.08
  const X = (x: string) => L + ((new Date(x).getTime() - t0) / (t1 - t0 || 1)) * (W - L - R)
  const Y = (y: number) => T + (1 - y / (max || 1)) * (H - T - B)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max)
  const years = [...new Set(points.map((p) => p.x.slice(0, 4)))].filter((_, i, a) => a.length < 9 || i % 2 === 0)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')
  return (
    <svg className="fin-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net worth over time">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="grid" />
          {show && <text x={L - 6} y={Y(t) + 4} textAnchor="end">{short(t)}</text>}
        </g>
      ))}
      {years.map((y) => <text key={y} x={X(`${y}-07-01`)} y={H - 6} textAnchor="middle">{y}</text>)}
      <path d={d} className="line" />
      {points.map((p) => (
        <circle key={p.x} cx={X(p.x)} cy={Y(p.y)} r={p.label ? 5 : 3} className={p.label ? 'now' : 'pt'}>
          <title>{`${p.label ?? shortDate(p.x) + ' ' + p.x.slice(0, 4)}: ${show ? money(p.y) : 'hidden'}`}</title>
        </circle>
      ))}
    </svg>
  )
}

function ArchiveTable({ rows }: { rows: unknown[][] }) {
  const clean = rows.map((r) => r.slice(1)).filter((r) => r.some((c) => c !== null && c !== ''))
  const width = Math.max(...clean.map((r) => r.length))
  return (
    <div className="tbl-wrap"><table className="tbl fin-archive">
      <tbody>
        {clean.map((r, i) => (
          <tr key={i}>
            {Array.from({ length: width }, (_, j) => {
              const c = r[j]
              return <td key={j} className={typeof c === 'number' ? 'n' : ''}>{c === null || c === undefined ? '' : typeof c === 'number' ? (Math.abs(c) < 1 && c !== 0 ? `${Math.round(c * 100)}%` : c.toLocaleString('en-CA', { maximumFractionDigits: 2 })) : String(c)}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

// ================================================================= forms
function SnapshotForm({ f, fx, userId, onDone }: { f: Finance; fx: Fx; userId: string; onDone: () => void }) {
  const latest = useMemo(() => {
    const m = new Map<string, number>()
    const seen = new Map<string, string>()
    for (const b of f.balances) if (!seen.has(b.account_id) || b.as_of > seen.get(b.account_id)!) { seen.set(b.account_id, b.as_of); m.set(b.account_id, b.amount) }
    return m
  }, [f.balances])
  const active = [...f.accounts, ...f.business.accounts].filter((a) => a.active && !holdingsOf(f, a.id).length)
  const [asOf, setAsOf] = useState(vanDate())
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(active.map((a) => [a.id, String(latest.get(a.id) ?? '')])))
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const rows = active.filter((a) => vals[a.id] !== '' && Number.isFinite(Number(vals[a.id]))).map((a) => ({ account_id: a.id, amount: Number(vals[a.id]) }))
    setMsg('Saving…')
    try { await saveBalances(userId, asOf, rows); setMsg(`Saved ${rows.length} balances for ${asOf}.`); onDone() } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  const total = active.reduce((s, a) => s + (vals[a.id] === '' ? 0 : toCad(Number(vals[a.id]) || 0, a.currency, fx)), 0)
  return (
    <form className="fin-snap" onSubmit={submit}>
      <p className="sub">Type each balance from your banking apps. Credit cards are what you owe, as a negative number. The amounts start at the last snapshot, so change only what moved. Saving a second time on the same date replaces that date.</p>
      <label className="fin-date">Balances as of <input type="date" required value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
      <div className="fin-snap-grid">
        {active.map((a) => (
          <label key={a.id}>
            <span>{ownerName(a.owner)} · {a.institution} {a.name}{a.currency !== 'CAD' ? ` (${a.currency})` : ''}</span>
            <input inputMode="decimal" value={vals[a.id] ?? ''} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value.replace(/[^0-9.-]/g, '') })} />
          </label>
        ))}
      </div>
      {f.accounts.some((a) => holdingsOf(f, a.id).length) && <p className="sub">Stock accounts with a holdings list are priced live, so they are not in this form. Change their share counts under Holdings.</p>}
      <div className="form-row"><button type="submit" className="btn">Save snapshot 儲存</button><span className="sub inline">Accounts total {money(total)}</span>{msg && <span className="sub" role="status">{msg}</span>}</div>
    </form>
  )
}

function IeForm({ f, userId, onDone }: { f: Finance; userId: string; onDone: () => void }) {
  const lastMonth = addMonth(vanDate().slice(0, 7), -1)
  const [v, setV] = useState({ month: lastMonth, kind: 'income' as 'income' | 'expense', line: f.settings.income_lines?.[0] ?? '', amount: '', currency: 'CAD' as Cur, covers: '1', note: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const lines = v.kind === 'income' ? f.settings.income_lines ?? [] : f.settings.expense_lines ?? []
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    try {
      await addIe(userId, { month: `${v.month}-01`, kind: v.kind, line: v.line.trim(), amount: Number(v.amount), currency: v.currency, covers_months: Number(v.covers) || 1, note: v.note })
      setMsg(`Added ${v.line} for ${v.month}.`); setV({ ...v, amount: '', note: '' }); onDone()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="hi-edit" onSubmit={submit}>
      <label>Month<input type="month" required value={v.month} onChange={(e) => setV({ ...v, month: e.target.value })} /></label>
      <label>Type<select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as 'income' | 'expense', line: '' })}><option value="income">Income 收入</option><option value="expense">Spending 支出</option></select></label>
      <label>Line<input required list="fin-lines" value={v.line} onChange={(e) => setV({ ...v, line: e.target.value })} /><datalist id="fin-lines">{lines.map((l) => <option key={l} value={l} />)}</datalist></label>
      <label>Amount<input required inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value.replace(/[^0-9.-]/g, '') })} /></label>
      <label>Currency<select value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value as Cur })}><option>CAD</option><option>USD</option><option>HKD</option></select></label>
      <label>Spread over months<input type="number" min={1} max={240} value={v.covers} onChange={(e) => setV({ ...v, covers: e.target.value })} /></label>
      <label className="wide">Note<input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
      <div className="form-row"><button type="submit" className="btn">Add 加入</button>{msg && <span className="sub" role="status">{msg}</span>}</div>
      <p className="sub wide">For income paid every few months (for example a 6-monthly payout), type the whole payment in the month it arrived and spread it over the months it covers. For a long-lived purchase such as a car, type the price in the month you bought it and spread it over the years you expect to keep it (96 months for 8 years), so the monthly average stays true.</p>
    </form>
  )
}

function SpendForm({ f, userId, onDone, current, override }: { f: Finance; userId: string; fx: Fx; onDone: () => void; current: number; override: boolean }) {
  const [v, setV] = useState(String(Math.round(current)))
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { setV(String(Math.round(current))) }, [current])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await saveFinSettings(userId, f.settings, { spending_estimate: { monthly: Number(v), currency: 'CAD', source: `Typed in on ${vanDate()}`, override: true } })
      setMsg('Saved.'); onDone()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  const useAverage = async () => {
    try {
      await saveFinSettings(userId, f.settings, { spending_estimate: { ...(f.settings.spending_estimate ?? { monthly: 0, currency: 'CAD' as Cur }), override: false } })
      setMsg('Using the 5-year average.'); onDone()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="fin-inline" onSubmit={submit}>
      <label>Monthly spending CA$ <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
      <button type="submit" className="btn ghost">Use this amount</button>
      {override && <button type="button" className="linkish" onClick={useAverage}>Back to the 5-year average</button>}
      {msg && <span className="sub inline" role="status">{msg}</span>}
    </form>
  )
}

function PropertyRow({ p, show, onDone }: { p: FinProperty; show: boolean; onDone: () => void }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState({ value: String(p.value ?? ''), source: p.value_source, as_of: p.value_as_of ?? '', prev: String(p.prev_value ?? ''), prev_as_of: p.prev_value_as_of ?? '' })
  const [msg, setMsg] = useState<string | null>(null)
  const M = (x: number | null) => (x === null ? '-' : show ? money(x) : '••••')
  const save = async (e: FormEvent) => {
    e.preventDefault()
    try { await updateProperty(p.id, { value: v.value === '' ? null : Number(v.value), value_source: v.source, value_as_of: v.as_of || null, prev_value: v.prev === '' ? null : Number(v.prev), prev_value_as_of: v.prev_as_of || null }); setEdit(false); onDone() } catch (err) { setMsg((err as Error).message) }
  }
  return (<>
    <tr className={p.status === 'sold' ? 'muted' : ''}>
      <td>{p.address}<span className="sub">{p.use}</span></td>
      <td><span className={`pill ${p.status === 'held' ? 'in' : ''}`}>{STATUS[p.status]}</span></td>
      <td className="n">{p.share ? `${Math.round(p.share * 100)}%` : '-'}</td>
      <td className="n">{p.status === 'sold' ? <>{M(p.sale_price)}<span className="sub">sold {p.sold_on?.slice(0, 7)}</span></> : <>{M(p.value)}{p.value_source && <span className="sub">{p.value_source}</span>}</>}</td>
      <td className="n">{p.status === 'held' ? M(((p.value ?? 0) - p.mortgage) * p.share) : p.status === 'sold' && p.cost && p.sale_price ? <span className="dn">{M((p.sale_price - p.cost) * p.share)}<span className="sub">gain or loss, our share</span></span> : '-'}</td>
      <td>{p.status === 'held' && <button type="button" className="act" onClick={() => setEdit(!edit)} aria-expanded={edit}>{edit ? 'Close' : 'Edit'}</button>}</td>
    </tr>
    {p.note && !edit && <tr className="note-row"><td colSpan={6} className="sub">{p.note}</td></tr>}
    {edit && (
      <tr><td colSpan={6}>
        <form className="hi-edit" onSubmit={save}>
          <label>Whole property value CA$<input inputMode="decimal" value={v.value} onChange={(e) => setV({ ...v, value: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
          <label>Source<input value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} /></label>
          <label>Value as of<input type="date" value={v.as_of} onChange={(e) => setV({ ...v, as_of: e.target.value })} /></label>
          <label>Previous value CA$<input inputMode="decimal" value={v.prev} onChange={(e) => setV({ ...v, prev: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
          <label>Previous value as of<input type="date" value={v.prev_as_of} onChange={(e) => setV({ ...v, prev_as_of: e.target.value })} /></label>
          <div className="form-row"><button type="submit" className="btn">Save 儲存</button>{msg && <span className="problem">{msg}</span>}</div>
        </form>
      </td></tr>
    )}
  </>)
}

// ================================================================= stock holdings
function HoldingRow({ f, h, fx, show, userId, onDone }: { f: Finance; h: FinHolding; fx: Fx; show: boolean; userId: string; onDone: () => void }) {
  const [edit, setEdit] = useState(false)
  const [shares, setShares] = useState(String(h.shares))
  const [sector, setSector] = useState(h.sector)
  const [risk, setRisk] = useState(h.risk ? String(h.risk) : '')
  const [msg, setMsg] = useState<string | null>(null)
  const q = f.prices[h.symbol]
  const price = holdingPrice(f, h)
  const value = h.shares * price
  const save = async (e: FormEvent) => {
    e.preventDefault()
    try { await saveHolding(userId, { account_id: h.account_id, symbol: h.symbol, name: h.name, name_zh: h.name_zh, shares: Number(shares), currency: h.currency, last_price: price, sector: sector.trim(), risk: risk ? Number(risk) : null }); setEdit(false); onDone() } catch (err) { setMsg((err as Error).message) }
  }
  return (
    <tr>
      <td>
        <a className="q-link" href={`https://finance.yahoo.com/quote/${encodeURIComponent(h.symbol)}/`} target="_blank" rel="noreferrer">{h.name}</a> <span className="tc">{h.name_zh}</span>
        <span className="sub">{h.symbol}{!q && ' · stored price, live price unavailable'}</span>
      </td>
      <td className="n">
        {edit ? (
          <form className="fin-inline" onSubmit={save}>
            <input aria-label={`Shares of ${h.name}`} inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value.replace(/[^0-9.]/g, ''))} />
            <input aria-label={`Sector of ${h.name}`} placeholder="Sector" className="fin-sector" value={sector} onChange={(e) => setSector(e.target.value)} />
            <select className="fin-cat" aria-label={`Risk of ${h.name}`} value={risk} onChange={(e) => setRisk(e.target.value)}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{RISK_LABEL[r]}</option>)}
            </select>
            <button type="submit" className="act">Save</button>
            {msg && <span className="problem">{msg}</span>}
          </form>
        ) : h.shares.toLocaleString('en-CA')}
      </td>
      <td className="n">{price.toLocaleString('en-CA', { maximumFractionDigits: 3 })}{q?.changePct !== null && q?.changePct !== undefined && <span className={`sub ${q.changePct >= 0 ? 'up' : 'dn'}`}>{q.changePct >= 0 ? '+' : '−'}{Math.abs(q.changePct).toFixed(2)}%</span>}</td>
      <td className="n">{show ? orig(value, h.currency) : '••••'}{show && h.currency !== 'CAD' && <span className="sub">{money(toCad(value, h.currency, fx))}</span>}</td>
      <td><button type="button" className="act" onClick={() => setEdit(!edit)} aria-expanded={edit}>{edit ? 'Close' : 'Edit'}</button></td>
    </tr>
  )
}

function guessCur(symbol: string): Cur {
  if (/^\d{1,5}$/.test(symbol) || symbol.endsWith('.HK')) return 'HKD'
  if (symbol.endsWith('.TO') || symbol.endsWith('.V') || symbol.endsWith('.NE')) return 'CAD'
  return 'USD'
}

function AddHolding({ a, userId, onDone }: { a: FinAccount; userId: string; onDone: () => void }) {
  const [v, setV] = useState({ symbol: '', name: '', name_zh: '', shares: '', price: '', currency: '' as Cur | '' })
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    let symbol = v.symbol.trim().toUpperCase()
    if (/^\d{1,5}$/.test(symbol)) symbol = `${String(Number(symbol)).padStart(4, '0')}.HK`
    const currency: Cur = v.currency || guessCur(symbol)
    try {
      await saveHolding(userId, { account_id: a.id, symbol, name: v.name.trim() || symbol, name_zh: v.name_zh.trim(), shares: Number(v.shares), currency, last_price: v.price ? Number(v.price) : null })
      setMsg(`Saved ${symbol}.`); setV({ symbol: '', name: '', name_zh: '', shares: '', price: '', currency: '' }); onDone()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <details className="add-item"><summary>Add or change a holding 加入持股</summary>
      <form className="hi-edit" onSubmit={submit}>
        <label>Stock code<input required placeholder="700 or 0700.HK" value={v.symbol} onChange={(e) => setV({ ...v, symbol: e.target.value })} /></label>
        <label>Name<input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label>Name (中文)<input className="tc-text" value={v.name_zh} onChange={(e) => setV({ ...v, name_zh: e.target.value })} /></label>
        <label>Shares<input required inputMode="decimal" value={v.shares} onChange={(e) => setV({ ...v, shares: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
        <label>Currency<select value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value as Cur | '' })}><option value="">From the code ({guessCur(v.symbol.trim().toUpperCase() || 'X')})</option><option>USD</option><option>CAD</option><option>HKD</option></select></label>
        <label>Price now (optional)<input inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
        <div className="form-row"><button type="submit" className="btn">Save 儲存</button>{msg && <span className="sub" role="status">{msg}</span>}</div>
        <p className="sub wide">For a Hong Kong stock, type the number from the app (for example 700); it becomes 0700.HK. A Toronto stock ends in .TO (for example RY.TO); a US stock is the plain symbol (for example PFE). Saving a code that is already in the list replaces its share count. Set shares to 0 after selling everything.</p>
      </form>
    </details>
  )
}

function Holdings({ f, a, fx, show, userId, onDone }: { f: Finance; a: FinAccount; fx: Fx; show: boolean; userId: string; onDone: () => void }) {
  const hs = [...holdingsOf(f, a.id)].sort((x, y) => y.shares * holdingPrice(f, y) - x.shares * holdingPrice(f, x))
  const total = hs.reduce((s, h) => s + toCad(h.shares * holdingPrice(f, h), h.currency, fx), 0)
  const dayMove = hs.reduce((s, h) => { const q = f.prices[h.symbol]; return s + (q?.change ? toCad(q.change * h.shares, h.currency, fx) : 0) }, 0)
  return (
    <section className="sub-panel span-2">
      <h3>{ownerName(a.owner)} · {a.institution} {a.name} <span className="sub inline">{hs.length} stocks · {show ? money(total) : '••••'}{dayMove ? ` · today ${dayMove >= 0 ? '+' : '−'}${show ? money(Math.abs(dayMove)) : ''} (${Math.abs((dayMove / (total - dayMove || 1)) * 100).toFixed(2)}%)` : ''}</span></h3>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Stock</th><th className="n">Shares</th><th className="n">Price</th><th className="n">Value</th><th /></tr></thead>
        <tbody>{hs.map((h) => <HoldingRow key={h.id} f={f} h={h} fx={fx} show={show} userId={userId} onDone={onDone} />)}</tbody>
      </table></div>
      <AddHolding a={a} userId={userId} onDone={onDone} />
    </section>
  )
}

// ================================================================= bank statements
const KIND_LABEL: Record<TxKind, string> = { income: 'Income', expense: 'Spending', transfer: 'Own transfer', capital: 'One-time' }
const CAPITAL_LINES = ['Large deposit', 'Large cheque', 'Large cash withdrawal', 'Mortgage payout', 'Investment trades', 'Shuswap building cost', 'Relocation and home setup (one-time)']

function categories(f: Finance): { value: string; label: string }[] {
  const used = (k: TxKind) => [...new Set([...f.transactions.filter((t) => t.kind === k).map((t) => t.line), ...(k === 'income' ? f.settings.income_lines ?? [] : k === 'expense' ? f.settings.expense_lines ?? [] : [])])].sort()
  return [
    ...used('expense').map((l) => ({ value: `expense|${l}`, label: `Spending: ${l}` })),
    ...used('income').map((l) => ({ value: `income|${l}`, label: `Income: ${l}` })),
    { value: 'transfer|Transfer', label: 'Own transfer, not counted' },
    ...CAPITAL_LINES.map((l) => ({ value: `capital|${l}`, label: `One-time, not counted: ${l}` })),
  ]
}

function ReviewRow({ t, f, show, cats, onDone }: { t: FinTransaction; f: Finance; show: boolean; cats: { value: string; label: string }[]; onDone: () => void }) {
  const [v, setV] = useState(`${t.kind}|${t.line}`)
  const [all, setAll] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const similar = f.transactions.filter((x) => !x.reviewed && x.id !== t.id && x.description === t.description)
  const save = async () => {
    const [kind, ...rest] = v.split('|')
    setMsg('Saving…')
    try {
      await updateTransactions([t.id, ...(all ? similar.map((x) => x.id) : [])], { kind: kind as TxKind, line: rest.join('|'), reviewed: true })
      setMsg(null); onDone()
    } catch (e) { setMsg(`Could not save: ${(e as Error).message}`) }
  }
  return (
    <tr>
      <td className="mono">{t.posted_on}</td>
      <td>{t.description}<span className="sub">{t.account}</span></td>
      <td className={`n ${t.amount < 0 ? 'dn' : 'up'}`}>{show ? orig(t.amount, t.currency) : '••••'}</td>
      <td>
        <select className="fin-cat" value={v} onChange={(e) => setV(e.target.value)} aria-label={`Category for ${t.description} on ${t.posted_on}`}>
          {!cats.some((c) => c.value === v) && <option value={v}>{v.replace('|', ': ')}</option>}
          {cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {similar.length > 0 && <label className="sub fin-similar"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Also the {similar.length} other &quot;{t.description}&quot;</label>}
        {msg && <span className="sub" role="status">{msg}</span>}
      </td>
      <td><button type="button" className="act" onClick={save}>Confirm</button></td>
    </tr>
  )
}

function Statements({ f, fx, show, onDone }: { f: Finance; fx: Fx; show: boolean; onDone: () => void }) {
  const tx = f.transactions
  const months = [...new Set(tx.map((t) => t.posted_on.slice(0, 7)))].sort().reverse()
  const [month, setMonth] = useState(months[0] ?? '')
  const [view, setView] = useState<'review' | 'month' | 'capital'>('review')
  const cats = useMemo(() => categories(f), [f])
  if (!tx.length) return null
  const review = tx.filter((t) => !t.reviewed).sort((a, b) => b.posted_on.localeCompare(a.posted_on))
  const capital = tx.filter((t) => t.kind === 'capital').sort((a, b) => b.posted_on.localeCompare(a.posted_on))
  const inMonth = tx.filter((t) => t.posted_on.startsWith(month)).sort((a, b) => a.posted_on.localeCompare(b.posted_on))
  const sum = (k: TxKind) => inMonth.filter((t) => t.kind === k).reduce((s, t) => s + toCad(t.amount, t.currency, fx), 0)
  const M = (v: number) => (show ? money(v) : '••••')
  return (
    <section className="sub-panel span-2">
      <h3>Bank statements 銀行月結單 <span className="sub inline">{tx.length} transactions, {months[months.length - 1]} to {months[0]}</span></h3>
      <div className="fin-view" role="group" aria-label="Statement view">
        <button type="button" className={view === 'review' ? 'on' : ''} aria-pressed={view === 'review'} onClick={() => setView('review')}>To review ({review.length})</button>
        <button type="button" className={view === 'month' ? 'on' : ''} aria-pressed={view === 'month'} onClick={() => setView('month')}>By month</button>
        <button type="button" className={view === 'capital' ? 'on' : ''} aria-pressed={view === 'capital'} onClick={() => setView('capital')}>Large one-time moves ({capital.length})</button>
      </div>
      {view === 'review' && (review.length ? (<>
        <p className="sub">These were sorted by a best guess and already count in the monthly figures. Pick the right category and press Confirm. Money moved between your own accounts, or sent for someone else, should be &quot;Own transfer&quot; so it is not counted as spending.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th>Description</th><th className="n">Amount</th><th>Category</th><th /></tr></thead>
          <tbody>{review.map((t) => <ReviewRow key={t.id} t={t} f={f} show={show} cats={cats} onDone={onDone} />)}</tbody>
        </table></div>
      </>) : <p className="all-clear">Everything has been reviewed.</p>)}
      {view === 'month' && (<>
        <label className="fin-date">Month <select className="fin-year" value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        <div className="stats wide fin-stats">
          <div className="stat"><b>{M(sum('income'))}</b><span>Income</span></div>
          <div className="stat"><b>{M(-sum('expense'))}</b><span>Spending</span></div>
          <div className="stat"><b>{inMonth.filter((t) => t.kind === 'transfer').length}</b><span>Own transfers, not counted</span></div>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="n">Amount</th></tr></thead>
          <tbody>{inMonth.map((t) => (
            <tr key={t.id} className={t.kind === 'transfer' ? 'muted' : ''}>
              <td className="mono">{t.posted_on.slice(5)}</td>
              <td>{t.description}<span className="sub">{t.account}</span></td>
              <td>{KIND_LABEL[t.kind]}<span className="sub">{t.line}{!t.reviewed && ' · to review'}</span></td>
              <td className={`n ${t.amount < 0 ? 'dn' : 'up'}`}>{show ? orig(t.amount, t.currency) : '••••'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </>)}
      {view === 'capital' && (<>
        <p className="sub">Large movements that are not everyday income or spending, such as a mortgage payout or the proceeds of a property sale. They are kept out of the monthly figures.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th>Description</th><th>What it is</th><th className="n">Amount</th></tr></thead>
          <tbody>{capital.map((t) => (
            <tr key={t.id}>
              <td className="mono">{t.posted_on}</td>
              <td>{t.description}<span className="sub">{t.account}</span></td>
              <td>{t.line}{!t.reviewed && <span className="sub">to review</span>}</td>
              <td className={`n ${t.amount < 0 ? 'dn' : 'up'}`}>{show ? orig(t.amount, t.currency) : '••••'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </>)}
      <p className="sub">Only the accounts imported so far. Card payments and transfers between your own accounts are left out so nothing is counted twice; when a card has no itemised export, its monthly payment counts as one card-spending line. Payouts that belong to shared properties are not counted as personal income. Account and card numbers were removed.</p>
    </section>
  )
}

// ================================================================= investments tab
function Investments({ f, fx, show, userId, onDone }: { f: Finance; fx: Fx; show: boolean; userId: string; onDone: () => void }) {
  const [view, setView] = useState<'all' | 'account'>('all')
  const latest = latestBalances(f)
  const acct = new Map(f.accounts.map((a) => [a.id, a]))
  const rows = f.holdings.map((h) => {
    const q = f.prices[h.symbol]
    const cad = toCad(h.shares * holdingPrice(f, h), h.currency, fx)
    const move = q?.change ? toCad(q.change * h.shares, h.currency, fx) : 0
    return { h, a: acct.get(h.account_id), q, cad, move }
  }).sort((x, y) => y.cad - x.cad)
  const stocks = rows.reduce((s, r) => s + r.cad, 0)
  const move = rows.reduce((s, r) => s + r.move, 0)
  // One line per investment: the same symbol in several accounts or for several people is added together.
  const grouped = [...rows.reduce((m, r) => {
    const g = m.get(r.h.symbol) ?? { ...r, shares: 0, cad: 0, value: 0, parts: [] as typeof rows }
    g.shares += r.h.shares; g.cad += r.cad; g.value += r.h.shares * holdingPrice(f, r.h); g.parts.push(r)
    m.set(r.h.symbol, g)
    return m
  }, new Map<string, (typeof rows)[number] & { shares: number; value: number; parts: typeof rows }>()).values()].sort((x, y) => y.cad - x.cad)
  const place = (r: (typeof rows)[number]) => [r.a?.institution, r.a?.name].filter(Boolean).join(' ')
  // Investment accounts without a holdings list are valued from the last snapshot.
  const other = f.accounts.filter((a) => a.active && a.kind === 'investment' && !holdingsOf(f, a.id).length)
  const otherTotal = other.reduce((s, a) => s + toCad(latest.get(a.id)?.amount ?? 0, a.currency, fx), 0)
  const total = stocks + otherTotal
  const byCur = (['HKD', 'USD', 'CAD'] as Cur[]).map((c) => ({ c, v: rows.filter((r) => r.h.currency === c).reduce((s, r) => s + r.cad, 0) + other.filter((a) => a.currency === c).reduce((s, a) => s + toCad(latest.get(a.id)?.amount ?? 0, a.currency, fx), 0) })).filter((x) => x.v > 0)
  const byOwner = [...new Set([...rows.map((r) => r.a?.owner ?? ''), ...other.map((a) => a.owner)])].map((o) => ({ o, v: rows.filter((r) => r.a?.owner === o).reduce((s, r) => s + r.cad, 0) + other.filter((a) => a.owner === o).reduce((s, a) => s + toCad(latest.get(a.id)?.amount ?? 0, a.currency, fx), 0) })).sort((a, b) => b.v - a.v)
  const M = (v: number) => (show ? money(v) : '••••')
  const stockAccounts = f.accounts.filter((a) => a.active && holdingsOf(f, a.id).length)
  const MARKET: Record<Cur, string> = { HKD: 'Hong Kong dollar', USD: 'US dollar', CAD: 'Canadian dollar' }
  return (<>
    <div className="stats wide fin-stats">
      <div className="stat"><b>{M(total)}</b><span>All investments 總投資</span></div>
      <div className="stat"><b className={move < 0 ? 'dn' : move > 0 ? 'up' : ''}>{move ? `${move > 0 ? '+' : '−'}${show ? money(Math.abs(move)) : ''} ${Math.abs((move / (stocks - move || 1)) * 100).toFixed(2)}%` : '-'}</b><span>Today, listed stocks</span></div>
      <div className="stat"><b>{grouped.length}</b><span>Investments in {stockAccounts.length} accounts</span></div>
      {byOwner.map((x) => <div key={x.o} className="stat"><b>{M(x.v)}</b><span>{ownerName(x.o)}</span></div>)}
    </div>

    <div className="detail-grid">
      <section className="sub-panel span-2">
        <h3>By currency 貨幣分佈</h3>
        <div className="fin-split" aria-label="Investments by currency">
          {byCur.map((x) => <span key={x.c} className={`seg m-${x.c}`} style={{ flex: x.v }} title={`${MARKET[x.c]} ${pctOf(x.v, total)}%`}>{MARKET[x.c]} {pctOf(x.v, total)}%</span>)}
        </div>
        <div className="fin-view" role="group" aria-label="Group holdings">
          <button type="button" className={view === 'all' ? 'on' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>All stocks together</button>
          <button type="button" className={view === 'account' ? 'on' : ''} aria-pressed={view === 'account'} onClick={() => setView('account')}>By account, to edit</button>
        </div>
      </section>

      <InvestAnalytics f={f} fx={fx} show={show} />

      <PortfolioSnapshots f={f} fx={fx} show={show} userId={userId} onDone={onDone} />

      {view === 'all' ? (
        <section className="sub-panel span-2">
          <h3>All stocks 全部持股 <span className="sub inline">largest first; the same investment held in several accounts is shown once</span></h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Stock</th><th>Account</th><th className="n">Shares</th><th className="n">Price</th><th className="n">Today</th><th className="n">Value</th><th className="n">Share</th></tr></thead>
            <tbody>
              {grouped.map(({ h, q, cad, shares, value, parts }) => {
                const owners = [...new Set(parts.map((p) => p.a?.owner ?? ''))]
                return (
                <tr key={h.symbol}>
                  <td><a className="q-link" href={`https://finance.yahoo.com/quote/${encodeURIComponent(h.symbol)}/`} target="_blank" rel="noreferrer">{h.name}</a> <span className="tc">{h.name_zh !== h.name ? h.name_zh : ''}</span><span className="sub">{h.symbol}{!q && ' · stored price'}</span></td>
                  <td>
                    {owners.map((o) => ownerName(o)).join(', ')}
                    {parts.length === 1
                      ? <span className="sub">{parts[0].a?.institution}</span>
                      : <span className="sub">{parts.length} places: {parts.map((p) => `${place(p)} ${p.h.shares.toLocaleString('en-CA')}`).join('; ')}</span>}
                  </td>
                  <td className="n">{shares.toLocaleString('en-CA')}</td>
                  <td className="n">{holdingPrice(f, h).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}<span className="sub">{h.currency}</span></td>
                  <td className={`n ${(q?.changePct ?? 0) < 0 ? 'dn' : (q?.changePct ?? 0) > 0 ? 'up' : ''}`}>{q?.changePct !== null && q?.changePct !== undefined ? `${q.changePct >= 0 ? '+' : '−'}${Math.abs(q.changePct).toFixed(2)}%` : '-'}</td>
                  <td className="n">{M(cad)}{show && h.currency !== 'CAD' && <span className="sub">{orig(value, h.currency)}</span>}</td>
                  <td className="n">{pctOf(cad, total)}%</td>
                </tr>
                )
              })}
              {other.map((a) => (
                <tr key={a.id} className="muted">
                  <td>{a.institution} {a.name}<span className="sub">no holdings list yet, value from the last snapshot</span></td>
                  <td>{ownerName(a.owner)}</td>
                  <td className="n">-</td><td className="n">-</td><td className="n">-</td>
                  <td className="n">{M(toCad(latest.get(a.id)?.amount ?? 0, a.currency, fx))}</td>
                  <td className="n">{pctOf(toCad(latest.get(a.id)?.amount ?? 0, a.currency, fx), total)}%</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={5}>Total</td><td className="n">{M(total)}</td><td className="n">100%</td></tr>
            </tbody>
          </table></div>
        </section>
      ) : (<>
        {stockAccounts.map((a) => <Holdings key={a.id} f={f} a={a} fx={fx} show={show} userId={userId} onDone={onDone} />)}
        {other.length > 0 && (
          <section className="sub-panel span-2">
            <h3>Accounts without a holdings list</h3>
            <p className="sub">These are valued from the last snapshot. To price them live, send a screenshot of the holdings, or add each stock here.</p>
            {other.map((a) => (
              <details key={a.id} className="add-item">
                <summary>{ownerName(a.owner)} · {a.institution} {a.name} · {M(toCad(latest.get(a.id)?.amount ?? 0, a.currency, fx))}</summary>
                <AddHolding a={a} userId={userId} onDone={onDone} />
              </details>
            ))}
          </section>
        )}
      </>)}
      <p className="sub span-2">Prices from Yahoo Finance; Hong Kong and US prices may be delayed. When a live price is missing, the price from when the stock was entered is used. Cash held in a brokerage account is under Accounts, not here.</p>
    </div>
  </>)
}

// ================================================================= page
export function FinancePage({ f, fx, userId, onReload, lang, tab: rawTab }: { f: Finance; fx: Fx; userId: string; onReload: () => void; lang: Lang; tab: string }) {
  const tab = FIN_TABS.some((t) => t.key === rawTab) ? rawTab : 'overview'
  const [show, setShowState] = useState(() => { try { return localStorage.getItem(SHOW_KEY) === '1' } catch { return false } })
  const setShow = (v: boolean) => { setShowState(v); try { localStorage.setItem(SHOW_KEY, v ? '1' : '0') } catch { /* this visit only */ } }
  const [snapOpen, setSnapOpen] = useState(false)
  const years = useMemo(() => ieYears(f), [f])
  const [year, setYear] = useState<number>(() => years.find((y) => y < 2024) ?? years[0] ?? 2023)
  const M = (v: number) => (show ? money(v) : '••••')
  const zh = lang === 'zh'

  const w = useMemo(() => netWorth(f, fx), [f, fx])
  const spendInfo = useMemo(() => spendingMonthly(f, fx, vanDate()), [f, fx])
  const spend = spendInfo.value
  const m = mix(w, f.settings, spend)

  const thisMonth = vanDate().slice(0, 7)
  const months = useMemo(() => monthsBack(addMonth(thisMonth, -1), 12), [thisMonth])
  const inc = useMemo(() => monthly(f, fx, 'income', months), [f, fx, months])
  const exp = useMemo(() => monthly(f, fx, 'expense', months), [f, fx, months])
  const incLines = [...new Set(months.flatMap((mo) => [...(inc.get(mo)?.keys() ?? [])]))]
  const started = months.filter((mo) => inc.has(mo))
  const avgIncome = started.length ? started.reduce((s, mo) => s + sumMap(inc.get(mo)), 0) / started.length : 0
  const gap = spend - avgIncome
  const lastMonths = gap > 0 ? m.safe / gap : Infinity

  const target = f.settings.saving_target
  const targetCad = target ? toCad(target.amount, target.currency, fx) : 0

  const history = useMemo(() => {
    const pts = f.history.filter((h) => h.measure === 'net_equity').map((h) => ({ x: h.as_of, y: toCad(h.amount, h.currency, fx) }))
    return [...pts, { x: vanDate(), y: w.total, label: 'Today' }]
  }, [f.history, fx, w.total])
  const yearly = useMemo(() => {
    const by = new Map<string, Record<string, number>>()
    for (const h of f.history.filter((x) => x.measure.startsWith('yearly_'))) {
      const y = h.as_of.slice(0, 4)
      by.set(y, { ...(by.get(y) ?? {}), [h.measure.slice(7)]: toCad(h.amount, h.currency, fx) })
    }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [f.history, fx])
  const lines = useMemo(() => yearLines(f, fx, year), [f, fx, year])
  const linesIncome = useMemo(() => yearLines(f, fx, year, 'income'), [f, fx, year])
  const oneTime = useMemo(() => yearOneTime(f, fx, year), [f, fx, year])

  const owners = [...new Set(f.accounts.map((a) => a.owner))]
  const latest = latestBalances(f)
  const amountOf = (a: FinAccount) => accountAmount(f, a.id, latest, fx)

  return (
    <main className="detail fin">
      <div className="journey">
        <div>
          <span className="big home-title">Finance <span className="tc">財務</span></span>
          <p className="sub">
            In Canadian dollars{w.asOf ? ` · balances as of ${shortDate(w.asOf)}` : ''} · US$1 = CA${fx.usdCad.toFixed(4)}, CA$1 = HK${fx.cadHkd.toFixed(4)}
            {fx.live ? ' (live)' : ' (estimate, live rates unavailable)'}
          </p>
        </div>
        <div className="fin-actions">
          <button type="button" className="btn ghost" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide amounts 隱藏' : 'Show amounts 顯示'}</button>
          <button type="button" className="btn" aria-expanded={snapOpen && tab === 'accounts'} onClick={() => { if (tab !== 'accounts') { setSnapOpen(true); window.location.hash = '#/finance/accounts' } else setSnapOpen(!snapOpen) }}>{snapOpen && tab === 'accounts' ? 'Close' : 'New snapshot 更新結餘'}</button>
        </div>
      </div>

      <nav className="home-tabs fin-tabs" aria-label="Finance sections">
        {FIN_TABS.map((t) => (
          <a key={t.key} href={`#/finance${t.key === 'overview' ? '' : '/' + t.key}`} className={tab === t.key ? 'on' : ''} aria-current={tab === t.key ? 'page' : undefined}>
            {t.label} <span className="tc">{t.zh}</span>
          </a>
        ))}
      </nav>

      {tab === 'overview' && <FinOverview f={f} fx={fx} show={show} userId={userId} onReload={onReload} />}

      {tab === 'networth' && (<>
      <div className="stats wide fin-stats">
        <div className="stat"><b>{M(w.total)}</b><span>Net worth 淨資產</span></div>
        <div className="stat"><b>{M(w.accounts)}</b><span>Bank and investment accounts</span></div>
        <div className="stat"><b>{M(w.property)}</b><span>Property, our share</span></div>
        <div className="stat"><b>{M(avgIncome)}</b><span>Income a month, last {started.length || 12} months</span></div>
        <div className="stat"><b className={lastMonths < 60 ? 'warn' : ''}>{Number.isFinite(lastMonths) ? `${Math.floor(lastMonths / 12)} y ${Math.round(lastMonths % 12)} m` : 'No gap'}</b><span>Cash and GICs last, at the current gap</span></div>
      </div>
      <div className="detail-grid">
        <section className="sub-panel">
          <h3>What we own 資產組成</h3>
          <ul className="kv">
            {w.properties.map(({ p, equity }) => <li key={p.id}><span>{p.address}{p.share < 1 ? ` (${Math.round(p.share * 100)}%)` : ''}</span><b>{M(equity)}</b></li>)}
            {w.byOwner.map((o) => <li key={o.owner}><span>{ownerName(o.owner)}&apos;s accounts{ownerManager(o.owner) && <span className="sub inline"> managed by {ownerManager(o.owner)}</span>}</span><b>{M(o.total)}</b></li>)}
            <li><span>Owing on credit cards and loans <span className="sub inline">already counted above</span></span><b>{M(w.debt)}</b></li>
            <li className="total"><span>Net worth</span><b>{M(w.total)}</b></li>
          </ul>
          {targetCad > 0 && (
            <Bar value={w.total} target={targetCad} show={show}
              label={<>Saving target 儲蓄目標</>}
              sub={`${target?.currency === 'HKD' ? `HK$${(target.amount / 1e6).toFixed(0)} million from the old sheet, converted at today's rate` : 'from the old sheet'}`} />
          )}
        </section>

        <section className="sub-panel">
          <h3>Mix against the retirement rule 退休配置</h3>
          <p className="sub">{f.settings.target?.note ?? 'Keep 6 months of spending in cash and 24 months in cash plus GICs; invest the rest.'}</p>
          <Bar value={m.cash} target={m.cashTarget} show={show} label={<>Cash, {f.settings.target?.cash_months ?? 6} months 現金</>} sub="chequing and savings, less credit cards" />
          <Bar value={m.safe} target={m.safeTarget} show={show} label={<>Cash and GICs, {f.settings.target?.safe_months ?? 24} months 安全資金</>} sub="money that does not fall with the market" />
          <div className="fin-split" aria-label="Share of accounts">
            {(['cash', 'gic', 'investment'] as const).map((k) => {
              const total = w.byKind.cash + w.byKind.credit_card + w.byKind.gic + w.byKind.investment
              const v = k === 'cash' ? w.byKind.cash + w.byKind.credit_card : w.byKind[k]
              return <span key={k} className={`seg ${k}`} style={{ flex: Math.max(0.01, v) }} title={`${KIND[k][0]} ${pctOf(v, total)}%`}>{KIND[k][0]} {pctOf(v, total)}%</span>
            })}
          </div>
          <p className="sub">
            {m.safe > m.safeTarget * 1.5
              ? `Cash and GICs hold about ${Math.round(m.safe / (spend || 1))} months of spending, well over the ${f.settings.target?.safe_months ?? 24} month rule. About ${show ? money(m.safe - m.safeTarget) : 'the rest'} could be invested for growth if you want to follow the rule.`
              : m.safe < m.safeTarget
                ? 'Cash and GICs are below the rule. Top them up from investments before the next large expense.'
                : 'Cash and GICs are in line with the rule.'}
          </p>
          <SpendForm f={f} userId={userId} fx={fx} onDone={onReload} current={spend} override={spendInfo.override} />
          <span className="sub">{spendInfo.note}</span>
        </section>

        <OverviewAnalytics f={f} fx={fx} show={show} />
      </div>
      </>)}

      {tab === 'investments' && <Investments f={f} fx={fx} show={show} userId={userId} onDone={onReload} />}

      {tab === 'accounts' && (<>
      {snapOpen && <section className="sub-panel"><h3>New snapshot 更新結餘</h3><SnapshotForm f={f} fx={fx} userId={userId} onDone={onReload} /></section>}
      <div className="detail-grid">
        <section className="sub-panel span-2">
          <h3>Accounts 戶口 <span className="sub inline">no account numbers are stored</span></h3>
          <div className="detail-grid">
            {owners.map((o) => {
              const list = f.accounts.filter((a) => a.owner === o && a.active)
              const total = list.reduce((s, a) => s + toCad(amountOf(a) ?? 0, a.currency, fx), 0)
              return (
                <div key={o} className="tbl-wrap">
                  <h4>{ownerName(o)} · {M(total)}</h4>
                  <table className="tbl">
                    <thead><tr><th>Account</th><th>Type</th><th className="n">Balance</th></tr></thead>
                    <tbody>
                      {list.map((a) => {
                        const b = amountOf(a)
                        const live = holdingsOf(f, a.id).length > 0
                        return (
                          <tr key={a.id}>
                            <td>{a.institution} {a.name}{a.note && <span className="sub">{a.note}</span>}</td>
                            <td><span className={`pill k-${a.kind}`}>{KIND[a.kind][0]}</span></td>
                            <td className="n">{b !== null ? (show ? orig(b, a.currency) : '••••') : '-'}{b !== null && a.currency !== 'CAD' && show && <span className="sub">{money(toCad(b, a.currency, fx))}</span>}{live && <span className="sub">live prices</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </section>

        {f.business.accounts.length > 0 && (
          <section className="sub-panel span-2">
            <h3>Business 業務 <span className="sub inline">kept out of personal net worth, spending and alerts</span></h3>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Account</th><th>Type</th><th className="n">Balance</th></tr></thead>
              <tbody>
                {f.business.accounts.filter((a) => a.active).map((a) => {
                  const b = latest.get(a.id)
                  return (
                    <tr key={a.id}>
                      <td>{ownerName(a.owner)} · {a.institution} {a.name}{a.note && <span className="sub">{a.note}</span>}</td>
                      <td><span className={`pill k-${a.kind}`}>{KIND[a.kind][0]}</span></td>
                      <td className="n">{b ? (show ? orig(b.amount, a.currency) : '••••') : '-'}<span className="sub">{b ? `as of ${b.as_of}` : 'no balance yet'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
            {f.business.transactions.length > 0 && <p className="sub">{f.business.transactions.length} business statement lines are stored and left out of the personal Income and spending figures.</p>}
          </section>
        )}

        <YieldCheck f={f} fx={fx} show={show} userId={userId} onDone={onReload} />

        <AccountsAnalytics f={f} fx={fx} show={show} />
      </div>
      </>)}

      {tab === 'cashflow' && (
      <div className="detail-grid">
        <section className="sub-panel span-2">
          <h3>Income and spending, last 12 months 收入與支出</h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Month</th>{incLines.map((l) => <th key={l} className="n">{l}</th>)}<th className="n">Income</th><th className="n">Spending</th><th className="n">Gap</th></tr></thead>
            <tbody>
              {[...months].reverse().map((mo) => {
                const i = sumMap(inc.get(mo)), recorded = sumMap(exp.get(mo)), s = recorded || spend
                return (
                  <tr key={mo}>
                    <td>{new Date(`${mo}-15`).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}</td>
                    {incLines.map((l) => <td key={l} className="n">{inc.get(mo)?.get(l) ? M(inc.get(mo)!.get(l)!) : '-'}</td>)}
                    <td className="n">{i ? M(i) : '-'}</td>
                    <td className="n">{M(s)}{!recorded && <span className="sub">estimate</span>}</td>
                    <td className={`n ${i - s < 0 ? 'dn' : 'up'}`}>{M(i - s)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          <p className="sub">
            Income paid every few months is spread over the months it covers. Months with imported bank statements use recorded spending (accounts not imported yet are missing); other months show your estimate until you add real spending.
            {zh ? ' 每半年的分紅會平均攤分到六個月。' : ''}
          </p>
          <details className="add-item"><summary>Add income or spending 加入收支</summary><IeForm f={f} userId={userId} onDone={onReload} /></details>
        </section>

        <CashflowAnalytics f={f} fx={fx} show={show} />

        <BudgetEditor f={f} fx={fx} show={show} userId={userId} onDone={onReload} />

        <Statements f={f} fx={fx} show={show} onDone={onReload} />

        <section className="sub-panel span-2">
          <h3>
            Spending by line 支出明細{' '}
            <select className="fin-year" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </h3>
          <div className="detail-grid">
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Spending</th><th className="n">Year</th><th className="n">A month</th></tr></thead>
              <tbody>
                {lines.map((l) => <tr key={l.line}><td>{l.line}</td><td className="n">{M(l.total)}</td><td className="n">{M(l.total / 12)}</td></tr>)}
                <tr className="total"><td>Total</td><td className="n">{M(lines.reduce((s, l) => s + l.total, 0))}</td><td className="n">{M(lines.reduce((s, l) => s + l.total, 0) / 12)}</td></tr>
              </tbody>
            </table></div>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Income</th><th className="n">Year</th><th className="n">A month</th></tr></thead>
              <tbody>
                {linesIncome.length ? linesIncome.map((l) => <tr key={l.line}><td>{l.line}</td><td className="n">{M(l.total)}</td><td className="n">{M(l.total / 12)}</td></tr>) : <tr><td colSpan={3} className="sub">No income lines for this year.</td></tr>}
              </tbody>
            </table></div>
          </div>
          {oneTime.length > 0 && (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>One-time money out, not counted as spending 一次性</th><th className="n">Year</th></tr></thead>
              <tbody>{oneTime.map((l) => <tr key={l.line}><td>{l.line}</td><td className="n">{M(l.total)}</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="sub">Amounts kept in Hong Kong dollars are shown at today&apos;s rate. The spreadsheet tracked spending until December 2023. Purchases spread over several years count only their share for each year.</p>
        </section>
      </div>
      )}

      {tab === 'bills' && <Bills f={f} show={show} userId={userId} />}

      {tab === 'property' && (
      <div className="detail-grid">
        <section className="sub-panel span-2">
          <h3>Properties 物業</h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Property</th><th>Status</th><th className="n">Our share</th><th className="n">Value</th><th className="n">Our equity</th><th /></tr></thead>
            <tbody>{f.properties.map((p) => <PropertyRow key={p.id} p={p} show={show} onDone={onReload} />)}</tbody>
          </table></div>
        </section>

        <PropertyAnalytics f={f} fx={fx} show={show} />

        <AssessmentChart f={f} show={show} />
      </div>
      )}

      {tab === 'statements' && <FinStatements f={f} userId={userId} onDone={onReload} />}
      {tab === 'plan' && <FinPlan f={f} fx={fx} show={show} userId={userId} onDone={onReload} />}

      {tab === 'history' && (
      <div className="detail-grid">
        <section className="sub-panel span-2">
          <h3>Net worth over time 淨資產走勢</h3>
          <Chart points={history} show={show} />
          <p className="sub">From the old spreadsheet until August 2024, then today. Figures kept in Hong Kong dollars are converted at today&apos;s rate, so older points move a little with the exchange rate. The drop after 2021 reflects the move from Hong Kong and the change in how property was counted.</p>
        </section>

        <HistoryAnalytics f={f} fx={fx} show={show} />

        <section className="sub-panel span-2">
          <h3>Year by year, from the old spreadsheet 歷年概覽</h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Year</th><th className="n">Income</th><th className="n">Passive income</th><th className="n">Spending</th><th className="n">Saved</th><th className="n">Money</th><th className="n">Property</th><th className="n">Debt</th><th className="n">Net worth</th></tr></thead>
            <tbody>
              {yearly.map(([y, r]) => (
                <tr key={y}>
                  <td>{y}</td>
                  {['income', 'passive_income', 'expenses', 'net', 'monetary', 'real_estate', 'debt', 'net_equity'].map((k) => <td key={k} className="n">{r[k] === undefined ? '-' : M(r[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="sub">Yearly figures were kept in Hong Kong dollars and are shown at today&apos;s rate.</p>
        </section>

        <section className="sub-panel span-2">
          <h3>Old balance sheets 舊資產負債表</h3>
          {f.archive.map((a) => (
            <details key={a.id} className="add-item">
              <summary>{a.name}{a.as_of ? ` · ${a.as_of}` : ''}</summary>
              {show ? <ArchiveTable rows={a.data} /> : <p className="sub">Show amounts to see this sheet.</p>}
            </details>
          ))}
          <p className="sub">Kept as they were in the spreadsheet, for reference. Account numbers were removed.</p>
        </section>
      </div>
      )}
    </main>
  )
}
