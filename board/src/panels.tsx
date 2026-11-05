import { useState } from 'react'
import type { FormEvent } from 'react'
import type {
  BoardSettings, CalEvent, Flag, NewsRegion, Quote, Snapshot, StockpileView, WatchItem, Weather,
} from './data'
import { daysUntil } from './data'
import { Empty, Sev, Spark } from './ui'
import { HiddenNote, ItemActions } from './items'
import { useVisible } from './itemHooks'
import type { Deadline, WhatsApp } from './data'
import {
  TEAM_TOOLS_URL, stockpileLink, aqiText, ago, hourLabel, num, pct, shortDate, weekday, wxText, wxZh,
} from './format'
const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox'
const CAL_URL = 'https://calendar.google.com/calendar/u/0/r/day'

function FlagList({ items, limit, scope, actions = true }: { items: Flag[]; limit?: number; scope?: string; actions?: boolean }) {
  const { visible, hidden } = useVisible(scope ?? 'misc', items)
  const list = limit ? visible.slice(0, limit) : visible
  if (!list.length) return <>{hidden ? <Empty>All done for now.</Empty> : <Empty>Nothing needs attention.</Empty>}<HiddenNote n={hidden} /></>
  return (
    <>
      <ul className="rows">
        {list.map((f) => (
          <li key={f._key} className={f._hidden ? 'is-hidden' : ''}>
            <Sev s={f.severity} />
            <span className="x">
              {f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.title}</a> : f.title}
              {f.detail && !limit && <span className="sub">{f.detail}</span>}
            </span>
            {actions && scope && <ItemActions k={f._key} title={f.title} hidden={f._hidden} />}
          </li>
        ))}
      </ul>
      {limit ? more(visible.length, limit) : null}
      <HiddenNote n={hidden} />
    </>
  )
}

const CJK = /[\u3400-\u9fff]/

const more = (n: number, shown: number) => (n > shown ? <p className="count">+{n - shown} more in the panel</p> : null)

// ================================================================= SereneHost
type SH = NonNullable<Snapshot['serenehost']>

function staleNote(sh: SH) {
  if (!sh.data_as_of) return null
  const days = Math.floor((Date.now() - new Date(sh.data_as_of).getTime()) / 86400000)
  if (days < 2) return null
  return <p className="stale">Guest data last synced from Guesty {ago(sh.data_as_of)}. Check-ins may be incomplete.</p>
}

export function SereneSummary({ sh }: { sh?: SH }) {
  if (!sh) return <Empty>Waiting for the first morning summary.</Empty>
  return (
    <>
      <div className="stats">
        {sh.stats.slice(0, 4).map((s) => (
          <div className="stat" key={s.label}><b>{s.value}</b><span>{s.label}</span></div>
        ))}
      </div>
      <FlagList items={sh.items} limit={6} scope="sh" />
      {staleNote(sh)}
    </>
  )
}

