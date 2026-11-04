import { StoreProvider, useStore } from './lib/store'
import { useRoute } from './lib/router'
import { configMissing } from './lib/supabase'
import { Login } from './screens/Login'
import { Inventory } from './screens/Inventory'
import { ItemForm } from './screens/ItemForm'
import { ItemDetail } from './screens/ItemDetail'
import { Archived } from './screens/Archived'
import { StocktakeScreen } from './screens/Stocktake'
import { Shopping } from './screens/Shopping'
import { History, HistoryDetail } from './screens/History'
import { SettingsScreen } from './screens/Settings'

function Header() {
  const { t, lang, setLang, session } = useStore()
  const route = useRoute()
  const top = route[0] ?? ''
  const nav: [string, string][] = [
    ['', t('navInventory')],
    ['shopping', t('navShopping')],
    ['stocktake', t('navStocktake')],
    ['history', t('navHistory')],
    ['settings', t('navSettings')],
  ]
  return (
    <header className="header no-print">
      <div className="header-top">
        <a className="brand" href="#/">
          {t('appName')}
        </a>
        <button className="lang" onClick={() => setLang(lang === 'en' ? 'zh-Hant' : 'en')}>
          {t('languageToggle')}
        </button>
      </div>
      {session && (
        <nav className="nav">
          {nav.map(([path, label]) => (
            <a key={path} href={`#/${path}`} className={top === path || (path === '' && top === 'item') ? 'active' : ''}>
              {label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}

function Screen() {
  const { session, authReady, t, error, dismissError, settings } = useStore()
  const route = useRoute()

  if (configMissing) return <p className="card">{t('configMissing')}</p>
  if (!authReady) return <p className="muted">{t('loading')}</p>
  if (!session) return <Login />

  const [a, b, c] = route
  let page
  if (a === 'item' && b === 'new') page = <ItemForm />
  else if (a === 'item' && b && c === 'edit') page = <ItemForm id={b} key={b} />
  else if (a === 'item' && b) page = <ItemDetail id={b} />
  else if (a === 'archived') page = <Archived />
  else if (a === 'stocktake') page = <StocktakeScreen />
  else if (a === 'shopping') page = <Shopping />
  else if (a === 'history' && b) page = <HistoryDetail id={b} />
  else if (a === 'history') page = <History />
  else if (a === 'settings') page = <SettingsScreen />
  else page = <Inventory />

  return (
    <>
      {error && (
        <div className="banner banner-red no-print" role="alert">
          <span>{t('error', { msg: error })}</span>
          <button onClick={dismissError}>{t('close')}</button>
        </div>
      )}
      {!settings.user_id && !error ? <p className="muted">{t('loading')}</p> : page}
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Header />
      <main className="main">
        <Screen />
      </main>
    </StoreProvider>
  )
}
