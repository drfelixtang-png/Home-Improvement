// Finance overview: what needs action, a decision, or watching. Issues come from finIssues.ts.
import { useMemo, useState } from 'react'
import { vanDate } from './me'
import type { Finance, Fx } from './finance'
import { findIssues } from './finIssues'
import type { Issue, Level } from './finIssues'
import { useItems } from './itemHooks'
import { downloadBackup } from './backup'
import { saveFinSettings } from './finance'
import { RecentCompare } from './FinRecent'

const LEVEL: Record<Level, { label: string; zh: string; note: string }> = {
  act: { label: 'Act now', zh: '需要處理', note: 'Something to do, usually quick.' },
  decide: { label: 'Decide', zh: '需要決定', note: 'A choice only you can make.' },
  watch: { label: 'Watch', zh: '留意', note: 'No action yet; keep an eye on it.' },
}
const TAB_NAME: Record<string, string> = { overview: 'Overview', networth: 'Net worth', investments: 'Investments', accounts: 'Accounts', cashflow: 'Income and spending', property: 'Property', history: 'History', bills: 'Bills', plan: 'Retirement', statements: 'Statements' }

function money(v: number): string {
  return `${v < 0 ? '−' : ''}CA$${Math.abs(v).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
}
const in30 = () => new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' })

function IssueCard({ i, show, hidden }: { i: Issue; show: boolean; hidden: boolean }) {
  const { mark, undo } = useItems()
  const M = (v: number) => (show ? money(v) : '••••')
  return (
    <li className={`fin-issue ${i.level} ${hidden ? 'is-hidden' : ''}`}>
      <div className="fin-issue-head">
        <span className={`pill lvl-${i.level}`}>{LEVEL[i.level].label}</span>
        <span className="sub inline">{i.area}</span>
      </div>
      <b className="fin-issue-title">{i.title}</b>
      <p className="sub">{i.detail(M)}</p>
      <p className="fin-issue-action"><span className="lbl">What to do</span> {i.action}</p>
      <div className="fin-issue-acts">
        <a className="act" href={`#/finance/${i.tab}`}>Open {TAB_NAME[i.tab] ?? i.tab} →</a>
        {hidden ? (
          <button type="button" className="act" onClick={() => undo(i.key)}>Show again</button>
        ) : (<>
          <button type="button" className="act" onClick={() => mark(i.key, i.title, 'done')} title="Hide until the situation changes">Done</button>
          <button type="button" className="act" onClick={() => mark(i.key, i.title, 'snoozed', in30())}>Hide 30 days</button>
        </>)}
      </div>
    </li>
  )
}

function BackupBox({ f, userId, onDone }: { f: Finance; userId: string; onDone: () => void }) {
  const [msg, setMsg] = useState<string | null>(null)
  const last = (f.settings as { last_backup?: string }).last_backup
  const run = async () => {
    setMsg('Preparing…')
    try {
      const r = await downloadBackup((m) => setMsg(m))
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' })
      await saveFinSettings(userId, f.settings, { last_backup: today } as Partial<Finance['settings']>)
      setMsg(`Saved ${r.file}: ${r.rows.toLocaleString('en-CA')} rows from ${r.tables} tables.`)
      onDone()
    } catch (e) { setMsg(`Could not make the backup: ${(e as Error).message}`) }
  }
  return (
    <section className="sub-panel span-2">
      <h3>Backup 備份 <span className="sub inline">{last ? `last downloaded ${last}` : 'never downloaded'}</span></h3>
      <div className="form-row">
        <button type="button" className="btn" onClick={run}>Download backup 下載備份</button>
        {msg && <span className="sub" role="status">{msg}</span>}
      </div>
      <p className="sub">One file with all your board, finance and stockpile data. Keep it somewhere private, such as your computer or your own Google Drive, and keep a few older copies. The database plan does not make backups, so this file is the only copy outside the database.</p>
    </section>
  )
}

export function FinOverview({ f, fx, show, userId, onReload }: { f: Finance; fx: Fx; show: boolean; userId: string; onReload: () => void }) {
  const today = vanDate()
  const { isHidden } = useItems()
  const [showHidden, setShowHidden] = useState(false)
  const { issues, good } = useMemo(() => findIssues(f, fx, today), [f, fx, today])
  const open = issues.filter((i) => !isHidden(i.key))
  const hidden = issues.filter((i) => isHidden(i.key))
  const M = (v: number) => (show ? money(v) : '••••')
  const count = (l: Level) => open.filter((i) => i.level === l).length
  return (<>
    <div className="stats wide fin-stats">
      {(['act', 'decide', 'watch'] as Level[]).map((l) => (
        <div key={l} className="stat"><b className={l === 'act' && count(l) ? 'crit' : l === 'decide' && count(l) ? 'warn' : ''}>{count(l)}</b><span>{LEVEL[l].label} {LEVEL[l].zh}</span></div>
      ))}
    </div>

    <div className="detail-grid">
      <RecentCompare f={f} fx={fx} show={show} />

      {(['act', 'decide', 'watch'] as Level[]).map((l) => {
        const list = open.filter((i) => i.level === l)
        return (
          <section key={l} className={`sub-panel span-2 fin-level ${l}`}>
            <h3>{LEVEL[l].label} {LEVEL[l].zh} <span className="sub inline">{LEVEL[l].note}</span></h3>
            {list.length ? <ul className="fin-issues">{list.map((i) => <IssueCard key={i.key} i={i} show={show} hidden={false} />)}</ul> : <p className="all-clear">Nothing here.</p>}
          </section>
        )
      })}

      {good.length > 0 && (
        <section className="sub-panel span-2">
          <h3>Going well 做得好</h3>
          <ul className="kv">{good.map((g) => <li key={g.title}><span>{g.title}</span><span className="sub inline">{g.detail(M)}</span></li>)}</ul>
        </section>
      )}

      {hidden.length > 0 && (
        <section className="sub-panel span-2">
          <button type="button" className="btn ghost" aria-expanded={showHidden} onClick={() => setShowHidden(!showHidden)}>{showHidden ? 'Hide' : 'Show'} {hidden.length} done or hidden</button>
          {showHidden && <ul className="fin-issues">{hidden.map((i) => <IssueCard key={i.key} i={i} show={show} hidden />)}</ul>}
        </section>
      )}
      <BackupBox f={f} userId={userId} onDone={onReload} />

      <p className="sub span-2">Worked out from the figures on the other tabs each time the page opens. &quot;Done&quot; hides an issue until its numbers change enough to make it a new one; &quot;Hide 30 days&quot; brings it back after a month.</p>
    </div>
  </>)
}
