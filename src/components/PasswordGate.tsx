import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'

/** Reusable password screen (site entry, GLAMIEX). Renders nothing behind it until unlocked. */
export function PasswordGate({ unlocked: initial, verify, title, subtitle, children, fullScreen }: {
  unlocked: boolean; verify: (password: string) => Promise<boolean>; title: string; subtitle: string; children: ReactNode; fullScreen?: boolean
}) {
  const [unlocked, setUnlocked] = useState(initial)
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  if (unlocked) return <>{children}</>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    const ok = await verify(password)
    setBusy(false)
    if (ok) setUnlocked(true)
    else { setError(true); setPassword('') }
  }

  return (
    <div className={fullScreen ? 'grid min-h-dvh place-items-center bg-bg px-4 py-10' : 'grid min-h-[calc(100dvh-10rem)] place-items-center px-0 py-10 sm:px-4'}>
      <form onSubmit={submit} aria-labelledby="pw-gate-title" className="card relative w-full max-w-[400px] p-7 text-center shadow-xl sm:p-9">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl btn-3d"><Lock className="h-6 w-6" aria-hidden /></div>
        <h1 id="pw-gate-title" className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
        <label htmlFor="pw-gate-password" className="sr-only">Password</label>
        <div className="relative">
          <input id="pw-gate-password" type={visible ? 'text' : 'password'} autoFocus autoComplete="off" inputMode="text"
            value={password} onChange={(e) => { setPassword(e.target.value); setError(false) }}
            placeholder="Password" aria-invalid={error} aria-describedby="pw-gate-error" className="input h-12 w-full pe-12 text-base" />
          <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
            className="absolute inset-y-0 end-0 grid w-12 place-items-center rounded-e-xl text-muted transition hover:text-fg focus-visible:text-fg">
            {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
          </button>
        </div>
        <p id="pw-gate-error" role="alert" className="mt-2 min-h-5 text-start text-sm text-danger">{error ? 'Incorrect password. Please try again.' : ''}</p>
        <button type="submit" className="btn btn-3d mt-3 h-12 w-full text-base font-semibold" disabled={!password || busy}>Unlock</button>
      </form>
    </div>
  )
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
