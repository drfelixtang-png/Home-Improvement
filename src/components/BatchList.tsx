import { useState } from 'react'
import type { FormEvent } from 'react'
import { useStore } from '../lib/store'
import type { Batch, Item } from '../lib/types'
import { STORES } from '../lib/types'
import { addBatch, addPrice, deleteBatch, updateBatch } from '../lib/data'
import { formatQty, todayISO } from '../lib/dates'
import { word } from '../lib/i18n'
import { round } from '../lib/status'
import { Expiry } from './Expiry'
import { Modal } from './Modal'

function toNumber(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function BatchRow({ batch, unit, showUsed }: { batch: Batch; unit: string; showUsed: boolean }) {
  const { t, lang, run } = useStore()
  const [qty, setQty] = useState(formatQty(Number(batch.qty)))
  const [expiry, setExpiry] = useState(batch.expiry_date ?? '')
  const [purchased, setPurchased] = useState(batch.purchased_on ?? '')
  const [used, setUsed] = useState<string | null>(null)
  const [seen, setSeen] = useState(batch.updated_at)

  // Refresh the inputs when the batch is changed elsewhere (another device or "Used some").
  if (seen !== batch.updated_at) {
    setSeen(batch.updated_at)
    setQty(formatQty(Number(batch.qty)))
    setExpiry(batch.expiry_date ?? '')
    setPurchased(batch.purchased_on ?? '')
  }

  const saveQty = () => {
    const n = toNumber(qty)
    if (n === null) return setQty(formatQty(Number(batch.qty)))
    if (n !== Number(batch.qty)) run(() => updateBatch(batch.id, { qty: n }))
  }
  const saveDate = (field: 'expiry_date' | 'purchased_on', value: string) => {
    const v = value || null
    if (v !== batch[field]) run(() => updateBatch(batch.id, { [field]: v }))
  }
  const remove = () => {
    if (confirm(t('deleteBatchConfirm'))) run(() => deleteBatch(batch.id))
  }
  const submitUsed = (e: FormEvent) => {
    e.preventDefault()
    const n = toNumber(used ?? '')
    if (n === null) return
    const left = round(Math.max(0, Number(batch.qty) - n))
    setUsed(null)
    run(() => updateBatch(batch.id, { qty: left }))
  }

  return (
    <div className={`batch ${Number(batch.qty) <= 0 ? 'batch-empty' : ''}`}>
      <label>
        <span>
          {t('qty')} ({word(lang, unit)})
        </span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={saveQty}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <label>
        <span>{t('expiry')}</span>
        <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} onBlur={(e) => saveDate('expiry_date', e.target.value)} />
      </label>
      <label>
        <span>{t('purchased')}</span>
        <input
          type="date"
          value={purchased}
          onChange={(e) => setPurchased(e.target.value)}
          onBlur={(e) => saveDate('purchased_on', e.target.value)}
        />
      </label>
      <div className="batch-expiry">
        <Expiry date={batch.expiry_date} />
      </div>
      <div className="batch-actions">
        {showUsed && (
          <button type="button" onClick={() => setUsed('')}>
            {t('usedSome')}
          </button>
        )}
        <button type="button" className="danger" onClick={remove}>
          {t('delete')}
        </button>
      </div>
      {used !== null && (
        <Modal title={t('usedHowMuch')} onClose={() => setUsed(null)}>
          <form onSubmit={submitUsed} className="stack">
            <label>
              <span>
                {t('qty')} ({word(lang, unit)}), {t('onHand').toLowerCase()} {formatQty(Number(batch.qty))}
              </span>
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={used}
                onChange={(e) => setUsed(e.target.value)}
              />
            </label>
            <div className="row">
              <button type="submit" className="primary">
                {t('save')}
              </button>
              <button type="button" onClick={() => setUsed(null)}>
                {t('cancel')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export function StoreSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useStore()
  const known = (STORES as readonly string[]).includes(value) || value === ''
  return (
    <label>
      <span>{t('store')}</span>
      {known ? (
        <select value={value} onChange={(e) => onChange(e.target.value === '__other' ? ' ' : e.target.value)}>
          <option value="">–</option>
          {STORES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="__other">…</option>
        </select>
      ) : (
        <input autoFocus value={value.trimStart()} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

export function AddBatchForm({ item, onDone, defaultQty }: { item: Item; onDone?: () => void; defaultQty?: number }) {
  const { t, lang, run } = useStore()
  const [qty, setQty] = useState(defaultQty ? formatQty(defaultQty) : '')
  const [expiry, setExpiry] = useState('')
  const [purchased, setPurchased] = useState(todayISO())
  const [price, setPrice] = useState('')
  const [store, setStore] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = toNumber(qty)
    if (n === null) return
    const p = toNumber(price)
    const ok = await run(async () => {
      await addBatch({ item_id: item.id, qty: n, expiry_date: expiry || null, purchased_on: purchased || null })
      if (p !== null && n > 0)
        await addPrice({ item_id: item.id, store: store.trim(), price: p, qty: n, bought_on: purchased || todayISO() })
    })
    if (ok) {
      setQty('')
      setExpiry('')
      setPrice('')
      onDone?.()
    }
  }

  return (
    <form className="batch batch-new" onSubmit={submit}>
      <label>
        <span>
          {t('qty')} ({word(lang, item.unit)})
        </span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          required
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </label>
      <label>
        <span>
          {t('expiry')} <small className="muted">({t('optional')})</small>
        </span>
        <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </label>
      <label>
        <span>{t('purchased')}</span>
        <input type="date" value={purchased} onChange={(e) => setPurchased(e.target.value)} />
      </label>
      <label>
        <span>{t('pricePaid')}</span>
        <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="$" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <StoreSelect value={store} onChange={setStore} />
      <div className="batch-actions">
        <button type="submit" className="primary">
          {t('addBatch')}
        </button>
      </div>
    </form>
  )
}

export function BatchList({
  item,
  batches,
  showUsed = true,
  showAdd = true,
}: {
  item: Item
  batches: Batch[]
  showUsed?: boolean
  showAdd?: boolean
}) {
  const { t } = useStore()
  return (
    <div className="batches">
      {batches.length === 0 && <p className="muted">{t('noBatches')}</p>}
      {batches.map((b) => (
        <BatchRow key={b.id} batch={b} unit={item.unit} showUsed={showUsed} />
      ))}
      {showAdd && <AddBatchForm item={item} />}
    </div>
  )
}
