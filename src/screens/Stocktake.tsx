import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { itemHighlight, itemName, word } from '../lib/i18n'
import { formatQty } from '../lib/dates'
import { covers, locationRank, round, summarise } from '../lib/status'
import type { ItemSummary } from '../lib/status'
import { cancelStocktake, deleteBatch, finishStocktake, loadAll, loadLines, saveLine, setCount, startStocktake } from '../lib/data'
import { BatchList } from '../components/BatchList'
import { StatusDot } from '../components/StatusDot'
import { areaText, stocktakeLabel } from '../lib/areas'

const MODE_KEY = 'stockpile.stocktakeMode'

function initialMode(): 'one' | 'list' {
  try {
    const m = localStorage.getItem(MODE_KEY)
    if (m === 'one' || m === 'list') return m
  } catch {
    /* storage may be blocked */
  }
  return window.innerWidth < 760 ? 'one' : 'list'
}

function lineFor(stocktakeId: string, s: ItemSummary) {
  return {
    stocktake_id: stocktakeId,
    item_id: s.item.id,
    counted_qty: s.onHand,
    target_qty: Number(s.item.target_qty),
    earliest_expiry: s.earliestExpiry,
  }
}

// The number counted on the shelf. Always saved when Confirm is tapped, even for an item
// with no stock recorded yet. Reports unsaved typing so the screen can warn before leaving.
function CountBox({
  s,
  done,
  onConfirm,
  onDirty,
}: {
  s: ItemSummary
  done: boolean
  onConfirm: (counted: number, expiry: string | null) => void
  onDirty: (dirty: boolean) => void
}) {
  const { t, lang } = useStore()
  const start = s.onHand > 0 || done ? formatQty(s.onHand) : ''
  const [value, setValue] = useState(start)
  const [expiry, setExpiry] = useState('')
  const [seen, setSeen] = useState(s.onHand)
  const step = Number(s.item.step_qty) || 1
  const unit = word(lang, s.item.unit)

  // Follow changes made in the batch list until the user types here.
  if (seen !== s.onHand) {
    setSeen(s.onHand)
    if (value === start || value === '') setValue(formatQty(s.onHand))
  }
  const n = value.trim() === '' ? null : Number(value)
  const valid = n !== null && Number.isFinite(n) && n >= 0
  const dirty = valid && round(n!) !== s.onHand
  useEffect(() => {
    onDirty(dirty || (!done && value.trim() !== '' && !valid))
  }, [dirty, done, value, valid, onDirty])

  const bump = (d: number) => setValue(formatQty(round(Math.max(0, (valid ? n! : s.onHand) + d))))

  return (
    <div className="count-box">
      <label className="count-field">
        <span>{t('countedLabel', { unit })}</span>
        <span className="stepper">
          <button type="button" className="step-btn" aria-label={t('minusStep', { n: `${formatQty(step)} ${unit}` })} onClick={() => bump(-step)}>
            −
          </button>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0"
            value={value}
            aria-invalid={value.trim() !== '' && !valid}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="button" className="step-btn" aria-label={t('plusStep', { n: `${formatQty(step)} ${unit}` })} onClick={() => bump(step)}>
            +
          </button>
        </span>
      </label>
      {valid && n! > s.onHand && (
        <label className="count-expiry">
          <span>
            {t('newStockExpiry')} <small className="muted">({t('optional')})</small>
          </span>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </label>
      )}
      <div className="row">
        <button
          className="primary"
          disabled={value.trim() !== '' && !valid}
          onClick={() => onConfirm(valid ? round(n!) : 0, expiry || null)}
        >
          ✓ {t('confirmItem')}
        </button>
        {dirty && <span className="unsaved">{t('notSavedYet')}</span>}
      </div>
    </div>
  )
}

