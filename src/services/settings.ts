import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import type { Settings } from '@/types/models'
import { hslToRgb, parseColor, rgbToHsl } from '@/lib/color'

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
  accent: 'teal',
  customAccent: '#0f766e',
  background: { kind: 'default', value: '' },
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
  const s = { ...DEFAULT_SETTINGS, ...stored, background: { ...DEFAULT_SETTINGS.background, ...stored?.background }, pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...stored?.pomodoro }, lock: { ...DEFAULT_SETTINGS.lock, ...stored?.lock } }
  const known = new Set(s.dashboardWidgets.map((w) => w.id))
  s.dashboardWidgets = [...s.dashboardWidgets.filter((w) => DASHBOARD_WIDGETS.some((d) => d.id === w.id)), ...DASHBOARD_WIDGETS.filter((d) => !known.has(d.id)).map((d) => ({ id: d.id, visible: true }))]
  return s
}

/** Accent presets shown in Settings. `swatch` is the button gradient (from → to). */
export const ACCENTS: { id: Exclude<Settings['accent'], 'custom'>; label: string; swatch: [string, string] }[] = [
  { id: 'teal', label: 'Ocean teal', swatch: ['#0f766e', '#0e7490'] },
  { id: 'violet', label: 'Royal violet', swatch: ['#6d28d9', '#1d4ed8'] },
  { id: 'sunset', label: 'Sunset', swatch: ['#c2410c', '#be185d'] },
  { id: 'gold', label: 'Gold', swatch: ['#b45309', '#a16207'] },
]

/** Apply theme + accent to <html>. Used before first paint and whenever settings change. */
export function applyAppearance(s: Pick<Settings, 'theme' | 'accent' | 'reduceMotion'> & Partial<Pick<Settings, 'customAccent' | 'background'>>) {
  const root = document.documentElement
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  root.classList.toggle('reduce-motion', s.reduceMotion)
  root.dataset.accent = s.accent
  // Custom accent: derive text/ring shades per theme and darker button shades (keeps white button text ≥ AA).
  const vars = ['--accent', '--accent2', '--btn-from', '--btn-to']
  const rgb = s.accent === 'custom' && s.customAccent ? parseColor(s.customAccent) : null
  if (rgb) {
    const { h, s: sat } = rgbToHsl(rgb)
    const t = (l: number, dh = 0) => { const c = hslToRgb({ h: h + dh, s: Math.min(sat, 85), l }); return `${c.r} ${c.g} ${c.b}` }
    root.style.setProperty('--accent', t(dark ? 68 : 38)); root.style.setProperty('--accent2', t(dark ? 66 : 36, 28))
    root.style.setProperty('--btn-from', t(34)); root.style.setProperty('--btn-to', t(28, 20))
  } else vars.forEach((v) => root.style.removeProperty(v))
  const bg = s.background
  document.body.style.background = !bg || bg.kind === 'default' || !bg.value ? '' : bg.kind === 'solid' ? bg.value : `${bg.value} fixed`
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1020' : '#f4f5fa')
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
