import { useState, type DragEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, Copy, Diamond, ListChecks, Plus, Repeat, Trash2, X,
} from 'lucide-react'
import { db } from '@/lib/db'
import { tasksRepo, visible } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Field, IconButton, Input, Modal, Select, Spinner, TagInput, Textarea, Toggle } from '@/components/ui'
import { RecurrenceEditor } from '@/components/RecurrenceEditor'
import type { Area, Priority, Project, Subtask, Task, TaskStatus } from '@/types/models'
import { describeRecurrence, fmtDate, todayISO } from '@/lib/dates'
import { AREA_LABEL, AREA_TONE, PRIORITY_TONE } from '@/lib/format'
import { uid } from '@/lib/id'
import { cn } from '@/lib/cn'
import { AREAS, PRIORITIES, STATUSES, STATUS_LABEL, isOverdue, spawnNextOccurrence, statusPatch, subtaskProgress } from './taskUtils'

export { useTaskFilters } from './taskUtils'

type Draft = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'syncedAt'> & { id?: string }

const blankDraft = (defaults: Partial<Task> = {}): Draft => ({
  title: '', description: '', status: 'todo', priority: 'medium', startDate: null, dueDate: null, projectId: null, area: 'personal',
  category: '', subtasks: [], estimateMins: null, actualMins: 0, recurrence: null, completedAt: null, order: Date.now(), isMilestone: false,
  deletedAt: null, archived: false, favorite: false, pinned: false, tags: [], ...defaults,
})

export interface TaskEditorProps {
  /** Existing task id, or null to create a new task. */
  taskId: string | null
  open: boolean
  onClose: () => void
  /** Defaults for a new task (e.g. projectId, status, dueDate). */
  defaults?: Partial<Task>
}

/** Modal editor for a Task. Pass `taskId=null` to create a new one. Remount with a `key` per task. */
export function TaskEditor({ taskId, open, onClose, defaults }: TaskEditorProps) {
  // undefined = loading, null = new task or not found
  const task = useLiveQuery(async (): Promise<Task | null> => (taskId ? (await db.tasks.get(taskId)) ?? null : null), [taskId])
  const projects = useLiveQuery(() => db.projects.toArray().then((ps) => ps.filter(visible<Project>()).sort((a, b) => a.name.localeCompare(b.name))), [])
  if (!open) return null
  if (taskId && task === undefined) {
    return <Modal open onClose={onClose} title="Task"><Spinner /></Modal>
  }
  if (taskId && !task) {
    return <Modal open onClose={onClose} title="Task not found"><p className="text-sm text-muted">This task no longer exists. It may have been permanently deleted.</p></Modal>
  }
  return <TaskForm key={task?.id ?? 'new'} task={task ?? null} defaults={defaults} projects={projects ?? []} onClose={onClose} />
}

