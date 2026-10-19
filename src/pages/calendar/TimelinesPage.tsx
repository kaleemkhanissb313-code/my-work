import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays } from 'date-fns'
import { ArrowLeftRight, Calculator, Clock, GanttChart, Globe } from 'lucide-react'
import { db } from '@/lib/db'
import { Button, Card, CardTitle, Checkbox, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui'
import type { Task } from '@/types/models'
import { addWorkingDays, daysBetween, fmtDate, localTimeZone, parseDate, toISODate, todayISO, workingDaysBetween } from '@/lib/dates'
import { Gantt, type GanttRow } from '@/features/tasks/Gantt'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { STATUS_COLOR, isOverdue } from '@/features/tasks/taskUtils'
import { fmtOffset, wallTimeToInstant, zoneList } from '@/features/tasks/timezones'

export function TimelinesPage() {
  const navigate = useNavigate()
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [includeDone, setIncludeDone] = useState(false)
  const [showUnassigned, setShowUnassigned] = useState(true)
  const [editingTask, setEditingTask] = useState<string | null>(null)

  const { rows, datedProjects, unassignedCount } = useMemo(() => {
    const ps = (projects ?? []).filter((p) => !p.deletedAt && !p.archived && (includeDone || (p.status !== 'completed' && p.status !== 'cancelled')))
    const ts = (tasks ?? []).filter((t) => !t.deletedAt && !t.archived && (includeDone || t.status !== 'completed'))
    const byProject = new Map<string, Task[]>()
    for (const t of ts) if (t.projectId) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t])
    const taskRow = (t: Task): GanttRow => ({
      id: t.id, label: t.title, start: t.startDate ?? t.dueDate, end: t.dueDate ?? t.startDate, depth: 1, milestone: !!t.isMilestone,
      color: isOverdue(t) ? '#ef4444' : STATUS_COLOR[t.status], done: t.status === 'completed', onOpen: () => setEditingTask(t.id),
    })
    const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
    const sortKey = (t: Task) => t.startDate ?? t.dueDate ?? '9999'
    const out: GanttRow[] = []
    const dated = ps.filter((p) => p.startDate || p.deadline || (byProject.get(p.id) ?? []).some((t) => t.startDate || t.dueDate))
      .sort((a, b) => (a.startDate ?? a.deadline ?? '9999').localeCompare(b.startDate ?? b.deadline ?? '9999'))
    for (const p of dated) {
      const pts = (byProject.get(p.id) ?? []).filter((t) => t.startDate || t.dueDate).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      const all = byProject.get(p.id) ?? []
      // If the project has no own dates, span its tasks.
      const taskDates = pts.flatMap((t) => [t.startDate, t.dueDate]).filter((d): d is string => !!d).sort()
      const done = all.filter((t) => t.status === 'completed').length
      out.push({
        id: p.id, label: p.name, start: p.startDate ?? taskDates[0] ?? null, end: p.deadline ?? taskDates[taskDates.length - 1] ?? null, color: p.color,
        expandable: pts.length > 0, expanded: expanded.has(p.id), onToggle: () => toggle(p.id), onOpen: () => navigate(`/projects/${p.id}`),
        progress: all.length ? (done / all.length) * 100 : 0, done: p.status === 'completed',
      })
      if (expanded.has(p.id)) out.push(...pts.map(taskRow))
    }
    const unassigned = ts.filter((t) => !t.projectId && (t.startDate || t.dueDate)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    if (showUnassigned && unassigned.length) {
      out.push({ id: '__none', label: 'Tasks without a project', start: null, end: null, expandable: true, expanded: expanded.has('__none'), onToggle: () => toggle('__none'), color: '#64748b' })
      // Give the group row a span so it renders as a bar.
      const ds = unassigned.flatMap((t) => [t.startDate, t.dueDate]).filter((d): d is string => !!d).sort()
      out[out.length - 1].start = ds[0]; out[out.length - 1].end = ds[ds.length - 1]
      if (expanded.has('__none')) out.push(...unassigned.map(taskRow))
    }
    return { rows: out, datedProjects: dated.length, unassignedCount: unassigned.length }
  }, [projects, tasks, expanded, includeDone, showUnassigned, navigate])

  const expandAll = () => setExpanded(new Set([...rows.filter((r) => r.expandable).map((r) => r.id)]))

  return (
    <div>
      <PageHeader title="Timelines" icon={GanttChart} description="Projects and tasks on a Gantt-style timeline, plus date and time-zone tools." />
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Checkbox label="Include completed" checked={includeDone} onChange={setIncludeDone} />
        <Checkbox label="Show tasks without a project" checked={showUnassigned} onChange={setShowUnassigned} />
        <Button size="sm" variant="ghost" onClick={expandAll} disabled={!rows.some((r) => r.expandable)}>Expand all</Button>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())} disabled={!expanded.size}>Collapse all</Button>
      </div>
      {!projects || !tasks ? <Spinner label="Loading timeline" /> : datedProjects === 0 && (!showUnassigned || unassignedCount === 0) ? (
        <EmptyState icon={GanttChart} title="No dated projects yet" action={<Link to="/projects" className="btn btn-3d h-10 px-4 text-sm">Go to projects</Link>}>
          The timeline shows projects that have a start date and/or deadline (or tasks with start/due dates). Open a project, choose <strong>Edit</strong>, and set its
          start date and deadline — then give its tasks start and due dates to see them as bars. Tasks marked as milestones appear as diamonds.
        </EmptyState>
      ) : (
        <Gantt rows={rows} ariaLabel="Projects timeline" />
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <DateCalculator />
        <TimeZoneConverter />
      </div>

      <TaskEditor key={editingTask ?? 'closed'} open={!!editingTask} taskId={editingTask} onClose={() => setEditingTask(null)} />
    </div>
  )
}

