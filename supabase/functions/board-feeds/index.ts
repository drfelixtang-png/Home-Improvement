// Morning Board feeds: market prices and news headlines.
// The browser cannot read these sources directly (no CORS), so this function
// fetches them on the server. Only fixed upstream hosts are used; the only
// caller input is a short list of ticker symbols, checked against a pattern.
//
//   GET ?kind=markets&symbols=^HSI,^GSPC   -> { quotes: Quote[] }
//   GET ?kind=news                          -> { regions: Region[] }
//   GET ?kind=alerts                        -> weather, quakes, outages, tsunami near home

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const UA = 'Mozilla/5.0 (compatible; MorningBoard/1.0)'

const json = (body: unknown, status = 200, maxAge = 300) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}` },
  })

// ---------------------------------------------------------------- markets
interface Quote {
  symbol: string
  name: string
  price: number | null
  prevClose: number | null
  change: number | null
  changePct: number | null
  currency: string | null
  marketTime: number | null
  exchangeTz: string | null
  spark: number[]
  error?: string
}

const SYMBOL = /^[A-Za-z0-9^.=-]{1,15}$/

async function quote(symbol: string): Promise<Quote> {
  const empty: Quote = {
    symbol, name: symbol, price: null, prevClose: null, change: null, changePct: null,
    currency: null, marketTime: null, exchangeTz: null, spark: [],
  }
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) return { ...empty, error: `HTTP ${r.status}` }
    const data = await r.json()
    const res = data?.chart?.result?.[0]
    if (!res) return { ...empty, error: 'No data' }
    const m = res.meta ?? {}
    const closes: number[] = (res.indicators?.quote?.[0]?.close ?? []).filter((v: unknown) => typeof v === 'number')
    const price = typeof m.regularMarketPrice === 'number' ? m.regularMarketPrice : closes.at(-1) ?? null
    // Previous trading day's close: the last daily close before today's bar.
    const prev = closes.length >= 2 ? closes[closes.length - 2] : (m.chartPreviousClose ?? null)
    const change = price !== null && prev ? price - prev : null
    return {
      symbol,
      name: m.shortName ?? m.longName ?? symbol,
      price,
      prevClose: prev,
      change,
      changePct: change !== null && prev ? (change / prev) * 100 : null,
      currency: m.currency ?? null,
      marketTime: m.regularMarketTime ?? null,
      exchangeTz: m.exchangeTimezoneName ?? null,
      spark: closes.slice(-22),
    }
  } catch (e) {
    return { ...empty, error: String(e) }
  }
}

// ------------------------------------------------------------------- news
interface Headline { title: string; link: string; source: string; published: string | null }
interface Region { key: string; label: string; items: Headline[] }

const REGIONS: { key: string; label: string; feeds: { source: string; url: string }[] }[] = [
  { key: 'vancouver', label: 'Vancouver', feeds: [
    { source: 'CBC British Columbia', url: 'https://www.cbc.ca/webfeed/rss/rss-canada-britishcolumbia' },
    { source: 'Global News BC', url: 'https://globalnews.ca/bc/feed/' },
  ] },
  { key: 'canada', label: 'Canada', feeds: [
    { source: 'CBC News', url: 'https://www.cbc.ca/webfeed/rss/rss-canada' },
  ] },
  { key: 'hongkong', label: 'Hong Kong', feeds: [
    { source: 'RTHK 香港電台', url: 'https://rthk9.rthk.hk/rthk/news/rss/c_expressnews_clocal.xml' },
    { source: 'SCMP', url: 'https://www.scmp.com/rss/2/feed' },
  ] },
  { key: 'us', label: 'United States', feeds: [
    { source: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml' },
    { source: 'BBC US and Canada', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
  ] },
  { key: 'world', label: 'World', feeds: [
    { source: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  ] },
]

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(m[1]) : ''
}

async function feed(source: string, url: string): Promise<Headline[]> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    if (!r.ok) return []
    const xml = await r.text()
    const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
    return items.slice(0, 12).map((b) => {
      const pub = tag(b, 'pubDate') || tag(b, 'dc:date')
      const d = pub ? new Date(pub) : null
      return {
        title: tag(b, 'title'),
        link: tag(b, 'link') || tag(b, 'guid'),
        source,
        published: d && !isNaN(d.getTime()) ? d.toISOString() : null,
      }
    }).filter((h) => h.title && /^https?:\/\//.test(h.link))
  } catch {
    return []
  }
}

async function news(): Promise<Region[]> {
  return Promise.all(REGIONS.map(async (reg) => {
    const lists = await Promise.all(reg.feeds.map((f) => feed(f.source, f.url)))
    // Interleave sources so one feed does not fill the region, newest first within each.
    const seen = new Set<string>()
    const out: Headline[] = []
    const max = Math.max(...lists.map((l) => l.length), 0)
    for (let i = 0; i < max && out.length < 8; i++) {
      for (const l of lists) {
        const h = l[i]
        if (h && !seen.has(h.title)) { seen.add(h.title); out.push(h) }
      }
    }
    return { key: reg.key, label: reg.label, items: out.slice(0, 8) }
  }))
}

// ------------------------------------------------------------------ home alerts
// Hazards near home: weather warnings, earthquakes, power outages and tsunami bulletins.
// Only fixed official sources. The caller may pass its home location (lat, lon), which is
// checked to be in British Columbia; otherwise Richmond city centre is used.
/* eslint-disable @typescript-eslint/no-explicit-any -- upstream JSON is untyped */
type Home = { lat: number; lon: number }
const CITY: Home = { lat: 49.1666, lon: -123.1336 }
function homeFrom(u: URL): Home {
  const lat = Number(u.searchParams.get('lat')), lon = Number(u.searchParams.get('lon'))
  if (lat >= 48 && lat <= 60.1 && lon >= -139.1 && lon <= -114) return { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 }
  return CITY
}

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function weatherAlerts(HOME: Home) {
  const b = `${HOME.lon - 0.02},${HOME.lat - 0.02},${HOME.lon + 0.02},${HOME.lat + 0.02}`
  const d = (await getJson(`https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=30&bbox=${b}`)) as any
  const now = Date.now()
  const seen = new Set<string>()
  return (d.features ?? []).map((f: any) => f.properties).filter((p: any) => {
    const end = Date.parse(p.expiration_datetime ?? p.event_end_datetime ?? '')
    const k = `${p.alert_code}:${p.alert_name_en}`
    if ((end && end < now) || seen.has(k)) return false
    seen.add(k)
    return true
  }).map((p: any) => ({
    type: p.alert_type ?? null, // warning, watch, advisory, statement
    name: p.alert_name_en ?? p.alert_short_name_en ?? 'Weather alert',
    area: p.feature_name_en ?? null,
    text: String(p.alert_text_en ?? '').slice(0, 700),
    published: p.publication_datetime ?? null,
    ends: p.event_end_datetime ?? p.expiration_datetime ?? null,
  }))
}

async function quakes(HOME: Home) {
  const d = (await getJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson')) as any
  return (d.features ?? []).map((f: any) => {
    const [lon, lat] = f.geometry.coordinates
    return { mag: f.properties.mag, place: f.properties.place, time: f.properties.time, km: Math.round(km(HOME.lat, HOME.lon, lat, lon)), url: f.properties.url }
  }).filter((q: any) => q.km <= 400).sort((a: any, b: any) => b.time - a.time).slice(0, 10)
}

async function outages(HOME: Home) {
  const d = (await getJson('https://www.bchydro.com/power-outages/app/outages-map-data.json')) as any[]
  return d.map((o) => ({
    municipality: o.municipality, area: o.area, customers: o.numCustomersOut, cause: o.cause,
    status: o.crewStatusDescription, since: o.dateOff, km: Math.round(km(HOME.lat, HOME.lon, o.latitude, o.longitude) * 10) / 10,
  })).filter((o) => o.municipality === 'Richmond' || o.km <= 5).sort((a, b) => a.km - b.km).slice(0, 10)
}

async function tsunami() {
  const r = await fetch('https://www.tsunami.gov/events/xml/PAAQAtom.xml', { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const xml = await r.text()
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? []
  return entries.map((e) => {
    const text = decode(e.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
    const category = (text.match(/Category:\s*([A-Za-z ]+?)\s+Issue Time/) ?? [])[1] ?? 'Unknown'
    return {
      title: tag(e, 'title'), updated: tag(e, 'updated'), category,
      threat: /warning|advisory|watch/i.test(category),
      bc: /british columbia/i.test(text),
      note: (text.match(/Note:\s*\*?\s*([^*]+?)(Definition:|$)/) ?? [])[1]?.trim() ?? null,
    }
  }).filter((t) => Date.now() - Date.parse(t.updated) < 48 * 3600000)
}

async function homeAlerts(home: Home) {
  const settle = async <T,>(f: () => Promise<T>) => { try { return { ok: true, data: await f() } } catch (e) { return { ok: false, error: String(e), data: [] as unknown as T } } }
  const [w, q, o, t] = await Promise.all([settle(() => weatherAlerts(home)), settle(() => quakes(home)), settle(() => outages(home)), settle(tsunami)])
  return { weather: w, quakes: q, outages: o, tsunami: t, fetchedAt: new Date().toISOString() }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ serve
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const u = new URL(req.url)
  const kind = u.searchParams.get('kind')
  if (kind === 'markets') {
    const symbols = (u.searchParams.get('symbols') ?? '').split(',').map((s) => s.trim()).filter((s) => SYMBOL.test(s)).slice(0, 20)
    if (!symbols.length) return json({ error: 'No valid symbols' }, 400, 0)
    return json({ quotes: await Promise.all(symbols.map(quote)), fetchedAt: new Date().toISOString() }, 200, 120)
  }
  if (kind === 'news') {
    return json({ regions: await news(), fetchedAt: new Date().toISOString() }, 200, 600)
  }
  if (kind === 'alerts') {
    return json(await homeAlerts(homeFrom(u)), 200, 300)
  }
  return json({ error: 'Use kind=markets, kind=news or kind=alerts' }, 400, 0)
})
