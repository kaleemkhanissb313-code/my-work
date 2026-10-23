import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { RotateCcw, Search, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { Badge, Button, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { confirm, safeWrite } from '@/components/feedback'
import { COLLECTIONS } from '@/features/records/collections'
import type { BaseEntity } from '@/types/models'
import { time12 } from '@/lib/time12'

const TABLES = {
  docs: 'Document', projects: 'Project', tasks: 'Task', events: 'Event', media: 'Media', bookmarks: 'Link',
  records: 'Record', datasets: 'Dataset', folders: 'Folder', palettes: 'Palette', timerSessions: 'Time entry',
  gxProducts: 'GLAMIEX product', gxPeople: 'GLAMIEX person', gxExpenses: 'GLAMIEX expense', gxAdIncome: 'GLAMIEX ad income', gxAdSpend: 'GLAMIEX ad spend', gxSheets: 'GLAMIEX sheet', sheets: 'Spreadsheet',
} as const
type TableName = keyof typeof TABLES

interface TrashItem { key: string; table: TableName; id: string; title: string; type: string; deletedAt: number }

function titleOf(r: Record<string, unknown>): string {
  const t = (r.title ?? r.name ?? r.label ?? r.url ?? r.platform ?? r.category ?? r.description) as string | undefined
  return t?.trim() || '(untitled)'
}

export function TrashPage() {
  const [q, setQ] = useState('')
  const [type, setType] = useState<TableName | ''>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const items = useLiveQuery(async () => {
    const out: TrashItem[] = []
    for (const table of Object.keys(TABLES) as TableName[]) {
      const rows = (await db.table(table).filter((r: BaseEntity) => r.deletedAt != null).toArray()) as (BaseEntity & Record<string, unknown>)[]
      for (const r of rows) {
        const sub = table === 'records' ? COLLECTIONS[r.collection as keyof typeof COLLECTIONS]?.singular ?? 'Record' : table === 'docs' && r.kind === 'note' ? 'Note' : TABLES[table]
        out.push({ key: `${table}:${r.id}`, table, id: r.id, title: titleOf(r), type: sub, deletedAt: r.deletedAt! })
      }
    }
    return out.sort((a, b) => b.deletedAt - a.deletedAt)
  }, [])

  const list = useMemo(() => items?.filter((i) => (!type || i.table === type) && (!q || i.title.toLowerCase().includes(q.toLowerCase()))) ?? [], [items, q, type])

  const restore = (sel: TrashItem[]) => safeWrite(async () => {
    await db.transaction('rw', [...new Set(sel.map((i) => i.table))].map((t) => db.table(t)), async () => {
      for (const i of sel) await db.table(i.table).where('id').equals(i.id).modify((r: BaseEntity) => { r.deletedAt = null; r.updatedAt = Date.now(); r.version = (r.version ?? 0) + 1; r.syncedAt = null })
    })
    setSelected(new Set())
  }, `Restored ${sel.length} item${sel.length > 1 ? 's' : ''}`)

  const purge = async (sel: TrashItem[]) => {
    if (!sel.length) return
    const ok = await confirm({ title: `Delete ${sel.length} item${sel.length > 1 ? 's' : ''} permanently?`, body: 'This cannot be undone. Synced copies are kept as deleted on the server until the next sync.', danger: true, confirmLabel: 'Delete permanently' })
    if (!ok) return
    await safeWrite(async () => {
      for (const i of sel) await db.table(i.table).delete(i.id)
      setSelected(new Set())
    }, 'Deleted permanently')
  }

  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const chosen = list.filter((i) => selected.has(i.key))
  const allChecked = list.length > 0 && chosen.length === list.length

  return (
    <div>
      <PageHeader title="Trash" description="Deleted items stay here until you restore them or delete them permanently." icon={Trash2}
        actions={<Button variant="danger" icon={Trash2} disabled={!items?.length} onClick={() => void purge(items ?? [])}>Empty trash</Button>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search trash" className="ps-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Filter by type" className="w-auto" value={type} onChange={(e) => setType(e.target.value as TableName | '')}>
          <option value="">All types</option>
          {(Object.keys(TABLES) as TableName[]).map((t) => <option key={t} value={t}>{TABLES[t]}</option>)}
        </Select>
        {chosen.length > 0 && <>
          <Button icon={RotateCcw} onClick={() => void restore(chosen)}>Restore {chosen.length}</Button>
          <Button variant="danger" icon={Trash2} onClick={() => void purge(chosen)}>Delete {chosen.length}</Button>
        </>}
      </div>
      {!items ? <Spinner /> : list.length === 0 ? (
        <EmptyState icon={Trash2} title={items.length ? 'Nothing matches' : 'Trash is empty'}>Items you delete anywhere in the app appear here and can be restored.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-start text-xs text-muted">
              <tr>
                <th className="w-10 p-3"><input type="checkbox" aria-label="Select all" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(list.map((i) => i.key)))} /></th>
                <th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Type</th><th className="p-3 font-medium">Deleted</th><th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.key} className="border-b border-line/60 last:border-0">
                  <td className="p-3"><input type="checkbox" aria-label={`Select ${i.title}`} checked={selected.has(i.key)} onChange={() => toggle(i.key)} /></td>
                  <td className="max-w-[16rem] truncate p-3 font-medium">{i.title}</td>
                  <td className="p-3"><Badge>{i.type}</Badge></td>
                  <td className="whitespace-nowrap p-3 text-muted">{format(i.deletedAt, 'MMM d, yyyy')} {time12(i.deletedAt)}</td>
                  <td className="whitespace-nowrap p-3 text-end">
                    <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => void restore([i])}>Restore</Button>
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void purge([i])} aria-label={`Delete ${i.title} permanently`}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
