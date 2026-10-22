import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell, BarChart3, Briefcase, Clock, Download, Flag, Hourglass, ListChecks, Pause, Pencil, Play, Plus, RotateCcw, Save, SkipForward,
  Square, Timer, Trash2, Watch, X,
} from 'lucide-react'
import { addDays, format, startOfDay, startOfWeek } from 'date-fns'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { sessionsRepo } from '@/services/repo'
import { updateSettings, useSettings } from '@/services/settings'
import { confirm, safeWrite, toast } from '@/components/feedback'
import {
  Badge, Button, Card, CardTitle, Checkbox, EmptyState, Field, IconButton, Input, Modal, PageHeader, Progress, Select, Spinner, Tabs,
} from '@/components/ui'
import { elapsedMs, isFinished, lap, lapSplits, pause, phaseLength, remainingMs, reset, start } from '@/lib/timer'
import { fmtDuration, fmtHours, parseDate, toISODate, todayISO } from '@/lib/dates'
import { AREA_LABEL, AREA_TONE } from '@/lib/format'
import { objectsToCSV } from '@/lib/csv'
import { downloadText } from '@/services/backup'
import { cn } from '@/lib/cn'
import { DataChart } from '@/features/charts/DataChart'
import {
  POMODORO_ID, ProgressRing, TRACKING_ID, addTaskMinutes, stopTracking, useNow, useTimerAlarms, type TrackingTimer,
} from '@/features/tools/timers'
import type { Area, ID, Project, RunningTimer, Task, TimerSession } from '@/types/models'
import { time12 } from '@/lib/time12'

type TabId = 'timers' | 'pomodoro' | 'tracking' | 'history'
const AREAS: Area[] = ['personal', 'work', 'home', 'life']
const PHASE_LABEL = { work: 'Focus', short_break: 'Short break', long_break: 'Long break' } as const

const saveTimer = (t: RunningTimer) => safeWrite(() => db.timers.put(t))

