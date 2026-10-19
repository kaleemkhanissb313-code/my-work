import type { Paisa } from './types'

/** Exact PKR handling: amounts are integer paisa (1 Rs = 100 paisa). */
export const toPaisa = (rupees: number): Paisa => Math.round(rupees * 100)
export const toRupees = (p: Paisa) => p / 100

/** Parse user input like "1,250", "Rs 1,250.50", "1250.5" → paisa. Returns null if invalid or > 2 decimals. */
export function parseRupees(input: string): Paisa | null {
  const s = input.trim().replace(/^(rs\.?|pkr)\s*/i, '').replace(/,/g, '').replace(/\s/g, '')
  if (!s) return null
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null
  const neg = s.startsWith('-')
  const [w, f = ''] = s.replace('-', '').split('.')
  const v = Number(w) * 100 + Number((f + '00').slice(0, 2))
  if (!Number.isSafeInteger(v)) return null
  return neg ? -v : v
}

/** Format paisa as PKR, e.g. "Rs 1,250" or "Rs 1,250.50". Uses en-PK digit grouping (thousands). */
export function pkr(p: Paisa | null | undefined, opts: { decimals?: 'auto' | 0 | 2; sign?: boolean } = {}) {
  if (p == null || !Number.isFinite(p)) return '—'
  const { decimals = 'auto', sign = false } = opts
  const abs = Math.abs(p)
  const hasFraction = abs % 100 !== 0
  const d = decimals === 'auto' ? (hasFraction ? 2 : 0) : decimals
  const body = new Intl.NumberFormat('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d }).format(abs / 100)
  const s = p < 0 ? '-' : sign && p > 0 ? '+' : ''
  return `${s}Rs ${body}`
}

/** Compact form for KPI cards: Rs 1.25M, Rs 12.4K (keeps 3 significant digits). */
export function pkrCompact(p: Paisa) {
  const r = p / 100
  const a = Math.abs(r)
  if (a < 10_000) return pkr(p, { decimals: 0 })
  const units: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [v, u] of units) if (a >= v) return `${r < 0 ? '-' : ''}Rs ${Number((a / v).toPrecision(3))}${u}`
  return pkr(p)
}

/** Multiply an amount in minor units by an exchange rate and round half away from zero. */
export const convert = (minor: number, rate: number): Paisa => Math.sign(minor) * Math.round(Math.abs(minor) * rate)

export const sumP = (xs: number[]): Paisa => xs.reduce((a, b) => a + b, 0)

/** Percentage change that never divides by zero. null = not comparable (previous was 0 and current isn't). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}
export const safeRatio = (a: number, b: number) => (b === 0 ? null : a / b)
