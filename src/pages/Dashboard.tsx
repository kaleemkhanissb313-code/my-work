import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { addDays, format, startOfWeek } from 'date-fns'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle, ArrowDown, ArrowUp, Banknote, Briefcase, Calculator, CalendarDays, CheckSquare, Eye, EyeOff, FileText, FolderKanban,
  Heart, Home, Image, LayoutGrid, Link2, Pause, Play, ShieldCheck, Sparkles, Timer, Wand2, Wrench, Zap, BellRing, ChevronDown, ChevronRight, ChevronUp, Gem, NotebookPen, Sheet,
} from 'lucide-react'
import { db } from '@/lib/db'
import { Badge, Button, Card, CardTitle, EmptyState, IconButton, Modal, Progress } from '@/components/ui'
import { DASHBOARD_WIDGETS, updateSettings, useSettings } from '@/services/settings'
import { tasksRepo } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { quick } from '@/services/quick'
import { openQuickAdd } from '@/features/quickadd/QuickAdd'
import { expandOccurrences, fmtDate, fmtDuration, fmtHours, nextOccurrence, toISODate, todayISO } from '@/lib/dates'
import { elapsedMs, pause, start } from '@/lib/timer'
import { evaluate, formatResult, MathError } from '@/lib/mathParser'
import { AREA_LABEL, PRIORITY_TONE, money } from '@/lib/format'
import { cloudConfigured } from '@/services/supabase'
import { authState } from '@/services/auth'
import { vaultState } from '@/services/vault'
import { cn } from '@/lib/cn'
import { clock12 } from '@/lib/time12'
import { can, useAccess } from '@/services/access'
import type { Task } from '@/types/models'
import { useNotificationRead, useNotifications } from '@/app/useReminders'

const PRI: Record<Task['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 }

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return now
}

function TaskRow({ t }: { t: Task }) {
  const today = todayISO()
  const complete = async () => {
    await safeWrite(() => tasksRepo.update(t.id, { status: 'completed', completedAt: Date.now() }))
    if (t.recurrence && t.dueDate) {
      const next = nextOccurrence(t.dueDate, t.recurrence)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, updatedAt, version, syncedAt, ...rest } = t
      if (next) await safeWrite(() => tasksRepo.create({ ...rest, status: 'todo', completedAt: null, dueDate: next, subtasks: t.subtasks.map((s) => ({ ...s, done: false })), tags: [...t.tags] }))
    }
    toast('Task completed', 'success', { label: 'Undo', run: () => void tasksRepo.update(t.id, { status: 'todo', completedAt: null }) })
  }
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-raised/60">
      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" aria-label={`Complete ${t.title}`} checked={false} onChange={() => void complete()} />
      <Link to={`/tasks?open=${t.id}`} className="min-w-0 flex-1 truncate text-sm">{t.title}</Link>
      {t.priority !== 'medium' && <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>}
      {t.dueDate && t.dueDate < today && <span className="text-xs text-danger">{fmtDate(t.dueDate, 'MMM d')}</span>}
    </li>
  )
}

function TaskList({ tasks, empty }: { tasks: Task[] | undefined; empty: string }) {
  if (!tasks) return <p className="text-sm text-muted">Loading…</p>
  if (!tasks.length) return <p className="py-3 text-sm text-muted">{empty}</p>
  return <ul className="-mx-2 space-y-0.5">{tasks.slice(0, 7).map((t) => <TaskRow key={t.id} t={t} />)}</ul>
}

/* ---------------- Widgets ---------------- */
function useOpenTasks() {
  return useLiveQuery(() => db.tasks.filter((t) => !t.deletedAt && !t.archived && t.status !== 'completed').toArray(), [])
}

