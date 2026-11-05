import { useMemo } from 'react'
import type { BoardSettings } from './data'
import type { Checkin, Review } from './me'
import { addDays, avg, habitStatus, hoursByArea, vanDate, weekStart } from './me'
import { shortDate } from './format'

type Lang = 'zh' | 'en'
const fmt = (n: number | null, d = 1) => (n === null ? '-' : n.toFixed(d))

// ================================================================= 30-day trend chart
function Trend({ checkins, today }: { checkins: Checkin[]; today: string }) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
  const by = new Map(checkins.map((c) => [c.day, c]))
  const W = 900, H = 200, padL = 30, padR = 30, padT = 12, padB = 24
  const x = (i: number) => padL + (i / 29) * (W - padL - padR)
  const y5 = (v: number) => padT + (1 - (v - 1) / 4) * (H - padT - padB)
  const ySleep = (h: number) => H - padB - (Math.min(h, 10) / 10) * (H - padT - padB)
  const series = (f: (c: Checkin) => number | null) => days.map((d, i) => {
    const c = by.get(d)
    const v = c ? f(c) : null
    return v === null ? null : [x(i), y5(v)] as const
  })
  const path = (pts: (readonly [number, number] | null)[]) => {
    let s = ''
    let pen = false
    for (const p of pts) {
      if (!p) { pen = false; continue }
      s += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)} `
      pen = true
    }
    return s
  }
  const energy = series((c) => avg([c.energy_am, c.energy_pm]))
  const mood = series((c) => avg([c.mood_am, c.mood_pm]))
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Energy, mood and sleep for the last 30 days">
        {[1, 3, 5].map((v) => (
          <g key={v}><line x1={padL} x2={W - padR} y1={y5(v)} y2={y5(v)} className="grid-line" /><text x={padL - 8} y={y5(v) + 4} className="axis" textAnchor="end">{v}</text></g>
        ))}
        {[0, 5, 10].map((h) => <text key={h} x={W - padR + 6} y={ySleep(h) + 4} className="axis">{h}h</text>)}
        {days.map((d, i) => {
          const h = by.get(d)?.sleep_hours
          return typeof h === 'number' && h > 0 ? <rect key={d} x={x(i) - 7} width="14" y={ySleep(h)} height={H - padB - ySleep(h)} className="sleep-bar" /> : null
        })}
        <path d={path(energy)} className="line-energy" />
        <path d={path(mood)} className="line-mood" />
        {energy.map((p, i) => p ? <circle key={`e${i}`} cx={p[0]} cy={p[1]} r="3" className="dot-energy" /> : null)}
        {mood.map((p, i) => p ? <circle key={`m${i}`} cx={p[0]} cy={p[1]} r="3" className="dot-mood" /> : null)}
        {days.map((d, i) => (i % 5 === 4 || i === 29 ? <text key={d} x={x(i)} y={H - 6} className="axis" textAnchor="middle">{shortDate(d)}</text> : null))}
      </svg>
      <p className="sub legend"><span className="key energy" /> Energy 精神 (1 to 5) <span className="key mood" /> Mood 心情 (1 to 5) <span className="key sleep" /> Sleep 睡眠 (hours, right scale)</p>
    </div>
  )
}

// ================================================================= page
export function ReviewPage({ settings, checkins, reviews, lang }: { settings: BoardSettings; checkins: Checkin[]; reviews: Review[]; lang: Lang }) {
  const today = vanDate()
  const ws = weekStart(today)
  const lastWs = addDays(ws, -7)
  const byDay = useMemo(() => new Map(checkins.map((c) => [c.day, c])), [checkins])

  const weekStats = (from: string) => {
    const to = addDays(from, 6)
    const cs = checkins.filter((c) => c.day >= from && c.day <= to)
    return {
      mornings: cs.filter((c) => c.morning_at).length,
      evenings: cs.filter((c) => c.evening_at).length,
      sleep: avg(cs.map((c) => c.sleep_hours)),
      energy: avg(cs.flatMap((c) => [c.energy_am, c.energy_pm])),
      mood: avg(cs.flatMap((c) => [c.mood_am, c.mood_pm])),
      priorities: (() => {
        const all = cs.flatMap((c) => c.priorities.map((p, i) => (p.trim() ? !!c.priorities_done[i] : null)).filter((x) => x !== null))
        return all.length ? `${all.filter(Boolean).length}/${all.length}` : '-'
      })(),
    }
  }
  const tw = weekStats(ws)
  const lw = weekStats(lastWs)
  const hours = hoursByArea(settings.areas ?? [], checkins, ws, addDays(ws, 6))
  const recent = [...checkins].filter((c) => c.day >= addDays(today, -13)).reverse()
  const latest = reviews[0]

  const pick = (en?: string[], zh?: string[]) => (lang === 'zh' ? zh ?? en ?? [] : en ?? zh ?? [])

  return (
    <main className="detail review">
      <div className="detail-grid">
        <section className="sub-panel span-2">
          <h3>Weekly review by Claude 每週回顧</h3>
          {latest ? (
            <>
              <p className="sub">Week of {shortDate(latest.week_start)} · written {shortDate(latest.created_at.slice(0, 10))}</p>
              {(latest.data.focus || latest.data.focus_zh) && <p className="focus"><span className="lbl">{lang === 'zh' ? '下週重點' : 'Focus for next week'}</span>{lang === 'zh' ? latest.data.focus_zh ?? latest.data.focus : latest.data.focus ?? latest.data.focus_zh}</p>}
              <ul className={`points ${lang === 'zh' ? 'tc-text' : ''}`}>{pick(latest.data.points, latest.data.points_zh).map((p, i) => <li key={i}>{p}</li>)}</ul>
              <div className="detail-grid">
                <div><h4>{lang === 'zh' ? '做得好' : 'Went well'}</h4><ul className={`plain ${lang === 'zh' ? 'tc-text' : ''}`}>{pick(latest.data.went_well, latest.data.went_well_zh).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                <div><h4>{lang === 'zh' ? '有待改善' : 'Slipped'}</h4><ul className={`plain ${lang === 'zh' ? 'tc-text' : ''}`}>{pick(latest.data.slipped, latest.data.slipped_zh).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
              </div>
              <h4>{lang === 'zh' ? '下週三個建議' : 'Three suggestions for next week'}</h4>
              <ol className={`plain ${lang === 'zh' ? 'tc-text' : ''}`}>{pick(latest.data.suggestions, latest.data.suggestions_zh).map((p, i) => <li key={i}>{p}</li>)}</ol>
            </>
          ) : (
            <p className="empty">The first weekly review will be written on Sunday evening, once there are a few days of check-ins. 第一份每週回顧會在星期日晚寫好。</p>
          )}
        </section>

        <section className="sub-panel">
          <h3>This week 本週 <span className="sub inline">vs last week 上週</span></h3>
          <ul className="kv">
            <li><span>Morning check-ins 早上記錄</span><b>{tw.mornings}/7 <span className="sub inline">({lw.mornings})</span></b></li>
            <li><span>Evening check-ins 晚上記錄</span><b>{tw.evenings}/7 <span className="sub inline">({lw.evenings})</span></b></li>
            <li><span>Average sleep 平均睡眠</span><b>{fmt(tw.sleep)} h <span className="sub inline">({fmt(lw.sleep)})</span></b></li>
            <li><span>Average energy 平均精神</span><b>{fmt(tw.energy)} <span className="sub inline">({fmt(lw.energy)})</span></b></li>
            <li><span>Average mood 平均心情</span><b>{fmt(tw.mood)} <span className="sub inline">({fmt(lw.mood)})</span></b></li>
            <li><span>Priorities done 要事完成</span><b>{tw.priorities} <span className="sub inline">({lw.priorities})</span></b></li>
          </ul>
        </section>

        <section className="sub-panel">
          <h3>Habits and time this week 本週習慣及時間</h3>
          <ul className="kv">
            {(settings.habits ?? []).map((h) => {
              const s = habitStatus(h, byDay, today)
              return <li key={h.key}><span>{h.label} <span className="tc">{h.label_zh}</span></span><b>{s.thisWeek}/{h.per_week >= 7 ? 7 : h.per_week}</b></li>
            })}
            {hours.map((h) => <li key={h.area.key}><span>{h.area.label} <span className="tc">{h.area.label_zh}</span></span><b>{h.hours}/{h.area.target} h</b></li>)}
          </ul>
        </section>

        <section className="sub-panel span-2">
          <h3>Last 30 days 過去三十日</h3>
          {checkins.length ? <Trend checkins={checkins} today={today} /> : <p className="empty">Trends appear after your first check-ins.</p>}
        </section>

        <section className="sub-panel span-2">
          <h3>Your log, last 14 days 最近十四日記錄</h3>
          {recent.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Day</th><th className="n">Sleep</th><th className="n">Energy</th><th className="n">Mood</th><th>Win 小勝利</th><th>0.1% better 明日進步</th></tr></thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.day}>
                    <td>{shortDate(c.day)}</td>
                    <td className="n">{c.sleep_hours ?? '-'}</td>
                    <td className="n">{c.energy_am ?? '-'} / {c.energy_pm ?? '-'}</td>
                    <td className="n">{c.mood_am ?? '-'} / {c.mood_pm ?? '-'}</td>
                    <td>{c.win || '-'}{c.slipped && <span className="sub">Slipped: {c.slipped}</span>}</td>
                    <td>{c.better_tomorrow || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className="empty">Nothing logged yet. Start with the morning check-in on the Me page.</p>}
        </section>

        {reviews.length > 1 && (
          <section className="sub-panel span-2">
            <h3>Earlier reviews 以往回顧</h3>
            {reviews.slice(1).map((r) => (
              <details key={r.week_start}>
                <summary>Week of {shortDate(r.week_start)}</summary>
                <ul className={`points ${lang === 'zh' ? 'tc-text' : ''}`}>{pick(r.data.points, r.data.points_zh).map((p, i) => <li key={i}>{p}</li>)}</ul>
              </details>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
