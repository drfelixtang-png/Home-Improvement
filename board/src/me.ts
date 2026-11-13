import { supabase } from '../../src/lib/supabase'
import type { Area, Habit } from './data'

// ------------------------------------------------------------------ check-ins
// One row per Vancouver date. The check-ins are the record of what actually happened;
// the calendar is only a plan.

export interface Checkin {
  day: string
  sleep_hours: number | null
  bed_time: string | null // 'HH:MM', the night before
  wake_time: string | null // 'HH:MM'
  sleep_quality: number | null
  energy_am: number | null
  mood_am: number | null
  priorities: string[]
  morning_note: string
  morning_at: string | null
  energy_pm: number | null
  mood_pm: number | null
  priorities_done: boolean[]
  habits: Record<string, boolean | 'tiny'> // true: the full version; 'tiny': the smallest version
  hours: Record<string, number>
  win: string
  slipped: string
  better_tomorrow: string
  evening_note: string
  evening_at: string | null
  wine_glasses: number | null // red wine the night before, glasses
  wind_down: string | null // 'HH:MM', when winding down started the night before
}

export const emptyCheckin = (day: string): Checkin => ({
  day, sleep_hours: null, bed_time: null, wake_time: null, sleep_quality: null, energy_am: null, mood_am: null, priorities: ['', '', ''],
  morning_note: '', morning_at: null, energy_pm: null, mood_pm: null, priorities_done: [false, false, false],
  habits: {}, hours: {}, win: '', slipped: '', better_tomorrow: '', evening_note: '', evening_at: null,
  wine_glasses: null, wind_down: null,
})

export async function loadCheckins(fromDay: string): Promise<Checkin[]> {
  const { data, error } = await supabase.from('checkins').select('*').gte('day', fromDay).order('day')
  if (error) throw error
  return (data ?? []).map((r) => ({ ...emptyCheckin(r.day), ...r, sleep_hours: r.sleep_hours === null ? null : Number(r.sleep_hours), bed_time: r.bed_time ? String(r.bed_time).slice(0, 5) : null, wake_time: r.wake_time ? String(r.wake_time).slice(0, 5) : null, wind_down: r.wind_down ? String(r.wind_down).slice(0, 5) : null, wine_glasses: r.wine_glasses === null || r.wine_glasses === undefined ? null : Number(r.wine_glasses) })) as Checkin[]
}

export async function saveCheckin(day: string, patch: Partial<Checkin>): Promise<void> {
  const { error } = await supabase.from('checkins').upsert({ ...patch, day }, { onConflict: 'user_id,day' })
  if (error) throw error
}

// ------------------------------------------------------------------ weekly reviews (written by Claude)
export interface Review {
  week_start: string
  created_at: string
  data: {
    points: string[]; points_zh: string[]
    went_well?: string[]; went_well_zh?: string[]
    slipped?: string[]; slipped_zh?: string[]
    suggestions: string[]; suggestions_zh: string[]
    focus?: string; focus_zh?: string
  }
}

export async function loadReviews(): Promise<Review[]> {
  const { data, error } = await supabase.from('board_reviews').select('week_start, created_at, data').order('week_start', { ascending: false }).limit(12)
  if (error) throw error
  return data as Review[]
}

// ------------------------------------------------------------------ dates (Vancouver)
const VAN = 'America/Vancouver'
export const vanDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: VAN })
export const vanHour = (d = new Date()) => Number(d.toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: VAN }).slice(0, 2))

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
}

/** Monday of the week that holds this day. */
export function weekStart(day: string): string {
  const dow = new Date(day + 'T12:00:00Z').getUTCDay() // 0 = Sunday
  return addDays(day, dow === 0 ? -6 : 1 - dow)
}

// ------------------------------------------------------------------ habits
// Each habit has a tiny version and a full version; both count. Wind-down and wake-up are filled in
// from the next morning's check-in. The tone is encouraging: no red marks, only what went well.
export type DayMark = 'done' | 'tiny' | 'missed' | 'unknown' | 'today'
const counts = (m: DayMark) => m === 'done' || m === 'tiny'

export interface HabitStatus {
  habit: Habit
  grid: { day: string; mark: DayMark }[] // last 28 days (or 8 weeks), oldest first
  streak: number // daily habits: days in a row; weekly habits: weeks in a row on target
  thisWeek: number
  last28: number // days done (tiny or full) in the last 28 days
  target: string | null // wind-down goal or usual wake-up time, 'HH:MM'
  note: string | null // a gentle, encouraging line
  note_zh: string | null
}

