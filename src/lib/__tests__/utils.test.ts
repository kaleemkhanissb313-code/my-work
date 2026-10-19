import { contrastRatio, fmtHsl, harmonies, hslToRgb, parseColor, parseHex, rgbToHex, rgbToHsl, wcagRating } from '../color'
import { convertCase, dedupeLines, diffLines, sortLines, textStats, toNato } from '../text'
import { convertUnit, discount, formatNumber, isPrime, parseNumberList, percentChange, roundTo, sequence, simplifyRatio, solveProportion, stats, toRoman } from '../numbers'
import { coerceCell, parseCSV, toCSV } from '../csv'
import { isValidEmail, normaliseUrl } from '../format'
import { resolve } from '../syncResolve'

describe('color utilities', () => {
  it('converts between hex, rgb and hsl', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('zzz')).toBeNull()
    expect(rgbToHex({ r: 139, g: 92, b: 246 })).toBe('#8b5cf6')
    expect(fmtHsl(rgbToHsl({ r: 255, g: 0, b: 0 }))).toBe('hsl(0, 100%, 50%)')
    expect(hslToRgb({ h: 120, s: 100, l: 50 })).toEqual({ r: 0, g: 255, b: 0 })
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 })
    expect(parseColor('hsl(240, 100%, 50%)')).toEqual({ r: 0, g: 0, b: 255 })
    expect(parseColor('rgb(300,0,0)')).toBeNull()
  })
  it('computes WCAG contrast', () => {
    const r = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })
    expect(r).toBeCloseTo(21, 5)
    expect(wcagRating(r)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: true, aaaLarge: true })
    expect(wcagRating(3.2).aaNormal).toBe(false)
    expect(harmonies('#ff0000')?.complementary[1]).toBe('#00ffff')
  })
})

describe('text utilities', () => {
  it('counts words, sentences and characters (unicode-aware)', () => {
    const s = textStats('Hello world. How are you?\n\nFine! 😀')
    expect(s.words).toBe(6)
    expect(s.sentences).toBe(3)
    expect(s.paragraphs).toBe(2)
    expect(textStats('😀').characters).toBe(1)
    expect(textStats('   ').words).toBe(0)
  })
  it('converts case', () => {
    expect(convertCase('the lord of the rings', 'title')).toBe('The Lord of the Rings')
    expect(convertCase('hello world', 'camel')).toBe('helloWorld')
    expect(convertCase('helloWorld example', 'snake')).toBe('hello_world_example')
    expect(convertCase('Hello World', 'kebab')).toBe('hello-world')
    expect(convertCase('HELLO. WORLD', 'sentence')).toBe('Hello. World')
  })
  it('sorts, dedupes and diffs lines', () => {
    expect(sortLines('b\na\nC\n10\n9')).toBe('9\n10\na\nb\nC')
    expect(dedupeLines('a\nA\nb\na')).toBe('a\nb')
    expect(dedupeLines('a\nA', { caseSensitive: true })).toBe('a\nA')
    expect(diffLines('a\nb\nc', 'a\nx\nc').map((d) => d.type)).toEqual(['equal', 'remove', 'add', 'equal'])
    expect(toNato('ab')).toBe('Alfa Bravo')
  })
})

