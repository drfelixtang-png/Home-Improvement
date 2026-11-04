import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configMissing, supabase } from '../../src/lib/supabase'
import {
  loadMarkets, loadNews, loadSettings, loadSnapshot, loadStockpile, loadWeather, saveSettings,
} from './data'
import type { BoardSettings, NewsRegion, Quote, Snapshot, StockpileView, Weather } from './data'
import { Card, Loading, Problem } from './ui'
import { HKG, STOCKPILE_URL, VAN, ago, clock } from './format'
import {
  CalendarDetail, CalendarSummary, InboxDetail, InboxSummary, MarketsDetail, MarketsSummary,
  NewsDetail, NewsSummary, SereneDetail, SereneSummary, StockDetail, StockSummary,
  WaitingDetail, WaitingSummary, WeatherDetail, WeatherSummary,
} from './panels'

type Load<T> = { data?: T; error?: string; loading: boolean }
const idle = { loading: true }

function useLoad<T>(fn: () => Promise<T>, deps: unknown[], enabled: boolean): [Load<T>, () => void] {
  const [state, setState] = useState<Load<T>>(idle)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let live = true
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (e) => live && setState({ error: (e as Error).message ?? String(e), loading: false }),
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled])
  return [state, useCallback(() => setTick((t) => t + 1), [])]
}

function useRoute(): string {
  const get = () => (window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : '')
  const [r, setR] = useState(get)
  useEffect(() => {
    const on = () => { setR(get()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}
const open = (id: string) => { window.location.hash = `#/${id}` }
const home = () => { window.location.hash = '#/' }

function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

// ================================================================= sign-in
function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: false },
    })
    if (error) setErr(error.message)
    else setSent(true)
  }
  return (
    <main className="login">
      <h1>Morning Board <span className="tc">晨報</span></h1>
      {sent ? (
        <p>Check your email for the sign-in link. If it opens the Stockpile Tracker instead, come back to this page: you will already be signed in.</p>
      ) : (
        <form className="form" onSubmit={submit}>
          <p className="sub">Sign in with the same email you use for the Stockpile Tracker.</p>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" type="submit">Send sign-in link</button>
          {err && <p className="problem">{err}</p>}
        </form>
      )}
    </main>
  )
}

// ================================================================= board
const PANELS: Record<string, { title: string; zh: string }> = {
  serenehost: { title: 'SereneHost', zh: '悠居' },
  inbox: { title: 'Important inbox', zh: '重要郵件' },
  calendar: { title: 'Today and tomorrow', zh: '今日 / 明日' },
  waiting: { title: 'Waiting on you', zh: '待你回覆' },
  weather: { title: 'Richmond, BC', zh: '天氣' },
  markets: { title: 'Markets', zh: '市場' },
  stockpile: { title: 'Stockpile', zh: '家居儲備' },
  news: { title: 'News', zh: '新聞' },
}

function greeting(now: Date): [string, string] {
  const h = Number(clock(now, VAN).slice(0, 2))
  if (h < 12) return ['Good morning, Felix', '早晨']
  if (h < 18) return ['Good afternoon, Felix', '午安']
  return ['Good evening, Felix', '晚安']
}

