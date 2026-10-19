import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive, ArchiveRestore, Copy, Download, Eye, EyeOff, Pencil, Pin, Plus, Printer, Repeat, Search, Star, Trash2, Inbox,
} from 'lucide-react'
import { db } from '@/lib/db'
import { recordsRepo } from '@/services/repo'
import { useSettings } from '@/services/settings'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Checkbox, EmptyState, Field, IconButton, Input, Modal, Select, Spinner, TagInput, Textarea } from '@/components/ui'
import { RecurrenceEditor } from '@/components/RecurrenceEditor'
import { COLLECTIONS, type FieldDef } from './collections'
import type { Area, CollectionKey, FieldValue, Priority, RecordItem } from '@/types/models'
import { fmtDate, nextOccurrence, todayISO, describeRecurrence } from '@/lib/dates'
import { AREA_LABEL, AREA_TONE, PRIORITY_TONE, isValidEmail, money, normaliseUrl } from '@/lib/format'
import { objectsToCSV } from '@/lib/csv'
import { downloadText } from '@/services/backup'
import { printHtml } from '@/lib/markdown'
import { cn } from '@/lib/cn'
import { escapeHtml } from '@/lib/html'

type SortKey = 'due' | 'updated' | 'title' | 'amount' | 'priority'
const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export interface RecordManagerProps {
  collection: CollectionKey
  /** Restrict to these areas (e.g. Finance shows all; Work expenses shows only 'work'). */
  areas?: Area[]
  /** Area for newly created items (defaults to the collection's area). */
  defaultArea?: Area
  title?: string
  /** Extra defaults for new items (e.g. category 'Client' for the Work clients view). */
  defaults?: Partial<RecordItem>
  /** Extra filter applied after area filtering. */
  filter?: (r: RecordItem) => boolean
  compact?: boolean
}

