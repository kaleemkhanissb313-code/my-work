import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, Copy, Eye, Inbox, Link2, Lock, Plus, Share2, ShieldCheck, UserRound } from 'lucide-react'
import { Badge, Button, Card, CardTitle, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { db } from '@/lib/db'
import { cloudConfigured } from '@/services/supabase'
import { authState } from '@/services/auth'
import { can, useAccess } from '@/services/access'
import { syncNow } from '@/services/sync'
import { accessApi, shareLink, shareStatus, type Share, type SharedWithMe, type ShareTable } from '@/services/accessApi'
import { SHAREABLE } from '@/features/access/features'
import { time12 } from '@/lib/time12'

const when = (iso: string) => `${new Date(iso).toLocaleDateString()} ${time12(new Date(iso))}`
const kindLabel = (t: ShareTable) => SHAREABLE.find((s) => s.table === t)?.label ?? t

export function PrivacyPage() {
  const access = useAccess()
  const { session } = authState.use()
  const [mine, setMine] = useState<Share[] | null>(null)
  const [withMe, setWithMe] = useState<SharedWithMe[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    try { const [a, b] = await Promise.all([accessApi.myShares(), accessApi.sharedWithMe()]); setMine(a); setWithMe(b); setErr(null) } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { if (cloudConfigured && session) void load() }, [load, session])

  const header = <PageHeader title="Privacy & Sharing" description="Everything is private by default. Share one item at a time, with one person or by link, and revoke whenever you want." icon={ShieldCheck} />
  if (!cloudConfigured) return (
    <div>{header}
      <Card className="flex items-start gap-3"><Lock className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
        <div className="text-sm"><b>Private.</b> This installation keeps all your data only on this device — nobody who opens the website address can see it.
          Sharing with other people needs the cloud backend (see README → Accounts &amp; permissions).</div></Card>
    </div>
  )
  if (!session) return <div>{header}<EmptyState icon={Lock} title="Sign in to manage sharing" /></div>

  const active = (mine ?? []).filter((s) => shareStatus(s) === 'active')
  const revoke = async (s: Share) => {
    if (!(await confirm({ title: `Stop sharing “${s.item_title || 'item'}”?`, body: s.is_link ? 'The link stops working immediately for everyone who has it.' : `${s.recipient_email} loses access immediately.`, danger: true, confirmLabel: 'Revoke' }))) return
    try { await accessApi.revokeShare(s.id); toast('Access revoked'); void load() } catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <div className="space-y-4">
      {header}
      <Card className="flex flex-wrap items-center gap-3">
        <Lock className="h-5 w-5 shrink-0 text-ok" aria-hidden />
        <p className="min-w-0 flex-1 text-sm"><b>Your workspace is private.</b> Sharing the website address shows visitors only a sign-in page. {active.length ? <>You currently share <b>{active.length}</b> item{active.length === 1 ? '' : 's'}.</> : 'Nothing is shared right now.'}</p>
        {can('sharing', access) ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Share an item</Button>
          : <Link to="/access" className="btn btn-soft h-10 px-4 text-sm">Request sharing permission</Link>}
      </Card>
      {err && <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{err}</p>}

      <Card><CardTitle icon={Share2}>What I share</CardTitle>
        {!mine ? <Spinner /> : !mine.length ? <p className="text-sm text-muted">You haven't shared anything.</p> : (
          <ul className="divide-y divide-line/60">{mine.map((s) => {
            const st = shareStatus(s)
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5">
                {s.is_link ? <Link2 className="h-4 w-4 shrink-0 text-muted" aria-label="Link" /> : <UserRound className="h-4 w-4 shrink-0 text-muted" aria-label="Person" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.item_title || 'Untitled'} <span className="font-normal text-muted">· {kindLabel(s.item_table)}</span></div>
                  <div className="truncate text-xs text-muted">{s.is_link ? 'Anyone with the link · view only' : `${s.recipient_email} · ${s.permission === 'editor' ? 'can edit' : 'can view'}`}
                    {s.expires_at && ` · ${st === 'expired' ? 'expired' : 'expires'} ${when(s.expires_at)}`}{s.last_accessed_at && ` · last opened ${when(s.last_accessed_at)}`}</div>
                </div>
                <Badge tone={st === 'active' ? 'ok' : st === 'expired' ? 'warn' : 'muted'}>{st === 'active' ? 'Shared' : st === 'expired' ? 'Expired' : 'Revoked'}</Badge>
                {st === 'active' && <Button size="sm" icon={Ban} onClick={() => void revoke(s)}>Revoke</Button>}
              </li>
            )
          })}</ul>
        )}
      </Card>

      <Card><CardTitle icon={Inbox}>Shared with me</CardTitle>
        {!withMe ? <Spinner /> : !withMe.length ? <p className="text-sm text-muted">Nothing has been shared with you.</p> : (
          <ul className="divide-y divide-line/60">{withMe.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{s.item_title || 'Untitled'}</div>
                <div className="truncate text-xs text-muted">From {s.owner_name} · {kindLabel(s.item_table)} · {s.permission === 'editor' ? 'you can edit' : 'view only'}{s.expires_at && ` · until ${when(s.expires_at)}`}</div></div>
              <Link to={`/shared/${s.id}`} className="btn btn-soft h-9 px-3 text-sm"><Eye className="h-4 w-4" aria-hidden />Open</Link>
            </li>
          ))}</ul>
        )}
      </Card>
      {creating && <ShareDialog onClose={() => setCreating(false)} onDone={() => void load()} />}
    </div>
  )
}

