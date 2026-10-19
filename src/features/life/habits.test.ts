import { bestStreak, completionRate, currentStreak, doneDatesFor, heatmapWeeks, lastNDays } from './habits'

describe('habit statistics', () => {
  it('lists the last N days oldest first, across month boundaries', () => {
    expect(lastNDays('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
    expect(lastNDays('2026-03-02', 0)).toEqual([])
  })

  it('computes the current streak ending today', () => {
    expect(currentStreak(['2026-10-18', '2026-10-19', '2026-10-20'], '2026-10-20')).toBe(3)
  })

  it('keeps the streak alive from yesterday when today is not yet done', () => {
    expect(currentStreak(['2026-10-18', '2026-10-19'], '2026-10-20')).toBe(2)
  })

  it('resets the current streak after a missed day', () => {
    expect(currentStreak(['2026-10-17', '2026-10-18'], '2026-10-20')).toBe(0)
    expect(currentStreak([], '2026-10-20')).toBe(0)
  })

  it('computes the best streak with duplicates and gaps', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-02', '2026-01-03', '2026-01-05', '2026-01-06']
    expect(bestStreak(dates)).toBe(3)
    expect(bestStreak([])).toBe(0)
    expect(bestStreak(['2026-02-28', '2026-03-01'])).toBe(2)
  })

  it('ignores future dates for best streak when today is given', () => {
    expect(bestStreak(['2026-10-20', '2026-10-21', '2026-10-22'], '2026-10-20')).toBe(1)
  })

  it('computes completion rate over a window', () => {
    expect(completionRate(['2026-10-20', '2026-10-19', '2026-09-01'], '2026-10-20', 10)).toBeCloseTo(0.2)
    expect(completionRate([], '2026-10-20')).toBe(0)
    expect(completionRate(['2026-10-20'], '2026-10-20', 0)).toBe(0)
  })

  it('builds a heatmap grid whose last column contains today', () => {
    // 2026-10-20 is a Tuesday.
    const grid = heatmapWeeks('2026-10-20', 12, 1)
    expect(grid).toHaveLength(12)
    expect(grid.every((w) => w.length === 7)).toBe(true)
    const last = grid[11]
    expect(last[0].date).toBe('2026-10-19') // Monday
    expect(last[1]).toEqual({ date: '2026-10-20', future: false })
    expect(last[2].future).toBe(true)
    expect(grid[0][0].date).toBe('2026-08-03')
    const sunday = heatmapWeeks('2026-10-20', 1, 0)
    expect(sunday[0][0].date).toBe('2026-10-18')
  })

  it('extracts done dates for one habit', () => {
    const logs = [
      { habitId: 'a', date: '2026-10-01', done: true },
      { habitId: 'a', date: '2026-10-02', done: false },
      { habitId: 'b', date: '2026-10-03', done: true },
    ]
    expect(doneDatesFor(logs, 'a')).toEqual(['2026-10-01'])
  })
})
