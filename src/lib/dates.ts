import {
  addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, isWeekend, parseISO, startOfDay,
} from 'date-fns'
import type { RecurrenceRule } from '@/types/models'

export const todayISO = (d = new Date()) => format(d, 'yyyy-MM-dd')
export const toISODate = (d: Date) => format(d, 'yyyy-MM-dd')
/** Parse yyyy-mm-dd as a LOCAL calendar date (avoids the UTC-midnight off-by-one of `new Date('yyyy-mm-dd')`). */
export const parseDate = (s: string) => startOfDay(parseISO(s))
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function fmtDate(s: string | null | undefined, pattern = 'MMM d, yyyy') {
  if (!s) return '—'
  try { return format(s.length <= 10 ? parseDate(s) : new Date(s), pattern) } catch { return s }
}

export function formatInZone(date: Date, timeZone: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone }).format(date)
}

/** Signed calendar-day difference b - a. */
export const daysBetween = (a: string, b: string) => differenceInCalendarDays(parseDate(b), parseDate(a))

/** Inclusive count of Mon–Fri days between a and b, excluding any ISO dates listed in `holidays`. */
export function workingDaysBetween(a: string, b: string, holidays: string[] = []) {
  let start = parseDate(a), end = parseDate(b)
  if (start > end) [start, end] = [end, start]
  const skip = new Set(holidays)
  let n = 0
  for (let d = start; d <= end; d = addDays(d, 1)) if (!isWeekend(d) && !skip.has(toISODate(d))) n++
  return n
}

/** Add N working days (Mon–Fri) to a date. */
export function addWorkingDays(a: string, n: number) {
  let d = parseDate(a)
  const dir = n >= 0 ? 1 : -1
  let left = Math.abs(n)
  while (left > 0) { d = addDays(d, dir); if (!isWeekend(d)) left-- }
  return toISODate(d)
}

function step(d: Date, rule: RecurrenceRule): Date {
  const i = Math.max(1, rule.interval || 1)
  switch (rule.freq) {
    case 'daily': return addDays(d, i)
    case 'weekly': return addWeeks(d, i)
    case 'monthly': return addMonths(d, i)
    case 'yearly': return addYears(d, i)
  }
}

/** Next occurrence strictly after `from` (yyyy-mm-dd). Returns null if past `until`. */
export function nextOccurrence(from: string, rule: RecurrenceRule, anchor = from): string | null {
  const base = parseDate(from)
  let next: Date
  if (rule.freq === 'weekly' && rule.byWeekday?.length) {
    const interval = Math.max(1, rule.interval || 1)
    const anchorDate = parseDate(anchor)
    // Weeks are counted from the Sunday of the anchor's week so "every 2 weeks on Mon,Wed" stays aligned.
    const anchorWeekStart = addDays(anchorDate, -anchorDate.getDay())
    next = addDays(base, 1)
    for (let guard = 0; guard < 7 * interval + 7; guard++) {
      const week = Math.floor(differenceInCalendarDays(next, anchorWeekStart) / 7)
      if (rule.byWeekday.includes(next.getDay()) && week % interval === 0) break
      next = addDays(next, 1)
    }
  } else next = step(base, rule)
  if (rule.until && next > parseDate(rule.until)) return null
  return toISODate(next)
}

/** Expand occurrence dates (yyyy-mm-dd) of a rule starting at `start` within [rangeStart, rangeEnd]. */
export function expandOccurrences(start: string, rule: RecurrenceRule | null, rangeStart: string, rangeEnd: string, max = 500): string[] {
  const out: string[] = []
  const rs = parseDate(rangeStart), re = parseDate(rangeEnd)
  if (!rule) {
    const d = parseDate(start)
    return d >= rs && d <= re ? [start] : []
  }
  let cur: string | null = start
  // Monthly rules on day 29-31: date-fns clamps (Jan 31 -> Feb 28), and stepping from the clamped date would drift,
  // so for monthly/yearly we compute each occurrence from the original start.
  if (rule.freq === 'monthly' || rule.freq === 'yearly') {
    const s = parseDate(start)
    const i = Math.max(1, rule.interval || 1)
    for (let k = 0; k < 5000; k++) {
      const d = rule.freq === 'monthly' ? addMonths(s, k * i) : addYears(s, k * i)
      if (d > re || (rule.until && d > parseDate(rule.until))) break
      if (d >= rs) { out.push(toISODate(d)); if (out.length >= max) break }
    }
    return out
  }
  for (let n = 0; cur && n < 20000; n++) {
    const d = parseDate(cur)
    if (d > re) break
    if (d >= rs) { out.push(cur); if (out.length >= max) break }
    cur = nextOccurrence(cur, rule, start)
  }
  return out
}

export function describeRecurrence(rule: RecurrenceRule | null) {
  if (!rule) return 'Does not repeat'
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq]
  const every = rule.interval > 1 ? `Every ${rule.interval} ${unit}s` : `Every ${unit}`
  const days = rule.byWeekday?.length ? ` on ${rule.byWeekday.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}` : ''
  return every + days + (rule.until ? ` until ${fmtDate(rule.until)}` : '')
}

export function durationParts(ms: number) {
  const neg = ms < 0
  let s = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60); s -= m * 60
  return { neg, h, m, s, cs: Math.floor((Math.abs(ms) % 1000) / 10) }
}
export function fmtDuration(ms: number, withCs = false) {
  const { neg, h, m, s, cs } = durationParts(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${neg ? '-' : ''}${h ? h + ':' : ''}${p(m)}:${p(s)}${withCs ? '.' + p(cs) : ''}`
}
export const fmtHours = (ms: number) => `${(ms / 3_600_000).toFixed(ms < 3_600_000 ? 2 : 1)} h`
