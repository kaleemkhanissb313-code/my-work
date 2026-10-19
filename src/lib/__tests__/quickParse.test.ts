import { eventTimes, parseQuickAdd } from '../quickParse'

// Tuesday 20 Oct 2026, 10:00 local
const NOW = new Date(2026, 9, 20, 10, 0)
const p = (s: string, o?: { dayFirst?: boolean }) => parseQuickAdd(s, NOW, o)

describe('smart quick-add parser', () => {
  it('parses relative dates, time, tags, priority and area', () => {
    const r = p('Pay rent tomorrow 5pm #bills #home-stuff !high @home')
    expect(r).toMatchObject({ title: 'Pay rent', date: '2026-10-21', time: '17:00', priority: 'high', area: 'home', kind: 'event' })
    expect(r.tags).toEqual(['bills', 'home-stuff'])
  })

  it('keeps plain text as a task due on the given weekday', () => {
    expect(p('Write report fri ~2h !urgent @work')).toMatchObject({ title: 'Write report', date: '2026-10-23', estimateMins: 120, priority: 'urgent', area: 'work', kind: 'task' })
    expect(p('Gym tuesday').date).toBe('2026-10-20') // today is Tuesday
    expect(p('Gym next tuesday').date).toBe('2026-10-27')
  })

  it('parses absolute dates in several formats', () => {
    expect(p('Dentist oct 28 at 9:30 for 45m').date).toBe('2026-10-28')
    expect(p('Dentist oct 28 at 9:30 for 45m')).toMatchObject({ time: '09:30', durationMins: 45, title: 'Dentist', kind: 'event' })
    expect(p('Trip 5 jan').date).toBe('2027-01-05') // past this year → next year
    expect(p('Launch 2026-12-01').date).toBe('2026-12-01')
    expect(p('Pay 25/10').date).toBe('2026-10-25')
    expect(p('Pay 10/25', { dayFirst: false }).date).toBe('2026-10-25')
    expect(p('Invalid 31/02').date).toBeNull()
    expect(p('Invalid 31/02').title).toBe('Invalid 31/02')
    expect(p('Review in 3 days').date).toBe('2026-10-23')
    expect(p('Plan next week').date).toBe('2026-10-26')
  })

  it('parses recurrence and anchors the first date', () => {
    expect(p('Call mom every sunday')).toMatchObject({ title: 'Call mom', date: '2026-10-25', recurrence: { freq: 'weekly', interval: 1, byWeekday: [0] } })
    expect(p('Water plants every 3 days').recurrence).toEqual({ freq: 'daily', interval: 3 })
    expect(p('Standup every weekday 9am').recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] })
    expect(p('Report every month').date).toBe('2026-10-20')
  })

  it('honours explicit kind prefixes, projects and 12am/12pm edge cases', () => {
    expect(p('task: Call client at 3pm')).toMatchObject({ kind: 'task', kindExplicit: true, time: '15:00', title: 'Call client' })
    expect(p('event: Offsite').kind).toBe('event')
    expect(p('Fix bug +Website-Redesign').project).toBe('Website Redesign')
    expect(p('Lunch noon').time).toBe('12:00')
    expect(p('Backup 12am').time).toBe('00:00')
    expect(p('Meet 12pm').time).toBe('12:00')
    expect(p('Thing 13pm').time).toBeNull()
  })

  it('does not mangle ordinary words', () => {
    const r = p('Monitor the satellite feed #ops')
    expect(r.title).toBe('Monitor the satellite feed')
    expect(r.date).toBeNull()
    expect(p('Email support@example.com about invoice').title).toBe('Email support@example.com about invoice')
  })

  it('computes event start/end', () => {
    const t = eventTimes(p('Meeting tomorrow 14:00 for 90m'), NOW)
    expect(t.allDay).toBe(false)
    expect(new Date(t.end!).getTime() - new Date(t.start).getTime()).toBe(90 * 60_000)
    expect(eventTimes(p('Holiday dec 25'), NOW)).toEqual({ allDay: true, start: '2026-12-25', end: null })
  })
})
