import { useStore } from '../lib/store'
import { itemName, word } from '../lib/i18n'
import { updateItem } from '../lib/data'

export function Archived() {
  const { t, lang, items, activeItems, run } = useStore()
  const archived = items.filter((i) => i.archived)
  const restore = (id: string) => {
    // Restored items go to the end of the list.
    const sort_order = activeItems.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1
    run(() => updateItem(id, { archived: false, sort_order }))
  }
  return (
    <section>
      <p>
        <a href="#/">← {t('back')}</a>
      </p>
      <h1>{t('archivedItems')}</h1>
      {archived.length === 0 ? (
        <p className="muted">{t('noArchived')}</p>
      ) : (
        <ul className="plain-list">
          {archived.map((i) => (
            <li key={i.id} className="row space-between card">
              <span>
                <a href={`#/item/${i.id}`}>{itemName(lang, i)}</a> <small className="muted">{word(lang, i.location)}</small>
              </span>
              <button onClick={() => restore(i.id)}>{t('restore')}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
