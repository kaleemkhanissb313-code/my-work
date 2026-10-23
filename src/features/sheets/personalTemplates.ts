import { blankSheet, newCol, newRow, type SheetData } from './ops'
import type { ColType } from './types'
import type { SheetTemplate } from './templates'

/** Starter personal spreadsheets: headers (and a few formulas) only — never sample personal data. */
function make(cols: [string, ColType, number?][], rows = 40, totals: Record<number, 'sum'> = {}, formula?: (r: number) => Record<number, string>): SheetData {
  const columns = cols.map(([n, t, w]) => newCol(n, t, w ?? 150))
  const rs = Array.from({ length: rows }, (_, i) => {
    const row = newRow()
    for (const [c, v] of Object.entries(formula?.(i + 1) ?? {})) row.cells[columns[Number(c)].id] = v
    return row
  })
  return {
    ...blankSheet(1, 0), columns, rows: rs, freezeCols: 1,
    showTotals: Object.keys(totals).length > 0, totals: Object.fromEntries(Object.entries(totals).map(([c, fn]) => [columns[Number(c)].id, fn])),
  }
}

export const PERSONAL_TEMPLATES: SheetTemplate[] = [
  { id: 'blank', name: 'Blank spreadsheet', desc: '6 columns × 30 rows', build: () => blankSheet() },
  { id: 'links', name: 'Links directory', desc: 'Title, link, category, tags and notes', build: () => make([['Title', 'text', 200], ['Link', 'link', 240], ['Category', 'text'], ['Tags', 'text'], ['Added', 'date', 115], ['Notes', 'text', 240]]) },
  { id: 'contacts', name: 'Contacts', desc: 'Name, phone, email, city, birthday', build: () => make([['Name', 'text', 180], ['Phone', 'text'], ['Email', 'text', 200], ['City', 'text'], ['Birthday', 'date', 115], ['Notes', 'text', 220]]) },
  { id: 'info', name: 'Important information', desc: 'Item, details, renewal date and documents (keep passwords in the Private Vault)', build: () => make([['Item', 'text', 200], ['Details', 'text', 260], ['Expiry / renewal', 'date', 130], ['Document', 'attachment', 120], ['Notes', 'text', 220]]) },
  { id: 'notes', name: 'Notes log', desc: 'Date, topic, note and follow-up', build: () => make([['Date', 'date', 115], ['Topic', 'text', 180], ['Note', 'text', 320], ['Follow-up', 'text', 200], ['Done', 'text', 80]]) },
  { id: 'budget', name: 'Monthly budget', desc: 'Planned vs actual with difference', build: () => make([['Category', 'text', 180], ['Planned', 'pkr'], ['Actual', 'pkr'], ['Difference', 'pkr']], 20, { 1: 'sum', 2: 'sum', 3: 'sum' }, (r) => ({ 3: `=IF(B${r}="","",B${r}-C${r})` })) },
  { id: 'expenses', name: 'Expense log', desc: 'Date, category, description, amount, receipt', build: () => make([['Date', 'date', 115], ['Category', 'text'], ['Description', 'text', 220], ['Amount', 'pkr'], ['Receipt', 'attachment', 110]], 40, { 3: 'sum' }) },
  { id: 'reading', name: 'Reading & watch list', desc: 'Title, type, link, status, rating', build: () => make([['Title', 'text', 220], ['Type', 'text', 110], ['Link', 'link', 220], ['Status', 'text', 120], ['Rating', 'number', 90]]) },
  { id: 'tracker', name: 'Project tracker', desc: 'Task, owner, due date, status, progress %', build: () => make([['Task', 'text', 240], ['Owner', 'text'], ['Due', 'date', 115], ['Status', 'text', 120], ['Progress %', 'percent', 110]]) },
]
