import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore, ArrowLeft, Copy, FileUp, Plus, Search, Sheet, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, IconButton, Input, Modal, PageHeader, Spinner } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { db } from '@/lib/db'
import { parseCSV } from '@/lib/csv'
import { readXlsx } from '@/lib/xlsxRead'
import { createWsSheet, useWsSheets, wsSheetsRepo, type SheetHost } from '@/features/sheets/repo'
import { fromRows } from '@/features/sheets/ops'
import { PERSONAL_TEMPLATES } from '@/features/sheets/personalTemplates'
import { CustomSheetEditor } from '@/pages/glamiex/sheets/CustomSheetEditor'
import type { SheetTemplate } from '@/features/sheets/templates'

export default function SheetsPage() {
  const { id } = useParams()
  return id && id !== 'archived' ? <SheetById id={id} /> : <SheetsHome archived={id === 'archived'} />
}

function SheetById({ id }: { id: string }) {
  const nav = useNavigate()
  const sheet = useLiveQuery(() => db.sheets.get(id), [id])
  const host: SheetHost = useMemo(() => ({
    repo: wsSheetsRepo, create: createWsSheet, open: (x) => nav(x ? `/sheets/${x}` : '/sheets'),
    printTag: 'workMYwork spreadsheet', deleteNote: 'The spreadsheet moves to Trash and can be restored from there.',
  }), [nav])
  const back = <Link to="/sheets" className="mb-2 inline-flex min-h-[40px] items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />All spreadsheets</Link>
  if (sheet === undefined) return <Spinner label="Opening spreadsheet" />
  if (!sheet || sheet.deletedAt) return <div>{back}<EmptyState icon={Sheet} title="Spreadsheet not found">It may have been deleted. Check Trash to restore it.</EmptyState></div>
  return <div>{back}<CustomSheetEditor key={sheet.id} sheet={sheet} host={host} /></div>
}

function SheetsHome({ archived }: { archived: boolean }) {
  const nav = useNavigate()
  const all = useWsSheets()
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const needle = q.trim().toLowerCase()
  const list = (all ?? []).filter((s) => !!s.archived === archived && (!needle || `${s.name} ${s.description}`.toLowerCase().includes(needle)))
  const start = async (t: SheetTemplate) => { const s = await createWsSheet(t.id === 'blank' ? 'Untitled spreadsheet' : t.name, t.build()); setNewOpen(false); nav(`/sheets/${s.id}`) }

  const importFile = async (f: File) => {
    setImporting(true)
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('Files up to 20 MB are supported.')
      const base = f.name.replace(/\.(csv|xlsx|tsv|txt)$/i, '')
      if (/\.xlsx$/i.test(f.name)) {
        const sheets = await readXlsx(await f.arrayBuffer())
        if (!sheets.length) throw new Error('No worksheets found.')
        let first = ''
        for (const s of sheets) { const c = await createWsSheet(sheets.length > 1 ? `${base} — ${s.name}` : base, fromRows(s.rows), `Imported from ${f.name}`); first ||= c.id }
        toast(`Imported ${sheets.length} worksheet(s)`); nav(`/sheets/${first}`)
      } else {
        const rows = parseCSV(await f.text(), /\.tsv$/i.test(f.name) ? '\t' : ',')
        if (!rows.length) throw new Error('The file is empty.')
        if (rows.length > 20000) throw new Error('Too many rows (20,000 max).')
        const s = await createWsSheet(base, fromRows(rows), `Imported from ${f.name}`)
        toast(`Imported ${rows.length - 1} rows`); nav(`/sheets/${s.id}`)
      }
    } catch (e) { toast(`Import failed: ${(e as Error).message}`, 'error') } finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div>
      <PageHeader icon={Sheet} title={archived ? 'Archived spreadsheets' : 'Spreadsheets'}
        description="Organise links, contacts, notes, budgets and important information with formulas, formatting, filters and charts."
        actions={!archived && <>
          <Button icon={FileUp} loading={importing} onClick={() => fileRef.current?.click()}>Import</Button>
          <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>New spreadsheet</Button>
        </>} />
      <input ref={fileRef} type="file" hidden accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f) }} />

      {!archived && (
        <section aria-label="Start a new spreadsheet" className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">Start a new spreadsheet</h2>
          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5" style={{ scrollbarWidth: 'thin' }}>
            {PERSONAL_TEMPLATES.slice(0, 5).map((t) => (
              <li key={t.id} className="w-40 shrink-0 snap-start sm:w-auto">
                <button type="button" className="card card-hover flex h-full min-h-[84px] w-full flex-col items-start p-3 text-start" onClick={() => void start(t)}>
                  <span className="text-sm font-semibold">{t.name}</span><span className="mt-0.5 line-clamp-2 text-xs text-muted">{t.desc}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="min-h-[40px] text-sm text-accent hover:underline" onClick={() => setNewOpen(true)}>More templates…</button>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search spreadsheets" className="ps-8" placeholder="Search spreadsheets…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Link to={archived ? '/sheets' : '/sheets/archived'} className="btn btn-soft h-10 px-3 text-sm">{archived ? 'All spreadsheets' : 'Archived'}</Link>
      </div>

      {!all ? <Spinner /> : !list.length ? (
        <EmptyState icon={Sheet} title={q ? 'No matches' : archived ? 'No archived spreadsheets' : 'No spreadsheets yet'}
          action={!archived && !q && <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Create a spreadsheet</Button>}>
          {!archived && !q && 'Pick a template above or import a CSV / Excel file.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line/60 rounded-2xl border border-line">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-1 p-1.5 sm:gap-2 sm:p-2">
              <Link to={`/sheets/${s.id}`} className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3 rounded-xl px-2 hover:bg-raised/60">
                <Sheet className="h-5 w-5 shrink-0 text-ok" aria-hidden />
                <span className="min-w-0"><span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted">{s.columns.length} columns · {s.rows.length} rows · edited {new Date(s.updatedAt).toLocaleDateString()}</span></span>
              </Link>
              {s.archived && <Badge>archived</Badge>}
              <IconButton icon={Copy} label={`Duplicate ${s.name}`} className="hidden sm:inline-flex" onClick={async () => { await createWsSheet(`${s.name} (copy)`, { columns: s.columns, rows: s.rows, fmt: s.fmt, colFmt: s.colFmt, rowFmt: s.rowFmt, freezeCols: s.freezeCols, showTotals: s.showTotals, totals: s.totals, rules: s.rules }); toast('Duplicated') }} />
              {archived && <IconButton icon={ArchiveRestore} label={`Unarchive ${s.name}`} onClick={() => void wsSheetsRepo.toggle(s.id, 'archived')} />}
              <IconButton icon={Trash2} label={`Delete ${s.name}`} onClick={async () => {
                if (!(await confirm({ title: `Delete “${s.name}”?`, body: 'The spreadsheet moves to Trash.', danger: true, confirmLabel: 'Delete' }))) return
                await wsSheetsRepo.trash(s.id); toast('Moved to trash', 'success', { label: 'Undo', run: () => void wsSheetsRepo.restore(s.id) })
              }} />
            </li>
          ))}
        </ul>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New spreadsheet" wide>
        <p className="mb-3 text-sm text-muted">Templates contain column headers (and formulas) only — no sample data.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PERSONAL_TEMPLATES.map((t) => (
            <li key={t.id}><button type="button" className="card card-hover flex min-h-[64px] w-full flex-col items-start p-3 text-start" onClick={() => void start(t)}>
              <span className="font-semibold">{t.name}</span><span className="text-xs text-muted">{t.desc}</span>
            </button></li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
