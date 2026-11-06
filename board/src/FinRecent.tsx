// Recent spending against last year, the budget editor, and the recurring bills page.
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Finance, Fx } from './finance'
import {
  FREQ_LABEL, PER_YEAR, budgetOf, loadRecurring, paymentsFor, periodLabel, recent, saveBudget, saveRecurring, suggestions,
} from './finRecent'
import type { Frequency, Recurring } from './finRecent'

const money = (v: number) => `${v < 0 ? '−' : ''}CA$${Math.abs(v).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
const pct = (x: number | null) => (x === null || !Number.isFinite(x) ? '-' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)}%`)

// ================================================================= last 3 months against the same months last year
export function RecentCompare({ f, fx, show }: { f: Finance; fx: Fx; show: boolean }) {
  const r = useMemo(() => recent(f, fx), [f, fx])
  if (!r) return null
  const M = (v: number) => (show ? money(v) : '••••')
  const flagged = r.rows.filter((x) => x.flag)
  const hasBudget = r.rows.some((x) => x.budget)
  return (
    <section className="sub-panel span-2">
      <h3>Last 3 months 近三個月 <span className="sub inline">{periodLabel(r.now)}, against {periodLabel(r.before)}</span></h3>
      <div className="stats wide fin-stats">
        <div className="stat"><b>{M(r.spendNow)}</b><span>Spending</span></div>
        <div className="stat"><b className={r.spendNow > r.spendBefore ? 'crit' : 'up'}>{pct(r.spendBefore ? (r.spendNow - r.spendBefore) / r.spendBefore : null)}</b><span>Against a year earlier ({M(r.spendBefore)})</span></div>
        <div className="stat"><b>{M(r.incomeNow)}</b><span>Income</span></div>
        <div className="stat"><b className={r.incomeNow < r.incomeBefore ? 'crit' : 'up'}>{pct(r.incomeBefore ? (r.incomeNow - r.incomeBefore) / r.incomeBefore : null)}</b><span>Against a year earlier ({M(r.incomeBefore)})</span></div>
      </div>
      {flagged.length > 0 && (
        <ul className="fin-flags">
          {flagged.map((x) => (
            <li key={x.category} className={x.flag!}>
              <b>{x.category}</b> {x.flag === 'up' ? 'up' : 'down'} {show ? money(Math.abs(x.diff)) : ''} {x.pct !== null ? `(${pct(x.pct)})` : '(from almost nothing a year earlier)'}
            </li>
          ))}
        </ul>
      )}
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Category</th><th className="n">{periodLabel(r.now)}</th><th className="n">A year earlier</th><th className="n">Change</th>{hasBudget && <th className="n">Budget, 3 months</th>}</tr></thead>
        <tbody>
          {r.rows.map((x) => (
            <tr key={x.category} className={x.flag ? `flag-${x.flag}` : ''}>
              <td>{x.category}</td>
              <td className="n">{M(x.now)}</td>
              <td className="n">{M(x.before)}</td>
              <td className={`n ${x.diff > 0 ? 'dn' : x.diff < 0 ? 'up' : ''}`}>{show ? `${x.diff >= 0 ? '+' : '−'}${money(Math.abs(x.diff)).replace('−', '')}` : ''} <span className="sub inline">{pct(x.pct)}</span></td>
              {hasBudget && <td className={`n ${x.budget !== null && x.now > x.budget ? 'dn' : ''}`}>{x.budget !== null ? <>{M(x.budget)}<span className="sub">{x.now > x.budget ? `over by ${show ? money(x.now - x.budget) : ''}` : 'within'}</span></> : '-'}</td>}
            </tr>
          ))}
          <tr className="total"><td>Total spending</td><td className="n">{M(r.spendNow)}</td><td className="n">{M(r.spendBefore)}</td><td className="n">{show ? money(r.spendNow - r.spendBefore) : ''}</td>{hasBudget && <td className="n">{M(r.rows.reduce((s, x) => s + (x.budget ?? 0), 0))}</td>}</tr>
        </tbody>
      </table></div>
      {r.largest.length > 0 && (<>
        <h4>Largest payments in these 3 months 最大支出</h4>
        <ul className="kv">{r.largest.map(({ t, cad }) => <li key={t.id}><span>{t.posted_on} · {t.description} <span className="sub inline">{t.line}</span></span><b>{M(cad)}</b></li>)}</ul>
      </>)}
      <p className="sub">Uses the latest 3 full months that bank statements cover; it moves forward as new statements are added. Only Felix&apos;s RBC and TD accounts are recorded so far. In 2025 the TD Visa spending was one &quot;Card spending, not itemised&quot; line, so categories in that year can look smaller. Set a budget on the Income and spending tab to compare against it here.</p>
    </section>
  )
}