function TaskForm({ task, defaults, projects, onClose }: { task: Task | null; defaults?: Partial<Task>; projects: Project[]; onClose: () => void }) {
  const [form, setForm] = useState<Draft>(() => (task ? { ...task, subtasks: task.subtasks.map((s) => ({ ...s })), tags: [...task.tags] } : blankDraft(defaults)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [newSub, setNewSub] = useState('')
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'Title is required.'
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) e.dueDate = 'Due date must be on or after the start date.'
    if (form.estimateMins != null && (!Number.isFinite(form.estimateMins) || form.estimateMins < 0)) e.estimateMins = 'Enter a positive number of minutes.'
    if (!Number.isFinite(form.actualMins) || form.actualMins < 0) e.actualMins = 'Enter a positive number of minutes.'
    setErrors(e)
    return !Object.keys(e).length
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    const { id: _id, createdAt: _c, updatedAt: _u, version: _v, syncedAt: _s, deletedAt: _d, ...editable } = form as Draft & Partial<Task>
    const data: Partial<Task> = {
      ...editable, title: form.title.trim(), category: form.category.trim(),
      subtasks: form.subtasks.filter((s) => s.title.trim()).map((s) => ({ ...s, title: s.title.trim() })),
    }
    let ok: unknown
    if (task) {
      Object.assign(data, statusPatch(task, form.status))
      ok = await safeWrite(async () => {
        await tasksRepo.update(task.id, data)
        if (form.status === 'completed' && task.status !== 'completed' && form.recurrence) {
          const next = await spawnNextOccurrence({ ...task, ...data } as Task)
          if (next) toast(`Next occurrence scheduled${next.dueDate ? ` for ${fmtDate(next.dueDate)}` : ''}`, 'info')
        }
        return true
      }, 'Task saved')
    } else {
      data.completedAt = form.status === 'completed' ? Date.now() : null
      ok = await safeWrite(() => tasksRepo.create(data), 'Task created')
    }
    setSaving(false)
    if (ok !== undefined) onClose()
  }

  const duplicate = async () => {
    if (!task) return
    const copy = await safeWrite(() => tasksRepo.duplicate(task.id, (t) => ({
      title: `${t.title} (copy)`, status: 'todo', completedAt: null, actualMins: 0, order: Date.now(),
      subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
    })), 'Task duplicated')
    if (copy) onClose()
  }
  const archive = async () => {
    if (!task) return
    const r = await safeWrite(() => tasksRepo.toggle(task.id, 'archived').then(() => true), task.archived ? 'Restored from archive' : 'Task archived')
    if (r) onClose()
  }
  const trash = async () => {
    if (!task) return
    const r = await safeWrite(() => tasksRepo.trash(task.id).then(() => true))
    if (r) {
      toast('Task moved to trash', 'success', { label: 'Undo', run: () => void safeWrite(() => tasksRepo.restore(task.id)) })
      onClose()
    }
  }

  // Subtasks
  const updSub = (id: string, patch: Partial<Subtask>) => set('subtasks', form.subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const moveSub = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= form.subtasks.length) return
    const a = [...form.subtasks];
    [a[i], a[j]] = [a[j], a[i]]
    set('subtasks', a)
  }
  const addSub = () => {
    const t = newSub.trim()
    if (!t) return
    set('subtasks', [...form.subtasks, { id: uid(), title: t.slice(0, 300), done: false }])
    setNewSub('')
  }
  const sp = { done: form.subtasks.filter((s) => s.done).length, total: form.subtasks.length }

  return (
    <Modal open onClose={onClose} title={task ? 'Edit task' : 'New task'} wide
      footer={<>
        {task && <>
          <Button size="sm" icon={Copy} onClick={duplicate}>Duplicate</Button>
          <Button size="sm" icon={task.archived ? ArchiveRestore : Archive} onClick={archive}>{task.archived ? 'Unarchive' : 'Archive'}</Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={trash} className="text-danger sm:mr-auto">Move to trash</Button>
        </>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={save}>{task ? 'Save' : 'Create task'}</Button>
      </>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
        <Field label="Title *" error={errors.title} htmlFor="task-title" className="sm:col-span-2">
          <Input id="task-title" value={form.title} maxLength={300} aria-invalid={!!errors.title} onChange={(e) => set('title', e.target.value)} placeholder="What needs to be done?" />
        </Field>
        <Field label="Description" htmlFor="task-desc" className="sm:col-span-2">
          <Textarea id="task-desc" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={10000} />
        </Field>
        <Field label="Status" htmlFor="task-status">
          <Select id="task-status" value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="task-pri">
          <Select id="task-pri" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p[0].toUpperCase() + p.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="Area" htmlFor="task-area">
          <Select id="task-area" value={form.area} onChange={(e) => set('area', e.target.value as Area)}>
            {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </Select>
        </Field>
        <Field label="Project" htmlFor="task-proj">
          <Select id="task-proj" value={form.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || null)}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {form.projectId && !projects.some((p) => p.id === form.projectId) && <option value={form.projectId}>(archived or deleted project)</option>}
          </Select>
        </Field>
        <Field label="Category" htmlFor="task-cat">
          <Input id="task-cat" value={form.category} onChange={(e) => set('category', e.target.value)} maxLength={80} placeholder="e.g. Errands, Design" />
        </Field>
        <div className="flex items-end"><div className="w-full"><Toggle label="Milestone" description="Shown as a diamond on timelines" checked={!!form.isMilestone} onChange={(v) => set('isMilestone', v)} /></div></div>
        <Field label="Start date" htmlFor="task-start">
          <Input id="task-start" type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
        </Field>
        <Field label="Due date" error={errors.dueDate} htmlFor="task-due">
          <Input id="task-due" type="date" value={form.dueDate ?? ''} aria-invalid={!!errors.dueDate} onChange={(e) => set('dueDate', e.target.value || null)} />
        </Field>
        <Field label="Estimate (minutes)" error={errors.estimateMins} htmlFor="task-est">
          <Input id="task-est" type="number" min={0} step={5} inputMode="numeric" value={form.estimateMins ?? ''}
            onChange={(e) => set('estimateMins', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <Field label="Actual (minutes)" error={errors.actualMins} htmlFor="task-act">
          <Input id="task-act" type="number" min={0} step={5} inputMode="numeric" value={form.actualMins}
            onChange={(e) => set('actualMins', e.target.value === '' ? 0 : Number(e.target.value))} />
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="label flex items-center gap-2"><ListChecks className="h-3.5 w-3.5" aria-hidden />Checklist {sp.total > 0 && <span>({sp.done}/{sp.total})</span>}</legend>
          <ul className="space-y-1.5">
            {form.subtasks.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={s.done} aria-label={`Done: ${s.title || 'subtask'}`}
                  onChange={(e) => updSub(s.id, { done: e.target.checked })} />
                <Input aria-label={`Subtask ${i + 1}`} value={s.title} maxLength={300} className={cn('h-8 py-1', s.done && 'line-through opacity-70')}
                  onChange={(e) => updSub(s.id, { title: e.target.value })} />
                <IconButton icon={ArrowUp} label={`Move "${s.title}" up`} disabled={i === 0} onClick={() => moveSub(i, -1)} className="h-8 w-8" />
                <IconButton icon={ArrowDown} label={`Move "${s.title}" down`} disabled={i === form.subtasks.length - 1} onClick={() => moveSub(i, 1)} className="h-8 w-8" />
                <IconButton icon={X} label={`Delete "${s.title}"`} onClick={() => set('subtasks', form.subtasks.filter((x) => x.id !== s.id))} className="h-8 w-8" />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Input aria-label="New subtask" placeholder="Add a checklist item…" value={newSub} maxLength={300} className="h-8 py-1"
              onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub() } }} />
            <Button size="sm" icon={Plus} onClick={addSub} disabled={!newSub.trim()}>Add</Button>
          </div>
        </fieldset>

        <Field label="Repeat" className="sm:col-span-2" hint={form.recurrence ? 'Completing this task creates the next occurrence automatically.' : undefined}>
          <RecurrenceEditor value={form.recurrence} onChange={(r) => set('recurrence', r)} />
        </Field>
        <Field label="Tags" className="sm:col-span-2"><TagInput value={form.tags} onChange={(t) => set('tags', t)} /></Field>
        {task?.completedAt && form.status === 'completed' && (
          <p className="text-xs text-muted sm:col-span-2">Completed {new Date(task.completedAt).toLocaleString()}</p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/* ---------------- Task card ---------------- */
export interface TaskCardProps {
  task: Task
  project?: Project
  onOpen: (t: Task) => void
  onStatusChange?: (t: Task, s: TaskStatus) => void
  /** Move within column (-1 up, +1 down). */
  onMove?: (t: Task, dir: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  draggable?: boolean
  onDragStart?: (e: DragEvent, t: Task) => void
  onDragEnd?: () => void
  dragging?: boolean
  showProject?: boolean
}

export function TaskCard({ task: t, project, onOpen, onStatusChange, onMove, canMoveUp, canMoveDown, draggable, onDragStart, onDragEnd, dragging, showProject = true }: TaskCardProps) {
  const overdue = isOverdue(t)
  const sp = subtaskProgress(t)
  const idx = STATUSES.findIndex((s) => s.id === t.status)
  return (
    <article draggable={draggable} onDragStart={(e) => onDragStart?.(e, t)} onDragEnd={onDragEnd} aria-label={t.title}
      className={cn('card group p-3 text-sm', draggable && 'cursor-grab active:cursor-grabbing', dragging && 'opacity-40', overdue && 'border-danger/60', t.status === 'completed' && 'opacity-70')}>
      <div className="flex items-start gap-2">
        {onStatusChange && (
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--accent))]" checked={t.status === 'completed'}
            aria-label={`Mark "${t.title}" ${t.status === 'completed' ? 'not completed' : 'completed'}`}
            onChange={() => onStatusChange(t, t.status === 'completed' ? 'todo' : 'completed')} />
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(t)}>
          <span className={cn('flex items-center gap-1.5 font-medium', t.status === 'completed' && 'line-through')}>
            {t.isMilestone && <Diamond className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Milestone" />}
            <span className="break-words">{t.title || '(untitled)'}</span>
            {t.recurrence && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={describeRecurrence(t.recurrence)} />}
          </span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {t.priority !== 'medium' && <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>}
        {t.dueDate && (
          <span className={cn('inline-flex items-center gap-1', overdue && 'font-semibold text-danger', t.dueDate === todayISO() && !overdue && 'text-warn')}>
            <CalendarClock className="h-3 w-3" aria-hidden />{fmtDate(t.dueDate, 'MMM d')}{overdue && ' · overdue'}
          </span>
        )}
        {showProject && project && (
          <span className="inline-flex max-w-[140px] items-center gap-1 truncate"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project.color ?? '#8b5cf6' }} aria-hidden />{project.name}</span>
        )}
        <Badge tone={AREA_TONE[t.area]}>{AREA_LABEL[t.area]}</Badge>
        {t.tags.slice(0, 3).map((tag) => <span key={tag} className="text-accent">#{tag}</span>)}
      </div>
      {sp.total > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          <div className="progress-track h-1.5" role="progressbar" aria-valuenow={Math.round((sp.done / sp.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress">
            <div className="progress-bar" style={{ width: `${(sp.done / sp.total) * 100}%` }} />
          </div>
          <span className="shrink-0 tabular-nums">{sp.done}/{sp.total}</span>
        </div>
      )}
      {(onStatusChange || onMove) && (
        <div className="mt-2 flex items-center gap-0.5 border-t border-line/60 pt-2">
          {onStatusChange && <>
            <IconButton icon={ArrowLeft} label={idx > 0 ? `Move to ${STATUSES[idx - 1].label}` : 'Already in first column'} disabled={idx <= 0} className="h-7 w-7"
              onClick={() => onStatusChange(t, STATUSES[idx - 1].id)} />
            <select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => onStatusChange(t, e.target.value as TaskStatus)}
              className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-1 py-0.5 text-xs">
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{STATUS_LABEL[s.id]}</option>)}
            </select>
            <IconButton icon={ArrowRight} label={idx < STATUSES.length - 1 ? `Move to ${STATUSES[idx + 1].label}` : 'Already in last column'} disabled={idx >= STATUSES.length - 1} className="h-7 w-7"
              onClick={() => onStatusChange(t, STATUSES[idx + 1].id)} />
          </>}
          {onMove && <>
            <IconButton icon={ArrowUp} label={`Move "${t.title}" up`} disabled={!canMoveUp} className="h-7 w-7" onClick={() => onMove(t, -1)} />
            <IconButton icon={ArrowDown} label={`Move "${t.title}" down`} disabled={!canMoveDown} className="h-7 w-7" onClick={() => onMove(t, 1)} />
          </>}
        </div>
      )}
    </article>
  )
}
