import { uid } from '@/lib/id'
import { parseCSV } from '@/lib/csv'
import { computeGrid, type Value } from './formula'
import { normaliseInput } from './format'
import type { CellFmt, ColType, GxSheet, SheetCol, SheetRow } from './types'

/** Pure operations on a custom sheet. Each returns a NEW sheet object (enables undo/redo by snapshot). */
export type SheetData = Pick<GxSheet, 'columns' | 'rows' | 'fmt' | 'colFmt' | 'rowFmt' | 'freezeCols' | 'showTotals' | 'totals' | 'rules'>
export interface Range { top: number; bottom: number; left: number; right: number }

export const newCol = (name: string, type: ColType = 'text', width = 140): SheetCol => ({ id: uid(), name, type, width })
export const newRow = (): SheetRow => ({ id: uid(), cells: {} })

export function blankSheet(cols = 6, rows = 30): SheetData {
  const columns = Array.from({ length: cols }, (_, i) => newCol(`Column ${i + 1}`))
  return { columns, rows: Array.from({ length: rows }, newRow), fmt: {}, colFmt: {}, rowFmt: {}, freezeCols: 1, showTotals: false, totals: {}, rules: [] }
}

export const rawGrid = (s: Pick<SheetData, 'columns' | 'rows'>) => s.rows.map((r) => s.columns.map((c) => r.cells[c.id] ?? null))
export const computeSheet = (s: Pick<SheetData, 'columns' | 'rows'>): Value[][] => computeGrid(rawGrid(s))

export function setCell(s: SheetData, r: number, c: number, input: string): SheetData {
  const col = s.columns[c], row = s.rows[r]
  if (!col || !row) return s
  const v = normaliseInput(input, col.type)
  const cells = { ...row.cells }
  if (v == null) delete cells[col.id]; else cells[col.id] = v
  return { ...s, rows: s.rows.map((x, i) => (i === r ? { ...x, cells } : x)) }
}

export function clearRange(s: SheetData, g: Range, withFormats = false): SheetData {
  const ids = s.columns.slice(g.left, g.right + 1).map((c) => c.id)
  const rows = s.rows.map((row, i) => {
    if (i < g.top || i > g.bottom) return row
    const cells = { ...row.cells }
    ids.forEach((id) => delete cells[id])
    return { ...row, cells }
  })
  let fmt = s.fmt
  if (withFormats) { fmt = { ...fmt }; for (let r = g.top; r <= g.bottom; r++) for (const id of ids) delete fmt[`${s.rows[r]?.id}:${id}`] }
  return { ...s, rows, fmt }
}

export function insertRows(s: SheetData, at: number, count = 1): SheetData {
  const rows = [...s.rows]
  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, ...Array.from({ length: count }, newRow))
  return { ...s, rows }
}
export function deleteRows(s: SheetData, top: number, bottom: number): SheetData {
  const rows = s.rows.filter((_, i) => i < top || i > bottom)
  return { ...s, rows: rows.length ? rows : [newRow()] }
}
export function insertCol(s: SheetData, at: number, col = newCol(`Column ${s.columns.length + 1}`)): SheetData {
  const columns = [...s.columns]
  columns.splice(Math.max(0, Math.min(at, columns.length)), 0, col)
  return { ...s, columns }
}
export function deleteCols(s: SheetData, left: number, right: number): SheetData {
  if (right - left + 1 >= s.columns.length) return s // keep at least one column
  const gone = new Set(s.columns.slice(left, right + 1).map((c) => c.id))
  return { ...s, columns: s.columns.filter((c) => !gone.has(c.id)), rows: s.rows.map((r) => ({ ...r, cells: Object.fromEntries(Object.entries(r.cells).filter(([k]) => !gone.has(k))) })) }
}

/** Sort rows by a column using COMPUTED values (numbers numerically, text alphabetically; blanks last). */
export function sortRows(s: SheetData, c: number, dir: 1 | -1): SheetData {
  const vals = computeSheet(s)
  const idx = s.rows.map((_, i) => i)
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  idx.sort((a, b) => {
    const x = vals[a][c], y = vals[b][c]
    const ex = x == null || x === '', ey = y == null || y === ''
    if (ex || ey) return ex === ey ? 0 : ex ? 1 : -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return coll.compare(String(x), String(y)) * dir
  })
  return { ...s, rows: idx.map((i) => s.rows[i]) }
}

