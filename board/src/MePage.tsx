import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Area, BoardSettings, CalEvent, Experiment, ExpMeasure, Focus, Habit } from './data'
import type { Checkin, HabitStatus } from './me'
import { addDays, daysBetween, emptyCheckin, fromLateness, habitStatus, hoursByArea, lateness, saveCheckin, sleepFrom, slugKey, usualWake, vanDate, vanHour, weekStart, windDownWeek } from './me'
import { busyDay, EXP_IDEAS, experimentResult, expKey, findings, MEASURES } from './meInsights'

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

// ================================================================= small steps
type Step = boolean | 'tiny' | undefined
const stepLabel = (v: Step) => (v === 'tiny' ? 'tiny' : v ? 'full' : 'not yet')

/** Not yet / Tiny / Full: both tiny and full count as done. */
function StepPick({ h, value, onChange }: { h: Habit; value: Step; onChange: (v: Step) => void }) {
  const opts: { v: Step; en: string; zh: string }[] = [{ v: undefined, en: 'Not today', zh: '今日未做' }, { v: 'tiny', en: 'Tiny', zh: '小步' }, { v: true, en: 'Full', zh: '完整' }]
  return (
    <span className="step-pick" role="group" aria-label={`${h.label}: ${stepLabel(value)}`}>
      {opts.map((o) => {
        const on = (o.v ?? false) === (value ?? false)
        return <button key={o.en} type="button" className={on ? `on ${o.v === 'tiny' ? 'tiny' : o.v ? 'full' : ''}` : ''} aria-pressed={on} onClick={() => onChange(o.v)}>{o.en} <span className="tc">{o.zh}</span></button>
      })}
    </span>
  )
}

function HabitLine({ h, focus }: { h: Habit; focus: boolean }) {
  return (
    <span className="hl">
      <span className="hl-name">{focus && <span className="focus-chip">Focus 重點</span>}{h.label} <span className="tc">{h.label_zh}</span></span>
      {(h.after || h.tiny) && <span className="sub">{h.after ? `${h.after}: ` : ''}{h.tiny ? <>tiny version <b>{h.tiny}</b></> : null}</span>}
      {h.treat && <span className="sub">Pair it with: {h.treat}</span>}
    </span>
  )
}

function BusyNote({ busy }: { busy: { busy: boolean; why: string } }) {
  if (!busy.busy) return null
  return <p className="busy-note">Busy day ({busy.why}). The tiny versions are enough today, and they still count. <span className="tc">今日較忙，做小步已足夠，一樣算數。</span></p>
}

/** Morning: habits that follow the morning check-in, saved as soon as they are ticked. */
function MorningSteps({ day, c, habits, focusKey, onSaved }: { day: string; c: Checkin; habits: Habit[]; focusKey: string | null; onSaved: () => void }) {
  const list = habits.filter((h) => !h.auto && h.anchor === 'am')
  const [msg, setMsg] = useState<string | null>(null)
  if (!list.length) return null
  const set = async (h: Habit, v: Step) => {
    setMsg('Saving…')
    const next = { ...c.habits }
    if (v) next[h.key] = v; else delete next[h.key]
    try { await saveCheckin(day, { habits: next }); setMsg(null); onSaved() } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <div className="field">
      <span className="field-l">Small steps this morning 今朝小步</span>
      <ul className="step-list">
        {list.map((h) => <li key={h.key}><HabitLine h={h} focus={h.key === focusKey} /><StepPick h={h} value={c.habits[h.key]} onChange={(v) => set(h, v)} /></li>)}
      </ul>
      {msg && <span className="sub" role="status">{msg}</span>}
    </div>
  )
}

