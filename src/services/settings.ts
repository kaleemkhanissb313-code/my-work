import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import type { Settings } from '@/types/models'

export const DASHBOARD_WIDGETS = [
  { id: 'today', label: "Today's tasks" },
  { id: 'work', label: "Today's work priorities" },
  { id: 'home', label: "Today's home tasks" },
  { id: 'overdue', label: 'Overdue tasks' },
  { id: 'events', label: 'Upcoming events' },
  { id: 'deadlines', label: 'Upcoming deadlines' },
  { id: 'projects', label: 'Project progress' },
  { id: 'habits', label: 'Habit completion' },
  { id: 'maintenance', label: 'Home maintenance' },
  { id: 'bills', label: 'Upcoming bills' },
  { id: 'recentDocs', label: 'Recent documents' },
  { id: 'recentMedia', label: 'Recent media' },
  { id: 'links', label: 'Favorite links' },
  { id: 'timer', label: 'Timer & time tracking' },
  { id: 'calc', label: 'Quick calculator' },
  { id: 'chart', label: 'Productivity chart' },
  { id: 'quick', label: 'Quick actions' },
  { id: 'security', label: 'Security status' },
] as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  reduceMotion: false,
  displayName: '',
  hiddenModules: [],
  dashboardWidgets: DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true })),
  pomodoro: { workMin: 25, shortBreakMin: 5, longBreakMin: 15, longEvery: 4 },
  weekStartsOn: 1,
  currency: 'USD',
  lock: { enabled: false, autoLockMins: 5, hideSensitive: true },
  aiEnabled: false,
}

/** Merge stored settings over defaults so new settings keys get sensible values after upgrades. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...stored, pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...stored?.pomodoro }, lock: { ...DEFAULT_SETTINGS.lock, ...stored?.lock } }
  const known = new Set(s.dashboardWidgets.map((w) => w.id))
  s.dashboardWidgets = [...s.dashboardWidgets.filter((w) => DASHBOARD_WIDGETS.some((d) => d.id === w.id)), ...DASHBOARD_WIDGETS.filter((d) => !known.has(d.id)).map((d) => ({ id: d.id, visible: true }))]
  return s
}

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return mergeSettings(row?.value as Partial<Settings> | undefined)
}

export async function updateSettings(patch: Partial<Settings>) {
  const cur = await getSettings()
  await db.kv.put({ key: 'settings', value: { ...cur, ...patch } })
}

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get('settings'), [])
  return mergeSettings(row?.value as Partial<Settings> | undefined)
}
