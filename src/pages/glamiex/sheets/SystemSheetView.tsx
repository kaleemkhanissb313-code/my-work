import { useMemo, useState } from 'react'
import { ArrowDownAZ, ArrowUpZA, BarChart3, CheckCircle2, CopyPlus, Lock, Search, Undo2 } from 'lucide-react'
import { Badge, Button, IconButton, Input, Modal } from '@/components/ui'
import { toast } from '@/components/feedback'
import { Grid, selBounds, type Editing, type Sel } from '@/features/sheets/Grid'
import { buildSystemSheet, SYSTEM_SHEETS, type SystemKey } from '@/features/sheets/systemSheets'
import { effectiveFmt, validateInput } from '@/features/sheets/format'
import { computeGrid, isError, type Value } from '@/features/sheets/formula'
import { createSheet } from '@/features/sheets/repo'
import { newRow } from '@/features/sheets/ops'
import { updateProduct } from '@/features/glamiex/service'
import { pkr } from '@/features/glamiex/money'
import { ExportButtons, RangeBar, useRange } from '@/features/glamiex/ui'
import type { GxSheet } from '@/features/sheets/types'
import { useGx } from '../context'
import { earliestDate } from '../sections/shared'
import { ChartModal } from './SheetParts'

interface Change { rowId: string; colId: string; label: string; field: 'name' | 'category' | 'buyPrice' | 'sellPrice' | 'lowStockAt'; old: string | number | null; next: string | number }

