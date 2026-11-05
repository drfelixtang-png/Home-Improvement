import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { shortDate } from './format'
import { vanDate } from './me'
import {
  addIe, addMonth, ieYears, mix, monthly, monthsBack, netWorth, saveBalances, saveFinSettings,
  sumMap, toCad, updateProperty, yearLines,
} from './finance'
import type { AccountKind, Cur, Finance, FinProperty, Fx } from './finance'

type Lang = 'zh' | 'en'

const SHOW_KEY = 'morning-board-finance-show'
const KIND: Record<AccountKind, [string, string]> = {
  cash: ['Cash', '現金'], gic: ['GIC', '定期'], investment: ['Investment', '投資'],
  credit_card: ['Credit card', '信用卡'], loan: ['Loan', '貸款'], other: ['Other', '其他'],
}
const OWNER: Record<string, string> = { felix: 'Felix', norina: 'Norina', joint: 'Joint' }
const STATUS: Record<FinProperty['status'], string> = { held: 'Owned', sold: 'Sold', operated: 'Run, not owned' }

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
  const active = f.accounts.filter((a) => a.active)
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
            <span>{OWNER[a.owner] ?? a.owner} · {a.institution} {a.name}{a.currency !== 'CAD' ? ` (${a.currency})` : ''}</span>
            <input inputMode="decimal" value={vals[a.id] ?? ''} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value.replace(/[^0-9.-]/g, '') })} />
          </label>
        ))}
      </div>
      <div className="form-row"><button type="submit" className="btn">Save snapshot 儲存</button><span className="sub inline">Accounts total {money(total)}</span>{msg && <span className="sub" role="status">{msg}</span>}</div>
    </form>
  )
}

function IeForm({ f, userId, onDone }: { f: Finance; userId: string; onDone: () => void }) {
  const lastMonth = addMonth(vanDate().slice(0, 7), -1)
  const [v, setV] = useState({ month: lastMonth, kind: 'income' as 'income' | 'expense', line: 'Nassau Airbnb', amount: '', currency: 'CAD' as Cur, covers: '1', note: '' })
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
      <label>Spread over months<input type="number" min={1} max={24} value={v.covers} onChange={(e) => setV({ ...v, covers: e.target.value })} /></label>
      <label className="wide">Note<input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
      <div className="form-row"><button type="submit" className="btn">Add 加入</button>{msg && <span className="sub" role="status">{msg}</span>}</div>
      <p className="sub wide">For the E 41st Ave share paid about every 6 months, type the whole payment in the month it arrived and spread it over 6 months.</p>
    </form>
  )
}

function SpendForm({ f, userId, fx, onDone }: { f: Finance; userId: string; fx: Fx; onDone: () => void }) {
  const est = f.settings.spending_estimate
  const [v, setV] = useState(String(est?.monthly ?? ''))
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await saveFinSettings(userId, f.settings, { spending_estimate: { monthly: Number(v), currency: 'CAD', source: `Set by Felix on ${vanDate()}` } })
      setMsg('Saved.'); onDone()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="fin-inline" onSubmit={submit}>
      <label>Monthly spending CA$ <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
      <button type="submit" className="btn ghost">Save</button>
      {msg && <span className="sub inline" role="status">{msg}</span>}
      {est && est.currency !== 'CAD' && <span className="sub">{money(toCad(est.monthly, est.currency, fx))}</span>}
    </form>
  )
}

function PropertyRow({ p, show, onDone }: { p: FinProperty; show: boolean; onDone: () => void }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState({ value: String(p.value ?? ''), source: p.value_source, as_of: p.value_as_of ?? '' })
  const [msg, setMsg] = useState<string | null>(null)
  const M = (x: number | null) => (x === null ? '-' : show ? money(x) : '••••')
  const save = async (e: FormEvent) => {
    e.preventDefault()
    try { await updateProperty(p.id, { value: v.value === '' ? null : Number(v.value), value_source: v.source, value_as_of: v.as_of || null }); setEdit(false); onDone() } catch (err) { setMsg((err as Error).message) }
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
          <div className="form-row"><button type="submit" className="btn">Save 儲存</button>{msg && <span className="problem">{msg}</span>}</div>
        </form>
      </td></tr>
    )}
  </>)
}

