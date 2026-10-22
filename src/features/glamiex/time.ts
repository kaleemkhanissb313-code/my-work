import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, startOfMonth, startOfQuarter, startOfWeek, startOfYear } from 'date-fns'
import { parseDate, toISODate } from '@/lib/dates'

/** Calendar parts of an instant in a given IANA time zone. */
export function zoned(iso: string, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long',
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = Number(g('hour')) % 24
  // time = 24-hour "HH:mm" (for inputs/exports); time12 = "hh:mm AM/PM" (for display)
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour, minute: Number(g('minute')), time: `${g('hour')}:${g('minute')}`, time12: to12(`${g('hour')}:${g('minute')}`), weekday: g('weekday') }
}

/** "18:05" → "06:05 PM" (midnight = 12 AM, noon = 12 PM). Empty input stays empty. */
export function to12(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1]) % 24
  return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/** Convert a wall-clock date + time in `tz` to a UTC ISO instant. */
export function wallToIso(date: string, time: string, tz: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = (time || '00:00').split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const off = (t: number) => {
    const z = zoned(new Date(t).toISOString(), tz)
    const [zy, zm, zd] = z.date.split('-').map(Number)
    return Date.UTC(zy, zm - 1, zd, z.hour, z.minute) - Math.floor(t / 60000) * 60000
  }
  let t = guess - off(guess)
  t = guess - off(t)
  return new Date(t).toISOString()
}

export interface DateRange { from: string; to: string }
export type RangePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear' | 'lastYear' | 'last30' | 'all' | 'custom'
export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'thisWeek', label: 'This week' }, { id: 'lastWeek', label: 'Last week' },
  { id: 'thisMonth', label: 'This month' }, { id: 'lastMonth', label: 'Last month' }, { id: 'thisQuarter', label: 'This quarter' },
  { id: 'thisYear', label: 'This year' }, { id: 'lastYear', label: 'Last year' }, { id: 'last30', label: 'Last 30 days' }, { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
]

/** Resolve a preset against "today" (a yyyy-MM-dd in the business time zone). Weeks start Monday. */
export function presetRange(p: RangePreset, today: string, custom?: DateRange): DateRange {
  const t = parseDate(today)
  const r = (a: Date, b: Date) => ({ from: toISODate(a), to: toISODate(b) })
  switch (p) {
    case 'today': return r(t, t)
    case 'yesterday': return r(addDays(t, -1), addDays(t, -1))
    case 'thisWeek': return r(startOfWeek(t, { weekStartsOn: 1 }), endOfWeek(t, { weekStartsOn: 1 }))
    case 'lastWeek': { const w = addWeeks(t, -1); return r(startOfWeek(w, { weekStartsOn: 1 }), endOfWeek(w, { weekStartsOn: 1 })) }
    case 'thisMonth': return r(startOfMonth(t), endOfMonth(t))
    case 'lastMonth': { const m = addMonths(t, -1); return r(startOfMonth(m), endOfMonth(m)) }
    case 'thisQuarter': return r(startOfQuarter(t), endOfQuarter(t))
    case 'thisYear': return r(startOfYear(t), endOfYear(t))
    case 'lastYear': { const y = addYears(t, -1); return r(startOfYear(y), endOfYear(y)) }
    case 'last30': return r(addDays(t, -29), t)
    case 'all': return { from: '2000-01-01', to: today } // UI narrows `from` to the earliest record
    case 'custom': return custom && custom.from <= custom.to ? custom : r(t, t)
  }
}

/** The equivalent period immediately before `r` (same number of days; whole months/years align to calendar). */
export function previousRange(r: DateRange): DateRange {
  const a = parseDate(r.from), b = parseDate(r.to)
  const isWholeMonths = toISODate(startOfMonth(a)) === r.from && toISODate(endOfMonth(b)) === r.to
  if (isWholeMonths) {
    const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1
    return { from: toISODate(addMonths(a, -months)), to: toISODate(endOfMonth(addMonths(a, -1))) }
  }
  const days = differenceInCalendarDays(b, a) + 1
  return { from: toISODate(addDays(a, -days)), to: toISODate(addDays(a, -1)) }
}

export const inRange = (date: string, r: DateRange) => date >= r.from && date <= r.to

export type Grouping = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'
export const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: 'day', label: 'Daily' }, { id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' }, { id: 'quarter', label: 'Quarterly' }, { id: 'year', label: 'Yearly' },
]

/** Bucket key + label for a local date. */
export function bucketOf(date: string, g: Exclude<Grouping, 'hour'>): { key: string; label: string } {
  const d = parseDate(date)
  switch (g) {
    case 'day': return { key: date, label: format(d, 'd MMM') }
    case 'week': { const s = startOfWeek(d, { weekStartsOn: 1 }); return { key: toISODate(s), label: `Wk ${format(s, 'd MMM')}` } }
    case 'month': return { key: date.slice(0, 7), label: format(d, 'MMM yyyy') }
    case 'quarter': return { key: `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`, label: `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}` }
    case 'year': return { key: String(d.getFullYear()), label: String(d.getFullYear()) }
  }
}

/** All bucket keys covering a range, in order (so empty periods still appear on charts). */
export function bucketsInRange(r: DateRange, g: Exclude<Grouping, 'hour'>, max = 400) {
  const out: { key: string; label: string }[] = []
  const seen = new Set<string>()
  const end = parseDate(r.to)
  const step = { day: (x: Date) => addDays(x, 1), week: (x: Date) => addWeeks(x, 1), month: (x: Date) => addMonths(x, 1), quarter: (x: Date) => addMonths(x, 3), year: (x: Date) => addYears(x, 1) }[g]
  const startAligned = g === 'week' ? startOfWeek(parseDate(r.from), { weekStartsOn: 1 }) : g === 'month' ? startOfMonth(parseDate(r.from)) : g === 'quarter' ? startOfQuarter(parseDate(r.from)) : g === 'year' ? startOfYear(parseDate(r.from)) : parseDate(r.from)
  for (let d = startAligned; d <= end && out.length < max; d = step(d)) {
    const b = bucketOf(toISODate(d), g)
    if (!seen.has(b.key)) { seen.add(b.key); out.push(b) }
  }
  return out
}

/** Sensible default grouping for a range length. */
export function autoGrouping(r: DateRange): Exclude<Grouping, 'hour'> {
  const days = differenceInCalendarDays(parseDate(r.to), parseDate(r.from)) + 1
  return days <= 31 ? 'day' : days <= 120 ? 'week' : days <= 800 ? 'month' : 'year'
}

export const daysInclusive = (a: string, b: string) => differenceInCalendarDays(parseDate(b), parseDate(a)) + 1
