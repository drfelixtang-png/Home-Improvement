import { supabase } from './supabase'
import type { Batch, Item, ItemInput, PriceRecord, ProductLink, Settings, Stocktake, StocktakeLine } from './types'
import { LOCATIONS, UNITS } from './types'
import { parseCSV, rowsToObjects } from './csv'
import { STARTER_CSV } from './seed'
import { todayISO } from './dates'
import { compareBatches, round } from './status'

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

// ---------- loading ----------

export async function loadAll() {
  const [items, batches, settings, stocktakes, prices, links] = await Promise.all([
    supabase.from('items').select('*').order('sort_order').order('created_at'),
    supabase.from('batches').select('*'),
    supabase.from('settings').select('*').maybeSingle(),
    supabase.from('stocktakes').select('*').order('taken_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('price_records').select('*').order('bought_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('product_links').select('*').order('sort_order').order('created_at'),
  ])
  const st = check(stocktakes) as Stocktake[]
  const open = st.find((s) => s.status === 'in_progress')
  let openDone = 0
  if (open) {
    const res = await supabase
      .from('stocktake_lines')
      .select('id', { count: 'exact', head: true })
      .eq('stocktake_id', open.id)
    if (res.error) throw new Error(res.error.message)
    openDone = res.count ?? 0
  }
  return {
    items: check(items) as Item[],
    batches: check(batches) as Batch[],
    settings: check(settings) as Settings | null,
    stocktakes: st,
    openDone,
    prices: check(prices) as PriceRecord[],
    links: check(links) as ProductLink[],
  }
}

// Creates the settings row if it is missing; never overwrites one made by another tab or device.
export async function createSettings(language: Settings['language']): Promise<Settings> {
  check(await supabase.from('settings').upsert({ language }, { onConflict: 'user_id', ignoreDuplicates: true }))
  return check(await supabase.from('settings').select('*').single()) as Settings
}

// Marks the starter list as loaded. Returns true for exactly one caller, even when several
// tabs or devices sign in at the same moment, so the starter list is only loaded once.
export async function claimSeed(userId: string): Promise<boolean> {
  const rows = check(
    await supabase.from('settings').update({ seeded: true }).eq('user_id', userId).eq('seeded', false).select('user_id'),
  ) as { user_id: string }[]
  return rows.length === 1
}

export async function updateSettings(patch: Partial<Omit<Settings, 'user_id'>>, userId: string) {
  check(await supabase.from('settings').update(patch).eq('user_id', userId))
}

// ---------- items ----------

export async function addItem(input: ItemInput) {
  return check(await supabase.from('items').insert(input).select().single()) as Item
}

export async function updateItem(id: string, patch: Partial<Item>) {
  check(await supabase.from('items').update(patch).eq('id', id))
}

// Saves the new order (1, 2, 3...) for rows whose position changed.
export async function saveOrder(ordered: Item[]) {
  const changes = ordered
    .map((it, i) => ({ id: it.id, sort_order: i + 1, old: it.sort_order }))
    .filter((c) => c.sort_order !== c.old)
  await Promise.all(changes.map((c) => updateItem(c.id, { sort_order: c.sort_order })))
}

// ---------- batches ----------

export async function addBatch(b: { item_id: string; qty: number; expiry_date: string | null; purchased_on: string | null }) {
  return check(await supabase.from('batches').insert(b).select().single()) as Batch
}

export async function updateBatch(id: string, patch: Partial<Pick<Batch, 'qty' | 'expiry_date' | 'purchased_on'>>) {
  check(await supabase.from('batches').update(patch).eq('id', id))
}

export async function deleteBatch(id: string) {
  check(await supabase.from('batches').delete().eq('id', id))
}

// Quick +/- from the inventory list.
// Plus adds to the newest batch. Minus takes from the batch expiring soonest (first in, first out);
// batches that reach zero are deleted. Returns false when plus needs a new batch (none exists).
export async function adjustStock(itemBatches: Batch[], delta: number): Promise<boolean> {
  if (delta > 0) {
    const newest = [...itemBatches].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!newest) return false
    await updateBatch(newest.id, { qty: round(Number(newest.qty) + delta) })
    return true
  }
  let left = -delta
  for (const b of itemBatches.filter((x) => Number(x.qty) > 0).sort(compareBatches)) {
    if (left <= 0) break
    const take = Math.min(left, Number(b.qty))
    left = round(left - take)
    const remaining = round(Number(b.qty) - take)
    if (remaining <= 0) await deleteBatch(b.id)
    else await updateBatch(b.id, { qty: remaining })
  }
  return true
}

// ---------- prices and products ----------

export async function addPrice(p: { item_id: string; store: string; price: number; qty: number; bought_on: string; note?: string | null }) {
  check(await supabase.from('price_records').insert(p))
}

