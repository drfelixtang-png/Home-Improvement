// Finance, Statements tab: which statements are imported, missing or due, by account.
import { useMemo, useState } from 'react'
import { vanDate } from './me'
import { ownerName } from './finance'
import type { Finance } from './finance'
import { tracker, updateSource } from './finStatements'
import type { MonthState, SourceStatus } from './finStatements'

const STATE: Record<SourceStatus['state'], { label: string; cls: string }> = {
  ok: { label: 'Up to date', cls: 'up' },
  uploaded: { label: 'Uploaded, waiting to import', cls: '' },
  due: { label: 'New statement ready', cls: 'warn' },
  late: { label: 'Overdue', cls: 'crit' },
  closed: { label: 'Closed', cls: '' },
}
const CELL: Record<MonthState, string> = {
  covered: 'Imported', missing: 'Missing', quiet: 'No statement (probably no activity)', due: 'Ready to download', future: 'Not out yet', before: 'Not tracked',
}
const KIND_LABEL = { bank: 'Bank', card: 'Credit card', investing: 'Investing', business: 'Business' }
const fmt = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'none yet')
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })

// Group consecutive months into ranges, for example "Jan 2024 to Dec 2024".
function ranges(ms: string[]): string {
  const out: string[] = []
  let a = ms[0], b = ms[0]
  const next = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }
  for (const m of ms.slice(1).concat([''])) {
    if (m && m === next(b)) { b = m; continue }
    if (a) out.push(a === b ? monthName(a) : `${monthName(a)} to ${monthName(b)}`)
    a = m; b = m
  }
  return out.join('; ')
}

function Row({ x, f, userId, onDone, today }: { x: SourceStatus; f: Finance; userId: string; onDone: () => void; today: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  const act = async (patch: Parameters<typeof updateSource>[3], done: string) => {
    setMsg('Saving…')
    try { await updateSource(userId, f, x.s.key, patch); setMsg(done); onDone() } catch (e) { setMsg(`Could not save: ${(e as Error).message}`) }
  }
  const st = STATE[x.state]
  return (
    <tr className={x.state === 'closed' ? 'muted' : ''}>
      <td>{x.s.label}<span className="sub">{ownerName(x.s.owner)} · {KIND_LABEL[x.s.kind]}{x.s.note ? ` · ${x.s.note}` : ''}</span></td>
      <td><span className={`pill ${st.cls ? `lvl-${st.cls === 'crit' ? 'act' : st.cls === 'warn' ? 'decide' : 'watch'}` : ''}`}>{st.label}</span>
        <span className="sub">{x.state === 'due' || x.state === 'late' ? `Statement to ${fmt(x.lastEnd)}${x.daysLate ? `, ${x.daysLate} days ago` : ''}` : x.state === 'ok' ? `Next around ${fmt(x.nextEnd)}` : x.state === 'uploaded' ? `Uploaded ${fmt(x.s.uploaded_on ?? null)}` : x.s.closed_on ? `Closed ${fmt(x.s.closed_on)}` : ''}</span></td>
      <td className="mono">{fmt(x.coveredTo)}</td>
      <td>
        <div className="stmt-strip" aria-label={`Last 36 months for ${x.s.label}`}>
          {x.months.map((c) => <span key={c.m} className={`sc ${c.st}`} title={`${monthName(c.m)}: ${CELL[c.st]}`} />)}
        </div>
        {x.missing.length > 0 && <span className="sub">Missing: {ranges(x.missing)}</span>}
      </td>
      <td>
        {x.state !== 'closed' && (x.state === 'due' || x.state === 'late') && <button type="button" className="act" onClick={() => act({ uploaded_on: today }, 'Marked as uploaded.')}>I uploaded it</button>}
        {x.state === 'uploaded' && <button type="button" className="act" onClick={() => act({ uploaded_on: null }, 'Undone.')}>Undo</button>}
        {x.state !== 'closed'
          ? <button type="button" className="act" onClick={() => { if (window.confirm(`Mark ${x.s.label} as closed from today? It stops asking for statements.`)) act({ active: false, closed_on: today }, 'Marked closed.') }}>Closed</button>
          : <button type="button" className="act" onClick={() => act({ active: true, closed_on: null }, 'Reopened.')}>Reopen</button>}
        {msg && <span className="sub" role="status">{msg}</span>}
      </td>
    </tr>
  )
}

export function FinStatements({ f, userId, onDone }: { f: Finance; userId: string; onDone: () => void }) {
  const today = vanDate()
  const t = useMemo(() => tracker(f, today), [f, today])
  if (!t.list.length) return <section className="sub-panel span-2"><p className="sub">No statement sources are set up yet.</p></section>
  const order: Record<SourceStatus['state'], number> = { late: 0, due: 1, uploaded: 2, ok: 3, closed: 4 }
  const list = [...t.list].sort((a, b) => order[a.state] - order[b.state] || a.s.label.localeCompare(b.s.label))
  return (
    <div className="detail-grid">
      <section className="sub-panel span-2">
        <h3>Statements 月結單 <span className="sub inline">checked against today&apos;s date each time the page opens</span></h3>
        <div className="stats wide fin-stats">
          <div className="stat"><b className={t.late.length ? 'crit' : ''}>{t.late.length}</b><span>Overdue</span></div>
          <div className="stat"><b className={t.due.length - t.late.length ? 'warn' : ''}>{t.due.length - t.late.length}</b><span>New statement ready</span></div>
          <div className="stat"><b>{t.uploaded.length}</b><span>Uploaded, waiting to import</span></div>
          <div className="stat"><b>{t.gaps}</b><span>Missing months in total</span></div>
        </div>
        {t.due.length > 0 && (
          <p className="fin-issue-action"><span className="lbl">To do</span> Download {t.due.map((x) => x.s.label).join(', ')} from online banking, put the PDFs in a subfolder of &quot;Temp Bank Statement Input&quot; on Google Drive, press &quot;I uploaded it&quot;, and ask Claude to import them.</p>
        )}
        <div className="tbl-wrap"><table className="tbl stmt-tbl">
          <thead><tr><th>Account</th><th>Status</th><th>Imported to</th><th>Last 36 months</th><th /></tr></thead>
          <tbody>{list.map((x) => <Row key={x.s.key} x={x} f={f} userId={userId} onDone={onDone} today={today} />)}</tbody>
        </table></div>
        <div className="legend sub">
          {(['covered', 'due', 'missing', 'quiet', 'future'] as MonthState[]).map((k) => <span key={k} className="leg-item"><span className={`sc ${k}`} />{CELL[k]}</span>)}
        </div>
        <p className="sub">A statement counts as ready a few days after its period ends. Credit cards usually issue no statement in a month with no activity, so those gaps are shown in grey rather than as missing. Claude updates the &quot;Imported to&quot; dates after each import; &quot;I uploaded it&quot; quiets the reminder until then.</p>
      </section>
    </div>
  )
}