describe('number utilities', () => {
  it('parses lists and computes statistics', () => {
    expect(parseNumberList('1, 2;3\n x 4')).toEqual({ values: [1, 2, 3, 4], invalid: ['x'] })
    const s = stats([2, 4, 4, 4, 5, 5, 7, 9])!
    expect(s.mean).toBe(5); expect(s.median).toBe(4.5); expect(s.mode).toEqual([4]); expect(s.stdDev).toBe(2)
    expect(stats([])).toBeNull()
  })
  it('handles percentages, discounts, ratios and rounding', () => {
    expect(percentChange(50, 75)).toBe(50)
    expect(Number.isNaN(percentChange(0, 5))).toBe(true)
    expect(discount(200, 25, 10)).toEqual({ saved: 50, after: 150, tax: 15, total: 165 })
    expect(simplifyRatio(1.5, 4.5)).toEqual([1, 3])
    expect(simplifyRatio(0, 0)).toBeNull()
    expect(solveProportion(2, 3, 10)).toBe(15)
    expect(roundTo(1.005, 2)).toBe(1.01)
    expect(roundTo(-2.5, 0, 'trunc')).toBe(-2)
  })
  it('converts units, roman numerals, primes and sequences', () => {
    expect(convertUnit(100, 'temperature', '°C', '°F')).toBe(212)
    expect(convertUnit(1, 'length', 'mi', 'km')).toBeCloseTo(1.609344)
    expect(convertUnit(1, 'data', 'GiB', 'MB')).toBeCloseTo(1073.741824)
    expect(Number.isNaN(convertUnit(-500, 'temperature', '°C', 'K'))).toBe(true)
    expect(toRoman(1994)).toBe('MCMXCIV'); expect(toRoman(0)).toBeNull()
    expect(isPrime(97)).toBe(true); expect(isPrime(1)).toBe(false)
    expect(sequence('fibonacci', 7)).toEqual([0, 1, 1, 2, 3, 5, 8])
    expect(sequence('primes', 4)).toEqual([2, 3, 5, 7])
    expect(formatNumber(1234.5, { decimals: 1, locale: 'en-US' })).toBe('1,234.5')
  })
})

describe('CSV', () => {
  it('round-trips quoted fields, commas, quotes and newlines', () => {
    const rows = [['name', 'note'], ['A, B', 'He said "hi"'], ['multi', 'line\nvalue']]
    expect(parseCSV(toCSV(rows))).toEqual(rows)
  })
  it('neutralises spreadsheet formula injection on export', () => {
    expect(toCSV([['=HYPERLINK("x")', '-5', '+1']])).toBe('"\'=HYPERLINK(""x"")",-5,\'+1')
  })
  it('throws on malformed CSV and coerces numbers', () => {
    expect(() => parseCSV('a,"b')).toThrow()
    expect(coerceCell('42')).toBe(42); expect(coerceCell(' ')).toBe(' '); expect(coerceCell('x')).toBe('x')
  })
})

describe('validation', () => {
  it('normalises URLs and rejects dangerous schemes', () => {
    expect(normaliseUrl('example.com')).toBe('https://example.com/')
    expect(normaliseUrl('javascript:alert(1)')).toBeNull()
    expect(normaliseUrl('data:text/html,hi')).toBeNull()
    expect(isValidEmail('a@b.co')).toBe(true); expect(isValidEmail('a@b')).toBe(false)
  })
})

describe('sync conflict resolution', () => {
  const row = (updatedAt: number, version: number, syncedAt: number | null) => ({ id: '1', updatedAt, version, deletedAt: null, syncedAt })
  it('pushes local-only changes and pulls remote-only changes', () => {
    expect(resolve(row(200, 2, null), row(100, 1, null), 150).action).toBe('push')
    expect(resolve(row(100, 1, 120), row(300, 2, null), 150).action).toBe('pull')
    expect(resolve(row(100, 1, 120), row(100, 1, null), 150).action).toBe('none')
    expect(resolve(undefined, row(1, 1, null), 0).action).toBe('pull')
    expect(resolve(row(1, 1, null), undefined, 0).action).toBe('push')
  })
  it('resolves concurrent edits by last-write-wins and keeps the loser', () => {
    const r = resolve(row(500, 3, null), row(400, 5, null), 150)
    expect(r).toMatchObject({ action: 'conflict', winner: 'local' })
    const r2 = resolve(row(300, 2, null), row(400, 2, null), 150)
    expect(r2).toMatchObject({ action: 'conflict', winner: 'remote' })
    if (r2.action === 'conflict') expect(r2.loser.updatedAt).toBe(300)
  })
})
