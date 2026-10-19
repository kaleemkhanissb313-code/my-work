import { db } from '@/lib/db'
import type { EntityType } from '@/types/models'

export async function trackRecent(type: EntityType, refId: string, title: string, path: string) {
  try {
    await db.recents.put({ id: `${type}:${refId}`, type, refId, title, path, at: Date.now() })
    const n = await db.recents.count()
    if (n > 50) await db.recents.bulkDelete(await db.recents.orderBy('at').limit(n - 50).primaryKeys())
  } catch { /* non-critical */ }
}