// ================================================================= page
export function FinancePage({ f, fx, userId, onReload, lang }: { f: Finance; fx: Fx; userId: string; onReload: () => void; lang: Lang }) {
  const [show, setShowState] = useState(() => { try { return localStorage.getItem(SHOW_KEY) === '1' } catch { return false } })
  const setShow = (v: boolean) => { setShowState(v); try { localStorage.setItem(SHOW_KEY, v ? '1' : '0') } catch { /* this visit only */ } }
  const [snapOpen, setSnapOpen] = useState(false)
  const years = useMemo(() => ieYears(f), [f])
  const [year, setYear] = useState<number>(() => years.find((y) => y < 2024) ?? years[0] ?? 2023)
  const M = (v: number) => (show ? money(v) : '••••')
  const zh = lang === 'zh'

  const w = useMemo(() => netWorth(f, fx), [f, fx])
  const est = f.settings.spending_estimate
  const spend = est ? toCad(est.monthly, est.currency, fx) : 0
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

  const owners = [...new Set(f.accounts.map((a) => a.owner))]
  const latest = new Map<string, { amount: number; as_of: string }>()
  for (const b of f.balances) { const c = latest.get(b.account_id); if (!c || b.as_of > c.as_of) latest.set(b.account_id, b) }

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
          <button type="button" className="btn" aria-expanded={snapOpen} onClick={() => setSnapOpen(!snapOpen)}>{snapOpen ? 'Close' : 'New snapshot 更新結餘'}</button>
        </div>
      </div>

      <div className="stats wide fin-stats">
        <div className="stat"><b>{M(w.total)}</b><span>Net worth 淨資產</span></div>
        <div className="stat"><b>{M(w.accounts)}</b><span>Bank and investment accounts</span></div>
        <div className="stat"><b>{M(w.property)}</b><span>Property, our share</span></div>
        <div className="stat"><b>{M(avgIncome)}</b><span>Income a month, last {started.length || 12} months</span></div>
        <div className="stat"><b className={lastMonths < 60 ? 'warn' : ''}>{Number.isFinite(lastMonths) ? `${Math.floor(lastMonths / 12)} y ${Math.round(lastMonths % 12)} m` : 'No gap'}</b><span>Cash and GICs last, at the current gap</span></div>
      </div>

      {snapOpen && <section className="sub-panel"><h3>New snapshot 更新結餘</h3><SnapshotForm f={f} fx={fx} userId={userId} onDone={onReload} /></section>}

      <div className="detail-grid">
        <section className="sub-panel">
          <h3>What we own 資產組成</h3>
          <ul className="kv">
            {w.properties.map(({ p, equity }) => <li key={p.id}><span>{p.address}{p.share < 1 ? ` (${Math.round(p.share * 100)}%)` : ''}</span><b>{M(equity)}</b></li>)}
            {w.byOwner.map((o) => <li key={o.owner}><span>{OWNER[o.owner] ?? o.owner}&apos;s accounts</span><b>{M(o.total)}</b></li>)}
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
          <SpendForm f={f} userId={userId} fx={fx} onDone={onReload} />
          <span className="sub">{est?.source}</span>
        </section>

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
            Shared income from E 41st Ave is spread over the 6 months it covers. Spending shows your estimate until you add real spending for a month.
            {zh ? ' 每半年的分紅會平均攤分到六個月。' : ''}
          </p>
          <details className="add-item"><summary>Add income or spending 加入收支</summary><IeForm f={f} userId={userId} onDone={onReload} /></details>
        </section>

        <section className="sub-panel span-2">
          <h3>Accounts 戶口 <span className="sub inline">no account numbers are stored</span></h3>
          <div className="detail-grid">
            {owners.map((o) => {
              const list = f.accounts.filter((a) => a.owner === o && a.active)
              const total = list.reduce((s, a) => s + (latest.has(a.id) ? toCad(latest.get(a.id)!.amount, a.currency, fx) : 0), 0)
              return (
                <div key={o} className="tbl-wrap">
                  <h4>{OWNER[o] ?? o} · {M(total)}</h4>
                  <table className="tbl">
                    <thead><tr><th>Account</th><th>Type</th><th className="n">Balance</th></tr></thead>
                    <tbody>
                      {list.map((a) => {
                        const b = latest.get(a.id)
                        return (
                          <tr key={a.id}>
                            <td>{a.institution} {a.name}{a.note && <span className="sub">{a.note}</span>}</td>
                            <td><span className={`pill k-${a.kind}`}>{KIND[a.kind][0]}</span></td>
                            <td className="n">{b ? (show ? orig(b.amount, a.currency) : '••••') : '-'}{b && a.currency !== 'CAD' && show && <span className="sub">{money(toCad(b.amount, a.currency, fx))}</span>}</td>
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

        <section className="sub-panel span-2">
          <h3>Properties 物業</h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Property</th><th>Status</th><th className="n">Our share</th><th className="n">Value</th><th className="n">Our equity</th><th /></tr></thead>
            <tbody>{f.properties.map((p) => <PropertyRow key={p.id} p={p} show={show} onDone={onReload} />)}</tbody>
          </table></div>
        </section>

        <section className="sub-panel span-2">
          <h3>Net worth over time 淨資產走勢</h3>
          <Chart points={history} show={show} />
          <p className="sub">From the old spreadsheet until August 2024, then today. Figures kept in Hong Kong dollars are converted at today&apos;s rate, so older points move a little with the exchange rate. The drop after 2021 reflects the move from Hong Kong and the change in how property was counted.</p>
        </section>

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
          <p className="sub">Amounts kept in Hong Kong dollars are shown at today&apos;s rate. The spreadsheet tracked spending until December 2023.</p>
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
    </main>
  )
}
