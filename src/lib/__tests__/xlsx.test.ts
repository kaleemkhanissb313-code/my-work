import { buildXlsx, crc32 } from '../xlsx'

const dec = new TextDecoder()
/** Read entries back out of a STORE zip to prove the archive is well-formed. */
function readZip(z: Uint8Array) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const out: Record<string, string> = {}
  let p = 0
  while (dv.getUint32(p, true) === 0x04034b50) {
    const size = dv.getUint32(p + 18, true), nlen = dv.getUint16(p + 26, true)
    const name = dec.decode(z.subarray(p + 30, p + 30 + nlen))
    const data = z.subarray(p + 30 + nlen, p + 30 + nlen + size)
    expect(crc32(data)).toBe(dv.getUint32(p + 14, true))
    out[name] = dec.decode(data)
    p += 30 + nlen + size
  }
  return out
}

describe('xlsx writer', () => {
  it('computes standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('writes a valid workbook with numbers, escaped text and multiple sheets', () => {
    const z = buildXlsx([
      { name: 'Sales/Report', rows: [['Product', 'Amount (PKR)'], ['Shirt & Tie <XL>', 1250.5], ['=HYPERLINK("x")', 3]] },
      { name: 'Second', rows: [['A']] },
    ])
    expect(z[0]).toBe(0x50); expect(z[1]).toBe(0x4b) // "PK"
    const files = readZip(z)
    expect(Object.keys(files)).toContain('xl/worksheets/sheet2.xml')
    expect(files['xl/workbook.xml']).toContain('name="Sales Report"')
    const s1 = files['xl/worksheets/sheet1.xml']
    expect(s1).toContain('<v>1250.5</v>')
    expect(s1).toContain('Shirt &amp; Tie &lt;XL&gt;')
    expect(s1).toContain('t="inlineStr"') // formulas stored as text, never evaluated
    expect(s1).not.toContain('<f>')
  })
})
