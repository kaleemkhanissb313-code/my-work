import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import {
  Activity, AlertTriangle, CheckCircle2, Download, Fingerprint, KeyRound, Lock, LogOut, ShieldCheck, Smartphone, Trash2, Upload, User,
} from 'lucide-react'
import { db } from '@/lib/db'
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select, Toggle } from '@/components/ui'
import { confirm, safeWrite, toast } from '@/components/feedback'
import { lockApp, removePin, setPin, validatePin } from '@/services/security'
import { updateSettings, useSettings } from '@/services/settings'
import { downloadText, exportBackup, importBackup } from '@/services/backup'
import { authState, auth } from '@/services/auth'
import { cloudConfigured, supabase } from '@/services/supabase'
import { passwordStrength } from '@/lib/crypto'
import { cn } from '@/lib/cn'

function PinSection() {
  const s = useSettings()
  const hasPin = useLiveQuery(() => db.kv.get('security.pin').then(Boolean), [])
  const [current, setCurrent] = useState('')
  const [pin, setPinVal] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setErr(null)
    const v = validatePin(pin)
    if (v) return setErr(v)
    if (pin !== confirmPin) return setErr('The two entries do not match.')
    setBusy(true)
    try {
      if (hasPin) await removePin(current)
      await setPin(pin)
      toast(hasPin ? 'PIN changed' : 'App lock enabled')
      setCurrent(''); setPinVal(''); setConfirmPin('')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const disable = async () => {
    setErr(null); setBusy(true)
    try { await removePin(current); setCurrent(''); toast('App lock disabled') } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardTitle icon={Lock} tone="text-secure">App lock</CardTitle>
      <p className="mb-3 text-sm text-muted">
        Lock the app behind a PIN (4+ digits) or password (6+ characters). It is hashed with PBKDF2-SHA-256 (310,000 iterations, random salt) — never stored in plain text.
        Repeated failures trigger an increasing lockout.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {hasPin && <Field label="Current PIN / password" htmlFor="pin-cur"><Input id="pin-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>}
        <Field label={hasPin ? 'New PIN / password' : 'PIN / password'} htmlFor="pin-new"><Input id="pin-new" type="password" autoComplete="new-password" value={pin} onChange={(e) => setPinVal(e.target.value)} /></Field>
        <Field label="Confirm" htmlFor="pin-conf"><Input id="pin-conf" type="password" autoComplete="new-password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} /></Field>
      </div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} onClick={save} disabled={!pin}>{hasPin ? 'Change PIN' : 'Enable app lock'}</Button>
        {hasPin && <Button variant="danger" onClick={disable} disabled={!current || busy}>Disable lock</Button>}
        {hasPin && <Button icon={Lock} onClick={() => void lockApp('manual')}>Lock now</Button>}
      </div>
      {hasPin && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div><div className="text-sm font-medium">Auto-lock after inactivity</div><div className="text-xs text-muted">Locks the app and the vault when idle.</div></div>
            <Select aria-label="Auto-lock delay" className="w-auto" value={s.lock.autoLockMins} onChange={(e) => void safeWrite(() => updateSettings({ lock: { ...s.lock, autoLockMins: Number(e.target.value) } }))}>
              {[1, 2, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minute{m > 1 ? 's' : ''}</option>)}
            </Select>
          </div>
        </div>
      )}
      <Toggle label="Hide sensitive fields by default" description="Masks account numbers, serials, addresses and journal entries until revealed."
        checked={s.lock.hideSensitive} onChange={(v) => void safeWrite(() => updateSettings({ lock: { ...s.lock, hideSensitive: v } }))} />
      <div className="mt-3 flex items-start gap-3 rounded-xl border border-line bg-raised/50 p-3 text-sm">
        <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <div><b>Biometric unlock</b> <Badge>Native apps only</Badge><p className="text-muted">Fingerprint / Face unlock uses the operating system's secure authentication and is available in the Android/iOS (Capacitor) and desktop (Tauri) builds once the native biometric plugin is configured. It is not offered in the web/PWA build.</p></div>
      </div>
    </Card>
  )
}

