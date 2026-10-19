import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { baseEntity } from '@/services/repo'

/** Upsert a habit check-in for a date, keyed by the [habitId+date] index. */
export async function setHabitDone(habitId: string, date: string, done: boolean) {
  await db.transaction('rw', db.habitLogs, async () => {
    const existing = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).first()
    if (existing) {
      await db.habitLogs.update(existing.id, { done, deletedAt: null, updatedAt: Date.now(), version: (existing.version ?? 0) + 1, syncedAt: null })
    } else {
      await db.habitLogs.add({ ...baseEntity(), id: uid(), habitId, date, done })
    }
  })
}