function TodayWidget() {
  const tasks = useOpenTasks()
  const today = todayISO()
  const list = tasks?.filter((t) => t.dueDate === today || (t.startDate && t.startDate <= today && (!t.dueDate || t.dueDate >= today))).sort((a, b) => PRI[a.priority] - PRI[b.priority])
  return <Card><CardTitle icon={CheckSquare} action={<Link to="/tasks" className="text-xs text-accent">All tasks</Link>}>Today's tasks</CardTitle><TaskList tasks={list} empty="Nothing due today. Enjoy the focus time." /></Card>
}
function AreaTasksWidget({ area }: { area: 'work' | 'home' }) {
  const tasks = useOpenTasks()
  const today = todayISO()
  const list = tasks?.filter((t) => t.area === area && (!t.dueDate || t.dueDate <= today)).sort((a, b) => PRI[a.priority] - PRI[b.priority] || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'))
  const chores = useLiveQuery(() => area === 'home' ? db.records.where('collection').equals('chores').filter((r) => !r.deletedAt && !r.archived && !r.done && !!r.dueDate && r.dueDate <= todayISO()).count() : Promise.resolve(0), [area])
  return (
    <Card>
      <CardTitle icon={area === 'work' ? Briefcase : Home} tone={area === 'work' ? 'text-work' : 'text-home'} action={<Link to={`/${area}`} className="text-xs text-accent">Open {area}</Link>}>
        {area === 'work' ? "Today's work priorities" : "Today's home tasks"}
      </CardTitle>
      <TaskList tasks={list} empty={area === 'work' ? 'No work priorities for today.' : 'No home tasks due.'} />
      {area === 'home' && !!chores && <Link to="/home/chores" className="mt-2 block text-xs text-home">{chores} chore{chores > 1 ? 's' : ''} due — open chores</Link>}
    </Card>
  )
}
function OverdueWidget() {
  const tasks = useOpenTasks()
  const list = tasks?.filter((t) => t.dueDate && t.dueDate < todayISO()).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
  return <Card><CardTitle icon={AlertTriangle} tone="text-danger">Overdue tasks {list?.length ? <Badge tone="danger">{list.length}</Badge> : null}</CardTitle><TaskList tasks={list} empty="No overdue tasks. 🎉" /></Card>
}
function DeadlinesWidget() {
  const data = useLiveQuery(async () => {
    const today = todayISO(), end = toISODate(addDays(new Date(), 14))
    const tasks = (await db.tasks.toArray()).filter((t) => !t.deletedAt && t.status !== 'completed' && t.dueDate && t.dueDate >= today && t.dueDate <= end).map((t) => ({ id: t.id, title: t.title, date: t.dueDate!, path: `/tasks?open=${t.id}`, kind: t.isMilestone ? 'Milestone' : 'Task' }))
    const projects = (await db.projects.toArray()).filter((p) => !p.deletedAt && p.status !== 'completed' && p.deadline && p.deadline >= today && p.deadline <= toISODate(addDays(new Date(), 30))).map((p) => ({ id: p.id, title: p.name, date: p.deadline!, path: `/projects/${p.id}`, kind: 'Project' }))
    return [...tasks, ...projects].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
  }, [])
  return (
    <Card><CardTitle icon={CalendarDays}>Upcoming deadlines</CardTitle>
      {!data?.length ? <p className="py-3 text-sm text-muted">No deadlines in the next two weeks.</p> : (
        <ul className="space-y-1.5">{data.map((d) => (
          <li key={d.kind + d.id} className="flex items-center gap-2 text-sm"><span className="w-14 shrink-0 text-xs text-muted">{fmtDate(d.date, 'EEE d')}</span><Link to={d.path} className="min-w-0 flex-1 truncate hover:text-accent">{d.title}</Link><Badge>{d.kind}</Badge></li>
        ))}</ul>
      )}
    </Card>
  )
}
function EventsWidget() {
  const data = useLiveQuery(async () => {
    const today = todayISO(), end = toISODate(addDays(new Date(), 7))
    const out: { key: string; title: string; date: string; time: string; path: string }[] = []
    for (const e of (await db.events.toArray()).filter((x) => !x.deletedAt)) {
      const d0 = e.allDay ? e.start.slice(0, 10) : toISODate(new Date(e.start))
      for (const d of expandOccurrences(d0, e.recurrence, today, end, 10)) out.push({ key: e.id + d, title: e.title, date: d, time: e.allDay ? 'All day' : format(new Date(e.start), 'HH:mm'), path: `/calendar?date=${d}` })
    }
    for (const r of (await db.records.where('collection').equals('importantDates').toArray()).filter((x) => !x.deletedAt && x.dueDate)) {
      for (const d of expandOccurrences(r.dueDate!, r.recurrence, today, end, 3)) out.push({ key: r.id + d, title: `🎉 ${r.title}`, date: d, time: r.category || 'Date', path: `/life/dates?open=${r.id}` })
    }
    return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 8)
  }, [])
  return (
    <Card><CardTitle icon={CalendarDays} action={<Link to="/calendar" className="text-xs text-accent">Calendar</Link>}>Upcoming events</CardTitle>
      {!data?.length ? <p className="py-3 text-sm text-muted">No events this week.</p> : (
        <ul className="space-y-1.5">{data.map((e) => (
          <li key={e.key}><Link to={e.path} className="flex items-center gap-2 text-sm hover:text-accent"><span className="w-14 shrink-0 text-xs text-muted">{fmtDate(e.date, 'EEE d')}</span><span className="min-w-0 flex-1 truncate">{e.title}</span><span className="text-xs text-muted">{e.time}</span></Link></li>
        ))}</ul>
      )}
    </Card>
  )
}
function ProjectsWidget() {
  const data = useLiveQuery(async () => {
    const projects = (await db.projects.toArray()).filter((p) => !p.deletedAt && !p.archived && (p.status === 'active' || p.status === 'planning'))
    const tasks = (await db.tasks.toArray()).filter((t) => !t.deletedAt)
    return projects.map((p) => {
      const ts = tasks.filter((t) => t.projectId === p.id)
      const done = ts.filter((t) => t.status === 'completed').length
      return { p, total: ts.length, pct: ts.length ? (done / ts.length) * 100 : 0 }
    }).sort((a, b) => (a.p.deadline ?? '9').localeCompare(b.p.deadline ?? '9')).slice(0, 5)
  }, [])
  return (
    <Card><CardTitle icon={FolderKanban} action={<Link to="/projects" className="text-xs text-accent">Projects</Link>}>Project progress</CardTitle>
      {!data?.length ? <p className="py-3 text-sm text-muted">No active projects. <Link className="text-accent" to="/projects">Create one</Link>.</p> : (
        <ul className="space-y-3">{data.map(({ p, pct, total }) => (
          <li key={p.id}><Link to={`/projects/${p.id}`} className="block">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} /><span className="truncate">{p.name}</span></span><span className="text-xs text-muted">{total ? `${Math.round(pct)}%` : 'no tasks'}</span></div>
            <Progress value={pct} label={`${p.name} progress`} />
          </Link></li>
        ))}</ul>
      )}
    </Card>
  )
}
function HabitsWidget() {
  const data = useLiveQuery(async () => {
    const habits = (await db.records.where('collection').equals('habits').toArray()).filter((h) => !h.deletedAt && !h.archived)
    const today = todayISO()
    const logs = await db.habitLogs.where('date').equals(today).toArray()
    return habits.map((h) => ({ h, done: logs.some((l) => l.habitId === h.id && l.done && !l.deletedAt) }))
  }, [])
  const done = data?.filter((d) => d.done).length ?? 0
  return (
    <Card><CardTitle icon={Heart} tone="text-life" action={<Link to="/life/habits" className="text-xs text-accent">Check in</Link>}>Habit completion</CardTitle>
      {!data?.length ? <p className="py-3 text-sm text-muted">No habits yet. <Link className="text-accent" to="/life/habits">Add a habit</Link>.</p> : <>
        <div className="mb-2 flex items-baseline gap-2"><span className="text-2xl font-bold">{done}/{data.length}</span><span className="text-sm text-muted">done today</span></div>
        <Progress value={(done / data.length) * 100} label="Habits completed today" />
        <ul className="mt-3 flex flex-wrap gap-1.5">{data.map(({ h, done: d }) => <Badge key={h.id} tone={d ? 'ok' : 'muted'}>{d ? '✓ ' : ''}{h.title}</Badge>)}</ul>
      </>}
    </Card>
  )
}
function RecordsDueWidget({ collection, title, icon, path, days }: { collection: 'maintenance' | 'bills'; title: string; icon: typeof Wrench; path: string; days: number }) {
  const s = useSettings()
  const data = useLiveQuery(async () => {
    const end = toISODate(addDays(new Date(), days))
    return (await db.records.where('collection').equals(collection).toArray()).filter((r) => !r.deletedAt && !r.archived && !r.done && r.dueDate && r.dueDate <= end).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
  }, [collection, days])
  const total = data?.reduce((a, r) => a + (r.amount ?? 0), 0) ?? 0
  const today = todayISO()
  return (
    <Card><CardTitle icon={icon} tone="text-home" action={<Link to={path} className="text-xs text-accent">Open</Link>}>{title}</CardTitle>
      {!data?.length ? <p className="py-3 text-sm text-muted">Nothing due in the next {days} days.</p> : <>
        <ul className="space-y-1.5">{data.slice(0, 6).map((r) => (
          <li key={r.id}><Link to={`${path}?open=${r.id}`} className="flex items-center gap-2 text-sm hover:text-accent">
            <span className={cn('w-14 shrink-0 text-xs', r.dueDate! < today ? 'font-semibold text-danger' : 'text-muted')}>{fmtDate(r.dueDate, 'MMM d')}</span>
            <span className="min-w-0 flex-1 truncate">{r.title}</span>{r.amount != null && <span className="tabular-nums">{money(r.amount, s.currency)}</span>}
          </Link></li>
        ))}</ul>
        {collection === 'bills' && <p className="mt-2 text-end text-xs text-muted">Total: <b className="text-fg">{money(total, s.currency)}</b></p>}
      </>}
    </Card>
  )
}
function RecentDocsWidget() {
  const docs = useLiveQuery(() => db.docs.orderBy('updatedAt').reverse().filter((d) => !d.deletedAt && !d.isTemplate).limit(6).toArray(), [])
  return (
    <Card><CardTitle icon={FileText} action={<Link to="/documents" className="text-xs text-accent">Documents</Link>}>Recent documents</CardTitle>
      {!docs?.length ? <p className="py-3 text-sm text-muted">No documents yet.</p> : (
        <ul className="space-y-1.5">{docs.map((d) => (
          <li key={d.id}><Link to={`/${d.kind === 'note' ? 'notes' : 'documents'}/${d.id}`} className="flex items-center gap-2 text-sm hover:text-accent">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /><span className="min-w-0 flex-1 truncate">{d.title || 'Untitled'}</span><span className="text-xs text-muted">{format(d.updatedAt, 'MMM d')}</span>
          </Link></li>
        ))}</ul>
      )}
    </Card>
  )
}
function RecentMediaWidget() {
  const media = useLiveQuery(() => db.media.orderBy('updatedAt').reverse().filter((m) => !m.deletedAt).limit(6).toArray(), [])
  return (
    <Card><CardTitle icon={Image} action={<Link to="/media" className="text-xs text-accent">Library</Link>}>Recent media</CardTitle>
      {!media?.length ? <p className="py-3 text-sm text-muted">No uploads yet.</p> : (
        <div className="grid grid-cols-3 gap-2">{media.map((m) => (
          <Link key={m.id} to={`/media?open=${m.id}`} className="aspect-square overflow-hidden rounded-xl bg-raised" title={m.name}>
            {m.thumbnail ? <img loading="lazy" decoding="async" src={m.thumbnail} alt={m.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center p-1 text-center text-[10px] text-muted">{m.name}</div>}
          </Link>
        ))}</div>
      )}
    </Card>
  )
}
function LinksWidget() {
  const links = useLiveQuery(() => db.bookmarks.filter((b) => !b.deletedAt && !b.archived && b.favorite).limit(8).toArray(), [])
  return (
    <Card><CardTitle icon={Link2} action={<Link to="/links" className="text-xs text-accent">Links</Link>}>Favorite links</CardTitle>
      {!links?.length ? <p className="py-3 text-sm text-muted">Star a bookmark to see it here.</p> : (
        <ul className="space-y-1.5">{links.map((b) => (
          <li key={b.id}><a href={b.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm hover:text-accent">{b.title || b.url}</a></li>
        ))}</ul>
      )}
    </Card>
  )
}
function TimerWidget() {
  const timers = useLiveQuery(() => db.timers.orderBy('createdAt').reverse().toArray(), [])
  const now = useNow(500)
  const nav = useNavigate()
  const week = useLiveQuery(async () => {
    const from = startOfWeek(new Date(), { weekStartsOn: 1 }).getTime()
    const s = await db.timerSessions.where('startedAt').aboveOrEqual(from).toArray()
    return s.filter((x) => !x.deletedAt).reduce((a, x) => a + x.durationMs, 0)
  }, [])
  const t = timers?.[0]
  return (
    <Card><CardTitle icon={Timer} action={<Link to="/time" className="text-xs text-accent">Time tools</Link>}>Timer & time tracking</CardTitle>
      {t ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><div className="truncate text-xs text-muted">{t.name}</div><div className="font-mono text-3xl font-bold tabular-nums">{fmtDuration(t.targetMs ? Math.max(0, t.targetMs - elapsedMs(t, now)) : elapsedMs(t, now))}</div></div>
          <Button variant="primary" icon={t.startedAt ? Pause : Play} aria-label={t.startedAt ? 'Pause timer' : 'Start timer'}
            onClick={() => void db.timers.put(t.startedAt ? pause(t) : start(t))}>{t.startedAt ? 'Pause' : 'Start'}</Button>
        </div>
      ) : <Button variant="primary" icon={Play} onClick={() => void quick.timer(nav)}>Start a stopwatch</Button>}
      <p className="mt-3 text-sm text-muted">Tracked this week: <b className="text-fg">{fmtHours(week ?? 0)}</b></p>
    </Card>
  )
}
function CalcWidget() {
  const [expr, setExpr] = useState('')
  let out = '', err = ''
  try { if (expr.trim()) out = formatResult(evaluate(expr)) } catch (e) { err = e instanceof MathError ? e.message : 'Invalid expression' }
  return (
    <Card><CardTitle icon={Calculator} action={<Link to="/calculator" className="text-xs text-accent">Full calculator</Link>}>Quick calculator</CardTitle>
      <label htmlFor="qc" className="sr-only">Expression</label>
      <input id="qc" className="input font-mono" placeholder="e.g. (1200*0.15)+sqrt(81)" value={expr} onChange={(e) => setExpr(e.target.value)} />
      <div className="mt-2 min-h-7 text-end font-mono text-xl font-semibold tabular-nums" aria-live="polite">{err ? <span className="text-sm text-danger">{err}</span> : out && `= ${out}`}</div>
    </Card>
  )
}
function ChartWidget() {
  const data = useLiveQuery(async () => {
    const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(new Date(), i - 6)))
    const tasks = (await db.tasks.toArray()).filter((t) => !t.deletedAt && t.completedAt)
    const sessions = (await db.timerSessions.where('startedAt').aboveOrEqual(addDays(new Date(), -7).getTime()).toArray()).filter((s) => !s.deletedAt)
    return days.map((d) => ({
      day: fmtDate(d, 'EEE'),
      completed: tasks.filter((t) => toISODate(new Date(t.completedAt!)) === d).length,
      hours: +(sessions.filter((s) => toISODate(new Date(s.startedAt)) === d).reduce((a, s) => a + s.durationMs, 0) / 3_600_000).toFixed(2),
    }))
  }, [])
  const empty = data?.every((d) => !d.completed && !d.hours)
  return (
    <Card className="lg:col-span-2"><CardTitle icon={Sparkles}>Productivity — last 7 days</CardTitle>
      {!data ? null : empty ? <p className="py-6 text-center text-sm text-muted">Complete tasks or track time to see your productivity chart. (No sample data is shown.)</p> : (
        <div className="h-48" role="img" aria-label="Bar chart of tasks completed and hours tracked per day for the last 7 days">
          <ResponsiveContainer>
            <BarChart data={data}>
              <XAxis dataKey="day" stroke="rgb(var(--muted))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--muted))" fontSize={12} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12 }} cursor={{ fill: 'rgb(var(--raised))' }} />
              <Bar dataKey="completed" name="Tasks completed" fill="rgb(var(--accent))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="hours" name="Hours tracked" fill="rgb(var(--accent2))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
function QuickWidget() {
  const nav = useNavigate()
  const items: [string, typeof Zap, () => void][] = [
    ['New task', CheckSquare, () => void quick.task(nav)], ['New document', FileText, () => void quick.doc(nav)], ['New event', CalendarDays, () => void quick.event(nav)],
    ['Log expense', Banknote, () => nav('/finance/expenses')], ['Grocery list', Home, () => nav('/home/groceries')], ['Journal', Heart, () => nav('/life/journal')],
  ]
  return (
    <Card><CardTitle icon={Zap}>Quick actions</CardTitle>
      <form className="relative mb-3" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('qa'); openQuickAdd(String(v ?? '')); e.currentTarget.reset() }}>
        <Wand2 className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" aria-hidden />
        <input name="qa" className="input ps-9" aria-label="Smart quick add" placeholder="Pay rent tomorrow 5pm #bills…" />
      </form>
      <div className="grid grid-cols-2 gap-2">{items.map(([l, I, run]) => <Button key={l} size="sm" icon={I} onClick={run} className="justify-start">{l}</Button>)}</div>
    </Card>
  )
}
function SecurityWidget() {
  const pin = useLiveQuery(() => db.kv.get('security.pin').then(Boolean), [])
  const vault = useLiveQuery(() => db.kv.get('vault.meta').then(Boolean), [])
  const lastBackup = useLiveQuery(() => db.audit.where('type').equals('backup_exported').reverse().sortBy('at').then((a) => a[0]?.at), [])
  const { session } = authState.use()
  const { unlocked } = vaultState.use()
  const s = useSettings()
  const checks = [
    { ok: !!pin && s.lock.enabled, label: pin ? `App lock on (auto-lock ${s.lock.autoLockMins} min)` : 'App lock is off' },
    { ok: !!vault, label: vault ? `Private vault ${unlocked ? 'unlocked' : 'locked'}` : 'Private vault not set up' },
    { ok: !!lastBackup && Date.now() - lastBackup < 30 * 86_400_000, label: lastBackup ? `Last backup ${fmtDate(new Date(lastBackup).toISOString())}` : 'No backup exported yet' },
    { ok: !!session, label: !cloudConfigured ? 'Cloud sync not configured (local only)' : session ? 'Signed in — cloud sync available' : 'Not signed in (local only)' },
  ]
  return (
    <Card><CardTitle icon={ShieldCheck} tone="text-secure" action={<Link to="/security" className="text-xs text-accent">Security Center</Link>}>Security status</CardTitle>
      <ul className="space-y-1.5 text-sm">{checks.map((c) => <li key={c.label} className="flex items-center gap-2"><span className={cn('h-2 w-2 shrink-0 rounded-full', c.ok ? 'bg-ok' : 'bg-warn')} aria-hidden /><span className="sr-only">{c.ok ? 'OK:' : 'Attention:'}</span>{c.label}</li>)}</ul>
    </Card>
  )
}

