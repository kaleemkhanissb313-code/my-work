import { addWorkingDays, daysBetween, describeRecurrence, expandOccurrences, fmtDuration, nextOccurrence, workingDaysBetween } from '../dates'

describe('date calculations', () => {
  it('computes signed calendar day differences across DST and leap years', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // leap year
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1)
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31) // spans DST change in many zones
    expect(daysBetween('2026-01-10', '2026-01-01')).toBe(-9)
  })

  it('counts working days inclusively and skips holidays', () => {
    expect(workingDaysBetween('2026-10-19', '2026-10-23')).toBe(5) // Mon–Fri
    expect(workingDaysBetween('2026-10-17', '2026-10-18')).toBe(0) // Sat–Sun
    expect(workingDaysBetween('2026-10-23', '2026-10-19')).toBe(5) // order-independent
    expect(workingDaysBetween('2026-10-19', '2026-10-23', ['2026-10-21'])).toBe(4)
  })

  it('adds working days skipping weekends', () => {
    expect(addWorkingDays('2026-10-23', 1)).toBe('2026-10-26') // Fri + 1 → Mon
    expect(addWorkingDays('2026-10-26', -1)).toBe('2026-10-23')
    expect(addWorkingDays('2026-10-19', 0)).toBe('2026-10-19')
  })

  it('computes next occurrences', () => {
    expect(nextOccurrence('2026-01-31', { freq: 'daily', interval: 1 })).toBe('2026-02-01')
    expect(nextOccurrence('2026-01-31', { freq: 'weekly', interval: 2 })).toBe('2026-02-14')
    expect(nextOccurrence('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28') // clamps
    expect(nextOccurrence('2024-02-29', { freq: 'yearly', interval: 1 })).toBe('2025-02-28')
    expect(nextOccurrence('2026-01-01', { freq: 'daily', interval: 1, until: '2026-01-01' })).toBeNull()
  })

  it('handles weekly rules with specific weekdays', () => {
    // 2026-10-19 is a Monday. Mon/Wed/Fri:
    const rule = { freq: 'weekly' as const, interval: 1, byWeekday: [1, 3, 5] }
    expect(nextOccurrence('2026-10-19', rule)).toBe('2026-10-21')
    expect(nextOccurrence('2026-10-23', rule)).toBe('2026-10-26')
  })

  it('expands recurrences inside a range without monthly drift', () => {
    const occ = expandOccurrences('2026-01-31', { freq: 'monthly', interval: 1 }, '2026-01-01', '2026-05-31')
    expect(occ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
    expect(expandOccurrences('2026-10-20', null, '2026-10-01', '2026-10-31')).toEqual(['2026-10-20'])
    expect(expandOccurrences('2026-10-20', null, '2026-11-01', '2026-11-30')).toEqual([])
    expect(expandOccurrences('1990-05-04', { freq: 'yearly', interval: 1 }, '2026-01-01', '2026-12-31')).toEqual(['2026-05-04'])
  })

  it('formats durations', () => {
    expect(fmtDuration(0)).toBe('00:00')
    expect(fmtDuration(61_000)).toBe('01:01')
    expect(fmtDuration(3_723_450, true)).toBe('1:02:03.45')
    expect(describeRecurrence(null)).toBe('Does not repeat')
    expect(describeRecurrence({ freq: 'weekly', interval: 2, byWeekday: [1] })).toBe('Every 2 weeks on Mon')
  })
})
