import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Sev } from './ui'
import { shortDate } from './format'
import { vanDate } from './me'
import type { AlertLine, Category, HomeItem, Household } from './home'
import { addHomeItem, doneToday, dueState, isReady, updateHomeItem } from './home'

type Lang = 'zh' | 'en'

const TABS: { key: Category | 'household'; label: string; zh: string }[] = [
  { key: 'maintenance', label: 'House', zh: '家居保養' },
  { key: 'emergency', label: 'Emergency plan', zh: '應急計劃' },
  { key: 'health', label: 'Health', zh: '健康' },
  { key: 'car', label: 'Cars', zh: '汽車' },
  { key: 'bill', label: 'Bills', zh: '賬單' },
  { key: 'document', label: 'Documents', zh: '證件' },
  { key: 'household', label: 'Household', zh: '家庭資料' },
]

const STATE_LABEL = { overdue: 'Overdue', week: 'This week', month: 'This month', later: 'Later', done: 'Done', nodate: 'Add a date' } as const

function subjectName(h: Household | null, key: string): string {
  if (key === 'house') return 'House 屋企'
  const p = h?.people.find((x) => x.key === key)
  if (p) return `${p.name} ${p.relation_zh}`
  const c = h?.cars.find((x) => x.key === key)
  return c ? c.name : key
}

function ageOn(born: string, today: string): number {
  const [y, m, d] = born.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}