export async function deletePrice(id: string) {
  check(await supabase.from('price_records').delete().eq('id', id))
}

export type LinkInput = Omit<ProductLink, 'id' | 'sort_order'> & { sort_order?: number }

export async function addLink(l: LinkInput) {
  check(await supabase.from('product_links').insert(l))
}

export async function updateLink(id: string, patch: Partial<LinkInput>) {
  check(await supabase.from('product_links').update(patch).eq('id', id))
}

export async function deleteLink(id: string) {
  check(await supabase.from('product_links').delete().eq('id', id))
}

// ---------- stock-takes ----------

export async function startStocktake() {
  return check(await supabase.from('stocktakes').insert({ status: 'in_progress' }).select().single()) as Stocktake
}

export async function loadLines(stocktakeId: string) {
  return check(await supabase.from('stocktake_lines').select('*').eq('stocktake_id', stocktakeId)) as StocktakeLine[]
}

export async function saveLine(line: Omit<StocktakeLine, 'id'>) {
  check(await supabase.from('stocktake_lines').upsert(line, { onConflict: 'stocktake_id,item_id' }))
}

export async function deleteLine(stocktakeId: string, itemId: string) {
  check(await supabase.from('stocktake_lines').delete().eq('stocktake_id', stocktakeId).eq('item_id', itemId))
}

export async function finishStocktake(id: string, lines: Omit<StocktakeLine, 'id'>[], notes: string) {
  if (lines.length) check(await supabase.from('stocktake_lines').upsert(lines, { onConflict: 'stocktake_id,item_id' }))
  check(
    await supabase
      .from('stocktakes')
      .update({ status: 'done', taken_on: todayISO(), finished_at: new Date().toISOString(), notes: notes || null })
      .eq('id', id),
  )
}

export async function cancelStocktake(id: string) {
  check(await supabase.from('stocktakes').delete().eq('id', id))
}

export async function loadAllLines() {
  return check(await supabase.from('stocktake_lines').select('*')) as StocktakeLine[]
}

// ---------- import ----------

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const hit = allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase())
  return hit ?? fallback
}

// Adds or updates items from CSV text. Items match on English name (case-insensitive),
// or on Chinese name when there is no English name.
export async function importItemsCSV(text: string, existing: Item[]) {
  const objects = rowsToObjects(parseCSV(text))
  const keyOf = (en: string, zh: string) => (en.trim() ? 'en:' + en.trim().toLowerCase() : 'zh:' + zh.trim())
  const byKey = new Map(existing.map((it) => [keyOf(it.name_en, it.name_zh), it]))
  const inserts: ItemInput[] = []
  const updates: { id: string; patch: Partial<Item> }[] = []

  for (const o of objects) {
    const name_en = o.name_en ?? ''
    const name_zh = o.name_zh ?? ''
    if (!name_en && !name_zh) continue
    const target = Number(o.target_qty)
    const fields = {
      name_en,
      name_zh,
      category: o.category ?? '',
      unit: pick(o.unit ?? '', UNITS, 'each'),
      target_qty: Number.isFinite(target) && target >= 0 ? target : 0,
      location: pick(o.location ?? '', LOCATIONS, 'Kitchen'),
      notes: o.notes ? o.notes : null,
      ...(Number(o.step_qty) > 0 ? { step_qty: Number(o.step_qty) } : {}),
    }
    const found = byKey.get(keyOf(name_en, name_zh))
    if (found) {
      updates.push({ id: found.id, patch: { ...fields, archived: false } })
    } else {
      const order = Number(o.sort_order)
      // Temporary order from the CSV; renumbered below to follow existing items.
      inserts.push({ ...fields, sort_order: Number.isFinite(order) ? order : 100000 + inserts.length })
    }
  }
  if (inserts.length) {
    // Keep the CSV order but renumber after existing items.
    inserts.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const base = existing.filter((i) => !i.archived).reduce((m, i) => Math.max(m, i.sort_order), 0)
    inserts.forEach((it, i) => (it.sort_order = base + i + 1))
    check(await supabase.from('items').insert(inserts))
  }
  await Promise.all(updates.map((u) => updateItem(u.id, u.patch)))
  return { added: inserts.length, updated: updates.length }
}

// Adds starter items that are not on the list yet (does not change existing ones).
export async function importStarter(existing: Item[]) {
  const names = new Set(existing.map((i) => i.name_en.trim().toLowerCase()))
  const rows = parseCSV(STARTER_CSV)
  const kept = [rows[0], ...rows.slice(1).filter((r) => !names.has((r[1] ?? '').trim().toLowerCase()))]
  if (kept.length === 1) return { added: 0, updated: 0 }
  const csv = kept.map((r) => r.map((f) => (/[",]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(',')).join('\n')
  return importItemsCSV(csv, existing)
}
