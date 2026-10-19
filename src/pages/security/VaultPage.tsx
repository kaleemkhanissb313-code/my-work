import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { Copy, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, ShieldAlert, Trash2, Unlock } from 'lucide-react'
import { db } from '@/lib/db'
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import {
  addVaultItem, createVault, deleteVaultItem, listVaultItems, lockVault, unlockVault, updateVaultItem, vaultState,
  type DecryptedVaultItem, type VaultPlain,
} from '@/services/vault'
import { passwordStrength } from '@/lib/crypto'
import { cn } from '@/lib/cn'

const KINDS: VaultPlain['kind'][] = ['note', 'login', 'document', 'card', 'other']

function Setup() {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const st = passwordStrength(p1)
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    if (p1.length < 10) return setErr('Use at least 10 characters.')
    if (p1 !== p2) return setErr('Passphrases do not match.')
    if (!ack) return setErr('Please confirm you understand the passphrase cannot be recovered.')
    setBusy(true)
    try { await createVault(p1); toast('Vault created and unlocked') } catch (e2) { setErr((e2 as Error).message) } finally { setBusy(false) }
  }
  return (
    <Card className="mx-auto max-w-lg p-6">
      <form onSubmit={go} className="space-y-3">
        <h2 className="text-lg font-semibold">Create your private vault</h2>
        <p className="text-sm text-muted">Items are encrypted on this device with AES-256-GCM using a key derived from your vault passphrase. The passphrase is never stored or sent anywhere.</p>
        <Field label="Vault passphrase" hint={p1 ? `Strength: ${st.label}` : 'Use a long, unique passphrase (e.g. four random words).'} htmlFor="vp1">
          <Input id="vp1" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
        </Field>
        <Field label="Confirm passphrase" htmlFor="vp2"><Input id="vp2" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I understand that if I forget this passphrase, my vault contents <b>cannot be recovered</b> by anyone.</span></label>
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        <Button type="submit" variant="primary" loading={busy} className="w-full" icon={KeyRound}>Create vault</Button>
      </form>
    </Card>
  )
}

function UnlockForm() {
  const [p, setP] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await unlockVault(p); setP('') } catch (e2) { setErr((e2 as Error).message) } finally { setBusy(false) }
  }
  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <form onSubmit={go}>
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl btn-3d"><Lock className="h-6 w-6" aria-hidden /></div>
        <h2 className="text-lg font-semibold">Vault locked</h2>
        <p className="mb-3 text-sm text-muted">Enter your vault passphrase to decrypt your items on this device.</p>
        <label htmlFor="vault-pass" className="sr-only">Vault passphrase</label>
        <Input id="vault-pass" type="password" autoFocus autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} aria-invalid={!!err} />
        {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
        <Button type="submit" variant="primary" className="mt-3 w-full" icon={Unlock} loading={busy} disabled={!p}>Unlock vault</Button>
        <p className="mt-3 text-xs text-muted">Unlocking takes a moment by design (slow key derivation resists guessing).</p>
      </form>
    </Card>
  )
}

function ItemModal({ item, open, onClose, onSaved }: { item: DecryptedVaultItem | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<VaultPlain>({ title: item?.title ?? '', body: item?.body ?? '', kind: item?.kind ?? 'note' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!form.title.trim()) return setErr('Title is required.')
    setBusy(true)
    try {
      if (item) await updateVaultItem(item.id, { ...form, title: form.title.trim() }); else await addVaultItem({ ...form, title: form.title.trim() })
      toast('Encrypted and saved'); onSaved(); onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit private item' : 'New private item'} wide
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Encrypt & save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <Field label="Title" htmlFor="vt"><Input id="vt" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Type" htmlFor="vk"><Select id="vk" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as VaultPlain['kind'] })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="Content" htmlFor="vb" className="sm:col-span-2"><Textarea id="vb" className="min-h-[220px] font-mono text-[13px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
      </div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
      <p className="mt-2 text-xs text-muted">Avoid storing card numbers or bank credentials unless you accept the risk; this vault is encrypted but has not been independently audited.</p>
    </Modal>
  )
}

function VaultItems() {
  const [items, setItems] = useState<DecryptedVaultItem[] | null>(null)
  const [q, setQ] = useState('')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<DecryptedVaultItem | 'new' | null>(null)
  const count = useLiveQuery(() => db.vault.count(), [])
  const load = useCallback(async () => { try { setItems(await listVaultItems()) } catch { setItems([]) } }, [])
  useEffect(() => { void load() }, [load, count])
  const list = useMemo(() => items?.filter((i) => !q || `${i.title} ${i.body}`.toLowerCase().includes(q.toLowerCase())), [items, q])
  if (!items) return <Spinner label="Decrypting" />
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search vault" className="pl-9" placeholder="Search (decrypted in memory only)…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button variant="primary" icon={Plus} onClick={() => setEditing('new')} className="ml-auto">New private item</Button>
        <Button icon={Lock} onClick={() => { lockVault(); toast('Vault locked') }}>Lock vault</Button>
      </div>
      {!list?.length ? (
        <EmptyState icon={ShieldAlert} title={q ? 'No matching items' : 'Your vault is empty'} action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add private note</Button>}>
          Store private notes, recovery codes or sensitive documents. Contents are encrypted before they are saved.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((i) => {
            const show = revealed.has(i.id)
            return (
              <li key={i.id} className="card p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.title}</div><div className="text-xs text-muted"><Badge tone="secure">{i.kind}</Badge> · updated {format(i.updatedAt, 'PP')}</div></div>
                  <IconButton icon={show ? EyeOff : Eye} label={show ? 'Hide content' : 'Reveal content'} onClick={() => setRevealed((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n })} />
                  <IconButton icon={Copy} label="Copy content" onClick={async () => { await navigator.clipboard.writeText(i.body); toast('Copied — clipboard contents are visible to other apps', 'warn') }} />
                  <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(i)} />
                  <IconButton icon={Trash2} label="Delete permanently" onClick={async () => {
                    if (await confirm({ title: 'Delete this private item?', body: 'Vault items are deleted permanently (they are not kept in Trash).', danger: true, confirmLabel: 'Delete' })) { await deleteVaultItem(i.id); toast('Deleted'); void load() }
                  }} />
                </div>
                <pre className={cn('mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-raised p-3 font-mono text-xs', !show && 'select-none blur-sm')} aria-hidden={!show}>{show ? i.body || '(empty)' : '•'.repeat(Math.min(120, Math.max(12, i.body.length)))}</pre>
              </li>
            )
          })}
        </ul>
      )}
      <ItemModal key={editing === 'new' ? 'new' : editing?.id ?? 'x'} open={!!editing} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  )
}

export function VaultPage() {
  const exists = useLiveQuery(() => db.kv.get('vault.meta').then(Boolean), [])
  const { unlocked } = vaultState.use()
  // Lock the vault when leaving the page or hiding the tab.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') lockVault() }
    document.addEventListener('visibilitychange', onHide)
    return () => { document.removeEventListener('visibilitychange', onHide); lockVault() }
  }, [])
  return (
    <div>
      <PageHeader title="Private Vault" description="End-to-end encrypted notes and documents. Locks when you leave this page or switch tabs." icon={Lock} tone="text-secure"
        actions={unlocked ? <Badge tone="ok">Unlocked</Badge> : <Badge tone="secure">Locked</Badge>} />
      {exists === undefined ? <Spinner /> : !exists ? <Setup /> : unlocked ? <VaultItems /> : <UnlockForm />}
    </div>
  )
}
