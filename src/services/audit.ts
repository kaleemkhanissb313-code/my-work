import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import type { AuditType } from '@/types/models'

/** Local security activity log. Never pass secrets, tokens or plaintext vault content as `detail`. */
export async function audit(type: AuditType, detail = '') {
  try {
    await db.audit.add({ id: uid(), at: Date.now(), type, detail: detail.slice(0, 300) })
    const count = await db.audit.count()
    if (count > 1000) {
      const old = await db.audit.orderBy('at').limit(count - 1000).primaryKeys()
      await db.audit.bulkDelete(old)
    }
  } catch {
    /* audit logging must never break the action being logged */
  }
}
