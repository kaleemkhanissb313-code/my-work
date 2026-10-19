import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { sessionsRepo, tasksRepo } from '@/services/repo'
import { getSettings } from '@/services/settings'
import { toast } from '@/components/feedback'
import { elapsedMs, isFinished, nextPomodoroPhase } from '@/lib/timer'
import { fmtDuration } from '@/lib/dates'
import type { Area, ID, RunningTimer } from '@/types/models'

export const POMODORO_ID = 'pomodoro'
export const TRACKING_ID = 'tracking'

/** Extra metadata kept on the single running time-tracking timer (stored alongside RunningTimer in db.timers). */
export interface TrackingMeta { projectId: ID | null; area: Area; billable: boolean }
export type TrackingTimer = RunningTimer & { tracking?: TrackingMeta }

/** Re-render clock. Time values are always derived from timestamps; this only drives repaints. */
export function useNow(active: boolean, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    // Repaint immediately when the tab becomes visible again (intervals are throttled in background tabs).
    const onVis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [active, intervalMs])
  return now
}

/** Short two-tone beep via WebAudio. Silently does nothing if audio is unavailable or blocked. */
export function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const tone = (freq: number, at: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at)
      o.stop(ctx.currentTime + at + 0.4)
    }
    tone(880, 0); tone(660, 0.45); tone(880, 0.9)
    setTimeout(() => void ctx.close().catch(() => undefined), 1800)
  } catch { /* audio unavailable */ }
}

export function notify(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, tag: 'bta-timer' })
  } catch { /* notifications unavailable (e.g. some mobile browsers require a service worker) */ }
}

const LATE_MS = 60_000

async function addTaskMinutes(taskId: ID | null | undefined, ms: number) {
  if (!taskId) return
  const mins = Math.round(ms / 60_000)
  if (mins <= 0) return
  const task = await tasksRepo.get(taskId)
  if (task && !task.deletedAt) await tasksRepo.update(taskId, { actualMins: (task.actualMins ?? 0) + mins })
}

/**
 * Handle finished countdowns and pomodoro phases exactly once. The check-and-set runs in a Dexie transaction, so two
 * open tabs cannot both log the same completion. Alarms only sound while the app is open; completions that happened
 * while it was closed are logged when it is next opened, with a quiet notice instead of a beep.
 */
export async function processFinishedTimers(timers: RunningTimer[], now = Date.now()) {
  for (const t of timers) {
    if (t.completedAt || !isFinished(t, now)) continue
    if (t.kind !== 'countdown' && t.kind !== 'pomodoro') continue
    const target = t.targetMs ?? 0
    // Exact completion instant derived from the stored timestamps.
    const endedAt = t.startedAt != null ? t.startedAt + (target - t.accumulatedMs) : now
    const late = now - endedAt > LATE_MS

    if (t.kind === 'countdown') {
      const claimed = await db.transaction('rw', db.timers, async () => {
        const cur = await db.timers.get(t.id)
        if (!cur || cur.completedAt || !isFinished(cur, now)) return false
        await db.timers.put({ ...cur, startedAt: null, accumulatedMs: target, completedAt: endedAt })
        return true
      })
      if (!claimed) continue
      await sessionsRepo.create({ label: t.name, kind: 'countdown', startedAt: endedAt - target, endedAt, durationMs: target, taskId: t.taskId ?? null, area: 'personal' })
      if (!late) beep()
      toast(late ? `“${t.name}” finished while you were away` : `Time's up: ${t.name}`, late ? 'info' : 'success')
      if (!late) notify("Time's up", `${t.name} (${fmtDuration(target)}) has finished.`)
    } else {
      const settings = await getSettings()
      const phase = t.pomodoro?.phase ?? 'work'
      const claimed = await db.transaction('rw', db.timers, async () => {
        const cur = await db.timers.get(t.id)
        if (!cur || cur.completedAt || !isFinished(cur, now)) return false
        await db.timers.put(nextPomodoroPhase(cur, settings.pomodoro))
        return true
      })
      if (!claimed) continue
      if (phase === 'work') {
        await sessionsRepo.create({ label: t.name || 'Pomodoro', kind: 'pomodoro', startedAt: endedAt - target, endedAt, durationMs: target, taskId: t.taskId ?? null, area: 'work' })
        await addTaskMinutes(t.taskId, target)
      }
      const msg = phase === 'work' ? 'Focus session complete — time for a break' : 'Break over — ready to focus'
      if (!late) { beep(); notify('Pomodoro', msg) }
      toast(late ? `A pomodoro ${phase === 'work' ? 'focus session' : 'break'} finished while you were away` : msg, 'info')
    }
  }
}

/** Log a finished time-tracking run as a TimerSession and add the minutes to the linked task. */
export async function stopTracking(t: TrackingTimer, now = Date.now()) {
  const durationMs = elapsedMs(t, now)
  await db.timers.delete(t.id)
  if (durationMs < 1000) return null
  const meta = t.tracking ?? { projectId: null, area: 'personal' as Area, billable: false }
  const s = await sessionsRepo.create({
    label: t.name || 'Tracked time', kind: 'tracking', startedAt: t.createdAt, endedAt: now, durationMs,
    taskId: t.taskId ?? null, projectId: meta.projectId, area: meta.area, billable: meta.billable,
  })
  await addTaskMinutes(t.taskId, durationMs)
  return s
}

export { addTaskMinutes }

/**
 * Watches running countdown/pomodoro timers and fires their completion once. Safe to mount in several places
 * (e.g. the Time page and, ideally, the app shell): completion is claimed transactionally.
 */
export function useTimerAlarms() {
  const timers = useLiveQuery(() => db.timers.toArray(), [])
  useEffect(() => {
    if (!timers) return
    let busy = false
    const check = () => {
      if (busy) return
      busy = true
      processFinishedTimers(timers).catch((e) => console.error(e)).finally(() => { busy = false })
    }
    check()
    if (!timers.some((t) => t.startedAt != null && t.targetMs != null)) return
    const id = setInterval(check, 500)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check) }
  }, [timers])
}

/** SVG progress ring (0–1). */
export function ProgressRing({ value, size = 180, stroke = 12, children, label }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; label: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--raised))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--accent))" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 300ms linear' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}
