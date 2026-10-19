/**
 * Offline / concurrent-edit conflict resolution (pure, unit-tested).
 *
 * Each row carries `updatedAt` and `version`; local rows also carry `syncedAt` (null = changed locally since last sync).
 * Strategy:
 *  - Only local changed            → push local.
 *  - Only remote changed           → pull remote.
 *  - Both changed since last sync  → CONFLICT: last-write-wins on updatedAt (tie → higher version, then remote),
 *                                     and for documents/notes the losing side is preserved as a "conflicted copy"
 *                                     so no edit is silently discarded.
 *  - Deletions are soft (deletedAt), so they merge through the same rules.
 */
export interface SyncRow { id: string; updatedAt: number; version: number; deletedAt: number | null; syncedAt?: number | null }

export type Resolution<T> =
  | { action: 'none' }
  | { action: 'push'; row: T }
  | { action: 'pull'; row: T }
  | { action: 'conflict'; winner: 'local' | 'remote'; row: T; loser: T }

export function resolve<T extends SyncRow>(local: T | undefined, remote: T | undefined, lastSyncAt: number): Resolution<T> {
  if (!local && !remote) return { action: 'none' }
  if (local && !remote) return local.syncedAt == null ? { action: 'push', row: local } : { action: 'none' }
  if (!local && remote) return { action: 'pull', row: remote }
  const l = local!, r = remote!
  const localDirty = l.syncedAt == null
  const remoteChanged = r.updatedAt > lastSyncAt && (r.updatedAt !== l.updatedAt || r.version !== l.version)
  if (!localDirty && !remoteChanged) return { action: 'none' }
  if (localDirty && !remoteChanged) return { action: 'push', row: l }
  if (!localDirty && remoteChanged) return { action: 'pull', row: r }
  // Both sides changed.
  if (l.updatedAt === r.updatedAt && l.version === r.version) return { action: 'push', row: l }
  const localWins = l.updatedAt > r.updatedAt || (l.updatedAt === r.updatedAt && l.version > r.version)
  return localWins ? { action: 'conflict', winner: 'local', row: l, loser: r } : { action: 'conflict', winner: 'remote', row: r, loser: l }
}