/** Build an epoch timestamp from a local yyyy-MM-dd date and HH:mm time. */
function localStamp(date: string, time: string) {
  const d = parseDate(date)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** Accepts "90" (minutes) or "1:30" (h:mm). Returns minutes or null. */
function parseDurationMins(s: string): number | null {
  const t = s.trim()
  const hm = t.match(/^(\d{1,3}):([0-5]?\d)$/)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

export function TimePage() {
  const [tab, setTab] = useState<TabId>('timers')
  const timers = useLiveQuery(() => db.timers.orderBy('createdAt').toArray(), [])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const anyRunning = !!timers?.some((t) => t.startedAt != null)
  const now = useNow(anyRunning)
  useTimerAlarms()

  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  const askPermission = async () => {
    try { setPerm(await Notification.requestPermission()) } catch { toast('Notifications are not available in this browser', 'warn') }
  }

  const openTasks = useMemo(() => (tasks ?? []).filter((t) => !t.deletedAt && t.status !== 'completed').sort((a, b) => a.title.localeCompare(b.title)), [tasks])
  const liveProjects = useMemo(() => (projects ?? []).filter((p) => !p.deletedAt).sort((a, b) => a.name.localeCompare(b.name)), [projects])

  return (
    <div>
      <PageHeader title="Time" icon={Timer} description="Timers, Pomodoro focus sessions and time tracking."
        actions={perm === 'default' ? <Button icon={Bell} onClick={() => void askPermission()}>Enable notifications</Button>
          : perm === 'granted' ? <Badge tone="ok">Notifications on</Badge> : null} />
      <p className="mb-4 rounded-xl border border-line bg-raised/50 px-3 py-2 text-xs text-muted">
        Timers are timestamp-based, so they keep counting while this tab is in the background or the app is closed.
        Alarms, sounds and notifications only fire while the app is open on this page; a timer that finished while it was closed is logged when you come back.
      </p>
      <Tabs label="Time tools" value={tab} onChange={setTab} tabs={[
        { id: 'timers', label: 'Timers', icon: Watch },
        { id: 'pomodoro', label: 'Pomodoro', icon: Hourglass },
        { id: 'tracking', label: 'Time tracking', icon: Briefcase },
        { id: 'history', label: 'History & summaries', icon: BarChart3 },
      ]} />
      {!timers || !tasks || !projects ? <Spinner /> : (
        <>
          {tab === 'timers' && <TimersTab timers={timers.filter((t) => t.kind === 'stopwatch' || t.kind === 'countdown')} now={now} />}
          {tab === 'pomodoro' && <PomodoroTab timer={timers.find((t) => t.id === POMODORO_ID)} now={now} openTasks={openTasks} />}
          {tab === 'tracking' && <TrackingTab timer={timers.find((t) => t.id === TRACKING_ID) as TrackingTimer | undefined} now={now}
            tasks={tasks} openTasks={openTasks} projects={liveProjects} />}
          {tab === 'history' && <HistoryTab tasks={tasks} projects={liveProjects} />}
        </>
      )}
    </div>
  )
}

/* ============================== Timers ============================== */

function TimersTab({ timers, now }: { timers: RunningTimer[]; now: number }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'stopwatch' | 'countdown'>('countdown')
  const [h, setH] = useState('0'), [m, setM] = useState('5'), [s, setS] = useState('0')
  const [error, setError] = useState<string | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    let targetMs: number | null = null
    if (kind === 'countdown') {
      const parts = [h, m, s].map((v) => (v.trim() === '' ? 0 : Number(v)))
      if (parts.some((v) => !Number.isInteger(v) || v < 0)) { setError('Hours, minutes and seconds must be whole numbers ≥ 0.'); return }
      if (parts[1] > 59 || parts[2] > 59) { setError('Minutes and seconds must be between 0 and 59.'); return }
      targetMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
      if (targetMs <= 0) { setError('Countdown length must be greater than zero.'); return }
      if (parts[0] > 99) { setError('Countdowns can be at most 99 hours.'); return }
    }
    setError(null)
    const label = name.trim() || (kind === 'countdown' ? `Countdown ${fmtDuration(targetMs!)}` : 'Stopwatch')
    const ok = await safeWrite(() => db.timers.add({ id: uid(), name: label.slice(0, 80), kind, startedAt: null, accumulatedMs: 0, targetMs, laps: [], completedAt: null, createdAt: Date.now() }), 'Timer added')
    if (ok !== undefined) setName('')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardTitle icon={Plus}>New timer</CardTitle>
        <form onSubmit={(e) => void add(e)} className="space-y-3" noValidate>
          <Field label="Name" htmlFor="nt-name"><Input id="nt-name" value={name} maxLength={80} placeholder="e.g. Tea, Laundry, Sprint" onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Type" htmlFor="nt-kind">
            <Select id="nt-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="countdown">Countdown</option><option value="stopwatch">Stopwatch</option>
            </Select>
          </Field>
          {kind === 'countdown' && (
            <fieldset>
              <legend className="label">Duration</legend>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Hours" htmlFor="nt-h"><Input id="nt-h" type="number" min={0} max={99} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} /></Field>
                <Field label="Minutes" htmlFor="nt-m"><Input id="nt-m" type="number" min={0} max={59} inputMode="numeric" value={m} onChange={(e) => setM(e.target.value)} /></Field>
                <Field label="Seconds" htmlFor="nt-s"><Input id="nt-s" type="number" min={0} max={59} inputMode="numeric" value={s} onChange={(e) => setS(e.target.value)} /></Field>
              </div>
            </fieldset>
          )}
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
          <Button type="submit" variant="primary" icon={Plus} className="w-full">Add timer</Button>
        </form>
      </Card>
      <div>
        {timers.length === 0 ? (
          <EmptyState icon={Watch} title="No timers yet">Create a countdown or stopwatch. You can run several at once.</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {timers.map((t) => <li key={t.id}><TimerCard t={t} now={now} /></li>)}
          </ul>
        )}
      </div>
    </div>
  )
}

function TimerCard({ t, now }: { t: RunningTimer; now: number }) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(t.name)
  const running = t.startedAt != null
  const finished = t.kind === 'countdown' && (!!t.completedAt || isFinished(t, now))
  const el = elapsedMs(t, now)
  const rem = remainingMs(t, now)
  const display = t.kind === 'countdown' ? fmtDuration(Math.ceil((rem ?? 0) / 1000) * 1000) : fmtDuration(el, true)
  const splits = lapSplits(t.laps)

  const rename = async () => {
    const n = draft.trim()
    if (!n) { toast('Name cannot be empty', 'warn'); return }
    await saveTimer({ ...t, name: n.slice(0, 80) })
    setRenaming(false)
  }
  const remove = async () => {
    if (running && !(await confirm({ title: 'Delete running timer?', body: `“${t.name}” is still running. Delete it?`, danger: true, confirmLabel: 'Delete' }))) return
    await safeWrite(() => db.timers.delete(t.id), 'Timer deleted')
  }

  return (
    <Card className={cn('h-full', finished && 'border-ok/60')}>
      <div className="mb-2 flex items-center gap-2">
        {renaming ? (
          <form className="flex flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); void rename() }}>
            <Input aria-label="Timer name" value={draft} maxLength={80} autoFocus onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setRenaming(false); setDraft(t.name) } }} />
            <IconButton icon={Save} label="Save name" type="submit" />
            <IconButton icon={X} label="Cancel rename" onClick={() => { setRenaming(false); setDraft(t.name) }} />
          </form>
        ) : (
          <>
            <h3 className="min-w-0 flex-1 truncate font-semibold">{t.name}</h3>
            <Badge tone={t.kind === 'countdown' ? 'accent' : 'muted'}>{t.kind === 'countdown' ? 'Countdown' : 'Stopwatch'}</Badge>
            <IconButton icon={Pencil} label={`Rename ${t.name}`} onClick={() => { setDraft(t.name); setRenaming(true) }} />
          </>
        )}
      </div>
      <div className={cn('my-3 text-center font-mono text-4xl font-bold tabular-nums', finished && 'text-ok')} aria-live="off">{display}</div>
      {t.kind === 'countdown' && t.targetMs != null && (
        <div className="mb-3">
          <Progress value={(Math.min(el, t.targetMs) / t.targetMs) * 100} label={`${t.name} progress`} />
          <p className="mt-1 text-center text-xs text-muted">{finished ? 'Finished' : `of ${fmtDuration(t.targetMs)}`}</p>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {!finished && (running
          ? <Button icon={Pause} onClick={() => void saveTimer(pause(t))}>Pause</Button>
          : <Button variant="primary" icon={Play} onClick={() => void saveTimer(start(t))}>{el > 0 ? 'Resume' : 'Start'}</Button>)}
        {t.kind === 'stopwatch' && <Button icon={Flag} disabled={!running} onClick={() => void saveTimer(lap(t))}>Lap</Button>}
        <Button icon={RotateCcw} disabled={el === 0 && !t.completedAt} onClick={() => void saveTimer(reset(t))}>Reset</Button>
        <IconButton icon={Trash2} label={`Delete ${t.name}`} onClick={() => void remove()} />
      </div>
      {t.kind === 'stopwatch' && t.laps.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">Laps for {t.name}</caption>
            <thead className="text-xs text-muted"><tr><th className="px-2 py-1 text-start">Lap</th><th className="px-2 py-1 text-end">Split</th><th className="px-2 py-1 text-end">Total</th></tr></thead>
            <tbody>
              {[...t.laps].map((total, i) => ({ total, i })).reverse().map(({ total, i }) => (
                <tr key={i} className="border-t border-line/60 tabular-nums"><td className="px-2 py-1">#{i + 1}</td><td className="px-2 py-1 text-end font-mono">{fmtDuration(splits[i], true)}</td><td className="px-2 py-1 text-end font-mono text-muted">{fmtDuration(total, true)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/* ============================== Pomodoro ============================== */

function PomodoroTab({ timer, now, openTasks }: { timer: RunningTimer | undefined; now: number; openTasks: Task[] }) {
  const settings = useSettings()
  const cfg = settings.pomodoro
  const [taskId, setTaskId] = useState<string>(timer?.taskId ?? '')
  const pom = timer?.pomodoro ?? { phase: 'work' as const, completedWork: 0 }
  const target = timer?.targetMs ?? phaseLength('work', cfg)
  const el = timer ? elapsedMs(timer, now) : 0
  const rem = Math.max(0, target - el)
  const running = timer?.startedAt != null

  const fresh = (): RunningTimer => {
    const task = openTasks.find((t) => t.id === taskId)
    return {
      id: POMODORO_ID, name: task ? `Pomodoro — ${task.title}` : 'Pomodoro', kind: 'pomodoro', startedAt: null, accumulatedMs: 0,
      targetMs: phaseLength('work', cfg), laps: [], pomodoro: { phase: 'work', completedWork: 0 }, taskId: task?.id ?? null, completedAt: null, createdAt: Date.now(),
    }
  }
  const linkTask = (id: string) => {
    setTaskId(id)
    if (timer) {
      const task = openTasks.find((t) => t.id === id)
      void saveTimer({ ...timer, taskId: task?.id ?? null, name: task ? `Pomodoro — ${task.title}` : 'Pomodoro' })
    }
  }
  const skip = () => {
    if (!timer) return
    // Skipping does not count a focus phase as completed and logs no session.
    const nextPhase = pom.phase === 'work' ? 'short_break' : 'work'
    void saveTimer({ ...timer, pomodoro: { ...pom, phase: nextPhase }, accumulatedMs: 0, startedAt: null, targetMs: phaseLength(nextPhase, cfg), completedAt: null })
  }
  const resetCycle = async () => {
    if (!(await confirm({ title: 'Reset Pomodoro cycle?', body: 'The cycle count and current phase are reset. Logged sessions are kept.' }))) return
    await safeWrite(() => db.timers.put({ ...fresh(), taskId: timer?.taskId ?? null, name: timer?.name ?? 'Pomodoro' }))
  }

  const linkedTitle = openTasks.find((t) => t.id === (timer?.taskId ?? taskId))?.title
  const cycleIndex = (pom.completedWork % Math.max(1, cfg.longEvery)) + (pom.phase === 'work' ? 1 : 0)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="flex flex-col items-center gap-4 py-6">
        <Badge tone={pom.phase === 'work' ? 'accent' : 'ok'}>{PHASE_LABEL[pom.phase]}</Badge>
        <ProgressRing value={target ? el / target : 0} size={220} label={`${PHASE_LABEL[pom.phase]} progress`}>
          <div>
            <div className="font-mono text-4xl font-bold tabular-nums">{fmtDuration(Math.ceil(rem / 1000) * 1000)}</div>
            <div className="text-xs text-muted">{PHASE_LABEL[pom.phase]} · {fmtDuration(target)}</div>
          </div>
        </ProgressRing>
        <p className="text-sm text-muted">
          Completed focus sessions: <span className="font-semibold text-fg">{pom.completedWork}</span> · Cycle {Math.min(cycleIndex, cfg.longEvery) || cfg.longEvery} of {cfg.longEvery}
        </p>
        {linkedTitle && <p className="text-xs text-muted">Linked task: <span className="text-fg">{linkedTitle}</span></p>}
        <div className="flex flex-wrap justify-center gap-2">
          {running
            ? <Button icon={Pause} onClick={() => timer && void saveTimer(pause(timer))}>Pause</Button>
            : <Button variant="primary" icon={Play} onClick={() => void saveTimer(start(timer ?? fresh()))}>{el > 0 ? 'Resume' : `Start ${PHASE_LABEL[pom.phase].toLowerCase()}`}</Button>}
          <Button icon={RotateCcw} disabled={!timer || el === 0} onClick={() => timer && void saveTimer({ ...timer, accumulatedMs: 0, startedAt: null, completedAt: null })}>Restart phase</Button>
          <Button icon={SkipForward} disabled={!timer} onClick={skip}>Skip phase</Button>
          <Button variant="ghost" disabled={!timer} onClick={() => void resetCycle()}>Reset cycle</Button>
        </div>
        <div className="w-full max-w-sm">
          <Field label="Link focus sessions to a task (optional)" htmlFor="pom-task" hint="Completed focus sessions are logged to History and added to the task's actual time.">
            <Select id="pom-task" value={timer?.taskId ?? taskId} onChange={(e) => linkTask(e.target.value)}>
              <option value="">No task</option>
              {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </Select>
          </Field>
        </div>
      </Card>
      <PomodoroSettings timer={timer} />
    </div>
  )
}

function PomodoroSettings({ timer }: { timer: RunningTimer | undefined }) {
  const { pomodoro } = useSettings()
  const [form, setForm] = useState({ workMin: String(pomodoro.workMin), shortBreakMin: String(pomodoro.shortBreakMin), longBreakMin: String(pomodoro.longBreakMin), longEvery: String(pomodoro.longEvery) })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fields = [
    { k: 'workMin', label: 'Focus length (minutes)' },
    { k: 'shortBreakMin', label: 'Short break (minutes)' },
    { k: 'longBreakMin', label: 'Long break (minutes)' },
    { k: 'longEvery', label: 'Long break after N focus sessions' },
  ] as const

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const vals: Record<string, number> = {}
    for (const f of fields) {
      const v = Number(form[f.k])
      const [lo, hi] = f.k === 'longEvery' ? [1, 12] : [1, 180]
      if (!form[f.k].trim() || !Number.isFinite(v) || v < lo || v > hi || (f.k === 'longEvery' && !Number.isInteger(v))) errs[f.k] = f.k === 'longEvery' ? 'Enter a whole number from 1 to 12.' : 'Enter a number from 1 to 180.'
      vals[f.k] = v
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    const next = { workMin: vals.workMin, shortBreakMin: vals.shortBreakMin, longBreakMin: vals.longBreakMin, longEvery: vals.longEvery }
    await safeWrite(async () => {
      await updateSettings({ pomodoro: next })
      // Apply new lengths to an idle (not started) phase immediately.
      if (timer && timer.startedAt == null && timer.accumulatedMs === 0) await db.timers.put({ ...timer, targetMs: phaseLength(timer.pomodoro?.phase ?? 'work', next) })
    }, 'Pomodoro settings saved')
  }

  return (
    <Card>
      <CardTitle icon={Clock}>Pomodoro settings</CardTitle>
      <form className="space-y-3" onSubmit={(e) => void save(e)} noValidate>
        {fields.map((f) => (
          <Field key={f.k} label={f.label} htmlFor={`pom-${f.k}`} error={errors[f.k]}>
            <Input id={`pom-${f.k}`} type="number" inputMode="decimal" min={1} max={f.k === 'longEvery' ? 12 : 180} value={form[f.k]}
              onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
          </Field>
        ))}
        <Button type="submit" variant="primary" icon={Save}>Save settings</Button>
        <p className="text-xs text-muted">Changes apply to the next phase (or the current one if it hasn't started).</p>
      </form>
    </Card>
  )
}

/* ============================== Tracking ============================== */

function TaskProjectFields({ idPrefix, taskId, projectId, area, onChange, tasks, projects }: {
  idPrefix: string; taskId: string; projectId: string; area: Area; tasks: Task[]; projects: Project[]
  onChange: (p: { taskId?: string; projectId?: string; area?: Area }) => void
}) {
  return (
    <>
      <Field label="Task (optional)" htmlFor={`${idPrefix}-task`}>
        <Select id={`${idPrefix}-task`} value={taskId} onChange={(e) => {
          const t = tasks.find((x) => x.id === e.target.value)
          onChange(t ? { taskId: t.id, projectId: t.projectId ?? projectId, area: t.area } : { taskId: '' })
        }}>
          <option value="">No task</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </Select>
      </Field>
      <Field label="Project (optional)" htmlFor={`${idPrefix}-project`}>
        <Select id={`${idPrefix}-project`} value={projectId} onChange={(e) => {
          const p = projects.find((x) => x.id === e.target.value)
          onChange({ projectId: e.target.value, ...(p ? { area: p.area } : {}) })
        }}>
          <option value="">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Area" htmlFor={`${idPrefix}-area`}>
        <Select id={`${idPrefix}-area`} value={area} onChange={(e) => onChange({ area: e.target.value as Area })}>
          {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
        </Select>
      </Field>
    </>
  )
}

function TrackingTab({ timer, now, tasks, openTasks, projects }: { timer: TrackingTimer | undefined; now: number; tasks: Task[]; openTasks: Task[]; projects: Project[] }) {
  const [label, setLabel] = useState('')
  const [link, setLink] = useState({ taskId: '', projectId: '', area: 'work' as Area })
  const [billable, setBillable] = useState(false)
  const [stopping, setStopping] = useState(false)
  const taskTitle = (id?: ID | null) => tasks.find((t) => t.id === id)?.title
  const projectName = (id?: ID | null) => projects.find((p) => p.id === id)?.name

  const startTracking = async () => {
    const t = openTasks.find((x) => x.id === link.taskId)
    const row: TrackingTimer = {
      id: TRACKING_ID, name: (label.trim() || t?.title || 'Tracked time').slice(0, 120), kind: 'tracking', startedAt: Date.now(), accumulatedMs: 0, targetMs: null,
      laps: [], taskId: t?.id ?? null, completedAt: null, createdAt: Date.now(), tracking: { projectId: link.projectId || null, area: link.area, billable },
    }
    await safeWrite(() => db.timers.put(row), 'Tracking started')
  }
  const stop = async () => {
    if (!timer) return
    setStopping(true)
    const s = await safeWrite(() => stopTracking(timer))
    setStopping(false)
    if (s) toast(`Logged ${fmtDuration(s.durationMs)} — ${s.label}`)
    else if (s === null) toast('Less than a second tracked — nothing logged', 'info')
  }
  const discard = async () => {
    if (!timer || !(await confirm({ title: 'Discard tracked time?', body: 'The running timer is removed without logging a session.', danger: true, confirmLabel: 'Discard' }))) return
    await safeWrite(() => db.timers.delete(TRACKING_ID), 'Tracking discarded')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle icon={Briefcase}>Track time</CardTitle>
        {timer ? (
          <div className="space-y-3">
            <div className="text-center">
              <div className="font-mono text-5xl font-bold tabular-nums">{fmtDuration(elapsedMs(timer, now))}</div>
              <div className="mt-1 font-medium">{timer.name}</div>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-xs">
                {timer.tracking && <Badge tone={AREA_TONE[timer.tracking.area]}>{AREA_LABEL[timer.tracking.area]}</Badge>}
                {taskTitle(timer.taskId) && <Badge>Task: {taskTitle(timer.taskId)}</Badge>}
                {projectName(timer.tracking?.projectId) && <Badge>Project: {projectName(timer.tracking?.projectId)}</Badge>}
                {timer.tracking?.billable && <Badge tone="ok">Billable</Badge>}
                {timer.startedAt == null && <Badge tone="warn">Paused</Badge>}
              </div>
              <p className="mt-2 text-xs text-muted">Started {format(timer.createdAt, 'PPp')}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {timer.startedAt != null
                ? <Button icon={Pause} onClick={() => void saveTimer(pause(timer))}>Pause</Button>
                : <Button icon={Play} onClick={() => void saveTimer(start(timer))}>Resume</Button>}
              <Button variant="primary" icon={Square} loading={stopping} onClick={() => void stop()}>Stop & save</Button>
              <Button variant="ghost" icon={X} onClick={() => void discard()}>Discard</Button>
            </div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void startTracking() }}>
            <Field label="What are you working on?" htmlFor="tr-label"><Input id="tr-label" value={label} maxLength={120} placeholder="e.g. Client call, Writing report" onChange={(e) => setLabel(e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <TaskProjectFields idPrefix="tr" {...link} tasks={openTasks} projects={projects} onChange={(p) => setLink({ ...link, ...p })} />
            </div>
            <Checkbox label="Billable" checked={billable} onChange={setBillable} />
            <Button type="submit" variant="primary" icon={Play}>Start tracking</Button>
            <p className="text-xs text-muted">When you stop, a session is logged and its minutes are added to the task's actual time.</p>
          </form>
        )}
      </Card>
      <ManualEntry tasks={openTasks} projects={projects} />
    </div>
  )
}

function ManualEntry({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const blank = () => ({ date: todayISO(), time: format(new Date(Date.now() - 3_600_000), 'HH:mm'), duration: '60', label: '', taskId: '', projectId: '', area: 'work' as Area, billable: false })
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errs.date = 'Choose a date.'
    if (!/^\d{2}:\d{2}$/.test(f.time)) errs.time = 'Choose a start time.'
    const mins = parseDurationMins(f.duration)
    if (mins == null || mins <= 0) errs.duration = 'Enter minutes (e.g. 45) or h:mm (e.g. 1:30).'
    else if (mins > 24 * 60) errs.duration = 'A single entry can be at most 24 hours.'
    const task = tasks.find((t) => t.id === f.taskId)
    if (!f.label.trim() && !task) errs.label = 'Add a label or pick a task.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const startedAt = localStamp(f.date, f.time)
    const durationMs = Math.round(mins! * 60_000)
    if (startedAt > Date.now()) { setErrors({ time: 'Start time is in the future.' }); return }
    setSaving(true)
    const ok = await safeWrite(async () => {
      await sessionsRepo.create({
        label: (f.label.trim() || task!.title).slice(0, 120), kind: 'tracking', startedAt, endedAt: startedAt + durationMs, durationMs,
        taskId: task?.id ?? null, projectId: f.projectId || null, area: f.area, billable: f.billable,
      })
      await addTaskMinutes(task?.id, durationMs)
      return true
    }, 'Time entry added')
    setSaving(false)
    if (ok) setF({ ...blank(), area: f.area, projectId: f.projectId })
  }

  return (
    <Card>
      <CardTitle icon={Plus}>Add time manually</CardTitle>
      <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" htmlFor="me-date" error={errors.date}><Input id="me-date" type="date" max={todayISO()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Start time" htmlFor="me-time" error={errors.time}><Input id="me-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          <Field label="Duration" htmlFor="me-dur" error={errors.duration} hint="Minutes or h:mm"><Input id="me-dur" value={f.duration} inputMode="numeric" onChange={(e) => setF({ ...f, duration: e.target.value })} /></Field>
        </div>
        <Field label="Label" htmlFor="me-label" error={errors.label}><Input id="me-label" value={f.label} maxLength={120} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <TaskProjectFields idPrefix="me" taskId={f.taskId} projectId={f.projectId} area={f.area} tasks={tasks} projects={projects} onChange={(p) => setF({ ...f, ...p })} />
        </div>
        <Checkbox label="Billable" checked={f.billable} onChange={(v) => setF({ ...f, billable: v })} />
        <Button type="submit" variant="primary" icon={Plus} loading={saving}>Add entry</Button>
      </form>
    </Card>
  )
}

/* ============================== History ============================== */

function HistoryTab({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const settings = useSettings()
  const sessions = useLiveQuery(() => db.timerSessions.orderBy('startedAt').reverse().toArray(), [])
  const [from, setFrom] = useState(() => toISODate(addDays(new Date(), -29)))
  const [to, setTo] = useState(todayISO)
  const [area, setArea] = useState<Area | ''>('')
  const [projectId, setProjectId] = useState('')
  const [editing, setEditing] = useState<TimerSession | null>(null)
  const projectName = (id?: ID | null) => (id ? projects.find((p) => p.id === id)?.name ?? 'Deleted project' : 'No project')
  const taskTitle = (id?: ID | null) => (id ? tasks.find((t) => t.id === id)?.title : undefined)

  const live = useMemo(() => (sessions ?? []).filter((s) => !s.deletedAt), [sessions])
  const rangeError = from && to && from > to ? 'Start date is after end date.' : null
  const filtered = useMemo(() => {
    if (rangeError) return []
    const lo = from ? parseDate(from).getTime() : -Infinity
    const hi = to ? addDays(parseDate(to), 1).getTime() : Infinity
    return live.filter((s) => s.startedAt >= lo && s.startedAt < hi && (!area || s.area === area) && (!projectId || (projectId === '__none' ? !s.projectId : s.projectId === projectId)))
  }, [live, from, to, area, projectId, rangeError])
  const filteredTotal = filtered.reduce((a, s) => a + s.durationMs, 0)

  // Summaries (independent of filters): last 7 days and this week.
  const last7 = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => startOfDay(addDays(new Date(), i - 6)))
    return days.map((d) => {
      const lo = d.getTime(), hi = addDays(d, 1).getTime()
      const ms = live.filter((s) => s.startedAt >= lo && s.startedAt < hi).reduce((a, s) => a + s.durationMs, 0)
      return { Day: format(d, 'EEE d'), Hours: Math.round((ms / 3_600_000) * 100) / 100 }
    })
  }, [live])
  const week = useMemo(() => {
    const ws = startOfWeek(new Date(), { weekStartsOn: settings.weekStartsOn }).getTime()
    const inWeek = live.filter((s) => s.startedAt >= ws)
    const by = (key: (s: TimerSession) => string) => {
      const m = new Map<string, number>()
      inWeek.forEach((s) => m.set(key(s), (m.get(key(s)) ?? 0) + s.durationMs))
      return [...m].sort((a, b) => b[1] - a[1])
    }
    return { total: inWeek.reduce((a, s) => a + s.durationMs, 0), byProject: by((s) => projectName(s.projectId)), byArea: by((s) => AREA_LABEL[s.area]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, settings.weekStartsOn, projects])

  const exportCsv = () => {
    downloadText(objectsToCSV(filtered, [
      { key: (s) => format(s.startedAt, 'yyyy-MM-dd'), label: 'Date' },
      { key: (s) => time12(s.startedAt), label: 'Start' },
      { key: (s) => time12(s.endedAt), label: 'End' },
      { key: (s) => (s.durationMs / 60_000).toFixed(1), label: 'Minutes' },
      { key: 'label', label: 'Label' },
      { key: 'kind', label: 'Type' },
      { key: (s) => AREA_LABEL[s.area], label: 'Area' },
      { key: (s) => (s.projectId ? projectName(s.projectId) : ''), label: 'Project' },
      { key: (s) => taskTitle(s.taskId) ?? '', label: 'Task' },
      { key: (s) => (s.billable ? 'yes' : 'no'), label: 'Billable' },
    ]), `time-sessions-${from || 'all'}-to-${to || 'now'}.csv`, 'text/csv;charset=utf-8')
  }
  const trash = async (s: TimerSession) => {
    const ok = await safeWrite(() => sessionsRepo.trash(s.id))
    if (ok !== undefined) toast('Session moved to trash', 'success', { label: 'Undo', run: () => void safeWrite(() => sessionsRepo.restore(s.id)) })
  }

  if (!sessions) return <Spinner />
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardTitle icon={BarChart3}>Daily totals — last 7 days</CardTitle>
          {live.length === 0 ? <p className="text-sm text-muted">No sessions logged yet.</p>
            : <DataChart type="bar" data={last7} xKey="Day" yKeys={['Hours']} showLegend={false} height={240} valueFormatter={(v) => `${v} h`} ariaLabel="Hours tracked per day for the last 7 days" />}
        </Card>
        <Card>
          <CardTitle icon={ListChecks}>This week · {fmtHours(week.total)}</CardTitle>
          {week.total === 0 ? <p className="text-sm text-muted">Nothing tracked this week yet.</p> : (
            <div className="space-y-4 text-sm">
              {[{ title: 'By project', rows: week.byProject }, { title: 'By area', rows: week.byArea }].map((g) => (
                <div key={g.title}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
                  <ul className="space-y-1.5">
                    {g.rows.map(([name, ms]) => (
                      <li key={name}>
                        <div className="flex justify-between gap-2"><span className="truncate">{name}</span><span className="tabular-nums text-muted">{fmtHours(ms)}</span></div>
                        <Progress value={(ms / week.total) * 100} label={`${name} share of week`} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="From" htmlFor="h-from" error={rangeError}><Input id="h-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="h-to"><Input id="h-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Area" htmlFor="h-area">
            <Select id="h-area" value={area} onChange={(e) => setArea(e.target.value as Area | '')}>
              <option value="">All areas</option>{AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
            </Select>
          </Field>
          <Field label="Project" htmlFor="h-project">
            <Select id="h-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option><option value="__none">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className="ms-auto flex items-center gap-2">
            <span className="text-sm text-muted">{filtered.length} sessions · <span className="font-semibold text-fg">{fmtHours(filteredTotal)}</span></span>
            <Button icon={Download} disabled={!filtered.length} onClick={exportCsv}>Export CSV</Button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={Clock} title={live.length ? 'No sessions match these filters' : 'No time logged yet'}>
            {live.length ? 'Widen the date range or clear the filters.' : 'Finish a countdown, complete a Pomodoro, or track time to see sessions here.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line/60">
            {filtered.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.label}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{format(s.startedAt, 'EEE, MMM d')} · {time12(s.startedAt)}–{time12(s.endedAt)}</span>
                    <Badge tone={AREA_TONE[s.area]}>{AREA_LABEL[s.area]}</Badge>
                    <Badge>{s.kind}</Badge>
                    {s.projectId && <Badge>{projectName(s.projectId)}</Badge>}
                    {taskTitle(s.taskId) && <span>Task: {taskTitle(s.taskId)}</span>}
                    {s.billable && <Badge tone="ok">Billable</Badge>}
                  </div>
                </div>
                <div className="font-mono tabular-nums">{fmtDuration(s.durationMs)}</div>
                <div className="flex">
                  <IconButton icon={Pencil} label={`Edit ${s.label}`} onClick={() => setEditing(s)} />
                  <IconButton icon={Trash2} label={`Move ${s.label} to trash`} onClick={() => void trash(s)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <SessionEditor key={editing.id} session={editing} tasks={tasks.filter((t) => !t.deletedAt)} projects={projects} onClose={() => setEditing(null)} />}
    </div>
  )
}

function SessionEditor({ session, tasks, projects, onClose }: { session: TimerSession; tasks: Task[]; projects: Project[]; onClose: () => void }) {
  const [f, setF] = useState({
    label: session.label, date: format(session.startedAt, 'yyyy-MM-dd'), time: format(session.startedAt, 'HH:mm'),
    duration: String(Math.round(session.durationMs / 60_000)), taskId: session.taskId ?? '', projectId: session.projectId ?? '', area: session.area, billable: !!session.billable,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = async () => {
    const errs: Record<string, string> = {}
    if (!f.label.trim()) errs.label = 'Label is required.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errs.date = 'Choose a date.'
    if (!/^\d{2}:\d{2}$/.test(f.time)) errs.time = 'Choose a start time.'
    const mins = parseDurationMins(f.duration)
    if (mins == null || mins <= 0 || mins > 24 * 60) errs.duration = 'Enter 1–1440 minutes or h:mm.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const startedAt = localStamp(f.date, f.time)
    // Keep second-level precision when the rounded minute value was not changed.
    const durationMs = mins === Math.round(session.durationMs / 60_000) ? session.durationMs : Math.round(mins! * 60_000)
    const ok = await safeWrite(() => sessionsRepo.update(session.id, {
      label: f.label.trim().slice(0, 120), startedAt, endedAt: startedAt + durationMs, durationMs,
      taskId: f.taskId || null, projectId: f.projectId || null, area: f.area, billable: f.billable,
    }), 'Session updated')
    if (ok !== undefined) onClose()
  }
  return (
    <Modal open onClose={onClose} title="Edit session" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Save} onClick={() => void save()}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Label" htmlFor="se-label" error={errors.label}><Input id="se-label" value={f.label} maxLength={120} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" htmlFor="se-date" error={errors.date}><Input id="se-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Start time" htmlFor="se-time" error={errors.time}><Input id="se-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          <Field label="Duration (min or h:mm)" htmlFor="se-dur" error={errors.duration}><Input id="se-dur" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <TaskProjectFields idPrefix="se" taskId={f.taskId} projectId={f.projectId} area={f.area} tasks={tasks} projects={projects} onChange={(p) => setF({ ...f, ...p })} />
        </div>
        <Checkbox label="Billable" checked={f.billable} onChange={(v) => setF({ ...f, billable: v })} />
        <p className="text-xs text-muted">Editing a session does not change the linked task's recorded actual time.</p>
      </div>
    </Modal>
  )
}
