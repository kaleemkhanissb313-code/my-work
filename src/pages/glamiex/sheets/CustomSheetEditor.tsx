import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight, Archive, ArrowDownAZ, ArrowUpZA, BarChart3, Bold, Columns3, Copy, Download, FileSpreadsheet, Highlighter, Italic,
  Loader2, Paintbrush, Printer, Redo2, Rows3, Search, Settings2, Sigma, Square, Trash2, Type, Underline, Undo2, WrapText, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { Badge, Button, IconButton, Input, Select } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { ColorPicker } from '@/features/colors/ColorPicker'
import { Grid, selBounds, type Editing, type Sel } from '@/features/sheets/Grid'
import {
  clearRange, computeSheet, copyRange, deleteCols, deleteRows, formatRange, insertCol, insertRows, parseTSV, pasteBlock, rangeToTSV, setCell, sortRows, toggleFmt, type Range, type SheetData,
} from '@/features/sheets/ops'
import { cellName, colLetter, FUNCTION_NAMES, isError, type Value } from '@/features/sheets/formula'
import { effectiveFmt, formatValue, NUM_FMTS, validateInput } from '@/features/sheets/format'
import { saveFormatPresets, sheetsRepo, useFormatPresets } from '@/features/sheets/repo'
import { gxAudit } from '@/features/glamiex/service'
import { downloadBlob, downloadText } from '@/services/backup'
import { toCSV } from '@/lib/csv'
import { xlsxBlob, type Cell, type XStyle } from '@/lib/xlsx'
import { printHtml } from '@/lib/markdown'
import type { CellFmt, GxSheet, NumFmt } from '@/features/sheets/types'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { AttachmentModal, ChartModal, ColumnModal, LinkPicker, RulesModal } from './SheetParts'

type Status = 'saved' | 'saving' | 'error' | 'dirty'
const pick = (s: GxSheet): SheetData => ({ columns: s.columns, rows: s.rows, fmt: s.fmt, colFmt: s.colFmt, rowFmt: s.rowFmt, freezeCols: s.freezeCols, showTotals: s.showTotals, totals: s.totals, rules: s.rules })
let internalClip: { text: string; raw: (string | number | null)[][]; fmt: (CellFmt | undefined)[][] } | null = null

