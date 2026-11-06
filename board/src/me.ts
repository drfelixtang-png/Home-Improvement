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
  habits: Record<string, boolean>
  hours: Record<string, number>
  win: string
  slipped: string
  better_tomorrow: string
  evening_note: string
  evening_at: string | null
}

export const emptyCheckin = (day: string): Checkin => ({
  day, sleep_hours: null, bed_time: null, wake_time: null, sleep_quality: null, energy_am: null, mood_am: null, priorities: ['', '', ''],
  morning_note: '', morning_at: null, energy_pm: null, mood_pm: null, priorities_done: [false, false, false],
  habits: {}, hours: {}, win: '', slipped: '', better_tomorrow: '', evening_note: '', evening_at: null,
})

export async function loadCheckins(fromDay: string): Promise<Checkin[]> {
  const { data, error } = await supabase.from('checkins').select('*').gte('day', fromDay).order('day')
  if (error) throw error
  return (data ?? []).map((r) => ({ ...emptyCheckin(r.day), ...r, sleep_hours: r.sleep_hours === null ? null : Number(r.sleep_hours), bed_time: r.bed_time ? String(r.bed_time).slice(0, 5) : null, wake_time: r.wake_time ? String(r.wake_time).slice(0, 5) : null })) as Checkin[]
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
export type DayMark = 'done' | 'missed' | 'unknown' | 'today'

export interface HabitStatus {
  habit: Habit
  grid: { day: string; mark: DayMark }[] // last 28 days, oldest first
  streak: number // daily habits: days in a row; weekly habits: weeks in a row on target
  thisWeek: number
  warning: string | null
  warning_zh: string | null
}

// Minutes after noon, so that 23:45 comes before 00:30.
const lateness = (t: string) => { const [h, m] = t.split(':').map(Number); return (h < 12 ? h + 24 : h) * 60 + m - 720 }

export function habitStatus(habit: Habit, byDay: Map<string, Checkin>, today: string): HabitStatus {
  const markOf = (day: string): DayMark => {
    if (habit.auto === 'bedtime') {
      // The night of `day` is recorded as the bed time in the next morning's check-in.
      const bed = byDay.get(addDays(day, 1))?.bed_time
      if (bed) return lateness(bed) <= lateness(habit.by ?? '00:30') ? 'done' : 'missed'
      return day >= addDays(today, -1) ? 'today' : 'unknown'
    }
    const c = byDay.get(day)
    if (c?.habits[habit.key]) return 'done'
    if (day === today) return 'today'
    if (!c?.evening_at) return 'unknown'
    return 'missed'
  }
  const ws = weekStart(today)
  const countWeek = (w: string) => Array.from({ length: 7 }, (_, k) => addDays(w, k)).filter((d) => d <= today && markOf(d) === 'done').length
  let streak = 0
  let warning: string | null = null
  let warning_zh: string | null = null

  if (habit.every === 'week') {
    // One cell per week for the last 8 weeks; never miss two weeks in a row.
    const target = Math.max(1, habit.per_week)
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, (i - 7) * 7))
    const weekMark = (w: string): DayMark => {
      if (countWeek(w) >= target) return 'done'
      if (w === ws) return 'today'
      const any = Array.from({ length: 7 }, (_, k) => byDay.get(addDays(w, k))?.evening_at).some(Boolean)
      return any ? 'missed' : 'unknown'
    }
    const grid = weeks.map((w) => ({ day: w, mark: weekMark(w) }))
    const thisWeek = countWeek(ws)
    let w = weekMark(ws) === 'done' ? ws : addDays(ws, -7)
    while (weekMark(w) === 'done' && streak < 520) { streak++; w = addDays(w, -7) }
    if (thisWeek < target) {
      const last = weekMark(addDays(ws, -7)), before = weekMark(addDays(ws, -14))
      if (last !== 'done' && before !== 'done' && last !== 'unknown') { warning = 'Missed 2 weeks. Do it this week.'; warning_zh = '已經兩星期未做，本週一定要做。' }
      else if (last === 'missed') { warning = 'Missed last week. Do not miss two weeks.'; warning_zh = '上週未做，本週不要再錯過。' }
    }
    return { habit, grid, streak, thisWeek, warning, warning_zh }
  }

  const grid = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27)).map((day) => ({ day, mark: markOf(day) }))
  const thisWeek = grid.filter((g) => g.day >= ws && g.mark === 'done').length

  if (habit.per_week >= 7) {
    // Count back from yesterday (today still counts if already done).
    let d = markOf(today) === 'done' ? today : addDays(today, -1)
    while (markOf(d) === 'done' && streak < 1000) { streak++; d = addDays(d, -1) }
    const y = markOf(addDays(today, -1))
    const y2 = markOf(addDays(today, -2))
    if (markOf(today) !== 'done') {
      if (y !== 'done' && y2 !== 'done') { warning = 'Missed 2 days. Start again today.'; warning_zh = '已經兩日未做，今日重新開始。' }
      else if (y !== 'done') { warning = 'Missed yesterday. Do not miss twice.'; warning_zh = '昨日未做，今日不要再錯過。' }
    }
  } else {
    // Weekly target: count full past weeks that met the target.
    let w = addDays(ws, -7)
    for (let i = 0; i < 52; i++) {
      let n = 0
      for (let k = 0; k < 7; k++) if (markOf(addDays(w, k)) === 'done') n++
      if (n >= habit.per_week) { streak++; w = addDays(w, -7) } else break
    }
    const daysLeft = 7 - daysBetween(ws, today) // including today
    const need = habit.per_week - thisWeek
    if (need > 0 && need >= daysLeft) {
      warning = need > daysLeft ? `Target out of reach this week (${thisWeek}/${habit.per_week}).` : `Needs every remaining day this week (${thisWeek}/${habit.per_week}).`
      warning_zh = need > daysLeft ? `本週已難達標（${thisWeek}/${habit.per_week}）。` : `本週餘下每日都要做（${thisWeek}/${habit.per_week}）。`
    }
  }
  return { habit, grid, streak, thisWeek, warning, warning_zh }
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
