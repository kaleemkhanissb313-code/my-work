export function money(n: number | null | undefined, currency = 'USD') {
  if (n == null || !Number.isFinite(n)) return '—'
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n) } catch { return n.toFixed(2) }
}

export const AREA_TONE = { personal: 'accent', work: 'work', home: 'home', life: 'life' } as const
export const AREA_LABEL = { personal: 'Personal', work: 'Work', home: 'Home', life: 'Life' } as const
export const PRIORITY_TONE = { low: 'muted', medium: 'accent', high: 'warn', urgent: 'danger' } as const

export const isValidUrl = (s: string) => {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}
export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)

/** Normalise user-entered URLs: add https:// when the scheme is missing. Rejects javascript:, data: etc. */
export function normaliseUrl(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
  return isValidUrl(withScheme) ? new URL(withScheme).toString() : null
}