// ================================================================= one item
function ItemRow({ item, today, h, lang, onChanged }: { item: HomeItem; today: string; h: Household | null; lang: Lang; onChanged: () => void }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ last_done: item.last_done ?? '', next_due: item.next_due ?? '', every: item.every_months ?? '', note: item.note })
  const [msg, setMsg] = useState<string | null>(null)
  const { state, days } = dueState(item, today)
  const run = async (patch: Partial<HomeItem>) => {
    setMsg('Saving…')
    try { await updateHomeItem(item.id, patch); setMsg(null); setEdit(false); onChanged() } catch (e) { setMsg(`Could not save: ${(e as Error).message}`) }
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    run({ last_done: f.last_done || null, next_due: f.next_due || null, every_months: f.every === '' ? null : Number(f.every), note: f.note })
  }
  const title = lang === 'zh' && item.title_zh ? item.title_zh : item.title
  const other = lang === 'zh' ? item.title : item.title_zh
  return (
    <li className={`hi ${state}`}>
      <div className="hi-main">
        <span className={`due-chip ${state}`}>
          {state === 'overdue' ? `${-days!} d late` : state === 'nodate' || state === 'done' ? STATE_LABEL[state] : days === 0 ? 'Today' : `${days} d`}
        </span>
        <div className="hi-text">
          <span className={lang === 'zh' ? 'tc-text' : ''}>{title}</span>
          {other && <span className="sub">{other}</span>}
          <span className="sub">
            {item.subject !== 'house' && <>{subjectName(h, item.subject)} · </>}
            {item.every_months ? (item.every_months === 1 ? 'Every month' : item.every_months === 12 ? 'Every year' : `Every ${item.every_months} months`) : 'One-off'}
            {item.last_done && <> · last done {shortDate(item.last_done)}</>}
            {item.next_due && <> · due {shortDate(item.next_due)}</>}
          </span>
          {item.note && <span className="sub note">{item.note}</span>}
        </div>
        <span className="hi-acts">
          <button type="button" className="act" onClick={() => run(doneToday(item, today))} title="Mark done today">Done ✓</button>
          <button type="button" className="act" onClick={() => setEdit(!edit)} aria-expanded={edit}>{edit ? 'Close' : 'Edit'}</button>
        </span>
      </div>
      {edit && (
        <form className="hi-edit" onSubmit={save}>
          <label>Last done<input type="date" value={f.last_done} onChange={(e) => setF({ ...f, last_done: e.target.value })} /></label>
          <label>Next due<input type="date" value={f.next_due} onChange={(e) => setF({ ...f, next_due: e.target.value })} /></label>
          <label>Every (months, blank = one-off)<input type="number" min={0.5} step={0.5} value={f.every} onChange={(e) => setF({ ...f, every: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
          <label className="wide">Note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <div className="form-row">
            <button type="submit" className="btn">Save 儲存</button>
            <button type="button" className="btn ghost" onClick={() => run({ active: false })}>Remove</button>
            {msg && <span className="sub" role="status">{msg}</span>}
          </div>
        </form>
      )}
      {!edit && msg && <span className="sub" role="status">{msg}</span>}
    </li>
  )
}

// ================================================================= add an item
function AddItem({ category, subjects, h, onChanged, presets }: {
  category: Category; subjects: string[]; h: Household | null; onChanged: () => void; presets?: { title: string; title_zh: string; every: number | null }[]
}) {
  const [f, setF] = useState({ title: '', title_zh: '', subject: subjects[0] ?? 'house', every: '' as number | '', next_due: '', note: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return
    setMsg('Saving…')
    try {
      await addHomeItem({ category, subject: f.subject, title: f.title.trim(), title_zh: f.title_zh.trim(), every_months: f.every === '' ? null : Number(f.every), next_due: f.next_due || null, note: f.note, sort: 1000 })
      setF({ ...f, title: '', title_zh: '', next_due: '', note: '' })
      setMsg('Added 已加入')
      onChanged()
    } catch (err) { setMsg(`Could not save: ${(err as Error).message}`) }
  }
  return (
    <details className="add-item">
      <summary>Add an item 新增</summary>
      {presets && (
        <div className="presets">
          {presets.map((p) => (
            <button key={p.title} type="button" className="act" onClick={() => setF({ ...f, title: p.title, title_zh: p.title_zh, every: p.every ?? '' })}>{p.title}</button>
          ))}
        </div>
      )}
      <form className="hi-edit" onSubmit={submit}>
        <label className="wide">Title (English)<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="wide">Title (中文)<input className="tc-text" value={f.title_zh} onChange={(e) => setF({ ...f, title_zh: e.target.value })} /></label>
        <label>For<select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>
          {subjects.map((s) => <option key={s} value={s}>{subjectName(h, s)}</option>)}
        </select></label>
        <label>{category === 'document' ? 'Expiry date' : 'Next due'}<input type="date" value={f.next_due} onChange={(e) => setF({ ...f, next_due: e.target.value })} /></label>
        <label>Every (months, blank = one-off)<input type="number" min={0.5} step={0.5} value={f.every} onChange={(e) => setF({ ...f, every: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
        <label className="wide">Note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <div className="form-row"><button type="submit" className="btn">Add 加入</button>{msg && <span className="sub" role="status">{msg}</span>}</div>
      </form>
    </details>
  )
}

// ================================================================= sections
function ItemList({ items, today, h, lang, onChanged, group }: { items: HomeItem[]; today: string; h: Household | null; lang: Lang; onChanged: () => void; group?: boolean }) {
  const order = { overdue: 0, week: 1, month: 2, nodate: 3, later: 4, done: 5 }
  const sorted = [...items].sort((a, b) => {
    const sa = dueState(a, today), sb = dueState(b, today)
    return order[sa.state] - order[sb.state] || (sa.days ?? 9999) - (sb.days ?? 9999) || a.sort - b.sort
  })
  if (!items.length) return <p className="empty">Nothing here yet.</p>
  if (!group) return <ul className="hitems">{sorted.map((i) => <ItemRow key={i.id} item={i} today={today} h={h} lang={lang} onChanged={onChanged} />)}</ul>
  const subjects = [...new Set(sorted.map((i) => i.subject))]
  return (
    <div className="detail-grid">
      {subjects.map((s) => (
        <section key={s} className="sub-panel">
          <h3>{subjectName(h, s)}</h3>
          <ul className="hitems">{sorted.filter((i) => i.subject === s).map((i) => <ItemRow key={i.id} item={i} today={today} h={h} lang={lang} onChanged={onChanged} />)}</ul>
        </section>
      ))}
    </div>
  )
}

const DOC_PRESETS = [
  { title: 'Canadian passport', title_zh: '加拿大護照', every: null },
  { title: 'BC driver licence', title_zh: '卑詩省駕駛執照', every: null },
  { title: 'BC Services Card', title_zh: '卑詩服務卡', every: null },
  { title: 'Hong Kong identity card', title_zh: '香港身份證', every: null },
  { title: 'HKSAR passport', title_zh: '特區護照', every: null },
  { title: 'NEXUS card', title_zh: 'NEXUS 卡', every: null },
]

// ================================================================= page
export function HomePage({ h, items, alerts, alertsError, onReload, lang }: {
  h: Household | null; items: HomeItem[]; alerts: AlertLine[] | null; alertsError: string | null; onReload: () => void; lang: Lang
}) {
  const today = vanDate()
  const [tab, setTab] = useState<Category | 'household'>('maintenance')
  const people = (h?.people ?? []).map((p) => p.key)
  const cars = (h?.cars ?? []).map((c) => c.key)

  const due = useMemo(() => items.filter((i) => { const s = dueState(i, today).state; return s === 'overdue' || s === 'week' || s === 'month' }), [items, today])
  const noDate = items.filter((i) => dueState(i, today).state === 'nodate').length
  const emergency = items.filter((i) => i.category === 'emergency')
  const ready = emergency.filter((i) => isReady(i, today)).length
  const of = (c: Category) => items.filter((i) => i.category === c)

  return (
    <main className="detail home">
      <div className="journey">
        <div>
          <span className="big home-title">Home <span className="tc">家</span></span>
          <p className="sub">{h?.home.address ?? 'Richmond, BC'}{h?.home.year_built ? ` · built ${h.home.year_built}` : ''} · {h?.people.length ?? 5} people · {h?.cars.length ?? 2} cars</p>
        </div>
        <div className="stats">
          <div className="stat"><b className={due.some((i) => dueState(i, today).state === 'overdue') ? 'crit' : ''}>{due.length}</b><span>Due in 30 days</span></div>
          <div className="stat"><b>{noDate}</b><span>Need a date</span></div>
          <div className="stat"><b className={ready < emergency.length ? 'warn' : ''}>{ready}/{emergency.length}</b><span>Emergency ready</span></div>
        </div>
      </div>

      <div className="detail-grid">
        <section className="sub-panel">
          <h3>Alerts near home 附近警報 <span className="sub inline">weather, earthquakes, power, tsunami</span></h3>
          {alertsError ? <p className="problem">Could not load alerts: {alertsError}</p> : alerts === null ? <p className="empty">Loading…</p> : alerts.length === 0 ? (
            <p className="all-clear">All clear. No weather warnings, nearby earthquakes, power outages or tsunami threats. <span className="tc">一切正常</span></p>
          ) : (
            <ul className="rows">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Sev s={a.severity} />
                  <span className="x">{a.url ? <a href={a.url} target="_blank" rel="noreferrer">{lang === 'zh' ? a.title_zh : a.title}</a> : (lang === 'zh' ? a.title_zh : a.title)}
                    <span className="sub">{lang === 'zh' ? a.title : ''}{a.detail ? ` ${a.detail}` : ''} · {a.source}</span></span>
                </li>
              ))}
            </ul>
          )}
          <p className="sub links">
            <a href="https://weather.gc.ca/en/location/index.html?coords=49.135,-123.168" target="_blank" rel="noreferrer">Environment Canada</a> ·{' '}
            <a href="https://www.richmond.ca/emergency" target="_blank" rel="noreferrer">Richmond emergency</a> ·{' '}
            <a href="https://www2.gov.bc.ca/gov/content/environment/air-land-water/water/drought-flooding-dikes-dams/river-forecast-centre" target="_blank" rel="noreferrer">River Forecast Centre (Fraser River)</a> ·{' '}
            <a href="https://www.bchydro.com/power-outages/app/outage-map.html" target="_blank" rel="noreferrer">BC Hydro outages</a>
          </p>
        </section>

        <section className="sub-panel">
          <h3>Due in the next 30 days 三十日內</h3>
          {due.length ? <ItemList items={due} today={today} h={h} lang={lang} onChanged={onReload} /> : <p className="empty">Nothing due in the next 30 days.</p>}
        </section>

        <div className="span-2">
          <nav className="home-tabs" aria-label="Home sections">
            {TABS.map((t) => {
              const n = t.key === 'household' ? null : of(t.key).filter((i) => { const s = dueState(i, today).state; return s === 'overdue' || s === 'week' }).length
              return (
                <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                  {t.label} <span className="tc">{t.zh}</span>{n ? <span className="badge">{n}</span> : null}
                </button>
              )
            })}
          </nav>
        </div>

        <section className="sub-panel span-2">
          {tab === 'maintenance' && <>
            <p className="sub">Your house was built in {h?.home.year_built ?? 1979} and has a finished basement, so water, earthquake and electrical checks are included.</p>
            <ItemList items={of('maintenance')} today={today} h={h} lang={lang} onChanged={onReload} />
            <AddItem category="maintenance" subjects={['house']} h={h} onChanged={onReload} />
          </>}
          {tab === 'emergency' && <>
            <div className="ready-bar" aria-label={`${ready} of ${emergency.length} ready`}><span style={{ width: `${emergency.length ? (ready / emergency.length) * 100 : 0}%` }} /></div>
            <p className="sub">{ready} of {emergency.length} ready. An item counts as ready once you mark it done, until it is due to be checked again. Food, water and supplies are in the Stockpile Tracker.</p>
            <ItemList items={emergency} today={today} h={h} lang={lang} onChanged={onReload} />
            <AddItem category="emergency" subjects={['house', ...people]} h={h} onChanged={onReload} />
          </>}
          {tab === 'health' && <>
            <p className="sub">Click Edit to enter the last visit; the next one is worked out for you. Flu shots are free in BC for everyone.</p>
            <ItemList items={of('health')} today={today} h={h} lang={lang} onChanged={onReload} group />
            <AddItem category="health" subjects={people} h={h} onChanged={onReload} />
          </>}
          {tab === 'car' && <>
            <p className="sub">Both cars are on all-season tyres; check the M+S mark and tread before trips outside the Lower Mainland between October and March.</p>
            <ItemList items={of('car')} today={today} h={h} lang={lang} onChanged={onReload} group />
            <AddItem category="car" subjects={cars} h={h} onChanged={onReload} />
          </>}
          {tab === 'bill' && <>
            <h3>Regular bills 定期賬單</h3>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Bill</th><th>Type</th><th>Auto-pay</th><th>Note</th></tr></thead>
              <tbody>{(h?.bills ?? []).map((b) => (
                <tr key={b.key}><td>{b.name}</td><td>{b.category}</td><td>{b.autopay ? <span className="pill in">Auto-pay</span> : b.autopay === false ? <span className="pill out">Manual</span> : '-'}</td><td className="sub">{b.details_source ?? b.note ?? ''}</td></tr>
              ))}</tbody>
            </table></div>
            <h3>Dates to remember 重要日子</h3>
            <ItemList items={of('bill')} today={today} h={h} lang={lang} onChanged={onReload} />
            <AddItem category="bill" subjects={['house']} h={h} onChanged={onReload} />
          </>}
          {tab === 'document' && <>
            <p className="sub">Add each passport, licence and card with its expiry date. Reminders start 6 months before a passport expires, since many countries need 6 months left.</p>
            <ItemList items={of('document')} today={today} h={h} lang={lang} onChanged={onReload} group />
            <AddItem category="document" subjects={people} h={h} onChanged={onReload} presets={DOC_PRESETS} />
          </>}
          {tab === 'household' && h && <>
            <div className="detail-grid">
              <div>
                <h3>People 家人</h3>
                <ul className="kv">{h.people.map((p) => <li key={p.key}><span>{p.name} <span className="tc">{p.relation_zh}</span></span><b>{ageOn(p.born, today)}</b></li>)}</ul>
                <h3>Cars 汽車</h3>
                <ul className="kv">{h.cars.map((c) => <li key={c.key}><span>{c.name}</span><b className="sub inline">{c.fuel} · {c.tyres}</b></li>)}</ul>
              </div>
              <div>
                <h3>House 房屋</h3>
                <ul className="kv">
                  <li><span>Type</span><b>{h.home.type}</b></li>
                  <li><span>Built</span><b>{h.home.year_built}{h.home.year_built ? ` (${Number(today.slice(0, 4)) - h.home.year_built} years)` : ''}</b></li>
                  <li><span>Bedrooms / bathrooms</span><b>{h.home.bedrooms} / {h.home.bathrooms}</b></li>
                  <li><span>Main floor / finished basement</span><b>{h.home.first_floor_sqft} / {h.home.basement_finished_sqft} sq ft</b></li>
                  <li><span>Lot</span><b>{h.home.land_sqft} sq ft</b></li>
                  {h.home.assessment && <li><span>{h.home.assessment.year} assessment</span><b>${h.home.assessment.total.toLocaleString('en-CA')}{h.home.assessment.previous_total ? ` (${(((h.home.assessment.total - h.home.assessment.previous_total) / h.home.assessment.previous_total) * 100).toFixed(1)}%)` : ''}</b></li>}
                </ul>
                {h.home.notes && <ul className="plain sub">{h.home.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              </div>
            </div>
            <p className="sub">This profile is private to you. To change it, ask Claude in a session.</p>
          </>}
        </section>
      </div>
    </main>
  )
}
