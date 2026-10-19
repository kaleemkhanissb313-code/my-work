/**
 * Minimal .xlsx reader: returns the cell values of each worksheet (formulas are read as their cached values).
 * Uses the platform DecompressionStream('deflate-raw') — available in all modern browsers and Node 18+.
 * Limits protect against zip bombs: 50 MB uncompressed per entry, 20,000 rows, 200 columns.
 */
const MAX_ENTRY = 50 * 1024 * 1024
const MAX_ROWS = 20000
const MAX_COLS = 200

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .xlsx files. Export the sheet as CSV instead.')
  const ds = new DecompressionStream('deflate-raw')
  const source = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close() } })
  const stream = source.pipeThrough(ds)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_ENTRY) { await reader.cancel(); throw new Error('The file is too large to import.') }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return out
}

/** Read entries from a ZIP using its central directory. */
export async function unzip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not a valid .xlsx file.')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  const out = new Map<string, Uint8Array>()
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupted .xlsx file.')
    const method = dv.getUint16(p + 10, true)
    const csize = dv.getUint32(p + 20, true)
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen))
    const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true)
    const start = local + 30 + lnlen + lxlen
    const raw = buf.subarray(start, start + csize)
    if (/\.(xml|rels)$/.test(name)) out.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array())
    p += 46 + nlen + xlen + clen
  }
  return out
}

const colIdx = (ref: string) => { const m = /^([A-Z]+)/.exec(ref); return m ? m[1].split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1 : 0 }

export async function readXlsx(file: ArrayBuffer | Uint8Array): Promise<{ name: string; rows: (string | number | null)[][] }[]> {
  const files = await unzip(file instanceof Uint8Array ? file : new Uint8Array(file))
  const dec = new TextDecoder()
  const xml = (name: string) => { const d = files.get(name); return d ? new DOMParser().parseFromString(dec.decode(d), 'application/xml') : null }
  const shared: string[] = []
  const ss = xml('xl/sharedStrings.xml')
  if (ss) for (const si of Array.from(ss.getElementsByTagName('si'))) shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''))
  const wb = xml('xl/workbook.xml')
  const rels = xml('xl/_rels/workbook.xml.rels')
  if (!wb) throw new Error('Not a valid .xlsx file (workbook missing).')
  const target = new Map(Array.from(rels?.getElementsByTagName('Relationship') ?? []).map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']))
  const sheets = Array.from(wb.getElementsByTagName('sheet'))
  const out: { name: string; rows: (string | number | null)[][] }[] = []
  for (const [i, sh] of sheets.entries()) {
    const rid = sh.getAttribute('r:id') ?? sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const t = (rid && target.get(rid)) || `worksheets/sheet${i + 1}.xml`
    const doc = xml(`xl/${t.replace(/^\/?xl\//, '')}`)
    if (!doc) continue
    const rows: (string | number | null)[][] = []
    for (const row of Array.from(doc.getElementsByTagName('row'))) {
      if (rows.length >= MAX_ROWS) break
      const r: (string | number | null)[] = []
      for (const c of Array.from(row.getElementsByTagName('c'))) {
        const ci = colIdx(c.getAttribute('r') ?? 'A1')
        if (ci >= MAX_COLS) continue
        const type = c.getAttribute('t')
        const v = c.getElementsByTagName('v')[0]?.textContent ?? null
        let val: string | number | null
        if (type === 's') val = v == null ? null : shared[Number(v)] ?? ''
        else if (type === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent ?? '').join('')
        else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE'
        else if (type === 'str' || type === 'e') val = v
        else val = v == null ? null : Number.isFinite(Number(v)) ? Number(v) : v
        r[ci] = val
      }
      const rn = Number(row.getAttribute('r') ?? rows.length + 1) - 1
      while (rows.length < rn && rows.length < MAX_ROWS) rows.push([])
      rows.push(Array.from(r, (x) => x ?? null))
    }
    out.push({ name: sh.getAttribute('name') ?? `Sheet${i + 1}`, rows })
  }
  return out
}
