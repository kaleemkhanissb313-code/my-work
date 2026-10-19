import Dexie, { type EntityTable } from 'dexie'
import type {
  AuditEvent, Bookmark, CalcHistory, CalendarEvent, CrossLink, Dataset, Doc, Folder, HabitLog, MediaFile,
  Palette, Project, RecentItem, RecordItem, RunningTimer, SavedView, Task, TimerSession, VaultItem,
} from '@/types/models'
import type {
  GxAdIncome, GxAdSpend, GxAuditEvent, GxExpense, GxOrder, GxPayment, GxPerson, GxProduct, GxRefund, GxStockMove,
} from '@/features/glamiex/types'
import type { GxSheet } from '@/features/sheets/types'
import type { GxPartner, GxReturn, GxRiderPayment, GxShipment, NpPayment, NpPerson } from '@/features/glamiex/logisticsTypes'

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
  // GLAMIEX (sales & finance module)
  gxProducts!: EntityTable<GxProduct, 'id'>
  gxStock!: EntityTable<GxStockMove, 'id'>
  gxOrders!: EntityTable<GxOrder, 'id'>
  gxRefunds!: EntityTable<GxRefund, 'id'>
  gxPeople!: EntityTable<GxPerson, 'id'>
  gxPayments!: EntityTable<GxPayment, 'id'>
  gxAdIncome!: EntityTable<GxAdIncome, 'id'>
  gxAdSpend!: EntityTable<GxAdSpend, 'id'>
  gxExpenses!: EntityTable<GxExpense, 'id'>
  gxAudit!: EntityTable<GxAuditEvent, 'id'>
  gxSheets!: EntityTable<GxSheet, 'id'>
  gxReturns!: EntityTable<GxReturn, 'id'>
  gxShipments!: EntityTable<GxShipment, 'id'>
  gxPartners!: EntityTable<GxPartner, 'id'>
  gxRiderPays!: EntityTable<GxRiderPayment, 'id'>
  npPeople!: EntityTable<NpPerson, 'id'>
  npPayments!: EntityTable<NpPayment, 'id'>

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
    // v2: GLAMIEX. Unique indexes (&) on SKU / order no. / transaction no. block duplicate submissions.
    this.version(2).stores({
      gxProducts: 'id, &sku, category, status, updatedAt, deletedAt',
      gxStock: 'id, productId, refId, at',
      gxOrders: 'id, &orderNo, personId, at, status, updatedAt, deletedAt',
      gxRefunds: 'id, orderId, at',
      gxPeople: 'id, type, name, updatedAt, deletedAt',
      gxPayments: 'id, &txnNo, personId, type, at, updatedAt',
      gxAdIncome: 'id, reportDate, platform, deletedAt',
      gxAdSpend: 'id, start, platform, deletedAt',
      gxExpenses: 'id, date, category, deletedAt',
      gxAudit: 'id, at, entity, entityId',
    })
    // v3: GLAMIEX Overall Sheets (user-created spreadsheets)
    this.version(3).stores({ gxSheets: 'id, order, updatedAt, deletedAt' })
    // v4: returns, deliveries, delivery partners & rider settlements; Names & Payments. Additive only — existing data is untouched.
    this.version(4).stores({
      gxReturns: 'id, &returnNo, orderId, productId, status, at, pickupPartnerId, deletedAt',
      gxShipments: 'id, &shipmentNo, orderId, partnerId, status, finalAt, deletedAt',
      gxPartners: 'id, name, status, deletedAt',
      gxRiderPays: 'id, &settlementNo, partnerId, at',
      npPeople: 'id, name, deletedAt',
      npPayments: 'id, &receiptNo, personId, at',
    })
  }
}

export const db = new AppDB()

/** Tables whose rows extend BaseEntity (trash, sync and backup apply to these). */
export const entityTables = [
  'docs', 'folders', 'projects', 'tasks', 'events', 'media', 'bookmarks', 'timerSessions', 'datasets', 'records', 'habitLogs', 'vault', 'palettes',
  'gxProducts', 'gxStock', 'gxOrders', 'gxRefunds', 'gxPeople', 'gxPayments', 'gxAdIncome', 'gxAdSpend', 'gxExpenses', 'gxSheets',
  'gxReturns', 'gxShipments', 'gxPartners', 'gxRiderPays', 'npPeople', 'npPayments',
] as const
export type EntityTableName = (typeof entityTables)[number]
