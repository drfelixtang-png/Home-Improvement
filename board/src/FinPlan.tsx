// Finance, Retirement tab: monthly spending that lasts to age 90, 95 or 100, under three scenarios.
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { loadHousehold } from './home'
import { vanDate } from './me'
import type { Finance, FinSettings, Fx } from './finance'
import { DEFAULT_SCENARIOS, HORIZONS, pastSpending, plan, savePlan } from './finPlan'
import type { PastWindow, Person, PlanSettings, Scenario } from './finPlan'

const money = (v: number) => `${v < 0 ? '−' : ''}CA$${Math.abs(Math.round(v)).toLocaleString('en-CA')}`
const SERIES: Record<string, string> = { cautious: 's3', middle: 's1', hopeful: 's2' }

function Chart({ paths, startAge, show }: { paths: ReturnType<typeof plan>['paths']; startAge: number; show: boolean }) {
  const W = 760, H = 260, L = 64, R = 14, T = 14, B = 28
  const max = Math.max(1, ...paths.flatMap((p) => p.path))
  const n = paths[0]?.path.length ?? 1
  const X = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R)
  const Y = (v: number) => H - B - (v / max) * (H - B - T)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const ageTicks = [startAge, ...[60, 70, 80, 90, 100].filter((a) => a > startAge + 3)]
  return (<>
    <svg className="fin-chart plan" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money left each year under each scenario, in today's dollars">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="grid" />
          <text x={L - 6} y={Y(t) + 4} textAnchor="end">{show ? `${(t / 1e6).toFixed(t >= 1e6 ? 1 : 2)}M` : '•'}</text>
        </g>
      ))}
      {ageTicks.map((a) => <text key={a} x={X(a - startAge)} y={H - 8} textAnchor="middle">{a}</text>)}
      {paths.map((p) => (
        <path key={p.sc.key} d={p.path.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} className={`aline pline ${SERIES[p.sc.key] ?? 's0'}`} />
      ))}
    </svg>
    <div className="legend sub">
      {paths.map((p) => <span key={p.sc.key} className="leg-item"><span className={`key-line ${SERIES[p.sc.key] ?? 's0'}`} />{p.sc.label}</span>)}
      <span className="leg-item">Age of the younger of you along the bottom</span>
    </div>
  </>)
}


const WIN = ['s2', 's1', 's0', 's4']
function PastChart({ byYear, windows, show }: { byYear: { year: string; avg: number; recorded: number }[]; windows: PastWindow[]; show: boolean }) {
  const W = 760, H = 220, L = 64, R = 14, T = 14, B = 28
  const max = Math.max(1, ...byYear.map((y) => y.avg), ...windows.map((w) => w.avg)) * 1.1
  const n = Math.max(1, byYear.length), step = (W - L - R) / n, bw = step * 0.55
  const Y = (v: number) => H - B - (v / max) * (H - B - T)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  return (<>
    <svg className="fin-chart plan" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spending a month in each year, with the 1, 3, 5 and 10 year averages">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="grid" />
          <text x={L - 6} y={Y(t) + 4} textAnchor="end">{show ? `${(t / 1000).toFixed(t && t < 10000 ? 1 : 0)}k` : '•'}</text>
        </g>
      ))}
      {byYear.map((y, i) => {
        const x = L + i * step + (step - bw) / 2
        return (
          <g key={y.year}>
            <rect x={x} y={Y(y.avg)} width={bw} height={H - B - Y(y.avg)} className="bar-out" style={{ fillOpacity: y.recorded < 6 ? 0.4 : 1 }}><title>{`${y.year}: ${show ? money(y.avg) : ''} a month (${y.recorded} months recorded)`}</title></rect>
            <text x={x + bw / 2} y={H - 8} textAnchor="middle">{`'${y.year.slice(2)}`}</text>
            {y.recorded === 0 && <text x={x + bw / 2} y={H - B - 6} textAnchor="middle" className="sub">no records</text>}
          </g>
        )
      })}
      {windows.filter((w) => w.avg > 0).map((w, i) => (
        <line key={w.years} x1={L} x2={W - R} y1={Y(w.avg)} y2={Y(w.avg)} className={`aline pline ${WIN[i]}`} strokeDasharray="6 4"><title>{`${w.years}-year average ${show ? money(w.avg) : ''}`}</title></line>
      ))}
    </svg>
    <div className="legend sub">
      <span className="leg-item"><span className="key out" /> Spending a month in that year (paler: fewer than 6 months recorded)</span>
      {windows.map((w, i) => <span key={w.years} className="leg-item"><span className={`key-line ${WIN[i]}`} />{w.years}-year average</span>)}
    </div>
  </>)
}

