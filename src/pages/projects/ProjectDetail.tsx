import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { addDays, differenceInCalendarDays } from 'date-fns'
import {
  Archive, ArchiveRestore, ArrowLeft, CalendarDays, CheckCircle2, Clock, Columns3, Diamond, Download, FileText, FolderX, GanttChart, LayoutDashboard,
  Link2, List, ListTodo, Pencil, Plus, Printer, Star, StickyNote, Trash2, AlertTriangle,
} from 'lucide-react'
import { db } from '@/lib/db'
import { docsRepo, projectsRepo, tasksRepo } from '@/services/repo'
import { useSettings } from '@/services/settings'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Card, CardTitle, EmptyState, IconButton, PageHeader, Progress, Spinner, Tabs } from '@/components/ui'
import type { Project, Task } from '@/types/models'
import { fmtDate, fmtHours, parseDate, toISODate, todayISO } from '@/lib/dates'
import { AREA_LABEL, AREA_TONE, PRIORITY_TONE } from '@/lib/format'
import { objectsToCSV } from '@/lib/csv'
import { downloadText } from '@/services/backup'
import { printHtml } from '@/lib/markdown'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskBoard, TaskListTable } from '@/features/tasks/TaskBoard'
import { TaskFilterBar } from '@/features/tasks/TaskFilterBar'
import { Gantt, type GanttRow } from '@/features/tasks/Gantt'
import { ProjectEditor } from '@/features/tasks/ProjectEditor'
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, projectIcon } from '@/features/tasks/projectIcons'
import { STATUSES, STATUS_COLOR, STATUS_LABEL, escHtml, isOverdue, useTaskFilters } from '@/features/tasks/taskUtils'

type Tab = 'summary' | 'kanban' | 'list' | 'calendar' | 'timeline' | 'related'

export function ProjectDetail() {
  const { id = '' } = useParams()
  const project = useLiveQuery(() => db.projects.get(id).then((p) => p ?? null), [id])
  if (project === undefined) return <Spinner label="Loading project" />
  if (!project || project.deletedAt) {
    return (
      <EmptyState icon={FolderX} title="Project not found" action={<Link to="/projects" className="btn btn-soft h-10 px-4 text-sm">Back to projects</Link>}>
        {project?.deletedAt ? 'This project is in the Trash. Restore it from the Trash page to view it.' : 'It may have been deleted, or the link is wrong.'}
      </EmptyState>
    )
  }
  return <ProjectView key={project.id} project={project} />
}

