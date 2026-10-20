import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, addWeeks, startOfWeek } from 'date-fns'
import {
  Briefcase, CalendarPlus, CalendarCheck, ChevronLeft, ChevronRight, Clock, Download, FileSpreadsheet, FolderKanban, LayoutDashboard,
  ListChecks, Plus, Printer, Receipt, Reply, Target, Timer, Trash2, Users, Wallet, Building2,
} from 'lucide-react'
import { db } from '@/lib/db'
import { eventsRepo, projectsRepo, recordsRepo, sessionsRepo, tasksRepo } from '@/services/repo'
import { useSettings } from '@/services/settings'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Card, CardTitle, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Progress, Select, Spinner, Tabs } from '@/components/ui'
import { RecordManager } from '@/features/records/RecordManager'
import { fmtDate, fmtHours, parseDate, toISODate, todayISO } from '@/lib/dates'
import { PRIORITY_TONE, money } from '@/lib/format'
import { objectsToCSV } from '@/lib/csv'
import { downloadText } from '@/services/backup'
import { cn } from '@/lib/cn'
import { PRIORITY_RANK, isLive, toggleTaskDone, useTabRoute } from '@/features/home/actions'
import { meetingStart, timeEntryRange } from '@/features/work/time'
import type { Project, RecordItem, Task, TimerSession } from '@/types/models'

const TAB_IDS = ['overview', 'projects', 'meetings', 'clients', 'timesheets', 'goals', 'invoices', 'expenses', 'workspaces'] as const
type TabId = (typeof TAB_IDS)[number]
const TABS: { id: TabId; label: string; icon: typeof Briefcase }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'meetings', label: 'Meetings', icon: CalendarCheck },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'timesheets', label: 'Timesheets', icon: Clock },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'expenses', label: 'Expenses', icon: Wallet },
  { id: 'workspaces', label: 'Workspaces', icon: Building2 },
]

export function WorkPage() {
  const [tab, setTab] = useTabRoute<TabId>('/work', TAB_IDS)
  return (
    <div>
      <PageHeader title="Work" description="Priorities, projects, meetings, time and invoices — kept separate from personal life." icon={Briefcase} tone="text-work" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Work sections" />
      {tab === 'overview' && <WorkOverview />}
      {tab === 'projects' && <WorkProjects />}
      {tab === 'meetings' && <MeetingsTab />}
      {tab === 'clients' && <RecordManager collection="contacts" areas={['work']} defaults={{ category: 'Client' }} title="Clients & contacts" />}
      {tab === 'timesheets' && <Timesheets />}
      {tab === 'goals' && <RecordManager collection="goals" areas={['work']} title="Work goals" />}
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'expenses' && <RecordManager collection="expenses" areas={['work']} title="Work expenses" />}
      {tab === 'workspaces' && <RecordManager collection="workspaces" areas={['work']} />}
    </div>
  )
}

const sortTasks = (a: Task, b: Task) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9')

function useWorkData() {
  const tasks = useLiveQuery(() => db.tasks.filter((t) => !t.deletedAt).toArray(), [])
  const projects = useLiveQuery(() => db.projects.where('area').equals('work').filter(isLive).toArray(), [])
  return { tasks, projects }
}

function projectProgress(tasks: Task[], projectId: string) {
  const ts = tasks.filter((t) => t.projectId === projectId && !t.archived)
  const done = ts.filter((t) => t.status === 'completed').length
  return { done, total: ts.length, pct: ts.length ? (done / ts.length) * 100 : 0 }
}

/* ---------------- Overview ---------------- */

