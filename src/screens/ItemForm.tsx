import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { addItem, updateItem } from '../lib/data'
import { itemName, word } from '../lib/i18n'
import { KINDS, LOCATIONS, PRIORITIES, STOCK_RULES, UNITS } from '../lib/types'
import type { Kind, Priority, StockRule } from '../lib/types'

export function ItemForm({ id }: { id?: string }) {
  const { t, lang, items, activeItems, run } = useStore()
  const existing = id ? items.find((i) => i.id === id) : undefined
  const [f, setF] = useState({
    name_en: existing?.name_en ?? '',
    name_zh: existing?.name_zh ?? '',
    category: existing?.category ?? '',
    unit: existing?.unit ?? 'each',
    target_qty: existing ? String(existing.target_qty) : '',
    location: existing?.location ?? 'Kitchen',
    notes: existing?.notes ?? '',
    step_qty: existing ? String(existing.step_qty ?? 1) : '1',
    priority: existing?.priority ?? 'important',
    stock_rule: existing?.stock_rule ?? 'keep',
    kind: existing?.kind ?? 'food',
  })
  const [err, setErr] = useState<string | null>(null)
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(), [items])

  if (id && !existing) return <p className="muted">{t('noItems')}</p>

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name_en.trim() && !f.name_zh.trim()) return setErr(t('nameRequired'))
    const target = Number(f.target_qty)
    const data = {
      name_en: f.name_en.trim(),
      name_zh: f.name_zh.trim(),
      category: f.category.trim(),
      unit: f.unit,
      target_qty: Number.isFinite(target) && target >= 0 ? target : 0,
      location: f.location,
      notes: f.notes.trim() || null,
      step_qty: Number(f.step_qty) > 0 ? Number(f.step_qty) : 1,
      priority: f.priority as Priority,
      stock_rule: f.stock_rule as StockRule,
      kind: f.kind as Kind,
    }
    let newId = id
    const ok = await run(async () => {
      if (existing) await updateItem(existing.id, data)
      else {
        const sort_order = activeItems.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1
        newId = (await addItem({ ...data, sort_order })).id
      }
    })
    if (ok) go('item/' + newId)
  }

  const archive = async () => {
    if (!existing) return
    if (!confirm(t('archiveConfirm', { name: itemName(lang, existing) }))) return
    if (await run(() => updateItem(existing.id, { archived: true }))) go('')
  }

  return (
    <section className="card">
      <h1>{existing ? t('editItem') : t('newItem')}</h1>
      <form className="stack form-grid" onSubmit={submit}>
        <label>
          <span>{t('nameEn')}</span>
          <input value={f.name_en} onChange={set('name_en')} />
        </label>
        <label>
          <span>{t('nameZh')}</span>
          <input value={f.name_zh} onChange={set('name_zh')} lang="zh-Hant" />
        </label>
        <label>
          <span>{t('category')}</span>
          <input value={f.category} onChange={set('category')} list="categories" />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c} value={c}>
                {word(lang, c)}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          <span>{t('location')}</span>
          <select value={f.location} onChange={set('location')}>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {word(lang, l)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('targetQty')}</span>
          <input type="number" inputMode="decimal" min="0" step="any" required value={f.target_qty} onChange={set('target_qty')} />
        </label>
        <label>
          <span>{t('unit')}</span>
          <select value={f.unit} onChange={set('unit')}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {lang === 'en' ? u : `${word(lang, u)} (${u})`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('priority')}</span>
          <select value={f.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`pr_${p}`)}
              </option>
            ))}
          </select>
          <small className="muted">{t('priorityHint')}</small>
        </label>
        <label>
          <span>{t('stockRule')}</span>
          <select value={f.stock_rule} onChange={set('stock_rule')}>
            {STOCK_RULES.map((r) => (
              <option key={r} value={r}>
                {t(`sr_${r}`)}
              </option>
            ))}
          </select>
          <small className="muted">{t('stockRuleHint')}</small>
        </label>
        <label>
          <span>{t('kind')}</span>
          <select value={f.kind} onChange={set('kind')}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind_${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          <span>
            {t('stepQty')} ({word(lang, f.unit)})
          </span>
          <input type="number" inputMode="decimal" min="0" step="any" required value={f.step_qty} onChange={set('step_qty')} />
          <small className="muted">{t('stepHint')}</small>
        </label>
        <label className="span-2">
          <span>
            {t('notes')} <small className="muted">({t('optional')})</small>
          </span>
          <textarea rows={2} value={f.notes} onChange={set('notes')} />
        </label>
        {err && <p className="text-red span-2">{err}</p>}
        <div className="row span-2">
          <button type="submit" className="primary">
            {t('save')}
          </button>
          <button type="button" onClick={() => history.back()}>
            {t('cancel')}
          </button>
          {existing && !existing.archived && (
            <button type="button" className="danger push-right" onClick={archive}>
              {t('archive')}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
