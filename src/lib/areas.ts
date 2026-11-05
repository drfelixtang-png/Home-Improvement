import type { AreaDue } from './status'
import type { Lang } from './types'
import type { TKey } from './i18n'
import { word } from './i18n'
import { daysUntil, formatDate } from './dates'

type T = (key: TKey, vars?: Record<string, string | number>) => string

export function areaText(a: AreaDue, t: T, lang: Lang): string {
  if (!a.due) return t('areaNever')
  return daysUntil(a.due) < 0 ? t('areaOverdue', { date: formatDate(a.due, lang) }) : t('areaDueOn', { date: formatDate(a.due, lang) })
}

export function stocktakeLabel(st: { locations: string[] | null }, t: T, lang: Lang): string {
  if (!st.locations || st.locations.length === 0) return t('allAreas')
  return st.locations.map((l) => word(lang, l)).join(', ')
}

