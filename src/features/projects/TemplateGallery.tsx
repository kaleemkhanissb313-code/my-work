import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, CheckSquare, Diamond, LayoutTemplate, Search } from 'lucide-react'
import { Badge, Button, Checkbox, Field, Input, Modal, Select } from '@/components/ui'
import { safeWrite } from '@/components/feedback'
import { projectIcon } from '@/features/tasks/projectIcons'
import { AREA_LABEL } from '@/lib/format'
import { fmtDate, todayISO } from '@/lib/dates'
import { cn } from '@/lib/cn'
import type { Area } from '@/types/models'
import { PROJECT_TEMPLATES, TEMPLATE_CATEGORIES, type ProjectTemplate, type TemplateCategory } from './templates'
import { createProjectFromTemplate, planTasks } from './fromTemplate'

export function TemplateGallery({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const [cat, setCat] = useState<TemplateCategory | ''>('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<ProjectTemplate | null>(null)
  const [name, setName] = useState('')
  const [start, setStart] = useState(todayISO())
  const [area, setArea] = useState<Area>('work')
  const [brief, setBrief] = useState(true)
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => PROJECT_TEMPLATES.filter((t) => (!cat || t.category === cat) && (!q || `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(q.toLowerCase()))), [cat, q])
  const preview = useMemo(() => (picked ? planTasks(picked, start || todayISO(), 'preview', area) : []), [picked, start, area])
  const pick = (t: ProjectTemplate) => { setPicked(t); setName(t.name); setArea(t.area) }
  const close = () => { setPicked(null); onClose() }

  const create = async () => {
    if (!picked || !start) return
    setBusy(true)
    const p = await safeWrite(() => createProjectFromTemplate(picked, { name, start, area, withBrief: brief }), `Project created with ${picked.tasks.length} tasks`)
    setBusy(false)
    if (p) { close(); nav(`/projects/${p.id}`) }
  }

  return (
    <Modal open={open} onClose={close} wide title={picked ? `Template: ${picked.name}` : 'Start from a template'}
      footer={picked ? <>
        <Button className="mr-auto" onClick={() => setPicked(null)}>← All templates</Button>
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!start} onClick={create}>Create project</Button>
      </> : <Button onClick={close}>Close</Button>}>
      {!picked ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search templates" className="pl-9" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Template category">
            {(['', ...TEMPLATE_CATEGORIES] as const).map((c) => (
              <button key={c || 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
                className={cn('chip px-3 py-1 text-xs', cat === c ? 'border-accent bg-accent text-onaccent' : 'border-line text-muted hover:text-fg')}>{c || 'All'}</button>
            ))}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((t) => {
              const Icon = projectIcon(t.icon)
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => pick(t)} className="card card-hover flex h-full w-full flex-col p-4 text-left">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow" style={{ background: t.color }}><Icon className="h-5 w-5" aria-hidden /></span>
                      <div className="min-w-0"><div className="truncate font-semibold">{t.name}</div><Badge>{t.category}</Badge></div>
                    </div>
                    <p className="flex-1 text-sm text-muted">{t.description}</p>
                    <div className="mt-3 flex gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" aria-hidden />{t.tasks.length} tasks</span>
                      <span className="flex items-center gap-1"><Diamond className="h-3.5 w-3.5" aria-hidden />{t.tasks.filter((x) => x.milestone).length} milestones</span>
                      <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{t.durationDays} days</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {!list.length && <p className="py-8 text-center text-sm text-muted">No templates match.</p>}
        </>
      ) : (
        <div>
          <p className="mb-4 text-sm text-muted">{picked.description}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Project name" htmlFor="tpl-name" className="sm:col-span-3"><Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Start date" htmlFor="tpl-start" hint={start ? `Deadline: ${fmtDate(preview.at(-1)?.dueDate ?? start)}` : undefined}><Input id="tpl-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Area" htmlFor="tpl-area"><Select id="tpl-area" value={area} onChange={(e) => setArea(e.target.value as Area)}>{(Object.keys(AREA_LABEL) as Area[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}</Select></Field>
            <div className="flex items-end pb-2"><Checkbox label="Create a project brief document" checked={brief} onChange={setBrief} /></div>
          </div>
          <h3 className="mb-2 mt-5 flex items-center gap-2 text-sm font-semibold"><LayoutTemplate className="h-4 w-4 text-accent" aria-hidden />Plan preview</h3>
          <ol className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            {preview.map((x) => (
              <li key={x.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-raised/60">
                <span className="w-16 shrink-0 text-xs text-muted">{fmtDate(x.dueDate, 'MMM d')}</span>
                {x.isMilestone ? <Diamond className="h-3.5 w-3.5 shrink-0 text-life" aria-label="Milestone" /> : <span className="h-3.5 w-3.5 shrink-0 rounded border border-line" aria-hidden />}
                <span className={cn('min-w-0 flex-1 truncate', x.isMilestone && 'font-semibold')}>{x.title}</span>
                <Badge className="hidden sm:inline-flex">{x.category}</Badge>
                {x.priority !== 'medium' && <Badge tone={x.priority === 'urgent' ? 'danger' : x.priority === 'high' ? 'warn' : 'muted'}>{x.priority}</Badge>}
                {!!x.subtasks.length && <span className="text-xs text-muted">{x.subtasks.length} steps</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  )
}
