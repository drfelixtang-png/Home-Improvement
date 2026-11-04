import type { Status } from '../lib/status'

export function StatusDot({ status }: { status: Status }) {
  return <span className={`dot dot-${status}`} aria-label={status} />
}