type MarketRow = { place: string; measure: string; as_of: string; y1: number; y3: number; y5: number; y10: number; source: string; url?: string; inflation?: boolean; approx?: string[] }
type MarketRef = { updated?: string; note?: string; rows?: MarketRow[] }
const PERIODS = ['y1', 'y3', 'y5', 'y10'] as const
const pctTxt = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`
function MarketTable({ data: m, scen }: { data?: MarketRef; scen: Scenario[] }) {
  const rows = m?.rows ?? []
  if (!rows.length) return null
  const places = [...new Set(rows.map((r) => r.place))]
  return (
    <section className="sub-panel span-2">
      <h3>Past returns and inflation 過往回報及通脹 <span className="sub inline">a yearly average for each period, for reference</span></h3>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Measure</th><th className="n">1 year</th><th className="n">3 years</th><th className="n">5 years</th><th className="n">10 years</th><th>As of</th></tr></thead>
        <tbody>{places.flatMap((pl) => {
          const own = rows.filter((r) => r.place === pl)
          const stock = own.find((r) => !r.inflation), infl = own.find((r) => r.inflation)
          const out = [<tr key={pl} className="group"><td colSpan={6}><b>{pl}</b></td></tr>]
          for (const r of own) out.push(
            <tr key={pl + r.measure}>
              <td>{r.measure}<span className="sub">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.source}</a> : r.source}</span></td>
              {PERIODS.map((k) => <td key={k} className={`n ${!r.inflation ? (r[k] < 0 ? 'warn' : 'up') : ''}`}>{r.approx?.includes(k) ? 'about ' : ''}{pctTxt(r[k])}</td>)}
              <td className="sub">{r.as_of}</td>
            </tr>)
          if (stock && infl) out.push(
            <tr key={pl + 'real'}>
              <td><i>Stocks after inflation</i></td>
              {PERIODS.map((k) => <td key={k} className="n"><i>{pctTxt(((1 + stock[k] / 100) / (1 + infl[k] / 100) - 1) * 100)}</i></td>)}
              <td />
            </tr>)
          return out
        })}</tbody>
      </table></div>
      <p className="sub">Your plan scenarios for comparison: {scen.map((s) => `${s.label} ${s.ret}% return, ${s.infl}% inflation`).join('; ')}. Stock markets swing widely from year to year; the 10-year figures are the steadiest guide, and a mix of stocks, bonds and GICs earns less than stocks alone but falls less in bad years. {m?.note} Updated {m?.updated}.</p>
    </section>
  )
}

export function FinPlan({ f, fx, show, userId, onDone }: { f: Finance; fx: Fx; show: boolean; userId: string; onDone: () => void }) {
  const [people, setPeople] = useState<Person[]>([])
  useEffect(() => {
    loadHousehold().then((h) => {
      const ps = (h?.people ?? []) as { key: string; name: string; relation: string; born?: string }[]
      setPeople(ps.filter((p) => ['self', 'wife', 'husband', 'spouse', 'partner'].includes(p.relation) && p.born).map((p) => ({ key: p.key, name: p.name, born: p.born! })))
    }).catch(() => setPeople([]))
  }, [])
  const saved = ((f.settings as FinSettings & { retirement?: PlanSettings }).retirement ?? {})
  const [draft, setDraft] = useState<PlanSettings>(saved)
  const [msg, setMsg] = useState<string | null>(null)
  const today = vanDate()
  const fDraft = useMemo(() => ({ ...f, settings: { ...f.settings, retirement: draft } as FinSettings }), [f, draft])
  const p = useMemo(() => plan(fDraft, fx, people, today), [fDraft, fx, people, today])
  const M = (v: number) => (show ? money(v) : '••••')
  const scen = draft.scenarios?.length ? draft.scenarios : DEFAULT_SCENARIOS
  const setScen = (i: number, patch: Partial<Scenario>) => setDraft({ ...draft, scenarios: scen.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(/[^0-9.]/g, '')))
  const toggle = (k: string) => {
    const ex = new Set(draft.exclude ?? [])
    if (ex.has(k)) ex.delete(k); else ex.add(k)
    setDraft({ ...draft, exclude: [...ex] })
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('Saving…')
    try { await savePlan(userId, f, draft); setMsg('Saved.'); onDone() } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  const [withHousing, setWithHousing] = useState(false)
  const past = useMemo(() => pastSpending(f, fx, today, withHousing), [f, fx, today, withHousing])
  const middle = p.table.find((t) => t.sc.key === 'middle') ?? p.table[0]
  const who = p.ages.map((a) => `${a.name} ${a.age}`).join(', ')

  return (
    <div className="detail-grid">
      <section className="sub-panel span-2">
        <h3>Past spending 過往支出 <span className="sub inline">the best guide to future spending</span></h3>
        <div className="seg-toggle" role="group" aria-label="Mortgage and rent payments">
          <span className="sub inline">Mortgage and rent payments 按揭及租金</span>
          <button type="button" className={`btn ghost ${!withHousing ? 'on' : ''}`} aria-pressed={!withHousing} onClick={() => setWithHousing(false)}>Leave out 不計</button>
          <button type="button" className={`btn ghost ${withHousing ? 'on' : ''}`} aria-pressed={withHousing} onClick={() => setWithHousing(true)}>Include 計入</button>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Period</th><th className="n">A month</th><th className="n">A month, without income tax</th><th className="n">Months with records</th><th /></tr></thead>
          <tbody>{past.windows.map((w) => (
            <tr key={w.years}>
              <td>Last {w.years === 1 ? 'year' : `${w.years} years`} <span className="sub inline">{w.from.replace('-', '/')} to {w.to.replace('-', '/')}</span></td>
              <td className="n"><b>{w.recorded ? M(w.avg) : '-'}</b></td>
              <td className="n">{w.recorded ? M(w.avgNoTax) : '-'}</td>
              <td className={`n ${w.recorded < w.months ? 'warn' : ''}`}>{w.recorded} of {w.months}</td>
              <td className="n">{w.recorded > 0 && <button type="button" className="btn ghost" onClick={() => setDraft({ ...draft, monthly: Math.round(w.avg) })}>Use 採用</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {past.byYear.length > 0 && <PastChart byYear={past.byYear} windows={past.windows} show={show} />}
        <p className="sub">Averages are in the dollars of each year (not adjusted for inflation) and count only months with spending records. One-time items (cars, relocation, building costs) and transfers between own accounts or to family are not spending. {withHousing ? 'Mortgage and rent payments are included.' : 'Mortgage and rent payments are left out, since the home will be owned outright in retirement; past mortgages (Hong Kong, the Shuswap project loan) would otherwise inflate the figures.'} "Use" puts the amount into the spending test below; press Save to keep it.</p>
      </section>

      <MarketTable data={(f.settings as FinSettings & { market_reference?: MarketRef }).market_reference} scen={scen} />

      <section className="sub-panel span-2">
        <h3>Retirement plan 退休計劃 <span className="sub inline">today&apos;s dollars; planned until the younger of you ({p.youngest ? `${p.youngest.name}, now ${p.startAge}` : 'age unknown'}) reaches the age shown</span></h3>
        <div className="stats wide fin-stats">
          <div className="stat"><b>{M(p.pot.total)}</b><span>Money to live on</span></div>
          <div className="stat"><b>{M(p.pot.home)}</b><span>Family home, kept and never spent</span></div>
          <div className="stat"><b>{middle ? M(middle.byAge[0].monthly) : '-'}</b><span>A month to age 90, middle scenario</span></div>
          <div className="stat"><b>{middle ? M(middle.byAge[2].monthly) : '-'}</b><span>A month to age 100, middle scenario</span></div>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Scenario</th><th className="n">Return</th><th className="n">Inflation</th>{HORIZONS.map((h) => <th key={h} className="n">Lasts to {h}</th>)}</tr></thead>
          <tbody>
            {p.table.map((t) => (
              <tr key={t.sc.key}>
                <td><span className={`key-line ${SERIES[t.sc.key] ?? 's0'}`} /> {t.sc.label}<span className="sub">{(t.r * 100).toFixed(1)}% a year after inflation</span></td>
                <td className="n">{t.sc.ret}%</td>
                <td className="n">{t.sc.infl}%</td>
                {t.byAge.map((x) => <td key={x.h} className="n"><b>{M(x.monthly)}</b><span className="sub">a month</span></td>)}
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="sub">The most you can spend every month, rising with inflation, so the money runs out exactly at that age{p.leave ? ` and still leaves ${M(p.leave)}` : ''}. {who && `Ages now: ${who}.`}</p>
      </section>

      <section className="sub-panel span-2">
        <h3>Test a spending amount 試算</h3>
        <form className="hi-edit" onSubmit={save}>
          <label>Spending a month (CA$)<input inputMode="decimal" value={draft.monthly ?? Math.round(p.monthly)} onChange={(e) => setDraft({ ...draft, monthly: num(e.target.value) })} /></label>
          <label>Other income a month (CA$)<input inputMode="decimal" placeholder="0" value={draft.income ?? ''} onChange={(e) => setDraft({ ...draft, income: num(e.target.value) })} /></label>
          <label>Leave at the end (CA$)<input inputMode="decimal" placeholder="0" value={draft.leave ?? ''} onChange={(e) => setDraft({ ...draft, leave: num(e.target.value) })} /></label>
          {scen.map((s, i) => (
            <fieldset key={s.key} className="fin-scen">
              <legend>{s.label}</legend>
              <label>Return %<input inputMode="decimal" value={s.ret} onChange={(e) => setScen(i, { ret: num(e.target.value) ?? 0 })} /></label>
              <label>Inflation %<input inputMode="decimal" value={s.infl} onChange={(e) => setScen(i, { infl: num(e.target.value) ?? 0 })} /></label>
            </fieldset>
          ))}
          <fieldset className="wide">
            <legend>Money counted</legend>
            {p.pot.parts.map((x) => (
              <label key={x.key} className="check"><input type="checkbox" checked={!(draft.exclude ?? []).includes(x.key)} onChange={() => toggle(x.key)} /> {x.label} <span className="sub inline">{M(x.value)}</span></label>
            ))}
          </fieldset>
          <div className="form-row"><button type="submit" className="btn">Save as my plan 儲存</button>{msg && <span className="sub" role="status">{msg}</span>}</div>
        </form>

        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Scenario</th><th>At {M(p.monthly)} a month</th><th className="n">Left at 90</th><th className="n">Left at 100</th></tr></thead>
          <tbody>
            {p.paths.map((x) => (
              <tr key={x.sc.key}>
                <td><span className={`key-line ${SERIES[x.sc.key] ?? 's0'}`} /> {x.sc.label}</td>
                <td className={x.lastsTo !== null && x.lastsTo < 100 ? 'warn' : 'up'}>{x.lastsTo === null ? 'Lasts beyond 100' : `Runs out at about ${x.lastsTo}`}</td>
                <td className="n">{M(x.at90)}</td>
                <td className="n">{M(x.at100)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {p.paths.length > 0 && <Chart paths={p.paths} startAge={p.startAge} show={show} />}
      </section>

      <section className="sub-panel span-2">
        <h3>What this assumes 假設</h3>
        <ul className="plain">
          <li>No work income and no government pensions (CPP or OAS). Adding them later will raise every figure.</li>
          <li>The family home is kept and not spent. Other property counts at your share of its value; its rent is treated as part of its return, so do not add it again as income.</li>
          <li>Returns are after fees and roughly after tax, and every figure is in today&apos;s dollars. Spending is the same each year; in practice it is often higher in the early, active years and lower later, apart from health care.</li>
          <li>Real markets go up and down. A bad few years early on hurts more than the same years later, so treat the Cautious row as the safer guide.</li>
          <li>Money counted includes every owner on the board unless you untick them. Felicia&apos;s and Norinian&apos;s money belongs to them; untick it to see a plan on your own and Norina&apos;s money alone.</li>
        </ul>
      </section>
    </div>
  )
}
