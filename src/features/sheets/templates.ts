import { blankSheet, newCol, newRow, type SheetData } from './ops'
import { PROFIT_LOSS_RULES } from './format'
import { uid } from '@/lib/id'
import type { ColType } from './types'

/** Starter custom sheets. They contain only headers and formulas — no fake business figures. */
export interface SheetTemplate { id: string; name: string; desc: string; build: () => SheetData }

function make(cols: [string, ColType, number?][], rows: number, rowFormula?: (r: number) => Record<number, string>, totals: Record<number, 'sum' | 'avg'> = {}, profitCol?: number): SheetData {
  const columns = cols.map(([n, t, w]) => newCol(n, t, w ?? 140))
  const rs = Array.from({ length: rows }, (_, i) => {
    const row = newRow()
    const f = rowFormula?.(i + 1) ?? {}
    for (const [c, v] of Object.entries(f)) row.cells[columns[Number(c)].id] = v
    return row
  })
  return {
    ...blankSheet(1, 0), columns, rows: rs, freezeCols: 1,
    showTotals: Object.keys(totals).length > 0, totals: Object.fromEntries(Object.entries(totals).map(([c, fn]) => [columns[Number(c)].id, fn])),
    rules: profitCol != null ? PROFIT_LOSS_RULES(columns[profitCol].id, uid) : [],
  }
}

export const SHEET_TEMPLATES: SheetTemplate[] = [
  { id: 'blank', name: 'Blank sheet', desc: '6 columns × 30 rows', build: () => blankSheet() },
  { id: 'price', name: 'Price list & margins', desc: 'Cost, price, profit and margin % per item', build: () => make(
    [['Product', 'text', 200], ['Cost', 'pkr'], ['Price', 'pkr'], ['Profit', 'pkr'], ['Margin %', 'percent', 110]], 20,
    (r) => ({ 3: `=IF(C${r}="","",C${r}-B${r})`, 4: `=IF(OR(C${r}="",C${r}=0),"",ROUND(PERCENT(C${r}-B${r},C${r}),1))` }), { 3: 'sum', 4: 'avg' }, 3) },
  { id: 'expense', name: 'Expense tracker', desc: 'Date, category, description and amount with totals', build: () => make(
    [['Date', 'date', 115], ['Category', 'text'], ['Description', 'text', 220], ['Amount', 'pkr'], ['Receipt', 'attachment', 110]], 30, undefined, { 3: 'sum' }) },
  { id: 'budget', name: 'Monthly budget', desc: 'Budgeted vs actual with difference', build: () => make(
    [['Category', 'text', 180], ['Budget', 'pkr'], ['Actual', 'pkr'], ['Difference', 'pkr'], ['Used %', 'percent', 100]], 15,
    (r) => ({ 3: `=IF(B${r}="","",B${r}-C${r})`, 4: `=IF(OR(B${r}="",B${r}=0),"",ROUND(PERCENT(C${r},B${r}),1))` }), { 1: 'sum', 2: 'sum', 3: 'sum' }, 3) },
  { id: 'profit', name: 'Order profit calculator', desc: 'Qty × price − discount − cost per order line', build: () => make(
    [['Product', 'product', 180], ['Qty', 'number', 80], ['Unit price', 'pkr'], ['Unit cost', 'pkr'], ['Discount', 'pkr'], ['Revenue', 'pkr'], ['Profit', 'pkr']], 20,
    (r) => ({ 5: `=IF(B${r}="","",B${r}*C${r}-E${r})`, 6: `=IF(B${r}="","",F${r}-B${r}*D${r})` }), { 1: 'sum', 5: 'sum', 6: 'sum' }, 6) },
  { id: 'followup', name: 'Customer follow-ups', desc: 'Customer, last order, amount due, next action', build: () => make(
    [['Customer', 'customer', 180], ['Phone', 'text'], ['Last order', 'order', 120], ['Amount due', 'pkr'], ['Next action', 'text', 200], ['Date', 'date', 115]], 20, undefined, { 3: 'sum' }) },
  { id: 'inventory', name: 'Stock count', desc: 'System vs counted stock with variance', build: () => make(
    [['Product', 'product', 180], ['System stock', 'number', 110], ['Counted', 'number', 100], ['Variance', 'number', 100], ['Note', 'text', 200]], 25,
    (r) => ({ 3: `=IF(C${r}="","",C${r}-B${r})` }), { 1: 'sum', 2: 'sum', 3: 'sum' }) },
  { id: 'content', name: 'Content & video links', desc: 'Title, platform, link, views', build: () => make(
    [['Title', 'text', 220], ['Platform', 'text'], ['Link', 'link', 220], ['Published', 'date', 115], ['Views', 'number', 100]], 20, undefined, { 4: 'sum' }) },
]