// ================================================================= budget editor
export function BudgetEditor({ f, fx, show, userId, onDone }: { f: Finance; fx: Fx; show: boolean; userId: string; onDone: () => void }) {
  const sugg = useMemo(() => suggestions(f, fx), [f, fx])
  const cur = budgetOf(f.settings)
  const r = useMemo(() => recent(f, fx), [f, fx])
  const cats = [...new Set([...sugg.map((s) => s.category), ...Object.keys(cur)])]
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(cats.map((c) => [c, cur[c] ? String(cur[c]) : ''])))
  const [msg, setMsg] = useState<string | null>(null)
  const M = (x: number) => (show ? money(x) : '••••')
  const useSuggestions = () => setV(Object.fromEntries(cats.map((c) => [c, String(Math.ceil((sugg.find((s) => s.category === c)?.monthly ?? 0) / 10) * 10)])))
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const b = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && Number(x) > 0).map(([k, x]) => [k, Number(x)]))
    setMsg('Saving…')
    try { await saveBudget(userId, f.settings, b); setMsg('Saved.'); onDone() } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  const total = Object.values(v).reduce((s, x) => s + (Number(x) || 0), 0)
  const recentAvg = (c: string) => (r ? (r.rows.find((x) => x.category === c)?.now ?? 0) / r.now.length : 0)
  return (
    <section className="sub-panel span-2">
      <h3>Monthly budget 每月預算</h3>
      <p className="sub">Suggested amounts are the average over the last {sugg[0]?.months ?? 12} recorded months, rounded up to the next CA$10. Change any of them, then save. The Overview compares the last 3 months with this budget.</p>
      <form onSubmit={save}>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Category</th><th className="n">Suggested</th><th className="n">Last 3 months, a month</th><th className="n">Budget a month</th></tr></thead>
          <tbody>
            {cats.map((c) => {
              const s = sugg.find((x) => x.category === c)?.monthly ?? 0
              const avg = recentAvg(c)
              const b = Number(v[c]) || 0
              return (
                <tr key={c}>
                  <td>{c}</td>
                  <td className="n">{M(s)}</td>
                  <td className={`n ${b && avg > b ? 'dn' : ''}`}>{M(avg)}</td>
                  <td className="n"><input className="fin-budget" inputMode="decimal" aria-label={`Budget for ${c}`} value={v[c] ?? ''} placeholder="-" onChange={(e) => setV({ ...v, [c]: e.target.value.replace(/[^0-9.]/g, '') })} /></td>
                </tr>
              )
            })}
            <tr className="total"><td>Total</td><td className="n">{M(sugg.reduce((s, x) => s + x.monthly, 0))}</td><td className="n">{r ? M(r.spendNow / r.now.length) : '-'}</td><td className="n">{M(total)}</td></tr>
          </tbody>
        </table></div>
        <div className="form-row">
          <button type="button" className="btn ghost" onClick={useSuggestions}>Fill with suggestions</button>
          <button type="submit" className="btn">Save budget 儲存</button>
          {msg && <span className="sub" role="status">{msg}</span>}
        </div>
      </form>
      <p className="sub">Suggestions come from Felix&apos;s accounts only until Norina&apos;s are imported, so household budgets may need to be higher. Card spending before December 2025 was not itemised, so it shows as its own category.</p>
    </section>
  )
}

// ================================================================= recurring bills
const CATEGORIES = ['Internet and phone', 'Utilities', 'Property tax', 'Insurance', 'Rental licences', 'Subscriptions', 'Transport', 'Bank fees', 'Other']
const blank = (): Partial<Recurring> & { name: string } => ({ name: '', provider: '', category: 'Internet and phone', place: '', amount: null, frequency: 'monthly', autopay: true, pay_from: '', match: '', note: '', active: true })