export function RecordManager({ collection, areas, defaultArea, title, defaults, filter, compact }: RecordManagerProps) {
  const def = COLLECTIONS[collection]
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [status, setStatus] = useState<'open' | 'done' | 'all'>('open')
  const [sort, setSort] = useState<SortKey>(def.core.due ? 'due' : 'updated')
  const [showArchived, setShowArchived] = useState(false)
  const [favOnly, setFavOnly] = useState(false)
  const [editing, setEditing] = useState<RecordItem | 'new' | null>(null)
  const [reveal, setReveal] = useState(false)

  const all = useLiveQuery(() => db.records.where('collection').equals(collection).toArray(), [collection])

  // Deep-link: ?open=<id>
  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !all) return
    const r = all.find((x) => x.id === openId)
    if (r) setEditing(r)
    params.delete('open'); setParams(params, { replace: true })
  }, [openId, all, params, setParams])

  const items = useMemo(() => {
    if (!all) return []
    const term = q.toLowerCase().trim()
    const today = todayISO()
    return all
      .filter((r) => !r.deletedAt && (showArchived ? r.archived : !r.archived))
      .filter((r) => !areas || areas.includes(r.area))
      .filter((r) => !filter || filter(r))
      .filter((r) => !cat || r.category === cat)
      .filter((r) => !def.core.done || status === 'all' || (status === 'done' ? r.done : !r.done))
      .filter((r) => !favOnly || r.favorite)
      .filter((r) => !term || [r.title, r.category, ...r.tags, ...Object.values(r.fields).map(String)].join(' ').toLowerCase().includes(term))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        switch (sort) {
          case 'title': return a.title.localeCompare(b.title)
          case 'amount': return (b.amount ?? 0) - (a.amount ?? 0)
          case 'priority': return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
          case 'due': {
            // Journal-like collections (no 'done') sort newest first; actionable ones soonest first.
            if (!a.dueDate || !b.dueDate) return a.dueDate ? -1 : b.dueDate ? 1 : 0
            return def.core.done ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate)
          }
          default: return b.updatedAt - a.updatedAt
        }
      })
      .map((r) => ({ r, overdue: !!(def.core.done && !r.done && r.dueDate && r.dueDate < today) }))
  }, [all, q, cat, status, sort, showArchived, favOnly, areas, filter, def.core.done])

  const total = useMemo(() => items.reduce((s, { r }) => s + (r.amount ?? 0), 0), [items])

  const toggleDone = async (r: RecordItem) => {
    if (!r.done && r.recurrence && r.dueDate) {
      const next = nextOccurrence(r.dueDate, r.recurrence)
      if (next) {
        await safeWrite(() => recordsRepo.update(r.id, { dueDate: next, done: false, fields: { ...r.fields, lastCompleted: todayISO() } }))
        toast(`Completed — next due ${fmtDate(next)}`)
        return
      }
    }
    await safeWrite(() => recordsRepo.update(r.id, { done: !r.done, fields: !r.done ? { ...r.fields, lastCompleted: todayISO() } : r.fields }))
  }

  const exportCsv = () => {
    const cols = [
      { key: 'title' as const, label: def.titleLabel },
      { key: (r: RecordItem) => AREA_LABEL[r.area], label: 'Area' },
      ...(def.core.category ? [{ key: 'category' as const, label: 'Category' }] : []),
      ...(def.core.due ? [{ key: 'dueDate' as const, label: def.core.due }] : []),
      ...(def.core.amount ? [{ key: 'amount' as const, label: def.core.amount }] : []),
      ...(def.core.done ? [{ key: (r: RecordItem) => (r.done ? 'yes' : 'no'), label: def.core.done }] : []),
      ...def.fields.map((f) => ({ key: (r: RecordItem) => fmtField(r.fields[f.key]), label: f.label })),
      { key: (r: RecordItem) => r.tags.join(' '), label: 'Tags' },
    ]
    downloadText(objectsToCSV(items.map((i) => i.r), cols as never), `${collection}-${todayISO()}.csv`, 'text/csv;charset=utf-8')
  }

  const print = () => {
    const rows = items.map(({ r }) => `<tr><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.dueDate ?? '')}</td><td>${r.amount != null ? escapeHtml(money(r.amount, settings.currency)) : ''}</td><td>${def.core.done ? (r.done ? '✓' : '') : ''}</td></tr>`).join('')
    printHtml(title ?? def.label, `<table><thead><tr><th>${def.titleLabel}</th><th>Category</th><th>${def.core.due ?? 'Date'}</th><th>${def.core.amount ?? 'Amount'}</th><th>${def.core.done ?? ''}</th></tr></thead><tbody>${rows}</tbody></table>`)
  }

  const hideSensitive = settings.lock.hideSensitive && !reveal
  const hasSensitive = def.fields.some((f) => f.sensitive)

  return (
    <section aria-label={title ?? def.label}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!compact && <h2 className="mr-auto text-base font-semibold">{title ?? def.label}</h2>}
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label={`Search ${def.label}`} placeholder="Search…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {def.core.category && (
          <Select aria-label="Filter by category" className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {def.core.category.map((c) => <option key={c}>{c}</option>)}
          </Select>
        )}
        {def.core.done && (
          <Select aria-label="Filter by status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="open">Open</option><option value="done">{def.core.done}</option><option value="all">All</option>
          </Select>
        )}
        <Select aria-label="Sort" className="w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {def.core.due && <option value="due">Sort: {def.core.due}</option>}
          <option value="updated">Sort: Recently updated</option>
          <option value="title">Sort: Name</option>
          {def.core.amount && <option value="amount">Sort: {def.core.amount}</option>}
          {def.core.priority && <option value="priority">Sort: Priority</option>}
        </Select>
        <IconButton icon={Star} label="Favorites only" active={favOnly} onClick={() => setFavOnly(!favOnly)} />
        <IconButton icon={Archive} label={showArchived ? 'Showing archived' : 'Show archived'} active={showArchived} onClick={() => setShowArchived(!showArchived)} />
        {hasSensitive && <IconButton icon={hideSensitive ? Eye : EyeOff} label={hideSensitive ? 'Reveal sensitive fields' : 'Hide sensitive fields'} onClick={() => setReveal(!reveal)} />}
        <IconButton icon={Download} label="Export CSV" onClick={exportCsv} disabled={!items.length} />
        <IconButton icon={Printer} label="Print / save as PDF" onClick={print} disabled={!items.length} />
        <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add {def.singular.toLowerCase()}</Button>
      </div>

      {!all ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={Inbox} title={q || cat || favOnly || showArchived ? 'Nothing matches these filters' : `No ${def.label.toLowerCase()} yet`}
          action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add {def.singular.toLowerCase()}</Button>}>
          {def.emptyHint}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map(({ r, overdue }) => (
              <li key={r.id} className={cn('card flex flex-wrap items-center gap-3 p-3', r.done && 'opacity-60')}>
                {def.core.done && (
                  <input type="checkbox" className="h-5 w-5 shrink-0 cursor-pointer accent-[rgb(var(--accent))]" checked={r.done}
                    aria-label={`${def.core.done}: ${r.title}`} onChange={() => void toggleDone(r)} />
                )}
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                  <div className={cn('flex items-center gap-2 font-medium', r.done && 'line-through')}>
                    {r.pinned && <Pin className="h-3.5 w-3.5 text-accent" aria-label="Pinned" />}
                    <span className="truncate">{r.title || '(untitled)'}</span>
                    {r.recurrence && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={describeRecurrence(r.recurrence)} />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {(!areas || areas.length > 1) && <Badge tone={AREA_TONE[r.area]}>{AREA_LABEL[r.area]}</Badge>}
                    {r.category && <Badge>{r.category}</Badge>}
                    {def.core.priority && r.priority !== 'medium' && <Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge>}
                    {def.core.due && r.dueDate && <span className={cn(overdue && 'font-semibold text-danger')}>{def.core.due}: {fmtDate(r.dueDate)}{overdue && ' · overdue'}</span>}
                    {def.fields.filter((f) => f.list && r.fields[f.key] != null && r.fields[f.key] !== '').map((f) => (
                      <span key={f.key}>· {f.label}: {f.sensitive && hideSensitive ? '••••' : fmtField(r.fields[f.key], f)}</span>
                    ))}
                    {r.tags.map((t) => <span key={t} className="text-accent">#{t}</span>)}
                  </div>
                </button>
                {def.core.amount && r.amount != null && <div className="font-semibold tabular-nums">{money(r.amount, settings.currency)}</div>}
                <div className="flex items-center">
                  <IconButton icon={Star} label={r.favorite ? 'Unfavorite' : 'Favorite'} active={r.favorite} onClick={() => void safeWrite(() => recordsRepo.toggle(r.id, 'favorite'))} />
                  <IconButton icon={Pin} label={r.pinned ? 'Unpin' : 'Pin'} active={r.pinned} onClick={() => void safeWrite(() => recordsRepo.toggle(r.id, 'pinned'))} />
                  <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(r)} />
                  <IconButton icon={Copy} label="Duplicate" onClick={() => void safeWrite(() => recordsRepo.duplicate(r.id, (x) => ({ title: `${x.title} (copy)` })), 'Duplicated')} />
                  <IconButton icon={r.archived ? ArchiveRestore : Archive} label={r.archived ? 'Unarchive' : 'Archive'} onClick={() => void safeWrite(() => recordsRepo.toggle(r.id, 'archived'), r.archived ? 'Restored from archive' : 'Archived')} />
                  <IconButton icon={Trash2} label="Move to trash" onClick={async () => {
                    await safeWrite(() => recordsRepo.trash(r.id))
                    toast('Moved to trash', 'success', { label: 'Undo', run: () => void recordsRepo.restore(r.id) })
                  }} />
                </div>
              </li>
            ))}
          </ul>
          {def.core.amount && <p className="mt-3 text-right text-sm text-muted">Total shown: <span className="font-semibold text-fg">{money(total, settings.currency)}</span></p>}
        </>
      )}

      <RecordEditor key={editing === 'new' ? 'new' : editing?.id ?? 'none'} open={!!editing} item={editing === 'new' ? null : editing}
        collection={collection} defaultArea={defaultArea ?? areas?.[0] ?? def.area} defaults={defaults} onClose={() => setEditing(null)} />
    </section>
  )
}