export function SystemSheetView({ sheetKey }: { sheetKey: SystemKey }) {
  const { data, tz, go } = useGx()
  const meta = SYSTEM_SHEETS.find((s) => s.key === sheetKey)!
  const { state, setState, range: raw } = useRange(`sheet-${sheetKey}`, tz, 'thisMonth')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const live = useMemo(() => buildSystemSheet(sheetKey, data, range, tz), [sheetKey, data, range.from, range.to, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const [changes, setChanges] = useState<Change[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sel, setSel] = useState<Sel>({ r1: 0, c1: 0, r2: 0, c2: 0 })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [sort, setSort] = useState<{ c: number; dir: 1 | -1 } | null>(null)
  const [search, setSearch] = useState('')
  const [chart, setChart] = useState(false)
  const [busy, setBusy] = useState(false)

  // Pending edits overlay the live values until the user confirms them.
  const rows = useMemo(() => live.rows.map((r) => {
    const mine = changes.filter((c) => c.rowId === r.id)
    return mine.length ? { ...r, cells: { ...r.cells, ...Object.fromEntries(mine.map((m) => [m.colId, m.next])) } } : r
  }), [live.rows, changes])
  const values = useMemo<Value[][]>(() => computeGrid(rows.map((r) => live.columns.map((c) => r.cells[c.id] ?? null))), [rows, live.columns])
  const view = useMemo(() => {
    let idx = rows.map((_, i) => i)
    const t = search.trim().toLowerCase()
    if (t) idx = idx.filter((i) => live.columns.some((_, c) => String(values[i][c] ?? '').toLowerCase().includes(t)))
    if (sort) idx.sort((a, b) => { const x = values[a][sort.c], y = values[b][sort.c]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * sort.dir })
    return idx
  }, [rows, values, search, sort, live.columns])
  const sheetLike: Pick<GxSheet, 'fmt' | 'colFmt' | 'rowFmt' | 'rules'> = { fmt: Object.fromEntries(changes.map((c) => [`${c.rowId}:${c.colId}`, { bg: '#fef3c7', i: true }])), colFmt: {}, rowFmt: live.rowFmt ?? {}, rules: live.rules }
  const editable = (c: number) => !!live.editable?.[live.columns[c].id]

  const commit = (r: number, c: number, rawIn: string) => {
    setEditing(null)
    const row = live.rows[view[r]], col = live.columns[c], field = live.editable?.[col.id]
    if (!row || !field) return
    const v = rawIn.trim()
    if (v.startsWith('=')) return toast('Formulas are not allowed in official product fields.', 'warn')
    let next: string | number
    if (field === 'name' || field === 'category') { if (field === 'name' && !v) return toast('Product name cannot be empty.', 'error'); next = v }
    else {
      const err = validateInput(v, field === 'lowStockAt' ? 'number' : 'pkr'); if (err || !v) return toast(err ?? 'Enter a value.', 'error')
      next = Number(v.replace(/,/g, '').replace(/^Rs\.?\s*/i, ''))
      if (next < 0 || (field === 'lowStockAt' && !Number.isInteger(next))) return toast('Enter a valid non-negative value.', 'error')
    }
    const old = row.cells[col.id] ?? null
    setChanges((cs) => [...cs.filter((x) => !(x.rowId === row.id && x.colId === col.id)), ...(String(old) === String(next) ? [] : [{ rowId: row.id, colId: col.id, label: `${row.cells.name} · ${col.name}`, field, old, next }])])
  }
  const applyChanges = async () => {
    setBusy(true)
    try {
      const byRow = new Map<string, Record<string, string | number>>()
      for (const c of changes) {
        const patch = byRow.get(c.rowId) ?? {}
        patch[c.field] = c.field === 'buyPrice' || c.field === 'sellPrice' ? Math.round(Number(c.next) * 100) : c.next
        byRow.set(c.rowId, patch)
      }
      for (const [id, patch] of byRow) await updateProduct(id, patch)
      toast(`${changes.length} change(s) applied to products (recorded in the audit trail)`)
      setChanges([]); setConfirmOpen(false)
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }

  const copyToCustom = async () => {
    const cols = live.columns.map((c) => ({ ...c, id: crypto.randomUUID() }))
    const s = await createSheet(`${meta.title} — ${range.from} to ${range.to}`, {
      columns: cols, rows: rows.map((r) => ({ ...newRow(), cells: Object.fromEntries(live.columns.map((c, i) => [cols[i].id, r.cells[c.id] ?? null]).filter(([, v]) => v != null)) })),
      fmt: {}, colFmt: {}, rowFmt: {}, freezeCols: 1, showTotals: !!Object.keys(live.totals).length,
      totals: Object.fromEntries(Object.entries(live.totals).map(([k, v]) => [cols[live.columns.findIndex((c) => c.id === k)]?.id, v]).filter(([k]) => k)), rules: [],
    }, `Snapshot copy of ${meta.title} — a static copy you can edit freely; it does not change business records.`)
    toast('Editable copy created'); go(`sheets/${s.id}`)
  }

  const b = selBounds(sel)
  const exportRows = () => [live.columns.map((c) => c.name), ...view.map((i) => live.columns.map((_c, ci) => { const v = values[i][ci]; return v == null ? null : isError(v) ? v.code : typeof v === 'boolean' ? String(v) : v }))]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{meta.title}</h2><p className="text-xs text-muted">{meta.desc}. Live from your records{live.editable ? ' — highlighted columns are editable after confirmation' : ' — read-only'}.</p></div>
        <Badge tone="ok"><Lock className="me-0.5 inline h-3 w-3" />Official data</Badge>
      </div>
      {meta.ranged ? <RangeBar state={state} setState={setState} range={range} /> : <div className="h-1" />}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-52"><Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Search sheet" className="ps-8" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <IconButton icon={ArrowDownAZ} label="Sort ascending by selected column" onClick={() => setSort({ c: sel.c2, dir: 1 })} active={sort?.c === sel.c2 && sort.dir === 1} />
        <IconButton icon={ArrowUpZA} label="Sort descending by selected column" onClick={() => setSort({ c: sel.c2, dir: -1 })} active={sort?.c === sel.c2 && sort.dir === -1} />
        {sort && <Button size="sm" variant="ghost" onClick={() => setSort(null)}>Clear sort</Button>}
        <Button size="sm" icon={BarChart3} onClick={() => setChart(true)}>Chart</Button>
        <Button size="sm" icon={CopyPlus} onClick={() => void copyToCustom()}>Editable copy</Button>
        <div className="ms-auto"><ExportButtons name={meta.title} period={meta.ranged ? `${range.from} to ${range.to}` : 'As of today'} sheets={() => [{ name: meta.title.slice(0, 31), rows: exportRows() }]} /></div>
      </div>
      {changes.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 border-warn/50 p-3 text-sm" role="status">
          <span className="flex-1"><b>{changes.length} pending change(s)</b> to official product records — not saved yet.</span>
          <Button size="sm" icon={Undo2} onClick={() => setChanges([])}>Discard</Button>
          <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => setConfirmOpen(true)}>Review & apply</Button>
        </div>
      )}
      <Grid columns={live.columns} rowIds={view.map((i) => rows[i].id)} rowNumber={(r) => r + 1}
        raw={(r, c) => rows[view[r]]?.cells[live.columns[c].id] ?? null} value={(r, c) => values[view[r]]?.[c] ?? null}
        fmtOf={(r, c, v) => { const f = effectiveFmt(sheetLike, rows[view[r]]?.id ?? '', live.columns[c], v); return editable(c) && !f.bg ? { ...f, bg: 'rgb(var(--accent) / 0.07)' } : f }}
        sel={sel} setSel={setSel} editing={editing} setEditing={(e) => { if (e && !editable(e.c)) { toast('This sheet is read-only here. Use the record page or make an editable copy.', 'info'); return } setEditing(e) }}
        onCommit={(r, c, v) => commit(r, c, v)} canEdit={editable} freezeCols={1} totals={live.totals}
        onCommand={async (cmd) => { if (cmd === 'copy') { const t = view.slice(b.top, b.bottom + 1).map((i) => live.columns.slice(b.left, b.right + 1).map((_, k) => String(values[i][b.left + k] ?? '')).join('\t')).join('\n'); try { await navigator.clipboard.writeText(t); toast('Copied', 'info', undefined, 1200) } catch { toast('Clipboard blocked by the browser', 'warn') } } if (cmd === 'selectAll') setSel({ r1: 0, c1: 0, r2: Math.max(0, view.length - 1), c2: live.columns.length - 1 }) }}
        rowLink={(r) => live.rows[view[r]]?.link} highlight={new Set()} />
      <p className="text-xs text-muted">{view.length} rows · click a row number to open the record · totals exclude cancelled sales and include refunds and discounts exactly as in GLAMIEX reports.</p>
      {chart && <ChartModal title={meta.title} columns={live.columns} values={values} rowIdx={view} left={b.left} right={Math.max(b.right, b.left)} onClose={() => setChart(false)} />}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Apply changes to product records?" wide
        footer={<><Button onClick={() => setConfirmOpen(false)}>Back</Button><Button variant="primary" loading={busy} onClick={() => void applyChanges()}>Apply {changes.length} change(s)</Button></>}>
        <p className="mb-3 text-sm text-muted">These edits update the official products. Prices affect <b>new</b> sales only — past sales keep their saved price and cost. Every change is written to the audit trail.</p>
        <ul className="max-h-72 divide-y divide-line/60 overflow-y-auto text-sm">{changes.map((c) => (
          <li key={c.rowId + c.colId} className="flex flex-wrap gap-2 py-2"><span className="min-w-0 flex-1 font-medium">{c.label}</span>
            <span className="text-muted line-through">{c.field.endsWith('Price') ? pkr(Math.round(Number(c.old) * 100)) : String(c.old ?? '—')}</span><span>→</span>
            <b>{c.field.endsWith('Price') ? pkr(Math.round(Number(c.next) * 100)) : String(c.next)}</b></li>
        ))}</ul>
      </Modal>
    </div>
  )
}

