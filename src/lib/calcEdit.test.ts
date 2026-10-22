import { removeLastItem } from './calcEdit'

describe('calculator ✕ (clear entry)', () => {
  it.each([
    ['12+345', '12+'],
    ['12+3.75', '12+'],
    ['12+3.', '12+'],
    ['12+.5', '12+'],
    ['7*', '7'],
    ['2^(3', '2^('],
    ['2^(', '2^'],
    ['10+sqrt(', '10+'],
    ['Ans*2', 'Ans*'],
    ['Ans', ''],
    ['3*pi', '3*'],
    ['1.5e+10', ''],
    ['42', ''],
    ['', ''],
    ['5 + ', '5'],
  ])('%s → %s', (input, out) => expect(removeLastItem(input)).toBe(out))

  it('removes one item at a time until empty', () => {
    let s = '12.5+sin(30)'
    const seen: string[] = []
    while (s) { s = removeLastItem(s); seen.push(s) }
    expect(seen).toEqual(['12.5+sin(30', '12.5+sin(', '12.5+', '12.5', ''])
  })
})
