import { useMemo, useState } from 'react'
import { addDays, differenceInCalendarDays } from 'date-fns'
import type { Area, Priority, Task, TaskStatus } from '@/types/models'
import { nextOccurrence, parseDate, toISODate, todayISO } from '@/lib/dates'
import { tasksRepo } from '@/services/repo'
import { uid } from '@/lib/id'

export const STATUSES: { id: TaskStatus; label: string; tone: 'muted' | 'accent' | 'danger' | 'ok' }[] = [
  { id: 'todo', label: 'To do', tone: 'muted' },
  { id: 'in_progress', label: 'In progress', tone: 'accent' },
  { id: 'blocked', label: 'Blocked', tone: 'danger' },
  { id: 'completed', label: 'Completed', tone: 'ok' },
]
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' }
export const STATUS_TONE: Record<TaskStatus, 'muted' | 'accent' | 'danger' | 'ok'> = { todo: 'muted', in_progress: 'accent', blocked: 'danger', completed: 'ok' }
export const STATUS_COLOR: Record<TaskStatus, string> = { todo: '#94a3b8', in_progress: '#8b5cf6', blocked: '#ef4444', completed: '#10b981' }
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
export const AREAS: Area[] = ['personal', 'work', 'home', 'life']

export const isOverdue = (t: Task, today = todayISO()) => t.status !== 'completed' && !!t.dueDate && t.dueDate < today
export const subtaskProgress = (t: Task) => ({ done: t.subtasks.filter((s) => s.done).length, total: t.subtasks.length })

/** Patch to apply when a task's status changes (keeps completedAt consistent). */
export function statusPatch(t: Task, status: TaskStatus): Partial<Task> {
  return { status, completedAt: status === 'completed' ? (t.status === 'completed' && t.completedAt ? t.completedAt : Date.now()) : null }
}

/**
 * If `t` is recurring and is transitioning to completed, create the next occurrence.
 * Returns the created task (or undefined when not applicable / series ended).
 */
export async function spawnNextOccurrence(t: Task): Promise<Task | undefined> {
  if (!t.recurrence) return
  const base = t.dueDate ?? t.startDate ?? todayISO()
  const next = nextOccurrence(base, t.recurrence)
  if (!next) return
  const delta = differenceInCalendarDays(parseDate(next), parseDate(base))
  const shift = (d: string | null) => (d ? toISODate(addDays(parseDate(d), delta)) : null)
  const { id: _id, createdAt: _c, updatedAt: _u, version: _v, syncedAt: _s, ...rest } = t
  return tasksRepo.create({
    ...rest,
    tags: [...t.tags],
    status: 'todo',
    completedAt: null,
    actualMins: 0,
    dueDate: t.dueDate || !t.startDate ? next : null,
    startDate: t.dueDate ? shift(t.startDate) : t.startDate ? next : null,
    subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
    order: Date.now(),
  })
}

/** Change status, persisting completedAt and spawning the next recurrence when completing. */
export async function setTaskStatus(t: Task, status: TaskStatus, extra: Partial<Task> = {}) {
  await tasksRepo.update(t.id, { ...statusPatch(t, status), ...extra })
  if (status === 'completed' && t.status !== 'completed') return spawnNextOccurrence(t)
  return undefined
}

export type TaskSort = 'manual' | 'due' | 'priority' | 'title' | 'updated' | 'created'

export interface TaskFilters {
  q: string
  area: Area | ''
  projectId: string
  priority: Priority | ''
  status: TaskStatus | ''
  tag: string
  showCompleted: boolean
  showArchived: boolean
  sort: TaskSort
}
export const DEFAULT_FILTERS: TaskFilters = { q: '', area: '', projectId: '', priority: '', status: '', tag: '', showCompleted: true, showArchived: false, sort: 'manual' }

export function sortTasks(list: Task[], sort: TaskSort) {
  const s = [...list]
  s.sort((a, b) => {
    switch (sort) {
      case 'due':
        if (!a.dueDate || !b.dueDate) return a.dueDate ? -1 : b.dueDate ? 1 : a.order - b.order
        return a.dueDate.localeCompare(b.dueDate) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      case 'priority': return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9')
      case 'title': return a.title.localeCompare(b.title)
      case 'updated': return b.updatedAt - a.updatedAt
      case 'created': return b.createdAt - a.createdAt
      default: return a.order - b.order
    }
  })
  return s
}

export function applyTaskFilters(all: Task[], f: TaskFilters, fixedProjectId?: string) {
  const term = f.q.trim().toLowerCase()
  return sortTasks(all.filter((t) => {
    if (t.deletedAt) return false
    if (f.showArchived ? !t.archived : t.archived) return false
    if (fixedProjectId && t.projectId !== fixedProjectId) return false
    if (!fixedProjectId && f.projectId && (f.projectId === 'none' ? t.projectId : t.projectId !== f.projectId)) return false
    if (f.area && t.area !== f.area) return false
    if (f.priority && t.priority !== f.priority) return false
    if (f.status && t.status !== f.status) return false
    if (f.tag && !t.tags.includes(f.tag)) return false
    if (!f.showCompleted && t.status === 'completed') return false
    if (term && ![t.title, t.description, t.category, ...t.tags, ...t.subtasks.map((s) => s.title)].join(' ').toLowerCase().includes(term)) return false
    return true
  }), f.sort)
}

/** Filter state + derived list. */
export function useTaskFilters(all: Task[] | undefined, fixedProjectId?: string, initial: Partial<TaskFilters> = {}) {
  const [filters, setFilters] = useState<TaskFilters>({ ...DEFAULT_FILTERS, ...initial })
  const tasks = useMemo(() => (all ? applyTaskFilters(all, filters, fixedProjectId) : []), [all, filters, fixedProjectId])
  const allTags = useMemo(() => [...new Set((all ?? []).filter((t) => !t.deletedAt).flatMap((t) => t.tags))].sort(), [all])
  const set = <K extends keyof TaskFilters>(k: K, v: TaskFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const active = filters.q || filters.area || filters.projectId || filters.priority || filters.status || filters.tag || !filters.showCompleted || filters.showArchived
  return { filters, set, reset: () => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort }), tasks, allTags, active: !!active }
}

export const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
