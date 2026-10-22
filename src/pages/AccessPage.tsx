import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ClipboardList, Crown, History, KeyRound, RotateCcw, Save, Search, ShieldCheck, UserCog, Users, X } from 'lucide-react'
import { Badge, Button, Card, CardTitle, EmptyState, Input, PageHeader, Select, Spinner, Tabs } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { cloudConfigured } from '@/services/supabase'
import { authState } from '@/services/auth'
import { isAdmin, refreshAccess, useAccess } from '@/services/access'
import { accessApi, type AccessRequest, type AdminUser, type AuditRow, type Permission } from '@/services/accessApi'
import { FEATURES, featureLabel, type FeatureKey } from '@/features/access/features'
import { cn } from '@/lib/cn'
import { time12 } from '@/lib/time12'

type Tab = 'users' | 'requests' | 'audit'
const when = (iso: string) => `${new Date(iso).toLocaleDateString()} ${time12(new Date(iso))}`

export function AccessPage() {
  const access = useAccess()
  const { session } = authState.use()
  const [tab, setTab] = useState<Tab>('users')
  const [busy, setBusy] = useState(false)

  if (!cloudConfigured) return (
    <div>
      <PageHeader title="Access Control" description="Decide which features each person can use." icon={ShieldCheck} />
      <EmptyState icon={ShieldCheck} title="Single-user mode">
        This installation stores everything only on this device, so there are no other accounts to manage. Connect the Supabase backend (see README → Accounts &amp; permissions) to add users, permissions and sharing.
      </EmptyState>
    </div>
  )
  if (!session) return <EmptyState icon={KeyRound} title="Sign in to manage access" />

  const claim = async () => {
    setBusy(true)
    try { await accessApi.claimOwnership(); toast('You are now the owner of this website') } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <div>
      <PageHeader title="Access Control" description={isAdmin(access) ? 'Allow or deny each feature per user, review requests and see every change.' : 'Features you can use, and requests for the ones you cannot.'} icon={ShieldCheck}
        actions={access.role && <Badge tone="accent">{access.role === 'owner' ? 'Owner' : 'Administrator'}</Badge>} />
      {!access.ownerConfigured && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 border-warn/40">
          <Crown className="h-5 w-5 text-warn" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">No owner yet. If you are the website owner, claim ownership. This only works for the email configured on the server.</p>
          <Button variant="primary" loading={busy} onClick={() => void claim()}>Claim ownership</Button>
        </Card>
      )}
      {isAdmin(access) ? <>
        <Tabs label="Access control sections" value={tab} onChange={setTab} tabs={[{ id: 'users', label: 'Users & permissions', icon: Users }, { id: 'requests', label: 'Requests', icon: ClipboardList }, { id: 'audit', label: 'Audit log', icon: History }]} />
        {tab === 'users' && <UsersTab isOwner={access.role === 'owner'} me={session.user.id} />}
        {tab === 'requests' && <RequestsTab />}
        {tab === 'audit' && <AuditTab />}
      </> : <MyAccess />}
    </div>
  )
}

