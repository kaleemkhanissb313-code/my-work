import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bookmark, Cloud, Database, Eye, EyeOff, LayoutGrid, Palette, RefreshCw, Settings as SettingsIcon, Sparkles, Trash2, User } from 'lucide-react'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { Badge, Button, Card, CardTitle, Field, IconButton, Input, PageHeader, Select, Toggle } from '@/components/ui'
import { confirm, safeWrite, toast } from '@/components/feedback'
import { ACCENTS, updateSettings, useSettings } from '@/services/settings'
import { HIDEABLE } from '@/app/nav'
import { cloudConfigured } from '@/services/supabase'
import { authState } from '@/services/auth'
import { syncNow, syncState } from '@/services/sync'
import { fileSize } from '@/lib/numbers'
import { audit } from '@/services/audit'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED', 'SAR', 'CAD', 'AUD', 'JPY', 'CNY', 'TRY', 'BDT', 'NGN', 'ZAR', 'BRL', 'MXN', 'CHF', 'SEK']

function SyncCard() {
  const { session } = authState.use()
  const st = syncState.use()
  const last = useLiveQuery(() => db.kv.get('sync.lastSyncAt').then((r) => r?.value as number | undefined), [])
  if (!cloudConfigured) return (
    <Card><CardTitle icon={Cloud}>Cloud sync</CardTitle>
      <p className="text-sm text-muted">Not configured — the app is running in local-only mode. Add Supabase credentials to enable accounts and sync (see <code>README.md</code>).</p>
    </Card>
  )
  return (
    <Card><CardTitle icon={Cloud}>Cloud sync</CardTitle>
      {!session ? <p className="text-sm text-muted"><Link to="/auth" className="text-accent">Sign in</Link> to sync your data across devices.</p> : <>
        <p className="text-sm text-muted">Last synced: {last ? new Date(last).toLocaleString() : 'never'}{st.conflicts ? ` · ${st.conflicts} conflict(s) resolved (newest edit kept; document conflicts saved as copies)` : ''}</p>
        {st.error && <p className="mt-1 text-sm text-danger" role="alert">Sync error: {st.error}</p>}
        <Button className="mt-3" variant="primary" icon={RefreshCw} loading={st.running} onClick={async () => {
          try { const r = await syncNow(); toast(`Synced — ${r.pushed} uploaded, ${r.pulled} downloaded`) } catch (e) { toast((e as Error).message, 'error', { label: 'Retry', run: () => void syncNow() }) }
        }}>Sync now</Button>
      </>}
    </Card>
  )
}

