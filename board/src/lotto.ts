// Lottery tracker: the owner's regular plays and the published winning numbers. Prizes are worked out
// from the numbers; shared prizes (and anything else, such as a Gold Ball win) are entered as my_prize.
import { supabase } from '../../src/lib/supabase'

export type Game = 'lotto649' | 'dailygrand'
export interface LottoPlay { id: string; game: Game; numbers: number[]; grand: number | null; cost: number; start_on: string; end_on: string | null; note: string }
export interface LottoDraw { id: string; game: Game; draw_on: string; numbers: number[]; bonus: number | null; grand: number | null; my_prize: number | null; note: string }

export const GAME: Record<Game, { name: string; zh: string; days: string }> = {
  lotto649: { name: 'Lotto 6/49', zh: '六合彩 6/49', days: 'Wednesday and Saturday' },
  dailygrand: { name: 'Daily Grand', zh: 'Daily Grand', days: 'Monday and Thursday' },
}

export async function loadLotto(): Promise<{ plays: LottoPlay[]; draws: LottoDraw[] }> {
  const [p, d] = await Promise.all([
    supabase.from('lotto_plays').select('id, game, numbers, grand, cost, start_on, end_on, note').order('start_on'),
    supabase.from('lotto_draws').select('id, game, draw_on, numbers, bonus, grand, my_prize, note').order('draw_on', { ascending: false }).limit(2000),
  ])
  if (p.error) throw p.error
  if (d.error) throw d.error
  const num = (x: unknown) => (x === null || x === undefined ? null : Number(x))
  return {
    plays: (p.data ?? []).map((r) => ({ ...r, cost: Number(r.cost) })) as LottoPlay[],
    draws: (d.data ?? []).map((r) => ({ ...r, my_prize: num(r.my_prize) })) as LottoDraw[],
  }
}

export async function setPrize(id: string, my_prize: number | null, note: string): Promise<void> {
  const { error } = await supabase.from('lotto_draws').update({ my_prize, note }).eq('id', id)
  if (error) throw error
}

export interface Result {
  draw: LottoDraw; play: LottoPlay; cost: number
  match: number; extra: boolean // extra: the bonus number (6/49) or the Grand Number (Daily Grand)
  tier: string | null           // prize level, for example "3/6" or "2/5 + Grand Number"
  prize: number                 // cash value counted, including a free play at the cost of one play
  freePlay: boolean
  shared: boolean               // a shared prize whose amount is not known until entered
  cashLabel: string             // how the prize is shown
}

// Fixed prizes (Daily Grand top prizes are annuities, shown as text and counted at 0 until entered).
function prizeOf(game: Game, match: number, extra: boolean, cost: number): { tier: string | null; prize: number; freePlay: boolean; shared: boolean; label: string } {
  const none = { tier: null, prize: 0, freePlay: false, shared: false, label: '' }
  if (game === 'lotto649') {
    if (match === 6) return { tier: '6/6', prize: 0, freePlay: false, shared: true, label: 'Jackpot (shared)' }
    if (match === 5) return { tier: extra ? '5/6 + bonus' : '5/6', prize: 0, freePlay: false, shared: true, label: 'Shared prize' }
    if (match === 4) return { tier: '4/6', prize: 0, freePlay: false, shared: true, label: 'Shared prize' }
    if (match === 3) return { tier: '3/6', prize: 10, freePlay: false, shared: false, label: '$10' }
    if (match === 2 && extra) return { tier: '2/6 + bonus', prize: 5, freePlay: false, shared: false, label: '$5' }
    if (match === 2) return { tier: '2/6', prize: cost, freePlay: true, shared: false, label: 'Free play' }
    return none
  }
  const t = `${match}/5${extra ? ' + Grand Number' : ''}`
  if (match === 5 && extra) return { tier: t, prize: 0, freePlay: false, shared: true, label: '$1,000 a day for life' }
  if (match === 5) return { tier: t, prize: 0, freePlay: false, shared: true, label: '$25,000 a year for life' }
  const fixed: Record<string, number> = { '4/5 + Grand Number': 1000, '4/5': 500, '3/5 + Grand Number': 100, '3/5': 20, '2/5 + Grand Number': 10, '1/5 + Grand Number': 4 }
  if (fixed[t]) return { tier: t, prize: fixed[t], freePlay: false, shared: false, label: `$${fixed[t].toLocaleString('en-CA')}` }
  if (match === 0 && extra) return { tier: t, prize: cost, freePlay: true, shared: false, label: 'Free play' }
  return none
}

/** One result per draw that a play covers, newest first. */
export function results(plays: LottoPlay[], draws: LottoDraw[]): Result[] {
  const out: Result[] = []
  for (const d of draws) {
    for (const p of plays.filter((x) => x.game === d.game && d.draw_on >= x.start_on && (!x.end_on || d.draw_on <= x.end_on))) {
      const match = p.numbers.filter((n) => d.numbers.includes(n)).length
      const extra = d.game === 'lotto649' ? d.bonus !== null && p.numbers.includes(d.bonus) : d.grand !== null && d.grand === p.grand
      const pr = prizeOf(d.game, match, extra, p.cost)
      const prize = d.my_prize !== null ? d.my_prize : pr.prize
      out.push({ draw: d, play: p, cost: p.cost, match, extra, tier: pr.tier ?? (d.my_prize ? 'Other prize' : null), prize, freePlay: pr.freePlay, shared: pr.shared && d.my_prize === null, cashLabel: d.my_prize !== null ? `$${d.my_prize.toLocaleString('en-CA')}` : pr.label })
    }
  }
  return out.sort((a, b) => b.draw.draw_on.localeCompare(a.draw.draw_on))
}

export interface Totals { draws: number; spent: number; won: number; cash: number; free: number; wins: number; net: number; back: number }
export function totals(rs: Result[]): Totals {
  const spent = rs.reduce((s, r) => s + r.cost, 0)
  const won = rs.reduce((s, r) => s + r.prize, 0)
  const free = rs.filter((r) => r.freePlay && r.draw.my_prize === null).reduce((s, r) => s + r.prize, 0)
  return { draws: rs.length, spent, won, cash: won - free, free, wins: rs.filter((r) => r.prize > 0 || r.shared).length, net: won - spent, back: spent ? won / spent : 0 }
}
