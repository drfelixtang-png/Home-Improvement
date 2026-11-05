import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Batch, Item, Lang, PriceRecord, ProductLink, Settings, Stocktake } from './types'
import { claimSeed, createSettings, importStarter, loadAll, updateSettings } from './data'
import { translate } from './i18n'
import type { TKey } from './i18n'
import { areaDue, locationRank, summarise } from './status'
import type { AreaDue, ItemSummary } from './status'

const LANG_KEY = 'stockpile.lang'

function storedLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'zh-Hant' ? 'zh-Hant' : 'en'
  } catch {
    return 'en'
  }
}

const DEFAULT_SETTINGS: Settings = {
  user_id: '',
  language: 'en',
  stocktake_interval_months: 3,
  expiry_warning_days: 180,
  seeded: false,
}

interface Store {
  session: Session | null
  authReady: boolean
  loading: boolean
  error: string | null
  lang: Lang
  t: (key: TKey, vars?: Record<string, string | number>) => string
  setLang: (lang: Lang) => void
  settings: Settings
  items: Item[]
  activeItems: Item[]
  batches: Batch[]
  stocktakes: Stocktake[]
  prices: PriceRecord[]
  links: ProductLink[]
  openStocktake: Stocktake | null
  openDone: number
  areas: AreaDue[]
  summaries: ItemSummary[]
  summaryById: Map<string, ItemSummary>
  reload: () => Promise<void>
  dismissError: () => void
  run: (fn: () => Promise<unknown>) => Promise<boolean>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLangState] = useState<Lang>(storedLang)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [items, setItems] = useState<Item[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([])
  const [openDone, setOpenDone] = useState(0)
  const [prices, setPrices] = useState<PriceRecord[]>([])
  const [links, setLinks] = useState<ProductLink[]>([])
  const seeding = useRef(false)
  const inflight = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const loadOnce = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      let data = await loadAll()
      let s = data.settings
      if (!s) s = await createSettings(storedLang())
      // First sign-in: load the starter list once.
      if (!s.seeded && !seeding.current) {
        seeding.current = true
        const claimed = await claimSeed(userId)
        if (claimed && data.items.length === 0) await importStarter([])
        s = { ...s, seeded: true }
        data = await loadAll()
        // Another tab or device is loading the starter list: wait for it (up to about 6 seconds).
        for (let i = 0; !claimed && data.items.length === 0 && i < 12; i++) {
          await new Promise((r) => setTimeout(r, 500))
          data = await loadAll()
        }
      }
      setSettings(s)
      setLangState(s.language)
      try {
        localStorage.setItem(LANG_KEY, s.language)
      } catch {
        /* storage may be blocked */
      }
      setItems(data.items)
      setBatches(data.batches)
      setStocktakes(data.stocktakes)
      setOpenDone(data.openDone)
      setPrices(data.prices)
      setLinks(data.links)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Only one load at a time; a request made during a load runs once more afterwards.
  const reload = useCallback(async () => {
    if (inflight.current) {
      again.current = true
      return inflight.current
    }
    const p = (async () => {
      do {
        again.current = false
        await loadOnce()
      } while (again.current)
    })()
    inflight.current = p
    try {
      await p
    } finally {
      inflight.current = null
    }
  }, [loadOnce])

  useEffect(() => {
    if (userId) reload()
    else {
      setItems([])
      setBatches([])
      setStocktakes([])
      setSettings(DEFAULT_SETTINGS)
    }
  }, [userId, reload])

  // Pick up changes made on another device when this tab comes back into view.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l)
      setSettings((s) => ({ ...s, language: l }))
      try {
        localStorage.setItem(LANG_KEY, l)
      } catch {
        /* storage may be blocked */
      }
      if (userId) updateSettings({ language: l }, userId).catch((e) => setError((e as Error).message))
    },
    [userId],
  )

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  )

  // Runs a change, reports any error, then reloads the data.
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn()
        await reload()
        return true
      } catch (e) {
        setError((e as Error).message)
        return false
      }
    },
    [reload],
  )

  const value = useMemo<Store>(() => {
    const activeItems = items.filter((i) => !i.archived).sort((a, b) => a.sort_order - b.sort_order)
    const summaries = activeItems.map((i) => summarise(i, batches, settings))
    const summaryById = new Map(summaries.map((s) => [s.item.id, s]))
    const openStocktake = stocktakes.find((s) => s.status === 'in_progress') ?? null
    // Locations that hold active items, in walking order.
    const used = [...new Set(activeItems.map((i) => i.location))].sort((a, b) => locationRank(a) - locationRank(b))
    const areas = areaDue(stocktakes, used, settings)
    return {
      session,
      authReady,
      loading,
      error,
      lang,
      t,
      setLang,
      settings,
      items,
      activeItems,
      batches,
      stocktakes,
      prices,
      links,
      openStocktake,
      openDone,
      areas,
      summaries,
      summaryById,
      reload,
      dismissError: () => setError(null),
      run,
    }
  }, [session, authReady, loading, error, lang, t, setLang, settings, items, batches, stocktakes, prices, links, openDone, reload, run])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
