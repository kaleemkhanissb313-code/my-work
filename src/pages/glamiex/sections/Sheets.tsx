import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore, ArrowDown, ArrowUp, Copy, FileSpreadsheet, FileUp, Lock, Plus, Sheet, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, IconButton, Modal, Spinner } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { db } from '@/lib/db'
import { parseCSV } from '@/lib/csv'
import { readXlsx } from '@/lib/xlsxRead'
import { createSheet, sheetsRepo, useSheets } from '@/features/sheets/repo'
import { fromRows } from '@/features/sheets/ops'
import { SHEET_TEMPLATES } from '@/features/sheets/templates'
import { SYSTEM_SHEETS, type SystemKey } from '@/features/sheets/systemSheets'
import { gxAudit } from '@/features/glamiex/service'
import { CustomSheetEditor } from '../sheets/CustomSheetEditor'
import { SystemSheetView } from '../sheets/SystemSheetView'
import { useGx } from '../context'
import { BackLink } from './shared'

export default function Sheets({ id = 'all' }: { id?: string }) {
  if (SYSTEM_SHEETS.some((s) => s.key === id)) return <div><BackLink to="/glamiex/sheets/all" label="All sheets" /><SystemSheetView sheetKey={id as SystemKey} /></div>
  if (id === 'all' || id === 'archived' || id === 'custom') return <SheetsHome archived={id === 'archived'} openNew={id === 'custom'} />
  return <CustomById id={id} />
}

function CustomById({ id }: { id: string }) {
  const sheet = useLiveQuery(() => db.gxSheets.get(id), [id])
  if (sheet === undefined) return <Spinner label="Opening sheet" />
  if (!sheet || sheet.deletedAt) return <div><BackLink to="/glamiex/sheets/all" label="All sheets" /><EmptyState icon={Sheet} title="Sheet not found">It may have been deleted. Check Trash to restore it.</EmptyState></div>
  return <div><BackLink to="/glamiex/sheets/all" label="All sheets" /><CustomSheetEditor key={sheet.id} sheet={sheet} /></div>
}