const WIDGETS: Record<string, () => JSX.Element> = {
  today: TodayWidget, work: () => <AreaTasksWidget area="work" />, home: () => <AreaTasksWidget area="home" />, overdue: OverdueWidget,
  events: EventsWidget, deadlines: DeadlinesWidget, projects: ProjectsWidget, habits: HabitsWidget,
  maintenance: () => <RecordsDueWidget collection="maintenance" title="Home maintenance" icon={Wrench} path="/home/maintenance" days={30} />,
  bills: () => <RecordsDueWidget collection="bills" title="Upcoming bills" icon={Banknote} path="/home/bills" days={30} />,
  recentDocs: RecentDocsWidget, recentMedia: RecentMediaWidget, links: LinksWidget, timer: TimerWidget, calc: CalcWidget, chart: ChartWidget,
  quick: QuickWidget, security: SecurityWidget,
}

/** Ring that fills over the current hour (empty at :00, full at :59:59) and starts again every hour. */
function HourRing({ now }: { now: number }) {
  const d = new Date(now)
  const secs = d.getMinutes() * 60 + d.getSeconds()
  const frac = secs / 3600
  const C = 113.1
  const left = 60 - d.getMinutes()
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`${d.getMinutes()} minutes into this hour, ${left} minute${left === 1 ? '' : 's'} left`}>
      <svg viewBox="0 0 44 44" className="h-16 w-16 -rotate-90" aria-hidden>
        <defs><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="rgb(var(--accent))" /><stop offset="1" stopColor="rgb(var(--accent2))" /></linearGradient></defs>
        <circle cx="22" cy="22" r="18" fill="none" stroke="rgb(var(--raised))" strokeWidth="5" />
        {/* Smooth 1 s steps, but no backwards sweep when a new hour starts. */}
        <circle cx="22" cy="22" r="18" fill="none" stroke="url(#ring)" strokeWidth="5" strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)} style={{ transition: secs === 0 ? 'none' : 'stroke-dashoffset 1s linear' }} />
        {/* Small ball inside the ring: one lap per minute, following the seconds. */}
        <circle cx="22" cy="22" r="10" fill="none" stroke="rgb(var(--line))" strokeWidth="0.6" strokeDasharray="1 2.2" />
        <g style={{ transform: `rotate(${d.getSeconds() * 6}deg)`, transformOrigin: '22px 22px', transition: d.getSeconds() === 0 ? 'none' : 'transform 1s linear' }}>
          <circle cx="32" cy="22" r="2.6" fill="rgb(var(--accent))" />
        </g>
      </svg>
      <div className="hidden text-start sm:block"><div className="text-xl font-bold tabular-nums">{Math.floor(frac * 100)}%</div><div className="text-xs text-muted">of this hour</div></div>
    </div>
  )
}

