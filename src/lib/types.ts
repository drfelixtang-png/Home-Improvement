export type Lang = 'en' | 'zh-Hant'

export interface Item {
  id: string
  user_id: string
  sort_order: number
  name_en: string
  name_zh: string
  category: string
  unit: string
  target_qty: number
  location: string
  notes: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface Batch {
  id: string
  user_id: string
  item_id: string
  qty: number
  expiry_date: string | null
  purchased_on: string | null
  created_at: string
  updated_at: string
}

export interface Stocktake {
  id: string
  user_id: string
  taken_on: string
  notes: string | null
  status: 'in_progress' | 'done'
  created_at: string
  finished_at: string | null
}

export interface StocktakeLine {
  id: string
  stocktake_id: string
  item_id: string
  counted_qty: number
  target_qty: number
  earliest_expiry: string | null
}

export interface Settings {
  user_id: string
  language: Lang
  stocktake_interval_months: number
  expiry_warning_days: number
  seeded: boolean
}

export type ItemInput = Pick<
  Item,
  'name_en' | 'name_zh' | 'category' | 'unit' | 'target_qty' | 'location' | 'notes'
> & { sort_order?: number }

export const LOCATIONS = ['Garage', 'Kitchen', 'Freezer'] as const
export const UNITS = ['kg', 'L', 'can', 'jar', 'box', 'bag', 'bottle', 'pack', 'each'] as const
