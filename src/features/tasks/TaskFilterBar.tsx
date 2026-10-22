import { Search, X } from 'lucide-react'
import { Button, Checkbox, Input, Select } from '@/components/ui'
import type { Area, Priority, Project, TaskStatus } from '@/types/models'
import { AREA_LABEL } from '@/lib/format'
import { AREAS, PRIORITIES, STATUSES, type TaskFilters, type TaskSort } from './taskUtils'

export function TaskFilterBar({ filters, set, reset, active, projects, tags, hideProject }: {
  filters: TaskFilters
  set: <K extends keyof TaskFilters>(k: K, v: TaskFilters[K]) => void
  reset: () => void
  active: boolean
  projects: Project[]
  tags: string[]
  hideProject?: boolean
}) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search tasks" placeholder="Search tasks…" className="ps-9" value={filters.q} onChange={(e) => set('q', e.target.value)} />
        </div>
        <Select aria-label="Filter by area" className="w-auto" value={filters.area} onChange={(e) => set('area', e.target.value as Area | '')}>
          <option value="">All areas</option>
          {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
        </Select>
        {!hideProject && (
          <Select aria-label="Filter by project" className="w-auto max-w-[180px]" value={filters.projectId} onChange={(e) => set('projectId', e.target.value)}>
            <option value="">All projects</option>
            <option value="none">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        <Select aria-label="Filter by priority" className="w-auto" value={filters.priority} onChange={(e) => set('priority', e.target.value as Priority | '')}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </Select>
        <Select aria-label="Filter by status" className="w-auto" value={filters.status} onChange={(e) => set('status', e.target.value as TaskStatus | '')}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        {tags.length > 0 && (
          <Select aria-label="Filter by tag" className="w-auto" value={filters.tag} onChange={(e) => set('tag', e.target.value)}>
            <option value="">Any tag</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </Select>
        )}
        <Select aria-label="Sort tasks" className="w-auto" value={filters.sort} onChange={(e) => set('sort', e.target.value as TaskSort)}>
          <option value="manual">Sort: Manual order</option>
          <option value="due">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="title">Sort: Title</option>
          <option value="updated">Sort: Recently updated</option>
          <option value="created">Sort: Newest</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox label="Show completed" checked={filters.showCompleted} onChange={(v) => set('showCompleted', v)} />
        <Checkbox label="Show archived only" checked={filters.showArchived} onChange={(v) => set('showArchived', v)} />
        {active && <Button size="sm" variant="ghost" icon={X} onClick={reset}>Clear filters</Button>}
      </div>
    </div>
  )
}
