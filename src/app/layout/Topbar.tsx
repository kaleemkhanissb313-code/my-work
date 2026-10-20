import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell, CalendarPlus, CheckSquare, FileText, FolderPlus, Lock, Menu, Monitor, Moon, NotebookPen, Plus, Search, Sun, Timer, User, Wand2, Zap,
} from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { quick } from '@/services/quick'
import { openQuickAdd } from '@/features/quickadd/QuickAdd'
import { updateSettings, useSettings } from '@/services/settings'
import { lockApp } from '@/services/security'
import { authState, auth } from '@/services/auth'
import { cloudConfigured } from '@/services/supabase'
import { useNotifications } from '../useReminders'
import { toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { db } from '@/lib/db'

function Menu_({ label, icon, children, align = 'right', buttonClass, badge }: { label: string; icon: typeof Plus; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right'; buttonClass?: string; badge?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  const Icon = icon
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={cn('btn btn-ghost relative h-9 w-9 rounded-xl', buttonClass)}>
        <Icon className="h-4 w-4" aria-hidden />
        {!!badge && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge > 9 ? '9+' : badge}</span>}
      </button>
      {open && (
        <div role="menu" className={cn('glass absolute z-40 mt-2 w-72 rounded-2xl p-2', align === 'right' ? 'right-0' : 'left-0')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

const MenuItem = ({ icon: Icon, children, onClick, kbd }: { icon: typeof Plus; children: React.ReactNode; onClick: () => void; kbd?: string }) => (
  <button role="menuitem" type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-raised">
    <Icon className="h-4 w-4 text-muted" aria-hidden /><span className="flex-1">{children}</span>{kbd && <span className="kbd">{kbd}</span>}
  </button>
)

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const nav = useNavigate()
  const s = useSettings()
  const { session } = authState.use()
  const notes = useNotifications()
  const hasPin = useLiveQuery(() => db.kv.get('security.pin').then(Boolean), [])
  const cycleTheme = () => updateSettings({ theme: s.theme === 'dark' ? 'light' : s.theme === 'light' ? 'system' : 'dark' })
  const ThemeIcon = s.theme === 'dark' ? Moon : s.theme === 'light' ? Sun : Monitor

  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-x-0 border-t-0 px-3 sm:px-4">
      <IconButton icon={Menu} label="Open menu" className="lg:hidden" onClick={onMenu} />
      <button type="button" onClick={onSearch} className="input flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 text-left text-muted" aria-label="Search and commands (Ctrl+K)">
        <Search className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">Search everything…</span><span className="kbd hidden sm:inline-flex">Ctrl K</span>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <button type="button" onClick={() => openQuickAdd()} title="Smart quick add (Q)" className="btn btn-soft hidden h-9 px-3 text-sm md:inline-flex">
          <Wand2 className="h-4 w-4 text-accent" aria-hidden />Quick add<span className="kbd">Q</span>
        </button>
        <Menu_ label="Create new" icon={Plus} buttonClass="btn-3d text-white hover:text-white">
          {(close) => <>
            <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Create</div>
            <MenuItem icon={FileText} kbd="Alt N" onClick={() => { close(); void quick.doc(nav) }}>Document</MenuItem>
            <MenuItem icon={NotebookPen} onClick={() => { close(); void quick.doc(nav, 'note') }}>Note</MenuItem>
            <MenuItem icon={CheckSquare} kbd="Alt T" onClick={() => { close(); void quick.task(nav) }}>Task</MenuItem>
            <MenuItem icon={FolderPlus} onClick={() => { close(); void quick.project(nav) }}>Project</MenuItem>
            <MenuItem icon={CalendarPlus} kbd="Alt E" onClick={() => { close(); void quick.event(nav) }}>Event</MenuItem>
            <MenuItem icon={Timer} kbd="Alt S" onClick={() => { close(); void quick.timer(nav) }}>Start stopwatch</MenuItem>
          </>}
        </Menu_>
        <Menu_ label="Quick actions" icon={Zap}>
          {(close) => <>
            <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Quick actions</div>
            {[['/home/groceries', 'Grocery list'], ['/finance/expenses', 'Log an expense'], ['/life/habits', 'Check in habits'], ['/life/journal', 'Write in journal'], ['/calculator', 'Calculator'], ['/media', 'Upload media']].map(([p, l]) => (
              <MenuItem key={p} icon={Zap} onClick={() => { close(); nav(p) }}>{l}</MenuItem>
            ))}
          </>}
        </Menu_>
        <Menu_ label="Notifications" icon={Bell} badge={notes.length}>
          {(close) => <>
            <div className="flex items-center justify-between px-3 pb-1 pt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Notifications</span>
              {'Notification' in window && Notification.permission === 'default' && (
                <button className="text-xs text-accent hover:underline" onClick={async () => {
                  const p = await Notification.requestPermission()
                  toast(p === 'granted' ? 'Desktop notifications enabled while the app is open' : 'Notifications not allowed', p === 'granted' ? 'success' : 'warn')
                }}>Enable desktop alerts</button>
              )}
            </div>
            {notes.length === 0 ? <p className="px-3 py-4 text-sm text-muted">You're all caught up.</p> : (
              <ul className="max-h-80 overflow-y-auto">
                {notes.map((n) => (
                  <li key={n.id}><Link to={n.path} onClick={close} className="block rounded-xl px-3 py-2 text-sm hover:bg-raised">
                    <div className={cn('font-medium', n.tone === 'danger' && 'text-danger', n.tone === 'warn' && 'text-warn')}>{n.title}</div>
                    <div className="text-xs text-muted">{n.detail}</div>
                  </Link></li>
                ))}
              </ul>
            )}
            <p className="px-3 pt-2 text-[11px] text-muted">Reminders are checked while the app is open. Background push/email reminders are not enabled.</p>
          </>}
        </Menu_>
        <IconButton icon={ThemeIcon} className="max-[419px]:hidden" label={`Theme: ${s.theme} (click to change)`} onClick={cycleTheme} />
        {hasPin && <IconButton icon={Lock} label="Lock app (Ctrl+Shift+L)" onClick={() => void lockApp('manual')} />}
        <Menu_ label="Profile" icon={User}>
          {(close) => <>
            <div className="px-3 py-2">
              <div className="text-sm font-semibold">{s.displayName || 'Local user'}</div>
              <div className="truncate text-xs text-muted">{session?.user.email ?? (cloudConfigured ? 'Not signed in — data stays on this device' : 'Local mode (cloud not configured)')}</div>
            </div>
            <MenuItem icon={User} onClick={() => { close(); nav('/settings') }}>Profile & settings</MenuItem>
            {cloudConfigured && !session && <MenuItem icon={User} onClick={() => { close(); nav('/auth') }}>Sign in / create account</MenuItem>}
            {session && <MenuItem icon={Lock} onClick={async () => { close(); await auth.signOut(); toast('Signed out') }}>Sign out</MenuItem>}
            <div className="p-2"><Button size="sm" className="w-full" onClick={() => { close(); nav('/security') }}>Security Center</Button></div>
          </>}
        </Menu_>
      </div>
    </header>
  )
}
