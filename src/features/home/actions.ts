import { useNavigate, useParams } from 'react-router'
import { recordsRepo, tasksRepo } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { fmtDate, nextOccurrence, todayISO } from '@/lib/dates'
import type { RecordItem, Task } from '@/types/models'

/**
 * Toggle a record's done flag. Completing a recurring record with a due date advances it to the next
 * occurrence instead (same semantics as RecordManager).
 */
export async function toggleRecordDone(r: RecordItem) {
  if (!r.done && r.recurrence && r.dueDate) {
    const next = nextOccurrence(r.dueDate, r.recurrence)
    if (next) {
      const ok = await safeWrite(() => recordsRepo.update(r.id, { dueDate: next, done: false, fields: { ...r.fields, lastCompleted: todayISO() } }))
      if (ok !== undefined) toast(`Completed — next due ${fmtDate(next)}`)
      return
    }
  }
  await safeWrite(() => recordsRepo.update(r.id, { done: !r.done, fields: !r.done ? { ...r.fields, lastCompleted: todayISO() } : r.fields }))
}

/** Complete (or reopen) a task. Recurring tasks with a due date roll forward to their next occurrence. */
export async function toggleTaskDone(t: Task) {
  const completing = t.status !== 'completed'
  if (completing && t.recurrence && t.dueDate) {
    const next = nextOccurrence(t.dueDate, t.recurrence)
    if (next) {
      const ok = await safeWrite(() => tasksRepo.update(t.id, { dueDate: next, status: 'todo', completedAt: null, subtasks: t.subtasks.map((s) => ({ ...s, done: false })) }))
      if (ok !== undefined) toast(`Completed — next due ${fmtDate(next)}`)
      return
    }
  }
  await safeWrite(() => tasksRepo.update(t.id, completing ? { status: 'completed', completedAt: Date.now() } : { status: 'todo', completedAt: null }))
}

/** Tab state bound to the `:tab?` route param. Unknown tabs fall back to the first tab. */
export function useTabRoute<T extends string>(base: string, ids: readonly T[]): [T, (t: T) => void] {
  const { tab } = useParams()
  const navigate = useNavigate()
  const current = (ids as readonly string[]).includes(tab ?? '') ? (tab as T) : ids[0]
  const set = (t: T) => navigate(t === ids[0] ? base : `${base}/${t}`)
  return [current, set]
}

export const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const

/** Phone number normalised for a tel: link (digits and leading +). */
export const telHref = (phone: string) => `tel:${phone.trim().replace(/(?!^\+)[^\d]/g, '')}`

export const isLive = <T extends { deletedAt: number | null; archived: boolean }>(r: T) => !r.deletedAt && !r.archived
