import { useEffect, useId, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Folder as FolderIcon, FolderOpen, FolderPlus, Inbox, Pencil, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { foldersRepo } from '@/services/repo'
import { confirm, safeWrite, toast } from '@/components/feedback'
import { Button, Field, IconButton, Input, Modal } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { Doc, Folder } from '@/types/models'

/** Colour labels offered across documents, notes and media. */
export const COLOR_LABELS: { value: string; name: string }[] = [
  { value: '#ef4444', name: 'Red' },
  { value: '#f59e0b', name: 'Amber' },
  { value: '#22c55e', name: 'Green' },
  { value: '#06b6d4', name: 'Cyan' },
  { value: '#3b82f6', name: 'Blue' },
  { value: '#8b5cf6', name: 'Violet' },
  { value: '#ec4899', name: 'Pink' },
]

export const docPath = (d: Pick<Doc, 'id' | 'kind'>) => (d.kind === 'note' ? `/notes/${d.id}` : `/documents/${d.id}`)

export function ColorPicker({ value, onChange, label = 'Color label' }: { value?: string; onChange: (v: string | undefined) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <button type="button" role="radio" aria-checked={!value} aria-label="No color" title="No color" onClick={() => onChange(undefined)}
        className={cn('grid h-6 w-6 place-items-center rounded-full border border-line bg-raised text-[10px] text-muted', !value && 'ring-2 ring-accent')}>
        {!value ? <Check className="h-3 w-3" aria-hidden /> : '∅'}
      </button>
      {COLOR_LABELS.map((c) => (
        <button key={c.value} type="button" role="radio" aria-checked={value === c.value} aria-label={c.name} title={c.name} onClick={() => onChange(c.value)}
          className={cn('grid h-6 w-6 place-items-center rounded-full border border-black/10', value === c.value && 'ring-2 ring-accent ring-offset-1 ring-offset-bg')}
          style={{ backgroundColor: c.value }}>
          {value === c.value && <Check className="h-3 w-3 text-white" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

/** Small modal asking for a single line of text. */
export function TextPromptModal({ open, title, label, initial = '', submitLabel = 'Save', placeholder, validate, onSubmit, onClose }: {
  open: boolean; title: string; label: string; initial?: string; submitLabel?: string; placeholder?: string
  validate?: (v: string) => string | null
  onSubmit: (v: string) => void | Promise<void>
  onClose: () => void
}) {
  const id = useId()
  const [v, setV] = useState(initial)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setV(initial); setErr(null) } }, [open, initial])
  const submit = async () => {
    const e = validate ? validate(v) : v.trim() ? null : `${label} is required.`
    setErr(e)
    if (e) return
    setBusy(true)
    try { await onSubmit(v.trim()) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>{submitLabel}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label={label} htmlFor={id} error={err}>
          <Input id={id} value={v} placeholder={placeholder} maxLength={300} onChange={(e) => setV(e.target.value)} aria-invalid={!!err} />
        </Field>
      </form>
    </Modal>
  )
}

/** Folder filter value: 'all' | 'none' (no folder) | folder id. */
export type FolderFilter = string

/**
 * Folder sidebar with create / rename / delete. `onBeforeDelete` must move the folder's items to "No folder".
 */
export function FolderPanel({ scope, value, onChange, counts, onBeforeDelete }: {
  scope: Folder['scope']; value: FolderFilter; onChange: (v: FolderFilter) => void
  counts?: Record<string, number>
  onBeforeDelete: (folderId: string) => Promise<void>
}) {
  const folders = useLiveQuery(() => db.folders.where('scope').equals(scope).filter((f) => !f.deletedAt).sortBy('name'), [scope])
  const [editing, setEditing] = useState<Folder | 'new' | null>(null)

  const remove = async (f: Folder) => {
    const n = counts?.[f.id] ?? 0
    const ok = await confirm({
      title: `Delete folder “${f.name}”?`,
      body: n ? `${n} item(s) in this folder will be moved to “No folder”. The folder goes to Trash.` : 'The folder goes to Trash.',
      confirmLabel: 'Delete folder', danger: true,
    })
    if (!ok) return
    const done = await safeWrite(async () => { await onBeforeDelete(f.id); await foldersRepo.trash(f.id); return true }, 'Folder deleted')
    if (done && value === f.id) onChange('all')
  }

  const item = (id: string, label: string, Icon: typeof FolderIcon, count?: number) => (
    <button type="button" onClick={() => onChange(id)} aria-pressed={value === id}
      className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition', value === id ? 'bg-raised font-medium text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg')}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-auto text-xs tabular-nums text-muted">{count}</span>}
    </button>
  )

  return (
    <nav aria-label="Folders" className="card p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Folders</span>
        <IconButton icon={FolderPlus} label="New folder" onClick={() => setEditing('new')} />
      </div>
      <ul className="space-y-0.5">
        <li className="flex">{item('all', 'All', Inbox, counts?.all)}</li>
        <li className="flex">{item('none', 'No folder', FolderOpen, counts?.none)}</li>
        {folders?.map((f) => (
          <li key={f.id} className="group flex items-center">
            {item(f.id, f.name, FolderIcon, counts?.[f.id] ?? 0)}
            <div className="flex opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <IconButton icon={Pencil} label={`Rename folder ${f.name}`} className="h-7 w-7" onClick={() => setEditing(f)} />
              <IconButton icon={Trash2} label={`Delete folder ${f.name}`} className="h-7 w-7" onClick={() => void remove(f)} />
            </div>
          </li>
        ))}
      </ul>
      <TextPromptModal open={!!editing} title={editing === 'new' ? 'New folder' : 'Rename folder'} label="Folder name"
        initial={editing && editing !== 'new' ? editing.name : ''} submitLabel={editing === 'new' ? 'Create' : 'Rename'}
        onClose={() => setEditing(null)}
        onSubmit={async (name) => {
          const ok = editing === 'new'
            ? await safeWrite(() => foldersRepo.create({ name, scope }), 'Folder created')
            : editing ? await safeWrite(() => foldersRepo.update(editing.id, { name }).then(() => true), 'Folder renamed') : undefined
          if (ok !== undefined) setEditing(null)
        }} />
    </nav>
  )
}

/** Notify with an Undo action after moving an item to trash. */
export function trashedToast(undo: () => Promise<unknown>, what = 'Moved to trash') {
  toast(what, 'success', { label: 'Undo', run: () => void safeWrite(undo, 'Restored') })
}
