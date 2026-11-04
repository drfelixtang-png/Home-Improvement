import { useState } from 'react'
import type { FormEvent } from 'react'
import { useStore } from '../lib/store'
import type { Item, ProductLink } from '../lib/types'
import { addLink, addPrice, deleteLink, deletePrice, updateLink } from '../lib/data'
import { formatDate, formatQty, todayISO } from '../lib/dates'
import { word } from '../lib/i18n'
import { isGoodPrice, money, priceStats, unitPrice } from '../lib/status'
import { StoreSelect } from './BatchList'

function num(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function PriceSection({ item }: { item: Item }) {
  const { t, lang, prices, run } = useStore()
  const records = prices.filter((p) => p.item_id === item.id)
  const stats = priceStats(records)
  const unit = word(lang, item.unit)
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState(formatQty(Number(item.step_qty) || 1))
  const [store, setStore] = useState('')
  const [date, setDate] = useState(todayISO())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const p = num(price)
    const q = num(qty)
    if (p === null || !q) return
    if (await run(() => addPrice({ item_id: item.id, price: p, qty: q, store: store.trim(), bought_on: date || todayISO() }))) {
      setPrice('')
      setOpen(false)
    }
  }

  const per = (n: number | null) => (n === null ? '–' : t('perUnit', { price: money(n), unit }))

  return (
    <section>
      <h2>{t('prices')}</h2>
      {records.length === 0 ? (
        <p className="muted">{t('noPrices')}</p>
      ) : (
        <>
          <dl className="price-stats">
            <div>
              <dt>{t('lastPrice')}</dt>
              <dd>{per(stats.lastUnit)}</dd>
            </div>
            <div>
              <dt>{t('lowestPrice')}</dt>
              <dd>
                {per(stats.lowestUnit)}
                {stats.lowestStore && <small className="muted"> {stats.lowestStore}</small>}
              </dd>
            </div>
            <div>
              <dt>{t('usualPrice')}</dt>
              <dd>{per(stats.usualUnit)}</dd>
            </div>
          </dl>
          <ul className="record-list">
            {records.map((r, i) => {
              const good = isGoodPrice(unitPrice(r), records.slice(i + 1))
              return (
                <li key={r.id}>
                  <div>
                    <strong>{money(Number(r.price))}</strong> · {formatQty(Number(r.qty))} {unit} · {per(unitPrice(r))}{' '}
                    {good && <span className="tag-good">{t('goodPrice')}</span>}
                    <small className="muted">
                      {formatDate(r.bought_on, lang)}
                      {r.store ? ` · ${r.store}` : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </small>
                  </div>
                  <button
                    className="x-btn"
                    aria-label={t('delete')}
                    title={t('delete')}
                    onClick={() => confirm(t('deletePriceConfirm')) && run(() => deletePrice(r.id))}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {open ? (
        <form className="inline-form" onSubmit={submit}>
          <label>
            <span>{t('totalPaid')}</span>
            <input autoFocus type="number" inputMode="decimal" min="0" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label>
            <span>{t('forQty', { unit })}</span>
            <input type="number" inputMode="decimal" min="0" step="any" required value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <StoreSelect value={store} onChange={setStore} />
          <label>
            <span>{t('date')}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="row full">
            <button type="submit" className="primary">
              {t('save')}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <p>
          <button onClick={() => setOpen(true)}>+ {t('addPrice')}</button>
        </p>
      )}
    </section>
  )
}

const emptyLink = { store: '', product_name: '', size: '', pack_qty: '', price: '', url: '', notes: '' }

function LinkForm({ item, link, onDone }: { item: Item; link?: ProductLink; onDone: () => void }) {
  const { t, lang, run } = useStore()
  const [f, setF] = useState(
    link
      ? {
          store: link.store,
          product_name: link.product_name,
          size: link.size ?? '',
          pack_qty: link.pack_qty ? String(link.pack_qty) : '',
          price: link.price !== null ? String(link.price) : '',
          url: link.url ?? '',
          notes: link.notes ?? '',
        }
      : emptyLink,
  )
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const data = {
      item_id: item.id,
      store: f.store.trim(),
      product_name: f.product_name.trim(),
      size: f.size.trim() || null,
      pack_qty: num(f.pack_qty) || null,
      price: num(f.price),
      url: f.url.trim() || null,
      notes: f.notes.trim() || null,
      checked_on: num(f.price) !== null ? todayISO() : null,
    }
    if (!data.product_name) return
    const ok = await run(() => (link ? updateLink(link.id, data) : addLink(data)))
    if (ok) onDone()
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <StoreSelect value={f.store} onChange={(v) => setF({ ...f, store: v })} />
      <label>
        <span>{t('productName')}</span>
        <input required value={f.product_name} onChange={set('product_name')} />
      </label>
      <label>
        <span>{t('size')}</span>
        <input value={f.size} onChange={set('size')} />
      </label>
      <label>
        <span>{t('packQty', { unit: word(lang, item.unit) })}</span>
        <input type="number" inputMode="decimal" min="0" step="any" value={f.pack_qty} onChange={set('pack_qty')} />
      </label>
      <label>
        <span>{t('totalPaid')}</span>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={f.price} onChange={set('price')} />
      </label>
      <label className="full">
        <span>{t('link')}</span>
        <input type="url" value={f.url} onChange={set('url')} placeholder="https://" />
      </label>
      <label className="full">
        <span>{t('notes')}</span>
        <input value={f.notes} onChange={set('notes')} />
      </label>
      <div className="row full">
        <button type="submit" className="primary">
          {t('save')}
        </button>
        <button type="button" onClick={onDone}>
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}

export function WhereToBuy({ item }: { item: Item }) {
  const { t, lang, links, run } = useStore()
  const list = links.filter((l) => l.item_id === item.id)
  const [editing, setEditing] = useState<string | null>(null)
  const unit = word(lang, item.unit)

  return (
    <section>
      <h2>{t('whereToBuy')}</h2>
      {list.length === 0 && editing !== 'new' && <p className="muted">{t('noLinks')}</p>}
      <ul className="record-list">
        {list.map((l) =>
          editing === l.id ? (
            <li key={l.id} className="editing">
              <LinkForm item={item} link={l} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={l.id}>
              <div>
                <span className="link-store">{l.store || '–'}</span>
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.product_name}
                  </a>
                ) : (
                  l.product_name
                )}
                <small className="muted">
                  {[
                    l.size,
                    l.price !== null ? money(Number(l.price)) : null,
                    l.price !== null && l.pack_qty ? t('perUnit', { price: money(Number(l.price) / Number(l.pack_qty)), unit }) : null,
                    l.checked_on ? t('checkedOn', { date: formatDate(l.checked_on, lang) }) : null,
                    l.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <span className="row">
                <button onClick={() => setEditing(l.id)}>{t('edit')}</button>
                <button
                  className="x-btn"
                  aria-label={t('delete')}
                  title={t('delete')}
                  onClick={() => confirm(t('deleteLinkConfirm')) && run(() => deleteLink(l.id))}
                >
                  ×
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <LinkForm item={item} onDone={() => setEditing(null)} />
      ) : (
        <p>
          <button onClick={() => setEditing('new')}>+ {t('addProduct')}</button>
        </p>
      )}
    </section>
  )
}
