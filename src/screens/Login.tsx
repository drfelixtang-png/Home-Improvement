import { useState } from 'react'
import type { FormEvent } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'

export function Login() {
  const { t } = useStore()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    setBusy(false)
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <section className="card login">
      <h1>{t('loginTitle')}</h1>
      {sent ? (
        <p>{t('linkSent')}</p>
      ) : (
        <form onSubmit={submit} className="stack">
          <p>{t('loginIntro')}</p>
          <label>
            <span>{t('email')}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? t('saving') : t('sendLink')}
          </button>
          {err && <p className="text-red">{t('error', { msg: err })}</p>}
        </form>
      )}
    </section>
  )
}