function SavedViews() {
  const views = useLiveQuery(() => db.savedViews.orderBy('createdAt').toArray(), [])
  const loc = useLocation()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [path, setPath] = useState('/tasks')
  useEffect(() => { setPath(sessionStorage.getItem('b2a-last-path') ?? '/tasks') }, [loc])
  return (
    <Card><CardTitle icon={Bookmark}>Saved views</CardTitle>
      <p className="mb-2 text-sm text-muted">Save any page address (including filters in the URL, e.g. <code>/tasks?open=…</code> or <code>/finance/expenses</code>) for one-click access.</p>
      <div className="flex flex-wrap gap-2">
        <Input aria-label="View name" placeholder="Name" className="flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Path" placeholder="/path" className="flex-1" value={path} onChange={(e) => setPath(e.target.value)} />
        <Button disabled={!name.trim() || !path.startsWith('/')} onClick={() => { void safeWrite(() => db.savedViews.add({ id: uid(), name: name.trim(), path, createdAt: Date.now() }), 'View saved'); setName('') }}>Save</Button>
      </div>
      <ul className="mt-3 space-y-1">
        {views?.map((v) => (
          <li key={v.id} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-raised">
            <button className="flex-1 text-left text-sm" onClick={() => nav(v.path)}>{v.name} <span className="text-xs text-muted">{v.path}</span></button>
            <IconButton icon={Trash2} label={`Delete view ${v.name}`} onClick={() => void db.savedViews.delete(v.id)} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function SettingsPage() {
  const s = useSettings()
  const [usage, setUsage] = useState<{ usage?: number; quota?: number } | null>(null)
  useEffect(() => { void navigator.storage?.estimate?.().then(setUsage) }, [])
  const set = (patch: Parameters<typeof updateSettings>[0]) => void safeWrite(async () => { await updateSettings(patch); await audit('settings_changed', Object.keys(patch).join(', ')) })
  const hidden = new Set(s.hiddenModules)

  return (
    <div>
      <PageHeader title="Settings" description="Profile, appearance, modules, data and integrations." icon={SettingsIcon} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle icon={User}>Profile</CardTitle>
          <Field label="Display name" htmlFor="dn"><Input id="dn" defaultValue={s.displayName} maxLength={60} onBlur={(e) => e.target.value !== s.displayName && set({ displayName: e.target.value.trim() })} /></Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Currency" htmlFor="cur"><Select id="cur" value={s.currency} onChange={(e) => set({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Week starts on" htmlFor="wk"><Select id="wk" value={s.weekStartsOn} onChange={(e) => set({ weekStartsOn: Number(e.target.value) as 0 | 1 })}><option value={1}>Monday</option><option value={0}>Sunday</option></Select></Field>
          </div>
          <p className="mt-2 text-xs text-muted">Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone} (from your device). Events store their own zone.</p>
        </Card>

        <Card><CardTitle icon={Palette}>Appearance & accessibility</CardTitle>
          <Field label="Theme" htmlFor="th"><Select id="th" value={s.theme} onChange={(e) => set({ theme: e.target.value as typeof s.theme })}><option value="dark">Dark (default)</option><option value="light">Light</option><option value="system">Match system</option></Select></Field>
          <fieldset className="mt-3">
            <legend className="label">Accent & button color</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={s.accent === a.id} onClick={() => set({ accent: a.id })}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs transition ${s.accent === a.id ? 'border-accent bg-raised font-semibold' : 'border-line hover:bg-raised/60'}`}>
                  <span className="h-8 w-full rounded-lg shadow-inner" style={{ background: `linear-gradient(180deg, ${a.swatch[0]}, ${a.swatch[1]})` }} aria-hidden />
                  {a.label}{a.id === 'teal' && <span className="text-[10px] font-normal text-muted">Default</span>}
                </button>
              ))}
              <label className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2 text-xs transition ${s.accent === 'custom' ? 'border-accent bg-raised font-semibold' : 'border-line hover:bg-raised/60'}`}>
                <input type="color" aria-label="Custom accent color" value={s.customAccent} className="h-8 w-full cursor-pointer rounded-lg border-0 bg-transparent"
                  onChange={(e) => set({ accent: 'custom', customAccent: e.target.value })} />
                Custom
              </label>
            </div>
            {s.background.kind !== 'default' && <button type="button" className="mt-2 text-xs text-accent underline" onClick={() => set({ background: { kind: 'default', value: '' } })}>Reset app background to default</button>}
          </fieldset>
          <Toggle label="Reduce motion" description="Turns off animations and transitions (the OS setting is also respected)." checked={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
          <p className="mt-2 text-xs text-muted">Keyboard: <span className="kbd">Ctrl K</span> search & commands · <span className="kbd">/</span> search · <span className="kbd">Alt N</span> document · <span className="kbd">Alt T</span> task · <span className="kbd">Alt E</span> event · <span className="kbd">Alt S</span> stopwatch · <span className="kbd">Ctrl Shift L</span> lock. Single-key shortcuts never fire while typing.</p>
        </Card>

        <Card><CardTitle icon={LayoutGrid}>Modules</CardTitle>
          <p className="mb-2 text-sm text-muted">Hide tools you don't use. Hidden modules keep their data and can be re-enabled anytime.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {HIDEABLE.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-1.5">
                <span className="flex items-center gap-2 text-sm"><m.icon className="h-4 w-4 text-muted" aria-hidden />{m.label}</span>
                <IconButton icon={hidden.has(m.id) ? EyeOff : Eye} active={!hidden.has(m.id)} label={hidden.has(m.id) ? `Show ${m.label}` : `Hide ${m.label}`}
                  onClick={() => set({ hiddenModules: hidden.has(m.id) ? s.hiddenModules.filter((x) => x !== m.id) : [...s.hiddenModules, m.id] })} />
              </li>
            ))}
          </ul>
        </Card>

        <Card><CardTitle icon={Sparkles}>AI assistance (optional)</CardTitle>
          <Toggle label="Show AI tools" description="Summaries, writing help, task breakdowns and tag suggestions in documents." checked={s.aiEnabled} onChange={(v) => set({ aiEnabled: v })} />
          <p className="text-sm text-muted">
            Status: {cloudConfigured ? <Badge tone="accent">Uses the server-side `ai` function</Badge> : <Badge tone="warn">Not configured</Badge>}. Requests run through a Supabase Edge Function that holds the API key on the server — the key is never in the browser. AI never edits your documents automatically; you choose what to insert.
          </p>
        </Card>

        <SyncCard />
        <SavedViews />

        <Card className="lg:col-span-2"><CardTitle icon={Database}>Data on this device</CardTitle>
          <p className="text-sm text-muted">Storage used: {usage?.usage != null ? `${fileSize(usage.usage)} of ~${fileSize(usage.quota ?? 0)}` : 'unknown'}. Export a backup from the <Link className="text-accent" to="/security">Security Center</Link>.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" icon={Trash2} onClick={async () => {
              const ok = await confirm({ title: 'Erase all local data?', danger: true, confirmLabel: 'Erase everything', body: <>This permanently deletes every document, task, file, setting and vault item stored in this browser. Cloud data (if any) is not affected. <b>Export a backup first.</b></> })
              if (!ok) return
              const typed = prompt('Type ERASE to confirm')
              if (typed !== 'ERASE') return toast('Cancelled', 'info')
              await db.delete(); localStorage.clear(); sessionStorage.clear(); location.href = '/'
            }}>Erase local data</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