function WorkOverview() {
  const settings = useSettings()
  const navigate = useNavigate()
  const { tasks, projects } = useWorkData()
  const records = useLiveQuery(() => db.records.where('collection').anyOf(['meetings', 'invoices']).filter((r) => isLive(r) && r.area === 'work').toArray(), [])
  const sessions = useLiveQuery(() => db.timerSessions.filter((s) => !s.deletedAt && s.area === 'work').toArray(), [])
  const [meetingOpen, setMeetingOpen] = useState(false)
  const today = todayISO()

  if (!tasks || !projects || !records || !sessions) return <Spinner />

  const workTasks = tasks.filter((t) => t.area === 'work' && !t.archived && t.status !== 'completed')
  const priorities = workTasks.filter((t) => t.dueDate && t.dueDate <= today).sort(sortTasks)
  const followUps = workTasks.filter((t) => t.tags.includes('follow-up') || t.category.toLowerCase() === 'follow-up').sort(sortTasks)
  const active = projects.filter((p) => p.status === 'active')
  const meetings = records.filter((r) => r.collection === 'meetings' && !r.done && r.dueDate && r.dueDate >= today)
    .sort((a, b) => `${a.dueDate} ${a.fields.time ?? ''}`.localeCompare(`${b.dueDate} ${b.fields.time ?? ''}`)).slice(0, 6)
  const invoices = records.filter((r) => r.collection === 'invoices' && !r.done && r.category !== 'Cancelled')
  const outstanding = invoices.reduce((s, r) => s + (r.amount ?? 0), 0)
  const overdue = invoices.filter((r) => r.dueDate && r.dueDate < today)
  const overdueTotal = overdue.reduce((s, r) => s + (r.amount ?? 0), 0)

  const now = new Date()
  const dayStart = parseDate(today).getTime()
  const weekStart = startOfWeek(now, { weekStartsOn: settings.weekStartsOn }).getTime()
  const msToday = sessions.filter((s) => s.startedAt >= dayStart).reduce((a, s) => a + s.durationMs, 0)
  const msWeek = sessions.filter((s) => s.startedAt >= weekStart).reduce((a, s) => a + s.durationMs, 0)

  const newTask = async () => {
    const t = await safeWrite(() => tasksRepo.create({ area: 'work', title: 'New work task', dueDate: today }), 'Work task created')
    if (t) navigate(`/tasks?open=${t.id}`)
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card className="md:col-span-2 xl:col-span-3">
        <CardTitle icon={Plus} tone="text-work">Quick actions</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={ListChecks} onClick={() => void newTask()}>New work task</Button>
          <Button icon={CalendarPlus} onClick={() => setMeetingOpen(true)}>New meeting</Button>
          <Button icon={Timer} onClick={() => navigate('/time')}>Start tracking</Button>
          <Button icon={Receipt} onClick={() => navigate('/work/invoices')}>Invoices</Button>
        </div>
      </Card>

      <Card>
        <CardTitle icon={ListChecks} tone="text-work" action={<Link className="text-xs text-accent hover:underline" to="/tasks">All tasks</Link>}>Today's work priorities</CardTitle>
        {priorities.length === 0 ? <p className="text-sm text-muted">No work tasks due today or overdue.</p> : (
          <ul className="space-y-1.5">
            {priorities.map((t) => <TaskRow key={t.id} t={t} today={today} />)}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={CalendarCheck} tone="text-work" action={<Link className="text-xs text-accent hover:underline" to="/work/meetings">Meetings</Link>}>Today & upcoming meetings</CardTitle>
        {meetings.length === 0 ? <p className="text-sm text-muted">No upcoming meetings.</p> : (
          <ul className="space-y-1.5">
            {meetings.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Link to={`/work/meetings?open=${m.id}`} className="min-w-0 flex-1 truncate hover:underline">{m.title}</Link>
                <span className={cn('shrink-0 text-xs', m.dueDate === today ? 'font-semibold text-work' : 'text-muted')}>
                  {m.dueDate === today ? 'Today' : fmtDate(m.dueDate, 'EEE MMM d')}{m.fields.time ? ` · ${String(m.fields.time)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={Clock} tone="text-work" action={<Link className="text-xs text-accent hover:underline" to="/work/timesheets">Timesheets</Link>}>Hours tracked</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-raised p-3"><div className="text-xs text-muted">Today</div><div className="text-xl font-bold tabular-nums">{fmtHours(msToday)}</div></div>
          <div className="rounded-xl bg-raised p-3"><div className="text-xs text-muted">This week</div><div className="text-xl font-bold tabular-nums">{fmtHours(msWeek)}</div></div>
        </div>
      </Card>

      <Card>
        <CardTitle icon={FolderKanban} tone="text-work" action={<Link className="text-xs text-accent hover:underline" to="/work/projects">All</Link>}>Active projects</CardTitle>
        {active.length === 0 ? <p className="text-sm text-muted">No active work projects.</p> : (
          <ul className="space-y-3">
            {active.slice(0, 6).map((p) => {
              const pr = projectProgress(tasks, p.id)
              return (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="block rounded-lg hover:bg-raised/60">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted">{pr.done}/{pr.total} tasks</span>
                    </div>
                    <Progress value={pr.pct} label={`${p.name} progress`} />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={Receipt} tone="text-work" action={<Link className="text-xs text-accent hover:underline" to="/work/invoices">Invoices</Link>}>Invoices outstanding</CardTitle>
        <div className="text-2xl font-bold tabular-nums">{money(outstanding, settings.currency)}</div>
        <p className="text-sm text-muted">{invoices.length} unpaid invoice{invoices.length === 1 ? '' : 's'}</p>
        {overdue.length > 0 && (
          <p className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {overdue.length} overdue · {money(overdueTotal, settings.currency)}
          </p>
        )}
      </Card>

      <Card>
        <CardTitle icon={Reply} tone="text-work">Follow-ups</CardTitle>
        {followUps.length === 0 ? <p className="text-sm text-muted">Tag work tasks with #follow-up (or category “Follow-up”) to track them here.</p> : (
          <ul className="space-y-1.5">{followUps.slice(0, 8).map((t) => <TaskRow key={t.id} t={t} today={today} />)}</ul>
        )}
      </Card>

      <MeetingModal open={meetingOpen} onClose={() => setMeetingOpen(false)} />
    </div>
  )
}

function TaskRow({ t, today }: { t: Task; today: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={t.status === 'completed'} aria-label={`Complete task “${t.title}”`} onChange={() => void toggleTaskDone(t)} />
      <Link to={`/tasks?open=${t.id}`} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
      {t.priority !== 'medium' && <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>}
      {t.dueDate && t.dueDate < today && <Badge tone="danger">overdue</Badge>}
    </li>
  )
}

function MeetingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('')
  const [err, setErr] = useState('')
  const save = async () => {
    if (!title.trim()) { setErr('Meeting title is required.'); return }
    const ok = await safeWrite(() => recordsRepo.create({ collection: 'meetings', area: 'work', title: title.trim(), dueDate: date || null, fields: time ? { time } : {} }), 'Meeting added')
    if (ok) { setTitle(''); setTime(''); setErr(''); onClose() }
  }
  return (
    <Modal open={open} onClose={onClose} title="New meeting" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label="Meeting title" htmlFor="mt-title" error={err} className="sm:col-span-2">
          <Input id="mt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} aria-invalid={!!err} />
        </Field>
        <Field label="Date" htmlFor="mt-date"><Input id="mt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Time" htmlFor="mt-time"><Input id="mt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <p className="text-xs text-muted sm:col-span-2">Add attendees, agenda and minutes later from the Meetings tab.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/* ---------------- Projects ---------------- */

const STATUS_LABEL: Record<Project['status'], string> = { planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled' }

function WorkProjects() {
  const navigate = useNavigate()
  const { tasks, projects } = useWorkData()
  const workspaces = useLiveQuery(() => db.records.where('collection').equals('workspaces').filter(isLive).toArray(), [])
  const [ws, setWs] = useState('') // '' all, 'none' unassigned, else workspace id
  const [busy, setBusy] = useState(false)

  if (!tasks || !projects || !workspaces) return <Spinner />
  const wsName = new Map(workspaces.map((w) => [w.id, w.title]))
  const shown = projects.filter((p) => !ws || (ws === 'none' ? !p.workspaceId || !wsName.has(p.workspaceId) : p.workspaceId === ws))
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || b.updatedAt - a.updatedAt)

  const create = async () => {
    setBusy(true)
    const p = await safeWrite(() => projectsRepo.create({ area: 'work', name: 'New work project', workspaceId: ws && ws !== 'none' ? ws : null }), 'Project created')
    setBusy(false)
    if (p) navigate(`/projects/${p.id}`)
  }

  return (
    <section aria-label="Work projects">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold">Work projects</h2>
        <Select aria-label="Filter by workspace" className="w-auto" value={ws} onChange={(e) => setWs(e.target.value)}>
          <option value="">All workspaces</option>
          <option value="none">No workspace</option>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
        </Select>
        <Link to="/projects" className="btn btn-soft h-10 px-4 text-sm">All projects</Link>
        <Button variant="primary" icon={Plus} loading={busy} onClick={() => void create()}>New work project</Button>
      </div>
      {workspaces.length === 0 && <p className="mb-3 text-sm text-muted">Tip: create workspaces (e.g. a company or client) in the <Link className="text-accent hover:underline" to="/work/workspaces">Workspaces</Link> tab to group projects.</p>}
      {shown.length === 0 ? (
        <EmptyState icon={FolderKanban} title={ws ? 'No projects in this workspace' : 'No work projects yet'} action={<Button variant="primary" icon={Plus} loading={busy} onClick={() => void create()}>New work project</Button>}>
          Projects with the Work area show up here.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => {
            const pr = projectProgress(tasks, p.id)
            return (
              <li key={p.id} className="card flex flex-col gap-2 p-4">
                <Link to={`/projects/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge tone={p.status === 'active' ? 'work' : 'muted'}>{STATUS_LABEL[p.status]}</Badge>
                  {p.priority !== 'medium' && <Badge tone={PRIORITY_TONE[p.priority]}>{p.priority}</Badge>}
                  {p.deadline && <span>Deadline {fmtDate(p.deadline)}</span>}
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted">{pr.done}/{pr.total} tasks · {Math.round(pr.pct)}%</div>
                  <Progress value={pr.pct} label={`${p.name} progress`} />
                </div>
                <Select aria-label={`Workspace for ${p.name}`} className="mt-auto h-9 text-sm" value={p.workspaceId && wsName.has(p.workspaceId) ? p.workspaceId : ''}
                  onChange={(e) => void safeWrite(() => projectsRepo.update(p.id, { workspaceId: e.target.value || null }), 'Workspace updated')}>
                  <option value="">No workspace</option>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                </Select>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ---------------- Meetings ---------------- */

function MeetingsTab() {
  const meetings = useLiveQuery(() => db.records.where('collection').equals('meetings').filter((r) => isLive(r) && r.area === 'work' && !r.done).toArray(), [])
  const today = todayISO()
  const upcoming = (meetings ?? []).filter((m) => m.dueDate && m.dueDate >= today).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 10)

  const addToCalendar = async (m: RecordItem) => {
    if (!m.dueDate) return
    const start = meetingStart(m.dueDate, m.fields.time)
    const ev = await safeWrite(() => eventsRepo.create({
      title: m.title, kind: 'meeting', area: 'work', allDay: start.allDay, start: start.start, end: start.end,
      location: String(m.fields.location ?? ''), notes: String(m.fields.agenda ?? ''),
    }), start.allDay ? 'Added to calendar as an all-day event (no valid HH:mm time)' : 'Added to calendar')
    if (ev) await safeWrite(() => recordsRepo.update(m.id, { fields: { ...m.fields, calendarEventId: ev.id } }))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={CalendarPlus} tone="text-work" action={<Link className="text-xs text-accent hover:underline" to="/calendar">Open calendar</Link>}>Put upcoming meetings on the calendar</CardTitle>
        {!meetings ? <Spinner /> : upcoming.length === 0 ? <p className="text-sm text-muted">No upcoming meetings with a date.</p> : (
          <ul className="space-y-1.5">
            {upcoming.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
                <span className="text-xs text-muted">{fmtDate(m.dueDate, 'EEE MMM d')}{m.fields.time ? ` · ${String(m.fields.time)}` : ''}</span>
                {m.fields.calendarEventId ? <Badge tone="ok">On calendar</Badge> : (
                  <Button size="sm" icon={CalendarPlus} onClick={() => void addToCalendar(m)}>Create calendar event</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <RecordManager collection="meetings" areas={['work']} />
    </div>
  )
}

/* ---------------- Invoices ---------------- */

function InvoicesTab() {
  const settings = useSettings()
  const invoices = useLiveQuery(() => db.records.where('collection').equals('invoices').filter((r) => isLive(r) && r.area === 'work').toArray(), [])
  const today = todayISO()
  const month = today.slice(0, 7)
  const unpaid = (invoices ?? []).filter((r) => !r.done && r.category !== 'Cancelled')
  const overdue = unpaid.filter((r) => r.dueDate && r.dueDate < today)
  // "Paid this month": paid invoices whose completion was recorded this month (falls back to last update).
  const paidMonth = (invoices ?? []).filter((r) => r.done && (String(r.fields.lastCompleted ?? '') || toISODate(new Date(r.updatedAt))).slice(0, 7) === month)
  const total = (rs: RecordItem[]) => money(rs.reduce((s, r) => s + (r.amount ?? 0), 0), settings.currency)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><div className="text-xs text-muted">Outstanding</div><div className="text-xl font-bold tabular-nums">{total(unpaid)}</div><div className="text-xs text-muted">{unpaid.length} unpaid</div></Card>
        <Card className={cn(overdue.length > 0 && 'border-danger/50')}><div className="text-xs text-muted">Overdue</div><div className={cn('text-xl font-bold tabular-nums', overdue.length > 0 && 'text-danger')}>{total(overdue)}</div><div className="text-xs text-muted">{overdue.length} past due date</div></Card>
        <Card><div className="text-xs text-muted">Paid this month</div><div className="text-xl font-bold tabular-nums text-ok">{total(paidMonth)}</div><div className="text-xs text-muted">{paidMonth.length} invoice{paidMonth.length === 1 ? '' : 's'}</div></Card>
      </div>
      <p className="rounded-xl border border-line bg-raised/50 px-3 py-2 text-sm text-muted">
        Invoices here are records for your own tracking only — they are not generated as PDFs for clients and are not emailed or sent anywhere.
      </p>
      <RecordManager collection="invoices" areas={['work']} />
    </div>
  )
}

/* ---------------- Timesheets ---------------- */

function Timesheets() {
  const settings = useSettings()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: settings.weekStartsOn }))
  // Keep week alignment if the user changes their week-start setting.
  const ws = startOfWeek(weekStart, { weekStartsOn: settings.weekStartsOn })
  const from = ws.getTime(), to = addDays(ws, 7).getTime()
  const sessions = useLiveQuery(() => db.timerSessions.where('startedAt').between(from, to, true, false).filter((s) => !s.deletedAt && s.area === 'work').toArray(), [from, to])
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deletedAt).toArray(), [])
  const [adding, setAdding] = useState(false)

  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const projName = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])
  const nameOf = (id: string | null | undefined) => (id ? projName.get(id) ?? 'Deleted project' : 'No project')

  const dayKeys = days.map(toISODate)
  const rowsMap = new Map<string, { label: string; perDay: number[]; total: number; billable: number }>()
  for (const s of sessions ?? []) {
    const key = s.projectId ?? ''
    const row = rowsMap.get(key) ?? { label: nameOf(s.projectId), perDay: new Array<number>(7).fill(0), total: 0, billable: 0 }
    // Bucket by calendar day (DST-safe) rather than dividing raw milliseconds.
    const idx = dayKeys.indexOf(toISODate(new Date(s.startedAt)))
    row.perDay[idx >= 0 ? idx : 0] += s.durationMs
    row.total += s.durationMs
    if (s.billable) row.billable += s.durationMs
    rowsMap.set(key, row)
  }
  const grid = [...rowsMap.values()].sort((a, b) => b.total - a.total)

  const dayTotals = days.map((_, i) => grid.reduce((s, r) => s + r.perDay[i], 0))
  const total = grid.reduce((s, r) => s + r.total, 0)
  const billable = grid.reduce((s, r) => s + r.billable, 0)
  const h = (ms: number) => (ms ? (ms / 3_600_000).toFixed(2) : '–')

  const exportCsv = () => {
    const rows = [...(sessions ?? [])].sort((a, b) => a.startedAt - b.startedAt)
    const csv = objectsToCSV(rows, [
      { key: (s: TimerSession) => toISODate(new Date(s.startedAt)), label: 'Date' },
      { key: (s: TimerSession) => new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), label: 'Start' },
      { key: (s: TimerSession) => new Date(s.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), label: 'End' },
      { key: (s: TimerSession) => (s.durationMs / 3_600_000).toFixed(2), label: 'Hours' },
      { key: 'label', label: 'Description' },
      { key: (s: TimerSession) => nameOf(s.projectId), label: 'Project' },
      { key: (s: TimerSession) => (s.billable ? 'yes' : 'no'), label: 'Billable' },
    ])
    downloadText(csv, `timesheet-${toISODate(ws)}.csv`, 'text/csv;charset=utf-8')
  }

  const removeSession = async (s: TimerSession) => {
    const ok = await safeWrite(() => sessionsRepo.trash(s.id))
    if (ok !== undefined) toast('Time entry moved to trash', 'success', { label: 'Undo', run: () => void safeWrite(() => sessionsRepo.restore(s.id)) })
  }

  return (
    <section aria-label="Timesheets" className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <IconNav label="Previous week" icon={ChevronLeft} onClick={() => setWeekStart(addWeeks(ws, -1))} />
        <h2 className="text-base font-semibold">{fmtDate(toISODate(ws), 'MMM d')} – {fmtDate(toISODate(days[6]), 'MMM d, yyyy')}</h2>
        <IconNav label="Next week" icon={ChevronRight} onClick={() => setWeekStart(addWeeks(ws, 1))} />
        <Button size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: settings.weekStartsOn }))}>This week</Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button icon={Download} onClick={exportCsv} disabled={!sessions?.length}>CSV</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print</Button>
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add time entry</Button>
        </div>
      </div>
      <h2 className="hidden text-lg font-semibold print:block">Timesheet {fmtDate(toISODate(ws))} – {fmtDate(toISODate(days[6]))}</h2>

      {!sessions || !projects ? <Spinner /> : grid.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No work time this week" action={<Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add time entry</Button>}>
          Track work with the timer (area Work) or add entries manually.
        </EmptyState>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Hours per project per day</caption>
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Project</th>
                  {days.map((d) => <th key={d.toISOString()} scope="col" className={cn('px-2 py-2 text-right font-medium', toISODate(d) === todayISO() && 'text-work')}>{fmtDate(toISODate(d), 'EEE d')}</th>)}
                  <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Billable</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((r) => (
                  <tr key={r.label} className="border-b border-line/60">
                    <th scope="row" className="max-w-[180px] truncate px-3 py-2 text-left font-medium">{r.label}</th>
                    {r.perDay.map((ms, i) => <td key={i} className="px-2 py-2 text-right tabular-nums">{h(ms)}</td>)}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{h(r.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ok">{h(r.billable)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <th scope="row" className="px-3 py-2 text-left">Total</th>
                  {dayTotals.map((ms, i) => <td key={i} className="px-2 py-2 text-right tabular-nums">{h(ms)}</td>)}
                  <td className="px-3 py-2 text-right tabular-nums">{h(total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ok">{h(billable)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-sm text-muted">Week total <span className="font-semibold text-fg">{fmtHours(total)}</span> · billable <span className="font-semibold text-ok">{fmtHours(billable)}</span> · non-billable {fmtHours(total - billable)}</p>
          <Card>
            <CardTitle icon={Clock} tone="text-work">Entries this week</CardTitle>
            <ul className="divide-y divide-line/60">
              {[...sessions].sort((a, b) => b.startedAt - a.startedAt).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted">{fmtDate(toISODate(new Date(s.startedAt)), 'EEE MMM d')}</span>
                  <span className="min-w-0 flex-1 truncate">{s.label || 'Session'} <span className="text-muted">· {nameOf(s.projectId)}</span></span>
                  {s.billable && <Badge tone="ok">billable</Badge>}
                  <span className="tabular-nums">{fmtHours(s.durationMs)}</span>
                  <button type="button" className="btn btn-ghost no-print h-8 w-8 rounded-lg" aria-label={`Delete time entry ${s.label}`} title="Move to trash" onClick={() => void removeSession(s)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      <TimeEntryModal key={`${adding}-${toISODate(ws)}`} open={adding} onClose={() => setAdding(false)} projects={(projects ?? []).filter((p) => p.area === 'work' && !p.archived)} defaultDate={toISODate(days.some((d) => toISODate(d) === todayISO()) ? new Date() : ws)} />
    </section>
  )
}

function IconNav({ label, icon: Icon, onClick }: { label: string; icon: typeof ChevronLeft; onClick: () => void }) {
  return <button type="button" className="btn btn-ghost h-9 w-9 rounded-xl" aria-label={label} title={label} onClick={onClick}><Icon className="h-4 w-4" aria-hidden /></button>
}

function TimeEntryModal({ open, onClose, projects, defaultDate }: { open: boolean; onClose: () => void; projects: Project[]; defaultDate: string }) {
  const [date, setDate] = useState(defaultDate)
  const [hours, setHours] = useState('1')
  const [mins, setMins] = useState('0')
  const [label, setLabel] = useState('')
  const [projectId, setProjectId] = useState('')
  const [billable, setBillable] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const h = Number(hours || 0), m = Number(mins || 0)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr('Choose a date.')
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || m >= 60 || h > 24) return setErr('Enter hours (0–24) and minutes (0–59).')
    const durationMs = Math.round((h * 60 + m) * 60_000)
    if (durationMs <= 0) return setErr('Duration must be more than zero.')
    if (durationMs > 24 * 3_600_000) return setErr('An entry cannot exceed 24 hours.')
    setErr(null)
    setSaving(true)
    const range = timeEntryRange(date, durationMs)
    const ok = await safeWrite(() => sessionsRepo.create({
      kind: 'tracking', area: 'work', label: label.trim() || 'Work', startedAt: range.startedAt, endedAt: range.endedAt, durationMs, projectId: projectId || null, billable,
    }), 'Time entry added')
    setSaving(false)
    if (ok) { setLabel(''); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add time entry"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Save</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label="Date" htmlFor="te-date"><Input id="te-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Hours" htmlFor="te-h"><Input id="te-h" type="number" min={0} max={24} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
          <Field label="Minutes" htmlFor="te-m"><Input id="te-m" type="number" min={0} max={59} inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} /></Field>
        </div>
        <Field label="Description" htmlFor="te-label" className="sm:col-span-2"><Input id="te-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} placeholder="What did you work on?" /></Field>
        <Field label="Project" htmlFor="te-proj">
          <Select id="te-proj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-end pb-2"><Checkbox label="Billable" checked={billable} onChange={setBillable} /></div>
        {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
