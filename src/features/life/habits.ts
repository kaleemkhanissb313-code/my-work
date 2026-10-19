import { addDays, startOfWeek } from 'date-fns'
import { parseDate, toISODate } from '@/lib/dates'

/** Pure habit statistics. Dates are local calendar dates as yyyy-MM-dd strings. */

/** The `n` calendar days ending at `today` (inclusive), oldest first. */
export function lastNDays(today: string, n: number): string[] {
  const end = parseDate(today)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(toISODate(addDays(end, -i)))
  return out
}

/**
 * Current streak: consecutive done days ending today. If today is not (yet) done, the streak
 * ending yesterday still counts, so the streak doesn't "break" until a full day is missed.
 */
export function currentStreak(doneDates: Iterable<string>, today: string): number {
  const done = new Set(doneDates)
  let d = parseDate(today)
  if (!done.has(toISODate(d))) d = addDays(d, -1)
  let n = 0
  while (done.has(toISODate(d))) { n++; d = addDays(d, -1) }
  return n
}

/** Longest run of consecutive calendar days among the done dates (dates after `today` are ignored when given). */
export function bestStreak(doneDates: Iterable<string>, today?: string): number {
  const sorted = [...new Set(doneDates)].filter((d) => !today || d <= today).sort()
  let best = 0, run = 0
  let prev: string | null = null
  for (const d of sorted) {
    run = prev && toISODate(addDays(parseDate(prev), 1)) === d ? run + 1 : 1
    if (run > best) best = run
    prev = d
  }
  return best
}

/** Fraction (0–1) of the last `days` days (ending today, inclusive) that are done. */
export function completionRate(doneDates: Iterable<string>, today: string, days = 30): number {
  if (days <= 0) return 0
  const done = new Set(doneDates)
  return lastNDays(today, days).filter((d) => done.has(d)).length / days
}

/**
 * Calendar grid for a heatmap: `weeks` columns of 7 days, the last column containing `today`.
 * Each week starts on `weekStartsOn` (0 = Sunday, 1 = Monday). Days after today are flagged `future`.
 */
export function heatmapWeeks(today: string, weeks = 12, weekStartsOn: 0 | 1 = 1): { date: string; future: boolean }[][] {
  const t = parseDate(today)
  const lastWeekStart = startOfWeek(t, { weekStartsOn })
  const first = addDays(lastWeekStart, -7 * (weeks - 1))
  const out: { date: string; future: boolean }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: { date: string; future: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(first, w * 7 + i)
      col.push({ date: toISODate(d), future: d > t })
    }
    out.push(col)
  }
  return out
}

/** Done dates for one habit from its logs. */
export const doneDatesFor = (logs: { habitId: string; date: string; done: boolean }[], habitId: string) =>
  logs.filter((l) => l.habitId === habitId && l.done).map((l) => l.date)
