import { parseDate, todayISO } from '@/lib/dates'
import type { FieldValue } from '@/types/models'

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/

/**
 * Calendar start/end for a meeting record. A valid HH:mm time gives a timed one-hour event stored as a UTC ISO
 * instant (computed from the LOCAL date + time); otherwise an all-day event on the date.
 */
export function meetingStart(date: string, time: FieldValue | undefined, durationMins = 60): { allDay: boolean; start: string; end: string | null } {
  const m = typeof time === 'string' ? HHMM.exec(time.trim()) : null
  if (!m) return { allDay: true, start: date, end: null }
  const d = parseDate(date)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2]))
  return { allDay: false, start: start.toISOString(), end: new Date(start.getTime() + durationMins * 60_000).toISOString() }
}

/**
 * Start/end instants for a manually entered time entry. Entries for today end "now"; entries for other days
 * start at 09:00 local time on that day.
 */
export function timeEntryRange(date: string, durationMs: number, now = new Date()): { startedAt: number; endedAt: number } {
  if (date === todayISO(now)) {
    const endedAt = now.getTime()
    const dayStart = parseDate(date).getTime()
    const startedAt = Math.max(dayStart, endedAt - durationMs)
    return { startedAt, endedAt: startedAt + durationMs }
  }
  const d = parseDate(date)
  const startedAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0).getTime()
  return { startedAt, endedAt: startedAt + durationMs }
}