/** Tab-separated text of a range (computed values), for the clipboard. */
export function rangeToTSV(_s: SheetData, g: Range, values: Value[][]): string {
  const out: string[] = []
  for (let r = g.top; r <= g.bottom; r++) {
    const line: string[] = []
    for (let c = g.left; c <= g.right; c++) { const v = values[r]?.[c]; line.push(v == null ? '' : typeof v === 'object' ? String(v) : String(v)) }
    out.push(line.join('\t'))
  }
  return out.join('\n')
}
/** Raw inputs of a range (keeps formulas) + their formats, for in-app copy/paste with formatting. */
export function copyRange(s: SheetData, g: Range) {
  const raw: (string | number | null)[][] = [], fmt: (CellFmt | undefined)[][] = []
  for (let r = g.top; r <= g.bottom; r++) {
    raw.push(s.columns.slice(g.left, g.right + 1).map((c) => s.rows[r]?.cells[c.id] ?? null))
    fmt.push(s.columns.slice(g.left, g.right + 1).map((c) => s.fmt[`${s.rows[r]?.id}:${c.id}`]))
  }
  return { raw, fmt }
}

/** Paste a 2-D block at (r, c), growing rows/columns as needed. */
export function pasteBlock(s: SheetData, r: number, c: number, block: (string | number | null)[][], fmts?: (CellFmt | undefined)[][]): SheetData {
  let out = s
  const needRows = r + block.length - out.rows.length
  if (needRows > 0) out = insertRows(out, out.rows.length, needRows)
  const width = Math.max(0, ...block.map((x) => x.length))
  while (out.columns.length < c + width) out = insertCol(out, out.columns.length)
  const rows = out.rows.map((row, i) => {
    if (i < r || i >= r + block.length) return row
    const cells = { ...row.cells }
    block[i - r].forEach((v, j) => {
      const col = out.columns[c + j]
      const norm = v == null || v === '' ? null : typeof v === 'number' ? v : normaliseInput(String(v), col.type)
      if (norm == null) delete cells[col.id]; else cells[col.id] = norm
    })
    return { ...row, cells }
  })
  let fmt = out.fmt
  if (fmts) {
    fmt = { ...fmt }
    fmts.forEach((line, i) => line.forEach((f, j) => { const key = `${rows[r + i]?.id}:${out.columns[c + j]?.id}`; if (f) fmt[key] = f; else delete fmt[key] }))
  }
  return { ...out, rows, fmt }
}
export const parseTSV = (text: string) => (text.includes('\t') ? text.replace(/\r/g, '').split('\n').filter((l, i, a) => l !== '' || i < a.length - 1).map((l) => l.split('\t')) : parseCSV(text))

/** Apply (merge) formatting to every cell in a range; `null` values remove that property. */
export function formatRange(s: SheetData, g: Range, patch: Partial<Record<keyof CellFmt, unknown>>): SheetData {
  const fmt = { ...s.fmt }
  for (let r = g.top; r <= g.bottom; r++) for (let c = g.left; c <= g.right; c++) {
    const key = `${s.rows[r]?.id}:${s.columns[c]?.id}`
    const next = { ...fmt[key] } as Record<string, unknown>
    for (const [k, v] of Object.entries(patch)) { if (v == null) delete next[k]; else next[k] = v }
    if (Object.keys(next).length) fmt[key] = next as CellFmt; else delete fmt[key]
  }
  return { ...s, fmt }
}
/** Toggle a boolean format on a range based on the active cell. */
export function toggleFmt(s: SheetData, g: Range, key: 'b' | 'i' | 'u' | 'border' | 'wrap', activeRow: number, activeCol: number): SheetData {
  const cur = s.fmt[`${s.rows[activeRow]?.id}:${s.columns[activeCol]?.id}`]?.[key]
  return formatRange(s, g, { [key]: cur ? null : true })
}

/** Build a sheet from imported rows (first row = headers). Column types are inferred. */
export function fromRows(rows: (string | number | null)[][]): SheetData {
  const [head = [], ...body] = rows
  const width = Math.max(head.length, ...body.map((r) => r.length), 1)
  const columns = Array.from({ length: width }, (_, i) => {
    const name = String(head[i] ?? '').trim() || `Column ${i + 1}`
    const sample = body.slice(0, 200).map((r) => r[i]).filter((v) => v != null && v !== '')
    const numeric = sample.length > 0 && sample.every((v) => typeof v === 'number' || (typeof v === 'string' && Number.isFinite(Number(v.replace(/,/g, '')))))
    const dateLike = sample.length > 0 && sample.every((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
    const type: ColType = dateLike ? 'date' : numeric ? (/amount|price|cost|total|rs|pkr|revenue|profit|sales|expense/i.test(name) ? 'pkr' : 'number') : 'text'
    return newCol(name, type, Math.min(260, Math.max(90, name.length * 9 + 30)))
  })
  const sheetRows: SheetRow[] = body.map((r) => ({ id: uid(), cells: Object.fromEntries(columns.map((c, i) => [c.id, r[i] == null || r[i] === '' ? null : typeof r[i] === 'number' ? r[i] : normaliseInput(String(r[i]), c.type)]).filter(([, v]) => v != null)) }))
  return { ...blankSheet(1, 0), columns, rows: sheetRows.length ? sheetRows : [newRow()] }
}