function BillForm({ init, userId, onDone, onCancel }: { init: Partial<Recurring> & { name: string }; userId: string; onDone: () => void; onCancel?: () => void }) {
  const [v, setV] = useState(init)
  const [msg, setMsg] = useState<string | null>(null)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    try { await saveRecurring(userId, v); setMsg(null); onDone() } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="hi-edit" onSubmit={save}>
      <label>What<input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Mobile plan" /></label>
      <label>Provider<input value={v.provider ?? ''} onChange={(e) => setV({ ...v, provider: e.target.value })} placeholder="Rogers" /></label>
      <label>For (home or person)<input value={v.place ?? ''} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder="Ruby, or 1934 Nassau Dr" /></label>
      <label>Category<select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Amount each time CA$<input inputMode="decimal" value={v.amount ?? ''} onChange={(e) => setV({ ...v, amount: e.target.value === '' ? null : Number(e.target.value.replace(/[^0-9.]/g, '')) })} /></label>
      <label>How often<select value={v.frequency} onChange={(e) => setV({ ...v, frequency: e.target.value as Frequency })}>{(Object.keys(FREQ_LABEL) as Frequency[]).map((k) => <option key={k} value={k}>{FREQ_LABEL[k]}</option>)}</select></label>
      <label>Paid from<input value={v.pay_from ?? ''} onChange={(e) => setV({ ...v, pay_from: e.target.value })} placeholder="TD Visa" /></label>
      <label>Auto-pay<select value={v.autopay === null || v.autopay === undefined ? '' : v.autopay ? 'y' : 'n'} onChange={(e) => setV({ ...v, autopay: e.target.value === '' ? null : e.target.value === 'y' })}><option value="">Not sure</option><option value="y">Yes</option><option value="n">No</option></select></label>
      <label>Statement text to match<input value={v.match ?? ''} onChange={(e) => setV({ ...v, match: e.target.value })} placeholder="ROGERS" /></label>
      <label className="wide">Note<input value={v.note ?? ''} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
      <div className="form-row">
        <button type="submit" className="btn">Save 儲存</button>
        {v.id && <button type="button" className="btn ghost" onClick={() => setV({ ...v, active: !v.active })}>{v.active ? 'Mark as stopped' : 'Mark as active'}</button>}
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        {msg && <span className="sub" role="status">{msg}</span>}
      </div>
    </form>
  )
}

