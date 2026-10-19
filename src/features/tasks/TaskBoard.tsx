import { useMemo, useState, type DragEvent } from 'react'
import { addDays } from 'date-fns'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react'
import { tasksRepo } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Input } from '@/components/ui'
import type { Project, Task, TaskStatus } from '@/types/models'
import { fmtDate, toISODate, todayISO } from '@/lib/dates'
import { AREA_LABEL, AREA_TONE, PRIORITY_TONE } from '@/lib/format'
import { cn } from '@/lib/cn'
import { TaskCard } from './TaskEditor'
import { PRIORITY_ORDER, STATUSES, STATUS_LABEL, isOverdue, setTaskStatus, subtaskProgress } from './taskUtils'

/** Change a task's status from a board/list control, with recurrence handling and feedback. */
export async function changeStatus(t: Task, status: TaskStatus, extra: Partial<Task> = {}) {
  if (t.status === status && !Object.keys(extra).length) return
  const r = await safeWrite(async () => ({ next: await setTaskStatus(t, status, extra) }))
  if (r?.next) toast(`Next occurrence scheduled${r.next.dueDate ? ` for ${fmtDate(r.next.dueDate)}` : ''}`, 'info')
  else if (r && status === 'completed' && t.status !== 'completed') toast(`Completed “${t.title}”`, 'success', { label: 'Undo', run: () => void safeWrite(() => tasksRepo.update(t.id, { status: t.status, completedAt: null })) })
}

export interface TaskBoardProps {
  tasks: Task[]
  projects: Map<string, Project>
  onOpen: (t: Task) => void
  /** Defaults for tasks created via quick-add (e.g. projectId). */
  quickAddDefaults?: Partial<Task>
  showProject?: boolean
}