function fmtField(v: FieldValue | undefined, f?: FieldDef): string {
  if (v == null || v === '') return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.join(', ')
  if (f?.type === 'rating') return '★'.repeat(Number(v))
  if (f?.type === 'date') return fmtDate(String(v))
  return String(v)
}

function RecordEditor({ open, item, collection, defaultArea, defaults, onClose }: { open: boolean; item: RecordItem | null; collection: CollectionKey; defaultArea: Area; defaults?: Partial<RecordItem>; onClose: () => void }) {
  const def = COLLECTIONS[collection]
  const [form, setForm] = useState<RecordItem | Omit<RecordItem, 'id'>>(() => item ?? {
    ...({} as RecordItem), collection, area: defaultArea, title: '', done: false, dueDate: def.core.due && !def.core.done ? todayISO() : null, amount: null,
    category: '', priority: 'medium', recurrence: null, fields: {}, tags: [], ...defaults,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof RecordItem>(k: K, v: RecordItem[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setField = (k: string, v: FieldValue) => setForm((f) => ({ ...f, fields: { ...f.fields, [k]: v } }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = `${def.titleLabel} is required.`
    if (form.amount != null && (!Number.isFinite(form.amount) || Math.abs(form.amount) > 1e12)) e.amount = 'Enter a valid amount.'
    for (const f of def.fields) {
      const v = form.fields[f.key]
      if (f.required && (v == null || v === '')) e[f.key] = `${f.label} is required.`
      if (v && f.type === 'url' && !normaliseUrl(String(v))) e[f.key] = 'Enter a valid http(s) URL.'
      if (v && f.type === 'email' && !isValidEmail(String(v))) e[f.key] = 'Enter a valid email address.'
      if (v !== '' && v != null && f.type === 'number' && !Number.isFinite(Number(v))) e[f.key] = 'Enter a number.'
    }
    setErrors(e)
    return !Object.keys(e).length
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    const fields = { ...form.fields }
    for (const f of def.fields) if (f.type === 'url' && fields[f.key]) fields[f.key] = normaliseUrl(String(fields[f.key]))
    const data = { ...form, title: form.title.trim(), fields }
    const ok = item
      ? await safeWrite(() => recordsRepo.update(item.id, data as Partial<RecordItem>), 'Saved')
      : await safeWrite(() => recordsRepo.create(data as Partial<RecordItem>), `${def.singular} added`)
    setSaving(false)
    if (ok !== undefined) onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? `Edit ${def.singular.toLowerCase()}` : `New ${def.singular.toLowerCase()}`} wide
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label={def.titleLabel} error={errors.title} htmlFor="rec-title" className="sm:col-span-2">
          <Input id="rec-title" value={form.title} onChange={(e) => set('title', e.target.value)} aria-invalid={!!errors.title} maxLength={300} />
        </Field>
        <Field label="Area" htmlFor="rec-area">
          <Select id="rec-area" value={form.area} onChange={(e) => set('area', e.target.value as Area)}>
            {(['personal', 'home', 'work', 'life'] as Area[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </Select>
        </Field>
        {def.core.category && (
          <Field label="Category" htmlFor="rec-cat">
            <Input id="rec-cat" list={`cat-${collection}`} value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Choose or type" />
            <datalist id={`cat-${collection}`}>{def.core.category.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        )}
        {def.core.due && (
          <Field label={def.core.due} htmlFor="rec-due">
            <Input id="rec-due" type="date" value={form.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} />
          </Field>
        )}
        {def.core.amount && (
          <Field label={def.core.amount} error={errors.amount} htmlFor="rec-amt">
            <Input id="rec-amt" type="number" step="0.01" inputMode="decimal" value={form.amount ?? ''} onChange={(e) => set('amount', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
        )}
        {def.core.priority && (
          <Field label="Priority" htmlFor="rec-pri">
            <Select id="rec-pri" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        )}
        {def.core.done && (
          <div className="flex items-end pb-2"><Checkbox label={def.core.done} checked={form.done} onChange={(v) => set('done', v)} /></div>
        )}
        {def.fields.map((f) => (
          <Field key={f.key} label={f.label + (f.required ? ' *' : '')} error={errors[f.key]} htmlFor={`rec-${f.key}`} className={f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
            <FieldInput id={`rec-${f.key}`} def={f} value={form.fields[f.key]} onChange={(v) => setField(f.key, v)} />
          </Field>
        ))}
        {def.core.recurrence && (
          <Field label="Repeat" className="sm:col-span-2"><RecurrenceEditor value={form.recurrence} onChange={(r) => set('recurrence', r)} /></Field>
        )}
        <Field label="Tags" className="sm:col-span-2"><TagInput value={form.tags} onChange={(t) => set('tags', t)} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function FieldInput({ id, def, value, onChange }: { id: string; def: FieldDef; value: FieldValue | undefined; onChange: (v: FieldValue) => void }) {
  const v = value ?? ''
  switch (def.type) {
    case 'textarea': return <Textarea id={id} value={String(v)} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />
    case 'number': case 'money': return <Input id={id} type="number" step="any" value={String(v)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    case 'date': return <Input id={id} type="date" value={String(v)} onChange={(e) => onChange(e.target.value || null)} />
    case 'checkbox': return <Checkbox label={def.label} checked={!!value} onChange={onChange} />
    case 'select': return (
      <Select id={id} value={String(v)} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>{def.options?.map((o) => <option key={o}>{o}</option>)}
      </Select>
    )
    case 'rating': return (
      <div className="flex gap-1" role="radiogroup" aria-label={def.label} id={id}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={Number(v) === n} aria-label={`${n} of 5`} onClick={() => onChange(Number(v) === n ? null : n)}
            className={cn('h-9 w-9 rounded-lg border text-lg', Number(v) >= n ? 'border-warn text-warn' : 'border-line text-muted')}>★</button>
        ))}
      </div>
    )
    default: return <Input id={id} type={def.type === 'url' ? 'url' : def.type === 'email' ? 'email' : def.type === 'tel' ? 'tel' : 'text'} value={String(v)} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} />
  }
}
