import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { clearItemState, loadItemStates, setItemState } from './data'
import type { ItemState } from './data'
import { ItemCtx, todayVan, tomorrowVan, useItems } from './itemHooks'
import type { Ctx } from './itemHooks'

export function ItemStateProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, ItemState>>({})
  const [showHidden, setShowHidden] = useState(false)
  const [lastAction, setLastAction] = useState<Ctx['lastAction']>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadItemStates().then(
      (list) => setStates(Object.fromEntries(list.map((s) => [s.item_key, s]))),
      (e) => setError((e as Error).message),
    )
  }, [])

  const isHidden = useCallback((key: string) => {
    const s = states[key]
    if (!s) return false
    if (s.status === 'done') return true
    return !!s.until && s.until > todayVan()
  }, [states])

  const mark = useCallback((key: string, title: string, status: 'done' | 'snoozed') => {
    const row: ItemState = { item_key: key, status, until: status === 'snoozed' ? tomorrowVan() : null, title }
    setStates((s) => ({ ...s, [key]: row }))
    setLastAction({ key, title, status })
    setItemState(row).catch((e) => setError((e as Error).message))
  }, [])

  const undo = useCallback((key: string) => {
    setStates((s) => {
      const next = { ...s }
      delete next[key]
      return next
    })
    setLastAction(null)
    clearItemState(key).catch((e) => setError((e as Error).message))
  }, [])

  const value = useMemo(
    () => ({ isHidden, mark, undo, showHidden, setShowHidden, lastAction, error }),
    [isHidden, mark, undo, showHidden, lastAction, error],
  )
  return <ItemCtx.Provider value={value}>{children}</ItemCtx.Provider>
}

export function ItemActions({ k, title, hidden }: { k: string; title: string; hidden?: boolean }) {
  const { mark, undo } = useItems()
  if (hidden) {
    return (
      <span className="acts">
        <button type="button" className="act" onClick={() => undo(k)} title="Show this item again">Restore</button>
      </span>
    )
  }
  return (
    <span className="acts">
      <button type="button" className="act" onClick={() => mark(k, title, 'done')} title="Mark as done" aria-label={`Mark done: ${title}`}>✓</button>
      <button type="button" className="act" onClick={() => mark(k, title, 'snoozed')} title="Snooze until tomorrow" aria-label={`Snooze until tomorrow: ${title}`}>zZ</button>
    </span>
  )
}

export function HiddenNote({ n }: { n: number }) {
  const { showHidden, setShowHidden } = useItems()
  if (!n && !showHidden) return null
  return (
    <button type="button" className="hidden-note" onClick={() => setShowHidden(!showHidden)}>
      {showHidden ? 'Hide done and snoozed' : `${n} done or snoozed · show`}
    </button>
  )
}

/** A small bar at the bottom of the screen with Undo for the last done / snooze. */
export function UndoBar() {
  const { lastAction, undo, error } = useItems()
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!lastAction) return
    setShown(lastAction.key)
    const t = setTimeout(() => setShown(null), 6000)
    return () => clearTimeout(t)
  }, [lastAction])
  if (error) return <div className="undo-bar problem-bar" role="status">Could not save: {error}</div>
  if (!lastAction || shown !== lastAction.key) return null
  return (
    <div className="undo-bar" role="status">
      <span>{lastAction.status === 'done' ? 'Marked done' : 'Snoozed until tomorrow'}: {lastAction.title}</span>
      <button type="button" className="btn ghost" onClick={() => undo(lastAction.key)}>Undo</button>
    </div>
  )
}
