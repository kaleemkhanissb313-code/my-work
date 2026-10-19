/** Parse a list of numbers separated by commas, spaces, semicolons or new lines. Returns invalid tokens separately. */
export function parseNumberList(s: string) {
  const tokens = s.split(/[\s,;]+/).filter(Boolean)
  const values: number[] = [], invalid: string[] = []
  for (const t of tokens) {
    const n = Number(t)
    if (Number.isFinite(n)) values.push(n)
    else invalid.push(t)
  }
  return { values, invalid }
}

export function stats(values: number[]) {
  if (!values.length) return null
  const n = values.length
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  const counts = new Map<number, number>()
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
  const maxCount = Math.max(...counts.values())
  const mode = maxCount > 1 ? [...counts].filter(([, c]) => c === maxCount).map(([v]) => v).sort((a, b) => a - b) : []
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / n
  const sampleVariance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0
  const q = (p: number) => {
    const idx = (n - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }
  return {
    count: n, sum, mean, median, mode, min: sorted[0], max: sorted[n - 1], range: sorted[n - 1] - sorted[0],
    variance, stdDev: Math.sqrt(variance), sampleStdDev: Math.sqrt(sampleVariance), q1: q(0.25), q3: q(0.75),
  }
}

export const percentOf = (pct: number, of: number) => (pct / 100) * of
export const whatPercent = (part: number, whole: number) => (whole === 0 ? NaN : (part / whole) * 100)
export const percentChange = (from: number, to: number) => (from === 0 ? NaN : ((to - from) / Math.abs(from)) * 100)

export function discount(price: number, pct: number, taxPct = 0) {
  const saved = price * (pct / 100)
  const after = price - saved
  return { saved, after, tax: after * (taxPct / 100), total: after * (1 + taxPct / 100) }
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a))
export function simplifyRatio(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return null
  // Scale decimals to integers first.
  const scale = 10 ** Math.max(decimals(a), decimals(b))
  const A = Math.round(a * scale), B = Math.round(b * scale)
  const g = gcd(A, B) || 1
  return [A / g, B / g] as const
}
const decimals = (n: number) => (String(n).split('.')[1] ?? '').length
/** Solve a:b = c:x for x. */
export const solveProportion = (a: number, b: number, c: number) => (a === 0 ? NaN : (b * c) / a)

export function roundTo(n: number, places: number, mode: 'round' | 'floor' | 'ceil' | 'trunc' = 'round') {
  const f = 10 ** places
  // Number.EPSILON nudge prevents 1.005 -> 1.00 style errors.
  const v = n * f
  const fn = { round: (x: number) => Math.round(x + Math.sign(x) * Number.EPSILON * Math.abs(x)), floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc }[mode]
  return fn(v) / f
}

export function formatNumber(n: number, opts: { style?: 'decimal' | 'currency' | 'percent' | 'compact' | 'scientific'; currency?: string; decimals?: number; locale?: string } = {}) {
  const { style = 'decimal', currency = 'USD', decimals: d, locale } = opts
  const frac = d == null ? {} : { minimumFractionDigits: d, maximumFractionDigits: d }
  if (style === 'compact') return new Intl.NumberFormat(locale, { notation: 'compact', ...frac }).format(n)
  if (style === 'scientific') return new Intl.NumberFormat(locale, { notation: 'scientific', ...frac }).format(n)
  if (style === 'currency') return new Intl.NumberFormat(locale, { style: 'currency', currency, ...frac }).format(n)
  if (style === 'percent') return new Intl.NumberFormat(locale, { style: 'percent', ...frac }).format(n)
  return new Intl.NumberFormat(locale, frac).format(n)
}

export function toBase(n: number, base: number) {
  if (!Number.isInteger(n)) return null
  return n.toString(base).toUpperCase()
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
export function toRoman(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return null
  let out = ''
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v }
  return out
}

export function isPrime(n: number) {
  if (!Number.isInteger(n) || n < 2) return false
  if (n % 2 === 0) return n === 2
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false
  return true
}

export type SequenceKind = 'arithmetic' | 'geometric' | 'fibonacci' | 'primes' | 'squares'
export function sequence(kind: SequenceKind, count: number, start = 1, step = 1): number[] {
  const c = Math.min(Math.max(0, Math.floor(count)), 1000)
  switch (kind) {
    case 'arithmetic': return Array.from({ length: c }, (_, i) => start + i * step)
    case 'geometric': return Array.from({ length: c }, (_, i) => start * step ** i)
    case 'squares': return Array.from({ length: c }, (_, i) => (start + i) ** 2)
    case 'fibonacci': { const out: number[] = []; let a = 0, b = 1; for (let i = 0; i < c; i++) { out.push(a); [a, b] = [b, a + b] } return out }
    case 'primes': { const out: number[] = []; for (let k = Math.max(2, start); out.length < c; k++) if (isPrime(k)) out.push(k); return out }
  }
}

/* ---------- Unit conversion ---------- */
export type UnitCategory = 'length' | 'mass' | 'volume' | 'area' | 'speed' | 'time' | 'data' | 'temperature'
export const UNITS: Record<UnitCategory, Record<string, number>> = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  mass: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 },
  volume: { ml: 0.001, l: 1, 'm³': 1000, tsp: 0.00492892, tbsp: 0.0147868, cup: 0.236588, 'fl oz': 0.0295735, gal: 3.785411784 },
  area: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, ha: 1e4, 'km²': 1e6, 'ft²': 0.09290304, acre: 4046.8564224, 'mi²': 2589988.110336 },
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 0.514444 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 },
  data: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 },
  temperature: { '°C': 1, '°F': 1, K: 1 },
}

export function convertUnit(value: number, cat: UnitCategory, from: string, to: string): number {
  if (cat === 'temperature') {
    const c = from === '°C' ? value : from === '°F' ? ((value - 32) * 5) / 9 : value - 273.15
    if (c < -273.15) return NaN
    return to === '°C' ? c : to === '°F' ? (c * 9) / 5 + 32 : c + 273.15
  }
  const f = UNITS[cat][from], t = UNITS[cat][to]
  if (f == null || t == null) return NaN
  return (value * f) / t
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024, i = 0
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}
