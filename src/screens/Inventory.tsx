import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { itemName, word } from '../lib/i18n'
import { daysUntil, formatDate, formatQty } from '../lib/dates'
import { nextStocktakeDate, redDays } from '../lib/status'
import type { ItemSummary } from '../lib/status'
import { adjustStock, importStarter, saveOrder, updateItem } from '../lib/data'
import { LOCATIONS } from '../lib/types'
import type { Item } from '../lib/types'
import { StatusDot } from '../components/StatusDot'
import { Expiry } from '../components/Expiry'
import { Modal } from '../components/Modal'
import { AddBatchForm } from '../components/BatchList'

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

type StatusFilter = '' | 'red' | 'yellow' | 'green'

export function Inventory() {
  const { t, lang, summaries, activeItems, openStocktake, run } = useStore()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(loadFilters)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [reordering, setReordering] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [removed, setRemoved] = useState<Item | null>(null)
  const [quickAdd, setQuickAdd] = useState<Item | null>(null)

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

  const counts = { red: 0, yellow: 0, green: 0 }
  for (const s of summaries) counts[s.status]++

  const q = search.trim().toLowerCase()
  const shown = summaries.filter(({ item, status }) => {
    if (reordering) return true
    if (filters.loc && item.location !== filters.loc) return false
    if (filters.cat && item.category !== filters.cat) return false
    if (statusFilter && status !== statusFilter) return false
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

  const remove = async (item: Item) => {
    if (await run(() => updateItem(item.id, { archived: true }))) setRemoved(item)
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
        <>
          <div className="status-chips no-print" role="group">
            {(['red', 'yellow', 'green'] as const).map((st) => (
              <button
                key={st}
                className={`chip chip-${st} ${statusFilter === st ? 'on' : ''}`}
                aria-pressed={statusFilter === st}
                onClick={() => setStatusFilter(statusFilter === st ? '' : st)}
              >
                <StatusDot status={st} /> {counts[st]}{' '}
                <span>{t(st === 'red' ? 'legendRedShort' : st === 'yellow' ? 'legendYellowShort' : 'legendGreenShort')}</span>
              </button>
            ))}
          </div>
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
        </>
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
        <div className={`items ${reordering ? 'reordering' : 'quick'}`}>
          <div className="items-head">
            <span>{t('colNumber')}</span>
            <span>{t('colName')}</span>
            <span>{t('colOnHand')}</span>
            <span>{t('colLocation')}</span>
            <span>{t('colExpiry')}</span>
            <span />
          </div>
          {shown.map((s) => {
            const index = activeItems.findIndex((i) => i.id === s.item.id)
            if (reordering) {
              return (
                <div
                  key={s.item.id}
                  className={`item-row status-${s.status} ${dragId === s.item.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragId(s.item.id)}
                  onDragOver={(e: DragEvent) => e.preventDefault()}
                  onDrop={() => {
                    const from = activeItems.findIndex((i) => i.id === dragId)
                    if (from >= 0) move(from, index)
                    setDragId(null)
                  }}
                  onDragEnd={() => setDragId(null)}
                >
                  <span className="item-no">
                    <span className="handle" aria-hidden="true">
                      ⋮⋮
                    </span>
                    {index + 1}
                  </span>
                  <span className="item-name">
                    <StatusDot status={s.status} /> {itemName(lang, s.item)}
                  </span>
                  <span className="item-qty">
                    {formatQty(s.onHand)} / {formatQty(Number(s.item.target_qty))} {word(lang, s.item.unit)}
                  </span>
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
                </div>
              )
            }
            return <QuickRow key={s.item.id} s={s} index={index} onRemove={remove} onNeedBatch={setQuickAdd} />
          })}
        </div>
      )}

      <p className="no-print">
        <a href="#/archived">{t('archivedItems')}</a>
      </p>

      {quickAdd && (
        <Modal title={t('quickAddTitle', { name: itemName(lang, quickAdd) })} onClose={() => setQuickAdd(null)}>
          <AddBatchForm item={quickAdd} defaultQty={Number(quickAdd.step_qty) || 1} onDone={() => setQuickAdd(null)} />
          <button onClick={() => setQuickAdd(null)}>{t('cancel')}</button>
        </Modal>
      )}

      {removed && (
        <UndoBar
          key={removed.id}
          text={t('removedItem', { name: itemName(lang, removed) })}
          onUndo={() => {
            const item = removed
            setRemoved(null)
            run(() => updateItem(item.id, { archived: false }))
          }}
          onDone={() => setRemoved(null)}
        />
      )}
    </section>
  )
}

function QuickRow({
  s,
  index,
  onRemove,
  onNeedBatch,
}: {
  s: ItemSummary
  index: number
  onRemove: (item: Item) => void
  onNeedBatch: (item: Item) => void
}) {
  const { t, lang, run } = useStore()
  const [busy, setBusy] = useState(false)
  const step = Number(s.item.step_qty) || 1
  const unit = word(lang, s.item.unit)
  const name = itemName(lang, s.item)
  const open = () => go('item/' + s.item.id)

  const change = async (delta: number) => {
    setBusy(true)
    let needBatch = false
    await run(async () => {
      needBatch = !(await adjustStock(s.batches, delta))
    })
    setBusy(false)
    if (needBatch) onNeedBatch(s.item)
  }

  return (
    <div className={`item-row status-${s.status} ${busy ? 'busy' : ''}`}>
      <span className="item-no">{index + 1}</span>
      <span className="item-name" role="link" tabIndex={0} onClick={open} onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && open()}>
        <StatusDot status={s.status} /> {name}
        {s.item.notes && <small className="muted item-notes">{s.item.notes}</small>}
      </span>
      <span className="item-qty stepper">
        <button
          className="step-btn"
          aria-label={t('minusStep', { n: `${formatQty(step)} ${unit}` })}
          title={t('minusStep', { n: `${formatQty(step)} ${unit}` })}
          disabled={busy || s.onHand <= 0}
          onClick={() => change(-step)}
        >
          −
        </button>
        <span className="qty-text">
          <strong>{formatQty(s.onHand)}</strong> / {formatQty(Number(s.item.target_qty))} {unit}
        </span>
        <button
          className="step-btn"
          aria-label={t('plusStep', { n: `${formatQty(step)} ${unit}` })}
          title={t('plusStep', { n: `${formatQty(step)} ${unit}` })}
          disabled={busy}
          onClick={() => change(step)}
        >
          +
        </button>
      </span>
      <span className="item-loc">
        <select
          className="loc-select"
          aria-label={t('changeLocation')}
          value={s.item.location}
          onChange={(e) => {
            const location = e.target.value
            run(() => updateItem(s.item.id, { location }))
          }}
        >
          {LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {word(lang, l)}
            </option>
          ))}
        </select>
      </span>
      <span className="item-exp">{s.earliestExpiry ? <Expiry date={s.earliestExpiry} /> : <span className="muted">–</span>}</span>
      <span className="item-x">
        <button className="x-btn" aria-label={t('removeItem', { name })} title={t('removeItem', { name })} onClick={() => onRemove(s.item)}>
          ×
        </button>
      </span>
    </div>
  )
}

function UndoBar({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  const { t } = useStore()
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const id = setTimeout(() => done.current(), 7000)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className="undo-bar no-print" role="status">
      <span>{text}</span>
      <button onClick={onUndo}>{t('undo')}</button>
    </div>
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
