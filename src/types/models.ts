/** Core data models. Every persisted entity extends BaseEntity so sync, trash and search work uniformly. */
export type ID = string
export type Area = 'personal' | 'work' | 'home' | 'life'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type FieldValue = string | number | boolean | null | string[]

export interface BaseEntity {
  id: ID
  createdAt: number
  updatedAt: number
  /** Soft-delete timestamp. Non-null items live in Trash. */
  deletedAt: number | null
  archived: boolean
  favorite: boolean
  pinned: boolean
  tags: string[]
  color?: string
  folderId?: ID | null
  /** Incremented on every local write; used for conflict detection during sync. */
  version: number
  /** Timestamp of the last successful cloud sync for this row (null = never synced / dirty). */
  syncedAt?: number | null
}

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  /** ISO date (yyyy-mm-dd) after which no more occurrences are produced. */
  until?: string | null
  /** 0 = Sunday … 6 = Saturday. Weekly rules only. */
  byWeekday?: number[]
}

export interface Folder extends BaseEntity {
  name: string
  scope: 'documents' | 'media' | 'links' | 'records'
  icon?: string
}

export interface Doc extends BaseEntity {
  kind: 'document' | 'note'
  title: string
  description: string
  /** HTML produced by the TipTap editor (schema-restricted, so no scripts survive). */
  content: string
  area: Area
  isTemplate: boolean
  projectId?: ID | null
}

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export interface Project extends BaseEntity {
  name: string
  description: string
  startDate: string | null
  deadline: string | null
  status: ProjectStatus
  priority: Priority
  icon: string
  area: Area
  workspaceId?: ID | null
}

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'completed'
export interface Subtask { id: ID; title: string; done: boolean }
export interface Task extends BaseEntity {
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  startDate: string | null
  dueDate: string | null
  projectId: ID | null
  area: Area
  category: string
  subtasks: Subtask[]
  estimateMins: number | null
  actualMins: number
  recurrence: RecurrenceRule | null
  completedAt: number | null
  order: number
  isMilestone?: boolean
}

export type EventKind = 'event' | 'meeting' | 'milestone' | 'birthday' | 'important' | 'reminder'
export interface CalendarEvent extends BaseEntity {
  title: string
  /** Timed events: ISO 8601 instant (UTC, from Date#toISOString). All-day: yyyy-mm-dd. */
  start: string
  end: string | null
  allDay: boolean
  /** IANA zone the event was created in, for display. */
  timeZone: string
  kind: EventKind
  area: Area
  location: string
  notes: string
  recurrence: RecurrenceRule | null
  reminderMins: number | null
  projectId?: ID | null
}

export interface MediaFile extends BaseEntity {
  name: string
  mime: string
  size: number
  blob: Blob
  thumbnail?: string | null
  description: string
}

export interface Bookmark extends BaseEntity {
  url: string
  title: string
  description: string
  category: string
  notes: string
  area: Area
}

export type TimerKind = 'countdown' | 'stopwatch' | 'pomodoro' | 'tracking'
export interface TimerSession extends BaseEntity {
  label: string
  kind: TimerKind
  startedAt: number
  endedAt: number
  durationMs: number
  taskId?: ID | null
  projectId?: ID | null
  area: Area
  billable?: boolean
}

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut'
export interface Dataset extends BaseEntity {
  name: string
  columns: string[]
  rows: (string | number)[][]
  chart: { type: ChartType; title: string; xKey: string; yKeys: string[] }
  /** True for explicitly labelled demonstration data. */
  sample?: boolean
}

export type CollectionKey =
  | 'chores' | 'groceries' | 'maintenance' | 'bills' | 'inventory' | 'contacts'
  | 'workspaces' | 'meetings' | 'invoices' | 'goals' | 'habits' | 'journal'
  | 'reading' | 'trips' | 'packing' | 'fitness' | 'reviews' | 'importantDates'
  | 'expenses' | 'budgets' | 'income'

/** Generic record used for Home / Work / Life / Finance list modules. */
export interface RecordItem extends BaseEntity {
  collection: CollectionKey
  area: Area
  title: string
  done: boolean
  dueDate: string | null
  amount: number | null
  category: string
  priority: Priority
  recurrence: RecurrenceRule | null
  fields: Record<string, FieldValue>
}

export interface HabitLog extends BaseEntity { habitId: ID; date: string; done: boolean }

export interface VaultItem extends BaseEntity {
  /** AES-GCM ciphertext (base64) of JSON {title, body, kind}. Nothing readable is stored in plaintext. */
  ciphertext: string
  iv: string
}

export type AuditType =
  | 'lock' | 'unlock' | 'unlock_failed' | 'pin_set' | 'pin_removed' | 'vault_created' | 'vault_unlocked'
  | 'vault_unlock_failed' | 'vault_locked' | 'backup_exported' | 'backup_imported' | 'sign_in' | 'sign_out'
  | 'settings_changed' | 'mfa_enrolled' | 'sync'
export interface AuditEvent { id: ID; at: number; type: AuditType; detail: string }

export interface Palette extends BaseEntity { name: string; colors: string[] }
export interface CalcHistory { id: ID; at: number; expression: string; result: string; tool: string }
export type EntityType = 'doc' | 'project' | 'task' | 'event' | 'media' | 'bookmark' | 'record' | 'dataset' | 'gx'
export interface CrossLink { id: ID; fromType: EntityType; fromId: ID; toType: EntityType; toId: ID; createdAt: number }
export interface SavedView { id: ID; name: string; path: string; createdAt: number }
export interface RecentItem { id: string; type: EntityType; refId: ID; title: string; path: string; at: number }

export interface RunningTimer {
  id: ID
  name: string
  kind: TimerKind
  /** Epoch ms when the current run segment started; null when paused/stopped. */
  startedAt: number | null
  /** Elapsed ms accumulated across previous run segments. */
  accumulatedMs: number
  /** Countdown / pomodoro phase target in ms. */
  targetMs: number | null
  laps: number[]
  pomodoro?: { phase: 'work' | 'short_break' | 'long_break'; completedWork: number }
  taskId?: ID | null
  /** Set once a countdown/pomodoro phase completion was handled, so it is not re-fired on reload. */
  completedAt?: number | null
  createdAt: number
}

export type AccentName = 'teal' | 'violet' | 'sunset' | 'gold' | 'custom'

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  accent: AccentName
  /** Used when accent === 'custom' (HEX). */
  customAccent: string
  /** App background: default glow, a solid color, or a CSS gradient. */
  background: { kind: 'default' | 'solid' | 'gradient'; value: string }
  reduceMotion: boolean
  displayName: string
  hiddenModules: string[]
  dashboardWidgets: { id: string; visible: boolean }[]
  pomodoro: { workMin: number; shortBreakMin: number; longBreakMin: number; longEvery: number }
  weekStartsOn: 0 | 1
  currency: string
  lock: { enabled: boolean; autoLockMins: number; hideSensitive: boolean }
  aiEnabled: boolean
}
