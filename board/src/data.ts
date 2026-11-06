import { supabase } from '../../src/lib/supabase'
import type { Batch, Item, PriceRecord, ProductLink, Settings as StockSettings, Stocktake } from '../../src/lib/types'
import { areaDue, covers, locationRank, priceStats, shoppingLines, summarise } from '../../src/lib/status'
import type { AreaDue } from '../../src/lib/status'
import type { ItemSummary } from '../../src/lib/status'
import { daysUntil } from '../../src/lib/dates'

// ------------------------------------------------------------------ snapshot
// Written each morning by the scheduled Claude task into public.board_snapshots.

export type Severity = 'urgent' | 'soon' | 'info'

export interface Flag {
  key?: string | null // stable id (Gmail thread id, session id, flag id) for done / snooze
  severity: Severity
  title: string
  detail?: string | null
  url?: string | null
}

export interface Deadline {
  key?: string | null
  date: string // YYYY-MM-DD
  title: string
  title_zh?: string | null
  source?: string | null // HKU SPACE, Bill, SereneHost, Journal, Calendar
  url?: string | null
}

export interface CalEvent {
  start: string | null // "09:30", or null for all-day
  end?: string | null
  title: string
  location?: string | null
  all_day?: boolean
  url?: string | null
}

export interface InboxItem extends Flag {
  category: string // reply, deadline, bill, work, fyi
  from: string
  subject: string
  why?: string | null
  due?: string | null
  received?: string | null
}

export interface Movement {
  day: 'today' | 'tomorrow'
  kind: 'in' | 'out'
  property: string
  time?: string | null
  guests?: number | null
  channel?: string | null
}

export interface CleanJob {
  day: 'today' | 'tomorrow'
  property: string
  status: string
  assignee?: string | null
}

export interface TeamTask {
  title: string
  stage: string
  due_on: string | null
  owner: string | null
  waiting_on?: string | null
}

export interface Snapshot {
  generated_at: string
  overview: string
  overview_zh?: string | null
  overview_points?: string[] // point form, English
  overview_points_zh?: string[] // point form, Traditional Chinese (shown by default)
  deadlines?: Deadline[] // next 14 days
  week_ahead?: { points: string[]; points_zh: string[] } | null // Mondays only
  calendar?: { today: CalEvent[]; tomorrow: CalEvent[] }
  serenehost?: {
    data_as_of: string | null
    stats: { label: string; label_zh?: string; value: number }[]
    items: Flag[]
    movements: Movement[]
    cleans: CleanJob[]
    tasks: TeamTask[]
    next_meeting?: { title: string; starts_at: string; open_items: number } | null
  }
  inbox?: { scanned: number; items: InboxItem[] }
  waiting?: Flag[]
  sites?: { name: string; url: string; ok: boolean; status: number | null; ms: number | null }[]
}

// ------------------------------------------------------------------ done / snooze
export interface ItemState {
  item_key: string
  status: 'done' | 'snoozed'
  until: string | null
  title: string
}

export async function loadItemStates(): Promise<ItemState[]> {
  const { data, error } = await supabase.from('board_item_state').select('item_key, status, until, title')
  if (error) throw error
  return data as ItemState[]
}

export async function setItemState(row: ItemState): Promise<void> {
  const { error } = await supabase.from('board_item_state').upsert(row, { onConflict: 'user_id,item_key' })
  if (error) throw error
}

export async function clearItemState(key: string): Promise<void> {
  const { error } = await supabase.from('board_item_state').delete().eq('item_key', key)
  if (error) throw error
}

// ------------------------------------------------------------------ WhatsApp (written by the desktop task)
export interface WaItem extends Flag {
  key?: string | null
  chat: string
  category: string // SereneHost, HKU SPACE, Work, Family, Personal
  received?: string | null
  title_zh?: string | null
}

export interface WhatsApp {
  generated_at: string
  chats_checked: number
  unread_chats: number
  items: WaItem[]
  note?: string | null
}

export async function loadExtra<T>(kind: string): Promise<{ data: T; updated_at: string } | null> {
  const { data, error } = await supabase.from('board_extra').select('data, updated_at').eq('kind', kind).maybeSingle()
  if (error) throw error
  return data as { data: T; updated_at: string } | null
}