function useItems(table: ShareTable) {
  return useLiveQuery(async () => {
    const live = <T extends { deletedAt: number | null }>(x: T[]) => x.filter((r) => !r.deletedAt)
    switch (table) {
      case 'docs': return live(await db.docs.toArray()).map((d) => ({ id: d.id, label: d.title || 'Untitled' }))
      case 'records': return live(await db.records.toArray()).map((r) => ({ id: r.id, label: `${r.title || 'Untitled'} (${r.collection})` }))
      case 'projects': return live(await db.projects.toArray()).map((p) => ({ id: p.id, label: p.name || 'Untitled' }))
      case 'tasks': return live(await db.tasks.toArray()).map((t) => ({ id: t.id, label: t.title || 'Untitled' }))
      case 'events': return live(await db.events.toArray()).map((e) => ({ id: e.id, label: e.title || 'Untitled' }))
      case 'datasets': return live(await db.datasets.toArray()).map((d) => ({ id: d.id, label: d.name || 'Untitled' }))
    }
  }, [table])
}

export function ShareDialog({ onClose, onDone, initial }: { onClose: () => void; onDone?: () => void; initial?: { table: ShareTable; id: string } }) {
  const [table, setTable] = useState<ShareTable>(initial?.table ?? 'docs')
  const items = useItems(table)
  const [itemId, setItemId] = useState(initial?.id ?? '')
  const [mode, setMode] = useState<'person' | 'link'>('person')
  const [email, setEmail] = useState('')
  const [perm, setPerm] = useState<'viewer' | 'editor'>('viewer')
  const [expiry, setExpiry] = useState<'none' | '1' | '7' | '30'>('none')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const sorted = useMemo(() => [...(items ?? [])].sort((a, b) => a.label.localeCompare(b.label)), [items])

  const create = async () => {
    setErr(null)
    if (!itemId) return setErr('Choose the item to share.')
    if (mode === 'person' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('Enter the person’s email address.')
    setBusy(true)
    try {
      await syncNow().catch(() => undefined) // make sure the server has the latest copy of the item
      const expiresAt = expiry === 'none' ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString()
      const r = await accessApi.createShare(table, itemId, mode === 'person' ? email.trim() : null, mode === 'person' ? perm : 'viewer', expiresAt)
      onDone?.()
      if (r.token) setLink(shareLink(r.token))
      else { toast(`Shared with ${email.trim()}. They'll see it under “Shared with me” after signing in with that email.`); onClose() }
    } catch (e) { setErr(/Item not found/.test((e as Error).message) ? 'This item has not been synced to your account yet. Sync, then try again.' : (e as Error).message) } finally { setBusy(false) }
  }

  if (link) return (
    <Modal open onClose={onClose} title="Link created" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className="mb-2 text-sm">Anyone with this link can <b>view</b> this one item{expiry !== 'none' && ` for ${expiry} day${expiry === '1' ? '' : 's'}`}. It is shown only once — copy it now. You can revoke it any time.</p>
      <div className="flex gap-2"><Input readOnly value={link} aria-label="Share link" onFocus={(e) => e.target.select()} />
        <Button icon={Copy} onClick={() => void navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast('Copy blocked — select the link and copy it manually', 'warn'))}>Copy</Button></div>
    </Modal>
  )
  return (
    <Modal open onClose={onClose} title="Share an item" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Share2} loading={busy} onClick={() => void create()}>Share</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="sh-t"><Select id="sh-t" value={table} onChange={(e) => { setTable(e.target.value as ShareTable); setItemId('') }}>{SHAREABLE.map((s) => <option key={s.table} value={s.table}>{s.label}</option>)}</Select></Field>
        <Field label="Item" htmlFor="sh-i"><Select id="sh-i" value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Choose…</option>{sorted.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</Select></Field>
        <fieldset className="sm:col-span-2"><legend className="label">Who can access it</legend>
          <div className="grid grid-cols-2 gap-2">
            {([['person', 'A specific person', UserRound], ['link', 'Anyone with the link', Link2]] as const).map(([id, label, Icon]) => (
              <label key={id} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${mode === id ? 'border-accent bg-accent/10 font-semibold' : 'border-line'}`}>
                <input type="radio" name="sh-mode" checked={mode === id} onChange={() => setMode(id)} className="sr-only" /><Icon className="h-4 w-4" aria-hidden />{label}</label>
            ))}
          </div>
        </fieldset>
        {mode === 'person' && <>
          <Field label="Their email" htmlFor="sh-e" hint="They must sign in with this exact, verified email."><Input id="sh-e" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Permission" htmlFor="sh-p"><Select id="sh-p" value={perm} onChange={(e) => setPerm(e.target.value as 'viewer' | 'editor')}><option value="viewer">Can view</option><option value="editor">Can edit</option></Select></Field>
        </>}
        <Field label="Expires" htmlFor="sh-x" className={mode === 'link' ? 'sm:col-span-2' : undefined}><Select id="sh-x" value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)}><option value="none">Never (until revoked)</option><option value="1">After 1 day</option><option value="7">After 7 days</option><option value="30">After 30 days</option></Select></Field>
      </div>
      <p className="mt-3 text-xs text-muted">Only this one item is shared — never your account, dashboard or other data. Links are always view-only.</p>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </Modal>
  )
}
