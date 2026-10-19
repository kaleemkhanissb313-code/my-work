import type { EntityTable, Table } from 'dexie'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import type {
  BaseEntity, Bookmark, CalendarEvent, CollectionKey, Dataset, Doc, Folder, Palette, Project, RecordItem, Task, TimerSession,
} from '@/types/models'
import { localTimeZone } from '@/lib/dates'

export const baseEntity = (): Omit<BaseEntity, 'id'> => {
  const now = Date.now()
  return { createdAt: now, updatedAt: now, deletedAt: null, archived: false, favorite: false, pinned: false, tags: [], version: 1, syncedAt: null }
}

/** Generic repository with soft-delete semantics. Every write bumps updatedAt/version and marks the row dirty for sync. */
export function makeRepo<T extends BaseEntity>(entityTable: EntityTable<T, 'id'>, defaults: () => Omit<T, keyof BaseEntity>) {
  // Every table uses string UUID primary keys; narrow Dexie's generic key type accordingly.
  const table = entityTable as unknown as Table<T, string>
  return {
    table,
    async create(data: Partial<T> = {}): Promise<T> {
      const row = { ...baseEntity(), ...defaults(), ...data, id: data.id ?? uid() } as T
      await table.add(row as never)
      return row
    },
    async update(id: string, patch: Partial<T>): Promise<void> {
      const n = await table.where('id').equals(id).modify((row: T) => {
        Object.assign(row, patch)
        row.updatedAt = Date.now()
        row.version = (row.version ?? 0) + 1
        row.syncedAt = null
      })
      if (n === 0) throw new Error('Item not found — it may have been deleted.')
    },
    get: (id: string) => table.get(id),
    trash(id: string) { return this.update(id, { deletedAt: Date.now() } as Partial<T>) },
    restore(id: string) { return this.update(id, { deletedAt: null } as Partial<T>) },
    /** Permanent deletion — only exposed from Trash with confirmation. */
    purge: (id: string) => table.delete(id),
    async toggle(id: string, key: 'favorite' | 'pinned' | 'archived') {
      const row = await table.get(id)
      if (row) await this.update(id, { [key]: !row[key] } as Partial<T>)
    },
    async duplicate(id: string, rename: (r: T) => Partial<T>): Promise<T | undefined> {
      const row = await table.get(id)
      if (!row) return
      const { id: _id, ...rest } = row
      return this.create({ ...(rest as Partial<T>), ...baseEntity(), tags: [...row.tags], ...rename(row) })
    },
  }
}

export const docsRepo = makeRepo<Doc>(db.docs, () => ({ kind: 'document', title: 'Untitled', description: '', content: '', area: 'personal', isTemplate: false, projectId: null }))
export const foldersRepo = makeRepo<Folder>(db.folders, () => ({ name: 'New folder', scope: 'documents' }))
export const projectsRepo = makeRepo<Project>(db.projects, () => ({
  name: 'Untitled project', description: '', startDate: null, deadline: null, status: 'planning', priority: 'medium', icon: 'Folder', area: 'work', color: '#8b5cf6',
}))
export const tasksRepo = makeRepo<Task>(db.tasks, () => ({
  title: 'New task', description: '', status: 'todo', priority: 'medium', startDate: null, dueDate: null, projectId: null, area: 'personal',
  category: '', subtasks: [], estimateMins: null, actualMins: 0, recurrence: null, completedAt: null, order: Date.now(),
}))
export const eventsRepo = makeRepo<CalendarEvent>(db.events, () => ({
  title: 'New event', start: new Date().toISOString(), end: null, allDay: false, timeZone: localTimeZone(), kind: 'event', area: 'personal',
  location: '', notes: '', recurrence: null, reminderMins: null,
}))
export const bookmarksRepo = makeRepo<Bookmark>(db.bookmarks, () => ({ url: '', title: '', description: '', category: 'General', notes: '', area: 'personal' }))
export const sessionsRepo = makeRepo<TimerSession>(db.timerSessions, () => ({
  label: 'Session', kind: 'tracking', startedAt: Date.now(), endedAt: Date.now(), durationMs: 0, area: 'personal',
}))
export const datasetsRepo = makeRepo<Dataset>(db.datasets, () => ({
  name: 'Untitled dataset', columns: ['Label', 'Value'], rows: [], chart: { type: 'bar', title: '', xKey: 'Label', yKeys: ['Value'] },
}))
export const palettesRepo = makeRepo<Palette>(db.palettes, () => ({ name: 'Palette', colors: [] }))
export const recordsRepo = makeRepo<RecordItem>(db.records, () => ({
  collection: 'chores' as CollectionKey, area: 'home', title: '', done: false, dueDate: null, amount: null, category: '', priority: 'medium', recurrence: null, fields: {},
}))

/** Live-query helper predicate: visible (not trashed, not archived unless requested). */
export const visible = <T extends BaseEntity>(includeArchived = false) => (r: T) => !r.deletedAt && (includeArchived || !r.archived)
