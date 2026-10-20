import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { baseEntity } from '@/services/repo'
import { gxAudit } from '../service'
import { formatAmount, validateRecord, type PayRecord, type PrDraft } from './model'

export function useRecords() {
  return useLiveQuery(async () => {
    const rows = await db.prRecords.filter((r) => !r.deletedAt).toArray()
    return rows.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.createdAt - a.createdAt)
  }, [])
}

/** Inserts a new record or saves changes to an existing one. Returns the saved row. */
export async function saveRecord(draft: PrDraft): Promise<PayRecord> {
  const errors = validateRecord(draft)
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
  const clean = { ...draft, partnerName: draft.partnerName.trim(), title: draft.title.trim(), reference: draft.reference.trim(), paidConfirmed: draft.status === 'paid' && draft.paidConfirmed }
  const { id, ...data } = clean
  if (id) {
    const cur = await db.prRecords.get(id)
    if (!cur || cur.deletedAt) throw new Error('This record no longer exists')
    const row: PayRecord = { ...cur, ...data, updatedAt: Date.now(), version: (cur.version ?? 0) + 1, syncedAt: null }
    await db.prRecords.put(row)
    await gxAudit('payRecord', id, 'update', `${row.partnerName} · ${row.title} · ${formatAmount(row.amount, row.currency)} · ${row.status}`)
    return row
  }
  const row: PayRecord = { ...baseEntity(), ...data, id: uid() }
  await db.prRecords.add(row)
  await gxAudit('payRecord', row.id, 'create', `${row.partnerName} · ${row.title} · ${formatAmount(row.amount, row.currency)} · ${row.status}`)
  return row
}

/** Removes a record from every list (soft delete, so the deletion syncs; recoverable from Trash). */
export async function deleteRecord(id: string) {
  const cur = await db.prRecords.get(id)
  if (!cur) return
  await db.prRecords.update(id, { deletedAt: Date.now(), updatedAt: Date.now(), version: (cur.version ?? 0) + 1, syncedAt: null })
  await gxAudit('payRecord', id, 'delete', `${cur.partnerName} · ${cur.title} deleted`)
}