function AccountSection() {
  const { session } = authState.use()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [mfa, setMfa] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [factors, setFactors] = useState<{ id: string; status: string; friendly_name?: string }[]>([])
  const [code, setCode] = useState('')
  const sb = supabase()

  const loadFactors = async () => {
    if (!sb || !session) return
    const { data } = await sb.auth.mfa.listFactors()
    setFactors((data?.totp ?? []) as typeof factors)
  }
  useEffect(() => { void loadFactors() }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cloudConfigured) return (
    <Card><CardTitle icon={User}>Account & sessions</CardTitle>
      <p className="text-sm text-muted">Cloud accounts are not configured on this installation, so the app runs in local mode: data stays in this browser's IndexedDB on this device. To enable accounts, sync, 2FA and server-enforced access control, set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see README → Cloud setup).</p>
    </Card>
  )
  if (!session) return (
    <Card><CardTitle icon={User}>Account & sessions</CardTitle>
      <p className="mb-3 text-sm text-muted">You are not signed in. Data stays on this device until you sign in and sync.</p>
      <Link to="/auth" className="btn btn-3d h-10 px-4 text-sm">Sign in or create account</Link>
    </Card>
  )

  const enroll = async () => {
    if (!sb) return
    setBusy(true)
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toLocaleDateString()}` })
    setBusy(false)
    if (error || !data || data.type !== 'totp') return toast('Could not start 2FA enrollment. Ensure MFA is enabled for your Supabase project.', 'error')
    setMfa({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  const verify = async () => {
    if (!sb || !mfa) return
    setBusy(true)
    const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: mfa.id })
    const { error } = e1 || !ch ? { error: e1 } : await sb.auth.mfa.verify({ factorId: mfa.id, challengeId: ch.id, code: code.trim() })
    setBusy(false)
    if (error) return toast('That code is not valid. Check your authenticator app’s time and try again.', 'error')
    toast('Two-factor authentication enabled'); setMfa(null); setCode(''); void loadFactors()
    const { audit } = await import('@/services/audit'); void audit('mfa_enrolled', 'TOTP factor verified')
  }
  const unenroll = async (id: string) => {
    if (!sb || !(await confirm({ title: 'Remove 2FA?', body: 'Your account will be protected by password only.', danger: true, confirmLabel: 'Remove' }))) return
    const { error } = await sb.auth.mfa.unenroll({ factorId: id })
    if (error) toast('Could not remove the factor (you may need to re-authenticate with 2FA first).', 'error'); else { toast('2FA removed'); void loadFactors() }
  }
  const strength = passwordStrength(pw)

  return (
    <Card><CardTitle icon={User}>Account & sessions</CardTitle>
      <p className="text-sm">Signed in as <b>{session.user.email}</b></p>
      <p className="text-xs text-muted">Session expires {session.expires_at ? format(session.expires_at * 1000, 'PPp') : 'automatically'} and refreshes while active. Access to your cloud data is enforced by Row Level Security on the server.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={LogOut} onClick={async () => { await auth.signOut('local'); toast('Signed out') }}>Sign out</Button>
        <Button variant="danger" icon={LogOut} onClick={async () => {
          if (await confirm({ title: 'Sign out everywhere?', body: 'All sessions on all devices will be revoked.', danger: true, confirmLabel: 'Sign out everywhere' })) { await auth.signOut('global'); toast('All sessions revoked') }
        }}>Sign out all devices</Button>
      </div>
      <div className="mt-4 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Change password" hint={pw ? `Strength: ${strength.label}` : 'At least 8 characters'} htmlFor="new-pw"><Input id="new-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Button loading={busy} disabled={pw.length < 8} onClick={async () => { setBusy(true); try { await auth.updatePassword(pw); setPw(''); toast('Password updated') } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) } }}>Update</Button>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4" aria-hidden />Two-factor authentication (TOTP)</div>
        {factors.filter((f) => f.status === 'verified').map((f) => (
          <div key={f.id} className="mb-2 flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"><span><CheckCircle2 className="mr-1 inline h-4 w-4 text-ok" />{f.friendly_name ?? 'Authenticator app'}</span><Button size="sm" variant="ghost" onClick={() => void unenroll(f.id)}>Remove</Button></div>
        ))}
        {mfa ? (
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <img src={mfa.qr} alt="QR code for your authenticator app" className="h-40 w-40 rounded-xl bg-white p-2" />
            <div>
              <p className="text-sm text-muted">Scan with an authenticator app, or enter the secret manually:</p>
              <code className="my-2 block break-all rounded-lg bg-raised p-2 text-xs">{mfa.secret}</code>
              <div className="flex gap-2"><Input aria-label="6-digit code" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /><Button variant="primary" loading={busy} disabled={code.length !== 6} onClick={verify}>Verify</Button></div>
            </div>
          </div>
        ) : !factors.some((f) => f.status === 'verified') && <Button icon={KeyRound} loading={busy} onClick={enroll}>Set up 2FA</Button>}
      </div>
    </Card>
  )
}

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [media, setMedia] = useState(true)
  const doExport = async () => {
    setBusy('export')
    try {
      const data = await exportBackup(media)
      downloadText(JSON.stringify(data), `basic-to-advanced-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`, 'application/json')
      toast('Backup downloaded. Store it somewhere safe — it contains your data (vault items stay encrypted).')
    } catch (e) { toast(`Backup failed: ${(e as Error).message}`, 'error') } finally { setBusy(null) }
  }
  const doImport = async (f: File) => {
    setBusy('import')
    try {
      if (f.size > 1024 * 1024 * 1024) throw new Error('File is larger than 1 GB.')
      const json = JSON.parse(await f.text())
      const r = await importBackup(json)
      toast(`Restore complete: ${r.inserted} added, ${r.updated} updated, ${r.skipped} unchanged${r.errors.length ? `, ${r.errors.length} errors` : ''}.`, r.errors.length ? 'warn' : 'success')
      if (r.errors.length) console.warn(r.errors)
    } catch (e) { toast(`Restore failed: ${(e as Error).message.includes('JSON') ? 'the file is not valid JSON' : (e as Error).message}`, 'error') } finally { setBusy(null); if (fileRef.current) fileRef.current.value = '' }
  }
  return (
    <Card><CardTitle icon={Download}>Backup & restore</CardTitle>
      <p className="mb-3 text-sm text-muted">Export everything to a JSON file. Restoring merges by item: newer versions win, nothing is deleted. Vault items remain encrypted and can only be opened with your vault passphrase.</p>
      <Toggle label="Include media files" description="Larger file; images, videos and documents are embedded." checked={media} onChange={setMedia} />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" icon={Download} loading={busy === 'export'} onClick={doExport}>Export backup</Button>
        <Button icon={Upload} loading={busy === 'import'} onClick={() => fileRef.current?.click()}>Restore from file</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f) }} />
      </div>
    </Card>
  )
}

function ActivitySection() {
  const [filter, setFilter] = useState('')
  const events = useLiveQuery(() => db.audit.orderBy('at').reverse().limit(300).toArray(), [])
  const list = events?.filter((e) => !filter || e.type.startsWith(filter))
  const bad = (t: string) => t.includes('failed')
  return (
    <Card className="lg:col-span-2"><CardTitle icon={Activity} action={
      <div className="flex gap-2">
        <Select aria-label="Filter activity" className="h-8 w-auto py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All activity</option><option value="unlock">Unlocks</option><option value="lock">Locks</option><option value="vault">Vault</option><option value="backup">Backups</option><option value="sign">Sign-in</option><option value="sync">Sync</option>
        </Select>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => { if (await confirm({ title: 'Clear activity history?', body: 'This removes the local security log.', danger: true, confirmLabel: 'Clear' })) await db.audit.clear() }}>Clear</Button>
      </div>}>Security activity</CardTitle>
      {!list?.length ? <p className="py-3 text-sm text-muted">No security events recorded yet.</p> : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted"><tr><th className="py-1 pr-3 font-medium">When</th><th className="py-1 pr-3 font-medium">Event</th><th className="py-1 font-medium">Detail</th></tr></thead>
            <tbody>{list.map((e) => (
              <tr key={e.id} className="border-t border-line/60"><td className="whitespace-nowrap py-1.5 pr-3 text-muted">{format(e.at, 'MMM d, HH:mm:ss')}</td><td className={cn('py-1.5 pr-3', bad(e.type) && 'text-danger')}>{e.type.replace(/_/g, ' ')}</td><td className="py-1.5 text-muted">{e.detail}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Stored locally on this device (last 1,000 events). Secrets, PINs and tokens are never logged.</p>
    </Card>
  )
}

export function SecurityPage() {
  const hasPin = useLiveQuery(() => db.kv.get('security.pin').then(Boolean), [])
  const hasVault = useLiveQuery(() => db.kv.get('vault.meta').then(Boolean), [])
  const { session } = authState.use()
  const persisted = useLiveQuery(async () => (await navigator.storage?.persisted?.()) ?? false, [])
  const score = [hasPin, hasVault, !!session || !cloudConfigured, persisted].filter(Boolean).length
  return (
    <div>
      <PageHeader title="Security Center" description="App lock, private vault, sessions, backups and activity." icon={ShieldCheck} tone="text-secure" />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-raised text-2xl font-bold text-secure shadow-inner">{score}/4</div>
          <ul className="grid flex-1 gap-1 text-sm sm:grid-cols-2">
            <li>{hasPin ? '✅' : '⚠️'} App lock {hasPin ? 'enabled' : 'not set'}</li>
            <li>{hasVault ? '✅' : '⚠️'} Private vault {hasVault ? 'created' : <Link className="text-accent" to="/vault">— set it up</Link>}</li>
            <li>{session ? '✅ Signed in (server-enforced access control)' : cloudConfigured ? '⚠️ Not signed in (local only)' : 'ℹ️ Local mode — cloud not configured'}</li>
            <li>{persisted ? '✅ Persistent storage granted' : 'ℹ️ Browser may evict data under storage pressure — keep backups'}</li>
          </ul>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <PinSection />
        <AccountSection />
        <BackupSection />
        <Card><CardTitle icon={AlertTriangle} tone="text-warn">What is protected (and what is not)</CardTitle>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li><b className="text-fg">Private Vault</b>: end-to-end encrypted (AES-256-GCM, key derived from your passphrase with PBKDF2). Only ciphertext is stored locally and in the cloud.</li>
            <li><b className="text-fg">App lock</b>: a privacy screen on this device. It does <i>not</i> encrypt your other local data; someone with access to this browser profile and developer tools could read it.</li>
            <li><b className="text-fg">Cloud data</b>: protected by Supabase Auth and Row Level Security on the server (each user can only access rows they own). Data is encrypted in transit (HTTPS) and at rest by the hosting provider.</li>
            <li><b className="text-fg">Web / PWA</b>: subject to the browser's storage rules; clearing site data deletes local data. <b className="text-fg">Desktop / mobile</b>: native builds can add OS keychain storage and biometrics (see docs/SECURITY.md).</li>
          </ul>
        </Card>
        <ActivitySection />
      </div>
    </div>
  )
}
