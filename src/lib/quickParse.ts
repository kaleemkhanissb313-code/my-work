import { addDays, addMonths, addWeeks, getDay } from 'date-fns'
import { toISODate } from './dates'
import type { Area, Priority, RecurrenceRule } from '@/types/models'

/**
 * Natural-language quick-add parser (pure, no DB access).
 *   "Pay rent tomorrow 5pm #bills !high @home"          → event tomorrow 17:00, tag, priority, area
 *   "task: Call mom every sunday"                       → weekly task
 *   "Dentist oct 28 at 9:30 for 45m +Health"            → event with duration and project
 *   "Write report fri ~2h !urgent @work"                → task due Friday, estimate 2h
 * Recognised parts are removed from the title. Anything not understood stays in the title.
 */
export type QuickKind = 'task' | 'event'

export interface QuickParse {
  kind: QuickKind
  /** True when the user forced the kind with a "task:" / "event:" prefix. */
  kindExplicit: boolean
  title: string
  date: string | null
  /** 24h HH:mm */
  time: string | null
  durationMins: number | null
  estimateMins: number | null
  tags: string[]
  priority: Priority | null
  area: Area | null
  project: string | null
  recurrence: RecurrenceRule | null
  /** Human-readable pieces that were understood, for preview chips. */
  parts: { type: 'date' | 'time' | 'duration' | 'estimate' | 'tag' | 'priority' | 'area' | 'project' | 'repeat' | 'kind'; label: string }[]
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
}
const WD = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|')
const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5,
  july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
}
const MO = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
const PRIORITY_WORDS: Record<string, Priority> = { low: 'low', l: 'low', 4: 'low', medium: 'medium', med: 'medium', m: 'medium', 3: 'medium', high: 'high', h: 'high', 2: 'high', urgent: 'urgent', u: 'urgent', 1: 'urgent' }
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad = (n: number) => String(n).padStart(2, '0')

/** Next date (including today unless `strictlyAfter`) falling on weekday `wd`. */
function nextWeekday(from: Date, wd: number, strictlyAfter = false) {
  let diff = (wd - getDay(from) + 7) % 7
  if (diff === 0 && strictlyAfter) diff = 7
  return addDays(from, diff)
}

/** Build a valid date; if no year was given and the date already passed, roll to next year. */
function mkDate(now: Date, month: number, day: number, year?: number): Date | null {
  const y = year ?? now.getFullYear()
  const d = new Date(y, month, day)
  if (d.getMonth() !== month || d.getDate() !== day) return null
  if (year == null && toISODate(d) < toISODate(now)) return new Date(y + 1, month, day)
  return d
}

