import { cellName, colIndex, colLetter, computeGrid, displayValue, FErr, parseRef } from './formula'

const calc = (raw: (string | number | null)[][]) => computeGrid(raw).map((r) => r.map(displayValue))

describe('sheet formulas', () => {
  it('converts between column letters and indexes', () => {
    expect(colLetter(0)).toBe('A'); expect(colLetter(25)).toBe('Z'); expect(colLetter(26)).toBe('AA'); expect(colLetter(701)).toBe('ZZ')
    expect(colIndex('AA')).toBe(26); expect(parseRef('$B$3')).toEqual({ r: 2, c: 1 }); expect(parseRef('3B')).toBeNull()
    expect(cellName(9, 2)).toBe('C10')
  })

  it('computes arithmetic with precedence, percent and references', () => {
    const g = calc([[2, 3, '=A1+B1*2', '=(A1+B1)*2', '=2^3^2', '=-A1^2', '=50%*B1', '=B1/A1']])
    expect(g[0].slice(2)).toEqual([8, 10, 512, -4, 1.5, 1.5])
  })

  it('supports SUM / AVERAGE / MIN / MAX / COUNT over ranges, skipping text and blanks', () => {
    const g = calc([
      ['Item', 'Qty', 'Price'],
      ['Shirt', 2, 1500],
      ['Bag', 'n/a', 2000],
      ['Cap', 4, null],
      ['Total', '=SUM(B2:B4)', '=SUM(C2:C4)'],
      ['Stats', '=AVERAGE(B2:B4)', '=MAX(C2:C4)-MIN(C2:C4)'],
      ['Count', '=COUNT(B2:B4)', '=COUNTA(A1:A4)'],
    ])
    expect(g[4].slice(1)).toEqual([6, 3500])
    expect(g[5].slice(1)).toEqual([3, 500])
    expect(g[6].slice(1)).toEqual([2, 4])
  })

  it('evaluates IF, comparisons, logic, rounding and PERCENT', () => {
    const g = calc([[120000, 80000, '=IF(A1>B1,"Profit","Loss")', '=IF(A1-B1>=40000, A1-B1, 0)', '=PERCENT(A1-B1, A1)', '=ROUND(PERCENT(1,3),2)', '=AND(A1>0, B1>0)', '=NOT(A1=B1)', '="Rs "&A1']])
    expect(g[0].slice(2)).toEqual(['Profit', 40000, 33.33333333333333, 33.33, 'TRUE', 'TRUE', 'Rs 120000'])
  })

  it('returns spreadsheet errors instead of throwing', () => {
    const g = calc([[1, 0, '=A1/B1', '=A1+"x"', '=FOO(1)', '=Z99', '=SUM(', '=IFERROR(A1/B1, 0)', '=A1/B1+1']])
    expect(g[0].slice(2)).toEqual(['#DIV/0!', '#VALUE!', '#NAME?', '#REF!', '#ERROR!', 0, '#DIV/0!'])
  })

  it('detects circular references', () => {
    const g = calc([['=B1', '=A1', '=C1+1', '=A1+5']])
    expect(g[0]).toEqual(['#CIRC!', '#CIRC!', '#CIRC!', '#CIRC!'])
    expect(computeGrid([['=A1']])[0][0]).toBeInstanceOf(FErr)
  })

  it('handles numeric text with commas, Rs prefix and percentages', () => {
    const g = calc([['1,250', 'Rs 750', '10%', '=A1+B1', '=A1*C1']])
    expect(g[0].slice(3)).toEqual([2000, 125])
  })
})
