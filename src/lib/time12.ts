/**
 * 12-hour time formatting (hh:mm:ss AM/PM) using Intl.DateTimeFormat, so midnight is 12 AM, noon is 12 PM and
 * a 24-hour value like 13:00 can never appear. Digits are always Latin; the AM/PM marker follows the locale.
 */
const cache = new Map<string, Intl.DateTimeFormat>()
function fmt(locale: string, tz: string | undefined, seconds: boolean) {
  const key = `${locale}|${tz ?? ''}|${seconds}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' as const } : {}), hour12: true, hourCycle: 'h12', timeZone: tz, numberingSystem: 'latn' })
    cache.set(key, f)
  }
  return f
}

export interface Clock12 { hh: string; mm: string; ss: string; period: string; text: string }

/** Parts for a live clock, e.g. { hh: '06', mm: '40', ss: '25', period: 'AM', text: '06:40:25 AM' }. */
export function clock12(at: Date | number, tz?: string, locale = 'en-US'): Clock12 {
  const parts = fmt(locale, tz, true).formatToParts(at)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  // Some engines still emit "00" for midnight with hour12 in a few locales; normalise to 12.
  const hh = get('hour') === '00' ? '12' : get('hour').padStart(2, '0')
  const period = get('dayPeriod') || (new Date(at).getHours() < 12 ? 'AM' : 'PM')
  const r = { hh, mm: get('minute'), ss: get('second'), period }
  return { ...r, text: `${r.hh}:${r.mm}:${r.ss} ${r.period}` }
}

/** "06:40 PM" — for lists and timestamps (no seconds). */
export function time12(at: Date | number, tz?: string, locale = 'en-US') {
  const c = clock12(at, tz, locale)
  return `${c.hh}:${c.mm} ${c.period}`
}
