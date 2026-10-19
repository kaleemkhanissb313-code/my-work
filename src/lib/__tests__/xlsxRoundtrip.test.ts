import { buildXlsx } from '../xlsx'
import { readXlsx } from '../xlsxRead'

describe('xlsx round trip', () => {
  it('reads back what the writer produced, including styled cells', async () => {
    const z = buildXlsx([
      { name: 'Sales', rows: [['Product', 'Revenue', 'Margin'], ['Lawn Suit', { v: 7000, s: { numFmt: 'pkr', bold: true, bg: '#d1fae5' } }, { v: 42.5, s: { numFmt: 'percent', color: '#047857' } }], ['اردو متن', -1500, null]] },
      { name: 'Two', rows: [['x']] },
    ])
    const sheets = await readXlsx(z)
    expect(sheets.map((s) => s.name)).toEqual(['Sales', 'Two'])
    expect(sheets[0].rows[1]).toEqual(['Lawn Suit', 7000, 42.5])
    expect(sheets[0].rows[2][0]).toBe('اردو متن') // Unicode / Urdu preserved
    expect(sheets[0].rows[2][1]).toBe(-1500)
  })
  it('rejects files that are not xlsx', async () => {
    await expect(readXlsx(new TextEncoder().encode('hello'))).rejects.toThrow(/Not a valid/)
  })
})

describe('xlsx reader with deflate-compressed entries (as saved by Excel)', () => {
  it('inflates compressed entries', async () => {
    const { crc32 } = await import('../xlsx')
    const enc = new TextEncoder()
    const deflate = async (d: Uint8Array) => new Uint8Array(await new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(d); c.close() } }).pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
    const ns = 'http://schemas.openxmlformats.org'
    const files: [string, string][] = [
      ['xl/workbook.xml', `<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`],
      ['xl/sharedStrings.xml', `<sst xmlns="${ns}/spreadsheetml/2006/main"><si><t>Total</t></si></sst>`],
      ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${ns}/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>`],
    ]
    const parts: Uint8Array[] = [], central: Uint8Array[] = []
    let offset = 0
    for (const [name, xml] of files) {
      const raw = enc.encode(xml), comp = await deflate(raw), nm = enc.encode(name)
      const l = new DataView(new ArrayBuffer(30)); l.setUint32(0, 0x04034b50, true); l.setUint16(8, 8, true); l.setUint32(14, crc32(raw), true); l.setUint32(18, comp.length, true); l.setUint32(22, raw.length, true); l.setUint16(26, nm.length, true)
      parts.push(new Uint8Array(l.buffer), nm, comp)
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(10, 8, true); c.setUint32(16, crc32(raw), true); c.setUint32(20, comp.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, offset, true)
      central.push(new Uint8Array(c.buffer), nm)
      offset += 30 + nm.length + comp.length
    }
    const cd = central.reduce((a, x) => a + x.length, 0)
    const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cd, true); e.setUint32(16, offset, true)
    const all = [...parts, ...central, new Uint8Array(e.buffer)]
    const zip = new Uint8Array(all.reduce((a, x) => a + x.length, 0)); let p = 0; for (const x of all) { zip.set(x, p); p += x.length }
    const [sheet] = await readXlsx(zip)
    expect(sheet).toEqual({ name: 'Data', rows: [['Total', null, 2]] })
  })
})
