import { useStore } from '../lib/store'
import { daysUntil, formatDate } from '../lib/dates'
import { redDays } from '../lib/status'

// Shows an expiry date with a colour and a short "in N days" note.
export function Expiry({ date }: { date: string | null }) {
  const { lang, t, settings } = useStore()
  if (!date) return <span className="muted">{t('noExpiry')}</span>
  const d = daysUntil(date)
  const cls = d <= redDays(settings) ? 'text-red' : d <= settings.expiry_warning_days ? 'text-yellow' : ''
  return (
    <span className={cls}>
      {formatDate(date, lang)}{' '}
      <small>({d < 0 ? t('expired') : t('inDays', { n: d })})</small>
    </span>
  )
}
