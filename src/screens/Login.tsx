import { useState } from 'react'
import type { FormEvent } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { loginProblem } from '../lib/loginError'

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
      // Never create a new account here: only existing accounts get a link.
      options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: false },
    })
    setBusy(false)
    if (error) {
      const kind = loginProblem(error.message, error.status)
      setErr(kind === 'noAccess' ? t('loginNoAccess') : kind === 'tooMany' ? t('loginTooMany') : t('error', { msg: error.message }))
    }
    else setSent(true)
  }

  return (
    <section className="card login">
      <h1>{t('loginTitle')}</h1>
      {sent ? (
        <p>{t('linkSent')}</p>
      ) : (
        <form onSubmit={submit} className="stack">
          <p className="private-note">{t('loginPrivate')}</p>
          <p>{t('loginIntro')}</p>
          <label>
            <span>{t('email')}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? t('saving') : t('sendLink')}
          </button>
          {err && <p className="text-red">{err}</p>}
        </form>
      )}
    </section>
  )
}
