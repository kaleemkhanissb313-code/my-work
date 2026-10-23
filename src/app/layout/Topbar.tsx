import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle, Bell, BellRing, CalendarDays, CalendarPlus, Check, CheckCheck, CheckSquare, Clock, FileText, FolderPlus, Lock, Menu, Monitor, Moon, NotebookPen, Plus, Receipt,
  Search, Sheet, ShoppingCart, Sun, Timer, Upload, User, Wand2, Zap,
} from 'lucide-react'
import { HeaderPopover, PopoverHeading, PopoverItem } from './Popover'
import { Button, IconButton } from '@/components/ui'
import { quick } from '@/services/quick'
import { openQuickAdd } from '@/features/quickadd/QuickAdd'
import { updateSettings, useSettings } from '@/services/settings'
import { lockApp } from '@/services/security'
import { authState, auth } from '@/services/auth'
import { cloudConfigured } from '@/services/supabase'
import { useNotificationRead, useNotifications, type AppNotification } from '../useReminders'
import { createWsSheet } from '@/features/sheets/repo'
import { blankSheet } from '@/features/sheets/ops'
import { toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { db } from '@/lib/db'

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const nav = useNavigate()
  const s = useSettings()
  const { session } = authState.use()
  const notes = useNotifications()
  const { isRead, markRead } = useNotificationRead()
  const unread = notes.filter((n) => !isRead(n.id))
  const hasPin = useLiveQuery(() => db.kv.get('security.pin').then(Boolean), [])
  const cycleTheme = () => updateSettings({ theme: s.theme === 'dark' ? 'light' : s.theme === 'light' ? 'system' : 'dark' })
  const ThemeIcon = s.theme === 'dark' ? Moon : s.theme === 'light' ? Sun : Monitor

  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-1.5 border-x-0 border-t-0 px-2 sm:gap-2 sm:px-4">
      <IconButton icon={Menu} label="Open menu" className="lg:hidden" onClick={onMenu} />
      <button type="button" onClick={onSearch} className="input flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 text-start text-muted" aria-label="Search and commands (Ctrl+K)">
        <Search className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">Search everything…</span><span className="kbd hidden sm:inline-flex">Ctrl K</span>
      </button>
      <div className="ms-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <button type="button" onClick={() => openQuickAdd()} title="Smart quick add (Q)" className="btn btn-soft hidden h-9 px-3 text-sm md:inline-flex">
          <Wand2 className="h-4 w-4 text-accent" aria-hidden />Quick add<span className="kbd">Q</span>
        </button>
        <HeaderPopover label="Create new" title="Create new" icon={Plus} buttonClass="btn-3d text-white hover:text-white" width={300}>
          {(close) => <>
            <PopoverItem icon={Wand2} hint="Type it in plain words, e.g. “Pay rent tomorrow 5pm”" onClick={() => { close(); openQuickAdd() }}>Smart quick add</PopoverItem>
            <PopoverHeading>Create</PopoverHeading>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-1">
              <PopoverItem icon={CheckSquare} kbd="Alt T" onClick={() => { close(); void quick.task(nav) }}>Task</PopoverItem>
              <PopoverItem icon={FileText} kbd="Alt N" onClick={() => { close(); void quick.doc(nav) }}>Document</PopoverItem>
              <PopoverItem icon={Sheet} onClick={async () => { close(); const x = await createWsSheet('Untitled spreadsheet', blankSheet()); nav(`/sheets/${x.id}`) }}>Spreadsheet</PopoverItem>
              <PopoverItem icon={NotebookPen} onClick={() => { close(); void quick.doc(nav, 'note') }}>Note</PopoverItem>
              <PopoverItem icon={CalendarPlus} kbd="Alt E" onClick={() => { close(); void quick.event(nav) }}>Event</PopoverItem>
              <PopoverItem icon={FolderPlus} onClick={() => { close(); void quick.project(nav) }}>Project</PopoverItem>
              <PopoverItem icon={Timer} kbd="Alt S" onClick={() => { close(); void quick.timer(nav) }}>Stopwatch</PopoverItem>
            </div>
            {/* On phones the separate "Quick actions" button is hidden, so its shortcuts live here. */}
            <div className="sm:hidden">
              <PopoverHeading>Quick actions</PopoverHeading>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2">
                {QUICK_LINKS.map(([p, l, I]) => <PopoverItem key={p} icon={I} onClick={() => { close(); nav(p) }}>{l}</PopoverItem>)}
              </div>
            </div>
          </>}
        </HeaderPopover>
        <span className="hidden sm:contents">
          <HeaderPopover label="Quick actions" title="Quick actions" icon={Zap} width={280}>
            {(close) => QUICK_LINKS.map(([p, l, I]) => <PopoverItem key={p} icon={I} onClick={() => { close(); nav(p) }}>{l}</PopoverItem>)}
          </HeaderPopover>
        </span>
        <HeaderPopover label="Notifications" title="Notifications" icon={unread.length ? BellRing : Bell} badge={unread.length} width={360}>
          {(close) => <NotificationList notes={notes} isRead={isRead} markRead={markRead} onOpen={close} />}
        </HeaderPopover>
        <IconButton icon={ThemeIcon} className="max-sm:hidden" label={`Theme: ${s.theme} (click to change)`} onClick={cycleTheme} />
        {hasPin && <IconButton icon={Lock} label="Lock app (Ctrl+Shift+L)" onClick={() => void lockApp('manual')} />}
        <HeaderPopover label="Profile" title="Profile" icon={User} width={280}>
          {(close) => <>
            <div className="px-3 py-2">
              <div className="text-sm font-semibold">{s.displayName || 'Local user'}</div>
              <div className="truncate text-xs text-muted">{session?.user.email ?? (cloudConfigured ? 'Not signed in — data stays on this device' : 'Local mode (cloud not configured)')}</div>
            </div>
            <PopoverItem icon={User} onClick={() => { close(); nav('/settings') }}>Profile & settings</PopoverItem>
            {cloudConfigured && !session && <PopoverItem icon={User} onClick={() => { close(); nav('/auth') }}>Sign in / create account</PopoverItem>}
            {session && <PopoverItem icon={Lock} onClick={async () => { close(); await auth.signOut(); toast('Signed out') }}>Sign out</PopoverItem>}
            <div className="p-2"><Button size="sm" className="w-full" onClick={() => { close(); nav('/security') }}>Security Center</Button></div>
          </>}
        </HeaderPopover>
      </div>
    </header>
  )
}

