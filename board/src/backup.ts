// Backup: download every table of this account's data as one JSON file.
// Row security means only the signed-in owner's rows are returned.
import { supabase } from '../../src/lib/supabase'

export const BACKUP_TABLES = [
  // Morning Board
  'board_settings', 'board_snapshots', 'board_item_state', 'board_extra', 'board_reviews', 'checkins',
  'household', 'home_items',
  // Finance
  'fin_settings', 'fin_accounts', 'fin_balances', 'fin_holdings', 'fin_portfolio_snapshots', 'fin_properties',
  'fin_ie', 'fin_transactions', 'fin_recurring', 'fin_history', 'fin_archive',
  // Stockpile Tracker
  'settings', 'items', 'batches', 'stocktakes', 'stocktake_lines', 'price_records', 'product_links',
]

async function allRows(table: string): Promise<unknown[]> {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {
    let r = await supabase.from(table).select('*').order('id').range(from, from + 999)
    if (r.error && from === 0) {
      // Tables keyed by user (no id column) hold a single row.
      r = await supabase.from(table).select('*')
      if (r.error) throw new Error(`${table}: ${r.error.message}`)
      return r.data ?? []
    }
    if (r.error) throw new Error(`${table}: ${r.error.message}`)
    out.push(...(r.data ?? []))
    if (!r.data || r.data.length < 1000) return out
  }
}

export async function downloadBackup(onProgress?: (msg: string) => void): Promise<{ tables: number; rows: number; file: string }> {
  const tables: Record<string, unknown[]> = {}
  let rows = 0
  for (const t of BACKUP_TABLES) {
    onProgress?.(`Reading ${t}…`)
    tables[t] = await allRows(t)
    rows += tables[t].length
  }
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' })
  const file = `morning-board-backup-${stamp}.json`
  const blob = new Blob([JSON.stringify({ app: 'Morning Board and Stockpile Tracker', exported_at: new Date().toISOString(), rows, tables }, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { tables: BACKUP_TABLES.length, rows, file }
}