// ================================================================= morning
function Morning({ day, c, prev, habits, focusKey, busy, onSaved }: { day: string; c: Checkin; prev: Checkin | undefined; habits: Habit[]; focusKey: string | null; busy: { busy: boolean; why: string }; onSaved: () => void }) {
  const [f, setF] = useState(c)
  const [msg, setMsg] = useState<string | null>(null)
  const pr = [...f.priorities, '', '', ''].slice(0, 3)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    try {
      await saveCheckin(day, {
        bed_time: f.bed_time, wake_time: f.wake_time, wind_down: f.wind_down, wine_glasses: f.wine_glasses,
        sleep_hours: sleepFrom(f.bed_time, f.wake_time) ?? f.sleep_hours, sleep_quality: f.sleep_quality, energy_am: f.energy_am, mood_am: f.mood_am,
        priorities: pr.map((p) => p.trim()), morning_note: f.morning_note, morning_at: new Date().toISOString(),
      })
      setMsg('Saved 已儲存')
      onSaved()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="ci-card" onSubmit={submit}>
      <h3>Morning check-in <span className="tc">早上記錄</span>{c.morning_at && <span className="done-chip">Done ✓</span>}</h3>
      <BusyNote busy={busy} />
      {prev?.better_tomorrow && <p className="carry"><span className="lbl">Yesterday you said 昨日的 0.1%</span>{prev.better_tomorrow}</p>}
      <div className="field">
        <span className="field-l">Last night 昨晚 <span className="sub inline">a record, not a test</span></span>
        <div className="sleep-times">
          <label htmlFor="wind">Started winding down 開始放鬆<QuarterTime id="wind" value={f.wind_down} startHour={20} onChange={(v) => setF({ ...f, wind_down: v })} /></label>
          <label htmlFor="bed">Went to bed 上床<QuarterTime id="bed" value={f.bed_time} startHour={20} onChange={(v) => setF({ ...f, bed_time: v })} /></label>
          <label htmlFor="wake">Woke up 起床<QuarterTime id="wake" value={f.wake_time} startHour={4} onChange={(v) => setF({ ...f, wake_time: v })} /></label>
          <span className="sleep-total">{sleepFrom(f.bed_time, f.wake_time) !== null ? <><b>{sleepFrom(f.bed_time, f.wake_time)}</b> h</> : <span className="sub inline">hours worked out for you</span>}</span>
        </div>
        <label className="wine-row" htmlFor="wine">Red wine, glasses 紅酒（杯）<Stepper id="wine" value={f.wine_glasses ?? 0} max={10} onChange={(v) => setF({ ...f, wine_glasses: v })} />
          {f.wine_glasses === null && <button type="button" className="linkish" onClick={() => setF({ ...f, wine_glasses: 0 })}>None 沒有</button>}</label>
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
      <MorningSteps day={day} c={c} habits={habits} focusKey={focusKey} onSaved={onSaved} />
    </form>
  )
}