export function parseQuickAdd(input: string, now = new Date(), opts: { dayFirst?: boolean } = {}): QuickParse {
  const dayFirst = opts.dayFirst ?? true
  let s = ` ${input.trim()} `
  const parts: QuickParse['parts'] = []
  const r: QuickParse = {
    kind: 'task', kindExplicit: false, title: '', date: null, time: null, durationMins: null, estimateMins: null,
    tags: [], priority: null, area: null, project: null, recurrence: null, parts,
  }
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(re)
    if (m && fn(m) !== false) s = s.replace(m[0], ' ')
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Kind prefix
  take(/^\s*(task|todo|event|meeting)\s*:\s*/i, (m) => {
    r.kind = /task|todo/i.test(m[1]) ? 'task' : 'event'
    r.kindExplicit = true
    parts.push({ type: 'kind', label: r.kind === 'task' ? 'Task' : 'Event' })
  })

  // Recurrence: "every day / weekday / week / month / year / monday / 2 weeks / other week"
  take(new RegExp(`\\s(?:every|each)\\s+(?:(other)\\s+|(\\d+)\\s+)?(day|weekday|week|month|year|${WD})s?(?=\\s)`, 'i'), (m) => {
    const interval = m[1] ? 2 : m[2] ? Math.max(1, Math.min(365, Number(m[2]))) : 1
    const unit = m[3].toLowerCase()
    if (unit === 'weekday') {
      r.recurrence = { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }
      r.date ??= toISODate(nextWeekday(today, getDay(today) === 0 ? 1 : getDay(today) === 6 ? 1 : getDay(today)))
      parts.push({ type: 'repeat', label: 'Every weekday' })
    } else if (unit in WEEKDAYS) {
      const wd = WEEKDAYS[unit]
      r.recurrence = { freq: 'weekly', interval, byWeekday: [wd] }
      r.date ??= toISODate(nextWeekday(today, wd))
      parts.push({ type: 'repeat', label: `Every ${interval > 1 ? `${interval} weeks on ` : ''}${DAY_NAMES[wd]}` })
    } else {
      const freq = ({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' } as const)[unit as 'day']
      r.recurrence = { freq, interval }
      parts.push({ type: 'repeat', label: interval > 1 ? `Every ${interval} ${unit}s` : `Every ${unit}` })
    }
  })

  // Dates
  const setDate = (d: Date, label?: string) => { r.date = toISODate(d); parts.push({ type: 'date', label: label ?? toISODate(d) }) }
  take(/\s(today|tod|tonight)(?=\s)/i, (m) => { setDate(today, 'Today'); if (/tonight/i.test(m[1]) && !r.time) r.time = '20:00' })
  if (!r.date) take(/\s(tomorrow|tmrw|tmr|tom)(?=\s)/i, () => setDate(addDays(today, 1), 'Tomorrow'))
  if (!r.date) take(/\s(day after tomorrow)(?=\s)/i, () => setDate(addDays(today, 2)))
  if (!r.date) take(/\sin\s+(\d{1,3})\s+(day|week|month)s?(?=\s)/i, (m) => {
    const n = Number(m[1]), u = m[2].toLowerCase()
    setDate(u === 'day' ? addDays(today, n) : u === 'week' ? addWeeks(today, n) : addMonths(today, n), `In ${n} ${u}${n > 1 ? 's' : ''}`)
  })
  if (!r.date) take(/\snext\s+(week|month)(?=\s)/i, (m) => {
    if (m[1].toLowerCase() === 'week') setDate(nextWeekday(today, 1, true), 'Next week')
    else setDate(new Date(today.getFullYear(), today.getMonth() + 1, 1), 'Next month')
  })
  if (!r.date) take(/\s(this\s+)?weekend(?=\s)/i, () => setDate(nextWeekday(today, 6), 'This weekend'))
  if (!r.date) take(new RegExp(`\\s(?:on\\s+)?(next\\s+)?(${WD})(?=\\s)`, 'i'), (m) => {
    const wd = WEEKDAYS[m[2].toLowerCase()]
    // "friday" = the coming Friday (today if it is Friday); "next friday" = never today.
    setDate(nextWeekday(today, wd, !!m[1]), `${m[1] ? 'Next ' : ''}${DAY_NAMES[wd]}`)
  })
  if (!r.date) take(/\s(?:on\s+)?(\d{4})-(\d{2})-(\d{2})(?=\s)/, (m) => {
    const d = mkDate(today, Number(m[2]) - 1, Number(m[3]), Number(m[1]))
    if (!d) return false
    setDate(d)
  })
  if (!r.date) take(new RegExp(`\\s(?:on\\s+)?(${MO})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s)`, 'i'), (m) => {
    const d = mkDate(today, MONTHS[m[1].toLowerCase()], Number(m[2]), m[3] ? Number(m[3]) : undefined)
    if (!d) return false
    setDate(d)
  })
  if (!r.date) take(new RegExp(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MO})(?:,?\\s+(\\d{4}))?(?=\\s)`, 'i'), (m) => {
    const d = mkDate(today, MONTHS[m[2].toLowerCase()], Number(m[1]), m[3] ? Number(m[3]) : undefined)
    if (!d) return false
    setDate(d)
  })
  if (!r.date) take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?=\s)/, (m) => {
    const a = Number(m[1]), b = Number(m[2])
    const [day, month] = dayFirst ? [a, b] : [b, a]
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined
    const d = mkDate(today, month - 1, day, year)
    if (!d) return false
    setDate(d)
  })

  // Time: "5pm", "5:30 pm", "at 17:30", "noon", "midnight"
  const setTime = (h: number, mi: number) => { r.time = `${pad(h)}:${pad(mi)}`; parts.push({ type: 'time', label: r.time }) }
  take(/\s(?:at\s+)?(noon|midday|midnight)(?=\s)/i, (m) => setTime(/midnight/i.test(m[1]) ? 0 : 12, 0))
  if (!r.time) take(/\s(?:at\s+|@\s*)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)/i, (m) => {
    let h = Number(m[1])
    if (h < 1 || h > 12) return false
    const pm = /p/i.test(m[3])
    if (h === 12) h = pm ? 12 : 0
    else if (pm) h += 12
    setTime(h, Number(m[2] ?? 0))
  })
  if (!r.time) take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => setTime(Number(m[1]), Number(m[2])))
  if (!r.time) take(/\sat\s+([01]?\d|2[0-3])(?=\s)/i, (m) => setTime(Number(m[1]), 0))

  // Duration (events) and estimate (tasks)
  const toMins = (n: number, u: string) => Math.round(/^h/i.test(u) ? n * 60 : n)
  take(/\sfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)(?=\s)/i, (m) => {
    r.durationMins = toMins(Number(m[1]), m[2])
    parts.push({ type: 'duration', label: `${r.durationMins} min` })
  })
  take(/\s~\s*(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)(?=\s)/i, (m) => {
    r.estimateMins = toMins(Number(m[1]), m[2])
    parts.push({ type: 'estimate', label: `Est. ${r.estimateMins} min` })
  })

  // Priority: !high, !1, !!!
  take(/\s!(urgent|high|medium|med|low|[1-4]|[uhml])(?=\s)/i, (m) => { r.priority = PRIORITY_WORDS[m[1].toLowerCase()]; parts.push({ type: 'priority', label: r.priority }) })
  if (!r.priority) take(/\s(!{2,4})(?=\s)/, (m) => { r.priority = m[1].length >= 3 ? 'urgent' : 'high'; parts.push({ type: 'priority', label: r.priority }) })

  // Area: @home @work @life @personal
  take(/\s@(home|work|life|personal)(?=\s)/i, (m) => { r.area = m[1].toLowerCase() as Area; parts.push({ type: 'area', label: r.area }) })

  // Project: +Name (dashes/underscores = spaces)
  take(/\s\+([\p{L}\p{N}][\p{L}\p{N}_-]*)(?=\s)/u, (m) => { r.project = m[1].replace(/[_-]+/g, ' '); parts.push({ type: 'project', label: r.project }) })

  // Tags: #tag (all of them)
  for (let m = s.match(/\s#([\p{L}\p{N}][\p{L}\p{N}_-]*)(?=\s)/u); m; m = s.match(/\s#([\p{L}\p{N}][\p{L}\p{N}_-]*)(?=\s)/u)) {
    const t = m[1].toLowerCase().slice(0, 32)
    if (!r.tags.includes(t)) { r.tags.push(t); parts.push({ type: 'tag', label: `#${t}` }) }
    s = s.replace(m[0], ' ')
  }

  // Without an explicit prefix, a specific time or duration makes it an event.
  if (!r.kindExplicit && (r.time || r.durationMins)) r.kind = 'event'
  // Repeating things need an anchor date.
  if (r.recurrence && !r.date) r.date = toISODate(today)

  r.title = s.replace(/\s+/g, ' ').trim().replace(/^[-–:,]\s*/, '')
  return r
}

/** Resolve the start/end instants of a parsed event (local wall time). */
export function eventTimes(p: QuickParse, now = new Date()) {
  const date = p.date ?? toISODate(now)
  if (!p.time) return { allDay: true, start: date, end: null as string | null }
  const [h, m] = p.time.split(':').map(Number)
  const [y, mo, d] = date.split('-').map(Number)
  const start = new Date(y, mo - 1, d, h, m)
  const end = new Date(start.getTime() + (p.durationMins ?? 60) * 60_000)
  return { allDay: false, start: start.toISOString(), end: end.toISOString() }
}
