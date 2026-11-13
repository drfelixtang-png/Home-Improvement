// Personal evidence for the Me page: what the check-ins show about habits, red wine, wind-down
// and wake-up, plus busy days from the calendar and the results of two-week experiments.
import type { CalEvent, Experiment, ExpMeasure, Habit } from './data'
import type { Checkin } from './me'
import { addDays, avg, daysBetween, fromLateness, habitStatus, lateness } from './me'

export interface Finding { text: string; text_zh: string; strength: number }
export interface Pending { text: string; text_zh: string }

const f1 = (x: number) => x.toFixed(1)
const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }
const MIN = 3 // days needed on each side before comparing

export const MEASURES: Record<ExpMeasure, { label: string; label_zh: string; next: boolean; time: boolean; higher: boolean }> = {
  sleep_quality: { label: 'Sleep quality', label_zh: '睡眠質素', next: true, time: false, higher: true },
  energy_am: { label: 'Morning energy', label_zh: '早上精神', next: true, time: false, higher: true },
  mood_am: { label: 'Morning mood', label_zh: '早上心情', next: true, time: false, higher: true },
  energy_pm: { label: 'Evening energy', label_zh: '晚上精神', next: false, time: false, higher: true },
  mood_pm: { label: 'Mood that day', label_zh: '當日心情', next: false, time: false, higher: true },
  bed_time: { label: 'Bed time', label_zh: '上床時間', next: true, time: true, higher: false },
  wind_down: { label: 'Wind-down time', label_zh: '開始放鬆時間', next: true, time: true, higher: false },
  wake_time: { label: 'Wake-up time', label_zh: '起床時間', next: true, time: true, higher: false },
}

/** The measure for an action taken on `day`: next-morning measures come from the next day's check-in. */
export function measureOf(m: ExpMeasure, day: string, byDay: Map<string, Checkin>): number | null {
  const c = byDay.get(MEASURES[m].next ? addDays(day, 1) : day)
  const v = c?.[m]
  if (v === null || v === undefined || v === '') return null
  return MEASURES[m].time ? lateness(String(v)) : Number(v)
}
const show = (m: ExpMeasure, v: number) => (MEASURES[m].time ? clock(fromLateness(Math.round(v / 5) * 5)) : f1(v))

function compare(m: ExpMeasure, yes: number[], no: number[]): { a: number; b: number; better: boolean; diff: number } | null {
  if (yes.length < MIN || no.length < MIN) return null
  const a = avg(yes)!, b = avg(no)!
  const diff = MEASURES[m].time ? (b - a) / 30 : a - b // half an hour earlier counts like one rating point
  return { a, b, better: MEASURES[m].higher ? a > b : a < b, diff }
}

