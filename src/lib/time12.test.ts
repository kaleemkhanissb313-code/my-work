import { clock12, time12 } from './time12'

// Fixed UTC instants rendered in UTC, so the test does not depend on the machine's time zone.
const at = (hms: string) => new Date(`2026-10-23T${hms}Z`)
const show = (hms: string) => clock12(at(hms), 'UTC').text

describe('12-hour clock', () => {
  it.each([
    ['00:00:00', '12:00:00 AM'], ['01:00:00', '01:00:00 AM'], ['06:40:25', '06:40:25 AM'], ['11:59:59', '11:59:59 AM'],
    ['12:00:00', '12:00:00 PM'], ['13:00:00', '01:00:00 PM'], ['18:30:25', '06:30:25 PM'], ['20:00:00', '08:00:00 PM'], ['23:59:59', '11:59:59 PM'],
  ])('%s → %s', (hms, want) => expect(show(hms)).toBe(want))

  it('never shows an hour above 12 across a whole day', () => {
    for (let m = 0; m < 24 * 60; m += 7) {
      const h = Number(clock12(new Date(Date.UTC(2026, 9, 23, 0, m)), 'UTC').hh)
      expect(h).toBeGreaterThanOrEqual(1)
      expect(h).toBeLessThanOrEqual(12)
    }
  })

  it('respects the time zone (Karachi is UTC+5)', () => {
    expect(clock12(at('01:40:25'), 'Asia/Karachi').text).toBe('06:40:25 AM')
  })

  it('formats short times without seconds', () => {
    expect(time12(at('18:05:00'), 'UTC')).toBe('06:05 PM')
  })
})
