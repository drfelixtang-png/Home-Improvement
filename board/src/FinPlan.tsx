// Finance, Retirement tab: monthly spending that lasts to age 90, 95 or 100, under three scenarios.
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { loadHousehold } from './home'
import { vanDate } from './me'
import type { Finance, FinSettings, Fx } from './finance'
import { DEFAULT_SCENARIOS, HORIZONS, plan, savePlan } from './finPlan'
import type { Person, PlanSettings, Scenario } from './finPlan'

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
  const middle = p.table.find((t) => t.sc.key === 'middle') ?? p.table[0]
  const who = p.ages.map((a) => `${a.name} ${a.age}`).join(', ')

  return (
    <div className="detail-grid">
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