/* ---------------- Admin: users & permissions ---------------- */
function UsersTab({ isOwner, me }: { isOwner: boolean; me: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [perms, setPerms] = useState<Permission[]>([])
  const [draft, setDraft] = useState<Record<string, boolean>>({}) // key `${user}|${feature}`
  const [q, setQ] = useState('')
  const [feature, setFeature] = useState<FeatureKey | ''>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    try { const [u, p] = await Promise.all([accessApi.users(), accessApi.permissions()]); setUsers(u); setPerms(p); setErr(null) } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { void load() }, [load])

  const saved = useMemo(() => new Map(perms.map((p) => [`${p.user_id}|${p.feature}`, p.allowed])), [perms])
  const value = (u: string, f: FeatureKey) => draft[`${u}|${f}`] ?? saved.get(`${u}|${f}`) ?? false
  const changes = Object.entries(draft).filter(([k, v]) => (saved.get(k) ?? false) !== v)
  const shown = (users ?? []).filter((u) => !q.trim() || `${u.email} ${u.display_name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  const features = feature ? FEATURES.filter((f) => f.key === feature) : FEATURES

  const save = async () => {
    setSaving(true)
    let ok = 0
    try {
      for (const [k, v] of changes) { const [u, f] = k.split('|'); await accessApi.setPermission(u, f as FeatureKey, v); ok++ }
      toast(`${ok} permission change${ok === 1 ? '' : 's'} saved`)
      setDraft({})
    } catch (e) { toast(`Saved ${ok} of ${changes.length}: ${(e as Error).message}`, 'error') } finally { setSaving(false); void load() }
  }
  const setRole = async (u: AdminUser, role: 'admin' | null) => {
    if (!(await confirm({ title: role ? `Make ${u.email} an administrator?` : `Remove administrator rights from ${u.email}?`, body: role ? 'Administrators can see all users and change everyone’s permissions (except the owner and other administrators).' : 'They keep only the features you allow them below.', confirmLabel: role ? 'Make administrator' : 'Remove' }))) return
    try { await accessApi.setRole(u.id, role); toast('Role updated'); void load(); void refreshAccess() } catch (e) { toast((e as Error).message, 'error') }
  }

  if (err) return <EmptyState icon={ShieldCheck} title="Could not load users">{err}</EmptyState>
  if (!users) return <Spinner label="Loading users" />
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search users" className="ps-9" placeholder="Search by email or name…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Feature filter" value={feature} onChange={(e) => setFeature(e.target.value as FeatureKey | '')}><option value="">All features</option>{FEATURES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</Select>
      </div>
      {changes.length > 0 && (
        <div className="glass sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl p-3" role="status">
          <span className="min-w-0 flex-1 text-sm"><b>{changes.length}</b> unsaved change{changes.length === 1 ? '' : 's'}</span>
          <Button size="sm" icon={RotateCcw} onClick={() => setDraft({})}>Discard</Button>
          <Button size="sm" variant="primary" icon={Save} loading={saving} onClick={() => void save()}>Save changes</Button>
        </div>
      )}
      <ul className="space-y-3">
        {shown.map((u) => {
          const locked = u.id === me || u.role === 'owner' || (u.role === 'admin' && !isOwner)
          return (
            <li key={u.id}><Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{u.display_name || u.email}</div><div className="truncate text-xs text-muted">{u.email} · joined {new Date(u.created_at).toLocaleDateString()}</div></div>
                {u.role && <Badge tone={u.role === 'owner' ? 'secure' : 'accent'}>{u.role === 'owner' ? 'Owner' : 'Administrator'}</Badge>}
                {isOwner && u.id !== me && u.role !== 'owner' && <Button size="sm" variant="ghost" icon={UserCog} onClick={() => void setRole(u, u.role === 'admin' ? null : 'admin')}>{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</Button>}
              </div>
              {locked ? <p className="text-sm text-muted">{u.id === me ? 'You cannot change your own permissions.' : u.role === 'owner' ? 'The owner always has every feature.' : 'Only the owner can change another administrator.'}</p> : (
                <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {features.map((f) => {
                    const on = value(u.id, f.key), dirty = draft[`${u.id}|${f.key}`] !== undefined && (saved.get(`${u.id}|${f.key}`) ?? false) !== on
                    return (
                      <li key={f.key} className={cn('flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3', dirty ? 'border-accent/60 bg-accent/5' : 'border-line')}>
                        <span className="min-w-0 truncate text-sm">{f.label}</span>
                        <div role="radiogroup" aria-label={`${f.label} for ${u.email}`} className="flex shrink-0 overflow-hidden rounded-lg border border-line text-xs">
                          <button type="button" role="radio" aria-checked={on} onClick={() => setDraft((d) => ({ ...d, [`${u.id}|${f.key}`]: true }))}
                            className={cn('flex min-h-[32px] items-center gap-1 px-2.5', on ? 'bg-ok/15 font-semibold text-ok' : 'text-muted hover:bg-raised')}><Check className="h-3.5 w-3.5" aria-hidden />Allow</button>
                          <button type="button" role="radio" aria-checked={!on} onClick={() => setDraft((d) => ({ ...d, [`${u.id}|${f.key}`]: false }))}
                            className={cn('flex min-h-[32px] items-center gap-1 border-s border-line px-2.5', !on ? 'bg-danger/10 font-semibold text-danger' : 'text-muted hover:bg-raised')}><X className="h-3.5 w-3.5" aria-hidden />Deny</button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card></li>
          )
        })}
      </ul>
      {!shown.length && <p className="text-center text-sm text-muted">No users match.</p>}
      <p className="text-xs text-muted">New accounts start with no features. Changes take effect within a minute (or when the person returns to the app); the database enforces them immediately.</p>
    </div>
  )
}

/* ---------------- Admin: requests ---------------- */
function RequestsTab() {
  const [rows, setRows] = useState<AccessRequest[] | null>(null)
  const [users, setUsers] = useState<Map<string, AdminUser>>(new Map())
  const load = useCallback(async () => {
    const [r, u] = await Promise.all([accessApi.requests(), accessApi.users()])
    setRows(r); setUsers(new Map(u.map((x) => [x.id, x])))
  }, [])
  useEffect(() => { void load().catch((e) => toast((e as Error).message, 'error')) }, [load])
  const decide = async (r: AccessRequest, approve: boolean) => {
    try { await accessApi.decide(r.id, approve); toast(approve ? 'Access granted' : 'Request rejected'); void load() } catch (e) { toast((e as Error).message, 'error') }
  }
  if (!rows) return <Spinner label="Loading requests" />
  const pending = rows.filter((r) => r.status === 'pending')
  return (
    <div className="space-y-4">
      <Card><CardTitle icon={ClipboardList}>Pending ({pending.length})</CardTitle>
        {!pending.length ? <p className="text-sm text-muted">No pending requests.</p> : (
          <ul className="divide-y divide-line/60">{pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1"><div className="text-sm"><b>{users.get(r.user_id)?.email ?? 'Unknown user'}</b> wants <b>{featureLabel(r.feature)}</b></div>
                <div className="text-xs text-muted">{when(r.created_at)}{r.message && ` · “${r.message}”`}</div></div>
              <Button size="sm" variant="primary" icon={Check} onClick={() => void decide(r, true)}>Approve</Button>
              <Button size="sm" icon={X} onClick={() => void decide(r, false)}>Reject</Button>
            </li>
          ))}</ul>
        )}
      </Card>
      <Card><CardTitle icon={History}>History</CardTitle>
        <ul className="divide-y divide-line/60 text-sm">{rows.filter((r) => r.status !== 'pending').slice(0, 100).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2"><span className="min-w-0 flex-1">{users.get(r.user_id)?.email ?? 'Unknown'} · {featureLabel(r.feature)}</span>
            <Badge tone={r.status === 'approved' ? 'ok' : 'danger'}>{r.status}</Badge><span className="text-xs text-muted">{r.decided_at && when(r.decided_at)}</span></li>
        ))}</ul>
        <p className="mt-2 text-xs text-muted">To revoke access you granted earlier, set the feature to Deny in Users &amp; permissions.</p>
      </Card>
    </div>
  )
}

/* ---------------- Admin: audit ---------------- */
function AuditTab() {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [users, setUsers] = useState<Map<string, string>>(new Map())
  useEffect(() => { void Promise.all([accessApi.audit(), accessApi.users()]).then(([a, u]) => { setRows(a); setUsers(new Map(u.map((x) => [x.id, x.email]))) }).catch((e) => toast((e as Error).message, 'error')) }, [])
  if (!rows) return <Spinner label="Loading audit log" />
  const who = (id: string | null) => (id ? users.get(id) ?? 'deleted user' : '—')
  return (
    <Card><CardTitle icon={History}>Permission changes</CardTitle>
      {!rows.length ? <p className="text-sm text-muted">No changes yet.</p> : (
        <ul className="divide-y divide-line/60 text-sm">{rows.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-2 py-2"><span className="text-xs text-muted">{when(r.at)}</span>
            <span className="min-w-0 flex-1"><b>{who(r.actor)}</b> · {r.action.replace(/_/g, ' ')}{r.feature && ` · ${featureLabel(r.feature as FeatureKey)}`}{r.target && r.target !== r.actor && <> → {who(r.target)}</>}{r.detail && <span className="text-muted"> · {r.detail}</span>}</span></li>
        ))}</ul>
      )}
    </Card>
  )
}

/* ---------------- Everyone: my access ---------------- */
function MyAccess() {
  const access = useAccess()
  const [reqs, setReqs] = useState<AccessRequest[]>([])
  const load = useCallback(() => accessApi.requests().then(setReqs).catch(() => setReqs([])), [])
  useEffect(() => { void load() }, [load])
  const request = async (f: FeatureKey) => { try { await accessApi.requestAccess(f); toast('Request sent'); void load() } catch (e) { toast((e as Error).message, 'error') } }
  return (
    <Card><CardTitle icon={KeyRound}>My access</CardTitle>
      <ul className="grid gap-1.5 sm:grid-cols-2">{FEATURES.map((f) => {
        const has = access.features.has(f.key)
        const pending = reqs.some((r) => r.feature === f.key && r.status === 'pending')
        return (
          <li key={f.key} className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-line px-3">
            <span className="min-w-0 truncate text-sm">{f.label}</span>
            {has ? <Badge tone="ok">Allowed</Badge> : pending ? <Badge tone="warn">Requested</Badge> : <Button size="sm" onClick={() => void request(f.key)}>Request</Button>}
          </li>
        )
      })}</ul>
    </Card>
  )
}
