/**
 * Minimal, dependency-free .xlsx writer (Office Open XML, stored ZIP, inline strings).
 * Numbers stay numeric so Excel/Sheets can sum them; text cells are XML-escaped and formula-like
 * text is stored as plain strings (inline strings are never evaluated as formulas).
 */
export interface XStyle { bold?: boolean; italic?: boolean; underline?: boolean; color?: string; bg?: string; align?: 'left' | 'center' | 'right'; numFmt?: 'pkr' | 'percent' | 'decimal2' | 'number'; border?: boolean }
export type Cell = string | number | null | undefined | { v: string | number | null; s?: XStyle }
export interface Sheet { name: string; rows: Cell[][]; colWidths?: number[] }

const enc = new TextEncoder()
// Strip XML-illegal control characters (intentional control-char regex).
// eslint-disable-next-line no-control-regex
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
export function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Build a ZIP archive with STORE (no compression). */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint32(14, crc, true); local.setUint32(18, f.data.length, true); local.setUint32(22, f.data.length, true); local.setUint16(26, name.length, true)
    chunks.push(new Uint8Array(local.buffer), name, f.data)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true)
    cd.setUint32(16, crc, true); cd.setUint32(20, f.data.length, true); cd.setUint32(24, f.data.length, true); cd.setUint16(28, name.length, true)
    cd.setUint32(42, offset, true)
    central.push(new Uint8Array(cd.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true)
  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0))
  let p = 0
  for (const c of all) { out.set(c, p); p += c.length }
  return out
}

const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const safeSheetName = (n: string, i: number) => (n.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`)

const hex = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? 'FF' + c.slice(1).toUpperCase() : null)
class Styles {
  fonts = ['<font><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="Calibri"/></font>']
  fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  borders = ['<border/>', '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border>']
  numFmts: Record<string, number> = { pkr: 164, percent: 165, decimal2: 4, number: 3 }
  xfs = ['<xf/>', '<xf fontId="1" applyFont="1"/>']
  private key = new Map<string, number>()
  id(st: XStyle): number {
    const k = JSON.stringify(st)
    const hit = this.key.get(k); if (hit != null) return hit
    let fontId = 0, fillId = 0
    if (st.bold || st.italic || st.underline || hex(st.color)) { this.fonts.push(`<font>${st.bold ? '<b/>' : ''}${st.italic ? '<i/>' : ''}${st.underline ? '<u/>' : ''}<sz val="11"/>${hex(st.color) ? `<color rgb="${hex(st.color)}"/>` : ''}<name val="Calibri"/></font>`); fontId = this.fonts.length - 1 }
    if (hex(st.bg)) { this.fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${hex(st.bg)}"/><bgColor indexed="64"/></patternFill></fill>`); fillId = this.fills.length - 1 }
    const numFmtId = st.numFmt ? this.numFmts[st.numFmt] : 0
    const align = st.align ? `<alignment horizontal="${st.align}"/>` : ''
    this.xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${st.border ? 1 : 0}"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${st.border ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`)
    const id = this.xfs.length - 1; this.key.set(k, id); return id
  }
  xml(ns: string) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;Rs&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0.00&quot;%&quot;"/></numFmts><fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join('')}</borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs></styleSheet>`
  }
}

function sheetXml(s: Sheet, styles: Styles) {
  const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((cell, ci) => {
    const v = cell != null && typeof cell === 'object' ? cell.v : cell
    const st = cell != null && typeof cell === 'object' && cell.s ? styles.id(cell.s) : ri === 0 ? 1 : 0
    if ((v == null || v === '') && !st) return ''
    const ref = `${colName(ci)}${ri + 1}`
    const style = st ? ` s="${st}"` : ''
    if (v == null || v === '') return `<c r="${ref}"${style}/>`
    return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${style}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
  }).join('')}</row>`).join('')
  const widths = s.colWidths ?? (s.rows[0] ?? []).map((_, ci) => Math.min(60, Math.max(10, ...s.rows.slice(0, 200).map((r) => { const c = r[ci]; return String(c != null && typeof c === 'object' ? c.v ?? '' : c ?? '').length + 2 }))))
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const ns = 'http://schemas.openxmlformats.org'
  const styles = new Styles()
  const sheetXmls = sheets.map((s) => sheetXml(s, styles))
  const files = [
    { name: '[Content_Types].xml', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(safeSheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', xml: styles.xml(ns) },
    ...sheetXmls.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml })),
  ]
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.xml) })))
}

export const xlsxBlob = (sheets: Sheet[]) => new Blob([buildXlsx(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