/** Kanban board with 4 status columns, HTML5 drag-and-drop plus keyboard alternatives on each card. */
export function TaskBoard({ tasks, projects, onOpen, quickAddDefaults, showProject = true }: TaskBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ status: TaskStatus; beforeId: string | null } | null>(null)
  const columns = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], blocked: [], completed: [] }
    for (const t of tasks) m[t.status].push(t)
    return m
  }, [tasks])

  const orderBetween = (col: Task[], beforeId: string | null, movingId: string) => {
    const list = col.filter((t) => t.id !== movingId)
    if (!list.length) return Date.now()
    const i = beforeId ? list.findIndex((t) => t.id === beforeId) : -1
    if (i === -1) return list[list.length - 1].order + 1000
    const prev = i > 0 ? list[i - 1].order : list[i].order - 2000
    return (prev + list[i].order) / 2
  }

  const drop = async (status: TaskStatus, beforeId: string | null) => {
    const id = dragId
    setDragId(null); setOver(null)
    const t = tasks.find((x) => x.id === id)
    if (!t || beforeId === t.id) return
    const order = orderBetween(columns[status], beforeId, t.id)
    if (t.status === status) await safeWrite(() => tasksRepo.update(t.id, { order }))
    else await changeStatus(t, status, { order })
  }

  const move = async (t: Task, dir: -1 | 1) => {
    const col = columns[t.status]
    const i = col.findIndex((x) => x.id === t.id)
    const j = i + dir
    if (j < 0 || j >= col.length) return
    const other = col[j]
    // Swap orders (nudge if equal so the swap is visible).
    const a = other.order, b = t.order === other.order ? other.order + dir : t.order
    await safeWrite(async () => { await tasksRepo.update(t.id, { order: a }); await tasksRepo.update(other.id, { order: b }) })
  }

  const onDragStart = (e: DragEvent, t: Task) => {
    e.dataTransfer.setData('text/plain', t.id)
    e.dataTransfer.effectAllowed = 'move'
    setDragId(t.id)
  }

  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3" role="list" aria-label="Kanban board">
      {STATUSES.map((s) => {
        const col = columns[s.id]
        return (
          <section key={s.id} role="listitem" aria-label={`${s.label} column, ${col.length} tasks`}
            className={cn('flex w-[80vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl border border-line/70 bg-surface/50 p-2 sm:w-72',
              over?.status === s.id && dragId && 'ring-2 ring-accent/60')}
            onDragOver={(e) => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over?.status !== s.id || over.beforeId !== null) setOver({ status: s.id, beforeId: null }) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }}
            onDrop={(e) => { e.preventDefault(); void drop(s.id, over?.status === s.id ? over.beforeId : null) }}>
            <header className="mb-2 flex items-center justify-between px-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Badge tone={s.tone}>{s.label}</Badge></h3>
              <span className="text-xs text-muted tabular-nums">{col.length}</span>
            </header>
            <QuickAdd status={s.id} defaults={quickAddDefaults} lastOrder={col.length ? col[col.length - 1].order : 0} />
            <ul className="flex min-h-[80px] flex-1 flex-col gap-2">
              {col.map((t, i) => (
                <li key={t.id}
                  onDragOver={(e) => { if (!dragId) return; e.preventDefault(); e.stopPropagation(); if (over?.beforeId !== t.id) setOver({ status: s.id, beforeId: t.id }) }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void drop(s.id, t.id) }}
                  className={cn(over?.beforeId === t.id && dragId !== t.id && 'border-t-2 border-accent pt-1')}>
                  <TaskCard task={t} project={t.projectId ? projects.get(t.projectId) : undefined} onOpen={onOpen} showProject={showProject}
                    onStatusChange={(x, st) => void changeStatus(x, st)} onMove={move} canMoveUp={i > 0} canMoveDown={i < col.length - 1}
                    draggable onDragStart={onDragStart} onDragEnd={() => { setDragId(null); setOver(null) }} dragging={dragId === t.id} />
                </li>
              ))}
              {!col.length && <li className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">Drop tasks here</li>}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function QuickAdd({ status, defaults, lastOrder }: { status: TaskStatus; defaults?: Partial<Task>; lastOrder: number }) {
  const [title, setTitle] = useState('')
  const add = async () => {
    const t = title.trim()
    if (!t) return
    const r = await safeWrite(() => tasksRepo.create({
      ...defaults, title: t.slice(0, 300), status, order: Math.max(lastOrder + 1000, Date.now()), completedAt: status === 'completed' ? Date.now() : null,
    }))
    if (r) setTitle('')
  }
  return (
    <form className="mb-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); void add() }}>
      <Input aria-label={`Quick add to ${STATUS_LABEL[status]}`} placeholder="Add a task…" value={title} maxLength={300} className="h-8 py-1 text-xs"
        onChange={(e) => setTitle(e.target.value)} />
      <button type="submit" className="btn btn-ghost h-8 w-8 shrink-0 rounded-lg" aria-label={`Add task to ${STATUS_LABEL[status]}`} disabled={!title.trim()}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </form>
  )
}

/* ---------------- Sortable list ---------------- */
type ListKey = 'title' | 'status' | 'priority' | 'due' | 'project' | 'area'
const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, blocked: 2, completed: 3 }

