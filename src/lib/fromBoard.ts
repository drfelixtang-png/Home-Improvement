// The Morning Board links here with "?from=board". Remember it for this visit so the
// header can offer a way back, and remove it from the address bar.
const KEY = 'stockpile.fromBoard'

export function captureFromBoard(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('from') === 'board') {
      sessionStorage.setItem(KEY, '1')
      params.delete('from')
      const q = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash)
    }
  } catch {
    /* storage may be blocked */
  }
}

export function cameFromBoard(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const BOARD_URL = './board/'