// area: a location named in the link (for example from the Morning Board), offered first.
export function StocktakeScreen({ area }: { area?: string }) {
  const { t, lang, summaries, settings, openStocktake, areas, run, reload } = useStore()
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [linesFor, setLinesFor] = useState<string | null>(null)
  const [mode, setModeState] = useState(initialMode)
  const [index, setIndex] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  // Items with a typed count that has not been confirmed yet.
  const dirty = useRef<Set<string>>(new Set())
  const markDirty = useCallback((id: string, d: boolean) => {
    if (d) dirty.current.add(id)
    else dirty.current.delete(id)
  }, [])
  const leaveCard = (id: string | undefined) => !id || !dirty.current.has(id) || window.confirm(t('unsavedCount'))

  const setMode = (m: 'one' | 'list') => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* storage may be blocked */
    }
  }

  // Walk the garage, then the kitchen, then the freezer; only the areas this stock-take covers.
  const ordered = useMemo(
    () =>
      summaries
        .filter((s) => !openStocktake || covers(openStocktake, s.item.location))
        .sort(
          (a, b) => locationRank(a.item.location) - locationRank(b.item.location) || a.item.sort_order - b.item.sort_order,
        ),
    [summaries, openStocktake],
  )

  const openId = openStocktake?.id ?? null

  const refreshLines = useCallback(async () => {
    if (!openId) return
    const lines = await loadLines(openId)
    setConfirmed(new Set(lines.map((l) => l.item_id)))
    setLinesFor(openId)
    return lines
  }, [openId])

  // Load saved progress (it may come from another device).
  useEffect(() => {
    if (!openId) return
    refreshLines().then((lines) => {
      if (!lines) return
      const done = new Set(lines.map((l) => l.item_id))
      setIndex((i) => (i === null ? Math.max(0, ordered.findIndex((s) => !done.has(s.item.id))) : i))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, refreshLines])

  if (!openStocktake) {
    const count = (loc: string | null) => summaries.filter((s) => !loc || s.item.location === loc).length
    return (
      <section className="card stack">
        <h1>{t('stocktakeTitle')}</h1>
        <p>{t('stocktakeIntro')}</p>
        <h2>{t('stocktakeWhat')}</h2>
        <div className="area-choices">
          {[...areas]
            .sort((x, y) => Number(y.location === area) - Number(x.location === area))
            .map((a) => (
            <button
              key={a.location}
              className={`area-choice ${a.location === area ? 'primary suggested' : ''}`}
              autoFocus={a.location === area}
              onClick={() => run(() => startStocktake([a.location]))}
            >
              <strong>{t('countArea', { area: word(lang, a.location) })}</strong>
              <small>
                {t('areaItems', { n: count(a.location) })} · {areaText(a, t, lang)}
              </small>
            </button>
          ))}
          <button className={`area-choice ${area ? '' : 'primary'}`} onClick={() => run(() => startStocktake(null))}>
            <strong>{t('countEverything')}</strong>
            <small>{t('areaItems', { n: count(null) })}</small>
          </button>
        </div>
      </section>
    )
  }

  if (linesFor !== openStocktake.id) return <p className="muted">{t('loading')}</p>

  const doneCount = ordered.filter((s) => confirmed.has(s.item.id)).length
  const total = ordered.length

  const confirm = async (s: ItemSummary, advance: boolean, counted: number, expiry: string | null) => {
    const ok = await run(async () => {
      await setCount(s.item.id, s.batches, counted, expiry)
      // Record the line from what is now saved, so the snapshot always matches the stock.
      const fresh = await loadAll()
      const item = fresh.items.find((i) => i.id === s.item.id)
      if (item) await saveLine(lineFor(openStocktake.id, summarise(item, fresh.batches, settings)))
    })
    if (!ok) return
    dirty.current.delete(s.item.id)
    const next = new Set(confirmed).add(s.item.id)
    setConfirmed(next)
    if (advance) {
      const pos = ordered.findIndex((o) => o.item.id === s.item.id)
      const after = ordered.findIndex((o, i) => i > pos && !next.has(o.item.id))
      const anyLeft = ordered.findIndex((o) => !next.has(o.item.id))
      setIndex(after >= 0 ? after : anyLeft >= 0 ? anyLeft : pos)
    }
  }

  const removeEmpty = (s: ItemSummary) =>
    run(() => Promise.all(s.batches.filter((b) => Number(b.qty) <= 0).map((b) => deleteBatch(b.id))))

  const finish = async () => {
    if (dirty.current.size && !window.confirm(t('unsavedCount'))) return
    const left = total - doneCount
    if (left > 0 && !window.confirm(t('finishConfirm', { n: left }))) return
    setBusy(true)
    try {
      // Wait for any batch edit still saving, then snapshot every active item from fresh data.
      await reload()
      const ok = await run(async () => {
        // Confirmed lines are kept exactly as saved; only items never confirmed are added now.
        const [fresh, saved] = await Promise.all([loadAll(), loadLines(openStocktake.id)])
        const have = new Set(saved.map((l) => l.item_id))
        const lines = fresh.items
          .filter((i) => !i.archived && covers(openStocktake, i.location) && !have.has(i.id))
          .map((i) => lineFor(openStocktake.id, summarise(i, fresh.batches, settings)))
        await finishStocktake(openStocktake.id, lines, notes)
      })
      if (ok) go('shopping')
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    if (window.confirm(t('cancelStocktakeConfirm'))) run(() => cancelStocktake(openStocktake.id)).then(() => go(''))
  }

  const card = (s: ItemSummary) => {
    const done = confirmed.has(s.item.id)
    const hasEmpty = s.batches.some((b) => Number(b.qty) <= 0)
    return (
      <article key={s.item.id} className={`card stock-card ${done ? 'is-done' : ''}`}>
        <div className="row space-between">
          <h3>
            <StatusDot status={s.status} /> {itemName(lang, s.item)}
          </h3>
          {done && <span className="badge">✓ {t('confirmed')}</span>}
        </div>
        <p className="muted">
          {word(lang, s.item.location)} · {t('onHand')} {formatQty(s.onHand)} / {formatQty(Number(s.item.target_qty))}{' '}
          {word(lang, s.item.unit)}
          {s.item.notes ? ` · ${s.item.notes}` : ''}
        </p>
        <p className="item-highlight">{itemHighlight(lang, s.item)}
        </p>
        <CountBox
          key={`${s.item.id}-${done}`}
          s={s}
          done={done}
          onDirty={(d) => markDirty(s.item.id, d)}
          onConfirm={(counted, expiry) => confirm(s, mode === 'one', counted, expiry)}
        />
        <details className="batch-details" open={s.batches.length > 1 || undefined}>
          <summary>{t('batchesDetails', { n: s.batches.length })}</summary>
          <BatchList item={s.item} batches={s.batches} showUsed={false} showAdd={false} />
          {hasEmpty && <button onClick={() => removeEmpty(s)}>{t('removeEmpty')}</button>}
        </details>
      </article>
    )
  }

  const current = index !== null ? ordered[Math.min(index, ordered.length - 1)] : null

  return (
    <section>
      <div className="row space-between">
        <h1>{t('stocktakeOfArea', { area: stocktakeLabel(openStocktake, t, lang) })}</h1>
        <div className="segmented" role="group">
          <button className={mode === 'one' ? 'on' : ''} onClick={() => setMode('one')}>
            {t('oneAtATime')}
          </button>
          <button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>
            {t('fullList')}
          </button>
        </div>
      </div>

      <div className="progress" aria-label={t('progress', { done: doneCount, total })}>
        <div className="progress-bar" style={{ width: total ? `${(doneCount / total) * 100}%` : '0%' }} />
        <span>{t('progress', { done: doneCount, total })}</span>
      </div>

      {mode === 'one' && current && index !== null && (
        <>
          <h2 className="loc-heading">{word(lang, current.item.location)}</h2>
          {card(current)}
          <div className="row space-between">
            <button disabled={index <= 0} onClick={() => leaveCard(current?.item.id) && setIndex(index - 1)}>
              ← {t('previous')}
            </button>
            <span className="muted">
              {Math.min(index, ordered.length - 1) + 1} / {total}
            </span>
            <button disabled={index >= total - 1} onClick={() => leaveCard(current?.item.id) && setIndex(index + 1)}>
              {t('next')} →
            </button>
          </div>
        </>
      )}

      {mode === 'list' &&
        ordered.map((s, i) => (
          <div key={s.item.id}>
            {(i === 0 || ordered[i - 1].item.location !== s.item.location) && (
              <h2 className="loc-heading">{word(lang, s.item.location)}</h2>
            )}
            {card(s)}
          </div>
        ))}

      <div className="card stack">
        <label>
          <span>{t('stocktakeNotes')}</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="row">
          <button className="primary" disabled={busy} onClick={finish}>
            {t('finishStocktake')}
          </button>
          <button className="danger push-right" onClick={cancel}>
            {t('cancelStocktake')}
          </button>
        </div>
      </div>
    </section>
  )
}
