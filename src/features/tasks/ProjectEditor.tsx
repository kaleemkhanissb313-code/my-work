import { useState } from 'react'
import { projectsRepo } from '@/services/repo'
import { safeWrite } from '@/components/feedback'
import { Button, Field, Input, Modal, Select, TagInput, Textarea } from '@/components/ui'
import type { Area, Priority, Project, ProjectStatus } from '@/types/models'
import { AREA_LABEL } from '@/lib/format'
import { cn } from '@/lib/cn'
import { AREAS, PRIORITIES } from './taskUtils'
import { PROJECT_COLORS, PROJECT_ICONS, PROJECT_STATUSES } from './projectIcons'

type Draft = Pick<Project, 'name' | 'description' | 'startDate' | 'deadline' | 'status' | 'priority' | 'icon' | 'area' | 'tags'> & { color: string }

/** Create / edit project modal. Remount with a `key` per project. */
export function ProjectEditor({ project, open, onClose, onCreated }: { project: Project | null; open: boolean; onClose: () => void; onCreated?: (p: Project) => void }) {
  const [form, setForm] = useState<Draft>(() => project
    ? { name: project.name, description: project.description, startDate: project.startDate, deadline: project.deadline, status: project.status, priority: project.priority, icon: project.icon, area: project.area, tags: [...project.tags], color: project.color ?? PROJECT_COLORS[0] }
    : { name: '', description: '', startDate: null, deadline: null, status: 'planning', priority: 'medium', icon: 'Folder', area: 'work', tags: [], color: PROJECT_COLORS[0] })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required.'
    if (form.startDate && form.deadline && form.deadline < form.startDate) e.deadline = 'Deadline must be on or after the start date.'
    if (!/^#[0-9a-f]{6}$/i.test(form.color)) e.color = 'Pick a valid colour.'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    const data = { ...form, name: form.name.trim(), description: form.description.trim() }
    if (project) {
      const ok = await safeWrite(() => projectsRepo.update(project.id, data).then(() => true), 'Project saved')
      setSaving(false)
      if (ok) onClose()
    } else {
      const p = await safeWrite(() => projectsRepo.create(data), 'Project created')
      setSaving(false)
      if (p) { onClose(); onCreated?.(p) }
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'} wide
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>{project ? 'Save' : 'Create project'}</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={(ev) => { ev.preventDefault(); void save() }}>
        <Field label="Name *" error={errors.name} htmlFor="proj-name" className="sm:col-span-2">
          <Input id="proj-name" value={form.name} maxLength={200} aria-invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="proj-desc" className="sm:col-span-2">
          <Textarea id="proj-desc" value={form.description} maxLength={5000} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Start date" htmlFor="proj-start">
          <Input id="proj-start" type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
        </Field>
        <Field label="Deadline" error={errors.deadline} htmlFor="proj-deadline">
          <Input id="proj-deadline" type="date" value={form.deadline ?? ''} aria-invalid={!!errors.deadline} onChange={(e) => set('deadline', e.target.value || null)} />
        </Field>
        <Field label="Status" htmlFor="proj-status">
          <Select id="proj-status" value={form.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
            {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="proj-pri">
          <Select id="proj-pri" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="Area" htmlFor="proj-area">
          <Select id="proj-area" value={form.area} onChange={(e) => set('area', e.target.value as Area)}>
            {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </Select>
        </Field>
        <Field label="Colour" error={errors.color}>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Project colour">
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={form.color === c} aria-label={c} onClick={() => set('color', c)}
                className={cn('h-7 w-7 rounded-full border-2', form.color === c ? 'border-fg' : 'border-transparent')} style={{ background: c }} />
            ))}
            <input type="color" aria-label="Custom colour" value={form.color} onChange={(e) => set('color', e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent" />
          </div>
        </Field>
        <Field label="Icon" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Project icon">
            {Object.entries(PROJECT_ICONS).map(([name, I]) => (
              <button key={name} type="button" role="radio" aria-checked={form.icon === name} aria-label={name} title={name} onClick={() => set('icon', name)}
                className={cn('grid h-9 w-9 place-items-center rounded-xl border', form.icon === name ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg')}>
                <I className="h-4 w-4" aria-hidden />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Tags" className="sm:col-span-2"><TagInput value={form.tags} onChange={(t) => set('tags', t)} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
