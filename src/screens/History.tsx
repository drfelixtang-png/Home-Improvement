import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { itemName, word } from '../lib/i18n'
import { formatDate, formatQty } from '../lib/dates'
import { loadLines } from '../lib/data'
import type { StocktakeLine } from '../lib/types'
import { Expiry } from '../components/Expiry'

export function History() {
  const { t, lang, stocktakes } = useStore()
  const done = stocktakes.filter((s) => s.status === 'done')
  const [stats, setStats] = useState<Record<string, { n: number; short: number }>>({})

  useEffect(() => {
    if (!done.length) return
    supabase
      .from('stocktake_lines')
      .select('stocktake_id,counted_qty,target_qty')
      .in(
        'stocktake_id',
        done.map((s) => s.id),
      )
      .then(({ data }) => {
        const out: Record<string, { n: number; short: number }> = {}
        for (const l of data ?? []) {
          const s = (out[l.stocktake_id] ??= { n: 0, short: 0 })
          s.n++
          if (Number(l.counted_qty) < Number(l.target_qty)) s.short++
        }
        setStats(out)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocktakes])

  return (
    <section>
      <h1>{t('historyTitle')}</h1>
      {done.length === 0 ? (
        <p className="muted">{t('noHistory')}</p>
      ) : (
        <ul className="plain-list">
          {done.map((s) => (
            <li key={s.id}>
              <a className="card history-row" href={`#/history/${s.id}`}>
                <strong>{formatDate(s.taken_on, lang)}</strong>
                {stats[s.id] && (
                  <span className="muted">
                    {t('itemsCounted', { n: stats[s.id].n })} · {t('itemsShort', { n: stats[s.id].short })}
                  </span>
                )}
                {s.notes && <small className="muted">{s.notes}</small>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function HistoryDetail({ id }: { id: string }) {
  const { t, lang, stocktakes, items } = useStore()
  const st = stocktakes.find((s) => s.id === id)
  const [lines, setLines] = useState<StocktakeLine[] | null>(null)
  useEffect(() => {
    loadLines(id).then(setLines)
  }, [id])
  const byId = new Map(items.map((i) => [i.id, i]))
  const sorted = (lines ?? [])
    .filter((l) => byId.has(l.item_id))
    .sort((a, b) => byId.get(a.item_id)!.sort_order - byId.get(b.item_id)!.sort_order)

  return (
    <section>
      <p>
        <a href="#/history">← {t('back')}</a>
      </p>
      <h1>{st ? t('stocktakeOn', { date: formatDate(st.taken_on, lang) }) : t('historyTitle')}</h1>
      {st?.notes && <p className="notes">{st.notes}</p>}
      {!lines ? (
        <p className="muted">{t('loading')}</p>
      ) : (
        <div className="items">
          <div className="items-head">
            <span>{t('colNumber')}</span>
            <span>{t('colName')}</span>
            <span>
              {t('counted')} / {t('target')}
            </span>
            <span>{t('colLocation')}</span>
            <span>{t('colExpiry')}</span>
          </div>
          {sorted.map((l, i) => {
            const it = byId.get(l.item_id)!
            const short = Number(l.counted_qty) < Number(l.target_qty)
            return (
              <div key={l.id} className={`item-row static status-${Number(l.counted_qty) <= 0 ? 'red' : short ? 'yellow' : 'green'}`}>
                <span className="item-no">{i + 1}</span>
                <span className="item-name">{itemName(lang, it)}</span>
                <span className="item-qty">
                  {formatQty(Number(l.counted_qty))} / {formatQty(Number(l.target_qty))} {word(lang, it.unit)}
                </span>
                <span className="item-loc">{word(lang, it.location)}</span>
                <span className="item-exp">{l.earliest_expiry ? <Expiry date={l.earliest_expiry} /> : <span className="muted">–</span>}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
