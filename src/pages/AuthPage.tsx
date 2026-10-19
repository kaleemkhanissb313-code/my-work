import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, LogIn, Mail, UserPlus } from 'lucide-react'
import { Button, Card, Field, Input, PageHeader, Tabs } from '@/components/ui'
import { toast } from '@/components/feedback'
import { auth, authState } from '@/services/auth'
import { cloudConfigured } from '@/services/supabase'
import { passwordStrength } from '@/lib/crypto'
import { isValidEmail } from '@/lib/format'

type Mode = 'signin' | 'signup' | 'reset' | 'update'

export function AuthPage() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) || 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const nav = useNavigate()
  const { session } = authState.use()

  if (!cloudConfigured) return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Accounts" icon={KeyRound} />
      <Card><p className="text-sm text-muted">Cloud accounts are not configured on this installation. The app works fully offline in local mode. An administrator can enable accounts by setting <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> and applying the database migrations (see README).</p>
        <Link to="/" className="btn btn-soft mt-3 h-10 px-4 text-sm">Back to dashboard</Link></Card>
    </div>
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setInfo(null)
    if (mode !== 'update' && !isValidEmail(email)) return setErr('Enter a valid email address.')
    if ((mode === 'signup' || mode === 'update') && password.length < 8) return setErr('Use at least 8 characters for your password.')
    setBusy(true)
    try {
      if (mode === 'signin') { await auth.signIn(email, password); toast('Signed in'); nav('/settings') }
      else if (mode === 'signup') { await auth.signUp(email, password, name); setInfo('Check your email to confirm your account, then sign in.') }
      else if (mode === 'reset') { await auth.resetPassword(email); setInfo('If an account exists for that email, a reset link has been sent.') }
      else { await auth.updatePassword(password); toast('Password updated'); nav('/') }
    } catch (e2) { setErr((e2 as Error).message) } finally { setBusy(false) }
  }
  const st = passwordStrength(password)

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={mode === 'update' ? 'Set a new password' : 'Your account'} description="Sign in to sync across devices. Local data stays available offline." icon={KeyRound} />
      {session && mode !== 'update' && <Card className="mb-4 text-sm">You're signed in as <b>{session.user.email}</b>. <Link className="text-accent" to="/security">Manage account</Link></Card>}
      <Card className="p-5">
        {mode !== 'update' && <Tabs label="Account" value={mode} onChange={(m) => { setMode(m); setErr(null); setInfo(null) }} tabs={[
          { id: 'signin', label: 'Sign in', icon: LogIn }, { id: 'signup', label: 'Create account', icon: UserPlus }, { id: 'reset', label: 'Forgot password', icon: Mail },
        ]} />}
        <form onSubmit={submit} className="space-y-3" noValidate>
          {mode === 'signup' && <Field label="Name" htmlFor="au-name"><Input id="au-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>}
          {mode !== 'update' && <Field label="Email" htmlFor="au-email"><Input id="au-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
          {mode !== 'reset' && (
            <Field label={mode === 'update' ? 'New password' : 'Password'} htmlFor="au-pw" hint={mode !== 'signin' && password ? `Strength: ${st.label}` : undefined}>
              <Input id="au-pw" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          {err && <p className="text-sm text-danger" role="alert">{err}</p>}
          {info && <p className="text-sm text-ok" role="status">{info}</p>}
          <Button type="submit" variant="primary" loading={busy} className="w-full">
            {{ signin: 'Sign in', signup: 'Create account', reset: 'Send reset link', update: 'Update password' }[mode]}
          </Button>
        </form>
      </Card>
    </div>
  )
}
