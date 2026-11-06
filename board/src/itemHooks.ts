import { createContext, useContext } from 'react'

// Done and snooze: items the owner marks on the board disappear until they are relevant again.
// "Done" hides an item for good; "Snooze" hides it until tomorrow (Vancouver date).

const VAN = 'America/Vancouver'
export const todayVan = () => new Date().toLocaleDateString('en-CA', { timeZone: VAN })
export const tomorrowVan = () => new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: VAN })

export interface Keyed { key?: string | null; title: string; url?: string | null }

export function itemKey(scope: string, it: Keyed): string {
  const raw = it.key || it.url || it.title.toLowerCase().replace(/\s+/g, ' ').trim()
  return `${scope}:${raw}`.slice(0, 300)
}

export interface Ctx {
  isHidden: (key: string) => boolean
  mark: (key: string, title: string, status: 'done' | 'snoozed', until?: string) => void
  undo: (key: string) => void
  showHidden: boolean
  setShowHidden: (v: boolean) => void
  lastAction: { key: string; title: string; status: 'done' | 'snoozed' } | null
  error: string | null
}

export const ItemCtx = createContext<Ctx | null>(null)

export function useItems(): Ctx {
  const c = useContext(ItemCtx)
  if (!c) throw new Error('ItemStateProvider is missing')
  return c
}

/** Items still to show, plus how many are hidden as done or snoozed. */
export function useVisible<T extends Keyed>(scope: string, items: T[]): { visible: (T & { _key: string; _hidden: boolean })[]; hidden: number } {
  const { isHidden, showHidden } = useItems()
  const all = items.map((it) => {
    const k = itemKey(scope, it)
    return { ...it, _key: k, _hidden: isHidden(k) }
  })
  const hidden = all.filter((x) => x._hidden).length
  return { visible: showHidden ? all : all.filter((x) => !x._hidden), hidden }
}

