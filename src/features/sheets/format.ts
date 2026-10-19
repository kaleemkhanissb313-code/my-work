import { isError, type Value } from './formula'
import type { CellFmt, ColType, CondRule, GxSheet, NumFmt, SheetCol, TotalFn } from './types'

/** Default display format for a column type. */
export const fmtForType = (t: ColType): NumFmt => (t === 'pkr' ? 'pkr' : t === 'percent' ? 'percent' : t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'time' ? 'time' : 'auto')

const nf = (d: number) => new Intl.NumberFormat('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d })
export function formatValue(v: Value, fmt: NumFmt): string {
  if (isError(v)) return v.code
  if (v == null || v === '') return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') {
    switch (fmt) {
      case 'pkr': return `${v < 0 ? '-' : ''}Rs ${nf(Number.isInteger(v) ? 0 : 2).format(Math.abs(v))}`
      case 'percent': return `${nf(Math.abs(v) < 10 && !Number.isInteger(v) ? 2 : 1).format(v)}%`
      case 'number': return new Intl.NumberFormat('en-PK', { maximumFractionDigits: 4 }).format(v)
      case 'decimal2': return nf(2).format(v)
      case 'text': return String(v)
      default: return Number.isInteger(v) ? new Intl.NumberFormat('en-PK').format(v) : String(+v.toPrecision(12))
    }
  }
  return v
}

export const isNumericFmt = (f: NumFmt) => f === 'pkr' || f === 'percent' || f === 'number' || f === 'decimal2'

/** Validate raw input for a column type. Formulas are always allowed. Returns an error message or null. */
export function validateInput(raw: string, type: ColType): string | null {
  const s = raw.trim()
  if (!s || s.startsWith('=')) return null
  const n = Number(s.replace(/,/g, '').replace(/^Rs\.?\s*/i, '').replace(/%$/, ''))
  switch (type) {
    case 'number': case 'pkr': case 'percent': return Number.isFinite(n) ? null : 'Enter a number (or a formula starting with =).'
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? null : 'Use the date format YYYY-MM-DD.'
    case 'time': return /^([01]?\d|2[0-3]):[0-5]\d$/.test(s) ? null : 'Use the time format HH:MM (24-hour).'
    case 'link': return /^https?:\/\//i.test(s) ? null : 'Links must start with http:// or https://'
    default: return null
  }
}
/** Normalise typed numeric input ("1,250", "Rs 500", "15%") into a stored number. */
export function normaliseInput(raw: string, type: ColType): string | number | null {
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('=')) return s
  if (type === 'number' || type === 'pkr' || type === 'percent') {
    const n = Number(s.replace(/,/g, '').replace(/^Rs\.?\s*/i, '').replace(/%$/, ''))
    if (Number.isFinite(n)) return n
  }
  return s
}

export function ruleMatches(r: CondRule, v: Value): boolean {
  if (isError(v)) return false
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/,/g, '')) : NaN
  const t = Number(r.value)
  switch (r.op) {
    case 'neg': return Number.isFinite(n) && n < 0
    case 'pos': return Number.isFinite(n) && n > 0
    case 'gt': return Number.isFinite(n) && n > t
    case 'lt': return Number.isFinite(n) && n < t
    case 'gte': return Number.isFinite(n) && n >= t
    case 'lte': return Number.isFinite(n) && n <= t
    case 'eq': return Number.isFinite(n) && Number.isFinite(t) ? n === t : String(v ?? '').toLowerCase() === r.value.toLowerCase()
    case 'neq': return Number.isFinite(n) && Number.isFinite(t) ? n !== t : String(v ?? '').toLowerCase() !== r.value.toLowerCase()
    case 'contains': return String(v ?? '').toLowerCase().includes(r.value.toLowerCase())
    case 'empty': return v == null || v === ''
  }
}
export const RULE_OPS: { id: CondRule['op']; label: string; needsValue: boolean }[] = [
  { id: 'pos', label: 'is positive (> 0)', needsValue: false }, { id: 'neg', label: 'is negative (< 0)', needsValue: false },
  { id: 'gt', label: 'greater than', needsValue: true }, { id: 'lt', label: 'less than', needsValue: true },
  { id: 'gte', label: 'at least', needsValue: true }, { id: 'lte', label: 'at most', needsValue: true },
  { id: 'eq', label: 'equals', needsValue: true }, { id: 'neq', label: 'does not equal', needsValue: true },
  { id: 'contains', label: 'contains text', needsValue: true }, { id: 'empty', label: 'is empty', needsValue: false },
]
/** Ready-made rules: profit green / loss red — each carries a text label so color is never the only signal. */
export const PROFIT_LOSS_RULES = (colId: string | null, uid: () => string): CondRule[] => [
  { id: uid(), colId, op: 'pos', value: '', color: '#047857', bg: '#d1fae5', label: '▲ Profit' },
  { id: uid(), colId, op: 'neg', value: '', color: '#b91c1c', bg: '#fee2e2', label: '▼ Loss' },
]

/** Effective format: column < row < cell, then the first matching conditional rule on top. */
export function effectiveFmt(sheet: Pick<GxSheet, 'fmt' | 'colFmt' | 'rowFmt' | 'rules'>, rowId: string, col: SheetCol, v: Value): CellFmt & { ruleLabel?: string } {
  const base: CellFmt = { fmt: fmtForType(col.type), ...sheet.colFmt[col.id], ...sheet.rowFmt[rowId], ...sheet.fmt[`${rowId}:${col.id}`] }
  const rule = sheet.rules.find((r) => (r.colId == null || r.colId === col.id) && ruleMatches(r, v))
  return rule ? { ...base, color: rule.color || base.color, bg: rule.bg || base.bg, ruleLabel: rule.label } : base
}

export function computeTotal(values: Value[], fn: TotalFn): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  switch (fn) {
    case 'none': return null
    case 'sum': return nums.reduce((a, b) => a + b, 0)
    case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
    case 'min': return nums.length ? Math.min(...nums) : null
    case 'max': return nums.length ? Math.max(...nums) : null
    case 'count': return values.filter((v) => v != null && v !== '').length
  }
}

export const COL_TYPES: { id: ColType; label: string }[] = [
  { id: 'text', label: 'Text' }, { id: 'number', label: 'Number' }, { id: 'pkr', label: 'Amount (PKR)' }, { id: 'percent', label: 'Percentage' },
  { id: 'date', label: 'Date' }, { id: 'time', label: 'Time' }, { id: 'link', label: 'Web / video link' }, { id: 'attachment', label: 'Image / document' },
  { id: 'product', label: 'Link → product' }, { id: 'customer', label: 'Link → customer' }, { id: 'order', label: 'Link → sale' },
]
export const NUM_FMTS: { id: NumFmt; label: string }[] = [
  { id: 'auto', label: 'Automatic' }, { id: 'number', label: '1,234.5' }, { id: 'decimal2', label: '1,234.50' }, { id: 'pkr', label: 'Rs 1,234' },
  { id: 'percent', label: '12.5%' }, { id: 'date', label: 'Date' }, { id: 'time', label: 'Time' }, { id: 'text', label: 'Plain text' },
]
