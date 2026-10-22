import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, CalendarClock, FolderKanban, LayoutTemplate, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { projectsRepo } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Card, EmptyState, IconButton, Input, PageHeader, Progress, Select, Spinner } from '@/components/ui'
import type { Area, Project, ProjectStatus } from '@/types/models'
import { fmtDate, todayISO } from '@/lib/dates'
import { AREA_LABEL, AREA_TONE, PRIORITY_TONE } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProjectEditor } from '@/features/tasks/ProjectEditor'
import { TemplateGallery } from '@/features/projects/TemplateGallery'
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, projectIcon } from '@/features/tasks/projectIcons'
import { AREAS, PRIORITY_ORDER } from '@/features/tasks/taskUtils'

type Stats = Map<string, { total: number; done: number; overdue: number }>
const pctOf = (m: Stats, id: string) => { const s = m.get(id); return s && s.total ? Math.round((s.done / s.total) * 100) : 0 }

type Sort = 'updated' | 'name' | 'deadline' | 'priority' | 'progress'

export function ProjectsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ProjectStatus | '' | 'open'>('open')
  const [area, setArea] = useState<Area | ''>('')
  const [sort, setSort] = useState<Sort>('updated')
  const [favOnly, setFavOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [gallery, setGallery] = useState(false)

  const all = useLiveQuery(() => db.projects.toArray(), [])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])

  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !all) return
    const p = all.find((x) => x.id === openId)
    if (p) setEditing(p)
    params.delete('open'); setParams(params, { replace: true })
  }, [openId, all, params, setParams])

  const progress = useMemo(() => {
    const m = new Map<string, { total: number; done: number; overdue: number }>()
    const today = todayISO()
    for (const t of tasks ?? []) {
      if (t.deletedAt || !t.projectId) continue
      const s = m.get(t.projectId) ?? { total: 0, done: 0, overdue: 0 }
      s.total++
      if (t.status === 'completed') s.done++
      else if (t.dueDate && t.dueDate < today) s.overdue++
      m.set(t.projectId, s)
    }
    return m
  }, [tasks])
  const pct = (id: string) => pctOf(progress, id)

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (all ?? [])
      .filter((p) => !p.deletedAt && (showArchived ? p.archived : !p.archived))
      .filter((p) => !status || (status === 'open' ? p.status !== 'completed' && p.status !== 'cancelled' : p.status === status))
      .filter((p) => !area || p.area === area)
      .filter((p) => !favOnly || p.favorite)
      .filter((p) => !term || [p.name, p.description, ...p.tags].join(' ').toLowerCase().includes(term))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
        switch (sort) {
          case 'name': return a.name.localeCompare(b.name)
          case 'deadline': return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')
          case 'priority': return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
          case 'progress': return pctOf(progress, b.id) - pctOf(progress, a.id)
          default: return b.updatedAt - a.updatedAt
        }
      })
  }, [all, q, status, area, favOnly, showArchived, sort, progress])

  const trash = async (p: Project) => {
    const ok = await safeWrite(() => projectsRepo.trash(p.id).then(() => true))
    if (ok) toast(`“${p.name}” moved to trash`, 'success', { label: 'Undo', run: () => void safeWrite(() => projectsRepo.restore(p.id)) })
  }

  const filtered = q || status !== 'open' || area || favOnly || showArchived
  const today = todayISO()

  return (
    <div>
      <PageHeader title="Projects" icon={FolderKanban} description="Plan, track progress and hit deadlines."
        actions={<><Button icon={LayoutTemplate} onClick={() => setGallery(true)}>From template</Button><Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>New project</Button></>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search projects" placeholder="Search projects…" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Filter by status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Open (not completed/cancelled)</option>
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Select aria-label="Filter by area" className="w-auto" value={area} onChange={(e) => setArea(e.target.value as Area | '')}>
          <option value="">All areas</option>
          {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
        </Select>
        <Select aria-label="Sort projects" className="w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="updated">Sort: Recently updated</option>
          <option value="name">Sort: Name</option>
          <option value="deadline">Sort: Deadline</option>
          <option value="priority">Sort: Priority</option>
          <option value="progress">Sort: Progress</option>
        </Select>
        <IconButton icon={Star} label="Favorites only" active={favOnly} onClick={() => setFavOnly(!favOnly)} />
        <IconButton icon={Archive} label={showArchived ? 'Showing archived' : 'Show archived'} active={showArchived} onClick={() => setShowArchived(!showArchived)} />
      </div>

      {!all || !tasks ? <Spinner label="Loading projects" /> : items.length === 0 ? (
        <EmptyState icon={FolderKanban} title={filtered ? 'No projects match these filters' : 'No projects yet'}
          action={filtered
            ? <Button onClick={() => { setQ(''); setStatus('open'); setArea(''); setFavOnly(false); setShowArchived(false) }}>Clear filters</Button>
            : <div className="flex flex-wrap justify-center gap-2"><Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Create a project</Button><Button icon={LayoutTemplate} onClick={() => setGallery(true)} title="SEO, Marketing, Design and more">Use a template</Button></div>}>
          {!filtered && 'Group related tasks, documents and events into a project to track progress and deadlines.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const Icon = projectIcon(p.icon)
            const s = progress.get(p.id)
            const late = !!p.deadline && p.deadline < today && p.status !== 'completed' && p.status !== 'cancelled'
            return (
              <li key={p.id}>
                <Card hover className="flex h-full flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow" style={{ background: p.color ?? '#8b5cf6' }}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/projects/${p.id}`} className="block truncate font-semibold hover:text-accent">{p.name}</Link>
                      {p.description && <p className="line-clamp-2 text-xs text-muted">{p.description}</p>}
                    </div>
                    <IconButton icon={Star} label={p.favorite ? 'Unfavorite' : 'Favorite'} active={p.favorite} onClick={() => void safeWrite(() => projectsRepo.toggle(p.id, 'favorite'))} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                    <Badge tone={PRIORITY_TONE[p.priority]}>{p.priority}</Badge>
                    <Badge tone={AREA_TONE[p.area]}>{AREA_LABEL[p.area]}</Badge>
                    {p.tags.slice(0, 3).map((t) => <span key={t} className="text-xs text-accent">#{t}</span>)}
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{s?.total ? `${s.done} of ${s.total} tasks done` : 'No tasks yet'}</span>
                      <span className="tabular-nums">{pct(p.id)}%</span>
                    </div>
                    <Progress value={pct(p.id)} label={`${p.name} completion`} />
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className={cn('inline-flex items-center gap-1 text-muted', late && 'font-semibold text-danger')}>
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                      {p.deadline ? `Due ${fmtDate(p.deadline)}${late ? ' · overdue' : ''}` : 'No deadline'}
                      {s?.overdue ? <span className="text-danger"> · {s.overdue} late task{s.overdue > 1 ? 's' : ''}</span> : null}
                    </span>
                    <span className="flex">
                      <IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => setEditing(p)} />
                      <IconButton icon={p.archived ? ArchiveRestore : Archive} label={p.archived ? 'Unarchive' : 'Archive'}
                        onClick={() => void safeWrite(() => projectsRepo.toggle(p.id, 'archived'), p.archived ? 'Restored from archive' : 'Project archived')} />
                      <IconButton icon={Trash2} label={`Move ${p.name} to trash`} onClick={() => void trash(p)} />
                    </span>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <TemplateGallery open={gallery} onClose={() => setGallery(false)} />
      <ProjectEditor key={editing === 'new' ? 'new' : editing?.id ?? 'none'} open={!!editing} project={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)} onCreated={(p) => navigate(`/projects/${p.id}`)} />
    </div>
  )
}
