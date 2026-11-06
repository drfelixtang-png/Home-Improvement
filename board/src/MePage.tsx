import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Area, BoardSettings, Habit } from './data'
import type { Checkin } from './me'
import { addDays, daysBetween, emptyCheckin, habitStatus, hoursByArea, saveCheckin, sleepFrom, slugKey, vanDate, vanHour, weekStart } from './me'

type Lang = 'zh' | 'en'

// ================================================================= small inputs
function Rating({ id, label, value, onChange, low, high }: {
  id: string; label: string; value: number | null; onChange: (v: number) => void; low: string; high: string
}) {
  return (
    <div className="rating" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="field-l">{label}</span>
      <div className="rating-row">
        <span className="rating-end">{low}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" id={n === 1 ? id : undefined} className={value === n ? 'on' : ''} aria-pressed={value === n} onClick={() => onChange(n)}>{n}</button>
        ))}
        <span className="rating-end">{high}</span>
      </div>
    </div>
  )
}

// Hour and minute dropdowns: minutes only 00, 15, 30 and 45. `startHour` puts the likely
// hours first (evening for bed time, early morning for wake-up time).
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`

function QuarterTime({ id, value, onChange, startHour }: { id: string; value: string | null; onChange: (v: string | null) => void; startHour: number }) {
  const [h, m] = value ? value.split(':') : ['', '']
  const mm = m ? String(Math.round(Number(m) / 15) * 15 % 60).padStart(2, '0') : ''
  const hours = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24)
  const set = (nh: string, nm: string) => onChange(nh === '' ? null : `${nh.padStart(2, '0')}:${nm || '00'}`)
  return (
    <span className="qtime">
      <select id={id} aria-label="Hour" value={h ? String(Number(h)) : ''} onChange={(e) => set(e.target.value, mm)}>
        <option value="">--</option>
        {hours.map((x) => <option key={x} value={x}>{hourLabel(x)}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label="Minutes" value={mm} disabled={!h} onChange={(e) => set(h, e.target.value)}>
        {['00', '15', '30', '45'].map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  )
}

function Stepper({ id, value, onChange, step = 0.5, max = 24 }: { id: string; value: number; onChange: (v: number) => void; step?: number; max?: number }) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, Math.round(v / step) * step)))
  return (
    <span className="stepper">
      <button type="button" onClick={() => set(value - step)} aria-label="Less">−</button>
      <input id={id} type="number" inputMode="decimal" min={0} max={max} step={step} value={value || ''} placeholder="0" onChange={(e) => set(Number(e.target.value))} />
      <button type="button" onClick={() => set(value + step)} aria-label="More">+</button>
    </span>
  )
}

function SaveRow({ msg }: { msg: string | null }) {
  return <div className="form-row"><button type="submit" className="btn">Save 儲存</button>{msg && <span className="sub" role="status">{msg}</span>}</div>
}

// ================================================================= morning
function Morning({ day, c, prev, onSaved }: { day: string; c: Checkin; prev: Checkin | undefined; onSaved: () => void }) {
  const [f, setF] = useState(c)
  const [msg, setMsg] = useState<string | null>(null)
  const pr = [...f.priorities, '', '', ''].slice(0, 3)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    try {
      await saveCheckin(day, {
        bed_time: f.bed_time, wake_time: f.wake_time, sleep_hours: sleepFrom(f.bed_time, f.wake_time) ?? f.sleep_hours, sleep_quality: f.sleep_quality, energy_am: f.energy_am, mood_am: f.mood_am,
        priorities: pr.map((p) => p.trim()), morning_note: f.morning_note, morning_at: new Date().toISOString(),
      })
      setMsg('Saved 已儲存')
      onSaved()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="ci-card" onSubmit={submit}>
      <h3>Morning check-in <span className="tc">早上記錄</span>{c.morning_at && <span className="done-chip">Done ✓</span>}</h3>
      {prev?.better_tomorrow && <p className="carry"><span className="lbl">Yesterday you said 昨日的 0.1%</span>{prev.better_tomorrow}</p>}
      <div className="field">
        <span className="field-l">Sleep last night 昨晚睡眠</span>
        <div className="sleep-times">
          <label htmlFor="bed">Went to bed 上床<QuarterTime id="bed" value={f.bed_time} startHour={20} onChange={(v) => setF({ ...f, bed_time: v })} /></label>
          <label htmlFor="wake">Woke up 起床<QuarterTime id="wake" value={f.wake_time} startHour={4} onChange={(v) => setF({ ...f, wake_time: v })} /></label>
          <span className="sleep-total">{sleepFrom(f.bed_time, f.wake_time) !== null ? <><b>{sleepFrom(f.bed_time, f.wake_time)}</b> h</> : <span className="sub inline">hours worked out for you</span>}</span>
        </div>
      </div>
      <Rating id="sq" label="Sleep quality 睡眠質素" value={f.sleep_quality} onChange={(v) => setF({ ...f, sleep_quality: v })} low="Poor" high="Great" />
      <Rating id="eam" label="Energy now 精神" value={f.energy_am} onChange={(v) => setF({ ...f, energy_am: v })} low="Drained" high="Full" />
      <Rating id="mam" label="Mood now 心情" value={f.mood_am} onChange={(v) => setF({ ...f, mood_am: v })} low="Low" high="Great" />
      <fieldset className="field">
        <legend className="field-l">Top 3 priorities today 今日三件要事</legend>
        {pr.map((p, i) => (
          <input key={i} id={`pri${i}`} value={p} placeholder={i === 0 ? 'The one thing that matters most' : `Priority ${i + 1}`}
            onChange={(e) => { const n = [...pr]; n[i] = e.target.value; setF({ ...f, priorities: n }) }} />
        ))}
      </fieldset>
      <div className="field">
        <label className="field-l" htmlFor="mnote">Note 備註 (optional)</label>
        <input id="mnote" value={f.morning_note} onChange={(e) => setF({ ...f, morning_note: e.target.value })} placeholder="Anything on your mind" />
      </div>
      <SaveRow msg={msg} />
    </form>
  )
}

// ================================================================= evening
function Evening({ day, c, habits, areas, onSaved, byDay }: { day: string; c: Checkin; habits: Habit[]; areas: Area[]; onSaved: () => void; byDay: Map<string, Checkin> }) {
  // Times a weekly habit was ticked earlier this week (today's saved tick included).
  const weekDone = (h: Habit) => Array.from({ length: 7 }, (_, k) => addDays(weekStart(day), k)).filter((d) => d <= day && byDay.get(d)?.habits[h.key]).length
  const [f, setF] = useState(c)
  const [msg, setMsg] = useState<string | null>(null)
  const pri = f.priorities.filter((p) => p.trim())
  const total = areas.reduce((s, a) => s + (Number(f.hours[a.key]) || 0), 0)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    try {
      await saveCheckin(day, {
        energy_pm: f.energy_pm, mood_pm: f.mood_pm, priorities_done: f.priorities_done, habits: f.habits, hours: f.hours,
        win: f.win, slipped: f.slipped, better_tomorrow: f.better_tomorrow, evening_note: f.evening_note, evening_at: new Date().toISOString(),
      })
      setMsg('Saved 已儲存')
      onSaved()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="ci-card" onSubmit={submit}>
      <h3>Evening check-in <span className="tc">晚上記錄</span>{c.evening_at && <span className="done-chip">Done ✓</span>}</h3>
      {pri.length > 0 && (
        <fieldset className="field">
          <legend className="field-l">This morning's priorities 今日要事</legend>
          {f.priorities.map((p, i) => p.trim() ? (
            <label key={i} className="check"><input type="checkbox" checked={!!f.priorities_done[i]}
              onChange={(e) => { const n = [...f.priorities_done]; n[i] = e.target.checked; setF({ ...f, priorities_done: n }) }} /> {p}</label>
          ) : null)}
        </fieldset>
      )}
      <fieldset className="field">
        <legend className="field-l">Habits done today 今日習慣</legend>
        <div className="check-grid">
          {habits.filter((h) => !h.auto && h.every !== 'week').map((h) => (
            <label key={h.key} className="check"><input type="checkbox" checked={!!f.habits[h.key]}
              onChange={(e) => setF({ ...f, habits: { ...f.habits, [h.key]: e.target.checked } })} /> {h.label} <span className="tc">{h.label_zh}</span></label>
          ))}
        </div>
      </fieldset>
      {habits.some((h) => !h.auto && h.every === 'week') && (
        <fieldset className="field">
          <legend className="field-l">Weekly habits 每週習慣 <span className="sub inline">tick on the day you do it</span></legend>
          <div className="check-grid">
            {habits.filter((h) => !h.auto && h.every === 'week').map((h) => {
              const done = weekDone(h)
              return (
                <label key={h.key} className="check"><input type="checkbox" checked={!!f.habits[h.key]}
                  onChange={(e) => setF({ ...f, habits: { ...f.habits, [h.key]: e.target.checked } })} /> {h.label} <span className="tc">{h.label_zh}</span>
                  <span className="sub inline"> this week {done + (f.habits[h.key] && !c.habits[h.key] ? 1 : 0)}/{Math.max(1, h.per_week)}</span></label>
              )
            })}
          </div>
        </fieldset>
      )}
      <fieldset className="field">
        <legend className="field-l">Where your time went, hours 時間分配 <span className="sub inline">Total {total} h</span></legend>
        <div className="hours-grid">
          {areas.map((a) => (
            <div key={a.key} className="hours-row">
              <label htmlFor={`h-${a.key}`}>{a.label} <span className="tc">{a.label_zh}</span></label>
              <Stepper id={`h-${a.key}`} value={Number(f.hours[a.key]) || 0} onChange={(v) => setF({ ...f, hours: { ...f.hours, [a.key]: v } })} />
            </div>
          ))}
        </div>
      </fieldset>
      <Rating id="epm" label="Energy this evening 精神" value={f.energy_pm} onChange={(v) => setF({ ...f, energy_pm: v })} low="Drained" high="Full" />
      <Rating id="mpm" label="Mood today overall 心情" value={f.mood_pm} onChange={(v) => setF({ ...f, mood_pm: v })} low="Low" high="Great" />
      <div className="field">
        <label className="field-l" htmlFor="win">One win today 今日小勝利</label>
        <input id="win" value={f.win} onChange={(e) => setF({ ...f, win: e.target.value })} placeholder="Something that went well, however small" />
      </div>
      <div className="field">
        <label className="field-l" htmlFor="slip">What slipped, and why 今日不足</label>
        <input id="slip" value={f.slipped} onChange={(e) => setF({ ...f, slipped: e.target.value })} placeholder="No judgement, just notice it" />
      </div>
      <div className="field">
        <label className="field-l" htmlFor="better">0.1% better tomorrow 明日進步 0.1%</label>
        <input id="better" value={f.better_tomorrow} onChange={(e) => setF({ ...f, better_tomorrow: e.target.value })} placeholder="One small change for tomorrow" />
      </div>
      <div className="field">
        <label className="field-l" htmlFor="enote">Note 備註 (optional)</label>
        <textarea id="enote" rows={2} value={f.evening_note} onChange={(e) => setF({ ...f, evening_note: e.target.value })} />
      </div>
      <SaveRow msg={msg} />
    </form>
  )
}

// ================================================================= habits and time
function Habits({ habits, byDay, today, lang }: { habits: Habit[]; byDay: Map<string, Checkin>; today: string; lang: Lang }) {
  return (
    <section className="sub-panel span-2">
      <h3>Habits 習慣 <span className="sub inline">last 4 weeks · never miss twice 不要連續錯過兩次</span></h3>
      <ul className="habits">
        {habits.map((h) => {
          const s = habitStatus(h, byDay, today)
          return (
            <li key={h.key}>
              <div className="h-name">{h.label} <span className="tc">{h.label_zh}</span><span className="sub">{h.every === 'week' ? (h.per_week > 1 ? `${h.per_week} times a week` : 'Once a week') : h.per_week >= 7 ? 'Every day' : `${h.per_week} days a week`}{h.auto === 'bedtime' ? ' · from your bed time each morning' : ''}</span></div>
              <div className={`h-grid ${h.every === 'week' ? 'weeks' : ''}`} aria-label={`${h.label}, last ${h.every === 'week' ? '8 weeks' : '28 days'}`}>
                {s.grid.map((g) => <span key={g.day} className={`hd ${g.mark}`} title={`${h.every === 'week' ? `Week of ${g.day}` : g.day}: ${g.mark}`} />)}
              </div>
              <div className="h-stat">
                <b>{s.streak}</b><span>{h.per_week >= 7 && h.every !== 'week' ? 'day streak' : 'week streak'}</span>
                <span className="sub">This week {s.thisWeek}/{h.every === 'week' ? Math.max(1, h.per_week) : h.per_week >= 7 ? 7 : h.per_week}</span>
              </div>
              {s.warning && <p className="h-warn">{lang === 'zh' ? s.warning_zh : s.warning}</p>}
            </li>
          )
        })}
      </ul>
      <p className="sub legend"><span className="hd done" /> done <span className="hd missed" /> missed <span className="hd unknown" /> no evening check-in <span className="hd today" /> today</p>
    </section>
  )
}

function TimeBars({ areas, checkins, today }: { areas: Area[]; checkins: Checkin[]; today: string }) {
  const ws = weekStart(today)
  const week = hoursByArea(areas, checkins, ws, addDays(ws, 6))
  const last = hoursByArea(areas, checkins, addDays(ws, -7), addDays(ws, -1))
  const max = Math.max(1, ...week.map((w) => Math.max(w.hours, w.area.target)), ...last.map((w) => w.hours))
  const daysIn = daysBetween(ws, today) + 1
  return (
    <section className="sub-panel span-2">
      <h3>Where your time goes this week 本週時間 <span className="sub inline">from your evening check-ins · day {daysIn} of 7</span></h3>
      <ul className="tbars">
        {week.map((w, i) => {
          const pace = w.area.target * (daysIn / 7)
          const tone = w.hours >= w.area.target ? 'met' : w.hours >= pace * 0.8 ? 'ok' : 'low'
          return (
            <li key={w.area.key}>
              <span className="tb-name">{w.area.label} <span className="tc">{w.area.label_zh}</span></span>
              <span className="tb-track">
                <span className={`tb-fill ${tone}`} style={{ width: `${(w.hours / max) * 100}%` }} />
                <span className="tb-target" style={{ left: `${(w.area.target / max) * 100}%` }} title={`Target ${w.area.target} h`} />
              </span>
              <span className="tb-num">{w.hours} / {w.area.target} h<span className="sub">last week {last[i].hours} h</span></span>
            </li>
          )
        })}
      </ul>
      <p className="sub">Bar: hours this week. Line: your weekly target. Amber means behind pace for this point in the week.</p>
    </section>
  )
}

// ================================================================= settings
function EditList<T extends { key: string; label: string; label_zh: string }>({ title, rows, numKey, numLabel, onSave }: {
  title: string; rows: T[]; numKey: keyof T & string; numLabel: string; onSave: (rows: T[]) => Promise<void>
}) {
  const [list, setList] = useState(rows)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => setList(rows), [rows])
  const upd = (i: number, patch: Partial<T>) => setList(list.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    const kept = list.filter((r) => r.label.trim())
    // New rows get a key from their English name, so the data stays readable.
    const named = kept.map((r) => (/^new(_\d+)?$/.test(r.key) ? { ...r, key: slugKey(r.label, kept.map((x) => x.key)) } : r))
    try { await onSave(named); setMsg('Saved 已儲存') } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="edit-list" onSubmit={submit}>
      <h4>{title}</h4>
      {list.map((r, i) => (
        <div className="edit-row" key={r.key}>
          <input aria-label="Name in English" value={r.label} onChange={(e) => upd(i, { label: e.target.value } as Partial<T>)} />
          <input aria-label="Name in Chinese" className="tc-text" value={r.label_zh} onChange={(e) => upd(i, { label_zh: e.target.value } as Partial<T>)} />
          <label className="num-l">{numLabel}<input type="number" min={0} max={numKey === 'per_week' ? 7 : 100} value={Number(r[numKey])} onChange={(e) => upd(i, { [numKey]: Number(e.target.value) } as Partial<T>)} /></label>
          <button type="button" className="act" onClick={() => setList(list.filter((_, k) => k !== i))} aria-label={`Remove ${r.label}`}>Remove</button>
        </div>
      ))}
      <div className="form-row">
        <button type="button" className="btn ghost" onClick={() => setList([...list, { key: slugKey('new', list.map((r) => r.key)), label: '', label_zh: '', [numKey]: numKey === 'per_week' ? 7 : 2 } as unknown as T])}>Add</button>
        <button type="submit" className="btn">Save 儲存</button>
        {msg && <span className="sub" role="status">{msg}</span>}
      </div>
    </form>
  )
}

// ================================================================= page
export function MePage({ settings, checkins, onReload, onSaveSettings, lang }: {
  settings: BoardSettings
  checkins: Checkin[]
  onReload: () => void
  onSaveSettings: (patch: Partial<BoardSettings>) => Promise<void>
  lang: Lang
}) {
  const today = vanDate()
  const [which, setWhich] = useState<'today' | 'yesterday'>('today')
  const day = which === 'today' ? today : addDays(today, -1)
  const byDay = useMemo(() => new Map(checkins.map((c) => [c.day, c])), [checkins])
  const c = byDay.get(day) ?? emptyCheckin(day)
  const prev = byDay.get(addDays(day, -1))
  const n = Math.max(1, daysBetween(settings.journey_start, today) + 1)
  const eveningFirst = which === 'yesterday' || vanHour() >= 15
  const habits = settings.habits ?? []
  const areas = settings.areas ?? []

  const morning = <Morning key={`m-${day}`} day={day} c={c} prev={prev} onSaved={onReload} />
  const evening = <Evening key={`e-${day}`} day={day} c={c} habits={habits} areas={areas} onSaved={onReload} byDay={byDay} />

  return (
    <main className="detail me">
      <div className="journey">
        <div>
          <span className="big">Day {n}</span><span className="sub inline"> of 1000 · 第 {n} 日</span>
          <p className="sub">0.1% better each day: ×{Math.pow(1.001, n).toFixed(3)} today, ×{Math.pow(1.001, 1000).toFixed(2)} by day 1000.</p>
        </div>
        <div className="day-switch" role="group" aria-label="Which day to record">
          <button type="button" className={which === 'today' ? 'on' : ''} aria-pressed={which === 'today'} onClick={() => setWhich('today')}>Today 今日</button>
          <button type="button" className={which === 'yesterday' ? 'on' : ''} aria-pressed={which === 'yesterday'} onClick={() => setWhich('yesterday')}>Yesterday 昨日</button>
        </div>
      </div>
      <div className="detail-grid">
        {eveningFirst ? <>{evening}{morning}</> : <>{morning}{evening}</>}
        <Habits habits={habits} byDay={byDay} today={today} lang={lang} />
        <TimeBars areas={areas} checkins={checkins} today={today} />
        <details className="sub-panel span-2 settings-box">
          <summary>Edit habits, life areas and targets 修改習慣及目標</summary>
          <div className="detail-grid">
            <EditList title="Habits 習慣" rows={habits} numKey="per_week" numLabel="Days a week" onSave={(rows) => onSaveSettings({ habits: rows })} />
            <EditList title="Life areas 生活範疇" rows={areas} numKey="target" numLabel="Hours a week" onSave={(rows) => onSaveSettings({ areas: rows })} />
          </div>
        </details>
      </div>
    </main>
  )
}