/* ---------------- Date calculator ---------------- */
function DateCalculator() {
  const [a, setA] = useState(todayISO())
  const [b, setB] = useState(toISODate(addDays(new Date(), 30)))
  const [base, setBase] = useState(todayISO())
  const [n, setN] = useState(10)
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime())
  const diffOk = valid(a) && valid(b)
  const addOk = valid(base) && Number.isFinite(n) && Math.abs(n) <= 100000
  const diff = diffOk ? daysBetween(a, b) : 0
  const wd = diffOk ? workingDaysBetween(a, b) : 0
  return (
    <Card>
      <CardTitle icon={Calculator}>Date calculator</CardTitle>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Difference between dates</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <Field label="From" htmlFor="dc-a"><Input id="dc-a" type="date" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <button type="button" className="btn btn-ghost mb-0.5 h-10 w-10 justify-self-center rounded-xl" aria-label="Swap dates" onClick={() => { setA(b); setB(a) }}>
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
        </button>
        <Field label="To" htmlFor="dc-b"><Input id="dc-b" type="date" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      </div>
      <div className="mt-3 rounded-xl bg-raised/60 p-3 text-sm" aria-live="polite">
        {diffOk ? <>
          <div><span className="text-lg font-bold tabular-nums">{diff}</span> calendar day{Math.abs(diff) === 1 ? '' : 's'} {diff < 0 && <span className="text-muted">(the “to” date is earlier)</span>}</div>
          <div className="text-muted">≈ {(Math.abs(diff) / 7).toFixed(1)} weeks · <span className="font-semibold text-fg tabular-nums">{wd}</span> working days (Mon–Fri, both ends inclusive)</div>
        </> : <span className="text-muted">Enter two valid dates.</span>}
      </div>

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Add days</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start date" htmlFor="dc-base"><Input id="dc-base" type="date" value={base} onChange={(e) => setBase(e.target.value)} /></Field>
        <Field label="Number of days (negative to subtract)" htmlFor="dc-n"><Input id="dc-n" type="number" value={Number.isFinite(n) ? n : ''} onChange={(e) => setN(e.target.value === '' ? NaN : Math.trunc(Number(e.target.value)))} /></Field>
      </div>
      <dl className="mt-3 grid gap-2 rounded-xl bg-raised/60 p-3 text-sm sm:grid-cols-2" aria-live="polite">
        {addOk ? <>
          <div><dt className="text-muted">+ {n} calendar days</dt><dd className="font-semibold">{fmtDate(toISODate(addDays(parseDate(base), n)), 'EEE, MMM d, yyyy')}</dd></div>
          <div><dt className="text-muted">+ {n} working days</dt><dd className="font-semibold">{fmtDate(addWorkingDays(base, n), 'EEE, MMM d, yyyy')}</dd></div>
        </> : <span className="text-muted">Enter a valid date and a whole number of days.</span>}
      </dl>
    </Card>
  )
}

/* ---------------- Time zone converter ---------------- */
function TimeZoneConverter() {
  const zones = useMemo(zoneList, [])
  const local = localTimeZone()
  const [when, setWhen] = useState(() => { const d = new Date(); return `${toISODate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` })
  const [from, setFrom] = useState(local)
  const [to, setTo] = useState(local === 'UTC' ? 'America/New_York' : 'UTC')
  let result: { text: string; offFrom: string; offTo: string; local: string } | null = null
  let error = ''
  try {
    const t = wallTimeToInstant(when, from)
    if (t == null || Number.isNaN(t)) error = 'Enter a valid date and time.'
    else {
      const fmt = (z: string) => new Intl.DateTimeFormat(undefined, { timeZone: z, dateStyle: 'full', timeStyle: 'short' }).format(new Date(t))
      const off = (z: string) => fmtOffset(z, t)
      result = { text: fmt(to), offFrom: off(from), offTo: off(to), local: fmt(local) }
    }
  } catch { error = 'That time zone is not supported by this browser.' }
  const zoneOptions = (id: string) => (
    <>
      {!zones.includes(id) && <option value={id}>{id}</option>}
      {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
    </>
  )
  return (
    <Card>
      <CardTitle icon={Globe}>Time zone converter</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date & time" htmlFor="tz-when" className="sm:col-span-2"><Input id="tz-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="From time zone" htmlFor="tz-from"><Select id="tz-from" value={from} onChange={(e) => setFrom(e.target.value)}>{zoneOptions(from)}</Select></Field>
        <Field label="To time zone" htmlFor="tz-to"><Select id="tz-to" value={to} onChange={(e) => setTo(e.target.value)}>{zoneOptions(to)}</Select></Field>
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" icon={ArrowLeftRight} onClick={() => { setFrom(to); setTo(from) }}>Swap zones</Button>
      </div>
      <div className="mt-2 rounded-xl bg-raised/60 p-3 text-sm" aria-live="polite">
        {result ? <>
          <div className="text-xs text-muted">{from.replace(/_/g, ' ')} ({result.offFrom}) →</div>
          <div className="text-lg font-bold">{result.text}</div>
          <div className="text-xs text-muted">{to.replace(/_/g, ' ')} ({result.offTo})</div>
          {to !== local && from !== local && <div className="mt-2 flex items-center gap-1 text-xs text-muted"><Clock className="h-3 w-3" aria-hidden />Your time ({local.replace(/_/g, ' ')}): {result.local}</div>}
        </> : <span className="text-danger">{error}</span>}
      </div>
    </Card>
  )
}
