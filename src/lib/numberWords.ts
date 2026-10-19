/**
 * Number ↔ words (English). Supports the international system (thousand, million, billion) and the
 * South-Asian system used in Pakistan (thousand, lakh, crore, arab), decimals, negatives and PKR amounts.
 */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100
  const parts: string[] = []
  if (h) parts.push(`${ONES[h]} hundred`)
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ''}`)
  return parts.join(' ')
}

export type WordSystem = 'international' | 'south-asian'

/** Whole-number words. Throws for non-integers or values outside ±999 trillion. */
export function intToWords(n: number, system: WordSystem = 'international'): string {
  if (!Number.isInteger(n)) throw new Error('Whole numbers only.')
  if (Math.abs(n) >= 1e15) throw new Error('Number is too large.')
  if (n === 0) return 'zero'
  if (n < 0) return `minus ${intToWords(-n, system)}`
  const parts: string[] = []
  if (system === 'international') {
    const scales: [number, string][] = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]
    let rest = n
    for (const [v, w] of scales) if (rest >= v) { parts.push(`${under1000(Math.floor(rest / v))} ${w}`); rest %= v }
    if (rest) parts.push(under1000(rest))
  } else {
    // 1,00,00,00,000 = 1 arab · 1,00,00,000 = 1 crore · 1,00,000 = 1 lakh
    let rest = n
    const kharab = Math.floor(rest / 1e11); rest %= 1e11
    if (kharab) parts.push(`${intToWords(kharab, 'south-asian')} kharab`)
    for (const [v, w] of [[1e9, 'arab'], [1e7, 'crore'], [1e5, 'lakh'], [1e3, 'thousand']] as [number, string][]) {
      const q = Math.floor(rest / v); rest %= v
      if (q) parts.push(`${under1000(q)} ${w}`)
    }
    if (rest) parts.push(under1000(rest))
  }
  return parts.join(' ')
}

/** Any number to words, reading decimals digit by digit ("twelve point five zero"). */
export function numberToWords(n: number, system: WordSystem = 'international'): string {
  if (!Number.isFinite(n)) throw new Error('Not a number.')
  const [w, f] = Math.abs(n).toString().includes('e') ? [String(Math.trunc(Math.abs(n))), ''] : Math.abs(n).toString().split('.')
  const whole = intToWords(Number(w), system)
  const frac = f ? ` point ${f.split('').map((d) => ONES[Number(d)]).join(' ')}` : ''
  return `${n < 0 ? 'minus ' : ''}${whole}${frac}`
}

/** "Rupees one thousand two hundred fifty and fifty paisa only" */
export function pkrToWords(rupees: number, system: WordSystem = 'south-asian'): string {
  if (!Number.isFinite(rupees)) throw new Error('Not a number.')
  const neg = rupees < 0
  const paisaTotal = Math.round(Math.abs(rupees) * 100)
  const rs = Math.floor(paisaTotal / 100), ps = paisaTotal % 100
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return `${neg ? 'Minus ' : ''}${cap(`rupees ${intToWords(rs, system)}`)}${ps ? ` and ${intToWords(ps)} paisa` : ''} only`
}

const WORD_VALUES: Record<string, number> = Object.fromEntries([...ONES.map((w, i) => [w, i]), ...TENS.map((w, i) => [w, i * 10]).filter(([w]) => w)])
const SCALE: Record<string, number> = { hundred: 100, thousand: 1e3, lakh: 1e5, lac: 1e5, million: 1e6, crore: 1e7, billion: 1e9, arab: 1e9, kharab: 1e11, trillion: 1e12 }

/** Parse English number words back to a number ("two lakh fifty thousand" → 250000). Returns null if not understood. */
export function wordsToNumber(text: string): number | null {
  const tokens = text.toLowerCase().replace(/-/g, ' ').replace(/\band\b|\brupees?\b|\bonly\b|,/g, ' ').split(/\s+/).filter(Boolean)
  if (!tokens.length) return null
  let neg = false, total = 0, current = 0, i = 0, frac = ''
  if (tokens[0] === 'minus' || tokens[0] === 'negative') { neg = true; i = 1 }
  for (; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === 'point') { for (const d of tokens.slice(i + 1)) { if (!(d in WORD_VALUES) || WORD_VALUES[d] > 9) return null; frac += WORD_VALUES[d] } break }
    if (t in WORD_VALUES) current += WORD_VALUES[t]
    else if (t === 'hundred') current = (current || 1) * 100
    else if (t in SCALE) { total += (current || 1) * SCALE[t]; current = 0 }
    else if (/^\d+(\.\d+)?$/.test(t)) current += Number(t)
    else return null
  }
  const v = total + current + (frac ? Number(`0.${frac}`) : 0)
  return neg ? -v : v
}

/** Generate sequential IDs like INV-0001 … with prefix, start, step, padding and suffix. */
export function generateIds(opts: { prefix?: string; suffix?: string; start?: number; step?: number; count: number; pad?: number }): string[] {
  const { prefix = '', suffix = '', start = 1, step = 1, count, pad = 4 } = opts
  const c = Math.max(0, Math.min(10000, Math.floor(count)))
  return Array.from({ length: c }, (_, i) => `${prefix}${String(start + i * step).padStart(pad, '0')}${suffix}`)
}