export function TaskListTable({ tasks, projects, onOpen, showProject = true }: { tasks: Task[]; projects: Map<string, Project>; onOpen: (t: Task) => void; showProject?: boolean }) {
  const [sort, setSort] = useState<{ key: ListKey | null; dir: 1 | -1 }>({ key: null, dir: 1 })
  const rows = useMemo(() => {
    if (!sort.key) return tasks
    const pn = (t: Task) => (t.projectId ? projects.get(t.projectId)?.name ?? '' : '')
    const cmp: Record<ListKey, (a: Task, b: Task) => number> = {
      title: (a, b) => a.title.localeCompare(b.title),
      status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
      priority: (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
      due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
      project: (a, b) => pn(a).localeCompare(pn(b)),
      area: (a, b) => a.area.localeCompare(b.area),
    }
    return [...tasks].sort((a, b) => cmp[sort.key!](a, b) * sort.dir)
  }, [tasks, sort, projects])

  const cols: { key: ListKey; label: string; className?: string }[] = [
    { key: 'title', label: 'Title' }, { key: 'status', label: 'Status' }, { key: 'priority', label: 'Priority' }, { key: 'due', label: 'Due' },
    ...(showProject ? [{ key: 'project' as const, label: 'Project', className: 'hidden md:table-cell' }] : []),
    { key: 'area', label: 'Area', className: 'hidden sm:table-cell' },
  ]
  const today = todayISO()
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="w-8 p-2"><span className="sr-only">Done</span></th>
            {cols.map((c) => {
              const active = sort.key === c.key
              const Icon = active ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown
              return (
                <th key={c.key} className={cn('p-2 font-medium', c.className)} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-fg"
                    onClick={() => setSort((s) => (s.key !== c.key ? { key: c.key, dir: 1 } : s.dir === 1 ? { key: c.key, dir: -1 } : { key: null, dir: 1 }))}>
                    {c.label}<Icon className="h-3 w-3" aria-hidden />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const overdue = isOverdue(t, today)
            const sp = subtaskProgress(t)
            const p = t.projectId ? projects.get(t.projectId) : undefined
            return (
              <tr key={t.id} className={cn('border-b border-line/50 last:border-0 hover:bg-raised/40', overdue && 'bg-danger/5')}>
                <td className="p-2">
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={t.status === 'completed'} aria-label={`Completed: ${t.title}`}
                    onChange={() => void changeStatus(t, t.status === 'completed' ? 'todo' : 'completed')} />
                </td>
                <td className="max-w-[260px] p-2">
                  <button type="button" className={cn('text-left font-medium hover:text-accent', t.status === 'completed' && 'line-through opacity-70')} onClick={() => onOpen(t)}>
                    {t.isMilestone && '◆ '}{t.title || '(untitled)'}
                  </button>
                  {sp.total > 0 && <span className="ml-2 text-xs text-muted">{sp.done}/{sp.total}</span>}
                </td>
                <td className="p-2">
                  <select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => void changeStatus(t, e.target.value as TaskStatus)}
                    className="rounded-lg border border-line bg-transparent px-1 py-0.5 text-xs">
                    {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </td>
                <td className="p-2"><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></td>
                <td className={cn('whitespace-nowrap p-2', overdue && 'font-semibold text-danger')}>{t.dueDate ? fmtDate(t.dueDate, 'MMM d, yyyy') : '—'}{overdue && <span className="sr-only"> (overdue)</span>}</td>
                {showProject && <td className="hidden p-2 md:table-cell">{p ? <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: p.color ?? '#8b5cf6' }} aria-hidden />{p.name}</span> : <span className="text-muted">—</span>}</td>}
                <td className="hidden p-2 sm:table-cell"><Badge tone={AREA_TONE[t.area]}>{AREA_LABEL[t.area]}</Badge></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------- Today / Upcoming agenda ---------------- */
export function TaskAgenda({ tasks, projects, onOpen }: { tasks: Task[]; projects: Map<string, Project>; onOpen: (t: Task) => void }) {
  const groups = useMemo(() => {
    const today = todayISO()
    const tomorrow = toISODate(addDays(new Date(), 1))
    const week = toISODate(addDays(new Date(), 7))
    const g: { id: string; label: string; tone?: string; items: Task[] }[] = [
      { id: 'overdue', label: 'Overdue', tone: 'text-danger', items: [] },
      { id: 'today', label: 'Today', tone: 'text-warn', items: [] },
      { id: 'tomorrow', label: 'Tomorrow', items: [] },
      { id: 'week', label: 'Next 7 days', items: [] },
      { id: 'later', label: 'Later', items: [] },
      { id: 'none', label: 'No due date', items: [] },
      { id: 'done', label: 'Completed', items: [] },
    ]
    const by = Object.fromEntries(g.map((x) => [x.id, x]))
    for (const t of tasks) {
      if (t.status === 'completed') by.done.items.push(t)
      else if (!t.dueDate) by.none.items.push(t)
      else if (t.dueDate < today) by.overdue.items.push(t)
      else if (t.dueDate === today) by.today.items.push(t)
      else if (t.dueDate === tomorrow) by.tomorrow.items.push(t)
      else if (t.dueDate <= week) by.week.items.push(t)
      else by.later.items.push(t)
    }
    for (const x of g) if (x.id !== 'none' && x.id !== 'done') x.items.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    return g.filter((x) => x.items.length)
  }, [tasks])

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`agenda-${g.id}`}>
          <h3 id={`agenda-${g.id}`} className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', g.tone)}>
            {g.label}<span className="text-xs font-normal text-muted">({g.items.length})</span>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((t) => (
              <TaskCard key={t.id} task={t} project={t.projectId ? projects.get(t.projectId) : undefined} onOpen={onOpen} onStatusChange={(x, s) => void changeStatus(x, s)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}