function ProjectView({ project }: { project: Project }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('summary')
  const [editingProject, setEditingProject] = useState(false)
  const [editingTask, setEditingTask] = useState<{ id: string | null; defaults?: Partial<Task> } | null>(null)
  const allTasks = useLiveQuery(() => db.tasks.where('projectId').equals(project.id).toArray(), [project.id])
  const projectList = useLiveQuery(() => db.projects.toArray(), [])
  const projects = useMemo(() => new Map((projectList ?? []).map((p) => [p.id, p])), [projectList])
  const { filters, set, reset, tasks, allTags, active } = useTaskFilters(allTasks, project.id)

  const live = useMemo(() => (allTasks ?? []).filter((t) => !t.deletedAt), [allTasks])
  const done = live.filter((t) => t.status === 'completed').length
  const pct = live.length ? Math.round((done / live.length) * 100) : 0
  const Icon = projectIcon(project.icon)
  const openTask = (t: Task) => setEditingTask({ id: t.id })
  const newTask = (defaults: Partial<Task> = {}) => setEditingTask({ id: null, defaults: { projectId: project.id, area: project.area, ...defaults } })

  const exportCsv = () => {
    const rows = [...live].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    const csv = objectsToCSV(rows, [
      { key: 'title', label: 'Task' },
      { key: (t) => STATUS_LABEL[t.status], label: 'Status' },
      { key: 'priority', label: 'Priority' },
      { key: (t) => t.startDate ?? '', label: 'Start' },
      { key: (t) => t.dueDate ?? '', label: 'Due' },
      { key: (t) => (t.completedAt ? toISODate(new Date(t.completedAt)) : ''), label: 'Completed' },
      { key: (t) => (isOverdue(t) ? 'yes' : ''), label: 'Overdue' },
      { key: (t) => `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}`, label: 'Checklist' },
      { key: (t) => t.estimateMins ?? '', label: 'Estimate (min)' },
      { key: 'actualMins', label: 'Actual (min)' },
      { key: (t) => (t.isMilestone ? 'yes' : ''), label: 'Milestone' },
      { key: (t) => t.tags.join(' '), label: 'Tags' },
    ])
    downloadText(csv, `${project.name.replace(/[^\w-]+/g, '_')}-tasks-${todayISO()}.csv`, 'text/csv;charset=utf-8')
  }

  const print = () => {
    const rows = [...live].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .map((t) => `<tr><td>${t.isMilestone ? '◆ ' : ''}${escHtml(t.title)}</td><td>${STATUS_LABEL[t.status]}</td><td>${t.priority}</td><td>${t.dueDate ? escHtml(fmtDate(t.dueDate)) : ''}${isOverdue(t) ? ' (overdue)' : ''}</td></tr>`).join('')
    printHtml(`${project.name} — progress report`,
      `<p>${escHtml(PROJECT_STATUS_LABEL[project.status])} · ${pct}% complete (${done}/${live.length} tasks) · Deadline: ${project.deadline ? escHtml(fmtDate(project.deadline)) : 'none'} · Generated ${escHtml(new Date().toLocaleString())}</p>
      ${project.description ? `<p>${escHtml(project.description)}</p>` : ''}
      <table><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No tasks</td></tr>'}</tbody></table>`)
  }

  const trash = async () => {
    const ok = await safeWrite(() => projectsRepo.trash(project.id).then(() => true))
    if (ok) {
      toast(`“${project.name}” moved to trash`, 'success', { label: 'Undo', run: () => void safeWrite(() => projectsRepo.restore(project.id)) })
      navigate('/projects')
    }
  }

  return (
    <div>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />Projects</Link>
      <PageHeader title={project.name} icon={Icon}
        description={project.description || undefined}
        actions={<>
          <IconButton icon={Star} label={project.favorite ? 'Unfavorite' : 'Favorite'} active={project.favorite} onClick={() => void safeWrite(() => projectsRepo.toggle(project.id, 'favorite'))} />
          <IconButton icon={Download} label="Export tasks as CSV" onClick={exportCsv} />
          <IconButton icon={Printer} label="Print progress report" onClick={print} />
          <IconButton icon={project.archived ? ArchiveRestore : Archive} label={project.archived ? 'Unarchive' : 'Archive'}
            onClick={() => void safeWrite(() => projectsRepo.toggle(project.id, 'archived'), project.archived ? 'Restored from archive' : 'Project archived')} />
          <IconButton icon={Trash2} label="Move project to trash" onClick={() => void trash()} />
          <Button icon={Pencil} onClick={() => setEditingProject(true)}>Edit</Button>
          <Button variant="primary" icon={Plus} onClick={() => newTask()}>Add task</Button>
        </>} />

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: project.color ?? '#8b5cf6' }} aria-hidden />
          <Badge tone={PROJECT_STATUS_TONE[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</Badge>
          <Badge tone={PRIORITY_TONE[project.priority]}>{project.priority} priority</Badge>
          <Badge tone={AREA_TONE[project.area]}>{AREA_LABEL[project.area]}</Badge>
          {project.archived && <Badge>Archived</Badge>}
          <span className="text-xs text-muted">{project.startDate ? fmtDate(project.startDate) : 'No start'} → {project.deadline ? fmtDate(project.deadline) : 'No deadline'}</span>
          {project.tags.map((t) => <span key={t} className="text-xs text-accent">#{t}</span>)}
        </div>
        <div className="mb-1 flex justify-between text-xs text-muted"><span>{live.length ? `${done} of ${live.length} tasks completed` : 'No tasks yet'}</span><span className="tabular-nums">{pct}%</span></div>
        <Progress value={pct} label="Project completion" />
      </Card>

      <Tabs label="Project views" value={tab} onChange={setTab} tabs={[
        { id: 'summary', label: 'Summary', icon: LayoutDashboard }, { id: 'kanban', label: 'Kanban', icon: Columns3 }, { id: 'list', label: 'List', icon: List },
        { id: 'calendar', label: 'Calendar', icon: CalendarDays }, { id: 'timeline', label: 'Timeline', icon: GanttChart }, { id: 'related', label: 'Related', icon: Link2 },
      ]} />

      {!allTasks || !projectList ? <Spinner label="Loading tasks" /> : <>
        {tab === 'summary' && <Summary project={project} tasks={live} onOpen={openTask} />}
        {(tab === 'kanban' || tab === 'list') && <>
          <TaskFilterBar filters={filters} set={set} reset={reset} active={active} projects={[]} tags={allTags} hideProject />
          {live.length === 0 ? (
            <EmptyState icon={ListTodo} title="No tasks in this project yet" action={<Button variant="primary" icon={Plus} onClick={() => newTask()}>Add a task</Button>} />
          ) : tab === 'kanban' ? (
            <TaskBoard tasks={tasks} projects={projects} onOpen={openTask} quickAddDefaults={{ projectId: project.id, area: project.area }} showProject={false} />
          ) : tasks.length === 0 ? (
            <EmptyState icon={ListTodo} title="No tasks match these filters" action={<Button onClick={reset}>Clear filters</Button>} />
          ) : <TaskListTable tasks={tasks} projects={projects} onOpen={openTask} showProject={false} />}
        </>}
        {tab === 'calendar' && <ProjectCalendar project={project} tasks={live} onOpen={openTask} onCreate={(d) => newTask({ dueDate: d })} />}
        {tab === 'timeline' && <ProjectTimeline project={project} tasks={live} onOpen={openTask} />}
        {tab === 'related' && <Related project={project} />}
      </>}

      <ProjectEditor key={editingProject ? 'open' : 'closed'} open={editingProject} project={project} onClose={() => setEditingProject(false)} />
      <TaskEditor key={editingTask ? editingTask.id ?? 'new' : 'closed'} open={!!editingTask} taskId={editingTask?.id ?? null} defaults={editingTask?.defaults} onClose={() => setEditingTask(null)} />
    </div>
  )
}

/* ---------------- Summary ---------------- */
function Summary({ project, tasks, onOpen }: { project: Project; tasks: Task[]; onOpen: (t: Task) => void }) {
  const taskIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])
  const sessions = useLiveQuery(() => db.timerSessions.toArray(), [])
  const trackedMs = useMemo(() => (sessions ?? [])
    .filter((s) => !s.deletedAt && (s.projectId === project.id || (!!s.taskId && taskIds.has(s.taskId))))
    .reduce((n, s) => n + (s.durationMs || 0), 0), [sessions, project.id, taskIds])
  const today = todayISO()
  const open = tasks.filter((t) => t.status !== 'completed').length
  const completed = tasks.length - open
  const overdue = tasks.filter((t) => isOverdue(t, today)).length
  const estimate = tasks.reduce((n, t) => n + (t.estimateMins ?? 0), 0)
  const milestones = tasks.filter((t) => t.isMilestone && t.status !== 'completed').sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const pie = STATUSES.map((s) => ({ name: s.label, value: tasks.filter((t) => t.status === s.id).length, color: STATUS_COLOR[s.id] })).filter((d) => d.value)
  const daysLeft = project.deadline ? differenceInCalendarDays(parseDate(project.deadline), parseDate(today)) : null

  const stats = [
    { label: 'Total tasks', value: tasks.length, icon: ListTodo },
    { label: 'Open', value: open, icon: Clock },
    { label: 'Completed', value: completed, icon: CheckCircle2, tone: 'text-ok' },
    { label: 'Overdue', value: overdue, icon: AlertTriangle, tone: overdue ? 'text-danger' : undefined },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-3">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-3">
            <s.icon className={`h-5 w-5 shrink-0 ${s.tone ?? 'text-accent'}`} aria-hidden />
            <div><div className="text-xl font-bold tabular-nums">{s.value}</div><div className="text-xs text-muted">{s.label}</div></div>
          </Card>
        ))}
      </div>
      <Card>
        <CardTitle icon={GanttChart}>Status breakdown</CardTitle>
        {pie.length === 0 ? <p className="py-8 text-center text-sm text-muted">No tasks to chart yet.</p> : (
          <div className="h-56" role="img" aria-label={`Task status: ${pie.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%" paddingAngle={2} isAnimationActive={false}>
                  {pie.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, color: 'rgb(var(--fg))' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card>
        <CardTitle icon={Clock}>Time</CardTitle>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Hours tracked</dt><dd className="font-semibold tabular-nums">{sessions ? fmtHours(trackedMs) : '…'}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Estimated</dt><dd className="tabular-nums">{estimate ? fmtHours(estimate * 60_000) : '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Logged on tasks</dt><dd className="tabular-nums">{fmtHours(tasks.reduce((n, t) => n + (t.actualMins || 0), 0) * 60_000)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Deadline</dt>
            <dd className={daysLeft != null && daysLeft < 0 && project.status !== 'completed' ? 'font-semibold text-danger' : ''}>
              {project.deadline ? `${fmtDate(project.deadline)} (${daysLeft! >= 0 ? `${daysLeft} days left` : `${-daysLeft!} days ago`})` : 'Not set'}
            </dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">Tracked time comes from timer sessions linked to this project or its tasks.</p>
      </Card>
      <Card>
        <CardTitle icon={Diamond}>Upcoming milestones</CardTitle>
        {milestones.length === 0 && !project.deadline ? <p className="text-sm text-muted">No open milestones. Mark a task as a milestone in the task editor.</p> : (
          <ul className="space-y-2 text-sm">
            {milestones.slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <button type="button" className="min-w-0 truncate text-left hover:text-accent" onClick={() => onOpen(m)}>◆ {m.title}</button>
                <span className={isOverdue(m, today) ? 'shrink-0 text-xs font-semibold text-danger' : 'shrink-0 text-xs text-muted'}>{m.dueDate ? fmtDate(m.dueDate, 'MMM d') : 'No date'}</span>
              </li>
            ))}
            {project.deadline && <li className="flex justify-between gap-2 border-t border-line/60 pt-2"><span>Project deadline</span><span className="text-xs text-muted">{fmtDate(project.deadline)}</span></li>}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ---------------- Calendar ---------------- */
function ProjectCalendar({ project, tasks, onOpen, onCreate }: { project: Project; tasks: Task[]; onOpen: (t: Task) => void; onCreate: (date: string) => void }) {
  const settings = useSettings()
  const events = useMemo<EventInput[]>(() => {
    const out: EventInput[] = tasks.filter((t) => t.dueDate && !t.archived).map((t) => ({
      id: t.id, title: `${t.isMilestone ? '◆ ' : ''}${t.title}`, start: t.dueDate!, allDay: true,
      backgroundColor: STATUS_COLOR[t.status], borderColor: isOverdue(t) ? '#ef4444' : STATUS_COLOR[t.status], textColor: '#fff',
      classNames: t.status === 'completed' ? ['opacity-60', 'line-through'] : [], extendedProps: { kind: 'task' },
    }))
    if (project.deadline) out.push({ id: `deadline-${project.id}`, title: `⚑ Deadline: ${project.name}`, start: project.deadline, allDay: true, editable: false, backgroundColor: '#ef4444', textColor: '#fff', extendedProps: { kind: 'deadline' } })
    return out
  }, [tasks, project])

  const onDrop = async (arg: EventDropArg) => {
    const t = tasks.find((x) => x.id === arg.event.id)
    if (!t || !t.dueDate) { arg.revert(); return }
    const newDue = arg.event.startStr.slice(0, 10)
    const delta = differenceInCalendarDays(parseDate(newDue), parseDate(t.dueDate))
    const ok = await safeWrite(() => tasksRepo.update(t.id, { dueDate: newDue, startDate: t.startDate ? toISODate(addDays(parseDate(t.startDate), delta)) : null }).then(() => true), `Moved to ${fmtDate(newDue)}`)
    if (!ok) arg.revert()
  }

  return (
    <Card className="p-2 sm:p-4">
      <FullCalendar plugins={[dayGridPlugin, interactionPlugin]} initialView="dayGridMonth" firstDay={settings.weekStartsOn} height="auto"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }} events={events} editable eventDurationEditable={false}
        dateClick={(a) => onCreate(a.dateStr)}
        eventClick={(a: EventClickArg) => { const t = tasks.find((x) => x.id === a.event.id); if (t) onOpen(t) }}
        eventDrop={(a) => void onDrop(a)} />
      <p className="mt-2 text-xs text-muted">Click a day to add a task due that day. Drag a task to change its due date (its start date moves with it).</p>
    </Card>
  )
}

/* ---------------- Timeline ---------------- */
function ProjectTimeline({ project, tasks, onOpen }: { project: Project; tasks: Task[]; onOpen: (t: Task) => void }) {
  const rows = useMemo<GanttRow[]>(() => {
    const done = tasks.filter((t) => t.status === 'completed').length
    return [
      { id: project.id, label: project.name, start: project.startDate, end: project.deadline, color: project.color, progress: tasks.length ? (done / tasks.length) * 100 : 0 },
      ...[...tasks].filter((t) => !t.archived)
        .sort((a, b) => (a.startDate ?? a.dueDate ?? '9999').localeCompare(b.startDate ?? b.dueDate ?? '9999'))
        .map<GanttRow>((t) => ({
          id: t.id, label: t.title, start: t.startDate ?? t.dueDate, end: t.dueDate ?? t.startDate, depth: 1, milestone: !!t.isMilestone,
          color: isOverdue(t) ? '#ef4444' : STATUS_COLOR[t.status], done: t.status === 'completed', onOpen: () => onOpen(t),
          progress: t.subtasks.length ? (t.subtasks.filter((s) => s.done).length / t.subtasks.length) * 100 : undefined,
        })),
    ]
  }, [project, tasks, onOpen])
  if (!tasks.length && !project.startDate && !project.deadline) {
    return <EmptyState icon={GanttChart} title="Nothing to show on the timeline">Set a start date and deadline on the project, and start/due dates on its tasks.</EmptyState>
  }
  return <Gantt rows={rows} ariaLabel={`${project.name} timeline`} />
}

/* ---------------- Related ---------------- */
function Related({ project }: { project: Project }) {
  const navigate = useNavigate()
  const docs = useLiveQuery(() => db.docs.toArray().then((ds) => ds.filter((d) => d.projectId === project.id && !d.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt)), [project.id])
  const events = useLiveQuery(() => db.events.toArray().then((es) => es.filter((e) => e.projectId === project.id && !e.deletedAt).sort((a, b) => a.start.localeCompare(b.start))), [project.id])
  const [creating, setCreating] = useState<'document' | 'note' | null>(null)

  const create = async (kind: 'document' | 'note') => {
    setCreating(kind)
    const d = await safeWrite(() => docsRepo.create({ kind, projectId: project.id, area: project.area, title: kind === 'note' ? `${project.name} — note` : `${project.name} — document` }), kind === 'note' ? 'Note created' : 'Document created')
    setCreating(null)
    if (d) navigate(kind === 'note' ? `/notes/${d.id}` : `/documents/${d.id}`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle icon={FileText} action={<div className="flex gap-1">
          <Button size="sm" icon={Plus} loading={creating === 'document'} onClick={() => void create('document')}>Document</Button>
          <Button size="sm" icon={StickyNote} loading={creating === 'note'} onClick={() => void create('note')}>Note</Button>
        </div>}>Documents & notes</CardTitle>
        {!docs ? <Spinner /> : docs.length === 0 ? <p className="text-sm text-muted">No linked documents yet. Create one here and it is linked to this project automatically.</p> : (
          <ul className="divide-y divide-line/60 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <Link to={d.kind === 'note' ? `/notes/${d.id}` : `/documents/${d.id}`} className="flex min-w-0 items-center gap-2 hover:text-accent">
                  {d.kind === 'note' ? <StickyNote className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                  <span className="truncate">{d.title || 'Untitled'}</span>
                </Link>
                <span className="shrink-0 text-xs text-muted">{new Date(d.updatedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardTitle icon={CalendarDays} action={<Button size="sm" icon={CalendarDays} onClick={() => navigate('/calendar')}>Open calendar</Button>}>Events</CardTitle>
        {!events ? <Spinner /> : events.length === 0 ? <p className="text-sm text-muted">No events linked. In the calendar, choose this project in an event’s “Project” field.</p> : (
          <ul className="divide-y divide-line/60 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/calendar?open=${e.id}`} className="min-w-0 truncate hover:text-accent">{e.title}</Link>
                <span className="shrink-0 text-xs text-muted">{e.allDay ? fmtDate(e.start) : new Date(e.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{e.recurrence ? ' · repeats' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