/** What the last 120 days of check-ins show. Only comparisons with enough days on each side. */
export function findings(habits: Habit[], checkins: Checkin[], today: string): { found: Finding[]; waiting: Pending[] } {
  const byDay = new Map(checkins.map((c) => [c.day, c]))
  const found: Finding[] = []
  const waiting: Pending[] = []
  const days = checkins.map((c) => c.day).filter((d) => d < today)

  for (const h of habits.filter((x) => !x.auto)) {
    const done = days.filter((d) => byDay.get(d)?.evening_at && byDay.get(d)?.habits[h.key])
    const not = days.filter((d) => byDay.get(d)?.evening_at && !byDay.get(d)?.habits[h.key])
    let any = false
    for (const m of ['energy_pm', 'mood_pm', 'sleep_quality'] as ExpMeasure[]) {
      const r = compare(m, done.map((d) => measureOf(m, d, byDay)).filter((x): x is number => x !== null), not.map((d) => measureOf(m, d, byDay)).filter((x): x is number => x !== null))
      if (!r) continue
      any = true
      if (Math.abs(r.diff) < 0.3) continue
      const lbl = MEASURES[m]
      found.push({
        strength: r.diff,
        text: `On days you did "${h.label}", your ${lbl.label.toLowerCase()}${lbl.next ? ' the next morning' : ''} averaged ${show(m, r.a)}, compared with ${show(m, r.b)} on other days.`,
        text_zh: `做了「${h.label_zh || h.label}」的日子，${lbl.next ? '翌日' : ''}${lbl.label_zh}平均 ${show(m, r.a)}，其他日子 ${show(m, r.b)}。`,
      })
    }
    if (!any) waiting.push({ text: `"${h.label}": ${Math.max(0, MIN - done.length)} more done days and ${Math.max(0, MIN - not.length)} more other days to compare.`, text_zh: `「${h.label_zh || h.label}」：還需 ${Math.max(0, MIN - done.length)} 個完成日及 ${Math.max(0, MIN - not.length)} 個其他日子才可比較。` })
  }

  // Red wine is recorded on the morning after, so compare that same morning's record.
  const rows = checkins.filter((c) => c.wine_glasses !== null)
  const wine = rows.filter((c) => (c.wine_glasses ?? 0) > 0), dry = rows.filter((c) => (c.wine_glasses ?? 0) === 0)
  if (wine.length >= MIN && dry.length >= MIN) {
    for (const m of ['bed_time', 'sleep_quality', 'energy_am'] as ExpMeasure[]) {
      const pick = (cs: Checkin[]) => cs.map((c) => (MEASURES[m].time ? (c[m] ? lateness(String(c[m])) : null) : (c[m] as number | null))).filter((x): x is number => x !== null)
      const r = compare(m, pick(wine), pick(dry))
      if (!r || Math.abs(r.diff) < 0.3) continue
      const lbl = MEASURES[m]
      found.push({
        strength: Math.abs(r.diff),
        text: `After nights with red wine (${f1(avg(wine.map((c) => c.wine_glasses))!)} glasses on average), your ${lbl.label.toLowerCase()} was ${show(m, r.a)}, compared with ${show(m, r.b)} after nights without.`,
        text_zh: `有喝紅酒的晚上（平均 ${f1(avg(wine.map((c) => c.wine_glasses))!)} 杯）之後，${lbl.label_zh}為 ${show(m, r.a)}；沒有喝的晚上之後為 ${show(m, r.b)}。`,
      })
    }
  } else {
    waiting.push({ text: `Red wine: ${Math.max(0, MIN - wine.length)} more nights with wine and ${Math.max(0, MIN - dry.length)} more without to compare.`, text_zh: `紅酒：還需 ${Math.max(0, MIN - wine.length)} 個有喝及 ${Math.max(0, MIN - dry.length)} 個沒有喝的晚上才可比較。` })
  }

  // Winding down on time, and waking at the usual time.
  for (const h of habits.filter((x) => x.auto === 'winddown' || x.auto === 'wake')) {
    const s = habitStatus(h, byDay, today)
    const m: ExpMeasure = h.auto === 'winddown' ? 'sleep_quality' : 'energy_am'
    const yes: number[] = [], no: number[] = []
    for (const g of s.grid) {
      if (g.mark !== 'done' && g.mark !== 'missed') continue
      const v = h.auto === 'winddown' ? measureOf(m, g.day, byDay) : (byDay.get(g.day)?.energy_am ?? null)
      if (v !== null) (g.mark === 'done' ? yes : no).push(v)
    }
    const r = compare(m, yes, no)
    if (r && Math.abs(r.diff) >= 0.3) {
      found.push({
        strength: r.diff,
        text: h.auto === 'winddown' ? `Nights you started winding down by ${clock(h.by ?? '00:00')}: sleep quality ${show(m, r.a)}, compared with ${show(m, r.b)} on later nights.` : `Mornings you woke near your usual time: morning energy ${show(m, r.a)}, compared with ${show(m, r.b)} on other mornings.`,
        text_zh: h.auto === 'winddown' ? `在 ${clock(h.by ?? '00:00')} 前開始放鬆的晚上：睡眠質素 ${show(m, r.a)}，較晚的晚上 ${show(m, r.b)}。` : `在平常時間起床的早上：早上精神 ${show(m, r.a)}，其他早上 ${show(m, r.b)}。`,
      })
    } else if (!r) waiting.push({ text: `${h.label}: a few more mornings recorded on both sides to compare.`, text_zh: `${h.label_zh || h.label}：再多記錄幾個早上便可比較。` })
  }
  found.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
  return { found, waiting }
}

