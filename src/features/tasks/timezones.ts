/** Time-zone helpers built on Intl (no dependencies). */
export const FALLBACK_ZONES = [
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata',
  'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'America/Sao_Paulo',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
]

/** All IANA zones the browser knows (Intl.supportedValuesOf), or a fallback list on older browsers. */
export function zoneList(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    const z = fn ? fn('timeZone') : []
    if (z.length) return z.includes('UTC') ? z : ['UTC', ...z]
  } catch { /* not supported */ }
  return FALLBACK_ZONES
}

/** Offset (ms) of `zone` from UTC at instant `t`. */
export function zoneOffset(zone: string, t: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t))
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - Math.floor(t / 1000) * 1000
}

/** Interpret a wall-clock `yyyy-MM-ddTHH:mm` in `zone` and return the UTC instant (ms). */
export function wallTimeToInstant(local: string, zone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let t = guess - zoneOffset(zone, guess)
  t = guess - zoneOffset(zone, t) // second pass handles DST boundaries
  return t
}

export function fmtOffset(zone: string, t: number) {
  const o = Math.round(zoneOffset(zone, t) / 60000)
  const a = Math.abs(o)
  return `UTC${o >= 0 ? '+' : '-'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
}
