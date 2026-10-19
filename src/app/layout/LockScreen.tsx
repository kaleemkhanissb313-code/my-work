import { useEffect, useState } from 'react'
import { Fingerprint, Lock } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { getAttempts, unlockApp } from '@/services/security'

export function LockScreen() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(Date.now())

  useEffect(() => { void getAttempts().then((a) => setRetryAt(a.lockedUntil)) }, [])
  useEffect(() => {
    if (retryAt <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [retryAt])
  const waiting = retryAt > now

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pin || waiting) return
    setBusy(true); setError(null)
    const r = await unlockApp(pin)
    setBusy(false)
    if (!r.ok) { setError(r.error); setPin(''); if (r.retryAt) setRetryAt(r.retryAt) }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-bg p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 text-center" aria-labelledby="lock-title">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl btn-3d"><Lock className="h-7 w-7" aria-hidden /></div>
        <h1 id="lock-title" className="text-lg font-bold">Basic to Advanced is locked</h1>
        <p className="mb-4 text-sm text-muted">Enter your PIN or app password to continue.</p>
        <label htmlFor="unlock-pin" className="sr-only">PIN or password</label>
        <Input id="unlock-pin" type="password" autoFocus autoComplete="current-password" inputMode="text" value={pin} onChange={(e) => setPin(e.target.value)} disabled={waiting} aria-invalid={!!error} aria-describedby="unlock-err" />
        <div id="unlock-err" className="mt-2 min-h-5 text-sm text-danger" role="alert">
          {waiting ? `Too many attempts. Try again in ${Math.ceil((retryAt - now) / 1000)}s.` : error}
        </div>
        <Button type="submit" variant="primary" className="mt-2 w-full" loading={busy} disabled={waiting || !pin}>Unlock</Button>
        <Button className="mt-2 w-full" icon={Fingerprint} disabled title="Biometric unlock requires the native mobile/desktop build">Biometric unlock (native apps only)</Button>
        <p className="mt-4 text-[11px] text-muted">Forgot your PIN? Clearing this site's data removes the lock and all local data. Restore from a backup or cloud sync afterwards.</p>
      </form>
    </div>
  )
}
