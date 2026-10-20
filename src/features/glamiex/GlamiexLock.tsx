import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { isGlamiexUnlocked, unlockGlamiex } from './lockState'

/** Password screen in front of the GLAMIEX section; the rest of the app stays usable. */
export function GlamiexLock({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isGlamiexUnlocked)
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  if (unlocked) return <>{children}</>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    const ok = await unlockGlamiex(password)
    setBusy(false)
    if (ok) setUnlocked(true)
    else { setError(true); setPassword('') }
  }

  return (
    <div className="grid min-h-[calc(100dvh-10rem)] place-items-center px-0 py-10 sm:px-4">
      <form onSubmit={submit} aria-labelledby="gx-lock-title" className="card relative w-full max-w-[400px] p-7 text-center shadow-xl sm:p-9">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl btn-3d"><Lock className="h-6 w-6" aria-hidden /></div>
        <h1 id="gx-lock-title" className="text-xl font-bold tracking-tight">GLAMIEX is locked</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Enter the password to open GLAMIEX Business.</p>
        <label htmlFor="gx-lock-password" className="sr-only">Password</label>
        <div className="relative">
          <input id="gx-lock-password" type={visible ? 'text' : 'password'} autoFocus autoComplete="off"
            value={password} onChange={(e) => { setPassword(e.target.value); setError(false) }}
            placeholder="Password" aria-invalid={error} aria-describedby="gx-lock-error"
            className="input h-12 w-full pr-12 text-base" />
          <button type="button" onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-muted transition hover:text-fg focus-visible:text-fg">
            {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
          </button>
        </div>
        <p id="gx-lock-error" role="alert" className="mt-2 min-h-5 text-left text-sm text-danger">
          {error ? 'Incorrect password. Please try again.' : ''}
        </p>
        <button type="submit" className="btn btn-3d mt-3 h-12 w-full text-base font-semibold" disabled={!password || busy}>Unlock</button>
      </form>
    </div>
  )
}
