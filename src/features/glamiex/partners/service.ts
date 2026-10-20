import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { baseEntity } from '@/services/repo'
import { gxAudit } from '../service'
import { pkr } from '../money'
import { findDuplicate, reversalOf, shareTotal, validateDraft } from './engine'
import { FULL_SHARE, PARTNER_SEED, txnLabel, type BpPartner, type BpTxn, type BpTxnDraft } from './types'

const bump = (r: { version: number }) => ({ updatedAt: Date.now(), version: (r.version ?? 0) + 1, syncedAt: null })

/** Creates the five permanent partner profiles once (existing profiles are never overwritten). */
export async function seedPartners() {
  await db.transaction('rw', db.bpPartners, async () => {
    for (const [order, s] of PARTNER_SEED.entries()) {
      if (await db.bpPartners.get(s.id)) continue
      await db.bpPartners.add({ ...baseEntity(), id: s.id, name: s.name, phone: '', notes: '', photo: null, order, ownershipBp: 0, profitBp: 0, lossBp: 0 })
    }
  })
}

export function useBpData() {
  return useLiveQuery(async () => {
    const [partners, txns] = await Promise.all([
      db.bpPartners.orderBy('order').filter((p) => !p.deletedAt).toArray(),
      db.bpTxns.toArray(),
    ])
    txns.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.createdAt - b.createdAt)
    return { partners, txns }
  }, [])
}

/** Profile edits only; partners cannot be deleted, so their history is always kept. */
export async function updatePartner(id: string, patch: Pick<BpPartner, 'name' | 'phone' | 'notes' | 'photo'>) {
  const name = patch.name.trim()
  if (!name) throw new Error('Partner name is required')
  const p = await db.bpPartners.get(id)
  if (!p) throw new Error('Partner not found')
  await db.bpPartners.update(id, { ...patch, name, phone: patch.phone.trim(), notes: patch.notes.trim(), ...bump(p) })
  await gxAudit('bpPartner', id, 'update', `Partner profile updated: ${name}`)
}

export type ShareKind = 'ownershipBp' | 'profitBp' | 'lossBp'
export async function updateShares(kind: ShareKind, shares: Record<string, number>) {
  if (shareTotal(Object.values(shares)) !== FULL_SHARE) throw new Error('Percentages must total exactly 100%')
  await db.transaction('rw', [db.bpPartners, db.gxAudit], async () => {
    for (const [id, bp] of Object.entries(shares)) {
      const p = await db.bpPartners.get(id)
      if (p && p[kind] !== bp) await db.bpPartners.update(id, { [kind]: bp, ...bump(p) })
    }
  })
  const label = { ownershipBp: 'Business ownership', profitBp: 'Profit-sharing', lossBp: 'Loss-sharing' }[kind]
  await gxAudit('bpPartner', 'shares', 'update', `${label} percentages updated: ${Object.entries(shares).map(([id, bp]) => `${id.replace('bp-', '')} ${bp / 100}%`).join(', ')}`)
}

function newTxnNo(date: string) {
  return `BP-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

export class DuplicateError extends Error {
  constructor(public existing: BpTxn) { super(`Looks like a duplicate of ${existing.txnNo}`) }
}

/** Validates and posts a ledger entry. Throws DuplicateError unless `allowDuplicate`. */
export async function postTxn(draft: BpTxnDraft, opts: { allowDuplicate?: boolean } = {}): Promise<BpTxn> {
  const partners = await db.bpPartners.toArray()
  const errors = validateDraft(draft, partners.map((p) => p.id))
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
  const clean: BpTxnDraft = { ...draft, lines: draft.lines.filter((l) => l.amount > 0), reference: draft.reference.trim(), description: draft.description.trim(), project: draft.project.trim() }
  if (!opts.allowDuplicate && draft.type !== 'correction') {
    const dup = findDuplicate(await db.bpTxns.where('date').equals(draft.date).toArray(), clean)
    if (dup) throw new DuplicateError(dup)
  }
  for (let attempt = 0; ; attempt++) {
    const row: BpTxn = { ...baseEntity(), ...clean, id: uid(), txnNo: newTxnNo(draft.date), reversedBy: null }
    try {
      await db.transaction('rw', [db.bpTxns, db.gxAudit], async () => {
        if (row.type === 'correction') {
          const orig = await db.bpTxns.get(row.reverses!)
          if (!orig) throw new Error('The entry to reverse no longer exists')
          if (orig.reversedBy) throw new Error(`${orig.txnNo} has already been reversed`)
          if (orig.type === 'correction') throw new Error('A reversal cannot itself be reversed — post a new entry instead')
          await db.bpTxns.update(orig.id, { reversedBy: row.id, ...bump(orig) })
        }
        await db.bpTxns.add(row)
      })
      await gxAudit('bpTxn', row.id, row.type === 'correction' ? 'void' : 'create',
        `${row.txnNo} · ${txnLabel(row.type)} · ${pkr(row.amount)}${row.reason ? ` · reason: ${row.reason}` : ''}`)
      return row
    } catch (e) {
      // Retry only on a txnNo collision (unique index).
      if ((e as Error).name === 'ConstraintError' && attempt < 3) continue
      throw e
    }
  }
}

export async function reverseTxn(t: BpTxn, reason: string, date: string, time: string) {
  return postTxn(reversalOf(t, reason, date, time))
}

/** Updates only non-financial details (description, reference, project, proof). Amounts are changed via reversal. */
export async function annotateTxn(id: string, patch: Pick<BpTxn, 'description' | 'reference' | 'proofIds'>) {
  const t = await db.bpTxns.get(id)
  if (!t) throw new Error('Entry not found')
  await db.bpTxns.update(id, { description: patch.description.trim(), reference: patch.reference.trim(), proofIds: patch.proofIds, ...bump(t) })
  await gxAudit('bpTxn', id, 'update', `${t.txnNo} details edited`)
}

export function blankDraft(type: BpTxnDraft['type'], date: string, time: string): BpTxnDraft {
  return {
    type, date, time, amount: 0, lines: [], fromId: null, toId: null, method: null, reference: '', description: '', project: '',
    proofIds: [], period: null, allocMode: null, basis: null, reverses: null, reversesType: null, reason: '',
  }
}
