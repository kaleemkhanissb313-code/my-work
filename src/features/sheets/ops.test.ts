import { blankSheet, clearRange, computeSheet, copyRange, deleteCols, deleteRows, formatRange, fromRows, insertCol, insertRows, parseTSV, pasteBlock, rangeToTSV, setCell, sortRows, toggleFmt } from './ops'
import { displayValue } from './formula'

const show = (s: ReturnType<typeof blankSheet>) => computeSheet(s).map((r) => r.map(displayValue))

describe('sheet operations', () => {
  it('sets values with type normalisation and computes formulas', () => {
    let s = blankSheet(3, 3)
    s.columns[1].type = 'pkr'
    s = setCell(s, 0, 0, 'Shirt'); s = setCell(s, 0, 1, 'Rs 1,500'); s = setCell(s, 1, 1, '2500'); s = setCell(s, 2, 1, '=SUM(B1:B2)')
    expect(show(s).map((r) => r[1])).toEqual([1500, 2500, 4000])
    s = setCell(s, 0, 0, '')
    expect(s.rows[0].cells[s.columns[0].id]).toBeUndefined()
  })

  it('inserts/deletes rows and columns safely', () => {
    let s = blankSheet(2, 2)
    s = insertRows(s, 1, 3); expect(s.rows).toHaveLength(5)
    s = deleteRows(s, 0, 4); expect(s.rows).toHaveLength(1) // never empty
    s = insertCol(s, 1); expect(s.columns).toHaveLength(3)
    s = deleteCols(s, 0, 2); expect(s.columns).toHaveLength(3) // refuses to delete all
    s = deleteCols(s, 0, 0); expect(s.columns).toHaveLength(2)
  })

  it('sorts numerically and alphabetically with blanks last', () => {
    let s = blankSheet(2, 4)
    ;[['b', 10], ['A', 2], ['', null], ['c', 100]].forEach(([t, n], i) => { s = setCell(s, i, 0, String(t)); if (n != null) s = setCell(s, i, 1, String(n)) })
    expect(show(sortRows(s, 1, 1)).map((r) => r[1])).toEqual([2, 10, 100, ''])
    expect(show(sortRows(s, 1, -1)).map((r) => r[1])).toEqual([100, 10, 2, ''])
    expect(show(sortRows(s, 0, 1)).map((r) => r[0])).toEqual(['A', 'b', 'c', ''])
  })

  it('copies and pastes blocks (growing the sheet) with formats', () => {
    let s = blankSheet(2, 2)
    s = setCell(s, 0, 0, '5'); s = setCell(s, 0, 1, '=A1*2')
    s = formatRange(s, { top: 0, bottom: 0, left: 0, right: 0 }, { b: true, bg: '#ffeeaa' })
    const { raw, fmt } = copyRange(s, { top: 0, bottom: 0, left: 0, right: 1 })
    expect(rangeToTSV(s, { top: 0, bottom: 0, left: 0, right: 1 }, computeSheet(s))).toBe('5\t10')
    s = pasteBlock(s, 3, 2, raw, fmt)
    expect(s.rows.length).toBe(4); expect(s.columns.length).toBe(4)
    expect(s.rows[3].cells[s.columns[3].id]).toBe('=A1*2')
    expect(s.fmt[`${s.rows[3].id}:${s.columns[2].id}`]).toEqual({ b: true, bg: '#ffeeaa' })
    expect(parseTSV('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('formats ranges, toggles and clears', () => {
    let s = blankSheet(2, 2)
    const all = { top: 0, bottom: 1, left: 0, right: 1 }
    s = toggleFmt(s, all, 'b', 0, 0)
    expect(Object.values(s.fmt).every((f) => f.b)).toBe(true)
    s = toggleFmt(s, all, 'b', 0, 0)
    expect(Object.keys(s.fmt)).toHaveLength(0)
    s = setCell(s, 1, 1, 'x'); s = formatRange(s, all, { color: '#ff0000' })
    s = clearRange(s, all, true)
    expect(Object.keys(s.fmt)).toHaveLength(0); expect(s.rows[1].cells).toEqual({})
  })

  it('builds sheets from imported rows with inferred types', () => {
    const s = fromRows([['Date', 'Item', 'Amount'], ['2026-10-01', 'Rent', '50,000'], ['2026-10-02', 'Ads', 1200]])
    expect(s.columns.map((c) => c.type)).toEqual(['date', 'text', 'pkr'])
    expect(show(s)[0]).toEqual(['2026-10-01', 'Rent', 50000])
  })
})
