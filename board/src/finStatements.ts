// Statement tracker: which bank and card statements have been imported, which are missing,
// and which new ones should be available by now. The list of sources lives in the private settings.
import { saveFinSettings } from './finance'
import type { Finance, FinSettings } from './finance'

export interface StatementSource {
  key: string
  label: string              // as it appears on imported lines, for example "RBC Chequing"
  owner: string
  kind: 'bank' | 'card' | 'investing' | 'business'
  day: number                // usual statement end day; 31 means the last day of the month
  from: string               // first month wanted, YYYY-MM
  covered: [string, string][] // imported statement periods, YYYY-MM-DD
  quiet_ok?: boolean         // no statement is issued in a month with no activity (most credit cards)
  uploaded_on?: string | null // set when the files are in the Drive folder but not yet imported
  active: boolean
  closed_on?: string | null
  note?: string
}
export type MonthState = 'covered' | 'missing' | 'quiet' | 'due' | 'future' | 'before'
export interface SourceStatus {
  s: StatementSource
  coveredTo: string | null
  lastEnd: string            // the most recent statement that should be out by now
  nextEnd: string
  state: 'ok' | 'uploaded' | 'due' | 'late' | 'closed'
  daysLate: number
  missing: string[]          // YYYY-MM months with no statement imported, oldest first
  months: { m: string; st: MonthState }[]
}

const LAG = 3 // days after the period ends before a statement is usually available
const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
// The statement end date that falls in month YYYY-MM.
export function endIn(ym: string, day: number): string {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${pad(Math.min(day, lastDay(y, m)))}`
}
export function addMonths(ym: string, k: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + k, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}
const addDays = (iso: string, k: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + k * 86400000).toISOString().slice(0, 10)
const days = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000)

export function sources(f: Finance): StatementSource[] {
  return ((f.settings as FinSettings & { statement_sources?: StatementSource[] }).statement_sources ?? [])
}

export function status(s: StatementSource, today: string, monthsShown = 36): SourceStatus {
  const ym = today.slice(0, 7)
  // Most recent statement end that is available by today.
  let lastEnd = endIn(ym, s.day)
  if (addDays(lastEnd, LAG) > today) lastEnd = endIn(addMonths(ym, -1), s.day)
  const stopAt = s.closed_on && s.closed_on < lastEnd ? s.closed_on : lastEnd
  const nextEnd = endIn(addMonths(lastEnd.slice(0, 7), 1), s.day)
  const coveredTo = s.covered.length ? s.covered.map((c) => c[1]).sort().pop()! : null
  const isCovered = (end: string) => s.covered.some(([a, b]) => end >= a && end <= addDays(b, LAG))
  const startShown = addMonths(ym, -(monthsShown - 1))
  const months: { m: string; st: MonthState }[] = []
  const missing: string[] = []
  for (let m = startShown; m <= ym; m = addMonths(m, 1)) {
    const end = endIn(m, s.day)
    let st: MonthState
    if (m < s.from) st = 'before'
    else if (isCovered(end)) st = 'covered'
    else if (end > stopAt) st = end > lastEnd ? 'future' : 'before'
    else if (coveredTo && end > coveredTo) st = 'due'
    else st = s.quiet_ok ? 'quiet' : 'missing'
    months.push({ m, st })
  }
  // Missing months before the window too, so the count is complete.
  for (let m = s.from; m < startShown; m = addMonths(m, 1)) if (!isCovered(endIn(m, s.day)) && !s.quiet_ok) missing.push(m)
  for (const x of months) if (x.st === 'missing' || x.st === 'due') missing.push(x.m)
  let state: SourceStatus['state'] = 'ok'
  let daysLate = 0
  if (!s.active) state = 'closed'
  else if (!coveredTo || coveredTo < addDays(lastEnd, -LAG)) {
    daysLate = Math.max(0, days(addDays(lastEnd, LAG), today))
    // More than one statement behind, or the latest one over two weeks old, counts as overdue.
    const behind = coveredTo ? months.filter((x) => x.st === 'due').length : missing.length
    state = s.uploaded_on && s.uploaded_on >= lastEnd ? 'uploaded' : daysLate > 14 || behind > 1 ? 'late' : 'due'
  }
  return { s, coveredTo, lastEnd, nextEnd, state, daysLate, missing, months }
}

export function tracker(f: Finance, today: string) {
  const list = sources(f).map((s) => status(s, today))
  return {
    list,
    due: list.filter((x) => x.state === 'due' || x.state === 'late'),
    late: list.filter((x) => x.state === 'late'),
    uploaded: list.filter((x) => x.state === 'uploaded'),
    gaps: list.reduce((n, x) => n + x.missing.length, 0),
  }
}

export async function updateSource(userId: string, f: Finance, key: string, patch: Partial<StatementSource>): Promise<void> {
  const list = sources(f).map((s) => (s.key === key ? { ...s, ...patch } : s))
  await saveFinSettings(userId, f.settings, { statement_sources: list } as Partial<FinSettings>)
}
