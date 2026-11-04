import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { itemName, word } from '../lib/i18n'
import { formatQty } from '../lib/dates'
import { locationRank, summarise } from '../lib/status'
import type { ItemSummary } from '../lib/status'
import { cancelStocktake, deleteBatch, finishStocktake, loadAll, loadLines, saveLine, startStocktake } from '../lib/data'
import { BatchList } from '../components/BatchList'
import { StatusDot } from '../components/StatusDot'

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

export function StocktakeScreen() {
  const { t, lang, summaries, settings, openStocktake, run, reload } = useStore()
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [linesFor, setLinesFor] = useState<string | null>(null)
  const [mode, setModeState] = useState(initialMode)
  const [index, setIndex] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const setMode = (m: 'one' | 'list') => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* storage may be blocked */
    }
  }

  // Walk the garage, then the kitchen, then the freezer.
  const ordered = useMemo(
    () =>
      [...summaries].sort(
        (a, b) => locationRank(a.item.location) - locationRank(b.item.location) || a.item.sort_order - b.item.sort_order,
      ),
    [summaries],
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
    return (
      <section className="card">
        <h1>{t('stocktakeTitle')}</h1>
        <p>{t('stocktakeIntro')}</p>
        <button className="primary" onClick={() => run(startStocktake)}>
          {t('startStocktake')}
        </button>
      </section>
    )
  }

  if (linesFor !== openStocktake.id) return <p className="muted">{t('loading')}</p>

  const doneCount = ordered.filter((s) => confirmed.has(s.item.id)).length
  const total = ordered.length

  const confirm = async (s: ItemSummary, advance: boolean) => {
    const ok = await run(() => saveLine(lineFor(openStocktake.id, s)))
    if (!ok) return
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
    const left = total - doneCount
    if (left > 0 && !window.confirm(t('finishConfirm', { n: left }))) return
    setBusy(true)
    try {
      // Wait for any batch edit still saving, then snapshot every active item from fresh data.
      await reload()
      const ok = await run(async () => {
        const fresh = await loadAll()
        const lines = fresh.items
          .filter((i) => !i.archived)
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
        <BatchList item={s.item} batches={s.batches} showUsed={false} />
        <div className="row">
          <button className="primary" onClick={() => confirm(s, mode === 'one')}>
            ✓ {t('confirmItem')}
          </button>
          {hasEmpty && <button onClick={() => removeEmpty(s)}>{t('removeEmpty')}</button>}
        </div>
      </article>
    )
  }

  const current = index !== null ? ordered[Math.min(index, ordered.length - 1)] : null

  return (
    <section>
      <div className="row space-between">
        <h1>{t('stocktakeTitle')}</h1>
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
            <button disabled={index <= 0} onClick={() => setIndex(index - 1)}>
              ← {t('previous')}
            </button>
            <span className="muted">
              {Math.min(index, ordered.length - 1) + 1} / {total}
            </span>
            <button disabled={index >= total - 1} onClick={() => setIndex(index + 1)}>
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
