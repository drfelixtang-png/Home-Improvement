import { useState } from 'react'
import { useStore } from '../lib/store'
import { itemName, word } from '../lib/i18n'
import { formatDate, formatQty } from '../lib/dates'
import { locationRank, shoppingLines } from '../lib/status'
import type { ShoppingLine } from '../lib/status'
import { Modal } from '../components/Modal'
import { AddBatchForm } from '../components/BatchList'

const TICKS_KEY = 'stockpile.ticks'
const GROUP_KEY = 'stockpile.shoppingGroup'

// Ticks are a per-device shopping aid; the real record is the batch the "bought" flow adds.
function readTicks(): Record<string, number> {
  try {
    const all: Record<string, number> = JSON.parse(localStorage.getItem(TICKS_KEY) ?? '{}')
    // Forget ticks older than 30 days so the next trip starts clean.
    const cutoff = Date.now() - 30 * 86400000
    return Object.fromEntries(Object.entries(all).filter(([, at]) => at > cutoff))
  } catch {
    return {}
  }
}
function writeTicks(t: Record<string, number>) {
  try {
    localStorage.setItem(TICKS_KEY, JSON.stringify(t))
  } catch {
    /* storage may be blocked */
  }
}
function readGroup(): 'location' | 'category' {
  try {
    return localStorage.getItem(GROUP_KEY) === 'category' ? 'category' : 'location'
  } catch {
    return 'location'
  }
}

export function Shopping() {
  const { t, lang, summaries, summaryById, settings } = useStore()
  const [ticks, setTicks] = useState(readTicks)
  const [group, setGroupState] = useState(readGroup)
  const [buying, setBuying] = useState<ShoppingLine | null>(null)
  const [copied, setCopied] = useState(false)

  const setGroup = (g: 'location' | 'category') => {
    setGroupState(g)
    try {
      localStorage.setItem(GROUP_KEY, g)
    } catch {
      /* storage may be blocked */
    }
  }

  const computed = shoppingLines(summaries, settings)
  // Keep ticked items on the list (struck through) even after buying fills the shortfall.
  const ids = new Set(computed.map((l) => l.summary.item.id))
  const tickedExtra: ShoppingLine[] = Object.keys(ticks)
    .filter((id) => !ids.has(id) && summaryById.has(id))
    .map((id) => ({ summary: summaryById.get(id)!, buy: 0, short: 0, expiringQty: 0, expiringDate: null }))
  const lines = [...computed, ...tickedExtra]

  const keyOf = (l: ShoppingLine) => (group === 'location' ? l.summary.item.location : l.summary.item.category || '–')
  const groups = new Map<string, ShoppingLine[]>()
  for (const l of lines.sort((a, b) =>
    group === 'location'
      ? locationRank(a.summary.item.location) - locationRank(b.summary.item.location) || a.summary.item.sort_order - b.summary.item.sort_order
      : keyOf(a).localeCompare(keyOf(b)) || a.summary.item.sort_order - b.summary.item.sort_order,
  )) {
    const k = keyOf(l)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(l)
  }

  const setTick = (id: string, on: boolean) => {
    const next = { ...ticks }
    if (on) next[id] = Date.now()
    else delete next[id]
    setTicks(next)
    writeTicks(next)
  }

  const reasons = (l: ShoppingLine) => {
    const unit = word(lang, l.summary.item.unit)
    const r: string[] = []
    if (l.short > 0) r.push(t('reasonShort', { n: `${formatQty(l.short)} ${unit}` }))
    if (l.expiringQty > 0)
      r.push(t('reasonExpiring', { n: `${formatQty(l.expiringQty)} ${unit}`, date: formatDate(l.expiringDate, lang) }))
    return r.join(' · ')
  }

  const asText = () => {
    const out: string[] = [t('shoppingTitle')]
    for (const [k, ls] of groups) {
      out.push('', word(lang, k))
      for (const l of ls) {
        const box = ticks[l.summary.item.id] ? '[x]' : '[ ]'
        const qty = l.buy > 0 ? ` ${t('toBuy', { n: `${formatQty(l.buy)} ${word(lang, l.summary.item.unit)}` })}` : ''
        const why = reasons(l)
        out.push(`${box} ${itemName(lang, l.summary.item)}${qty}${why ? ` (${why})` : ''}`)
      }
    }
    return out.join('\n')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t('copyText'), asText())
    }
  }

  return (
    <section>
      <div className="row space-between">
        <h1>{t('shoppingTitle')}</h1>
        <div className="row no-print">
          <button onClick={copy}>{copied ? t('copied') : t('copyText')}</button>
          <button onClick={() => window.print()}>{t('print')}</button>
        </div>
      </div>

      <div className="row space-between no-print">
        <label className="inline">
          <span>{t('groupBy')}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as 'location' | 'category')}>
            <option value="location">{t('location')}</option>
            <option value="category">{t('category')}</option>
          </select>
        </label>
        {Object.keys(ticks).length > 0 && (
          <button
            onClick={() => {
              setTicks({})
              writeTicks({})
            }}
          >
            {t('clearTicks')}
          </button>
        )}
      </div>

      {lines.length === 0 && <p className="card">{t('nothingToBuy')}</p>}

      {[...groups].map(([k, ls]) => (
        <div key={k}>
          <h2 className="loc-heading">{word(lang, k)}</h2>
          <ul className="shop-list">
            {ls.map((l) => {
              const id = l.summary.item.id
              const ticked = !!ticks[id]
              return (
                <li key={id} className={ticked ? 'ticked' : ''}>
                  <label className="shop-item">
                    <input
                      type="checkbox"
                      checked={ticked}
                      onChange={(e) => {
                        if (e.target.checked) setBuying(l)
                        else setTick(id, false)
                      }}
                    />
                    <span className="shop-text">
                      <strong>{itemName(lang, l.summary.item)}</strong>
                      {l.buy > 0 && (
                        <span className="shop-qty">
                          {' '}
                          {t('toBuy', { n: `${formatQty(l.buy)} ${word(lang, l.summary.item.unit)}` })}
                        </span>
                      )}
                      <small className="muted">{reasons(l)}</small>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {buying && (
        <Modal title={t('boughtTitle', { name: itemName(lang, buying.summary.item) })} onClose={() => setBuying(null)}>
          <p className="muted">{t('boughtHint')}</p>
          <AddBatchForm
            item={buying.summary.item}
            defaultQty={buying.buy > 0 ? buying.buy : undefined}
            onDone={() => {
              setTick(buying.summary.item.id, true)
              setBuying(null)
            }}
          />
          <div className="row">
            <button
              onClick={() => {
                setTick(buying.summary.item.id, true)
                setBuying(null)
              }}
            >
              {t('skipBatch')}
            </button>
            <button onClick={() => setBuying(null)}>{t('cancel')}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
