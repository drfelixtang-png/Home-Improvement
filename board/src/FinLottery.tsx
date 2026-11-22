import { useEffect, useMemo, useState } from 'react'
import { GAME, loadLotto, results, setPrize, totals } from './lotto'
import type { Game, LottoDraw, LottoPlay, Result } from './lotto'

const cad = (v: number) => `${v < 0 ? '−' : ''}CA$${Math.abs(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

function Balls({ nums, mine, extra, extraLabel, extraHit }: { nums: number[]; mine: number[]; extra?: number | null; extraLabel?: string; extraHit?: boolean }) {
  return (
    <span className="balls">
      {[...nums].sort((a, b) => a - b).map((n) => <span key={n} className={`ball ${mine.includes(n) ? 'hit' : ''}`}>{n}</span>)}
      {extra !== null && extra !== undefined && <span className={`ball extra ${extraHit ? 'hit' : ''}`} title={extraLabel}>{extra}</span>}
    </span>
  )
}

function PrizeEdit({ r, onDone }: { r: Result; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState(r.draw.my_prize === null ? '' : String(r.draw.my_prize))
  const [note, setNote] = useState(r.draw.note)
  const [msg, setMsg] = useState<string | null>(null)
  const save = async () => {
    setMsg('Saving…')
    try { await setPrize(r.draw.id, v.trim() === '' ? null : Number(v), note); setMsg(null); setOpen(false); onDone() } catch (e) { setMsg(`Could not save: ${(e as Error).message}`) }
  }
  if (!open) return <button type="button" className="linkish" onClick={() => setOpen(true)}>{r.draw.my_prize !== null ? 'Change prize' : r.shared ? 'Enter prize' : 'Other prize?'}</button>
  return (
    <span className="lotto-edit">
      <label>Prize CA$<input type="number" min={0} step="0.01" value={v} onChange={(e) => setV(e.target.value)} placeholder="from PlayNow" /></label>
      <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="for example Gold Ball" /></label>
      <button type="button" className="act" onClick={save}>Save</button>
      <button type="button" className="act" onClick={() => setOpen(false)}>Cancel</button>
      {msg && <span className="sub" role="status">{msg}</span>}
    </span>
  )
}

export function FinLottery({ show }: { show: boolean }) {
  const [data, setData] = useState<{ plays: LottoPlay[]; draws: LottoDraw[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [game, setGame] = useState<'' | Game>('')
  const [winsOnly, setWinsOnly] = useState(true)
  const [year, setYear] = useState('')
  const reload = () => { loadLotto().then((d) => { setData(d); setErr(null) }).catch((e: Error) => setErr(e.message)) }
  useEffect(reload, [])
  const all = useMemo(() => (data ? results(data.plays, data.draws) : []), [data])
  const M = (v: number) => (show ? cad(v) : '••••')
  if (err) return <section className="sub-panel span-2"><p role="alert">Could not load the lottery records: {err}</p></section>
  if (!data) return <section className="sub-panel span-2"><p className="sub">Loading…</p></section>
  const years = [...new Set(all.map((r) => r.draw.draw_on.slice(0, 4)))].sort().reverse()
  const scope = all.filter((r) => !year || r.draw.draw_on.startsWith(year))
  const t = totals(scope)
  const byGame = (Object.keys(GAME) as Game[]).map((g) => ({ g, t: totals(scope.filter((r) => r.draw.game === g)), plays: data.plays.filter((p) => p.game === g && !p.end_on) }))
  const months = [...new Set(scope.map((r) => r.draw.draw_on.slice(0, 7)))].sort()
  let run = 0
  const monthRows = months.map((m) => { const mt = totals(scope.filter((r) => r.draw.draw_on.startsWith(m))); run += mt.net; return { m, mt, run } }).reverse()
  const rows = scope.filter((r) => (!game || r.draw.game === game) && (!winsOnly || r.prize > 0 || r.shared || r.draw.my_prize !== null))
  const best = scope.reduce<Result | null>((b, r) => (r.prize > (b?.prize ?? 0) ? r : b), null)
  const latest = data.draws.reduce<string | null>((m, d) => (!m || d.draw_on > m ? d.draw_on : m), null)
  return (<>
    <section className="sub-panel span-2">
      <h3>Lottery 彩票 <span className="sub inline">{t.draws} draws played{year ? ` in ${year}` : ''} · results up to {latest ? day(latest) : 'not loaded yet'}</span></h3>
      <div className="fin-filters">
        <label>Year <select className="fin-year" value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      </div>
      <div className="stats wide">
        <div className="stat"><b>{M(t.spent)}</b><span>Spent 投注</span></div>
        <div className="stat"><b>{M(t.cash)}</b><span>Cash prizes 現金獎</span></div>
        <div className="stat"><b>{M(t.free)}</b><span>Free plays won ({Math.round(t.free / 3)})</span></div>
        <div className={`stat ${t.net < 0 ? 'dn' : 'up'}`}><b>{M(t.net)}</b><span>Net 輸贏</span></div>
        <div className="stat"><b>{t.back >= 1 ? `$${t.back.toFixed(2)}` : `${Math.round(t.back * 100)}¢`}</b><span>Back for every $1 played</span></div>
      </div>
      {best && <p className="sub">Best win: {best.tier} on {GAME[best.draw.game].name}, {day(best.draw.draw_on)} ({best.cashLabel}). {t.wins} winning draws out of {t.draws}.</p>}
    </section>

    <section className="sub-panel span-2">
      <h3>Your plays 你的號碼</h3>
      <ul className="lotto-games">
        {byGame.map(({ g, t: gt, plays }) => (
          <li key={g}>
            <div><b>{GAME[g].name}</b> <span className="sub inline">every {GAME[g].days} draw · {plays[0] ? cad(plays[0].cost) : ''} a play</span></div>
            {plays.map((p) => <div key={p.id}><Balls nums={p.numbers} mine={p.numbers} extra={p.grand} extraLabel="Grand Number" extraHit /> <span className="sub inline">since {day(p.start_on)}</span></div>)}
            <div className="sub">{gt.draws} draws · spent {M(gt.spent)} · won {M(gt.won)} (free plays {M(gt.free)}) · net {M(gt.net)}</div>
          </li>
        ))}
      </ul>
    </section>

    <section className="sub-panel span-2">
      <h3>By month 每月</h3>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Month</th><th className="n">Draws</th><th className="n">Spent</th><th className="n">Won</th><th className="n">Net</th><th className="n">Running net</th></tr></thead>
        <tbody>{monthRows.map(({ m, mt, run: r }) => (
          <tr key={m}><td>{m}</td><td className="n">{mt.draws}</td><td className="n">{M(mt.spent)}</td><td className="n">{M(mt.won)}</td><td className={`n ${mt.net < 0 ? 'dn' : 'up'}`}>{M(mt.net)}</td><td className={`n ${r < 0 ? 'dn' : 'up'}`}>{M(r)}</td></tr>
        ))}</tbody>
      </table></div>
    </section>

    <section className="sub-panel span-2">
      <h3>Draws 開彩結果</h3>
      <div className="fin-filters">
        <label>Game <select className="fin-year" value={game} onChange={(e) => setGame(e.target.value as '' | Game)}><option value="">Both games</option>{(Object.keys(GAME) as Game[]).map((g) => <option key={g} value={g}>{GAME[g].name}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={winsOnly} onChange={(e) => setWinsOnly(e.target.checked)} /> Wins only</label>
        <span className="sub">{rows.length} draws</span>
      </div>
      {rows.length ? (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Draw</th><th>Winning numbers (yours highlighted)</th><th>Matched</th><th className="n">Prize</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={`${r.draw.id}|${r.play.id}`} className={r.prize > 0 || r.shared ? '' : 'muted'}>
              <td>{day(r.draw.draw_on)}<span className="sub">{GAME[r.draw.game].name}</span></td>
              <td><Balls nums={r.draw.numbers} mine={r.play.numbers} extra={r.draw.game === 'lotto649' ? r.draw.bonus : r.draw.grand} extraLabel={r.draw.game === 'lotto649' ? 'Bonus' : 'Grand Number'} extraHit={r.extra} /></td>
              <td>{r.tier ?? `${r.match} of ${r.play.numbers.length}`}{r.draw.note && <span className="sub">{r.draw.note}</span>}</td>
              <td className="n">{r.shared ? 'enter from PlayNow' : r.prize ? (show ? r.cashLabel : '••••') : '–'}</td>
              <td><PrizeEdit r={r} onDone={reload} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="sub">No winning draws in this view.</p>}
      <p className="sub">Prizes are worked out from the published winning numbers. A free play is counted at the price of one play. Shared prizes (4 or more numbers on Lotto 6/49) and the Lotto 6/49 Gold Ball draw cannot be worked out from your numbers: when PlayNow emails you about a win that is not shown here, enter the amount with &quot;Other prize?&quot;. New results are added each morning.</p>
    </section>
  </>)
}
