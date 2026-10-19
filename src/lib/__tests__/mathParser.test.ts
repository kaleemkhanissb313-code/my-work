import { evaluate, formatResult, MathError } from '../mathParser'

const ev = (s: string, m: 'deg' | 'rad' = 'deg') => formatResult(evaluate(s, m))

describe('safe math parser', () => {
  it('respects precedence and associativity', () => {
    expect(ev('1 + 2 * 3')).toBe('7')
    expect(ev('(1 + 2) * 3')).toBe('9')
    expect(ev('2 ^ 3 ^ 2')).toBe('512') // right-assoc
    expect(ev('-2 ^ 2')).toBe('-4') // standard convention: -(2^2)
    expect(ev('(-2) ^ 2')).toBe('4')
    expect(ev('2 ^ -1')).toBe('0.5')
    expect(ev('10 - 4 - 3')).toBe('3')
    expect(ev('100 / 10 / 5')).toBe('2')
  })

  it('removes binary floating-point noise', () => {
    expect(ev('0.1 + 0.2')).toBe('0.3')
    expect(ev('1.1 * 3')).toBe('3.3')
  })

  it('supports percent, modulo, factorial and implicit multiplication', () => {
    expect(ev('50%')).toBe('0.5')
    expect(ev('200 * 15%')).toBe('30')
    expect(ev('10 % 3')).toBe('1')
    expect(ev('5!')).toBe('120')
    expect(ev('2pi')).toBe(formatResult(2 * Math.PI))
    expect(ev('3(4+1)')).toBe('15')
  })

  it('evaluates scientific functions in degrees and radians', () => {
    expect(ev('sin(30)')).toBe('0.5')
    expect(ev('cos(pi)', 'rad')).toBe('-1')
    expect(ev('sqrt(81) + log(1000) + ln(e)')).toBe('13')
    expect(ev('asin(1)')).toBe('90')
    expect(ev('abs(-4.5)')).toBe('4.5')
    expect(ev('√16')).toBe('4')
    expect(ev('6 × 7 ÷ 2')).toBe('21')
  })

  it('rejects invalid or dangerous input instead of executing it', () => {
    const bad = ['', '1 +', '(1 + 2', '1 / 0', 'alert(1)', 'constructor', '2 ** 3; process.exit()', 'sqrt(-1)', '1..2', '3.5!', 'tan(90)', '"x"']
    for (const b of bad) expect(() => evaluate(b), b).toThrow(MathError)
  })

  it('formats very large and very small numbers in exponent form', () => {
    expect(ev('10^20')).toBe('1e+20')
    expect(ev('1/10^12')).toBe('1e-12')
  })
})
