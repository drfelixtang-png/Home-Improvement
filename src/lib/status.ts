import type { Batch, Item, PriceRecord, Settings } from './types'
import { addMonths, daysUntil } from './dates'

export type Status = 'green' | 'yellow' | 'red'

export interface ItemSummary {
  item: Item
  batches: Batch[]
  onHand: number
  earliestExpiry: string | null
  daysToExpiry: number | null
  status: Status
}

const RED_DAYS = 90

export function redDays(settings: Settings): number {
  return Math.min(RED_DAYS, settings.expiry_warning_days)
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function summarise(item: Item, allBatches: Batch[], settings: Settings): ItemSummary {
  const batches = allBatches
    .filter((b) => b.item_id === item.id)
    .sort(compareBatches)
  const onHand = round(batches.reduce((sum, b) => sum + Number(b.qty), 0))
  const withQty = batches.filter((b) => Number(b.qty) > 0 && b.expiry_date)
  const earliestExpiry = withQty.length
    ? withQty.reduce((min, b) => (b.expiry_date! < min ? b.expiry_date! : min), withQty[0].expiry_date!)
    : null
  const daysToExpiry = earliestExpiry ? daysUntil(earliestExpiry) : null
  const target = Number(item.target_qty)

  let status: Status = 'green'
  if (onHand <= 0 || (daysToExpiry !== null && daysToExpiry <= redDays(settings))) status = 'red'
  else if (onHand < target || (daysToExpiry !== null && daysToExpiry <= settings.expiry_warning_days))
    status = 'yellow'

  return { item, batches, onHand, earliestExpiry, daysToExpiry, status }
}

// Earliest expiry first; batches with no expiry last.
export function compareBatches(a: Batch, b: Batch): number {
  if (a.expiry_date && b.expiry_date) return a.expiry_date.localeCompare(b.expiry_date)
  if (a.expiry_date) return -1
  if (b.expiry_date) return 1
  return a.created_at.localeCompare(b.created_at)
}

export interface ShoppingLine {
  summary: ItemSummary
  buy: number
  short: number
  expiringQty: number
  expiringDate: string | null
}

// Items below target, plus items with a batch expiring inside the warning window.
// Quantity to buy = target minus the stock that is NOT expiring soon,
// so expiring stock gets replaced as it is used up.
export function shoppingLines(summaries: ItemSummary[], settings: Settings): ShoppingLine[] {
  const lines: ShoppingLine[] = []
  for (const s of summaries) {
    const target = Number(s.item.target_qty)
    const short = round(Math.max(0, target - s.onHand))
    const expiring = s.batches.filter(
      (b) => Number(b.qty) > 0 && b.expiry_date && daysUntil(b.expiry_date) <= settings.expiry_warning_days,
    )
    const expiringQty = round(expiring.reduce((sum, b) => sum + Number(b.qty), 0))
    if (short <= 0 && expiringQty <= 0) continue
    const buy = round(Math.max(0, target - (s.onHand - expiringQty)))
    lines.push({
      summary: s,
      buy,
      short,
      expiringQty,
      expiringDate: expiring[0]?.expiry_date ?? null,
    })
  }
  return lines
}

export function nextStocktakeDate(lastDone: string | null, settings: Settings): string | null {
  if (!lastDone) return null
  return addMonths(lastDone, settings.stocktake_interval_months)
}

export const LOCATION_ORDER = ['Garage', 'Kitchen', 'Freezer']

export function locationRank(loc: string): number {
  const i = LOCATION_ORDER.indexOf(loc)
  return i === -1 ? LOCATION_ORDER.length : i
}

export interface PriceStats {
  last: PriceRecord | null
  lastUnit: number | null
  lowestUnit: number | null
  lowestStore: string | null
  usualUnit: number | null
  count: number
}

export function unitPrice(p: { price: number; qty: number }): number {
  return Number(p.price) / Number(p.qty)
}

// Last, lowest and usual (median) price per unit for one item. Records must be newest first.
export function priceStats(records: PriceRecord[]): PriceStats {
  if (!records.length) return { last: null, lastUnit: null, lowestUnit: null, lowestStore: null, usualUnit: null, count: 0 }
  const units = records.map(unitPrice)
  const sorted = [...units].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const usual = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const lowIndex = units.indexOf(sorted[0])
  return {
    last: records[0],
    lastUnit: units[0],
    lowestUnit: sorted[0],
    lowestStore: records[lowIndex].store || null,
    usualUnit: usual,
    count: records.length,
  }
}

// A "good price" is at or below the lowest seen before, or at least 15% under the usual price.
export function isGoodPrice(unit: number, earlier: PriceRecord[]): boolean {
  if (!earlier.length) return false
  const s = priceStats(earlier)
  return unit <= (s.lowestUnit ?? Infinity) + 1e-9 || unit <= (s.usualUnit ?? Infinity) * 0.85
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  return '$' + n.toFixed(2)
}
