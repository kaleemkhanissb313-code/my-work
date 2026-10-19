import { generateIds, intToWords, numberToWords, pkrToWords, wordsToNumber } from '../numberWords'
import { nearestColorName } from '../colorNames'
import { codePoint, fromUrduDigits, htmlEntity, toUrduDigits, CHARACTER_SETS } from '../symbols'
import { capitalizeWords, countMatches, removeExtraSpaces, replaceAll } from '../text'

describe('number words', () => {
  it('spells numbers in international and Pakistani systems', () => {
    expect(intToWords(0)).toBe('zero')
    expect(intToWords(1250)).toBe('one thousand two hundred fifty')
    expect(intToWords(2_500_000)).toBe('two million five hundred thousand')
    expect(intToWords(2_500_000, 'south-asian')).toBe('twenty-five lakh')
    expect(intToWords(123_456_789, 'south-asian')).toBe('twelve crore thirty-four lakh fifty-six thousand seven hundred eighty-nine')
    expect(intToWords(-42)).toBe('minus forty-two')
    expect(numberToWords(12.05)).toBe('twelve point zero five')
    expect(() => intToWords(1.5)).toThrow()
  })
  it('writes PKR amounts for cheques and receipts', () => {
    expect(pkrToWords(150000)).toBe('Rupees one lakh fifty thousand only')
    expect(pkrToWords(1250.5)).toBe('Rupees one thousand two hundred fifty and fifty paisa only')
  })
  it('parses words back to numbers', () => {
    expect(wordsToNumber('two lakh fifty thousand')).toBe(250000)
    expect(wordsToNumber('one million two hundred thousand and five')).toBe(1200005)
    expect(wordsToNumber('twelve point five')).toBe(12.5)
    expect(wordsToNumber('minus forty-two')).toBe(-42)
    expect(wordsToNumber('banana')).toBeNull()
    expect(wordsToNumber(intToWords(987654321, 'south-asian'))).toBe(987654321)
  })
  it('generates padded IDs', () => {
    expect(generateIds({ prefix: 'INV-', start: 98, count: 3, pad: 4 })).toEqual(['INV-0098', 'INV-0099', 'INV-0100'])
    expect(generateIds({ count: 2, step: 5, pad: 0, suffix: '/26' })).toEqual(['1/26', '6/26'])
  })
})

describe('color names, symbols and text helpers', () => {
  it('names colors', () => {
    expect(nearestColorName({ r: 255, g: 0, b: 0 })).toMatchObject({ name: 'Red', exact: true })
    expect(nearestColorName({ r: 250, g: 128, b: 114 }).css).toBe('salmon')
    expect(nearestColorName({ r: 2, g: 1, b: 130 }).css).toBe('navy')
  })
  it('describes symbols and converts digits', () => {
    expect(codePoint('₨')).toBe('U+20A8')
    expect(htmlEntity('₨')).toBe('&#8360;')
    expect(toUrduDigits('Rs 1,250')).toBe('Rs ۱,۲۵۰')
    expect(fromUrduDigits('۱۲۳٤')).toBe('1234')
    expect(CHARACTER_SETS.find((s) => s.id === 'alnum')!.chars).toHaveLength(62)
  })
  it('find & replace, spacing and capitalization', () => {
    expect(removeExtraSpaces('  a   b \t c  \n\n\n\nd ')).toBe('a b c\n\nd')
    expect(capitalizeWords('lawn suit – summer (new)')).toBe('Lawn Suit – Summer (New)')
    expect(countMatches('Rs 10, rs 20', 'rs')).toBe(2)
    expect(replaceAll('cat category Cat', 'cat', 'dog', { wholeWord: true }).text).toBe('dog category dog')
    expect(replaceAll('2026-10-21', '(\\d+)-(\\d+)-(\\d+)', '$3/$2/$1', { regex: true }).text).toBe('21/10/2026')
    expect(() => replaceAll('x', '(', 'y', { regex: true })).toThrow(/not valid/)
    expect(replaceAll('a.b.c', '.', '-').count).toBe(2) // literal dot, not regex
  })
})