/** A day is busy when the calendar has teaching, at least 3 timed events, or at least 4 hours booked. */
export function busyDay(events: CalEvent[] | undefined): { busy: boolean; why: string } {
  if (!events?.length) return { busy: false, why: '' }
  const timed = events.filter((e) => e.start && !e.all_day)
  const mins = timed.reduce((s, e) => {
    if (!e.start || !e.end) return s + 60
    const [a, b] = [e.start, e.end].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m })
    return s + Math.max(0, b - a)
  }, 0)
  const teach = events.some((e) => /teach|class|lecture|HKU|SPACE|tutorial|seminar/i.test(e.title))
  if (teach) return { busy: true, why: 'teaching today' }
  if (timed.length >= 3) return { busy: true, why: `${timed.length} events today` }
  if (mins >= 240) return { busy: true, why: `${Math.round(mins / 60)} hours booked today` }
  return { busy: false, why: '' }
}

export const expKey = (e: Experiment) => `exp_${e.key}`

export interface ExpResult { day: number; ended: boolean; did: number; recorded: number; text: string; text_zh: string }

/** Progress and result of an experiment: days it was done compared with days it was not, and with the 2 weeks before. */
export function experimentResult(e: Experiment, checkins: Checkin[], today: string): ExpResult {
  const byDay = new Map(checkins.map((c) => [c.day, c]))
  const end = e.stopped ?? addDays(e.start, e.days - 1)
  const last = end < today ? end : today
  const day = Math.min(e.days, daysBetween(e.start, today) + 1)
  const span = Array.from({ length: Math.max(0, daysBetween(e.start, last) + 1) }, (_, i) => addDays(e.start, i))
  const did = span.filter((d) => byDay.get(d)?.habits[expKey(e)])
  const recorded = span.filter((d) => byDay.get(d)?.evening_at)
  const not = recorded.filter((d) => !byDay.get(d)?.habits[expKey(e)])
  const vals = (ds: string[]) => ds.map((d) => measureOf(e.measure, d, byDay)).filter((x): x is number => x !== null)
  const before = vals(Array.from({ length: 14 }, (_, i) => addDays(e.start, -14 + i)))
  const lbl = MEASURES[e.measure]
  const r = compare(e.measure, vals(did), vals(not))
  const rb = compare(e.measure, vals(did), before)
  const ended = end < today || !!e.stopped
  let text: string, text_zh: string
  if (r) {
    text = `${lbl.label}${lbl.next ? ' the next morning' : ''}: ${show(e.measure, r.a)} on days you did it, ${show(e.measure, r.b)} on days you did not. ${r.better && Math.abs(r.diff) >= 0.3 ? 'It seems to help.' : Math.abs(r.diff) < 0.3 ? 'No clear difference yet.' : 'It does not seem to help so far.'}`
    text_zh = `${lbl.next ? '翌日' : ''}${lbl.label_zh}：有做的日子 ${show(e.measure, r.a)}，沒有做的日子 ${show(e.measure, r.b)}。${r.better && Math.abs(r.diff) >= 0.3 ? '看來有幫助。' : Math.abs(r.diff) < 0.3 ? '暫時未見明顯分別。' : '暫時未見幫助。'}`
  } else if (rb) {
    text = `${lbl.label}: ${show(e.measure, rb.a)} on days you did it, compared with ${show(e.measure, rb.b)} in the 2 weeks before.`
    text_zh = `${lbl.label_zh}：有做的日子 ${show(e.measure, rb.a)}，之前兩週 ${show(e.measure, rb.b)}。`
  } else {
    text = `Done on ${did.length} days so far. The comparison appears after at least ${MIN} days each way.`
    text_zh = `至今做了 ${did.length} 日。各有至少 ${MIN} 日記錄後便會顯示比較。`
  }
  return { day, ended, did: did.length, recorded: recorded.length, text, text_zh }
}

export const EXP_IDEAS: { question: string; action: string; measure: ExpMeasure }[] = [
  { question: 'Does a 10-minute walk in the morning light help me wind down earlier?', action: '10-minute walk outside within an hour of waking', measure: 'wind_down' },
  { question: 'Do nights without red wine give me better sleep?', action: 'No red wine tonight', measure: 'sleep_quality' },
  { question: 'Does putting the phone on the charger when winding down help me sleep better?', action: 'Phone on the charger outside the bedroom when winding down', measure: 'sleep_quality' },
  { question: 'Does Baduanjin in the morning lift my energy for the day?', action: 'Baduanjin before 10 am', measure: 'energy_pm' },
]
