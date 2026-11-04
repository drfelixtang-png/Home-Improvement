import type { Severity } from './data'

export const STOCKPILE_URL = '../'
export const TEAM_TOOLS_URL = 'https://serenehost.ca/team/'

// ------------------------------------------------------------------ time
export const VAN = 'America/Vancouver'
export const HKG = 'Asia/Hong_Kong'

export function clock(d: Date, tz: string): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz })
}

export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'unknown'
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 36) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso)
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: VAN })
}

export function weekday(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short' })
}

export function hourLabel(iso: string): string {
  return iso.slice(11, 16)
}

// ------------------------------------------------------------------ weather codes (WMO)
const WX: Record<number, [string, string]> = {
  0: ['Clear', '天晴'], 1: ['Mostly clear', '大致天晴'], 2: ['Partly cloudy', '部分多雲'], 3: ['Cloudy', '多雲'],
  45: ['Fog', '有霧'], 48: ['Freezing fog', '凍霧'],
  51: ['Light drizzle', '微雨'], 53: ['Drizzle', '毛毛雨'], 55: ['Heavy drizzle', '大毛毛雨'],
  56: ['Freezing drizzle', '凍毛毛雨'], 57: ['Freezing drizzle', '凍毛毛雨'],
  61: ['Light rain', '小雨'], 63: ['Rain', '有雨'], 65: ['Heavy rain', '大雨'],
  66: ['Freezing rain', '凍雨'], 67: ['Freezing rain', '凍雨'],
  71: ['Light snow', '小雪'], 73: ['Snow', '有雪'], 75: ['Heavy snow', '大雪'], 77: ['Snow grains', '雪粒'],
  80: ['Showers', '驟雨'], 81: ['Showers', '驟雨'], 82: ['Heavy showers', '大驟雨'],
  85: ['Snow showers', '陣雪'], 86: ['Snow showers', '大陣雪'],
  95: ['Thunderstorm', '雷暴'], 96: ['Thunderstorm, hail', '雷暴冰雹'], 99: ['Thunderstorm, hail', '雷暴冰雹'],
}
export const wxText = (c: number) => WX[c]?.[0] ?? 'Unknown'
export const wxZh = (c: number) => WX[c]?.[1] ?? ''

export function aqiText(aqi: number | null): { text: string; tone: Severity | 'good' } {
  if (aqi === null) return { text: 'Air quality unavailable', tone: 'info' }
  if (aqi <= 50) return { text: `Air good (${aqi})`, tone: 'good' }
  if (aqi <= 100) return { text: `Air moderate (${aqi})`, tone: 'soon' }
  if (aqi <= 150) return { text: `Air unhealthy for sensitive groups (${aqi})`, tone: 'urgent' }
  return { text: `Air unhealthy (${aqi})`, tone: 'urgent' }
}

// ------------------------------------------------------------------ number formats
export function num(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-'
  return n.toLocaleString('en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`
}