function SheetsHome({ archived, openNew }: { archived: boolean; openNew: boolean }) {
  const { go } = useGx()
  const all = useSheets()
  const [newOpen, setNewOpen] = useState(openNew)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const list = all?.filter((s) => !!s.archived === archived) ?? []

  const importFile = async (f: File) => {
    setImporting(true)
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('Files up to 20 MB are supported.')
      const base = f.name.replace(/\.(csv|xlsx|tsv|txt)$/i, '')
      if (/\.xlsx$/i.test(f.name)) {
        const sheets = await readXlsx(await f.arrayBuffer())
        if (!sheets.length) throw new Error('No worksheets found.')
        let first = ''
        for (const s of sheets) { const c = await createSheet(sheets.length > 1 ? `${base} — ${s.name}` : base, fromRows(s.rows), `Imported from ${f.name}`); first ||= c.id }
        toast(`Imported ${sheets.length} worksheet(s)`); go(`sheets/${first}`)
      } else {
        const rows = parseCSV(await f.text(), /\.tsv$/i.test(f.name) ? '\t' : ',')
        if (!rows.length) throw new Error('The file is empty.')
        if (rows.length > 20000) throw new Error('Too many rows (20,000 max).')
        const s = await createSheet(base, fromRows(rows), `Imported from ${f.name}`)
        toast(`Imported ${rows.length - 1} rows`); go(`sheets/${s.id}`)
      }
    } catch (e) { toast(`Import failed: ${(e as Error).message}`, 'error') } finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const move = async (i: number, d: number) => {
    const a = list[i], b = list[i + d]; if (!a || !b) return
    await sheetsRepo.update(a.id, { order: b.order }); await sheetsRepo.update(b.id, { order: a.order })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{archived ? 'Archived sheets' : 'Overall Sheets'}</h2>
        {!archived && <><Button icon={FileUp} loading={importing} onClick={() => fileRef.current?.click()}>Import CSV / Excel</Button><Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>New sheet</Button></>}
        <input ref={fileRef} type="file" hidden accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f) }} />
        <Link to={archived ? '/glamiex/sheets/all' : '/glamiex/sheets/archived'} className="btn btn-soft h-10 px-3 text-sm">{archived ? 'All sheets' : 'Archived'}</Link>
      </div>

      {!archived && (
        <section aria-label="Business sheets">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4 text-ok" aria-hidden />Business sheets <span className="font-normal text-muted">— live from your GLAMIEX records</span></h3>
          <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {SYSTEM_SHEETS.map((s) => (
              <li key={s.key}><Link to={`/glamiex/sheets/${s.key}`} className="card card-hover flex min-h-[64px] items-start gap-3 p-3">
                <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden /><span><span className="block text-sm font-semibold">{s.title}</span><span className="block text-xs text-muted">{s.desc}</span></span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Custom sheets">
        <h3 className="mb-2 text-sm font-semibold">{archived ? '' : 'My custom sheets'}</h3>
        {!all ? <Spinner /> : !list.length ? (
          <EmptyState icon={Sheet} title={archived ? 'No archived sheets' : 'No custom sheets yet'} action={!archived && <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Create a sheet</Button>}>
            {!archived && 'Create your own spreadsheets with formulas, formats, totals and charts. They never change official business records.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line/60 rounded-2xl border border-line">
            {list.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 p-2">
                <Link to={`/glamiex/sheets/${s.id}`} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-xl px-2 hover:bg-raised/60">
                  <Sheet className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0"><span className="block truncate font-medium">{s.name}</span><span className="block text-xs text-muted">{s.columns.length} columns · {s.rows.length} rows · updated {new Date(s.updatedAt).toLocaleDateString()}</span></span>
                </Link>
                {s.archived && <Badge>archived</Badge>}
                {!archived && <><IconButton icon={ArrowUp} label={`Move ${s.name} up`} disabled={i === 0} onClick={() => void move(i, -1)} /><IconButton icon={ArrowDown} label={`Move ${s.name} down`} disabled={i === list.length - 1} onClick={() => void move(i, 1)} /></>}
                <IconButton icon={Copy} label={`Duplicate ${s.name}`} onClick={async () => { await createSheet(`${s.name} (copy)`, { columns: s.columns, rows: s.rows, fmt: s.fmt, colFmt: s.colFmt, rowFmt: s.rowFmt, freezeCols: s.freezeCols, showTotals: s.showTotals, totals: s.totals, rules: s.rules }); toast('Duplicated') }} />
                {archived && <IconButton icon={ArchiveRestore} label={`Unarchive ${s.name}`} onClick={() => void sheetsRepo.toggle(s.id, 'archived')} />}
                <IconButton icon={Trash2} label={`Delete ${s.name}`} onClick={async () => {
                  if (!(await confirm({ title: `Delete “${s.name}”?`, body: 'The sheet moves to Trash.', danger: true, confirmLabel: 'Delete' }))) return
                  await sheetsRepo.trash(s.id); await gxAudit('sheet', s.id, 'delete', s.name); toast('Moved to trash', 'success', { label: 'Undo', run: () => void sheetsRepo.restore(s.id) })
                }} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New sheet" wide>
        <p className="mb-3 text-sm text-muted">Templates contain column headers and formulas only — no sample numbers.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SHEET_TEMPLATES.map((t) => (
            <li key={t.id}><button type="button" className="card card-hover flex min-h-[64px] w-full flex-col items-start p-3 text-left" onClick={async () => { const s = await createSheet(t.id === 'blank' ? 'Untitled sheet' : t.name, t.build()); setNewOpen(false); go(`sheets/${s.id}`) }}>
              <span className="font-semibold">{t.name}</span><span className="text-xs text-muted">{t.desc}</span>
            </button></li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
