import { useMemo, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { itemName, word } from '../lib/i18n'
import { daysUntil, formatDate, formatQty } from '../lib/dates'
import { nextStocktakeDate, redDays } from '../lib/status'
import { importStarter, saveOrder } from '../lib/data'
import { LOCATIONS } from '../lib/types'
import type { Item } from '../lib/types'
import { StatusDot } from '../components/StatusDot'
import { Expiry } from '../components/Expiry'

const FILTER_KEY = 'stockpile.filters'

function loadFilters(): { loc: string; cat: string } {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}')
    return { loc: v.loc ?? '', cat: v.cat ?? '' }
  } catch {
    return { loc: '', cat: '' }
  }
}

export function DueBanner() {
  const { t, lang, lastDone, settings, openStocktake, openDone, summaries } = useStore()
  if (openStocktake) {
    return (
      <div className="banner banner-yellow">
        <span>{t('stocktakeInProgress', { done: Math.min(openDone, summaries.length), total: summaries.length })}</span>
        <button onClick={() => go('stocktake')}>{t('continueStocktake')}</button>
      </div>
    )
  }
  const due = nextStocktakeDate(lastDone, settings)
  if (!due) return <div className="banner banner-yellow">{t('stocktakeNever')}</div>
  const overdue = daysUntil(due) < 0
  return (
    <div className={`banner ${overdue ? 'banner-red' : daysUntil(due) <= 14 ? 'banner-yellow' : 'banner-green'}`}>
      {t(overdue ? 'stocktakeOverdue' : 'stocktakeDue', { date: formatDate(due, lang) })}
    </div>
  )
}

export function Inventory() {
  const { t, lang, summaries, activeItems, openStocktake, run } = useStore()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(loadFilters)
  const [reordering, setReordering] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const setFilter = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next))
    } catch {
      /* storage may be blocked */
    }
  }

  const categories = useMemo(
    () => [...new Set(activeItems.map((i) => i.category).filter(Boolean))].sort(),
    [activeItems],
  )

  const q = search.trim().toLowerCase()
  const shown = summaries.filter(({ item }) => {
    if (reordering) return true
    if (filters.loc && item.location !== filters.loc) return false
    if (filters.cat && item.category !== filters.cat) return false
    if (!q) return true
    return [item.name_en, item.name_zh, item.category, item.notes ?? '', word(lang, item.category)]
      .join(' ')
      .toLowerCase()
      .includes(q)
  })

  const move = (from: number, to: number) => {
    if (to < 0 || to >= activeItems.length || from === to) return
    const list: Item[] = [...activeItems]
    const [it] = list.splice(from, 1)
    list.splice(to, 0, it)
    run(() => saveOrder(list))
  }

  return (
    <section>
      <DueBanner />

      <div className="toolbar no-print">
        <button className="primary" onClick={() => go('item/new')}>
          + {t('addItem')}
        </button>
        <button onClick={() => go('stocktake')}>{openStocktake ? t('continueStocktake') : t('startStocktake')}</button>
        <button onClick={() => go('shopping')}>{t('shoppingList')}</button>
      </div>

      {!reordering && (
        <div className="filters no-print">
          <input type="search" placeholder={t('search')} aria-label={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label={t('location')} value={filters.loc} onChange={(e) => setFilter({ loc: e.target.value })}>
            <option value="">
              {t('location')}: {t('all')}
            </option>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {word(lang, l)}
              </option>
            ))}
          </select>
          <select aria-label={t('category')} value={filters.cat} onChange={(e) => setFilter({ cat: e.target.value })}>
            <option value="">
              {t('category')}: {t('all')}
            </option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {word(lang, c)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="row space-between no-print">
        {reordering ? <span className="muted">{t('reorderHint')}</span> : <Legend />}
        <button onClick={() => setReordering(!reordering)}>{reordering ? t('doneReordering') : t('reorder')}</button>
      </div>

      {activeItems.length === 0 ? (
        <div className="card">
          <p>{t('emptyInventory')}</p>
          <button className="primary" onClick={() => run(() => importStarter(activeItems))}>
            {t('importStarter')}
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">{t('noItems')}</p>
      ) : (
        <div className={`items ${reordering ? 'reordering' : ''}`}>
          <div className="items-head">
            <span>{t('colNumber')}</span>
            <span>{t('colName')}</span>
            <span>{t('colOnHand')}</span>
            <span>{t('colLocation')}</span>
            <span>{t('colExpiry')}</span>
          </div>
          {shown.map((s) => {
            const index = activeItems.findIndex((i) => i.id === s.item.id)
            const rowProps = reordering
              ? {
                  draggable: true,
                  onDragStart: () => setDragId(s.item.id),
                  onDragOver: (e: DragEvent) => e.preventDefault(),
                  onDrop: () => {
                    const from = activeItems.findIndex((i) => i.id === dragId)
                    if (from >= 0) move(from, index)
                    setDragId(null)
                  },
                  onDragEnd: () => setDragId(null),
                }
              : { onClick: () => go('item/' + s.item.id), role: 'link' as const, tabIndex: 0, onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && go('item/' + s.item.id) }
            return (
              <div key={s.item.id} className={`item-row status-${s.status} ${dragId === s.item.id ? 'dragging' : ''}`} {...rowProps}>
                <span className="item-no">
                  {reordering && <span className="handle" aria-hidden="true">⋮⋮</span>}
                  {index + 1}
                </span>
                <span className="item-name">
                  <StatusDot status={s.status} /> {itemName(lang, s.item)}
                  {s.item.notes && <small className="muted item-notes">{s.item.notes}</small>}
                </span>
                <span className="item-qty">
                  {formatQty(s.onHand)} / {formatQty(Number(s.item.target_qty))} {word(lang, s.item.unit)}
                </span>
                <span className="item-loc">{word(lang, s.item.location)}</span>
                <span className="item-exp">{s.earliestExpiry ? <Expiry date={s.earliestExpiry} /> : <span className="muted">–</span>}</span>
                {reordering && (
                  <span className="item-move">
                    <button aria-label={t('moveUp')} title={t('moveUp')} disabled={index === 0} onClick={() => move(index, index - 1)}>
                      ↑
                    </button>
                    <button
                      aria-label={t('moveDown')}
                      title={t('moveDown')}
                      disabled={index === activeItems.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="no-print">
        <a href="#/archived">{t('archivedItems')}</a>
      </p>
    </section>
  )
}

function Legend() {
  const { t, settings } = useStore()
  return (
    <ul className="legend">
      <li>
        <StatusDot status="green" /> {t('legendGreen')}
      </li>
      <li>
        <StatusDot status="yellow" /> {t('legendYellow', { days: settings.expiry_warning_days })}
      </li>
      <li>
        <StatusDot status="red" /> {t('legendRed', { days: redDays(settings) })}
      </li>
    </ul>
  )
}
