// Dates are kept as 'YYYY-MM-DD' strings in local time.

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysUntil(date: string): number {
  const ms = parseISO(date).getTime() - parseISO(todayISO()).getTime()
  return Math.round(ms / 86400000)
}

export function addMonths(date: string, months: number): string {
  const d = parseISO(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return toISO(d)
}

export function formatDate(date: string | null | undefined, lang: string): string {
  if (!date) return ''
  const d = parseISO(date)
  return d.toLocaleDateString(lang === 'zh-Hant' ? 'zh-HK' : 'en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatQty(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}
