import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { itemName, word } from '../lib/i18n'
import { formatQty } from '../lib/dates'
import { compareBatches, round, summarise } from '../lib/status'
import { updateItem } from '../lib/data'
import { BatchList } from '../components/BatchList'
import { StatusDot } from '../components/StatusDot'
import { Expiry } from '../components/Expiry'
import { PriceSection, WhereToBuy } from '../components/Prices'

export function ItemDetail({ id }: { id: string }) {
  const { t, lang, items, batches, settings, run } = useStore()
  const item = items.find((i) => i.id === id)
  if (!item) return <p className="muted">{t('noItems')}</p>
  const s = summarise(item, batches, settings)
  const short = round(Number(item.target_qty) - s.onHand)

  return (
    <section>
      <p className="no-print">
        <a href="#/">← {t('back')}</a>
      </p>
      <div className={`card status-${s.status}`}>
        <div className="row space-between">
          <h1>
            <StatusDot status={s.status} /> {itemName(lang, item)}
          </h1>
          {item.archived ? (
            <button onClick={() => run(() => updateItem(item.id, { archived: false }))}>{t('restore')}</button>
          ) : (
            <button onClick={() => go(`item/${item.id}/edit`)}>{t('edit')}</button>
          )}
        </div>
        {lang === 'en' ? item.name_zh && <p className="muted">{item.name_zh}</p> : item.name_en && <p className="muted">{item.name_en}</p>}
        <dl className="facts">
          <div>
            <dt>{t('onHand')}</dt>
            <dd>
              {formatQty(s.onHand)} {word(lang, item.unit)}
            </dd>
          </div>
          <div>
            <dt>{t('target')}</dt>
            <dd>
              {formatQty(Number(item.target_qty))} {word(lang, item.unit)}
              {short > 0 && <small className="text-red"> ({t('shortBy', { n: formatQty(short) })})</small>}
            </dd>
          </div>
          <div>
            <dt>{t('location')}</dt>
            <dd>{word(lang, item.location)}</dd>
          </div>
          <div>
            <dt>{t('category')}</dt>
            <dd>{word(lang, item.category) || '–'}</dd>
          </div>
          <div>
            <dt>{t('stepQty')}</dt>
            <dd>
              {formatQty(Number(item.step_qty) || 1)} {word(lang, item.unit)}
            </dd>
          </div>
          <div>
            <dt>{t('colExpiry')}</dt>
            <dd>{s.earliestExpiry ? <Expiry date={s.earliestExpiry} /> : '–'}</dd>
          </div>
        </dl>
        {item.notes && <p className="notes">{item.notes}</p>}
      </div>

      <h2>{t('batches')}</h2>
      <BatchList item={item} batches={batches.filter((b) => b.item_id === item.id).sort(compareBatches)} />

      <PriceSection item={item} />
      <WhereToBuy item={item} />
    </section>
  )
}