export function Bills({ f, show, userId }: { f: Finance; show: boolean; userId: string }) {
  const [list, setList] = useState<Recurring[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [edit, setEdit] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { loadRecurring().then(setList, (e) => setErr((e as Error).message)) }, [tick])
  const reload = () => { setEdit(null); setTick((t) => t + 1) }
  const M = (v: number) => (show ? money(v) : '••••')
  if (err) return <p className="problem">Could not load bills: {err}</p>
  if (!list) return <p className="empty">Loading…</p>
  const active = list.filter((r) => r.active)
  const yearly = (r: Recurring) => (r.amount ?? 0) * PER_YEAR[r.frequency]
  const totalYear = active.reduce((s, r) => s + yearly(r), 0)
  const cats = [...new Set(active.map((r) => r.category))].sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b))
  const places = [...new Set(active.map((r) => r.place || 'Not set'))]
  const missing = active.filter((r) => !r.place || r.amount === null).length
  return (
    <div className="detail-grid">
      <div className="stats wide fin-stats span-2">
        <div className="stat"><b>{M(totalYear / 12)}</b><span>Recurring bills a month, on average</span></div>
        <div className="stat"><b>{M(totalYear)}</b><span>A year</span></div>
        <div className="stat"><b>{active.length}</b><span>Active bills</span></div>
        <div className="stat"><b className={missing ? 'warn' : ''}>{missing}</b><span>Missing who or how much</span></div>
      </div>

      {cats.map((c) => (
        <section key={c} className="sub-panel span-2">
          <h3>{c} <span className="sub inline">{M(active.filter((r) => r.category === c).reduce((s, r) => s + yearly(r), 0) / 12)} a month</span></h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Bill</th><th>For</th><th className="n">Amount</th><th className="n">A year</th><th>Last paid</th><th className="n">Last 12 months paid</th><th /></tr></thead>
            <tbody>
              {active.filter((r) => r.category === c).map((r) => {
                const pays = paymentsFor(f, r)
                const last = pays[pays.length - 1]
                const lastDate = last?.posted_on
                const from = lastDate ? new Date(new Date(lastDate).getTime() - 365 * 86400000).toISOString().slice(0, 10) : ''
                const paid12 = pays.filter((p) => p.posted_on > from).reduce((s, p) => s - p.amount, 0)
                const twoYears = pays.length > 0 && lastDate !== undefined && (new Date(lastDate).getTime() - new Date(pays[0].posted_on).getTime()) / 86400000 > 700
                const prevYear = !twoYears ? 0 : pays.filter((p) => p.posted_on <= from && p.posted_on > new Date(new Date(from).getTime() - 365 * 86400000).toISOString().slice(0, 10)).reduce((s, p) => s - p.amount, 0)
                return [
                  <tr key={r.id}>
                    <td>{r.name}<span className="sub">{[r.provider, r.pay_from, r.autopay ? 'auto-pay' : r.autopay === false ? 'paid by hand' : ''].filter(Boolean).join(' · ')}</span></td>
                    <td>{r.place || <span className="pill out">Not set</span>}</td>
                    <td className="n">{r.amount !== null ? M(r.amount) : <span className="pill out">Not set</span>}<span className="sub">{FREQ_LABEL[r.frequency]}</span></td>
                    <td className="n">{r.amount !== null ? M(yearly(r)) : '-'}</td>
                    <td>{last ? <>{lastDate}<span className="sub">{M(-last.amount)}</span></> : <span className="sub">Not in statements</span>}</td>
                    <td className="n">{pays.length ? M(paid12) : '-'}{prevYear > 0 && <span className={`sub ${paid12 > prevYear ? 'dn' : 'up'}`}>{pct((paid12 - prevYear) / prevYear)} on the year before</span>}</td>
                    <td><button type="button" className="act" aria-expanded={edit === r.id} onClick={() => setEdit(edit === r.id ? null : r.id)}>{edit === r.id ? 'Close' : 'Edit'}</button></td>
                  </tr>,
                  r.note && edit !== r.id ? <tr key={`${r.id}n`} className="note-row"><td colSpan={7} className="sub">{r.note}</td></tr> : null,
                  edit === r.id ? <tr key={`${r.id}e`}><td colSpan={7}><BillForm init={r} userId={userId} onDone={reload} onCancel={() => setEdit(null)} /></td></tr> : null,
                ]
              })}
            </tbody>
          </table></div>
        </section>
      ))}

      <section className="sub-panel span-2">
        <h3>By home or person 按物業或人</h3>
        <ul className="kv">
          {places.map((p) => {
            const rs = active.filter((r) => (r.place || 'Not set') === p)
            return <li key={p}><span>{p} <span className="sub inline">{rs.map((r) => `${r.name}${r.provider ? ` (${r.provider})` : ''}`).join(', ')}</span></span><b>{M(rs.reduce((s, r) => s + yearly(r), 0) / 12)} a month</b></li>
          })}
        </ul>
      </section>

      {(() => {
        const qs = (f.settings as { open_questions?: { key: string; text: string }[] }).open_questions ?? []
        return qs.length ? (
          <section className="sub-panel span-2">
            <h3>Open questions 待確認 <span className="sub inline">{qs.length} to answer</span></h3>
            <ol className="fin-questions">{qs.map((q) => <li key={q.key}>{q.text}</li>)}</ol>
            <p className="sub">Answer them by editing the bills above, or tell Claude and the list will be updated.</p>
          </section>
        ) : null
      })()}

      <section className="sub-panel span-2">
        <details className="add-item"><summary>Add a bill 加入</summary><BillForm init={blank()} userId={userId} onDone={reload} /></details>
        {list.some((r) => !r.active) && <p className="sub">Stopped: {list.filter((r) => !r.active).map((r) => r.name).join(', ')}</p>}
        <p className="sub">&quot;Last paid&quot; and &quot;Last 12 months paid&quot; come from the bank statements, found by the statement text to match (for example ROGERS). The list started from bills that repeat in Felix&apos;s statements; add anything paid from other accounts.</p>
      </section>
    </div>
  )
}
