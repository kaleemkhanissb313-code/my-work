/** RFC 4180-style CSV parsing/serialisation (quoted fields, embedded commas/quotes/newlines). */
export function parseCSV(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', i = 0, quoted = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // strip a UTF-8 byte-order mark
  while (i < s.length) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"' && field === '') { quoted = true; i++; continue }
    if (c === delimiter) { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += c; i++
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field')
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

const esc = (v: unknown) => {
  let s = v == null ? '' : String(v)
  // Neutralise spreadsheet formula injection when the file is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCSV = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(',')).join('\r\n')

export function objectsToCSV<T extends object>(items: T[], columns: { key: keyof T | ((t: T) => unknown); label: string }[]) {
  return toCSV([columns.map((c) => c.label), ...items.map((it) => columns.map((c) => (typeof c.key === 'function' ? c.key(it) : it[c.key])))])
}

/** Convert numeric-looking cells to numbers. */
export const coerceCell = (v: string): string | number => (v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v)