export function CustomSheetEditor({ sheet }: { sheet: GxSheet }) {
  const { data: gx, go } = useGx()
  const [data, setData] = useState<SheetData>(() => pick(sheet))
  const [name, setName] = useState(sheet.name)
  const [status, setStatus] = useState<Status>('saved')
  const past = useRef<SheetData[]>([]), future = useRef<SheetData[]>([])
  const [, force] = useState(0)
  const [sel, setSel] = useState<Sel>({ r1: 0, c1: 0, r2: 0, c2: 0 })
  const [editing, setEditingRaw] = useState<Editing | null>(null)
  const [search, setSearch] = useState('')
  const [filterCol, setFilterCol] = useState('')
  const [filterText, setFilterText] = useState('')
  const [modal, setModal] = useState<null | 'columns' | 'rules' | 'chart' | { attach: [number, number] } | { link: [number, number] }>(null)
  const [error, setError] = useState<string | null>(null)
  const presets = useFormatPresets()

  /* ---------- history + autosave ---------- */
  const apply = useCallback((next: SheetData) => {
    setData((cur) => { past.current = [...past.current.slice(-99), cur]; future.current = []; return next })
    setStatus('dirty')
  }, [])
  const undo = () => { const prev = past.current.pop(); if (!prev) return; setData((cur) => { future.current.push(cur); return prev }); setStatus('dirty'); force((x) => x + 1) }
  const redo = () => { const nxt = future.current.pop(); if (!nxt) return; setData((cur) => { past.current.push(cur); return nxt }); setStatus('dirty'); force((x) => x + 1) }
  const save = useCallback(async (d: SheetData, nm: string) => {
    setStatus('saving')
    try { await sheetsRepo.update(sheet.id, { ...d, name: nm.trim() || 'Untitled sheet' }); setStatus('saved') }
    catch { setStatus('error') }
  }, [sheet.id])
  useEffect(() => {
    if (status !== 'dirty') return
    const t = setTimeout(() => void save(data, name), 700)
    return () => clearTimeout(t)
  }, [data, name, status, save])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (status === 'dirty' || status === 'saving') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  /* ---------- computed values, view (filter/search) ---------- */
  const values = useMemo(() => computeSheet(data), [data])
  const view = useMemo(() => {
    const fc = data.columns.findIndex((c) => c.id === filterCol)
    const t = filterText.trim().toLowerCase()
    return data.rows.map((_, i) => i).filter((i) => fc < 0 || !t || String(values[i]?.[fc] ?? '').toLowerCase().includes(t))
  }, [data, values, filterCol, filterText])
  const filtered = view.length !== data.rows.length
  const hits = useMemo(() => {
    const t = search.trim().toLowerCase()
    const set = new Set<string>(), list: [number, number][] = []
    if (!t) return { set, list }
    view.forEach((ri, r) => data.columns.forEach((_, c) => { const v = values[ri]?.[c]; if (v != null && String(isError(v) ? v.code : v).toLowerCase().includes(t)) { set.add(`${r}:${c}`); list.push([r, c]) } }))
    return { set, list }
  }, [search, view, values, data.columns])
  const b = selBounds(sel)
  const range: Range = { top: b.top, bottom: b.bottom, left: b.left, right: b.right }
  /** Apply a range op to the stored rows that the selection covers (works with filters too). */
  const perRow = (fn: (d: SheetData, g: Range) => SheetData) => {
    let d = data
    for (let r = b.top; r <= b.bottom; r++) { const ri = view[r]; if (ri != null) d = fn(d, { top: ri, bottom: ri, left: b.left, right: b.right }) }
    apply(d)
  }
  const needNoFilter = (what: string) => { if (filtered) { toast(`Clear the filter before ${what}.`, 'warn'); return true } return false }

  /* ---------- editing ---------- */
  const setEditing = (e: Editing | null) => {
    if (e) {
      const t = data.columns[e.c]?.type
      if (t === 'product' || t === 'customer' || t === 'order') { setModal({ link: [e.r, e.c] }); return }
      if (t === 'attachment') { setModal({ attach: [e.r, e.c] }); return }
    }
    setEditingRaw(e)
  }
  const commit = (r: number, c: number, raw: string, mv: 'down' | 'right' | 'none') => {
    setEditingRaw(null)
    const ri = view[r]
    if (ri == null) return
    const err = validateInput(raw, data.columns[c].type)
    if (err) { setError(`${cellName(ri, c)}: ${err}`); return }
    setError(null)
    const cur = data.rows[ri].cells[data.columns[c].id]
    if (String(cur ?? '') !== raw.trim()) apply(setCell(data, ri, c, raw))
    if (mv === 'down' && r < view.length - 1) setSel({ r1: r + 1, c1: c, r2: r + 1, c2: c })
    if (mv === 'down' && r === view.length - 1 && !filtered) { apply(insertRows(setCell(data, ri, c, raw), data.rows.length)); setSel({ r1: r + 1, c1: c, r2: r + 1, c2: c }) }
    if (mv === 'right' && c < data.columns.length - 1) setSel({ r1: r, c1: c + 1, r2: r, c2: c + 1 })
  }

  /* ---------- clipboard & commands ---------- */
  const command = async (cmd: string, text?: string) => {
    const g = { ...range, top: view[b.top] ?? 0, bottom: view[b.bottom] ?? 0 }
    switch (cmd) {
      case 'copy': case 'cut': {
        if (filtered && b.bottom > b.top) return toast('Clear the filter to copy several rows.', 'warn')
        const tsv = rangeToTSV(data, g, values)
        internalClip = { text: tsv, ...copyRange(data, g) }
        try { await navigator.clipboard.writeText(tsv) } catch { /* in-app clipboard still works */ }
        if (cmd === 'cut') apply(clearRange(data, g, true))
        toast(cmd === 'cut' ? 'Cut' : 'Copied', 'info', undefined, 1200)
        return
      }
      case 'paste': {
        if (needNoFilter('pasting')) return
        let t = text
        if (t == null) { try { t = await navigator.clipboard.readText() } catch { return toast('Allow clipboard access or use Ctrl+V.', 'warn') } }
        const same = internalClip && t != null && t.replace(/\r/g, '') === internalClip.text
        const block = same ? internalClip!.raw : parseTSV(t ?? '')
        if (!block.length) return
        if (block.length * Math.max(...block.map((x) => x.length)) > 50000) return toast('That paste is too large (50,000 cells max).', 'error')
        apply(pasteBlock(data, g.top, b.left, block, same ? internalClip!.fmt : undefined))
        return
      }
      case 'clear': perRow((d, rg) => clearRange(d, rg)); return
      case 'undo': undo(); return
      case 'redo': redo(); return
      case 'bold': perRow((d, rg) => toggleFmt(d, rg, 'b', view[sel.r2] ?? 0, sel.c2)); return
      case 'italic': perRow((d, rg) => toggleFmt(d, rg, 'i', view[sel.r2] ?? 0, sel.c2)); return
      case 'underline': perRow((d, rg) => toggleFmt(d, rg, 'u', view[sel.r2] ?? 0, sel.c2)); return
      case 'selectAll': setSel({ r1: 0, c1: 0, r2: Math.max(0, view.length - 1), c2: data.columns.length - 1 }); return
    }
  }
  const fmtPatch = (patch: Partial<Record<keyof CellFmt, unknown>>) => perRow((d, rg) => formatRange(d, rg, patch))
  const activeRi = view[sel.r2] ?? 0
  const activeFmt = data.fmt[`${data.rows[activeRi]?.id}:${data.columns[sel.c2]?.id}`] ?? {}
  const activeRaw = data.rows[activeRi]?.cells[data.columns[sel.c2]?.id] ?? null

  /* ---------- selection statistics ---------- */
  const stats = useMemo(() => {
    const nums: number[] = []
    let count = 0
    for (let r = b.top; r <= b.bottom; r++) for (let c = b.left; c <= b.right; c++) { const v = values[view[r]]?.[c]; if (v != null && v !== '') count++; if (typeof v === 'number') nums.push(v) }
    return { count, sum: nums.reduce((a, x) => a + x, 0), avg: nums.length ? nums.reduce((a, x) => a + x, 0) / nums.length : null, n: nums.length }
  }, [values, view, b.top, b.bottom, b.left, b.right])

  /* ---------- export ---------- */
  const exportRows = (styled: boolean): Cell[][] => [
    data.columns.map((c) => c.name),
    ...data.rows.map((row, ri) => data.columns.map((c, ci) => {
      const v = values[ri][ci]
      const plain = v == null ? null : isError(v) ? v.code : typeof v === 'boolean' ? String(v) : v
      if (!styled) return plain
      const f = effectiveFmt(data, row.id, c, v)
      const s: XStyle = { bold: f.b, italic: f.i, underline: f.u, color: f.color, bg: f.bg, align: f.align, border: f.border, numFmt: f.fmt === 'pkr' ? 'pkr' : f.fmt === 'percent' ? 'percent' : f.fmt === 'decimal2' ? 'decimal2' : undefined }
      return Object.values(s).some((x) => x != null && x !== false) ? { v: plain as string | number | null, s } : plain
    })),
  ]
  const exportAs = (k: 'csv' | 'xlsx' | 'print') => {
    const file = name.toLowerCase().replace(/\W+/g, '-') || 'sheet'
    if (k === 'csv') downloadText(toCSV(exportRows(false) as unknown[][]), `${file}.csv`, 'text/csv;charset=utf-8')
    else if (k === 'xlsx') downloadBlob(xlsxBlob([{ name, rows: exportRows(true), colWidths: data.columns.map((c) => Math.round(c.width / 7)) }]), `${file}.xlsx`)
    else {
      const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
      const body = data.rows.map((row, ri) => `<tr>${data.columns.map((c, ci) => { const v = values[ri][ci]; const f = effectiveFmt(data, row.id, c, v); const st = [f.b && 'font-weight:700', f.i && 'font-style:italic', f.color && `color:${f.color}`, f.bg && `background:${f.bg}`, f.align && `text-align:${f.align}`].filter(Boolean).join(';'); return `<td style="${st}">${f.ruleLabel ? esc(f.ruleLabel) + ' ' : ''}${esc(formatValue(v, f.fmt ?? 'auto'))}</td>` }).join('')}</tr>`).join('')
      printHtml(name, `<p>GLAMIEX sheet · currency PKR · generated ${esc(new Date().toLocaleString())}</p><table><thead><tr>${data.columns.map((c) => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`)
    }
  }

  /* ---------- link options ---------- */
  const linkOptions = (t: string) => t === 'product' ? live(gx.products).map((p) => ({ id: p.id, label: `${p.name} (${p.sku})` }))
    : t === 'customer' ? live(gx.people).map((p) => ({ id: p.id, label: `${p.name} · ${p.type}` }))
    : live(gx.orders).map((o) => ({ id: o.id, label: o.orderNo }))
  const linkLabel = (t: string, id: string) => t === 'product' ? gx.products.find((p) => p.id === id)?.name ?? '(deleted product)' : t === 'customer' ? gx.people.find((p) => p.id === id)?.name ?? '(deleted person)' : gx.orders.find((o) => o.id === id)?.orderNo ?? '(deleted sale)'
  const linkPath = (t: string, id: string) => `/glamiex/${t === 'product' ? 'products' : t === 'customer' ? 'people' : 'sales'}/${id}`

  const T = ({ icon: I, label, on, active, disabled }: { icon: typeof Bold; label: string; on: () => void; active?: boolean; disabled?: boolean }) => <IconButton icon={I} label={label} onClick={on} active={active} disabled={disabled} className="h-9 w-9" />
  const statusEl = status === 'saving' ? <span className="flex items-center gap-1 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</span>
    : status === 'error' ? <button className="flex items-center gap-1 text-xs text-danger underline" onClick={() => void save(data, name)}><AlertTriangle className="h-3.5 w-3.5" />Save failed — retry</button>
    : status === 'dirty' ? <span className="text-xs text-muted">Unsaved…</span> : <span className="flex items-center gap-1 text-xs text-ok"><CheckCircle2 className="h-3.5 w-3.5" />Saved</span>

  return (
    <div className="space-y-2">
      {/* Title row */}
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Sheet name" value={name} onChange={(e) => { setName(e.target.value); setStatus('dirty') }} className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-1 text-lg font-semibold outline-none focus:bg-raised" />
        <div aria-live="polite">{statusEl}</div>
        <Button size="sm" icon={Download} onClick={() => exportAs('csv')}>CSV</Button>
        <Button size="sm" icon={FileSpreadsheet} onClick={() => exportAs('xlsx')}>Excel</Button>
        <Button size="sm" icon={Printer} onClick={() => exportAs('print')}>PDF</Button>
        <Button size="sm" icon={Copy} onClick={async () => { const { createSheet } = await import('@/features/sheets/repo'); const s = await createSheet(`${name} (copy)`, data); go(`sheets/${s.id}`) }}>Duplicate</Button>
        <Button size="sm" icon={Archive} onClick={async () => { await sheetsRepo.toggle(sheet.id, 'archived'); toast(sheet.archived ? 'Restored from archive' : 'Archived'); go('sheets/all') }}>{sheet.archived ? 'Unarchive' : 'Archive'}</Button>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => {
          if (!(await confirm({ title: `Delete “${name}”?`, body: 'The sheet moves to Trash and can be restored. Business records are not affected.', danger: true, confirmLabel: 'Delete' }))) return
          await sheetsRepo.trash(sheet.id); await gxAudit('sheet', sheet.id, 'delete', name); go('sheets/all')
        }}>Delete</Button>
      </div>

      {/* Formatting toolbar — scrolls horizontally on phones */}
      <div className="card flex items-center gap-0.5 overflow-x-auto p-1" role="toolbar" aria-label="Formatting" style={{ scrollbarWidth: 'thin' }}>
        <T icon={Undo2} label="Undo (Ctrl+Z)" on={undo} disabled={!past.current.length} />
        <T icon={Redo2} label="Redo (Ctrl+Y)" on={redo} disabled={!future.current.length} />
        <span className="mx-1 h-6 w-px shrink-0 bg-line" />
        <T icon={Bold} label="Bold (Ctrl+B)" on={() => void command('bold')} active={!!activeFmt.b} />
        <T icon={Italic} label="Italic (Ctrl+I)" on={() => void command('italic')} active={!!activeFmt.i} />
        <T icon={Underline} label="Underline (Ctrl+U)" on={() => void command('underline')} active={!!activeFmt.u} />
        <Select aria-label="Font size" className="h-9 w-[70px] shrink-0 px-1 text-xs" value={activeFmt.size ?? ''} onChange={(e) => fmtPatch({ size: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Size</option>{[10, 11, 12, 13, 14, 16, 18, 20, 24, 28].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select aria-label="Font" className="h-9 w-[78px] shrink-0 px-1 text-xs" value={activeFmt.font ?? ''} onChange={(e) => fmtPatch({ font: e.target.value || null })}>
          <option value="">Font</option><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option>
        </Select>
        <ColorPicker label="Text color" icon={<Type className="h-4 w-4" aria-hidden />} value={activeFmt.color} onChange={(c) => fmtPatch({ color: c })} />
        <ColorPicker label="Fill color" icon={<Highlighter className="h-4 w-4" aria-hidden />} value={activeFmt.bg} onChange={(c) => fmtPatch({ bg: c })} />
        <T icon={AlignLeft} label="Align left" on={() => fmtPatch({ align: 'left' })} active={activeFmt.align === 'left'} />
        <T icon={AlignCenter} label="Align center" on={() => fmtPatch({ align: 'center' })} active={activeFmt.align === 'center'} />
        <T icon={AlignRight} label="Align right" on={() => fmtPatch({ align: 'right' })} active={activeFmt.align === 'right'} />
        <T icon={Square} label="Borders" on={() => perRow((d, rg) => toggleFmt(d, rg, 'border', activeRi, sel.c2))} active={!!activeFmt.border} />
        <T icon={WrapText} label="Wrap text" on={() => perRow((d, rg) => toggleFmt(d, rg, 'wrap', activeRi, sel.c2))} active={!!activeFmt.wrap} />
        <Select aria-label="Number format" className="h-9 w-[110px] shrink-0 px-1 text-xs" value={activeFmt.fmt ?? ''} onChange={(e) => fmtPatch({ fmt: (e.target.value || null) as NumFmt | null })}>
          <option value="">Format…</option>{NUM_FMTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </Select>
        <Select aria-label="Apply style preset" className="h-9 w-[110px] shrink-0 px-1 text-xs" value="" onChange={(e) => {
          if (e.target.value === '__save') {
            const nm = prompt('Name for this style preset')?.trim()
            if (nm) void saveFormatPresets([...presets, { id: crypto.randomUUID(), name: nm, fmt: activeFmt }]).then(() => toast('Style preset saved'))
            return
          }
          const pr = presets.find((x) => x.id === e.target.value); if (pr) fmtPatch(pr.fmt)
        }}>
          <option value="">Styles…</option>{presets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}<option value="__save">＋ Save current style…</option>
        </Select>
        <T icon={Paintbrush} label="Clear formatting" on={() => perRow((d, rg) => { const f = { ...d.fmt }; for (let c = rg.left; c <= rg.right; c++) delete f[`${d.rows[rg.top].id}:${d.columns[c].id}`]; return { ...d, fmt: f } })} />
        <span className="mx-1 h-6 w-px shrink-0 bg-line" />
        <T icon={Rows3} label="Insert row below" on={() => { if (!needNoFilter('inserting rows')) apply(insertRows(data, (view[b.bottom] ?? data.rows.length - 1) + 1)) }} />
        <T icon={Columns3} label="Insert column right" on={() => apply(insertCol(data, b.right + 1))} />
        <T icon={Trash2} label="Delete selected rows" on={async () => { if (needNoFilter('deleting rows')) return; if (await confirm({ title: `Delete ${b.bottom - b.top + 1} row(s)?`, body: 'You can undo this.', danger: true, confirmLabel: 'Delete rows' })) apply(deleteRows(data, view[b.top], view[b.bottom])) }} />
        <IconButton icon={Trash2} label="Delete selected columns" className="h-9 w-9 text-danger" onClick={async () => { if (await confirm({ title: `Delete column(s) ${colLetter(b.left)}–${colLetter(b.right)}?`, body: 'You can undo this.', danger: true, confirmLabel: 'Delete columns' })) apply(deleteCols(data, b.left, b.right)) }} />
        <T icon={ArrowDownAZ} label="Sort ascending by this column" on={() => { if (!needNoFilter('sorting')) apply(sortRows(data, sel.c2, 1)) }} />
        <T icon={ArrowUpZA} label="Sort descending by this column" on={() => { if (!needNoFilter('sorting')) apply(sortRows(data, sel.c2, -1)) }} />
        <T icon={Sigma} label="Toggle totals row" on={() => apply({ ...data, showTotals: !data.showTotals, totals: Object.keys(data.totals).length ? data.totals : Object.fromEntries(data.columns.filter((c) => c.type === 'number' || c.type === 'pkr').map((c) => [c.id, 'sum'])) })} active={data.showTotals} />
        <Select aria-label="Freeze columns" className="h-9 w-[92px] shrink-0 px-1 text-xs" value={data.freezeCols} onChange={(e) => apply({ ...data, freezeCols: Number(e.target.value) })}>
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n ? `Freeze ${n}` : 'No freeze'}</option>)}
        </Select>
        <T icon={Settings2} label="Column settings" on={() => setModal('columns')} />
        <IconButton icon={Highlighter} label="Conditional formatting" className="h-9 w-9 text-ok" onClick={() => setModal('rules')} />
        <T icon={BarChart3} label="Chart from selection" on={() => setModal('chart')} />
      </div>

      {/* Formula bar + search/filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-14 shrink-0 rounded-lg bg-raised px-2 py-2 text-center font-mono text-xs" aria-label="Active cell">{cellName(activeRi, sel.c2)}</span>
        <span className="text-sm italic text-muted" aria-hidden>fx</span>
        <Input aria-label="Formula bar" className="min-w-[10rem] flex-1 font-mono text-sm" list="fx-functions"
          value={editing && editing.r === sel.r2 && editing.c === sel.c2 ? editing.value : activeRaw == null ? '' : String(activeRaw)}
          onFocus={() => { if (!editing) setEditingRaw({ r: sel.r2, c: sel.c2, value: activeRaw == null ? '' : String(activeRaw) }) }}
          onChange={(e) => setEditingRaw({ r: sel.r2, c: sel.c2, value: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && editing) { e.preventDefault(); commit(editing.r, editing.c, editing.value, 'down') } if (e.key === 'Escape') setEditingRaw(null) }}
          onBlur={() => { if (editing && editing.r === sel.r2 && editing.c === sel.c2) commit(editing.r, editing.c, editing.value, 'none') }}
          placeholder="Value or formula, e.g. =SUM(B1:B10)" />
        <datalist id="fx-functions">{FUNCTION_NAMES.map((f) => <option key={f} value={`=${f}(`} />)}</datalist>
        <div className="relative w-full sm:w-44"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search cells" className="pl-8" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && hits.list.length) { const i = hits.list.findIndex(([r, c]) => r > sel.r2 || (r === sel.r2 && c > sel.c2)); const [r, c] = hits.list[i < 0 ? 0 : i]; setSel({ r1: r, c1: c, r2: r, c2: c }) } }} /></div>
        {search && <Badge>{hits.list.length} found</Badge>}
        <Select aria-label="Filter column" className="w-auto" value={filterCol} onChange={(e) => setFilterCol(e.target.value)}><option value="">No filter</option>{data.columns.map((c) => <option key={c.id} value={c.id}>Filter: {c.name}</option>)}</Select>
        {filterCol && <Input aria-label="Filter text" className="w-32" placeholder="contains…" value={filterText} onChange={(e) => setFilterText(e.target.value)} />}
      </div>
      {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <Grid columns={data.columns} rowIds={view.map((i) => data.rows[i].id)} rowNumber={(r) => view[r] + 1}
        raw={(r, c) => data.rows[view[r]]?.cells[data.columns[c].id] ?? null} value={(r, c) => values[view[r]]?.[c] ?? null}
        fmtOf={(r, c, v: Value) => effectiveFmt(data, data.rows[view[r]]?.id ?? '', data.columns[c], v)}
        sel={sel} setSel={setSel} editing={editing} setEditing={setEditing} onCommit={commit} canEdit={() => true} freezeCols={data.freezeCols}
        totals={data.showTotals ? data.totals : undefined} onResize={(c, w) => setData((d) => ({ ...d, columns: d.columns.map((x, i) => (i === c ? { ...x, width: w } : x)) }))}
        onCommand={(cmd, text) => void command(cmd, text)} highlight={hits.set}
        linkLabel={linkLabel} linkPath={linkPath} onAttachment={(r, c) => setModal({ attach: [r, c] })} />

      <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted')} aria-live="polite">
        <span>{view.length} of {data.rows.length} rows{filtered && ' (filtered)'}</span>
        <span>Selection: {stats.count} cell(s)</span>
        {stats.n > 0 && <><span>Sum <b className="text-fg">{formatValue(stats.sum, 'number')}</b></span><span>Avg <b className="text-fg">{formatValue(stats.avg, 'number')}</b></span></>}
        <span className="hidden md:inline">Tip: type to edit, Enter to move down, Ctrl+C / Ctrl+V copy-paste with formatting, Shift+arrows to select. Phones: tap to select, tap again to edit.</span>
      </div>

      {modal === 'columns' && <ColumnModal col={data.columns[sel.c2]} index={sel.c2} total={data.totals[data.columns[sel.c2].id] ?? 'none'} onClose={() => setModal(null)}
        onSave={(col, tot) => apply({ ...data, columns: data.columns.map((c) => (c.id === col.id ? col : c)), totals: { ...data.totals, [col.id]: tot }, showTotals: data.showTotals || tot !== 'none' })} />}
      {modal === 'rules' && <RulesModal rules={data.rules} columns={data.columns} onClose={() => setModal(null)} onSave={(rules) => apply({ ...data, rules })} />}
      {modal === 'chart' && <ChartModal title={name} columns={data.columns} values={values} rowIdx={view.slice(b.top, b.bottom === b.top ? view.length : b.bottom + 1)} left={b.left} right={b.right} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'attach' in modal && (
        <AttachmentModal raw={data.rows[view[modal.attach[0]]]?.cells[data.columns[modal.attach[1]].id] ?? null} onClose={() => setModal(null)}
          onSave={(ids) => apply(setCell(data, view[modal.attach[0]], modal.attach[1], ids.join(',')))} />
      )}
      {modal && typeof modal === 'object' && 'link' in modal && (() => {
        const [r, c] = modal.link, t = data.columns[c].type
        return <LinkPicker type={t} options={linkOptions(t)} current={(data.rows[view[r]]?.cells[data.columns[c].id] as string) ?? null} onClose={() => setModal(null)}
          onPick={(id) => apply(setCell(data, view[r], c, id ?? ''))} />
      })()}
    </div>
  )
}