export function SereneDetail({ sh }: { sh?: SH }) {
  if (!sh) return <Empty>Waiting for the first morning summary.</Empty>
  const day = (d: 'today' | 'tomorrow') => (
    <section className="sub-panel" key={d}>
      <h3>{d === 'today' ? 'Today 今日' : 'Tomorrow 明日'}</h3>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Type</th><th>Property</th><th>Time</th><th>Guests</th><th>Channel</th></tr></thead>
        <tbody>
          {sh.movements.filter((m) => m.day === d).map((m, i) => (
            <tr key={i}>
              <td><span className={`pill ${m.kind}`}>{m.kind === 'in' ? 'Check-in' : 'Check-out'}</span></td>
              <td>{m.property}</td><td className="n">{m.time ?? '-'}</td><td className="n">{m.guests ?? '-'}</td><td>{m.channel ?? '-'}</td>
            </tr>
          ))}
          {!sh.movements.some((m) => m.day === d) && <tr><td colSpan={5} className="empty">No check-ins or check-outs.</td></tr>}
        </tbody>
      </table></div>
      <h4>Cleans</h4>
      <ul className="rows">
        {sh.cleans.filter((c) => c.day === d).map((c, i) => (
          <li key={i}><span className="pill">{c.status}</span><span className="x">{c.property}{c.assignee ? <span className="sub">{c.assignee}</span> : null}</span></li>
        ))}
        {!sh.cleans.some((c) => c.day === d) && <li className="empty">No cleans scheduled.</li>}
      </ul>
    </section>
  )
  return (
    <div className="detail-grid">
      <section className="sub-panel span-2">
        <div className="stats wide">
          {sh.stats.map((s) => (
            <div className="stat" key={s.label}><b>{s.value}</b><span>{s.label}{s.label_zh ? ` ${s.label_zh}` : ''}</span></div>
          ))}
        </div>
        {staleNote(sh)}
      </section>
      <section className="sub-panel span-2">
        <h3>Urgent and important 緊急事項</h3>
        <FlagList items={sh.items} scope="sh" />
      </section>
      {day('today')}
      {day('tomorrow')}
      <section className="sub-panel">
        <h3>Open team tasks 團隊工作</h3>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Task</th><th>Stage</th><th>Owner</th><th>Due</th></tr></thead>
          <tbody>
            {sh.tasks.map((t, i) => (
              <tr key={i} className={t.due_on && daysUntil(t.due_on) < 0 ? 'late' : ''}>
                <td>{t.title}{t.waiting_on ? <span className="sub">Waiting on {t.waiting_on}</span> : null}</td>
                <td>{t.stage}</td><td>{t.owner ?? '-'}</td><td className="n">{shortDate(t.due_on) || '-'}</td>
              </tr>
            ))}
            {!sh.tasks.length && <tr><td colSpan={4} className="empty">No open tasks.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="sub-panel">
        <h3>Next meeting 會議</h3>
        {sh.next_meeting ? (
          <p>{sh.next_meeting.title}<br /><span className="sub">{new Date(sh.next_meeting.starts_at).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {sh.next_meeting.open_items} agenda items</span></p>
        ) : <Empty>No meeting scheduled.</Empty>}
        <p><a className="link" href={TEAM_TOOLS_URL} target="_blank" rel="noreferrer">Open SereneHost team tools</a></p>
      </section>
    </div>
  )
}

// ================================================================= Inbox
type Inbox = NonNullable<Snapshot['inbox']>

export function InboxSummary({ inbox }: { inbox?: Inbox }) {
  const { visible, hidden } = useVisible('mail', inbox?.items ?? [])
  if (!inbox) return <Empty>Waiting for the first morning summary.</Empty>
  if (!inbox.items.length) return <Empty>Nothing important since yesterday. {inbox.scanned} emails checked.</Empty>
  return (
    <>
      <ul className="rows">
        {visible.slice(0, 7).map((m) => (
          <li key={m._key} className={m._hidden ? 'is-hidden' : ''}>
            <Sev s={m.severity} label={m.category} />
            <span className="x">{m.url ? <a href={m.url} target="_blank" rel="noreferrer">{m.title}</a> : m.title}<span className="sub">{m.from}{m.due ? ` · due ${shortDate(m.due)}` : ''}</span></span>
            <ItemActions k={m._key} title={m.title} hidden={m._hidden} />
          </li>
        ))}
      </ul>
      {!visible.length && <Empty>All done for now.</Empty>}
      {more(visible.length, 7)}
      <HiddenNote n={hidden} />
    </>
  )
}

export function InboxDetail({ inbox }: { inbox?: Inbox }) {
  const { visible, hidden } = useVisible('mail', inbox?.items ?? [])
  if (!inbox) return <Empty>Waiting for the first morning summary.</Empty>
  return (
    <section className="sub-panel">
      <p className="sub">{inbox.scanned} emails checked since the last summary. Newsletters and promotions are left out.</p>
      <ul className="mail">
        {visible.map((m) => (
          <li key={m._key} className={m._hidden ? 'is-hidden' : ''}>
            <div className="mail-top">
              <Sev s={m.severity} label={m.category} />
              <b>{m.subject}</b>
              {m.due && <span className="due">Due {shortDate(m.due)}</span>}
              <ItemActions k={m._key} title={m.title} hidden={m._hidden} />
            </div>
            <div className="sub">{m.from}{m.received ? ` · ${shortDate(m.received)}` : ''}</div>
            <p>{m.title}</p>
            {m.detail && <p>{m.detail}</p>}
            {m.why && <p className="why">Why it matters: {m.why}</p>}
            {m.url && <a className="link" href={m.url} target="_blank" rel="noreferrer">Open in Gmail</a>}
          </li>
        ))}
        {!visible.length && <li className="empty">Nothing important.</li>}
      </ul>
      <HiddenNote n={hidden} />
      <p><a className="link" href={GMAIL_URL} target="_blank" rel="noreferrer">Open Gmail</a></p>
    </section>
  )
}

// ================================================================= WhatsApp (desktop task on the Windows computer)
const WA_URL = 'https://web.whatsapp.com/'

export function WhatsAppSummary({ wa }: { wa: { data: WhatsApp; updated_at: string } | null }) {
  const { visible, hidden } = useVisible('wa', wa?.data.items ?? [])
  if (!wa) return <Empty>Not connected yet. The Claude desktop task on your Windows computer will fill this in each morning.</Empty>
  const d = wa.data
  return (
    <>
      <p className="sub">{d.unread_chats} unread chats · {d.chats_checked} checked · {ago(d.generated_at)}</p>
      <ul className="rows">
        {visible.slice(0, 6).map((m) => (
          <li key={m._key} className={m._hidden ? 'is-hidden' : ''}>
            <Sev s={m.severity} label={m.category} />
            <span className="x">{m.title}<span className="sub">{m.chat}{m.received ? ` · ${m.received}` : ''}</span></span>
            <ItemActions k={m._key} title={m.title} hidden={m._hidden} />
          </li>
        ))}
      </ul>
      {!visible.length && <Empty>Nothing important in WhatsApp.</Empty>}
      {more(visible.length, 6)}
      <HiddenNote n={hidden} />
      {d.note && <p className="stale">{d.note}</p>}
    </>
  )
}

export function WhatsAppDetail({ wa }: { wa: { data: WhatsApp; updated_at: string } | null }) {
  const { visible, hidden } = useVisible('wa', wa?.data.items ?? [])
  if (!wa) return <Empty>Not connected yet. See board/WHATSAPP_TASK.md for how to set up the desktop task.</Empty>
  const d = wa.data
  const groups = [...new Set(visible.map((m) => m.category))]
  return (
    <div className="detail-grid">
      <section className="sub-panel span-2">
        <p className="sub">Read from WhatsApp Desktop {ago(d.generated_at)}: {d.unread_chats} unread chats, {d.chats_checked} chats checked. Only chat previews are read, so nothing is marked as read.</p>
        {d.note && <p className="stale">{d.note}</p>}
        <p><a className="link" href={WA_URL} target="_blank" rel="noreferrer">Open WhatsApp Web</a></p>
      </section>
      {groups.map((g) => (
        <section className="sub-panel" key={g}>
          <h3>{g}</h3>
          <ul className="mail">
            {visible.filter((m) => m.category === g).map((m) => (
              <li key={m._key} className={m._hidden ? 'is-hidden' : ''}>
                <div className="mail-top"><Sev s={m.severity} /><b>{m.chat}</b>{m.received && <span className="sub">{m.received}</span>}<ItemActions k={m._key} title={m.title} hidden={m._hidden} /></div>
                <p>{m.title}</p>
                {m.title_zh && <p className="tc-text sub">{m.title_zh}</p>}
                {m.detail && <p className="why">{m.detail}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!visible.length && <Empty>Nothing important in WhatsApp.</Empty>}
      <div className="span-2"><HiddenNote n={hidden} /></div>
    </div>
  )
}

// ================================================================= Deadlines strip
export function Deadlines({ list, lang }: { list: Deadline[]; lang: 'zh' | 'en' }) {
  const upcoming = list.filter((d) => { const n = daysUntil(d.date); return n >= -3 && n <= 14 }).sort((a, b) => a.date.localeCompare(b.date))
  const { visible } = useVisible('due', upcoming)
  if (!visible.length) return null
  return (
    <section className="deadlines" aria-label="Deadlines in the next 14 days">
      <span className="lbl">{lang === 'zh' ? '十四日內限期' : 'Next 14 days'}</span>
      <ul>
        {visible.map((d) => {
          const n = daysUntil(d.date)
          const tone = n <= 2 ? 'urgent' : n <= 7 ? 'soon' : 'info'
          const when = n < 0 ? (lang === 'zh' ? `逾期 ${-n} 日` : `${-n} days late`) : n === 0 ? (lang === 'zh' ? '今日' : 'Today') : n === 1 ? (lang === 'zh' ? '明日' : 'Tomorrow') : (lang === 'zh' ? `${n} 日` : `${n} days`)
          const title = lang === 'zh' && d.title_zh ? d.title_zh : d.title
          return (
            <li key={d._key} className={`dl ${tone}`}>
              <b>{when}</b>
              <span className={lang === 'zh' ? 'tc-text' : ''}>{d.url ? <a href={d.url} target="_blank" rel="noreferrer">{title}</a> : title}</span>
              <span className="sub">{shortDate(d.date)}{d.source ? ` · ${d.source}` : ''}</span>
              <ItemActions k={d._key} title={d.title} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ================================================================= Week ahead (Mondays)
export function WeekAhead({ week, lang }: { week: NonNullable<Snapshot['week_ahead']>; lang: 'zh' | 'en' }) {
  const pts = lang === 'zh' ? week.points_zh : week.points
  return (
    <ul className={`points ${lang === 'zh' ? 'tc-text' : ''}`}>
      {pts.map((p, i) => <li key={i}>{p}</li>)}
    </ul>
  )
}

// ================================================================= Calendar
type Cal = NonNullable<Snapshot['calendar']>

function EventRows({ events }: { events: CalEvent[] }) {
  if (!events.length) return <Empty>Nothing scheduled.</Empty>
  return (
    <ul className="rows">
      {events.map((e, i) => (
        <li key={i}>
          <span className="t">{e.all_day || !e.start ? 'All day' : e.start}</span>
          <span className="x">{e.title}{e.location ? <span className="sub">{e.location}</span> : null}</span>
        </li>
      ))}
    </ul>
  )
}

export function CalendarSummary({ cal }: { cal?: Cal }) {
  if (!cal) return <Empty>Waiting for the first morning summary.</Empty>
  const tm = cal.tomorrow
  const first = tm.find((e) => e.start && !e.all_day)
  return (
    <>
      <EventRows events={cal.today.slice(0, 5)} />
      {more(cal.today.length, 5)}
      <p className="tomorrow">Tomorrow 明日: {tm.length ? `${tm.length} event${tm.length > 1 ? 's' : ''}${first ? `, first at ${first.start}` : ''}` : 'free'}</p>
    </>
  )
}

export function CalendarDetail({ cal }: { cal?: Cal }) {
  if (!cal) return <Empty>Waiting for the first morning summary.</Empty>
  return (
    <div className="detail-grid">
      <section className="sub-panel"><h3>Today 今日</h3><EventRows events={cal.today} /></section>
      <section className="sub-panel"><h3>Tomorrow 明日</h3><EventRows events={cal.tomorrow} /></section>
      <p className="span-2"><a className="link" href={CAL_URL} target="_blank" rel="noreferrer">Open Google Calendar</a></p>
    </div>
  )
}

// ================================================================= Waiting on you
function binReminder(settings: BoardSettings | null): Flag | null {
  if (!settings || settings.bin_weekday === null) return null
  const now = new Date()
  const today = now.getDay()
  const note = settings.bin_note ? ` ${settings.bin_note}` : ''
  if (today === settings.bin_weekday) return { severity: 'soon', title: `Bin collection today.${note}` }
  if ((today + 1) % 7 === settings.bin_weekday) return { severity: 'info', title: `Bins out tonight, collection tomorrow.${note}` }
  return null
}

function focusNote(settings: BoardSettings | null): string | null {
  if (!settings?.focus_note.trim()) return null
  return settings.focus_note.trim()
}

export function WaitingSummary({ snap, settings }: { snap?: Snapshot; settings: BoardSettings | null }) {
  const bin = binReminder(settings)
  const focus = focusNote(settings)
  const items = [...(snap?.waiting ?? [])]
  return (
    <>
      {focus && <p className="focus"><span className="lbl">Focus 今日重點</span>{focus}</p>}
      {bin && <FlagList items={[bin]} limit={1} actions={false} />}
      <FlagList items={items} limit={4} scope="wait" />
    </>
  )
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function WaitingDetail({ snap, settings, onSave }: {
  snap?: Snapshot
  settings: BoardSettings | null
  onSave: (patch: Partial<BoardSettings>) => Promise<void>
}) {
  const [focus, setFocus] = useState(settings?.focus_note ?? '')
  const [bin, setBin] = useState(settings?.bin_weekday ?? -1)
  const [binNote, setBinNote] = useState(settings?.bin_note ?? '')
  const [saved, setSaved] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaved('Saving…')
    try {
      await onSave({ focus_note: focus, bin_weekday: bin < 0 ? null : bin, bin_note: binNote })
      setSaved('Saved')
    } catch (err) {
      setSaved(`Could not save: ${(err as Error).message}`)
    }
  }
  return (
    <div className="detail-grid">
      <section className="sub-panel">
        <h3>Waiting on you 待你回覆</h3>
        <FlagList items={snap?.waiting ?? []} scope="wait" />
      </section>
      <section className="sub-panel">
        <h3>Your notes 備忘</h3>
        <form className="form" onSubmit={submit}>
          <label htmlFor="focus">Focus for tomorrow morning</label>
          <textarea id="focus" rows={3} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="One line you want to see first thing tomorrow" />
          <label htmlFor="bin">Bin collection day (Richmond)</label>
          <select id="bin" value={bin} onChange={(e) => setBin(Number(e.target.value))}>
            <option value={-1}>Not set</option>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <label htmlFor="binnote">Bin note</label>
          <input id="binnote" value={binNote} onChange={(e) => setBinNote(e.target.value)} placeholder="For example: garbage and green cart this week" />
          <div className="form-row"><button type="submit" className="btn">Save</button>{saved && <span className="sub">{saved}</span>}</div>
        </form>
      </section>
    </div>
  )
}

// ================================================================= Weather
export function WeatherSummary({ wx }: { wx: Weather }) {
  const today = wx.daily[0]
  const aq = aqiText(wx.aqi)
  const rainHour = wx.hourly.find((h) => h.pop >= 60)
  return (
    <>
      <div className="wx-now">
        <span className="big">{Math.round(wx.current.temp)}°</span>
        <div>
          <div>{wxText(wx.current.code)} <span className="tc">{wxZh(wx.current.code)}</span></div>
          <div className="sub">High {Math.round(today.max)}° · Low {Math.round(today.min)}° · Feels {Math.round(wx.current.feels)}°</div>
          <div className="sub">{rainHour ? `Rain likely from ${hourLabel(rainHour.time)}` : 'No heavy rain in the next 24 hours'} · <span className={`tone-${aq.tone}`}>{aq.text}</span></div>
        </div>
      </div>
      <div className="wx-days">
        {wx.daily.map((d) => (
          <div key={d.date} title={`${wxText(d.code)}, ${d.pop}% chance of rain`}>
            <i>{weekday(d.date)}</i>
            <div className="bar"><span style={{ height: `${Math.max(2, Math.round((d.pop / 100) * 22))}px` }} /></div>
            <b>{Math.round(d.max)}°</b><i>{Math.round(d.min)}°</i>
          </div>
        ))}
      </div>
    </>
  )
}

export function WeatherDetail({ wx }: { wx: Weather }) {
  const today = wx.daily[0]
  const temps = wx.hourly.map((h) => h.temp)
  const tMin = Math.min(...temps), tMax = Math.max(...temps)
  const W = 1100, H = 220, padL = 40, padB = 24, padT = 14
  const x = (i: number) => padL + (i / (wx.hourly.length - 1)) * (W - padL - 8)
  const y = (t: number) => padT + (1 - (t - tMin) / (tMax - tMin || 1)) * (H - padT - padB)
  const line = wx.hourly.map((h, i) => `${x(i).toFixed(1)},${y(h.temp).toFixed(1)}`).join(' ')
  const ticks = [tMin, (tMin + tMax) / 2, tMax]
  return (
    <div className="detail-grid">
      <section className="sub-panel span-2">
        <h3>Next 24 hours 未來廿四小時</h3>
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Temperature and chance of rain for the next 24 hours">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} className="grid-line" />
                <text x={padL - 6} y={y(t) + 4} className="axis" textAnchor="end">{Math.round(t)}°</text>
              </g>
            ))}
            {wx.hourly.map((h, i) => (
              <rect key={h.time} x={x(i) - 6} width="12" y={H - padB - (h.pop / 100) * (H - padT - padB)} height={(h.pop / 100) * (H - padT - padB)} className="rain-bar" />
            ))}
            <polyline points={line} className="temp-line" />
            {wx.hourly.map((h, i) => (i % 3 === 0 ? <text key={h.time} x={x(i)} y={H - 6} className="axis" textAnchor="middle">{hourLabel(h.time)}</text> : null))}
          </svg>
        </div>
        <p className="sub">Line: temperature. Bars: chance of rain.</p>
      </section>
      <section className="sub-panel">
        <h3>7 days 七日預報</h3>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Day</th><th>Sky</th><th>High</th><th>Low</th><th>Rain</th></tr></thead>
          <tbody>
            {wx.daily.map((d) => (
              <tr key={d.date}><td>{weekday(d.date)} {shortDate(d.date)}</td><td>{wxText(d.code)} <span className="tc">{wxZh(d.code)}</span></td><td className="n">{Math.round(d.max)}°</td><td className="n">{Math.round(d.min)}°</td><td className="n">{d.pop}% · {d.rain.toFixed(1)} mm</td></tr>
            ))}
          </tbody>
        </table></div>
      </section>
      <section className="sub-panel">
        <h3>Today 今日</h3>
        <ul className="kv">
          <li><span>Sunrise 日出</span><b>{hourLabel(today.sunrise)}</b></li>
          <li><span>Sunset 日落</span><b>{hourLabel(today.sunset)}</b></li>
          <li><span>UV index</span><b>{today.uv.toFixed(0)}</b></li>
          <li><span>Wind</span><b>{Math.round(wx.current.wind)} km/h</b></li>
          <li><span>Air quality (US AQI)</span><b>{wx.aqi ?? '-'}</b></li>
          <li><span>Fine particles PM2.5</span><b>{wx.pm25 !== null ? `${wx.pm25.toFixed(1)} µg/m³` : '-'}</b></li>
        </ul>
        <p className="sub">Source: Open-Meteo, Richmond BC.</p>
      </section>
    </div>
  )
}

// ================================================================= Markets
function QuoteRow({ q, label }: { q: Quote; label: string }) {
  const up = (q.change ?? 0) >= 0
  return (
    <li className="q">
      <span className="q-name">{label}</span>
      <Spark values={q.spark} up={up} />
      <span className="n">{num(q.price, q.price !== null && q.price < 50 ? 4 : 2)}</span>
      <span className={`n chg ${up ? 'up' : 'dn'}`}>{pct(q.changePct)}</span>
    </li>
  )
}

export function MarketsSummary({ quotes, watch }: { quotes: Quote[]; watch: WatchItem[] }) {
  if (!quotes.length) return <Empty>No symbols in your watchlist.</Empty>
  return (
    <ul className="quotes">
      {quotes.map((q) => <QuoteRow key={q.symbol} q={q} label={watch.find((w) => w.symbol === q.symbol)?.label ?? q.symbol} />)}
    </ul>
  )
}

export function MarketsDetail({ quotes, watch, onSave }: { quotes: Quote[]; watch: WatchItem[]; onSave: (patch: Partial<BoardSettings>) => Promise<void> }) {
  const [text, setText] = useState(watch.map((w) => `${w.symbol} ${w.label}`).join('\n'))
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const list = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [symbol, ...rest] = l.split(/\s+/)
      return { symbol, label: rest.join(' ') || symbol }
    })
    setMsg('Saving…')
    try { await onSave({ watchlist: list }); setMsg('Saved. Prices will refresh.') } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <div className="detail-grid">
      <section className="sub-panel span-2">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Name</th><th>Symbol</th><th>Last month</th><th className="n">Price</th><th className="n">Change</th><th className="n">Previous close</th><th>As of</th></tr></thead>
          <tbody>
            {quotes.map((q) => {
              const up = (q.change ?? 0) >= 0
              return (
                <tr key={q.symbol}>
                  <td>{watch.find((w) => w.symbol === q.symbol)?.label ?? q.name}<span className="sub">{q.name}</span></td>
                  <td className="mono">{q.symbol}</td>
                  <td><Spark values={q.spark} up={up} /></td>
                  <td className="n">{num(q.price, q.price !== null && q.price < 50 ? 4 : 2)} <span className="sub">{q.currency}</span></td>
                  <td className={`n ${up ? 'up' : 'dn'}`}>{num(q.change, q.price !== null && q.price < 50 ? 4 : 2)} ({pct(q.changePct)})</td>
                  <td className="n">{num(q.prevClose, q.price !== null && q.price < 50 ? 4 : 2)}</td>
                  <td className="sub">{q.marketTime ? new Date(q.marketTime * 1000).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: q.exchangeTz ?? undefined }) : q.error ?? '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        <p className="sub">Prices from Yahoo Finance, may be delayed. Times shown in each market's own time zone.</p>
      </section>
      <section className="sub-panel span-2">
        <h3>Watchlist 觀察清單</h3>
        <form className="form" onSubmit={submit}>
          <label htmlFor="watch">One per line: symbol, then a short name. Hong Kong stocks end in .HK (0700.HK), Toronto in .TO (RY.TO).</label>
          <textarea id="watch" rows={9} className="mono" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="form-row"><button type="submit" className="btn">Save watchlist</button>{msg && <span className="sub">{msg}</span>}</div>
        </form>
      </section>
    </div>
  )
}

// ================================================================= Stockpile
const AREA_ZH: Record<string, string> = { Garage: '車房', Kitchen: '廚房', Freezer: '冰櫃' }
const areaName = (l: string) => `${l} ${AREA_ZH[l] ?? ''}`.trim()

function areaState(a: StockpileView['areas'][number]): { sev: 'urgent' | 'soon' | 'info'; text: string } {
  if (!a.due) return { sev: 'soon', text: 'not counted yet' }
  const d = daysUntil(a.due)
  if (d < 0) return { sev: 'urgent', text: `overdue by ${-d} days` }
  return { sev: d <= 14 ? 'soon' : 'info', text: `due in ${d} days (${shortDate(a.due)})` }
}

// One-tap buttons that open the right screen in the Stockpile Tracker, in this tab.
function StockActions({ sp }: { sp: StockpileView }) {
  return (
    <div className="sp-actions">
      <a className="btn" href={stockpileLink('shopping')}>
        Shopping list{sp.shopping.count ? ` (${sp.shopping.count})` : ''}
      </a>
      {sp.open ? (
        <a className="btn ghost" href={stockpileLink('stocktake')}>Continue stock-take</a>
      ) : (
        sp.areas.map((a) => (
          <a key={a.location} className="btn ghost" href={stockpileLink(`stocktake/${encodeURIComponent(a.location)}`)}>
            Count {a.location}
          </a>
        ))
      )}
      <a className="btn ghost" href={stockpileLink('')}>Inventory</a>
    </div>
  )
}

export function StockSummary({ sp }: { sp: StockpileView }) {
  return (
    <>
      <div className="stats">
        <div className="stat"><b className={sp.below.length ? 'warn' : ''}>{sp.below.length}</b><span>Below target</span></div>
        <div className="stat"><b className={sp.expiring.length ? 'crit' : ''}>{sp.expiring.length}</b><span>Expire in 30 days</span></div>
        <div className="stat"><b>{sp.empty.length}</b><span>Out of stock</span></div>
        {sp.shopping.estTotal > 0 && <div className="stat"><b>${Math.round(sp.shopping.estTotal)}</b><span>To buy (estimate)</span></div>}
      </div>
      <ul className="rows">
        {sp.open ? (
          <li>
            <Sev s="soon" label="Count" />
            <span className="x">Stock-take in progress{sp.open.label ? `: ${sp.open.label.join(', ')}` : ''} ({sp.open.done} of {sp.open.total} done)</span>
          </li>
        ) : (
          sp.areas.map((a) => {
            const st = areaState(a)
            return (
              <li key={a.location}>
                <Sev s={st.sev} label={a.location} />
                <span className="x">Stock-take {st.text}</span>
              </li>
            )
          })
        )}
      </ul>
      <StockActions sp={sp} />
    </>
  )
}

export function StockDetail({ sp }: { sp: StockpileView }) {
  const name = (s: StockpileView['below'][number]) => (
    <a href={stockpileLink(`item/${s.item.id}`)}>{s.item.name_en}</a>
  )
  return (
    <div className="detail-grid">
      <section className="sub-panel">
        <h3>Below target 低於目標</h3>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Item</th><th>On hand</th><th>Target</th></tr></thead>
          <tbody>
            {sp.below.map((s) => (
              <tr key={s.item.id}><td>{name(s)} <span className="tc">{s.item.name_zh}</span></td><td className="n">{s.onHand} {s.item.unit}</td><td className="n">{s.item.target_qty}</td></tr>
            ))}
            {!sp.below.length && <tr><td colSpan={3} className="empty">Everything is at target.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="sub-panel">
        <h3>Expiring within 30 days 即將過期</h3>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Item</th><th>Expires</th></tr></thead>
          <tbody>
            {sp.expiring.map((s) => (
              <tr key={s.item.id} className={(s.daysToExpiry ?? 0) < 0 ? 'late' : ''}><td>{name(s)} <span className="tc">{s.item.name_zh}</span></td><td className="n">{shortDate(s.earliestExpiry)} ({s.daysToExpiry} days)</td></tr>
            ))}
            {!sp.expiring.length && <tr><td colSpan={2} className="empty">Nothing expires soon.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="sub-panel">
        <h3>Stock-take by area 按位置盤點</h3>
        <ul className="rows">
          {sp.areas.map((a) => {
            const st = areaState(a)
            return (
              <li key={a.location}>
                <Sev s={st.sev} label={a.location} />
                <span className="x">{areaName(a.location)}: {st.text}{a.last ? ` · last counted ${shortDate(a.last)}` : ''}</span>
              </li>
            )
          })}
        </ul>
        <p className="sub">
          Shopping list: {sp.shopping.count} items{sp.shopping.estTotal > 0 ? `, about $${sp.shopping.estTotal.toFixed(0)}` : ''}.
        </p>
        <StockActions sp={sp} />
      </section>
    </div>
  )
}

// ================================================================= News
export function NewsSummary({ regions }: { regions: NewsRegion[] }) {
  return (
    <ul className="news">
      {regions.map((r) => (
        <li key={r.key}>
          <span className="news-r">{r.label}</span>
          <ul>
            {r.items.slice(0, 2).map((h) => (
              <li key={h.link}><a href={h.link} target="_blank" rel="noreferrer" className={CJK.test(h.title) ? 'tc-text' : ''}>{h.title}</a></li>
            ))}
            {!r.items.length && <li className="empty">No headlines right now.</li>}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export function NewsDetail({ regions }: { regions: NewsRegion[] }) {
  return (
    <div className="detail-grid news-detail">
      {regions.map((r) => (
        <section className="sub-panel" key={r.key}>
          <h3>{r.label}</h3>
          <ul className="rows">
            {r.items.map((h) => (
              <li key={h.link}>
                <span className="x">
                  <a href={h.link} target="_blank" rel="noreferrer" className={CJK.test(h.title) ? 'tc-text' : ''}>{h.title}</a>
                  <span className="sub">{h.source}{h.published ? ` · ${ago(h.published)}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
