import Dexie, { type EntityTable } from 'dexie'
import type {
  AuditEvent, Bookmark, CalcHistory, CalendarEvent, CrossLink, Dataset, Doc, Folder, HabitLog, MediaFile,
  Palette, Project, RecentItem, RecordItem, RunningTimer, SavedView, Task, TimerSession, VaultItem,
} from '@/types/models'

/** Local-first IndexedDB store. All UI reads go through here; cloud sync mirrors it when configured. */
export class AppDB extends Dexie {
  docs!: EntityTable<Doc, 'id'>
  folders!: EntityTable<Folder, 'id'>
  projects!: EntityTable<Project, 'id'>
  tasks!: EntityTable<Task, 'id'>
  events!: EntityTable<CalendarEvent, 'id'>
  media!: EntityTable<MediaFile, 'id'>
  bookmarks!: EntityTable<Bookmark, 'id'>
  timerSessions!: EntityTable<TimerSession, 'id'>
  datasets!: EntityTable<Dataset, 'id'>
  records!: EntityTable<RecordItem, 'id'>
  habitLogs!: EntityTable<HabitLog, 'id'>
  vault!: EntityTable<VaultItem, 'id'>
  palettes!: EntityTable<Palette, 'id'>
  audit!: EntityTable<AuditEvent, 'id'>
  calcHistory!: EntityTable<CalcHistory, 'id'>
  links!: EntityTable<CrossLink, 'id'>
  savedViews!: EntityTable<SavedView, 'id'>
  recents!: EntityTable<RecentItem, 'id'>
  timers!: EntityTable<RunningTimer, 'id'>
  kv!: EntityTable<{ key: string; value: unknown }, 'key'>

  constructor(name = 'basic-to-advanced') {
    super(name)
    this.version(1).stores({
      docs: 'id, kind, updatedAt, deletedAt, folderId, area',
      folders: 'id, scope, deletedAt',
      projects: 'id, status, updatedAt, deletedAt, area',
      tasks: 'id, status, projectId, dueDate, updatedAt, deletedAt, area',
      events: 'id, start, updatedAt, deletedAt, area',
      media: 'id, mime, updatedAt, deletedAt, folderId',
      bookmarks: 'id, category, updatedAt, deletedAt',
      timerSessions: 'id, startedAt, kind, taskId, projectId, deletedAt',
      datasets: 'id, updatedAt, deletedAt',
      records: 'id, collection, area, dueDate, updatedAt, deletedAt',
      habitLogs: 'id, habitId, date, [habitId+date]',
      vault: 'id, updatedAt, deletedAt',
      palettes: 'id, updatedAt, deletedAt',
      audit: 'id, at, type',
      calcHistory: 'id, at, tool',
      links: 'id, fromId, toId',
      savedViews: 'id, createdAt',
      recents: 'id, at',
      timers: 'id, createdAt',
      kv: 'key',
    })
  }
}

export const db = new AppDB()

/** Tables whose rows extend BaseEntity (trash, sync and backup apply to these). */
export const entityTables = [
  'docs', 'folders', 'projects', 'tasks', 'events', 'media', 'bookmarks', 'timerSessions', 'datasets', 'records', 'habitLogs', 'vault', 'palettes',
] as const
export type EntityTableName = (typeof entityTables)[number]
