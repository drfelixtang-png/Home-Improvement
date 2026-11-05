import { supabase } from '../../src/lib/supabase'
import { feeds } from './data'
import type { Severity } from './data'
import { addDays, daysBetween } from './me'

// ------------------------------------------------------------------ household profile
export interface Person { key: string; name: string; relation: string; relation_zh: string; born: string }
export interface Car { key: string; name: string; owner?: string; drivers?: string[]; tyres?: string; fuel?: string }
export interface Bill { key: string; name: string; category: string; autopay: boolean | null; note?: string; details_source?: string }
export interface Household {
  home: {
    address: string; type?: string; year_built?: number; bedrooms?: number; bathrooms?: number
    land_sqft?: number; first_floor_sqft?: number; basement_finished_sqft?: number
    assessment?: { year: number; total: number; previous_total?: number }
    notes?: string[]
  }
  people: Person[]
  cars: Car[]
  bills?: Bill[]
}

export async function loadHousehold(): Promise<Household | null> {
  const { data, error } = await supabase.from('household').select('data').maybeSingle()
  if (error) throw error
  return (data?.data as Household) ?? null
}

// ------------------------------------------------------------------ items that become due
export type Category = 'document' | 'maintenance' | 'health' | 'car' | 'bill' | 'emergency'

export interface HomeItem {
  id: string
  category: Category
  subject: string
  title: string
  title_zh: string
  every_months: number | null
  last_done: string | null
  next_due: string | null
  note: string
  sort: number
  active: boolean
}

export async function loadHomeItems(): Promise<HomeItem[]> {
  const { data, error } = await supabase.from('home_items').select('*').eq('active', true).order('sort')
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, every_months: r.every_months === null ? null : Number(r.every_months) })) as HomeItem[]
}

export async function updateHomeItem(id: string, patch: Partial<HomeItem>): Promise<void> {
  const { error } = await supabase.from('home_items').update(patch).eq('id', id)
  if (error) throw error
}

export async function addHomeItem(row: Partial<HomeItem>): Promise<void> {
  const { error } = await supabase.from('home_items').insert(row)
  if (error) throw error
}

export function addMonths(day: string, months: number): string {
  const whole = Math.floor(months)
  const d = new Date(day + 'T12:00:00Z')
  const dom = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + whole)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dom, last))
  const out = d.toISOString().slice(0, 10)
  return months % 1 ? addDays(out, Math.round((months % 1) * 30)) : out
}

/** What "Done today" changes: repeats move on, one-off items stay done. */
export function doneToday(item: HomeItem, today: string): Partial<HomeItem> {
  return { last_done: today, next_due: item.every_months ? addMonths(today, item.every_months) : null }
}

export type DueState = 'overdue' | 'week' | 'month' | 'later' | 'done' | 'nodate'

export function dueState(item: HomeItem, today: string): { state: DueState; days: number | null } {
  if (!item.next_due) return { state: item.last_done ? 'done' : 'nodate', days: null }
  const days = daysBetween(today, item.next_due)
  if (days < 0) return { state: 'overdue', days }
  if (days <= 7) return { state: 'week', days }
  if (days <= 30) return { state: 'month', days }
  return { state: 'later', days }
}

/** An emergency-plan item counts as ready once done and not yet due again. */
export const isReady = (item: HomeItem, today: string) => !!item.last_done && (!item.next_due || item.next_due > today)

// ------------------------------------------------------------------ live hazard alerts near the house
interface Part<T> { ok: boolean; error?: string; data: T[] }
export interface Alerts {
  weather: Part<{ type: string | null; name: string; area: string | null; text: string; published: string | null; ends: string | null }>
  quakes: Part<{ mag: number; place: string; time: number; km: number; url: string }>
  outages: Part<{ municipality: string; area: string; customers: number; cause: string; status: string; since: number; km: number }>
  tsunami: Part<{ title: string; updated: string; category: string; threat: boolean; bc: boolean; note: string | null }>
  fetchedAt: string
}

export const loadAlerts = () => feeds<Alerts>('kind=alerts')

export interface AlertLine { severity: Severity; title: string; title_zh: string; detail?: string; url?: string; source: string }

/** Turn the raw feeds into a short list, most serious first. Quiet means nothing to show. */
export function alertLines(a: Alerts): AlertLine[] {
  const out: AlertLine[] = []
  for (const w of a.weather?.data ?? []) {
    const t = (w.type ?? '').toLowerCase()
    const severity: Severity = t === 'warning' ? 'urgent' : t === 'watch' || t === 'advisory' ? 'soon' : 'info'
    out.push({ severity, title: String(w.name ?? 'Weather alert').replace(/^\w/, (c) => c.toUpperCase()), title_zh: '天氣警告', detail: String(w.text ?? '').split('\n').filter(Boolean).slice(0, 3).join(' '), source: 'Environment Canada', url: 'https://weather.gc.ca/en/location/index.html?coords=49.135,-123.168' })
  }
  const now = Date.now()
  for (const q of a.quakes?.data ?? []) {
    const hours = (now - q.time) / 3600000
    const severity: Severity = q.mag >= 5 && q.km <= 200 && hours < 48 ? 'urgent' : q.mag >= 4 && q.km <= 150 && hours < 48 ? 'soon' : 'info'
    if (severity === 'info' && (q.mag < 3 || hours > 72)) continue
    out.push({ severity, title: `Earthquake M${Number(q.mag).toFixed(1)}, ${q.km} km away`, title_zh: `地震 ${Number(q.mag).toFixed(1)} 級，距離 ${q.km} 公里`, detail: q.place, source: 'USGS', url: q.url })
  }
  for (const o of a.outages?.data ?? []) {
    const severity: Severity = o.km <= 1.5 ? 'urgent' : o.km <= 5 ? 'soon' : 'info'
    out.push({ severity, title: `Power outage ${o.km} km away: ${o.area}`, title_zh: `停電，距離 ${o.km} 公里`, detail: `${o.customers} customers · ${o.cause} · ${o.status}`, source: 'BC Hydro', url: 'https://www.bchydro.com/power-outages/app/outage-map.html' })
  }
  for (const t of a.tsunami?.data ?? []) {
    if (!t.threat) continue
    out.push({ severity: t.bc ? 'urgent' : 'info', title: `Tsunami ${t.category}: ${t.title}`, title_zh: t.bc ? '海嘯警報影響卑詩省' : '海嘯消息（不影響卑詩省）', detail: t.note ?? undefined, source: 'Tsunami Warning Center', url: 'https://www.tsunami.gov/' })
  }
  const rank: Record<Severity, number> = { urgent: 0, soon: 1, info: 2 }
  return out.sort((x, y) => rank[x.severity] - rank[y.severity])
}
