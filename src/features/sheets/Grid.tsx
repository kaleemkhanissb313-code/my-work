import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/cn'
import { colLetter, isError, type Value } from './formula'
import { computeTotal, formatValue, isNumericFmt } from './format'
import type { CellFmt, SheetCol, TotalFn } from './types'

export interface Sel { r1: number; c1: number; r2: number; c2: number }
export const selBounds = (s: Sel) => ({ top: Math.min(s.r1, s.r2), bottom: Math.max(s.r1, s.r2), left: Math.min(s.c1, s.c2), right: Math.max(s.c1, s.c2) })
/** bar: the value is being typed in the formula bar, so the cell shows no input of its own (it would steal focus). */
export interface Editing { r: number; c: number; value: string; bar?: boolean }

export interface GridProps {
  columns: SheetCol[]
  /** Display order of rows (after filter/search); values are index-aligned with this list. */
  rowIds: string[]
  /** A1 row number shown in the gutter (the stored position, so formulas stay meaningful). */
  rowNumber: (displayRow: number) => number
  raw: (r: number, c: number) => string | number | null
  value: (r: number, c: number) => Value
  fmtOf: (r: number, c: number, v: Value) => CellFmt & { ruleLabel?: string }
  sel: Sel
  setSel: (s: Sel) => void
  editing: Editing | null
  setEditing: (e: Editing | null) => void
  onCommit: (r: number, c: number, raw: string, move: 'down' | 'right' | 'none') => void
  canEdit: (c: number) => boolean
  freezeCols: number
  totals?: Record<string, TotalFn>
  onResize?: (c: number, width: number) => void
  onCommand?: (cmd: 'copy' | 'cut' | 'paste' | 'clear' | 'undo' | 'redo' | 'bold' | 'italic' | 'underline' | 'selectAll', text?: string) => void
  linkLabel?: (type: SheetCol['type'], id: string) => string
  linkPath?: (type: SheetCol['type'], id: string) => string | null
  rowLink?: (r: number) => string | undefined
  onAttachment?: (r: number, c: number) => void
  highlight?: Set<string>
  height?: number
}

const GUTTER = 48

