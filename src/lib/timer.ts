import type { RunningTimer } from '@/types/models'

/**
 * Timer maths are timestamp-based: elapsed time is derived from Date.now() and stored start times,
 * so a throttled background tab, a sleeping laptop or a reopened app still shows the correct value.
 */
export const elapsedMs = (t: Pick<RunningTimer, 'startedAt' | 'accumulatedMs'>, now = Date.now()) =>
  t.accumulatedMs + (t.startedAt != null ? Math.max(0, now - t.startedAt) : 0)

export const remainingMs = (t: RunningTimer, now = Date.now()) =>
  t.targetMs == null ? null : Math.max(0, t.targetMs - elapsedMs(t, now))

export const isRunning = (t: RunningTimer) => t.startedAt != null

export function start(t: RunningTimer, now = Date.now()): RunningTimer {
  return t.startedAt != null ? t : { ...t, startedAt: now, completedAt: null }
}

export function pause(t: RunningTimer, now = Date.now()): RunningTimer {
  if (t.startedAt == null) return t
  return { ...t, accumulatedMs: elapsedMs(t, now), startedAt: null }
}

export function reset(t: RunningTimer): RunningTimer {
  return { ...t, accumulatedMs: 0, startedAt: null, laps: [], completedAt: null }
}

export function lap(t: RunningTimer, now = Date.now()): RunningTimer {
  return { ...t, laps: [...t.laps, elapsedMs(t, now)] }
}

/** Lap split durations (each lap minus the previous total). */
export const lapSplits = (laps: number[]) => laps.map((l, i) => l - (i ? laps[i - 1] : 0))

export const isFinished = (t: RunningTimer, now = Date.now()) => t.targetMs != null && elapsedMs(t, now) >= t.targetMs

export interface PomodoroConfig { workMin: number; shortBreakMin: number; longBreakMin: number; longEvery: number }

export function phaseLength(phase: NonNullable<RunningTimer['pomodoro']>['phase'], c: PomodoroConfig) {
  const min = phase === 'work' ? c.workMin : phase === 'short_break' ? c.shortBreakMin : c.longBreakMin
  return Math.round(min * 60_000)
}

/** Advance a pomodoro timer to its next phase (paused, ready to start). */
export function nextPomodoroPhase(t: RunningTimer, c: PomodoroConfig): RunningTimer {
  const pom = t.pomodoro ?? { phase: 'work' as const, completedWork: 0 }
  let next: typeof pom
  if (pom.phase === 'work') {
    const done = pom.completedWork + 1
    next = { completedWork: done, phase: done % Math.max(1, c.longEvery) === 0 ? 'long_break' : 'short_break' }
  } else next = { ...pom, phase: 'work' }
  return { ...t, pomodoro: next, accumulatedMs: 0, startedAt: null, targetMs: phaseLength(next.phase, c), completedAt: null }
}
