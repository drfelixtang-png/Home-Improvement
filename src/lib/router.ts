import { useEffect, useState } from 'react'

// Hash routes (#/item/abc) work on any static host without server rewrites.
function current(): string[] {
  const h = window.location.hash
  // Sign-in links return with "#access_token=..."; treat anything not starting with "#/" as home.
  if (!h.startsWith('#/')) return []
  return h.slice(2).split('/').filter(Boolean).map(decodeURIComponent)
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const on = () => {
      setRoute(current())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(path: string): void {
  window.location.hash = '#/' + path.replace(/^\//, '')
}
