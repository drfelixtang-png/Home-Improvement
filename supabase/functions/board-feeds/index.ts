// Morning Board feeds: market prices and news headlines.
// The browser cannot read these sources directly (no CORS), so this function
// fetches them on the server. Only fixed upstream hosts are used; the only
// caller input is a short list of ticker symbols, checked against a pattern.
//
//   GET ?kind=markets&symbols=^HSI,^GSPC   -> { quotes: Quote[] }
//   GET ?kind=news                          -> { regions: Region[] }

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
  return json({ error: 'Use kind=markets or kind=news' }, 400, 0)
})
