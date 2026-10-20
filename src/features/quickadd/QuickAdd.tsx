import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, CheckSquare, CornerDownLeft, Sparkles, Wand2 } from 'lucide-react'
import { db } from '@/lib/db'
import { createStore } from '@/lib/store'
import { eventsRepo, projectsRepo, tasksRepo } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Modal } from '@/components/ui'
import { eventTimes, parseQuickAdd, type QuickKind, type QuickParse } from '@/lib/quickParse'
import { describeRecurrence, fmtDate, localTimeZone } from '@/lib/dates'
import { cn } from '@/lib/cn'
import type { Project } from '@/types/models'

export const quickAddState = createStore<{ open: boolean; initial: string }>({ open: false, initial: '' })
export const openQuickAdd = (initial = '') => quickAddState.set({ open: true, initial })

const EXAMPLES = [
  'Pay electricity bill tomorrow #bills !high @home',
  'Client call fri 3pm for 30m +Website-Redesign @work',
  'Write blog post next week ~2h #content',
  'Call mom every sunday 7pm',
  'Dentist oct 28 at 9:30',
]
/** d/m vs m/d for "25/10"-style dates follows the browser locale. */
const dayFirst = () => !/^en-US|^en-PH|^en-CA/i.test(navigator.language || '')

const TONE: Record<QuickParse['parts'][number]['type'], Parameters<typeof Badge>[0]['tone']> = {
  date: 'accent', time: 'accent', duration: 'accent', estimate: 'muted', tag: 'accent', priority: 'warn', area: 'home', project: 'work', repeat: 'life', kind: 'muted',
}

function matchProject(projects: Project[] | undefined, q: string | null) {
  if (!q || !projects) return null
  const k = q.toLowerCase()
  return projects.find((p) => p.name.toLowerCase() === k) ?? projects.find((p) => p.name.toLowerCase().includes(k)) ?? null
}

/** Create the task/event described by a parse result. Returns a path to open it. */
export async function createFromQuickAdd(parsed: QuickParse, kind: QuickKind, projects: Project[]): Promise<string | null> {
  if (!parsed.title) throw new Error('Add a title, e.g. "Buy milk tomorrow".')
  let projectId: string | null = matchProject(projects, parsed.project)?.id ?? null
  if (parsed.project && !projectId) {
    const p = await projectsRepo.create({ name: parsed.project, status: 'active', area: parsed.area ?? 'work' })
    projectId = p.id
  }
  if (kind === 'task') {
    const t = await tasksRepo.create({
      title: parsed.title, dueDate: parsed.date, tags: parsed.tags, priority: parsed.priority ?? 'medium', area: parsed.area ?? 'personal',
      projectId, recurrence: parsed.recurrence, estimateMins: parsed.estimateMins,
      description: parsed.time ? `Time: ${parsed.time}` : '',
    })
    return `/tasks?open=${t.id}`
  }
  const times = eventTimes(parsed)
  const e = await eventsRepo.create({
    title: parsed.title, ...times, timeZone: localTimeZone(), tags: parsed.tags, area: parsed.area ?? 'personal', projectId, recurrence: parsed.recurrence,
    kind: /meeting|call|sync|standup/i.test(parsed.title) ? 'meeting' : 'event',
  })
  return `/calendar?open=${e.id}`
}

