// Accounts tab: cash yield check.
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ownerName } from './finance'
import type { Cur, Finance, Fx } from './finance'
import { saveAccountRate, yieldCheck } from './finYield'
import type { YieldRow } from './finYield'

const money = (v: number) => `${v < 0 ? '−' : ''}CA$${Math.abs(v).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
const SYM: Record<Cur, string> = { CAD: 'CA$', USD: 'US$', HKD: 'HK$' }
const orig = (v: number, c: Cur) => `${SYM[c]}${Math.round(v).toLocaleString('en-CA')}`
const pc = (v: number | null) => (v === null ? '?' : `${v < 0.1 && v > 0 ? v.toFixed(2) : v.toFixed(2).replace(/0$/, '')}%`)

function RateEdit({ r, f, userId, onDone }: { r: YieldRow; f: Finance; userId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [rate, setRate] = useState(r.basis === 'entered' && r.rate !== null ? String(r.rate) : '')
  const [keep, setKeep] = useState(r.keep && !r.everyday ? String(r.keep) : '')
  const [msg, setMsg] = useState<string | null>(null)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await saveAccountRate(userId, f, r.a.id, { rate: rate === '' ? null : Number(rate), keep: keep === '' ? 0 : Number(keep) })
      setOpen(false); onDone()
    } catch (err) { setMsg((err as Error).message) }
  }
  if (r.everyday) return null
  if (!open) return <button type="button" className="act" onClick={() => setOpen(true)}>{r.basis === 'unknown' ? 'Enter rate' : 'Edit'}</button>
  return (
    <form className="fin-inline" onSubmit={save}>
      <input aria-label={`Interest rate for ${r.a.institution} ${r.a.name}, percent a year`} placeholder="Rate %" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} />
      <input aria-label={`Amount to keep in ${r.a.institution} ${r.a.name} for bills`} placeholder="Keep for bills" inputMode="decimal" value={keep} onChange={(e) => setKeep(e.target.value.replace(/[^0-9.]/g, ''))} />
      <button type="submit" className="act">Save</button>
      <button type="button" className="act" onClick={() => setOpen(false)}>Close</button>
      {msg && <span className="problem">{msg}</span>}
    </form>
  )
}

export function YieldCheck({ f, fx, show, userId, onDone }: { f: Finance; fx: Fx; show: boolean; userId: string; onDone: () => void }) {
  const y = useMemo(() => yieldCheck(f, fx), [f, fx])
  const M = (v: number) => (show ? money(v) : '••••')
  if (!y.rows.length) return null
  const b = y.bench
  return (
    <section className="sub-panel span-2">
      <h3>Cash yield check 現金利息檢查 <span className="sub inline">{b ? `comparison rates checked ${b.as_of}` : 'no comparison rates saved yet'}</span></h3>
      <div className="stats wide fin-stats">
        <div className="stat"><b className={y.extraCad > 300 ? 'warn' : ''}>{M(y.extraCad)}</b><span>More a year at the rates below</span></div>
        {b && <div className="stat"><b>{pc(b.CAD.savings)}</b><span>Savings, no fee: {b.CAD.savings_who}</span></div>}
        {b && <div className="stat"><b>{pc(b.CAD.gic1y)}</b><span>1-year GIC: {b.CAD.gic1y_who}</span></div>}
        {b?.HKD && <div className="stat"><b>{pc(b.HKD.td3m)}</b><span>HKD 3-month deposit: {b.HKD.td3m_who}</span></div>}
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Account</th><th className="n">Balance</th><th className="n">Earns now</th><th className="n">Could earn</th><th className="n">More a year</th><th /></tr></thead>
        <tbody>
          {y.rows.map((r) => (
            <tr key={r.a.id} className={r.everyday ? 'muted' : ''}>
              <td>{ownerName(r.a.owner)} · {r.a.institution} {r.a.name}
                <span className="sub">{r.everyday ? 'Everyday account for bills, not compared' : r.keep ? `${orig(r.keep, r.a.currency)} kept for bills` : r.a.kind === 'gic' ? 'GIC or term deposit' : 'Savings'}</span></td>
              <td className="n">{show ? orig(r.balance, r.a.currency) : '••••'}</td>
              <td className="n">{r.everyday && r.rate === null ? '-' : pc(r.rate)}<span className="sub">{r.basis === 'statement' ? `from statements${r.interest12 !== null && show ? `, ${orig(r.interest12, r.a.currency)} in ${r.months} months` : ''}` : r.basis === 'entered' ? 'rate entered' : r.everyday ? '' : 'rate not known'}</span></td>
              <td className="n">{r.everyday ? '-' : pc(r.bench)}{!r.everyday && r.benchWho && <span className="sub">{r.benchWho}</span>}</td>
              <td className={`n ${r.extraYearCad > 100 ? 'warn' : ''}`}>{r.everyday ? '-' : r.basis === 'unknown' ? '?' : M(r.extraYearCad)}</td>
              <td><RateEdit r={r} f={f} userId={userId} onDone={onDone} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="sub">&quot;Earns now&quot; is worked out from the interest on the imported statements over the last 12 months, divided by today&apos;s balance, or from a rate you enter. &quot;Could earn&quot; is a good current rate from a CDIC-covered institution (up to CA$100,000 per person per institution) for Canadian dollars, or a standard Hong Kong bank time deposit for Hong Kong dollars. Chequing accounts are left out because they hold money for bills. Rates change often: check the institution before moving money, and keep the deposit insurance limit in mind.{b?.note ? ` ${b.note}` : ''}</p>
      {b?.sources?.length ? <p className="sub">Rates from: {b.sources.map((s, i) => <span key={s.url}>{i ? ', ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</p> : null}
    </section>
  )
}
