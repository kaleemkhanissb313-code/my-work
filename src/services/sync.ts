import { db, type EntityTableName } from '@/lib/db'
import { resolve, type SyncRow } from '@/lib/syncResolve'
import { createStore } from '@/lib/store'
import { uid } from '@/lib/id'
import { supabase } from './supabase'
import { audit } from './audit'
import type { Doc, MediaFile } from '@/types/models'

/** Local table → remote Postgres table (see supabase/migrations). */
export const SYNC_TABLES: Record<EntityTableName, string> = {
  docs: 'docs', folders: 'folders', projects: 'projects', tasks: 'tasks', events: 'events', media: 'media_files',
  bookmarks: 'bookmarks', timerSessions: 'timer_sessions', datasets: 'datasets', records: 'records', habitLogs: 'habit_logs',
  vault: 'vault_items', palettes: 'palettes',
  gxProducts: 'gx_products', gxStock: 'gx_stock_moves', gxOrders: 'gx_orders', gxRefunds: 'gx_refunds', gxPeople: 'gx_people',
  gxPayments: 'gx_payments', gxAdIncome: 'gx_ad_income', gxAdSpend: 'gx_ad_spend', gxExpenses: 'gx_expenses', gxSheets: 'gx_sheets',
  gxReturns: 'gx_returns', gxShipments: 'gx_shipments', gxPartners: 'gx_partners', gxRiderPays: 'gx_rider_payments', npPeople: 'np_people', npPayments: 'np_payments',
}

interface RemoteRow { id: string; data: Record<string, unknown>; updated_at_ms: number; version: number; deleted_at_ms: number | null; server_updated_at: string }

export const syncState = createStore<{ running: boolean; lastSyncAt: number | null; error: string | null; conflicts: number }>({
  running: false, lastSyncAt: null, error: null, conflicts: 0,
})

const cursorKey = (t: string) => `sync.cursor.${t}`
const LAST_SYNC = 'sync.lastSyncAt'

function toRemote(row: SyncRow & Record<string, unknown>, userId: string) {
  const { syncedAt: _s, blob: _b, ...data } = row
  return { id: row.id, user_id: userId, data, updated_at_ms: row.updatedAt, version: row.version, deleted_at_ms: row.deletedAt }
}

/**
 * Two-way sync of every entity table. Requires a signed-in Supabase user; RLS guarantees the user only
 * ever reads/writes their own rows (user_id = auth.uid()). Vault rows are already ciphertext.
 */
export async function syncNow(): Promise<{ pushed: number; pulled: number; conflicts: number }> {
  const sb = supabase()
  if (!sb) throw new Error('Cloud sync is not configured.')
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Sign in to sync.')
  if (syncState.get().running) throw new Error('Sync already in progress.')
  syncState.set((s) => ({ ...s, running: true, error: null }))
  const lastSyncAt = ((await db.kv.get(LAST_SYNC))?.value as number) ?? 0
  const now = Date.now()
  let pushed = 0, pulled = 0, conflicts = 0
  try {
    for (const [local, remote] of Object.entries(SYNC_TABLES) as [EntityTableName, string][]) {
      const table = db.table(local)
      // 1) Pull remote changes since our server-time cursor (server time avoids client clock skew).
      let cursor = ((await db.kv.get(cursorKey(remote)))?.value as string) ?? '1970-01-01T00:00:00Z'
      for (;;) {
        const { data, error } = await sb.from(remote).select('id,data,updated_at_ms,version,deleted_at_ms,server_updated_at')
          .gt('server_updated_at', cursor).order('server_updated_at').limit(500)
        if (error) throw error
        const rows = (data ?? []) as RemoteRow[]
        for (const r of rows) {
          const remoteRow = { ...(r.data as object), id: r.id, updatedAt: r.updated_at_ms, version: r.version, deletedAt: r.deleted_at_ms } as SyncRow & Record<string, unknown>
          const localRow = (await table.get(r.id)) as (SyncRow & Record<string, unknown>) | undefined
          const res = resolve(localRow, remoteRow, lastSyncAt)
          if (res.action === 'pull' || (res.action === 'conflict' && res.winner === 'remote')) {
            if (local === 'media') remoteRow.blob = localRow?.blob ?? (await downloadMedia(user.id, r.id))
            await table.put({ ...remoteRow, syncedAt: now })
            pulled++
          }
          if (res.action === 'conflict') {
            conflicts++
            if (local === 'docs') {
              // Preserve the losing edit as a separate document so nothing is lost.
              const loser = res.loser as unknown as Doc
              await db.docs.add({ ...loser, id: uid(), title: `${loser.title} (conflicted copy)`, syncedAt: null, createdAt: now, updatedAt: now, version: 1 })
            }
            // Local winner stays dirty and will be pushed below.
          }
        }
        if (rows.length) cursor = rows[rows.length - 1].server_updated_at
        if (rows.length < 500) break
      }
      await db.kv.put({ key: cursorKey(remote), value: cursor })

      // 2) Push local dirty rows.
      const dirty = (await table.filter((r: SyncRow) => r.syncedAt == null).toArray()) as (SyncRow & Record<string, unknown>)[]
      if (dirty.length) {
        if (local === 'media') for (const m of dirty as unknown as MediaFile[]) if (!m.deletedAt) await uploadMedia(user.id, m)
        for (let i = 0; i < dirty.length; i += 200) {
          const chunk = dirty.slice(i, i + 200)
          const { error } = await sb.from(remote).upsert(chunk.map((r) => toRemote(r, user.id)))
          if (error) throw error
          await table.bulkPut(chunk.map((r) => ({ ...r, syncedAt: now })))
          pushed += chunk.length
        }
      }
    }
    await db.kv.put({ key: LAST_SYNC, value: now })
    syncState.set({ running: false, lastSyncAt: now, error: null, conflicts })
    await audit('sync', `Synced: ${pushed} pushed, ${pulled} pulled, ${conflicts} conflicts`)
    return { pushed, pulled, conflicts }
  } catch (e) {
    const msg = (e as Error).message || 'Sync failed'
    syncState.set((s) => ({ ...s, running: false, error: msg }))
    throw new Error(msg)
  }
}

async function uploadMedia(userId: string, m: MediaFile) {
  const sb = supabase()!
  // Path prefix = user id; storage policies only allow access to the caller's own folder.
  const { error } = await sb.storage.from('media').upload(`${userId}/${m.id}`, m.blob, { upsert: true, contentType: m.mime })
  if (error) throw error
}

async function downloadMedia(userId: string, id: string): Promise<Blob> {
  const { data, error } = await supabase()!.storage.from('media').download(`${userId}/${id}`)
  if (error || !data) return new Blob([])
  return data
}