export function QuickAddDialog() {
  const { open, initial } = quickAddState.use()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<QuickKind | null>(null) // null = follow the parser
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deletedAt && !p.archived).toArray(), [])
  useEffect(() => { if (open) { setText(initial); setKind(null) } }, [open, initial])

  const parsed = useMemo(() => parseQuickAdd(text, new Date(), { dayFirst: dayFirst() }), [text])
  const effKind = kind ?? parsed.kind
  const project = matchProject(projects, parsed.project)
  const close = () => quickAddState.set({ open: false, initial: '' })

  const submit = async (keepOpen: boolean) => {
    if (busy) return
    setBusy(true)
    const path = await safeWrite(() => createFromQuickAdd(parsed, effKind, projects ?? []))
    setBusy(false)
    if (!path) return
    toast(`${effKind === 'task' ? 'Task' : 'Event'} created: ${parsed.title}`, 'success', { label: 'Open', run: () => nav(path) })
    setText(''); setKind(null)
    if (!keepOpen) close()
    else inputRef.current?.focus()
  }

  return (
    <Modal open={open} onClose={close} title="Smart quick add" wide footer={<>
      <span className="mr-auto hidden text-xs text-muted sm:block"><span className="kbd">Enter</span> add · <span className="kbd">Shift Enter</span> add & keep open · <span className="kbd">Esc</span> close</span>
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" icon={CornerDownLeft} loading={busy} disabled={!parsed.title} onClick={() => void submit(false)}>Add {effKind}</Button>
    </>}>
      <div className="relative">
        <Wand2 className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-accent" aria-hidden />
        <input ref={inputRef} autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label="Describe a task or event"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (parsed.title) void submit(e.shiftKey) } }}
          placeholder='Try "Pay rent tomorrow 5pm #bills !high @home"' className="input h-12 pl-11 text-base" />
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-raised/40 p-4" aria-live="polite">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Create as" className="flex rounded-xl border border-line p-0.5">
            {(['task', 'event'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={effKind === k} onClick={() => setKind(k)}
                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm', effKind === k ? 'bg-accent text-onaccent' : 'text-muted hover:text-fg')}>
                {k === 'task' ? <CheckSquare className="h-4 w-4" aria-hidden /> : <CalendarDays className="h-4 w-4" aria-hidden />}{k === 'task' ? 'Task' : 'Event'}
              </button>
            ))}
          </div>
          {kind == null && parsed.kind === 'event' && !parsed.kindExplicit && <span className="text-xs text-muted">Auto: has a time</span>}
        </div>
        <div className="text-lg font-semibold">{parsed.title || <span className="text-muted">Your title appears here</span>}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {parsed.date && <Badge tone="accent">📅 {fmtDate(parsed.date, 'EEE, MMM d yyyy')}</Badge>}
          {parsed.parts.filter((x) => x.type !== 'date').map((x, i) => <Badge key={i} tone={TONE[x.type]}>{x.label}</Badge>)}
          {parsed.recurrence && <Badge tone="life">↻ {describeRecurrence(parsed.recurrence)}</Badge>}
          {parsed.project && (project ? <Badge tone="work">Project: {project.name}</Badge> : <Badge tone="warn">New project “{parsed.project}” will be created</Badge>)}
          {effKind === 'task' && parsed.time && <Badge tone="muted">Tasks have no time — saved in notes</Badge>}
          {!parsed.parts.length && !parsed.date && text && <span className="text-xs text-muted">No date or tags detected — it will be added as is.</span>}
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-muted">How to write it</summary>
        <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
          <li><b className="text-fg">Dates</b>: today, tomorrow, fri, next monday, in 3 days, oct 28, 28/10, 2026-12-01</li>
          <li><b className="text-fg">Time</b>: 5pm, 17:30, at 9, noon · <b className="text-fg">Length</b>: for 45m / for 2h</li>
          <li><b className="text-fg">Repeat</b>: every day, every weekday, every 2 weeks, every sunday</li>
          <li><b className="text-fg">Priority</b>: !low !high !urgent (or !1–!4, !!!)</li>
          <li><b className="text-fg">Tags</b>: #tag · <b className="text-fg">Area</b>: @home @work @life @personal</li>
          <li><b className="text-fg">Project</b>: +Project-Name · <b className="text-fg">Estimate</b>: ~2h · prefix <b className="text-fg">task:</b> / <b className="text-fg">event:</b></li>
        </ul>
      </details>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
        {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => { setText(ex); inputRef.current?.focus() }} className="chip border-line text-muted hover:border-accent hover:text-fg">{ex}</button>)}
      </div>
    </Modal>
  )
}