const QUICK_LINKS: [string, string, typeof Zap][] = [
  ['/home/groceries', 'Grocery list', ShoppingCart], ['/finance/expenses', 'Log an expense', Receipt], ['/life/habits', 'Check in habits', Check],
  ['/life/journal', 'Write in journal', NotebookPen], ['/calculator', 'Calculator', Clock], ['/media', 'Upload media', Upload],
]

const TONE_ICON = { danger: AlertTriangle, warn: Clock, info: CalendarDays } as const

/** Notification panel: unread first, tap to open (marks it read), mark all read, desktop alerts. */
function NotificationList({ notes, isRead, markRead, onOpen }: { notes: AppNotification[]; isRead: (id: string) => boolean; markRead: (ids: string[]) => Promise<void>; onOpen: () => void }) {
  const sorted = [...notes].sort((a, b) => Number(isRead(a.id)) - Number(isRead(b.id)))
  const unread = notes.filter((n) => !isRead(n.id))
  const canAsk = 'Notification' in window && Notification.permission === 'default'
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
        <span className="text-sm text-muted">{unread.length ? `${unread.length} unread` : notes.length ? 'All read' : 'Nothing new'}</span>
        <span className="ms-auto flex gap-1">
          {unread.length > 0 && <button type="button" className="btn btn-soft h-9 px-3 text-xs" onClick={() => void markRead(notes.map((n) => n.id))}><CheckCheck className="h-4 w-4" aria-hidden />Mark all read</button>}
          {canAsk && <button type="button" className="btn btn-ghost h-9 px-3 text-xs" onClick={async () => {
            const p = await Notification.requestPermission()
            toast(p === 'granted' ? 'Alerts enabled while the app is open' : 'Notifications not allowed', p === 'granted' ? 'success' : 'warn')
          }}><BellRing className="h-4 w-4" aria-hidden />Enable alerts</button>}
        </span>
      </div>
      {notes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ok/15 text-ok"><Check className="h-6 w-6" aria-hidden /></span>
          <p className="font-medium">You're all caught up</p>
          <p className="text-xs text-muted">Overdue tasks, bills due soon and today's events appear here.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {sorted.map((n) => {
            const I = TONE_ICON[n.tone]
            const read = isRead(n.id)
            return (
              <li key={n.id} className="flex items-stretch gap-1">
                <Link to={n.path} onClick={() => { void markRead([n.id]); onOpen() }}
                  className={cn('flex min-h-[56px] min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-raised', !read && 'bg-raised/50')}>
                  <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', n.tone === 'danger' ? 'bg-danger/15 text-danger' : n.tone === 'warn' ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent')}><I className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm leading-snug', read ? 'text-muted' : 'font-semibold')}>{n.title}</span>
                    <span className="block text-xs text-muted">{n.detail}</span>
                  </span>
                  {!read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                </Link>
                {!read && <button type="button" className="btn btn-ghost w-10 shrink-0 rounded-xl" aria-label={`Mark “${n.title}” as read`} onClick={() => void markRead([n.id])}><Check className="h-4 w-4" aria-hidden /></button>}
              </li>
            )
          })}
        </ul>
      )}
      <p className="px-3 pt-3 text-[11px] text-muted">Checked while the app is open. Read items come back the next day if they still apply.</p>
    </div>
  )
}