// Minutes after noon, so that 23:45 comes before 00:30.
export const lateness = (t: string) => { const [h, m] = t.split(':').map(Number); return (h < 12 ? h + 24 : h) * 60 + m - 720 }
export const fromLateness = (x: number) => { const t = ((Math.round(x) + 720) % 1440 + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
const clockMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const median = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null }
const toClock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`

/** The usual wake-up time: the middle of the 14 mornings before `day` (at least 5 recorded), else the starting time. */
export function usualWake(habit: Habit, byDay: Map<string, Checkin>, day: string): string | null {
  const xs = Array.from({ length: 14 }, (_, i) => byDay.get(addDays(day, -1 - i))?.wake_time).filter((x): x is string => !!x).map(clockMins)
  const m = xs.length >= 5 ? median(xs) : null
  return m !== null ? toClock(Math.round(m / 15) * 15) : habit.by ?? null
}

/** Wind-down over the last 7 nights: how many met the goal, how many were recorded, and the usual time. */
export function windDownWeek(habit: Habit, byDay: Map<string, Checkin>, today: string): { met: number; recorded: number; usual: string | null } {
  const xs = Array.from({ length: 7 }, (_, i) => byDay.get(addDays(today, -i))?.wind_down).filter((x): x is string => !!x)
  const goal = lateness(habit.by ?? '00:00')
  const m = median(xs.map(lateness))
  return { met: xs.filter((x) => lateness(x) <= goal).length, recorded: xs.length, usual: m === null ? null : fromLateness(Math.round(m / 15) * 15) }
}

export function habitStatus(habit: Habit, byDay: Map<string, Checkin>, today: string): HabitStatus {
  const markOf = (day: string): DayMark => {
    if (habit.auto === 'bedtime' || habit.auto === 'winddown') {
      // The night of `day` is recorded in the next morning's check-in.
      const next = byDay.get(addDays(day, 1))
      const t = habit.auto === 'winddown' ? next?.wind_down : next?.bed_time
      if (t) return lateness(t) <= lateness(habit.by ?? '00:30') ? 'done' : 'missed'
      return day >= addDays(today, -1) ? 'today' : 'unknown'
    }
    if (habit.auto === 'wake') {
      const w = byDay.get(day)?.wake_time
      const usual = usualWake(habit, byDay, day)
      if (w && usual) return Math.abs(clockMins(w) - clockMins(usual)) <= 30 ? 'done' : 'missed'
      if (w) return 'done' // nothing to compare with yet
      return day === today ? 'today' : 'unknown'
    }
    const c = byDay.get(day)
    const v = c?.habits[habit.key]
    if (v === 'tiny') return 'tiny'
    if (v) return 'done'
    if (day === today) return 'today'
    if (!c?.evening_at) return 'unknown'
    return 'missed'
  }
  const ws = weekStart(today)
  const countWeek = (w: string) => Array.from({ length: 7 }, (_, k) => addDays(w, k)).filter((d) => d <= today && counts(markOf(d))).length
  const days28 = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27))
  const last28 = days28.filter((d) => counts(markOf(d))).length
  const target = habit.auto === 'winddown' || habit.auto === 'bedtime' ? habit.by ?? null : habit.auto === 'wake' ? usualWake(habit, byDay, today) : null
  let streak = 0
  let note: string | null = null
  let note_zh: string | null = null

  if (habit.every === 'week') {
    const goal = Math.max(1, habit.per_week)
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, (i - 7) * 7))
    const weekMark = (w: string): DayMark => {
      if (countWeek(w) >= goal) return 'done'
      if (w === ws) return 'today'
      const any = Array.from({ length: 7 }, (_, k) => byDay.get(addDays(w, k))?.evening_at).some(Boolean)
      return any ? 'missed' : 'unknown'
    }
    const grid = weeks.map((w) => ({ day: w, mark: weekMark(w) }))
    const thisWeek = countWeek(ws)
    let w = weekMark(ws) === 'done' ? ws : addDays(ws, -7)
    while (weekMark(w) === 'done' && streak < 520) { streak++; w = addDays(w, -7) }
    if (thisWeek >= goal) { note = 'Done for this week. Well done.'; note_zh = '本週已完成，做得好。' }
    else if (weekMark(addDays(ws, -7)) !== 'done') { note = `The tiny version counts: ${habit.tiny || 'one small step'}.`; note_zh = `小步也算數：${habit.tiny_zh || habit.tiny || '一小步'}。` }
    return { habit, grid, streak, thisWeek, last28, target, note, note_zh }
  }

  const grid = days28.map((day) => ({ day, mark: markOf(day) }))
  const thisWeek = grid.filter((g) => g.day >= ws && counts(g.mark)).length
  let d = counts(markOf(today)) ? today : addDays(today, -1)
  while (counts(markOf(d)) && streak < 1000) { streak++; d = addDays(d, -1) }
  const quiet = !counts(markOf(today)) && markOf(addDays(today, -1)) === 'missed' && markOf(addDays(today, -2)) === 'missed'
  if (counts(markOf(today))) { note = 'Done today. Each time makes the next one easier.'; note_zh = '今日已做，每做一次，下次更容易。' }
  else if (quiet && !habit.auto) { note = `A couple of quiet days. Starting again is the habit: ${habit.tiny || 'one small step'} is enough today.`; note_zh = `休息了兩日，重新開始就是習慣：今日做${habit.tiny_zh || habit.tiny || '一小步'}已足夠。` }
  else if (streak >= 2) { note = `${streak} days in a row. Keep it light.`; note_zh = `連續 ${streak} 日，輕鬆繼續。` }
  return { habit, grid, streak, thisWeek, last28, target, note, note_zh }
}

// ------------------------------------------------------------------ time by life area
export function hoursByArea(areas: Area[], checkins: Checkin[], from: string, to: string): { area: Area; hours: number }[] {
  return areas.map((area) => ({
    area,
    hours: checkins.filter((c) => c.day >= from && c.day <= to).reduce((s, c) => s + (Number(c.hours[area.key]) || 0), 0),
  }))
}

export const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export function slugKey(label: string, taken: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item'
  let k = base
  let i = 2
  while (taken.includes(k)) k = `${base}_${i++}`
  return k
}

/** Hours asleep from bed time (the night before) to wake-up time; crosses midnight. */
export function sleepFrom(bed: string | null, wake: string | null): number | null {
  if (!bed || !wake) return null
  const [bh, bm] = bed.split(':').map(Number)
  const [wh, wm] = wake.split(':').map(Number)
  let mins = wh * 60 + wm - (bh * 60 + bm)
  if (mins <= 0) mins += 24 * 60
  return Math.round((mins / 60) * 4) / 4 // nearest quarter hour
}
