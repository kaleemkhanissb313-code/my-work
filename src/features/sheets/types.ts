import type { BaseEntity } from '@/types/models'

/** Display format of a cell/column. Raw values are stored unformatted (PKR in RUPEES inside sheets, as typed). */
export type NumFmt = 'auto' | 'text' | 'number' | 'decimal2' | 'pkr' | 'percent' | 'date' | 'time'
/** Column data type: drives validation, editor and link behaviour. */
export type ColType = 'text' | 'number' | 'pkr' | 'percent' | 'date' | 'time' | 'link' | 'product' | 'customer' | 'order' | 'attachment'

export interface SheetCol { id: string; name: string; type: ColType; width: number }
export interface CellFmt {
  b?: boolean; i?: boolean; u?: boolean; size?: number; color?: string; bg?: string; align?: 'left' | 'center' | 'right'
  border?: boolean; fmt?: NumFmt; font?: 'sans' | 'serif' | 'mono'; wrap?: boolean
}
export type RuleOp = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'neg' | 'pos' | 'contains' | 'empty'
export interface CondRule { id: string; colId: string | null; op: RuleOp; value: string; color: string; bg: string; label: string }
export type TotalFn = 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count'
export interface SheetRow { id: string; cells: Record<string, string | number | null> }

export interface GxSheet extends BaseEntity {
  name: string
  description: string
  columns: SheetCol[]
  rows: SheetRow[]
  /** Per-cell formatting keyed `${rowId}:${colId}`; column- and row-level formatting apply underneath. */
  fmt: Record<string, CellFmt>
  colFmt: Record<string, CellFmt>
  rowFmt: Record<string, CellFmt>
  freezeCols: number
  showTotals: boolean
  totals: Record<string, TotalFn>
  rules: CondRule[]
  order: number
}

export interface FormatPreset { id: string; name: string; fmt: CellFmt }
