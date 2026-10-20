import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, CheckSquare, Columns3, List, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { visible } from '@/services/repo'
import { Button, EmptyState, PageHeader, Spinner, Tabs } from '@/components/ui'
import type { Project } from '@/types/models'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskAgenda, TaskBoard, TaskListTable } from '@/features/tasks/TaskBoard'
import { TaskFilterBar } from '@/features/tasks/TaskFilterBar'
import { isOverdue, useTaskFilters } from '@/features/tasks/taskUtils'

type View = 'board' | 'list' | 'agenda'
const VIEW_KEY = 'tasks.view'
const readView = (): View => {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'list' || v === 'agenda' ? v : 'board' } catch { return 'board' }
}

export function TasksPage() {
  const [params, setParams] = useSearchParams()
  const [view, setViewState] = useState<View>(readView)
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const all = useLiveQuery(() => db.tasks.toArray(), [])
  const projectList = useLiveQuery(() => db.projects.toArray(), [])
  const projects = useMemo(() => new Map((projectList ?? []).map((p) => [p.id, p])), [projectList])
  const activeProjects = useMemo(() => (projectList ?? []).filter(visible<Project>()).sort((a, b) => a.name.localeCompare(b.name)), [projectList])
  const { filters, set, reset, tasks, allTags, active } = useTaskFilters(all)

  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* storage unavailable */ } }

  // Deep link: ?open=<taskId>
  const openId = params.get('open')
  useEffect(() => {
    if (!openId) return
    setEditing({ id: openId })
    params.delete('open'); setParams(params, { replace: true })
  }, [openId, params, setParams])

  const stats = useMemo(() => {
    const live = (all ?? []).filter((t) => !t.deletedAt && !t.archived)
    return { open: live.filter((t) => t.status !== 'completed').length, overdue: live.filter((t) => isOverdue(t)).length }
  }, [all])

  const totalLive = (all ?? []).filter((t) => !t.deletedAt).length

  return (
    <div>
      <PageHeader title="Tasks" icon={CheckSquare}
        description={all ? `${stats.open} open${stats.overdue ? ` · ${stats.overdue} overdue` : ''}` : undefined}
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({ id: null })}>New task</Button>} />

      <Tabs label="Task views" value={view} onChange={setView}
        tabs={[{ id: 'board', label: 'Kanban', icon: Columns3 }, { id: 'list', label: 'List', icon: List }, { id: 'agenda', label: 'Today / Upcoming', icon: CalendarDays }]} />

      <TaskFilterBar filters={filters} set={set} reset={reset} active={active} projects={activeProjects} tags={allTags} />

      {!all || !projectList ? <Spinner label="Loading tasks" /> : totalLive === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks yet" action={<Button variant="primary" icon={Plus} onClick={() => setEditing({ id: null })}>Create your first task</Button>}>
          Capture to-dos with due dates, priorities, checklists and repeats. Drag them across the board as you make progress.
        </EmptyState>
      ) : view === 'board' ? (
        <>
          {active && tasks.length === 0 && <p className="mb-3 text-sm text-muted">No tasks match these filters.</p>}
          <TaskBoard tasks={tasks} projects={projects} onOpen={(t) => setEditing({ id: t.id })}
            quickAddDefaults={{ ...(filters.projectId && filters.projectId !== 'none' ? { projectId: filters.projectId } : {}), ...(filters.area ? { area: filters.area } : {}), ...(filters.priority ? { priority: filters.priority } : {}) }} />
          <p className="mt-1 text-xs text-muted">Tip: drag cards between columns, or use the arrows and status menu on each card with the keyboard.</p>
        </>
      ) : tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks match these filters" action={<Button onClick={reset}>Clear filters</Button>} />
      ) : view === 'list' ? (
        <TaskListTable tasks={tasks} projects={projects} onOpen={(t) => setEditing({ id: t.id })} />
      ) : (
        <TaskAgenda tasks={tasks} projects={projects} onOpen={(t) => setEditing({ id: t.id })} />
      )}

      <TaskEditor key={editing ? editing.id ?? 'new' : 'closed'} open={!!editing} taskId={editing?.id ?? null} onClose={() => setEditing(null)}
        defaults={{ ...(filters.projectId && filters.projectId !== 'none' ? { projectId: filters.projectId } : {}), ...(filters.area ? { area: filters.area } : {}) }} />
    </div>
  )
}
