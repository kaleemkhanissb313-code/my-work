import { meetingStart, timeEntryRange } from './time'

describe('work time helpers', () => {
  it('creates a timed meeting from a valid HH:mm', () => {
    const r = meetingStart('2026-10-20', '14:30')
    expect(r.allDay).toBe(false)
    const d = new Date(r.start)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 20, 14, 30])
    expect(new Date(r.end!).getTime() - d.getTime()).toBe(3_600_000)
  })

  it('falls back to all-day for missing or invalid times', () => {
    expect(meetingStart('2026-10-20', '25:00')).toEqual({ allDay: true, start: '2026-10-20', end: null })
    expect(meetingStart('2026-10-20', undefined).allDay).toBe(true)
    expect(meetingStart('2026-10-20', 'afternoon').allDay).toBe(true)
  })

  it('computes manual time entry ranges', () => {
    const now = new Date(2026, 9, 20, 12, 0)
    const today = timeEntryRange('2026-10-20', 3_600_000, now)
    expect(today.endedAt).toBe(now.getTime())
    expect(today.endedAt - today.startedAt).toBe(3_600_000)
    // Never starts before midnight of the chosen day.
    const long = timeEntryRange('2026-10-20', 20 * 3_600_000, now)
    expect(long.startedAt).toBe(new Date(2026, 9, 20).getTime())
    const past = timeEntryRange('2026-10-18', 1_800_000, now)
    expect(new Date(past.startedAt).getHours()).toBe(9)
    expect(past.endedAt - past.startedAt).toBe(1_800_000)
  })
})