export async function loadSnapshot(): Promise<{ data: Snapshot; created_at: string } | null> {
  const { data, error } = await supabase
    .from('board_snapshots')
    .select('data, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as { data: Snapshot; created_at: string } | null
}

// ------------------------------------------------------------------ settings

export interface WatchItem { symbol: string; label: string }

export interface BoardSettings {
  user_id: string
  focus_note: string
  focus_for: string | null
  bin_weekday: number | null
  bin_note: string
  watchlist: WatchItem[]
  sites: { name: string; url: string }[]
  journey_start: string
  areas: Area[]
  habits: Habit[]
}

/** A life area, with the hours a week the owner wants to give it. */
export interface Area { key: string; label: string; label_zh: string; target: number }
/** A habit and how many days a week it should happen (7 = every day). */
export interface Habit {
  key: string; label: string; label_zh: string
  per_week: number // daily habits: days a week; weekly habits: times a week
  every?: 'day' | 'week' // 'week': checked as a weekly target (for example, see a friend once a week)
  auto?: 'bedtime' // filled in from the bed time entered the next morning; no evening tick box
  by?: string // for auto 'bedtime': latest time to be in bed, 'HH:MM' (after midnight is fine, e.g. '00:30')
}

export async function loadSettings(): Promise<BoardSettings> {
  await supabase.from('board_settings').upsert({}, { onConflict: 'user_id', ignoreDuplicates: true })
  const { data, error } = await supabase.from('board_settings').select('*').single()
  if (error) throw error
  return data as BoardSettings
}

export async function saveSettings(userId: string, patch: Partial<BoardSettings>): Promise<void> {
  const { error } = await supabase.from('board_settings').update(patch).eq('user_id', userId)
  if (error) throw error
}

// ------------------------------------------------------------------ feeds

export interface Quote {
  symbol: string
  name: string
  price: number | null
  prevClose: number | null
  change: number | null
  changePct: number | null
  currency: string | null
  marketTime: number | null
  exchangeTz: string | null
  spark: number[]
  error?: string
}

export interface Headline { title: string; link: string; source: string; published: string | null }
export interface NewsRegion { key: string; label: string; items: Headline[] }

export async function feeds<T>(query: string): Promise<T> {
  const base = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? key
  const r = await fetch(`${base}/functions/v1/board-feeds?${query}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: key },
  })
  if (!r.ok) throw new Error(`Feeds returned ${r.status}`)
  return (await r.json()) as T
}

export async function loadMarkets(list: WatchItem[]): Promise<Quote[]> {
  if (!list.length) return []
  const symbols = list.map((w) => encodeURIComponent(w.symbol)).join(',')
  const res = await feeds<{ quotes: Quote[] }>(`kind=markets&symbols=${symbols}`)
  return res.quotes
}

export async function loadNews(): Promise<NewsRegion[]> {
  const res = await feeds<{ regions: NewsRegion[] }>('kind=news')
  return res.regions
}

// ------------------------------------------------------------------ weather
// Open-Meteo, free and keyless, called straight from the browser.

export const RICHMOND = { lat: 49.1666, lon: -123.1336, tz: 'America/Vancouver' }

export interface Weather {
  current: { temp: number; feels: number; code: number; wind: number; precip: number; isDay: boolean }
  hourly: { time: string; temp: number; pop: number; code: number }[]
  daily: { date: string; code: number; max: number; min: number; pop: number; rain: number; sunrise: string; sunset: string; uv: number }[]
  aqi: number | null
  pm25: number | null
}

export async function loadWeather(): Promise<Weather> {
  const { lat, lon, tz } = RICHMOND
  const f = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(tz)}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day' +
    '&hourly=temperature_2m,precipitation_probability,weather_code&forecast_hours=24' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max&forecast_days=7'
  const a = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5&timezone=${encodeURIComponent(tz)}`
  const [fr, ar] = await Promise.all([fetch(f), fetch(a).catch(() => null)])
  if (!fr.ok) throw new Error(`Weather returned ${fr.status}`)
  const w = await fr.json()
  const air = ar && ar.ok ? await ar.json() : null
  return {
    current: {
      temp: w.current.temperature_2m,
      feels: w.current.apparent_temperature,
      code: w.current.weather_code,
      wind: w.current.wind_speed_10m,
      precip: w.current.precipitation,
      isDay: w.current.is_day === 1,
    },
    hourly: w.hourly.time.map((t: string, i: number) => ({
      time: t,
      temp: w.hourly.temperature_2m[i],
      pop: w.hourly.precipitation_probability[i] ?? 0,
      code: w.hourly.weather_code[i],
    })),
    daily: w.daily.time.map((d: string, i: number) => ({
      date: d,
      code: w.daily.weather_code[i],
      max: w.daily.temperature_2m_max[i],
      min: w.daily.temperature_2m_min[i],
      pop: w.daily.precipitation_probability_max[i] ?? 0,
      rain: w.daily.precipitation_sum[i] ?? 0,
      sunrise: w.daily.sunrise[i],
      sunset: w.daily.sunset[i],
      uv: w.daily.uv_index_max[i] ?? 0,
    })),
    aqi: air?.current?.us_aqi ?? null,
    pm25: air?.current?.pm2_5 ?? null,
  }
}

// ------------------------------------------------------------------ stockpile
// Read straight from the Stockpile Tracker tables (same project, same sign-in).

export interface StockpileView {
  below: ItemSummary[]
  expiring: ItemSummary[]
  empty: ItemSummary[]
  total: number
  areas: AreaDue[]
  // The open stock-take, if any: which areas it covers and how far it has got.
  open: { label: string[] | null; done: number; total: number } | null
  shopping: { count: number; estTotal: number }
}

export async function loadStockpile(): Promise<StockpileView | null> {
  const [items, batches, settings, stocktakes, prices, links] = await Promise.all([
    supabase.from('items').select('*').eq('archived', false),
    supabase.from('batches').select('*'),
    supabase.from('settings').select('*').maybeSingle(),
    supabase.from('stocktakes').select('*').order('taken_on', { ascending: false }),
    supabase.from('price_records').select('*').order('bought_on', { ascending: false }),
    supabase.from('product_links').select('*'),
  ])
  if (items.error) throw items.error
  if (!settings.data) return null
  const s = settings.data as StockSettings
  const its = items.data as Item[]
  const list = its.map((i) => summarise(i, (batches.data ?? []) as Batch[], s))
  const st = (stocktakes.data ?? []) as Stocktake[]
  const used = [...new Set(its.map((i) => i.location))].sort((a, b) => locationRank(a) - locationRank(b))
  const openSt = st.find((x) => x.status === 'in_progress') ?? null
  let open: StockpileView['open'] = null
  if (openSt) {
    const res = await supabase.from('stocktake_lines').select('id', { count: 'exact', head: true }).eq('stocktake_id', openSt.id)
    open = {
      label: openSt.locations && openSt.locations.length ? openSt.locations : null,
      done: res.count ?? 0,
      total: list.filter((x) => covers(openSt, x.item.location)).length,
    }
  }
  // Shopping list size and estimated cost, the same way the tracker works it out.
  const pr = (prices.data ?? []) as PriceRecord[]
  const pl = (links.data ?? []) as ProductLink[]
  const lines = shoppingLines(list, s)
  const estTotal = lines.reduce((sum, l) => {
    const last = priceStats(pr.filter((p) => p.item_id === l.summary.item.id)).lastUnit
    const cheapest = pl
      .filter((k) => k.item_id === l.summary.item.id && k.price !== null && k.pack_qty)
      .map((k) => Number(k.price) / Number(k.pack_qty))
      .sort((a, b) => a - b)[0]
    const ref = last ?? cheapest ?? null
    return sum + (ref !== null && l.buy > 0 ? ref * l.buy : 0)
  }, 0)
  const warn = 30
  return {
    below: list.filter((x) => x.onHand < Number(x.item.target_qty)).sort((a, b) => a.onHand / (Number(a.item.target_qty) || 1) - b.onHand / (Number(b.item.target_qty) || 1)),
    expiring: list.filter((x) => x.daysToExpiry !== null && x.daysToExpiry <= warn).sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0)),
    empty: list.filter((x) => x.onHand <= 0),
    total: list.length,
    areas: areaDue(st, used, s),
    open,
    shopping: { count: lines.length, estTotal },
  }
}

export { daysUntil }