export function Grid(p: GridProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState(0)
  const [viewH, setViewH] = useState(p.height ?? 520)
  const coarse = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches
  const rowH = coarse ? 42 : 32
  const dragging = useRef(false)
  const lastTap = useRef<{ r: number; c: number; t: number } | null>(null)
  const n = p.rowIds.length
  const start = Math.max(0, Math.floor(scroll / rowH) - 10)
  const end = Math.min(n, Math.ceil((scroll + viewH) / rowH) + 10)
  const b = selBounds(p.sel)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep the active cell visible when moving with the keyboard.
  useEffect(() => {
    const el = ref.current
    if (!el || p.editing) return
    const top = p.sel.r2 * rowH, bottomEdge = top + rowH + 34
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottomEdge > el.scrollTop + el.clientHeight - 36) el.scrollTop = bottomEdge - el.clientHeight + 36
  }, [p.sel.r2, p.editing, rowH])

  const leftOffsets = useMemo(() => {
    const out: number[] = []
    let acc = GUTTER
    p.columns.forEach((c, i) => { out[i] = acc; acc += c.width })
    return out
  }, [p.columns])

  const totals = useMemo(() => {
    if (!p.totals) return null
    return p.columns.map((c, ci) => {
      const fn = p.totals![c.id] ?? 'none'
      if (fn === 'none') return null
      const vals: Value[] = []
      for (let r = 0; r < n; r++) vals.push(p.value(r, ci))
      return { fn, v: computeTotal(vals, fn) }
    })
  }, [p.totals, p.columns, p.value, n]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (dr: number, dc: number, extend: boolean) => {
    const r = Math.max(0, Math.min(n - 1, p.sel.r2 + dr)), c = Math.max(0, Math.min(p.columns.length - 1, p.sel.c2 + dc))
    p.setSel(extend ? { ...p.sel, r2: r, c2: c } : { r1: r, c1: c, r2: r, c2: c })
  }
  const startEdit = (r: number, c: number, initial?: string) => {
    if (!p.canEdit(c)) return
    const raw = p.raw(r, c)
    p.setEditing({ r, c, value: initial ?? (raw == null ? '' : String(raw)) })
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (p.editing) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key
    if (mod) {
      const map: Record<string, Parameters<NonNullable<GridProps['onCommand']>>[0]> = { c: 'copy', x: 'cut', z: 'undo', y: 'redo', b: 'bold', i: 'italic', u: 'underline', a: 'selectAll' }
      const cmd = k.toLowerCase() === 'z' && e.shiftKey ? 'redo' : map[k.toLowerCase()]
      if (cmd) { e.preventDefault(); p.onCommand?.(cmd); return }
      if (k.toLowerCase() === 'v') return // handled by the paste event (keeps native clipboard permissions simple)
    }
    switch (k) {
      case 'ArrowUp': e.preventDefault(); move(-1, 0, e.shiftKey); return
      case 'ArrowDown': e.preventDefault(); move(1, 0, e.shiftKey); return
      case 'ArrowLeft': e.preventDefault(); move(0, -1, e.shiftKey); return
      case 'ArrowRight': e.preventDefault(); move(0, 1, e.shiftKey); return
      case 'Tab': e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false); return
      case 'Enter': case 'F2': e.preventDefault(); startEdit(p.sel.r2, p.sel.c2); return
      case 'Delete': case 'Backspace': e.preventDefault(); p.onCommand?.('clear'); return
      case 'Home': e.preventDefault(); p.setSel({ r1: p.sel.r2, c1: 0, r2: p.sel.r2, c2: 0 }); return
      case 'End': e.preventDefault(); p.setSel({ r1: p.sel.r2, c1: p.columns.length - 1, r2: p.sel.r2, c2: p.columns.length - 1 }); return
      case 'PageDown': e.preventDefault(); move(Math.floor(viewH / rowH), 0, e.shiftKey); return
      case 'PageUp': e.preventDefault(); move(-Math.floor(viewH / rowH), 0, e.shiftKey); return
    }
    if (k.length === 1 && !e.altKey && !mod) { e.preventDefault(); startEdit(p.sel.r2, p.sel.c2, k) }
  }

  const cellDown = (e: React.PointerEvent, r: number, c: number) => {
    if (p.editing && (p.editing.r !== r || p.editing.c !== c)) p.onCommit(p.editing.r, p.editing.c, p.editing.value, 'none')
    if (e.shiftKey) p.setSel({ ...p.sel, r2: r, c2: c })
    else p.setSel({ r1: r, c1: c, r2: r, c2: c })
    if (e.pointerType === 'mouse') dragging.current = true
    else {
      // Touch: tap selects, a second tap on the same cell edits.
      const now = Date.now(), lt = lastTap.current
      if (lt && lt.r === r && lt.c === c && now - lt.t < 600) startEdit(r, c)
      lastTap.current = { r, c, t: now }
    }
    ref.current?.focus({ preventScroll: true })
  }
  useEffect(() => { const up = () => { dragging.current = false }; window.addEventListener('pointerup', up); return () => window.removeEventListener('pointerup', up) }, [])

  const resizeStart = (e: React.PointerEvent, c: number) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = p.columns[c].width
    const mv = (ev: PointerEvent) => p.onResize?.(c, Math.max(60, Math.min(600, w0 + ev.clientX - x0)))
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }

  const sticky = (ci: number): React.CSSProperties | undefined => (ci < p.freezeCols ? { position: 'sticky', left: leftOffsets[ci], zIndex: 2 } : undefined)
  const totalWidth = GUTTER + p.columns.reduce((a, c) => a + c.width, 0)

  const renderCell = (r: number, ci: number): ReactNode => {
    const c = p.columns[ci]
    const v = p.value(r, ci)
    const f = p.fmtOf(r, ci, v)
    const raw = p.raw(r, ci)
    if (c.type === 'attachment') {
      const count = typeof raw === 'string' && raw ? raw.split(',').filter(Boolean).length : 0
      return <button type="button" className="inline-flex items-center gap-1 text-xs text-accent underline" onClick={(e) => { e.stopPropagation(); p.onAttachment?.(r, ci) }}><Paperclip className="h-3 w-3" aria-hidden />{count ? `${count} file${count > 1 ? 's' : ''}` : 'Attach'}</button>
    }
    if ((c.type === 'product' || c.type === 'customer' || c.type === 'order') && typeof raw === 'string' && raw && !raw.startsWith('=')) {
      const path = p.linkPath?.(c.type, raw)
      const label = p.linkLabel?.(c.type, raw) ?? raw
      return path ? <Link to={path} className="text-accent underline" onClick={(e) => e.stopPropagation()}>{label}</Link> : label
    }
    if (c.type === 'link' && typeof v === 'string' && /^https?:\/\//i.test(v)) return <a href={v} target="_blank" rel="noopener noreferrer" className="text-accent underline" onClick={(e) => e.stopPropagation()}>{v.replace(/^https?:\/\//, '')}</a>
    const text = formatValue(v, f.fmt ?? 'auto')
    return <>{f.ruleLabel && <span className="me-1 text-[10px] font-semibold" aria-label={f.ruleLabel}>{f.ruleLabel}</span>}{text}</>
  }

  return (
    <div ref={ref} tabIndex={0} role="grid" aria-rowcount={n + 1} aria-colcount={p.columns.length} aria-label="Spreadsheet" onKeyDown={onKey} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
      onPaste={(e) => { if (p.editing) return; e.preventDefault(); p.onCommand?.('paste', e.clipboardData.getData('text/plain')) }}
      className="relative overflow-auto overscroll-contain rounded-xl border border-line bg-surface text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      style={{ height: p.height ?? 'min(70vh, 640px)', touchAction: 'pan-x pan-y' }}>
      <table className="border-separate border-spacing-0" style={{ width: totalWidth, tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: GUTTER }} />{p.columns.map((c) => <col key={c.id} style={{ width: c.width }} />)}</colgroup>
        <thead>
          <tr>
            <th className="sticky start-0 top-0 z-30 border-b border-e border-line bg-raised text-[10px] text-muted" style={{ height: 34 }} aria-label="Row numbers">#</th>
            {p.columns.map((c, ci) => (
              <th key={c.id} role="columnheader" scope="col" className={cn('sticky top-0 z-20 select-none border-b border-e border-line bg-raised px-2 text-start text-xs font-semibold', ci >= b.left && ci <= b.right && 'bg-accent/15')}
                style={{ ...(ci < p.freezeCols ? { left: leftOffsets[ci], zIndex: 25 } : {}), height: 34 }}>
                <div className="flex items-center gap-1 overflow-hidden"><span className="text-[10px] font-normal text-muted">{colLetter(ci)}</span><span className="truncate" title={c.name}>{c.name}</span></div>
                {p.onResize && <span role="separator" aria-orientation="vertical" aria-label={`Resize ${c.name}`} onPointerDown={(e) => resizeStart(e, ci)} className="absolute end-0 top-0 h-full w-2 cursor-col-resize touch-none hover:bg-accent/40" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {start > 0 && <tr style={{ height: start * rowH }} aria-hidden><td colSpan={p.columns.length + 1} /></tr>}
          {Array.from({ length: end - start }, (_, k) => start + k).map((r) => {
            const link = p.rowLink?.(r)
            return (
              <tr key={p.rowIds[r]} style={{ height: rowH }} role="row">
                <td className={cn('sticky start-0 z-10 border-b border-e border-line bg-raised text-center text-[11px] text-muted', r >= b.top && r <= b.bottom && 'bg-accent/15 text-fg')}>
                  {link ? <Link to={link} className="underline" title="Open record">{p.rowNumber(r)}</Link> : p.rowNumber(r)}
                </td>
                {p.columns.map((c, ci) => {
                  const selected = r >= b.top && r <= b.bottom && ci >= b.left && ci <= b.right
                  const active = r === p.sel.r2 && ci === p.sel.c2
                  const v = p.value(r, ci)
                  const f = p.fmtOf(r, ci, v)
                  const numeric = typeof v === 'number' || isNumericFmt(f.fmt ?? 'auto')
                  const isEditing = p.editing && !p.editing.bar && p.editing.r === r && p.editing.c === ci
                  const hit = p.highlight?.has(`${r}:${ci}`)
                  return (
                    <td key={c.id} role="gridcell" aria-selected={selected}
                      onPointerDown={(e) => cellDown(e, r, ci)} onPointerEnter={() => { if (dragging.current) p.setSel({ ...p.sel, r2: r, c2: ci }) }}
                      onDoubleClick={() => startEdit(r, ci)}
                      className={cn('relative overflow-hidden border-b border-e border-line/70 px-2', !f.wrap && 'whitespace-nowrap text-ellipsis', f.border && 'outline outline-1 -outline-offset-1 outline-fg/60',
                        selected && !active && 'bg-accent/10', active && 'outline outline-2 -outline-offset-2 outline-accent', hit && 'bg-warn/25', isError(v) && 'text-danger')}
                      style={{
                        ...sticky(ci), background: f.bg && !selected ? f.bg : sticky(ci) && !selected ? 'rgb(var(--surface))' : undefined, color: f.color,
                        fontWeight: f.b ? 700 : undefined, fontStyle: f.i ? 'italic' : undefined, textDecoration: f.u ? 'underline' : undefined,
                        fontSize: f.size ? `${f.size}px` : undefined, textAlign: f.align ?? (numeric ? 'right' : 'left'),
                        fontFamily: f.font === 'serif' ? 'Georgia, serif' : f.font === 'mono' ? 'ui-monospace, monospace' : undefined, fontVariantNumeric: 'tabular-nums',
                      }}>
                      {isEditing ? (
                        <input autoFocus aria-label={`Edit ${c.name} row ${p.rowNumber(r)}`} className="absolute inset-0 z-20 w-full bg-surface px-2 text-sm outline outline-2 outline-accent"
                          inputMode={c.type === 'number' || c.type === 'pkr' || c.type === 'percent' ? 'decimal' : undefined}
                          value={p.editing!.value} onChange={(e) => p.setEditing({ ...p.editing!, value: e.target.value })}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') { e.preventDefault(); p.onCommit(r, ci, p.editing!.value, 'down'); ref.current?.focus() }
                            else if (e.key === 'Tab') { e.preventDefault(); p.onCommit(r, ci, p.editing!.value, 'right'); ref.current?.focus() }
                            else if (e.key === 'Escape') { e.preventDefault(); p.setEditing(null); ref.current?.focus() }
                          }}
                          onBlur={() => { if (p.editing && p.editing.r === r && p.editing.c === ci) p.onCommit(r, ci, p.editing.value, 'none') }} />
                      ) : renderCell(r, ci)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {end < n && <tr style={{ height: (n - end) * rowH }} aria-hidden><td colSpan={p.columns.length + 1} /></tr>}
        </tbody>
        {totals && totals.some(Boolean) && (
          <tfoot>
            <tr>
              <td className="sticky bottom-0 start-0 z-20 border-t-2 border-line bg-raised px-1 text-center text-[10px] font-semibold text-muted" style={{ height: 34 }}>Σ</td>
              {totals.map((t, ci) => (
                <td key={ci} className="sticky bottom-0 z-10 border-e border-t-2 border-line bg-raised px-2 text-end text-xs font-bold tabular-nums" style={ci < p.freezeCols ? { left: leftOffsets[ci], zIndex: 15 } : undefined}>
                  {t ? <><span className="me-1 text-[10px] font-normal uppercase text-muted">{t.fn}</span>{t.v == null ? '—' : formatValue(t.v, t.fn === 'count' ? 'number' : p.fmtOf(0, ci, t.v).fmt ?? 'auto')}</> : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {n === 0 && <div className="p-8 text-center text-sm text-muted">No rows to show.</div>}
    </div>
  )
}
