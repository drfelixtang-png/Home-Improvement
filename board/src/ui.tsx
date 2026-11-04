import type { ReactNode } from 'react'
import type { Severity } from './data'

// ------------------------------------------------------------------ small components
const SEV_LABEL: Record<Severity, string> = { urgent: 'Urgent', soon: 'Soon', info: 'Info' }

export function Sev({ s, label }: { s: Severity; label?: string }) {
  return <span className={`sev ${s}`}>{label ?? SEV_LABEL[s]}</span>
}

export function Card({
  id, title, zh, className = '', onOpen, children, meta,
}: {
  id: string
  title: string
  zh: string
  className?: string
  onOpen?: () => void
  children: ReactNode
  meta?: ReactNode
}) {
  return (
    <article className={`card c-${id} ${className}`}>
      <h2>
        <span>{title} <span className="tc">{zh}</span></span>
        {meta && <span className="meta">{meta}</span>}
      </h2>
      <div className="card-body">{children}</div>
      {onOpen && (
        <button type="button" className="more" onClick={onOpen}>
          Open panel <span aria-hidden="true">→</span>
        </button>
      )}
    </article>
  )
}

export function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <svg className="spark" viewBox="0 0 80 24" aria-hidden="true" />
  const w = 80, h = 24, pad = 2
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (w - pad * 2), pad + (1 - (v - min) / span) * (h - pad * 2)])
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`
  const last = pts[pts.length - 1]
  const cls = up ? 'up' : 'dn'
  return (
    <svg className={`spark ${cls}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polygon points={area} className="spark-area" />
      <polyline points={line} className="spark-line" />
      <circle cx={last[0]} cy={last[1]} r="2.2" className="spark-dot" />
    </svg>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Loading() {
  return <p className="empty">Loading…</p>
}

export function Problem({ msg }: { msg: string }) {
  return <p className="problem">Could not load this panel: {msg}</p>
}
