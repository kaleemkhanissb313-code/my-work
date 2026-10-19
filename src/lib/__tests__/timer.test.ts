import { elapsedMs, isFinished, lap, lapSplits, nextPomodoroPhase, pause, remainingMs, reset, start } from '../timer'
import type { RunningTimer } from '@/types/models'

const base: RunningTimer = { id: 't', name: 'T', kind: 'stopwatch', startedAt: null, accumulatedMs: 0, targetMs: null, laps: [], createdAt: 0 }

describe('timestamp-based timers', () => {
  it('measures elapsed time from timestamps, not ticks (survives tab suspension)', () => {
    let t = start(base, 1_000)
    // Simulate the tab being frozen for 10 minutes: no intervals ran, but elapsed is still exact.
    expect(elapsedMs(t, 601_000)).toBe(600_000)
    t = pause(t, 601_000)
    expect(t.startedAt).toBeNull()
    expect(elapsedMs(t, 9_999_999)).toBe(600_000) // paused time does not advance
    t = start(t, 700_000)
    expect(elapsedMs(t, 705_000)).toBe(605_000)
  })

  it('is idempotent for repeated start/pause', () => {
    const t = start(start(base, 100), 500)
    expect(t.startedAt).toBe(100)
    expect(pause(pause(t, 200), 900).accumulatedMs).toBe(100)
  })

  it('records laps and splits', () => {
    let t = start(base, 0)
    t = lap(t, 1_000); t = lap(t, 2_500); t = lap(t, 6_000)
    expect(t.laps).toEqual([1_000, 2_500, 6_000])
    expect(lapSplits(t.laps)).toEqual([1_000, 1_500, 3_500])
    expect(reset(t)).toMatchObject({ laps: [], accumulatedMs: 0, startedAt: null })
  })

  it('computes countdown remaining time and completion', () => {
    const t = start({ ...base, kind: 'countdown', targetMs: 60_000 }, 0)
    expect(remainingMs(t, 15_000)).toBe(45_000)
    expect(isFinished(t, 59_999)).toBe(false)
    expect(isFinished(t, 60_000)).toBe(true)
    expect(remainingMs(t, 120_000)).toBe(0)
  })

  it('cycles pomodoro phases with a long break every N work sessions', () => {
    const cfg = { workMin: 25, shortBreakMin: 5, longBreakMin: 15, longEvery: 2 }
    let t: RunningTimer = { ...base, kind: 'pomodoro', pomodoro: { phase: 'work', completedWork: 0 }, targetMs: 25 * 60_000 }
    t = nextPomodoroPhase(t, cfg)
    expect(t.pomodoro).toEqual({ phase: 'short_break', completedWork: 1 })
    expect(t.targetMs).toBe(5 * 60_000)
    t = nextPomodoroPhase(t, cfg)
    expect(t.pomodoro?.phase).toBe('work')
    t = nextPomodoroPhase(t, cfg)
    expect(t.pomodoro).toEqual({ phase: 'long_break', completedWork: 2 })
    expect(t.targetMs).toBe(15 * 60_000)
    expect(t.startedAt).toBeNull()
  })
})