function Board({ session }: { session: Session }) {
  const route = useRoute()
  const now = useNow(30000)
  const [settings, setSettings] = useState<BoardSettings | null>(null)
  const [snap, reloadSnap] = useLoad(loadSnapshot, [], true)
  const [wx, reloadWx] = useLoad<Weather>(loadWeather, [], true)
  const [news, reloadNews] = useLoad<NewsRegion[]>(loadNews, [], true)
  const [sp, reloadSp] = useLoad<StockpileView | null>(loadStockpile, [], true)
  const watch = settings?.watchlist ?? []
  const [mk, reloadMk] = useLoad<Quote[]>(() => loadMarkets(watch), [JSON.stringify(watch)], settings !== null)

  useEffect(() => { loadSettings().then(setSettings, () => setSettings(null)) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && route) home() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [route])

  const refreshAll = () => { reloadSnap(); reloadWx(); reloadNews(); reloadSp(); reloadMk() }
  const save = async (patch: Partial<BoardSettings>) => {
    await saveSettings(session.user.id, patch)
    setSettings((s) => (s ? { ...s, ...patch } : s))
  }

  const s: Snapshot | undefined = snap.data?.data
  const snapAge = snap.data ? (now.getTime() - new Date(snap.data.data.generated_at ?? snap.data.created_at).getTime()) / 3600000 : null

  const wrap = <T,>(st: Load<T>, render: (d: T) => ReactNode) =>
    st.error ? <Problem msg={st.error} /> : st.data === undefined ? <Loading /> : render(st.data)

  const summary: Record<string, ReactNode> = {
    serenehost: wrap(snap, () => <SereneSummary sh={s?.serenehost} />),
    inbox: wrap(snap, () => <InboxSummary inbox={s?.inbox} />),
    calendar: wrap(snap, () => <CalendarSummary cal={s?.calendar} />),
    waiting: wrap(snap, () => <WaitingSummary snap={s} settings={settings} />),
    weather: wrap(wx, (d) => <WeatherSummary wx={d} />),
    markets: wrap(mk, (d) => <MarketsSummary quotes={d} watch={watch} />),
    stockpile: wrap(sp, (d) => (d ? <StockSummary sp={d} /> : <p className="empty">Open the <a href={STOCKPILE_URL}>Stockpile Tracker</a> once to set it up.</p>)),
    news: wrap(news, (d) => <NewsSummary regions={d} />),
  }
  const detail: Record<string, () => ReactNode> = {
    serenehost: () => wrap(snap, () => <SereneDetail sh={s?.serenehost} />),
    inbox: () => wrap(snap, () => <InboxDetail inbox={s?.inbox} />),
    calendar: () => wrap(snap, () => <CalendarDetail cal={s?.calendar} />),
    waiting: () => wrap(snap, () => <WaitingDetail snap={s} settings={settings} onSave={save} />),
    weather: () => wrap(wx, (d) => <WeatherDetail wx={d} />),
    markets: () => wrap(mk, (d) => <MarketsDetail quotes={d} watch={watch} onSave={save} />),
    stockpile: () => wrap(sp, (d) => (d ? <StockDetail sp={d} /> : <p className="empty">No stockpile data yet.</p>)),
    news: () => wrap(news, (d) => <NewsDetail regions={d} />),
  }

  const meta: Record<string, ReactNode> = {
    serenehost: s?.serenehost ? `${s.serenehost.items.filter((i) => i.severity === 'urgent').length} urgent` : null,
    inbox: s?.inbox ? `${s.inbox.items.length} items` : null,
    markets: mk.data ? 'Live' : null,
    news: news.data ? 'Live' : null,
    weather: wx.data ? 'Live' : null,
  }

  const panel = PANELS[route]

  return (
    <div className="app">
      <header className="top">
        <div className="greet">
          <h1>{greeting(now)[0]} <span className="tc">{greeting(now)[1]}</span></h1>
          <div className="date">
            {now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: VAN })}
            {' · '}
            <span className="tc">{now.toLocaleDateString('zh-HK', { month: 'long', day: 'numeric', weekday: 'long', timeZone: VAN })}</span>
          </div>
        </div>
        <div className="top-right">
          <div className="clocks">
            <div className="clock"><b>{clock(now, VAN)}</b><span>Vancouver</span></div>
            <div className="clock"><b>{clock(now, HKG)}</b><span>Hong Kong</span></div>
          </div>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={refreshAll}>Refresh</button>
            <button type="button" className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      <section className="strip">
        <div className="overview">
          <span className="lbl">Overnight summary 隔夜摘要 {snap.data && <em>· written {ago(snap.data.data.generated_at ?? snap.data.created_at, now)}</em>}</span>
          {snap.error ? <Problem msg={snap.error} /> : snap.loading && !snap.data ? <Loading /> : s ? (
            <p>{s.overview}{s.overview_zh && <span className="tc block">{s.overview_zh}</span>}</p>
          ) : <p className="empty">The first morning summary has not been written yet. It is written every day at about 7:15 am.</p>}
          {snapAge !== null && snapAge > 20 && <p className="stale">This summary is more than 20 hours old. Today's summary may not have run.</p>}
        </div>
        {s?.sites && (
          <ul className="sites" aria-label="Website status">
            {s.sites.map((x) => (
              <li key={x.url} title={`${x.url}: ${x.ok ? 'online' : 'problem'}${x.status ? ` (HTTP ${x.status})` : ''}${x.ms ? `, ${x.ms} ms` : ''}`}>
                <span className={`dot ${x.ok ? 'ok' : 'bad'}`} />{x.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {panel ? (
        <main className="detail">
          <div className="detail-head">
            <button type="button" className="btn ghost" onClick={home}>← Back to board</button>
            <h2>{panel.title} <span className="tc">{panel.zh}</span></h2>
            <nav className="tabs" aria-label="Panels">
              {Object.entries(PANELS).map(([id, p]) => (
                <a key={id} href={`#/${id}`} className={id === route ? 'on' : ''}>{p.title}</a>
              ))}
            </nav>
          </div>
          {detail[route]()}
        </main>
      ) : (
        <main className="grid">
          {Object.entries(PANELS).map(([id, p]) => (
            <Card key={id} id={id} title={p.title} zh={p.zh} meta={meta[id]} onOpen={() => open(id)}>
              {summary[id]}
            </Card>
          ))}
        </main>
      )}
      <footer className="foot">
        Weather: Open-Meteo · Markets: Yahoo Finance, may be delayed · News: CBC, Global News, RTHK, SCMP, New York Times, BBC · Summary written by Claude from Gmail, Google Calendar and SereneHost.
      </footer>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (configMissing) return <main className="login"><p className="problem">The Supabase settings are missing from this build.</p></main>
  if (session === undefined) return <main className="login"><Loading /></main>
  if (!session) return <Login />
  return <Board session={session} />
}
