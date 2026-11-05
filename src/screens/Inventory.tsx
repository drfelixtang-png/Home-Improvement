import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { itemHighlight, itemName, word } from '../lib/i18n'
import { daysUntil, formatDate, formatQty } from '../lib/dates'
import { covers, redDays, round } from '../lib/status'
import type { ItemSummary } from '../lib/status'
import { adjustStock, importStarter, saveOrder, updateItem } from '../lib/data'
import { KINDS, LOCATIONS, PRIORITIES, STOCK_RULES } from '../lib/types'
import type { Item } from '../lib/types'
import { StatusDot } from '../components/StatusDot'
import { Expiry } from '../components/Expiry'
import { Modal } from '../components/Modal'
import { areaText, stocktakeLabel } from '../lib/areas'
import { AddBatchForm } from '../components/BatchList'

const FILTER_KEY = 'stockpile.filters'

type SortKey = 'mine' | 'priority' | 'stock_rule' | 'status' | 'name'
interface Filters {
  loc: string
  cat: string
  pr: string
  sr: string
  kind: string
  sort: SortKey
}
const NO_FILTERS: Filters = { loc: '', cat: '', pr: '', sr: '', kind: '', sort: 'mine' }

function loadFilters(): Filters {
  try {
    return { ...NO_FILTERS, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') }
  } catch {
    return NO_FILTERS
  }
}

const STATUS_RANK = { red: 0, yellow: 1, green: 2 }

export function DueBanner() {
  const { t, lang, areas, openStocktake, openDone, summaries } = useStore()
  if (openStocktake) {
    const total = summaries.filter((s) => covers(openStocktake, s.item.location)).length
    return (
      <div className="banner banner-yellow">
        <span>
          {stocktakeLabel(openStocktake, t, lang)}: {t('stocktakeInProgress', { done: Math.min(openDone, total), total })}
        </span>
        <button onClick={() => go('stocktake')}>{t('continueStocktake')}</button>
      </div>
    )
  }
  if (!areas.length || areas.every((a) => !a.due)) return <div className="banner banner-yellow">{t('stocktakeNever')}</div>
  // The most urgent area: never counted first, then the soonest due date.
  const urgent = [...areas].sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))[0]
  const area = word(lang, urgent.location)
  const days = urgent.due ? daysUntil(urgent.due) : -1
  const cls = !urgent.due ? 'banner-yellow' : days < 0 ? 'banner-red' : days <= 14 ? 'banner-yellow' : 'banner-green'
  return (
    <div className={`banner banner-areas ${cls}`}>
      <span>
        {!urgent.due
          ? t('stocktakeAreaNever', { area })
          : t(days < 0 ? 'stocktakeAreaOverdue' : 'stocktakeAreaDue', { area, date: formatDate(urgent.due, lang) })}
      </span>
      {areas.length > 1 && (
        <small className="area-dates">
          {areas.map((a) => `${word(lang, a.location)}: ${areaText(a, t, lang)}`).join(' · ')}
        </small>
      )}
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
  // Target editing: null when off; otherwise the typed value for each item id.
  const [targets, setTargets] = useState<Record<string, string> | null>(null)
  const [savingTargets, setSavingTargets] = useState(false)
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
  const filtered = summaries.filter(({ item, status }) => {
    if (reordering) return true
    if (filters.loc && item.location !== filters.loc) return false
    if (filters.cat && item.category !== filters.cat) return false
    if (filters.pr && item.priority !== filters.pr) return false
    if (filters.sr && item.stock_rule !== filters.sr) return false
    if (filters.kind && item.kind !== filters.kind) return false
    if (statusFilter && status !== statusFilter) return false
    if (!q) return true
    return [item.name_en, item.name_zh, item.category, item.notes ?? '', item.highlight_en ?? '', item.highlight_zh ?? '', word(lang, item.category)]
      .join(' ')
      .toLowerCase()
      .includes(q)
  })

  // Sort ties fall back to "My order".
  const sortKey: SortKey = reordering ? 'mine' : filters.sort
  const shown = [...filtered].sort((a, b) => {
    let d = 0
    if (sortKey === 'priority') d = PRIORITIES.indexOf(a.item.priority) - PRIORITIES.indexOf(b.item.priority)
    else if (sortKey === 'stock_rule') d = STOCK_RULES.indexOf(a.item.stock_rule) - STOCK_RULES.indexOf(b.item.stock_rule)
    else if (sortKey === 'status') d = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    else if (sortKey === 'name') d = itemName(lang, a.item).localeCompare(itemName(lang, b.item), lang === 'zh-Hant' ? 'zh-Hant' : 'en')
    return d || a.item.sort_order - b.item.sort_order
  })
  const anyFilter = !!(filters.loc || filters.cat || filters.pr || filters.sr || filters.kind || statusFilter || q)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= activeItems.length || from === to) return
    const list: Item[] = [...activeItems]
    const [it] = list.splice(from, 1)
    list.splice(to, 0, it)
    run(() => saveOrder(list))
  }

  const changedTargets = targets
    ? activeItems.filter((i) => {
        const v = targets[i.id]
        return v !== undefined && v.trim() !== '' && Number(v) >= 0 && round(Number(v)) !== Number(i.target_qty)
      })
    : []

  const startTargets = () => setTargets(Object.fromEntries(activeItems.map((i) => [i.id, formatQty(Number(i.target_qty))])))
  const cancelTargets = () => {
    if (changedTargets.length && !confirm(t('discardTargets', { n: changedTargets.length }))) return
    setTargets(null)
  }
  const saveTargets = async () => {
    if (!targets) return
    setSavingTargets(true)
    const ok = await run(() =>
      Promise.all(changedTargets.map((i) => updateItem(i.id, { target_qty: round(Number(targets[i.id])) }))),
    )
    setSavingTargets(false)
    if (ok) setTargets(null)
  }

  // Warn before leaving the page with unsaved target changes.
  useEffect(() => {
    if (!changedTargets.length) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changedTargets.length])

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
            <select aria-label={t('priority')} value={filters.pr} onChange={(e) => setFilter({ pr: e.target.value })}>
              <option value="">
                {t('priority')}: {t('all')}
              </option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`pr_${p}`)}
                </option>
              ))}
            </select>
            <select aria-label={t('stockRule')} value={filters.sr} onChange={(e) => setFilter({ sr: e.target.value })}>
              <option value="">
                {t('stockRule')}: {t('all')}
              </option>
              {STOCK_RULES.map((r) => (
                <option key={r} value={r}>
                  {t(`sr_${r}`)}
                </option>
              ))}
            </select>
            <select aria-label={t('kind')} value={filters.kind} onChange={(e) => setFilter({ kind: e.target.value })}>
              <option value="">
                {t('kind')}: {t('all')}
              </option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </select>
            <select aria-label={t('sortBy')} value={filters.sort} onChange={(e) => setFilter({ sort: e.target.value as SortKey })}>
              {(['mine', 'priority', 'stock_rule', 'status', 'name'] as const).map((k) => (
                <option key={k} value={k}>
                  {t('sortBy')}: {t(k === 'mine' ? 'sortMine' : k === 'priority' ? 'sortPriority' : k === 'stock_rule' ? 'sortStockRule' : k === 'status' ? 'sortStatus' : 'sortName')}
                </option>
              ))}
            </select>
          </div>
          {anyFilter && (
            <p className="no-print">
              <button
                onClick={() => {
                  setSearch('')
                  setStatusFilter('')
                  setFilter({ ...NO_FILTERS, sort: filters.sort })
                }}
              >
                {t('clearFilters')}
              </button>
            </p>
          )}
        </>
      )}

      <div className="row space-between no-print">
        {reordering ? (
          <span className="muted">{t('reorderHint')}</span>
        ) : targets ? (
          <span className="muted">{t('editTargetsHint')}</span>
        ) : (
          <Legend />
        )}
        <span className="row">
          {!reordering && !targets && <button onClick={startTargets}>{t('editTargets')}</button>}
          {!targets && (
            <button
              title={filters.sort !== 'mine' && !reordering ? t('sortReorderHint') : undefined}
              onClick={() => {
                if (!reordering && filters.sort !== 'mine') setFilter({ sort: 'mine' })
                setReordering(!reordering)
              }}
            >
              {reordering ? t('doneReordering') : t('reorder')}
            </button>
          )}
        </span>
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
            return (
              <QuickRow
                key={s.item.id}
                s={s}
                index={index}
                onRemove={remove}
                onNeedBatch={setQuickAdd}
                targetDraft={targets ? targets[s.item.id] ?? formatQty(Number(s.item.target_qty)) : undefined}
                onTargetChange={(v) => setTargets((prev) => (prev ? { ...prev, [s.item.id]: v } : prev))}
              />
            )
          })}
        </div>
      )}

      <p className="no-print">
        <a href="#/archived">{t('archivedItems')}</a>
      </p>

      {targets && (
        <div className="save-bar no-print" role="region" aria-label={t('editTargets')}>
          <span>{t('targetsChanged', { n: changedTargets.length })}</span>
          <span className="row">
            <button onClick={cancelTargets} disabled={savingTargets}>
              {t('cancel')}
            </button>
            <button className="primary" onClick={saveTargets} disabled={savingTargets || changedTargets.length === 0}>
              {savingTargets ? t('saving') : t('saveTargets')}
            </button>
          </span>
        </div>
      )}

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
  targetDraft,
  onTargetChange,
}: {
  s: ItemSummary
  index: number
  onRemove: (item: Item) => void
  onNeedBatch: (item: Item) => void
  targetDraft?: string
  onTargetChange?: (value: string) => void
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

  const editing = targetDraft !== undefined
  const draftNum = Number(targetDraft)
  const draftValid = editing && targetDraft!.trim() !== '' && Number.isFinite(draftNum) && draftNum >= 0
  const changed = draftValid && round(draftNum) !== Number(s.item.target_qty)
  const bump = (delta: number) => {
    const base = draftValid ? draftNum : Number(s.item.target_qty)
    onTargetChange?.(formatQty(round(Math.max(0, base + delta))))
  }

  return (
    <div className={`item-row status-${s.status} ${busy ? 'busy' : ''} ${editing ? 'target-edit' : ''} ${changed ? 'changed' : ''}`}>
      <span className="item-no">{index + 1}</span>
      <span className="item-name" role="link" tabIndex={0} onClick={open} onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && open()}>
        <StatusDot status={s.status} /> {name}
        {itemHighlight(lang, s.item) && <small className="item-highlight">{itemHighlight(lang, s.item)}</small>}
        {s.item.notes && <small className="muted item-notes">{s.item.notes}</small>}
        <ItemTags item={s.item} />
      </span>
      {editing ? (
        <span className="item-qty stepper target-stepper">
          <button
            className="step-btn"
            aria-label={t('targetMinus', { n: `${formatQty(step)} ${unit}` })}
            title={t('targetMinus', { n: `${formatQty(step)} ${unit}` })}
            disabled={draftValid && draftNum <= 0}
            onClick={() => bump(-step)}
          >
            −
          </button>
          <label className="target-input">
            <span className="sr-only">{t('target')}</span>
            <small className="muted">
              {t('onHand')} {formatQty(s.onHand)} · {t('target')}
            </small>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={targetDraft}
              aria-invalid={!draftValid}
              onChange={(e) => onTargetChange?.(e.target.value)}
            />
          </label>
          <span className="unit-text">{unit}</span>
          <button
            className="step-btn"
            aria-label={t('targetPlus', { n: `${formatQty(step)} ${unit}` })}
            title={t('targetPlus', { n: `${formatQty(step)} ${unit}` })}
            onClick={() => bump(step)}
          >
            +
          </button>
        </span>
      ) : (
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
      )}
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

export function ItemTags({ item }: { item: Item }) {
  const { t } = useStore()
  return (
    <span className="tags">
      <span className={`tag tag-pr-${item.priority}`}>{t(`pr_${item.priority}`)}</span>
      <span className={`tag tag-sr-${item.stock_rule}`}>{t(`sr_${item.stock_rule}`)}</span>
      {item.kind === 'emergency' && <span className="tag tag-kind">{t('kind_emergency')}</span>}
    </span>
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
