import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { importItemsCSV, importStarter, loadAllLines, updateSettings } from '../lib/data'
import { downloadCSV, toCSV } from '../lib/csv'
import { todayISO } from '../lib/dates'
import { summarise } from '../lib/status'

export function SettingsScreen() {
  const { t, lang, setLang, settings, session, items, batches, stocktakes, prices, run } = useStore()
  const [interval, setIntervalValue] = useState(String(settings.stocktake_interval_months))
  const [warn, setWarn] = useState(String(settings.expiry_warning_days))
  const [msg, setMsg] = useState<string | null>(null)
  const userId = session!.user.id

  const saveNumber = (field: 'stocktake_interval_months' | 'expiry_warning_days', value: string, min: number, max: number) => {
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n < min || n > max) {
      setIntervalValue(String(settings.stocktake_interval_months))
      setWarn(String(settings.expiry_warning_days))
      return
    }
    if (n !== settings[field]) run(() => updateSettings({ [field]: n }, userId)).then((ok) => ok && setMsg(t('saved')))
  }

  const stamp = todayISO()

  const exportItems = () => {
    const rows = items
      .slice()
      .sort((a, b) => Number(a.archived) - Number(b.archived) || a.sort_order - b.sort_order)
      .map((i) => {
        const s = summarise(i, batches, settings)
        return [i.sort_order, i.name_en, i.name_zh, i.target_qty, i.unit, i.location, i.category, i.notes ?? '', i.highlight_en ?? '', i.highlight_zh ?? '', i.step_qty, i.priority, i.stock_rule, i.kind, s.onHand, s.earliestExpiry ?? '', i.archived ? 'yes' : 'no', i.id]
      })
    downloadCSV(
      `stockpile-items-${stamp}.csv`,
      toCSV(['sort_order', 'name_en', 'name_zh', 'target_qty', 'unit', 'location', 'category', 'notes', 'highlight_en', 'highlight_zh', 'step_qty', 'priority', 'stock_rule', 'kind', 'on_hand', 'earliest_expiry', 'archived', 'id'], rows),
    )
  }

  const exportBatches = () => {
    const byId = new Map(items.map((i) => [i.id, i]))
    const rows = batches.map((b) => {
      const i = byId.get(b.item_id)
      return [i?.name_en ?? '', i?.name_zh ?? '', b.qty, i?.unit ?? '', b.expiry_date ?? '', b.purchased_on ?? '', i?.location ?? '', b.item_id, b.id]
    })
    downloadCSV(
      `stockpile-batches-${stamp}.csv`,
      toCSV(['name_en', 'name_zh', 'qty', 'unit', 'expiry_date', 'purchased_on', 'location', 'item_id', 'id'], rows),
    )
  }

  const exportPrices = () => {
    const byId = new Map(items.map((i) => [i.id, i]))
    const rows = prices.map((p) => {
      const i = byId.get(p.item_id)
      return [p.bought_on, i?.name_en ?? '', i?.name_zh ?? '', p.store, p.price, p.qty, i?.unit ?? '', (Number(p.price) / Number(p.qty)).toFixed(4), p.note ?? '']
    })
    downloadCSV(
      `stockpile-prices-${stamp}.csv`,
      toCSV(['bought_on', 'name_en', 'name_zh', 'store', 'price', 'qty', 'unit', 'unit_price', 'note'], rows),
    )
  }

  const exportStocktakes = () =>
    run(async () => {
      const lines = await loadAllLines()
      const byItem = new Map(items.map((i) => [i.id, i]))
      const byTake = new Map(stocktakes.map((s) => [s.id, s]))
      const rows = lines.map((l) => {
        const i = byItem.get(l.item_id)
        const s = byTake.get(l.stocktake_id)
        return [s?.taken_on ?? '', s?.status ?? '', i?.name_en ?? '', i?.name_zh ?? '', l.counted_qty, l.target_qty, i?.unit ?? '', l.earliest_expiry ?? '', s?.notes ?? '']
      })
      rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      downloadCSV(
        `stockpile-stocktakes-${stamp}.csv`,
        toCSV(['taken_on', 'status', 'name_en', 'name_zh', 'counted_qty', 'target_qty', 'unit', 'earliest_expiry', 'notes'], rows),
      )
    })

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    let result = { added: 0, updated: 0 }
    const ok = await run(async () => {
      result = await importItemsCSV(text, items)
    })
    if (ok) setMsg(t('importDone', result))
  }

  const starter = async () => {
    let result = { added: 0, updated: 0 }
    const ok = await run(async () => {
      result = await importStarter(items)
    })
    if (ok) setMsg(t('starterDone', { added: result.added }))
  }

  return (
    <section className="stack">
      <h1>{t('settingsTitle')}</h1>
      {msg && (
        <div className="banner banner-green">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)}>{t('close')}</button>
        </div>
      )}

      <div className="card stack">
        <label>
          <span>{t('language')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'zh-Hant')}>
            <option value="en">English</option>
            <option value="zh-Hant">繁體中文</option>
          </select>
        </label>
        <label>
          <span>{t('interval')}</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="24"
            value={interval}
            onChange={(e) => setIntervalValue(e.target.value)}
            onBlur={() => saveNumber('stocktake_interval_months', interval, 1, 24)}
          />
        </label>
        <label>
          <span>{t('warningDays')}</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="3650"
            value={warn}
            onChange={(e) => setWarn(e.target.value)}
            onBlur={() => saveNumber('expiry_warning_days', warn, 1, 3650)}
          />
          <small className="muted">{t('warningDaysHint')}</small>
        </label>
      </div>

      <div className="card stack">
        <h2>{t('backup')}</h2>
        <div className="row">
          <button onClick={exportItems}>{t('exportItems')}</button>
          <button onClick={exportBatches}>{t('exportBatches')}</button>
          <button onClick={exportStocktakes}>{t('exportStocktakes')}</button>
          <button onClick={exportPrices}>{t('exportPrices')}</button>
        </div>
        <label className="file-label">
          <span>{t('importItems')}</span>
          <input type="file" accept=".csv,text/csv" onChange={importFile} />
          <small className="muted">{t('importHint')}</small>
        </label>
        <div>
          <button onClick={starter}>{t('importStarter')}</button>
        </div>
      </div>

      <div className="card stack">
        <h2>{t('account')}</h2>
        <p>{t('signedInAs', { email: session?.user.email ?? '' })}</p>
        <div>
          <button className="danger" onClick={() => supabase.auth.signOut()}>
            {t('logout')}
          </button>
        </div>
      </div>
    </section>
  )
}