/** 12-hour live clock (hh:mm:ss AM/PM) in the device time zone; updated every second by useNow. */
function LiveClock({ now }: { now: number }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const c = clock12(now, tz)
  return (
    <div className="text-end">
      <time dateTime={new Date(now).toISOString()} className="block whitespace-nowrap font-mono text-3xl font-bold tabular-nums sm:text-4xl" aria-label={`Current time ${c.text}`}>
        {c.hh}:{c.mm}<span className="text-xl text-muted">:{c.ss}</span> <span className="font-sans text-lg font-semibold text-muted sm:text-xl">{c.period}</span>
      </time>
      <div className="text-xs text-muted">{tz}</div>
    </div>
  )
}

export function Dashboard() {
  const s = useSettings()
  const now = useNow(1000)
  const [customize, setCustomize] = useState(false)
  const canCustomize = can('customize', useAccess())
  const counts = useLiveQuery(async () => ({
    tasks: await db.tasks.filter((t) => !t.deletedAt && t.status !== 'completed').count(),
    docs: await db.docs.filter((d) => !d.deletedAt).count(),
    projects: await db.projects.filter((p) => !p.deletedAt && p.status === 'active').count(),
    // Today's plan: tasks due today (any status) and how many of them are done.
    dueToday: await db.tasks.filter((t) => !t.deletedAt && t.dueDate === todayISO()).toArray(),
  }), [])
  const planned = counts?.dueToday.length ?? 0
  const doneToday = counts?.dueToday.filter((t) => t.status === 'completed').length ?? 0
  const hour = new Date(now).getHours()
  const greet = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const visible = useMemo(() => s.dashboardWidgets.filter((w) => w.visible && WIDGETS[w.id]), [s.dashboardWidgets])
  const [showAll, setShowAll] = useState(() => { try { return localStorage.getItem('b2a-dash-all') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('b2a-dash-all', showAll ? '1' : '0') } catch { /* private mode */ } }, [showAll])
  const isEmpty = counts && !counts.tasks && !counts.docs && !counts.projects

  return (
    <div>
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card dash-hero relative mb-6 overflow-hidden p-4 sm:p-6">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{format(now, 'EEEE, MMMM d, yyyy')}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Hi <span className="dash-grad-text">{s.displayName.trim() || 'Kaleem'}</span></h1>
            <p className="text-sm text-muted">{greet}.</p>
            <p className="mt-1 text-sm text-muted">
              {counts ? `${counts.tasks} open task${counts.tasks === 1 ? '' : 's'} · ${counts.projects} active project${counts.projects === 1 ? '' : 's'} · ${counts.docs} document${counts.docs === 1 ? '' : 's'}${planned ? ` · ${doneToday}/${planned} due today done` : ''}` : ' '}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <HourRing now={now} />
          <LiveClock now={now} />
          </div>
        </div>
        {/* Four equal tiles in ONE row on every screen: icon above a short label on phones, inline on larger screens. */}
        <nav aria-label="Areas" className="relative mt-4 grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:gap-2">
          {(['life', 'home', 'work'] as const).map((a) => (
            <Link key={a} to={`/${a}`} style={{ '--tone': `var(--${a})` } as React.CSSProperties} className="btn btn-soft dash-tint h-auto min-h-[56px] min-w-0 flex-col gap-1 px-0.5 py-2 text-[12px] sm:h-9 sm:min-h-0 sm:flex-row sm:gap-2 sm:px-3 sm:py-0 sm:text-sm">
              {a === 'life' ? <Heart className="h-5 w-5 text-life sm:h-4 sm:w-4" aria-hidden /> : a === 'home' ? <Home className="h-5 w-5 text-home sm:h-4 sm:w-4" aria-hidden /> : <Briefcase className="h-5 w-5 text-work sm:h-4 sm:w-4" aria-hidden />}
              <span className="tile-label">{a === 'life' ? 'My Life' : AREA_LABEL[a]}</span>
            </Link>
          ))}
          {canCustomize && <button type="button" onClick={() => setCustomize(true)} style={{ '--tone': 'var(--accent)' } as React.CSSProperties} className="btn btn-soft dash-tint h-auto min-h-[56px] min-w-0 flex-col gap-1 px-0.5 py-2 text-[12px] sm:ms-auto sm:h-10 sm:min-h-0 sm:flex-row sm:gap-2 sm:px-4 sm:py-0 sm:text-sm">
            <LayoutGrid className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden /><span className="tile-label">Customize</span>
          </button>}
        </nav>
      </motion.section>

      {isEmpty && (
        <div className="mb-6"><EmptyState icon={Sparkles} title="Welcome to workMYwork">
          Your workspace is empty and everything you add is saved on this device. Start with a task, a document or a project<span className="hidden sm:inline"> — or press <span className="kbd">Ctrl K</span> to search and run commands</span>.
        </EmptyState></div>
      )}

      <Shortcuts />
      <NeedsAttention />

      {visible.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="All widgets are hidden" action={<Button variant="primary" onClick={() => setCustomize(true)}>Choose widgets</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(showAll ? visible : visible.slice(0, FIRST_WIDGETS)).map((w, i) => {
            const W = WIDGETS[w.id]
            return <motion.div key={w.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className={cn('dash-tone', w.id === 'chart' && 'md:col-span-2')} style={{ '--tone': `var(--${WIDGET_TONE[w.id] ?? 'accent'})` } as React.CSSProperties}><W /></motion.div>
          })}
        </div>
      )}

      {visible.length > FIRST_WIDGETS && (
        <div className="mt-4 flex justify-center">
          <Button icon={showAll ? ChevronUp : ChevronDown} aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer cards' : `Show ${visible.length - FIRST_WIDGETS} more cards`}
          </Button>
        </div>
      )}

      <CustomizeModal open={customize} onClose={() => setCustomize(false)} />
    </div>
  )
}

function CustomizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings()
  const list = s.dashboardWidgets
  const save = (next: typeof list) => void safeWrite(() => updateSettings({ dashboardWidgets: next }))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = [...list];[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  return (
    <Modal open={open} onClose={onClose} title="Customize dashboard" footer={<>
      <Button onClick={() => save(DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true })))}>Reset</Button>
      <Button variant="primary" onClick={onClose}>Done</Button>
    </>}>
      <p className="mb-3 text-sm text-muted">Show, hide and reorder widgets. Private Vault content never appears on the dashboard.</p>
      <ul className="space-y-1">
        {list.map((w, i) => {
          const meta = DASHBOARD_WIDGETS.find((d) => d.id === w.id)
          return (
            <li key={w.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5">
              <span className={cn('flex-1 text-sm', !w.visible && 'text-muted line-through')}>{meta?.label ?? w.id}</span>
              <IconButton icon={w.visible ? Eye : EyeOff} label={w.visible ? `Hide ${meta?.label}` : `Show ${meta?.label}`} active={w.visible} onClick={() => save(list.map((x) => (x.id === w.id ? { ...x, visible: !x.visible } : x)))} />
              <IconButton icon={ArrowUp} label={`Move ${meta?.label} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} label={`Move ${meta?.label} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)} />
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

/** Cards shown before "Show more" — keeps the dashboard short, especially on phones. */
const FIRST_WIDGETS = 6

const SHORTCUTS: [string, string, typeof FileText, string][] = [
  ['/tasks', 'Tasks', CheckSquare, 'accent'], ['/documents', 'Docs', FileText, 'work'], ['/sheets', 'Sheets', Sheet, 'ok'],
  ['/notes', 'Notes', NotebookPen, 'life'], ['/calendar', 'Calendar', CalendarDays, 'home'], ['/links', 'Links', Link2, 'accent2'],
  ['/finance', 'Finance', Banknote, 'secure'], ['/glamiex', 'GLAMIEX', Gem, 'life'],
]

/** Category colour for each dashboard card (a theme token name; works in light and dark). */
const WIDGET_TONE: Record<string, string> = {
  today: 'accent', work: 'work', home: 'home', overdue: 'danger', events: 'accent2', deadlines: 'warn', projects: 'work', habits: 'life',
  maintenance: 'home', bills: 'secure', recentDocs: 'work', recentMedia: 'life', links: 'accent2', timer: 'accent', calc: 'ok', chart: 'accent',
  quick: 'accent2', security: 'secure',
}
/** One row of the most-used places (scrolls sideways on small phones). */
function Shortcuts() {
  return (
    <nav aria-label="Shortcuts" className="mb-4">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-8 sm:overflow-visible sm:px-0" style={{ scrollbarWidth: 'none' }}>
        {SHORTCUTS.map(([to, label, I, tone]) => (
          <li key={to} className="shrink-0">
            <Link to={to} style={{ '--tone': `var(--${tone})` } as React.CSSProperties} className="card card-hover dash-tile flex h-[76px] w-[76px] flex-col items-center justify-center gap-1.5 text-xs font-medium sm:w-full">
              <span className="dash-chip grid h-8 w-8 place-items-center rounded-xl"><I className="h-[18px] w-[18px]" aria-hidden /></span>{label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Unread notifications on the dashboard itself (hidden when there is nothing to act on). */
function NeedsAttention() {
  const notes = useNotifications()
  const { isRead, markRead } = useNotificationRead()
  const unread = notes.filter((n) => !isRead(n.id))
  if (!unread.length) return null
  return (
    <section aria-labelledby="attn" className="card mb-4 border-warn/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-warn" aria-hidden />
        <h2 id="attn" className="font-semibold">Needs attention <span className="text-sm font-normal text-muted">({unread.length})</span></h2>
        <button type="button" className="ms-auto min-h-[40px] text-xs text-accent hover:underline" onClick={() => void markRead(unread.map((n) => n.id))}>Mark all read</button>
      </div>
      <ul className="divide-y divide-line/60">
        {unread.slice(0, 4).map((n) => (
          <li key={n.id}><Link to={n.path} onClick={() => void markRead([n.id])} className="flex min-h-[48px] items-center gap-3 py-2 text-sm hover:text-accent">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', n.tone === 'danger' ? 'bg-danger' : n.tone === 'warn' ? 'bg-warn' : 'bg-accent')} aria-hidden />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{n.title}</span><span className="block truncate text-xs text-muted">{n.detail}</span></span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          </Link></li>
        ))}
      </ul>
      {unread.length > 4 && <p className="pt-2 text-xs text-muted">+{unread.length - 4} more in the bell menu.</p>}
    </section>
  )
}