// ================================================================= evening
function Evening({ day, c, habits, areas, focusKey, busy, experiments, onSaved, byDay }: {
  day: string; c: Checkin; habits: Habit[]; areas: Area[]; focusKey: string | null; busy: { busy: boolean; why: string }; experiments: Experiment[]; onSaved: () => void; byDay: Map<string, Checkin>
}) {
  const weekDone = (h: Habit) => Array.from({ length: 7 }, (_, k) => addDays(weekStart(day), k)).filter((d) => d < day && byDay.get(d)?.habits[h.key]).length
  const [f, setF] = useState(c)
  const [msg, setMsg] = useState<string | null>(null)
  const pri = f.priorities.filter((p) => p.trim())
  const total = areas.reduce((s, a) => s + (Number(f.hours[a.key]) || 0), 0)
  // Only the steps changed here are saved over the latest record, so a step ticked in the morning is kept.
  const [edits, setEdits] = useState<Record<string, Step>>({})
  const stepOf = (key: string): Step => (key in edits ? edits[key] : c.habits[key])
  const setStep = (key: string, v: Step) => setEdits({ ...edits, [key]: v })
  const merged = () => { const n = { ...c.habits }; for (const [k, v] of Object.entries(edits)) { if (v) n[k] = v; else delete n[k] } return n }
  // The focus habit first, then evening habits, then the rest. Morning habits are ticked in the morning but can be changed here.
  const rank = (h: Habit) => (h.key === focusKey ? 0 : h.anchor === 'pm' ? 1 : h.anchor === 'am' ? 3 : 2)
  const list = habits.filter((h) => !h.auto).sort((a, b) => rank(a) - rank(b))
  const running = experiments.filter((e) => !e.stopped && day >= e.start && day <= addDays(e.start, e.days - 1))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    try {
      await saveCheckin(day, {
        energy_pm: f.energy_pm, mood_pm: f.mood_pm, priorities_done: f.priorities_done, habits: merged(), hours: f.hours,
        win: f.win, slipped: f.slipped, better_tomorrow: f.better_tomorrow, evening_note: f.evening_note, evening_at: new Date().toISOString(),
      })
      setMsg('Saved 已儲存')
      setEdits({})
      onSaved()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="ci-card" onSubmit={submit}>
      <h3>Evening check-in <span className="tc">晚上記錄</span>{c.evening_at && <span className="done-chip">Done ✓</span>}</h3>
      <BusyNote busy={busy} />
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
        <legend className="field-l">Small steps today 今日小步 <span className="sub inline">the tiny version counts</span></legend>
        <ul className="step-list">
          {list.map((h) => (
            <li key={h.key}>
              <HabitLine h={h} focus={h.key === focusKey} />
              {h.every === 'week' && <span className="sub">This week {weekDone(h) + (stepOf(h.key) ? 1 : 0)}/{Math.max(1, h.per_week)}</span>}
              <StepPick h={h} value={stepOf(h.key)} onChange={(v) => setStep(h.key, v)} />
            </li>
          ))}
        </ul>
      </fieldset>
      {running.length > 0 && (
        <fieldset className="field">
          <legend className="field-l">Experiments 小實驗</legend>
          {running.map((e) => (
            <label key={e.key} className="check"><input type="checkbox" checked={!!stepOf(expKey(e))} onChange={(ev) => setStep(expKey(e), ev.target.checked || undefined)} /> {e.action}
              <span className="sub inline"> day {daysBetween(e.start, day) + 1} of {e.days}</span></label>
          ))}
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
        <label className="field-l" htmlFor="slip">What got in the way 有甚麼阻礙</label>
        <input id="slip" value={f.slipped} onChange={(e) => setF({ ...f, slipped: e.target.value })} placeholder="No judgement, just notice it. It helps to adjust the steps." />
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

// ================================================================= focus habit and the rest
const FOCUS_DAYS = 21

function Grid({ h, s }: { h: Habit; s: HabitStatus }) {
  return (
    <div className={`h-grid ${h.every === 'week' ? 'weeks' : ''}`} aria-label={`${h.label}, last ${h.every === 'week' ? '8 weeks' : '28 days'}`}>
      {s.grid.map((g) => <span key={g.day} className={`hd ${g.mark === 'missed' ? 'rest' : g.mark}`} title={`${h.every === 'week' ? `Week of ${g.day}` : g.day}: ${g.mark === 'missed' ? 'rest day' : g.mark}`} />)}
    </div>
  )
}

function Habits({ habits, byDay, today, lang, focus, onFocus }: { habits: Habit[]; byDay: Map<string, Checkin>; today: string; lang: Lang; focus: Focus | null; onFocus: (key: string) => Promise<void> }) {
  const fh = habits.find((h) => h.key === focus?.key) ?? null
  const rest = habits.filter((h) => h !== fh)
  const [pick, setPick] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const choose = async () => { if (!pick) return; setMsg('Saving…'); try { await onFocus(pick); setMsg(null); setPick('') } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) } }
  let focusCard = null
  if (fh && focus) {
    const s = habitStatus(fh, byDay, today)
    const dayN = Math.min(FOCUS_DAYS, daysBetween(focus.since, today) + 1)
    const span = Array.from({ length: FOCUS_DAYS }, (_, i) => addDays(focus.since, i))
    const marks = span.map((d) => ({ d, m: d > today ? 'future' : (s.grid.find((g) => g.day === d)?.mark ?? 'unknown') }))
    const done = marks.filter((x) => x.m === 'done' || x.m === 'tiny').length
    const finished = daysBetween(focus.since, today) + 1 > FOCUS_DAYS
    focusCard = (
      <div className="focus-card">
        <div className="focus-head">
          <span className="focus-chip">Focus 重點</span>
          <b>{fh.label}</b> <span className="tc">{fh.label_zh}</span>
          <span className="sub inline">{finished ? `${FOCUS_DAYS} days done` : `day ${dayN} of ${FOCUS_DAYS}`}</span>
        </div>
        {fh.why && <p className="focus-why">Why: {fh.why}</p>}
        <p className="sub">{fh.after ? `${fh.after}. ` : ''}{fh.tiny ? `Tiny version: ${fh.tiny}. ` : ''}{fh.treat ? `Pair it with: ${fh.treat}.` : ''}</p>
        <div className="focus-grid" aria-label={`${fh.label}, ${FOCUS_DAYS} days from ${focus.since}`}>
          {marks.map((x) => <span key={x.d} className={`hd ${x.m === 'missed' ? 'rest' : x.m}`} title={`${x.d}: ${x.m === 'missed' ? 'rest day' : x.m}`} />)}
        </div>
        <p className="focus-msg"><b>{done}</b> {done === 1 ? 'time' : 'times'} since {focus.since}. {lang === 'zh' ? s.note_zh ?? '' : s.note ?? ''}
          {finished && ' Three weeks done. Keep it as it is, or choose a new focus below; this one stays in your list.'}</p>
      </div>
    )
  }
  return (
    <section className="sub-panel span-2">
      <h3>Habits 習慣 <span className="sub inline">one focus at a time · the tiny version counts · every step is progress</span></h3>
      {focusCard ?? <p className="sub">Choose one habit to focus on for the next three weeks.</p>}
      <div className="form-row focus-pick">
        <label htmlFor="focus-sel" className="sub">{fh ? 'Change the focus' : 'Focus habit'}</label>
        <select id="focus-sel" className="fin-year" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose…</option>
          {habits.filter((h) => h.key !== fh?.key).map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
        </select>
        <button type="button" className="btn ghost" disabled={!pick} onClick={choose}>Start 開始</button>
        {msg && <span className="sub" role="status">{msg}</span>}
      </div>
      <h4 className="keep-going">Keep going if you can 有空就做</h4>
      <ul className="habits">
        {rest.map((h) => {
          const s = habitStatus(h, byDay, today)
          const freq = h.auto === 'winddown' ? `Goal: start winding down by ${s.target ?? ''}` : h.auto === 'wake' ? `Usual wake-up time ${s.target ?? 'not known yet'}, within 30 minutes` : h.every === 'week' ? (h.per_week > 1 ? `${h.per_week} times a week` : 'Once a week') : h.per_week >= 7 ? 'Every day' : `${h.per_week} days a week`
          return (
            <li key={h.key}>
              <div className="h-name">{h.label} <span className="tc">{h.label_zh}</span><span className="sub">{freq}{h.auto ? ' · from the morning check-in' : ''}</span></div>
              <Grid h={h} s={s} />
              <div className="h-stat">
                <b>{s.last28}</b><span>{h.every === 'week' ? 'times in 8 weeks' : 'days in 4 weeks'}</span>
                <span className="sub">This week {s.thisWeek}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="sub legend"><span className="hd done" /> full <span className="hd tiny" /> tiny <span className="hd rest" /> rest day <span className="hd unknown" /> no record <span className="hd today" /> today</p>
    </section>
  )
}

// ================================================================= sleep record
function SleepRecord({ habits, byDay, today, onSaveHabits }: { habits: Habit[]; byDay: Map<string, Checkin>; today: string; onSaveHabits: (rows: Habit[]) => Promise<void> }) {
  const wd = habits.find((h) => h.auto === 'winddown')
  const wk = habits.find((h) => h.auto === 'wake')
  const [msg, setMsg] = useState<string | null>(null)
  const nights = Array.from({ length: 14 }, (_, i) => addDays(today, -i)).map((d) => byDay.get(d)).filter((c): c is Checkin => !!c && !!(c.bed_time || c.wake_time || c.wind_down || c.wine_glasses !== null))
  const week = wd ? windDownWeek(wd, byDay, today) : null
  const setGoal = async (t: string) => {
    if (!wd) return
    setMsg('Saving…')
    try { await onSaveHabits(habits.map((h) => (h.key === wd.key ? { ...h, by: t } : h))); setMsg('Saved 已儲存') } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  // Follow real life: start from the usual time, and move 15 minutes earlier after 5 good nights out of 7.
  let advice: { text: string; to: string } | null = null
  if (wd && week && week.recorded >= 5) {
    const goal = lateness(wd.by ?? '00:00')
    if (week.met >= 5) advice = { text: `${week.met} of the last ${week.recorded} nights on time. Ready to move the wind-down goal 15 minutes earlier?`, to: fromLateness(goal - 15) }
    else if (week.met <= 1 && week.usual && lateness(week.usual) > goal) advice = { text: `Your usual wind-down time lately is ${hm(week.usual)}. Start from there and move earlier step by step?`, to: week.usual }
  }
  const wine7 = nights.filter((c) => c.day > addDays(today, -7) && c.wine_glasses !== null)
  return (
    <section className="sub-panel span-2">
      <h3>Sleep record 睡眠記錄 <span className="sub inline">last 14 nights · a record to learn from, not a test</span></h3>
      <div className="stats wide">
        {wd && <div className="stat"><b>{hm(wd.by ?? '00:00')}</b><span>Wind-down goal 放鬆目標</span></div>}
        {wk && <div className="stat"><b>{usualWake(wk, byDay, addDays(today, 1)) ? hm(usualWake(wk, byDay, addDays(today, 1))!) : '–'}</b><span>Usual wake-up 平常起床</span></div>}
        {week && <div className="stat"><b>{week.met}/{week.recorded}</b><span>Wound down on time, last 7 nights</span></div>}
        <div className="stat"><b>{wine7.length ? wine7.reduce((s, c) => s + (c.wine_glasses ?? 0), 0) : '–'}</b><span>Glasses of red wine, last 7 nights</span></div>
      </div>
      {advice && <p className="carry">{advice.text} <button type="button" className="btn ghost" onClick={() => setGoal(advice!.to)}>Set goal to {hm(advice.to)}</button></p>}
      {msg && <span className="sub" role="status">{msg}</span>}
      {nights.length ? (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Morning of</th><th>Wind-down</th><th>Bed</th><th>Woke</th><th className="n">Hours</th><th className="n">Wine</th><th className="n">Quality</th></tr></thead>
          <tbody>{nights.map((c) => (
            <tr key={c.day}>
              <td>{shortDay(c.day)}</td>
              <td>{c.wind_down ? hm(c.wind_down) : '–'}</td>
              <td>{c.bed_time ? hm(c.bed_time) : '–'}</td>
              <td>{c.wake_time ? hm(c.wake_time) : '–'}</td>
              <td className="n">{sleepFrom(c.bed_time, c.wake_time) ?? '–'}</td>
              <td className="n">{c.wine_glasses ?? '–'}</td>
              <td className="n">{c.sleep_quality ?? '–'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="sub">Your nights appear here after the morning check-ins.</p>}
      <p className="sub">Red wine may help you fall asleep sooner, but it often makes the second half of the night lighter. The comparison below shows what it does for you.</p>
    </section>
  )
}

// ================================================================= what your data shows
function Evidence({ habits, checkins, today, lang }: { habits: Habit[]; checkins: Checkin[]; today: string; lang: Lang }) {
  const { found, waiting } = useMemo(() => findings(habits, checkins, today), [habits, checkins, today])
  return (
    <section className="sub-panel span-2">
      <h3>What your own data shows 你的數據 <span className="sub inline">from your check-ins, last 4 months</span></h3>
      {found.length ? <ul className="evidence">{found.slice(0, 8).map((x, i) => <li key={i}>{lang === 'zh' ? x.text_zh : x.text}</li>)}</ul>
        : <p className="sub">No clear patterns yet. They appear once there are a few days on each side to compare.</p>}
      {waiting.length > 0 && <details className="sub"><summary>Still collecting 仍在收集 ({waiting.length})</summary><ul>{waiting.map((w, i) => <li key={i}>{lang === 'zh' ? w.text_zh : w.text}</li>)}</ul></details>}
      <p className="sub">These are your own averages, not proof of cause, but they show what tends to go with your better days.</p>
    </section>
  )
}

// ================================================================= experiments
function Experiments({ list, checkins, today, lang, onSave }: { list: Experiment[]; checkins: Checkin[]; today: string; lang: Lang; onSave: (rows: Experiment[]) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [act, setAct] = useState('')
  const [m, setM] = useState<ExpMeasure>('sleep_quality')
  const [msg, setMsg] = useState<string | null>(null)
  const save = async (rows: Experiment[]) => { setMsg('Saving…'); try { await onSave(rows); setMsg(null) } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) } }
  const start = async (e: FormEvent) => {
    e.preventDefault()
    if (!act.trim()) return
    await save([...list, { key: slugKey(act, list.map((x) => x.key)), question: q.trim() || act.trim(), action: act.trim(), measure: m, start: today, days: 14 }])
    setQ(''); setAct('')
  }
  const sorted = [...list].sort((a, b) => b.start.localeCompare(a.start))
  return (
    <section className="sub-panel span-2">
      <h3>Two-week experiments 兩週小實驗 <span className="sub inline">try something, tick it each evening, see what it does for you</span></h3>
      {sorted.length ? (
        <ul className="exp-list">
          {sorted.map((e) => {
            const r = experimentResult(e, checkins, today)
            return (
              <li key={e.key}>
                <b>{e.question}</b>
                <span className="sub">{e.action} · measured by {MEASURES[e.measure].label.toLowerCase()} · {r.ended ? `finished, done on ${r.did} days` : `day ${r.day} of ${e.days}, done on ${r.did} days`}</span>
                <span>{lang === 'zh' ? r.text_zh : r.text}</span>
                <span className="exp-act">
                  {!r.ended && <button type="button" className="act" onClick={() => save(list.map((x) => (x.key === e.key ? { ...x, stopped: today } : x)))}>Stop early</button>}
                  <button type="button" className="act" onClick={() => save(list.filter((x) => x.key !== e.key))}>Remove</button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : <p className="sub">No experiments yet. Pick an idea below or write your own.</p>}
      <form className="exp-form" onSubmit={start}>
        <div className="exp-ideas">{EXP_IDEAS.map((x) => <button key={x.action} type="button" className="btn ghost" onClick={() => { setQ(x.question); setAct(x.action); setM(x.measure) }}>{x.question}</button>)}</div>
        <label>Question 問題<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you want to find out?" /></label>
        <label>What to do on the days you try it 要做甚麼<input value={act} onChange={(e) => setAct(e.target.value)} placeholder="For example: 10-minute walk outside after waking" /></label>
        <label>Measure 量度<select className="fin-year" value={m} onChange={(e) => setM(e.target.value as ExpMeasure)}>{(Object.keys(MEASURES) as ExpMeasure[]).map((k) => <option key={k} value={k}>{MEASURES[k].label}</option>)}</select></label>
        <div className="form-row"><button type="submit" className="btn" disabled={!act.trim()}>Start a 2-week experiment 開始</button>{msg && <span className="sub" role="status">{msg}</span>}</div>
      </form>
    </section>
  )
}

// ================================================================= habit settings
function HabitEditor({ rows, onSave }: { rows: Habit[]; onSave: (rows: Habit[]) => Promise<void> }) {
  const [list, setList] = useState(rows)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => setList(rows), [rows])
  const upd = (i: number, patch: Partial<Habit>) => setList(list.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    const kept = list.filter((r) => r.label.trim())
    const named = kept.map((r) => (/^new(_\d+)?$/.test(r.key) ? { ...r, key: slugKey(r.label, kept.map((x) => x.key)) } : r))
    try { await onSave(named); setMsg('Saved 已儲存') } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <form className="edit-list span-2" onSubmit={submit}>
      <h4>Habits 習慣</h4>
      {list.map((r, i) => (
        <details className="habit-edit" key={r.key}>
          <summary>{r.label || 'New habit'} <span className="tc">{r.label_zh}</span></summary>
          <div className="habit-edit-grid">
            <label>Name<input value={r.label} onChange={(e) => upd(i, { label: e.target.value })} /></label>
            <label>Chinese name<input className="tc-text" value={r.label_zh} onChange={(e) => upd(i, { label_zh: e.target.value })} /></label>
            {r.auto === 'winddown' || r.auto === 'bedtime' ? (
              <label>Goal time<QuarterTime id={`by-${r.key}`} value={r.by ?? '00:00'} startHour={20} onChange={(v) => upd(i, { by: v ?? '00:00' })} /></label>
            ) : r.auto === 'wake' ? (
              <label>Starting usual time<QuarterTime id={`by-${r.key}`} value={r.by ?? null} startHour={4} onChange={(v) => upd(i, { by: v ?? undefined })} /></label>
            ) : (<>
              <label>How often<select className="fin-year" value={r.every === 'week' ? 'week' : 'day'} onChange={(e) => upd(i, { every: e.target.value as 'day' | 'week' })}><option value="day">Days a week</option><option value="week">Times a week, any days</option></select></label>
              <label>Number<input type="number" min={1} max={7} value={r.per_week} onChange={(e) => upd(i, { per_week: Number(e.target.value) })} /></label>
              <label>Tiny version<input value={r.tiny ?? ''} onChange={(e) => upd(i, { tiny: e.target.value })} placeholder="Two minutes or less" /></label>
              <label>Tiny version, Chinese<input className="tc-text" value={r.tiny_zh ?? ''} onChange={(e) => upd(i, { tiny_zh: e.target.value })} /></label>
              <label>Shown with<select className="fin-year" value={r.anchor ?? ''} onChange={(e) => upd(i, { anchor: (e.target.value || undefined) as Habit['anchor'] })}><option value="">Evening list only</option><option value="am">Morning check-in</option><option value="pm">Evening check-in</option></select></label>
              <label>After which routine<input value={r.after ?? ''} onChange={(e) => upd(i, { after: e.target.value })} placeholder="After the morning check-in" /></label>
              <label>Pair it with<input value={r.treat ?? ''} onChange={(e) => upd(i, { treat: e.target.value })} placeholder="Something you enjoy" /></label>
            </>)}
            <label className="wide">Why it matters<input value={r.why ?? ''} onChange={(e) => upd(i, { why: e.target.value })} /></label>
          </div>
          <button type="button" className="act" onClick={() => setList(list.filter((_, k) => k !== i))}>Remove</button>
        </details>
      ))}
      <div className="form-row">
        <button type="button" className="btn ghost" onClick={() => setList([...list, { key: slugKey('new', list.map((r) => r.key)), label: '', label_zh: '', per_week: 3 }])}>Add</button>
        <button type="submit" className="btn">Save 儲存</button>
        {msg && <span className="sub" role="status">{msg}</span>}
      </div>
    </form>
  )
}

// ================================================================= time
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
const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })

export function MePage({ settings, checkins, calendar, onReload, onSaveSettings, lang }: {
  settings: BoardSettings
  checkins: Checkin[]
  calendar?: CalEvent[]
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
  const n = Math.max(1, daysBetween(settings.journey_start, day) + 1)
  const dt = new Date(`${day}T12:00:00`)
  const dateEn = dt.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
  const dateZh = dt.toLocaleDateString('zh-Hant', { month: 'long', day: 'numeric', weekday: 'long' })
  const eveningFirst = which === 'yesterday' || vanHour() >= 15
  const habits = settings.habits ?? []
  const areas = settings.areas ?? []
  const experiments = settings.experiments ?? []
  const focus = settings.focus ?? null
  const focusKey = focus && habits.some((h) => h.key === focus.key) ? focus.key : null
  const busy = which === 'today' ? busyDay(calendar) : { busy: false, why: '' }

  const morning = <Morning key={`m-${day}`} day={day} c={c} prev={prev} habits={habits} focusKey={focusKey} busy={busy} onSaved={onReload} />
  const evening = <Evening key={`e-${day}`} day={day} c={c} habits={habits} areas={areas} focusKey={focusKey} busy={busy} experiments={experiments} onSaved={onReload} byDay={byDay} />

  return (
    <main className="detail me">
      <div className="journey">
        <div>
          <span className="big journey-date">{dateEn}</span> <span className="tc journey-zh">{dateZh}</span>
          <p className="sub">Day {n} of 1000 · 第 {n} 日 · 0.1% better each day: ×{Math.pow(1.001, n).toFixed(3)} {which === 'today' ? 'today' : 'yesterday'}, ×{Math.pow(1.001, 1000).toFixed(2)} by day 1000.</p>
        </div>
        <div className="day-switch" role="group" aria-label="Which day to record">
          <button type="button" className={which === 'today' ? 'on' : ''} aria-pressed={which === 'today'} onClick={() => setWhich('today')}>Today 今日</button>
          <button type="button" className={which === 'yesterday' ? 'on' : ''} aria-pressed={which === 'yesterday'} onClick={() => setWhich('yesterday')}>Yesterday 昨日</button>
        </div>
      </div>
      <div className="detail-grid">
        {eveningFirst ? <>{evening}{morning}</> : <>{morning}{evening}</>}
        <Habits habits={habits} byDay={byDay} today={today} lang={lang} focus={focusKey ? focus : null} onFocus={(key) => onSaveSettings({ focus: { key, since: today } })} />
        <SleepRecord habits={habits} byDay={byDay} today={today} onSaveHabits={(rows) => onSaveSettings({ habits: rows })} />
        <Evidence habits={habits} checkins={checkins} today={today} lang={lang} />
        <Experiments list={experiments} checkins={checkins} today={today} lang={lang} onSave={(rows) => onSaveSettings({ experiments: rows })} />
        <TimeBars areas={areas} checkins={checkins} today={today} />
        <details className="sub-panel span-2 settings-box">
          <summary>Edit habits, life areas and targets 修改習慣及目標</summary>
          <div className="detail-grid">
            <HabitEditor rows={habits} onSave={(rows) => onSaveSettings({ habits: rows })} />
            <EditList title="Life areas 生活範疇" rows={areas} numKey="target" numLabel="Hours a week" onSave={(rows) => onSaveSettings({ areas: rows })} />
          </div>
        </details>
      </div>
    </main>
  )
}
