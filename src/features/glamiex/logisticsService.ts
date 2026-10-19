/**
 * Database writes for returns, deliveries, delivery partners, rider settlements and Names & Payments.
 * Every posting is validated, atomic (Dexie transaction), idempotent (deterministic ids / submission ids) and audited.
 */
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { baseEntity } from '@/services/repo'
import { orderTotal } from './engine'
import { partnerAccount, pickupPayFor, rateOf, type LgData } from './logistics'
import type { GxPartner, GxReturn, GxRiderPayment, GxShipment, NpPayment, NpPerson, ReturnDisposition, ReturnStatus, ShipmentStatus } from './logisticsTypes'
import { FINAL_SHIPMENT } from './logisticsTypes'
import type { GxRefund, Paisa, PaymentMethod } from './types'
import { getGxSettings, gxAudit, isConstraint, nextNo } from './service'
import { pkr } from './money'
import { zoned } from './time'

const isMoney = (v: number) => Number.isInteger(v) && v >= 0
const now = () => new Date().toISOString()
const bump = <T extends { version: number }>(r: T) => ({ updatedAt: Date.now(), version: r.version + 1, syncedAt: null })
const loadLg = async (): Promise<LgData> => {
  const [returns, shipments, partners, riderPays] = await Promise.all([db.gxReturns.toArray(), db.gxShipments.toArray(), db.gxPartners.toArray(), db.gxRiderPays.toArray()])
  return { returns, shipments, partners, riderPays }
}

/* ===================================== Returns ===================================== */
export type ReturnInput = Pick<GxReturn, 'orderId' | 'productId' | 'qtyReturned' | 'at' | 'reason' | 'refundAmount' | 'shippingCost' | 'handlingCost' | 'otherCost' |
  'condition' | 'notes' | 'attachmentIds' | 'customerName' | 'customerContact' | 'imageId'> & { status?: ReturnStatus }

/** Units of this product on this order already returned elsewhere (other return records + restocks from sales refunds). */
async function alreadyReturned(orderId: string, productId: string, exceptId: string | null) {
  const rets = (await db.gxReturns.where('orderId').equals(orderId).toArray()).filter((r) => !r.deletedAt && r.status !== 'rejected' && r.productId === productId && r.id !== exceptId)
  const refunds = (await db.gxRefunds.where('orderId').equals(orderId).toArray()).filter((f) => !f.deletedAt && !f.id.startsWith('retstock:') && !f.id.startsWith('ret:'))
  return rets.reduce((a, r) => a + r.qtyReturned, 0) + refunds.flatMap((f) => f.restock).filter((x) => x.productId === productId).reduce((a, x) => a + x.qty, 0)
}

export async function saveReturn(input: ReturnInput, id: string | null): Promise<string> {
  const o = await db.gxOrders.get(input.orderId)
  if (!o || o.deletedAt) throw new Error('Choose the original order.')
  if (o.status === 'cancelled') throw new Error('Cancelled orders cannot have returns.')
  const lines = o.items.filter((i) => i.productId === input.productId)
  if (!lines.length) throw new Error('That product is not on this order.')
  const sold = lines.reduce((a, i) => a + i.qty, 0)
  if (!Number.isInteger(input.qtyReturned) || input.qtyReturned <= 0) throw new Error('Quantity returned must be a whole number greater than 0.')
  const prev = id ? await db.gxReturns.get(id) : undefined
  if (id && !prev) throw new Error('Return not found.')
  const left = sold - (await alreadyReturned(o.id, input.productId, id))
  if (input.qtyReturned > left) throw new Error(`Only ${left} of ${sold} ${lines[0].name} can still be returned on ${o.orderNo}.`)
  for (const k of ['refundAmount', 'shippingCost', 'handlingCost', 'otherCost'] as const) if (!isMoney(input[k])) throw new Error('Amounts cannot be negative.')
  const lineValue = lines.reduce((a, i) => a + i.qty * i.unitPrice, 0) / sold * input.qtyReturned
  if (input.refundAmount > orderTotal(o)) throw new Error(`The refund cannot exceed the order total (${pkr(orderTotal(o))}).`)
  if (prev && (prev.refundPostedAt || prev.restockPostedAt) &&
    (prev.qtyReturned !== input.qtyReturned || prev.refundAmount !== input.refundAmount || prev.orderId !== input.orderId || prev.productId !== input.productId))
    throw new Error('The refund or restock for this return is already posted, so its order, product, quantity and refund amount are locked.')
  const product = await db.gxProducts.get(input.productId)
  const snap = {
    personId: o.personId, productName: lines[0].name, qtySold: sold, unitCost: lines[0].unitCost, unitPrice: lines[0].unitPrice,
    imageId: input.imageId ?? product?.imageIds[0] ?? null,
  }
  if (prev) {
    await db.gxReturns.update(prev.id, { ...input, ...snap, status: input.status ?? prev.status, ...bump(prev) })
    await gxAudit('return', prev.id, 'update', `${prev.returnNo}: ${input.qtyReturned} × ${snap.productName}, refund ${pkr(input.refundAmount)}`)
    return prev.id
  }
  const rid = uid()
  await db.transaction('rw', db.gxReturns, db.kv, async () => {
    const row: GxReturn = {
      ...baseEntity(), id: rid, returnNo: await nextNo('return', 'RET'), ...input, ...snap, status: input.status ?? 'requested', disposition: null, salvageValue: 0,
      pickupPartnerId: null, pickupDate: '', pickupQty: 0, pickupPay: 0, received: false, receivedAt: null, refundPostedAt: null, restockPostedAt: null,
    }
    await db.gxReturns.add(row)
  })
  await gxAudit('return', rid, 'create', `${input.qtyReturned} × ${snap.productName} on ${o.orderNo} (line value ${pkr(Math.round(lineValue))}), refund ${pkr(input.refundAmount)}`)
  return rid
}

/** Manual status changes. "Refunded" and "Restock approved" are set only by posting the refund / restock. */
export async function setReturnStatus(id: string, status: ReturnStatus) {
  const r = await db.gxReturns.get(id)
  if (!r) throw new Error('Return not found.')
  if (status === 'refunded' && !r.refundPostedAt) throw new Error('Use “Post refund” to mark this return as refunded.')
  if (status === 'restock_approved' && !r.restockPostedAt) throw new Error('Use “Inspect” → “Restock as sellable” to restock.')
  if (status === 'rejected' && (r.refundPostedAt || r.restockPostedAt)) throw new Error('This return already has a posted refund or restock and cannot be rejected.')
  await db.gxReturns.update(id, { status, ...bump(r) })
  await gxAudit('return', id, 'update', `${r.returnNo} status → ${status}`)
}

export async function assignPickup(id: string, partnerId: string | null, pickupDate: string, qty: number) {
  const r = await db.gxReturns.get(id)
  if (!r) throw new Error('Return not found.')
  if (r.received && r.pickupPartnerId !== partnerId) throw new Error('The goods are already received, so the pickup rider is locked.')
  if (!Number.isInteger(qty) || qty < 0 || qty > r.qtyReturned) throw new Error(`Products collected must be between 0 and ${r.qtyReturned}.`)
  const p = partnerId ? await db.gxPartners.get(partnerId) : null
  if (partnerId && (!p || p.deletedAt)) throw new Error('Delivery partner not found.')
  const pickupPay = p ? pickupPayFor(p, qty || r.qtyReturned) : 0
  await db.gxReturns.update(id, { pickupPartnerId: partnerId, pickupDate, pickupQty: qty, pickupPay, status: partnerId && ['requested', 'approved'].includes(r.status) ? 'pickup_scheduled' : r.status, ...bump(r) })
  await gxAudit('return', id, 'update', `${r.returnNo} pickup ${p ? `by ${p.name} (${pkr(pickupPay)})` : 'cleared'}`)
}

export async function receiveReturn(id: string, at = now()) {
  const r = await db.gxReturns.get(id)
  if (!r) throw new Error('Return not found.')
  if (r.received) return
  if (r.status === 'rejected') throw new Error('Rejected returns cannot be received.')
  await db.gxReturns.update(id, { received: true, receivedAt: at, pickupQty: r.pickupQty || r.qtyReturned, status: 'inspection_pending', ...bump(r) })
  await gxAudit('return', id, 'update', `${r.returnNo} received at warehouse`)
}

/** Inspection result. Only "sellable" puts units back into sellable stock (once, never twice). */
export async function inspectReturn(id: string, disposition: ReturnDisposition, salvageValue: Paisa = 0) {
  const r = await db.gxReturns.get(id)
  if (!r) throw new Error('Return not found.')
  if (!r.received) throw new Error('Mark the goods as received before inspecting them.')
  if (r.restockPostedAt) throw new Error('These units are already back in sellable stock; the inspection result is locked.')
  if (!isMoney(salvageValue)) throw new Error('Recoverable value cannot be negative.')
  if (disposition !== 'sellable') {
    await db.gxReturns.update(id, { disposition, salvageValue, status: disposition === 'repair' ? 'inspection_pending' : 'damaged', ...bump(r) })
    await gxAudit('return', id, 'update', `${r.returnNo} inspected: ${disposition}${salvageValue ? `, recoverable ${pkr(salvageValue)}` : ''}`)
    return
  }
  const at = now()
  await db.transaction('rw', [db.gxReturns, db.gxOrders, db.gxRefunds, db.gxStock], async () => {
    const o = await db.gxOrders.get(r.orderId)
    if (!o) throw new Error('Original order not found.')
    const sold = o.items.filter((i) => i.productId === r.productId).reduce((a, i) => a + i.qty, 0)
    const restocked = (await db.gxRefunds.where('orderId').equals(o.id).toArray()).filter((f) => !f.deletedAt).flatMap((f) => f.restock).filter((x) => x.productId === r.productId).reduce((a, x) => a + x.qty, 0)
    if (restocked + r.qtyReturned > sold) throw new Error(`Only ${sold - restocked} of these units can still go back to stock.`)
    const refund: GxRefund = { ...baseEntity(), id: `retstock:${r.id}`, orderId: o.id, amount: 0, restock: [{ productId: r.productId, qty: r.qtyReturned, unitCost: r.unitCost }], reason: `Restock from return ${r.returnNo}`, at }
    await db.gxRefunds.add(refund)
    await db.gxStock.add({ ...baseEntity(), id: `refund:retstock:${r.id}:${r.productId}`, productId: r.productId, qty: r.qtyReturned, reason: 'refund', refId: refund.id, note: `Return ${r.returnNo}`, at })
    await db.gxReturns.update(id, { disposition, salvageValue: 0, restockPostedAt: at, status: 'restock_approved', ...bump(r) })
  }).catch((e) => { if (isConstraint(e)) throw new Error('This return was already restocked.'); throw e })
  await gxAudit('stock', r.productId, 'adjust', `+${r.qtyReturned} restocked from return ${r.returnNo}`)
  await gxAudit('return', id, 'refund', `${r.returnNo} restocked ${r.qtyReturned} as sellable`)
}

/** Posts the approved refund to the sales ledger exactly once (deterministic id `ret:<returnId>`). */
export async function postReturnRefund(id: string, opts: { payNow: boolean; method: PaymentMethod; at?: string }) {
  const at = opts.at ?? now()
  let r!: GxReturn
  await db.transaction('rw', [db.gxReturns, db.gxOrders, db.gxRefunds, db.gxPayments, db.kv], async () => {
    r = (await db.gxReturns.get(id))!
    if (!r) throw new Error('Return not found.')
    if (r.refundPostedAt) throw new Error('The refund for this return is already posted.')
    if (r.status === 'rejected') throw new Error('Rejected returns are not refunded.')
    if (r.refundAmount <= 0) throw new Error('Enter an approved refund amount greater than 0 first.')
    const o = await db.gxOrders.get(r.orderId)
    if (!o || o.status === 'cancelled') throw new Error('The original order is missing or cancelled.')
    const prior = (await db.gxRefunds.where('orderId').equals(o.id).toArray()).filter((f) => !f.deletedAt)
    const refunded = prior.reduce((a, f) => a + f.amount, 0)
    const max = orderTotal(o) - refunded
    if (r.refundAmount > max) throw new Error(`Refund cannot exceed ${pkr(max)} (order total minus earlier refunds).`)
    await db.gxRefunds.add({ ...baseEntity(), id: `ret:${r.id}`, orderId: o.id, amount: r.refundAmount, restock: [], reason: `Return ${r.returnNo}`, at })
    if (opts.payNow) {
      await db.gxPayments.add({ ...baseEntity(), id: `rfp:ret:${r.id}`, txnNo: await nextNo('payment', 'RFD'), personId: o.personId, type: 'refund_paid', amount: r.refundAmount, method: opts.method, at, reference: `${o.orderNo} / ${r.returnNo}`, allocations: [{ orderId: o.id, amount: -r.refundAmount }], notes: `Refund for return ${r.returnNo}`, attachmentIds: [], voided: false })
    }
    if (refunded + r.refundAmount >= orderTotal(o)) await db.gxOrders.update(o.id, { status: 'refunded', ...bump(o) })
    await db.gxReturns.update(id, { refundPostedAt: at, status: 'refunded', ...bump(r) })
  }).catch((e) => { if (isConstraint(e)) throw new Error('The refund for this return is already posted.'); throw e })
  await gxAudit('return', id, 'refund', `${r.returnNo} refund ${pkr(r.refundAmount)} posted${opts.payNow ? ' and paid' : ' (payable)'}`)
}

export async function trashReturn(id: string) {
  const r = await db.gxReturns.get(id)
  if (!r) return
  if (r.refundPostedAt || r.restockPostedAt) throw new Error('Returns with a posted refund or restock are part of the books and cannot be deleted. Mark it rejected/completed instead.')
  await db.gxReturns.update(id, { deletedAt: Date.now(), ...bump(r) })
  await gxAudit('return', id, 'delete', r.returnNo)
}

/* ===================================== Shipments ===================================== */
export type ShipmentInput = Pick<GxShipment, 'orderId' | 'customerName' | 'customerAddress' | 'customerPhone' | 'items' | 'partnerId' | 'distanceKm' | 'expectedDate' |
  'customerCharge' | 'actualCost' | 'extraCharge' | 'trackingNo' | 'proofIds' | 'notes' | 'attachmentIds'>

export async function saveShipment(input: ShipmentInput, id: string | null): Promise<string> {
  const items = input.items.filter((i) => i.qty !== 0)
  if (!items.length) throw new Error('Add at least one product to the shipment.')
  if (items.some((i) => !Number.isInteger(i.qty) || i.qty <= 0)) throw new Error('Quantities must be whole numbers greater than 0.')
  for (const k of ['customerCharge', 'actualCost', 'extraCharge'] as const) if (!isMoney(input[k])) throw new Error('Amounts cannot be negative.')
  if (input.distanceKm != null && (!Number.isFinite(input.distanceKm) || input.distanceKm < 0)) throw new Error('Distance cannot be negative.')
  const prev = id ? await db.gxShipments.get(id) : undefined
  if (id && !prev) throw new Error('Shipment not found.')
  if (input.orderId) {
    const o = await db.gxOrders.get(input.orderId)
    if (!o || o.deletedAt) throw new Error('Order not found.')
    if (o.status === 'cancelled') throw new Error('Cancelled orders cannot be shipped.')
    const others = (await db.gxShipments.where('orderId').equals(o.id).toArray()).filter((s) => !s.deletedAt && s.id !== id && !['cancelled', 'returned', 'failed'].includes(s.status))
    for (const i of items) {
      const ordered = o.items.filter((x) => x.productId === i.productId).reduce((a, x) => a + x.qty, 0)
      if (!ordered) throw new Error(`${i.name} is not on order ${o.orderNo}.`)
      const shipped = others.flatMap((s) => s.items).filter((x) => x.productId === i.productId).reduce((a, x) => a + x.qty, 0)
      if (shipped + i.qty > ordered) throw new Error(`Only ${ordered - shipped} × ${i.name} on ${o.orderNo} are not yet in another shipment.`)
    }
  }
  const p = input.partnerId ? await db.gxPartners.get(input.partnerId) : null
  if (input.partnerId && (!p || p.deletedAt)) throw new Error('Delivery partner not found.')
  const partnerChanged = !prev || prev.partnerId !== input.partnerId
  if (prev && partnerChanged && FINAL_SHIPMENT.includes(prev.status)) throw new Error('This shipment is finished. Change its status back before changing the rider.')
  const rate = p ? (partnerChanged || !prev?.rate ? rateOf(p) : prev.rate) : null
  const data = { ...input, items, rate }
  if (prev) {
    const assigned = !prev.partnerId && p && ['pending', 'ready'].includes(prev.status)
    await db.gxShipments.update(prev.id, { ...data, ...(assigned ? { status: 'assigned' as const } : {}), ...bump(prev) })
    await gxAudit('shipment', prev.id, 'update', `${prev.shipmentNo}${partnerChanged ? ` rider → ${p?.name ?? 'none'}` : ''}`)
    return prev.id
  }
  const sid = uid()
  let no = ''
  await db.transaction('rw', db.gxShipments, db.kv, async () => {
    no = await nextNo('shipment', 'SHP')
    await db.gxShipments.add({ ...baseEntity(), id: sid, shipmentNo: no, ...data, status: p ? 'assigned' : 'pending', dispatchAt: null, deliveredAt: null, finalAt: null })
  })
  await gxAudit('shipment', sid, 'create', `${no}: ${items.map((i) => `${i.qty}× ${i.name}`).join(', ')}${p ? ` → ${p.name}` : ''}`)
  return sid
}

export async function setShipmentStatus(id: string, status: ShipmentStatus, at = now()) {
  const s = await db.gxShipments.get(id)
  if (!s) throw new Error('Shipment not found.')
  if (status === s.status) return
  if (status === 'assigned' && !s.partnerId) throw new Error('Choose a rider or delivery company first.')
  const final = FINAL_SHIPMENT.includes(status)
  await db.gxShipments.update(id, {
    status, finalAt: final ? at : null, deliveredAt: status === 'delivered' ? at : null,
    dispatchAt: s.dispatchAt ?? (['picked_up', 'in_transit', 'out_for_delivery', 'delivered'].includes(status) ? at : null), ...bump(s),
  })
  await gxAudit('shipment', id, 'update', `${s.shipmentNo} ${s.status} → ${status}`)
}

export async function trashShipment(id: string) {
  const s = await db.gxShipments.get(id)
  if (!s) return
  const pays = (await db.gxRiderPays.where('partnerId').equals(s.partnerId ?? '-').toArray()).filter((p) => !p.voided && !p.deletedAt)
  if (s.partnerId && FINAL_SHIPMENT.includes(s.status) && pays.length) throw new Error('This finished shipment is part of a rider account that has settlements. Set it to Cancelled instead of deleting.')
  await db.gxShipments.update(id, { deletedAt: Date.now(), ...bump(s) })
  await gxAudit('shipment', id, 'delete', s.shipmentNo)
}

/* ===================================== Partners ===================================== */
export type PartnerInput = Omit<GxPartner, keyof import('@/types/models').BaseEntity>
export async function savePartner(input: PartnerInput, id: string | null): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error('Name is required.')
  for (const k of ['perOrder', 'perProduct', 'perKm', 'pickupRate', 'failedFixed', 'returnedFixed'] as const) if (!isMoney(input[k])) throw new Error('Rates cannot be negative.')
  const all = (await db.gxPartners.toArray()).filter((p) => !p.deletedAt && p.id !== id)
  if (input.code.trim() && all.some((p) => p.code.trim().toLowerCase() === input.code.trim().toLowerCase())) throw new Error(`Rider ID “${input.code}” is already used.`)
  if (all.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) throw new Error(`A delivery partner named “${name}” already exists.`)
  const data = { ...input, name, code: input.code.trim() }
  if (id) {
    const prev = await db.gxPartners.get(id)
    if (!prev) throw new Error('Partner not found.')
    await db.gxPartners.update(id, { ...data, ...bump(prev) })
    await gxAudit('partner', id, 'update', `${name}: ${input.rateRule} (new rates apply to newly assigned shipments only)`)
    return id
  }
  const pid = uid()
  await db.gxPartners.add({ ...baseEntity(), id: pid, ...data })
  await gxAudit('partner', pid, 'create', name)
  return pid
}

/* ===================================== Rider settlements ===================================== */
export interface RiderPaymentInput {
  /** Client submission id: re-submitting never records a second payment. */
  id: string
  partnerId: string; periodFrom: string; periodTo: string
  additions: Paisa; deductions: Paisa; amountPaid: Paisa
  at: string; method: PaymentMethod; reference: string; notes: string; attachmentIds: string[]
}
export async function addRiderPayment(input: RiderPaymentInput): Promise<{ payment: GxRiderPayment; duplicate: boolean }> {
  const existing = await db.gxRiderPays.get(input.id)
  if (existing) return { payment: existing, duplicate: true }
  for (const k of ['additions', 'deductions', 'amountPaid'] as const) if (!isMoney(input[k])) throw new Error('Amounts must be 0 or more.')
  if (!input.amountPaid && !input.additions && !input.deductions) throw new Error('Enter an amount paid (or an adjustment).')
  if (!input.periodFrom || !input.periodTo || input.periodFrom > input.periodTo) throw new Error('Choose a valid settlement period.')
  const { timeZone: tz } = await getGxSettings()
  let payment!: GxRiderPayment
  let committed = false
  await db.transaction('rw', [db.gxRiderPays, db.gxPartners, db.gxShipments, db.gxReturns, db.kv], async () => {
    if (await db.gxRiderPays.get(input.id)) throw new Error('DUPLICATE')
    const p = await db.gxPartners.get(input.partnerId)
    if (!p || p.deletedAt) throw new Error('Delivery partner not found.')
    const lg = await loadLg()
    const ref = input.reference.trim().toLowerCase()
    if (ref && lg.riderPays.some((x) => x.partnerId === p.id && !x.voided && !x.deletedAt && x.reference.trim().toLowerCase() === ref))
      throw new Error(`A payment with reference “${input.reference}” is already recorded for ${p.name}.`)
    const asOf = zoned(input.at, tz).date
    const due = partnerAccount(p, lg, tz, { from: '0000-01-01', to: asOf }).outstanding + input.additions - input.deductions
    if (input.amountPaid > due) throw new Error(`Payment is more than the amount due (${pkr(Math.max(0, due))}). Check for a duplicate payment.`)
    const period = partnerAccount(p, lg, tz, { from: input.periodFrom, to: input.periodTo })
    payment = {
      ...baseEntity(), id: input.id, settlementNo: await nextNo('settlement', 'STL'), partnerId: p.id, periodFrom: input.periodFrom, periodTo: input.periodTo,
      completedDeliveries: period.eligible, grossEarnings: period.shipmentEarnings + period.pickupEarnings, additions: input.additions, deductions: input.deductions,
      amountPaid: input.amountPaid, at: input.at, method: input.method, reference: input.reference.trim(), notes: input.notes, attachmentIds: input.attachmentIds, voided: false,
    }
    await db.gxRiderPays.add(payment)
  }).then(() => { committed = true }).catch((e) => { if ((e as Error).message === 'DUPLICATE' || isConstraint(e)) return; throw e })
  if (!committed) {
    const saved = await db.gxRiderPays.get(input.id)
    if (!saved) throw new Error('The payment could not be saved. Please try again.')
    return { payment: saved, duplicate: true }
  }
  await gxAudit('riderPayment', payment.id, 'create', `${payment.settlementNo}: paid ${pkr(payment.amountPaid)}${payment.additions ? `, +${pkr(payment.additions)}` : ''}${payment.deductions ? `, −${pkr(payment.deductions)}` : ''}`)
  return { payment, duplicate: false }
}

export async function voidRiderPayment(id: string, reason: string) {
  const p = await db.gxRiderPays.get(id)
  if (!p) throw new Error('Settlement not found.')
  if (p.voided) throw new Error('Already voided.')
  await db.gxRiderPays.update(id, { voided: true, notes: `${p.notes}${p.notes ? '\n' : ''}VOID: ${reason}`, ...bump(p) })
  await gxAudit('riderPayment', id, 'void', `${p.settlementNo} ${pkr(p.amountPaid)} — ${reason}`)
}

/* ===================================== Names & Payments ===================================== */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
const livePeople = async () => (await db.npPeople.toArray()).filter((p) => !p.deletedAt)

export const NP_SEED: { name: string; obligation: Paisa; paid: Paisa; formerly?: string[] }[] = [
  { name: 'Kaleem', obligation: 5_000_000, paid: 0 },
  { name: 'Salman', obligation: 5_000_000, paid: 5_000_000 },
  { name: 'Awais', obligation: 5_000_000, paid: 0 },
  { name: 'Noman', obligation: 5_000_000, paid: 0, formerly: ['Nauman'] },
  { name: 'Hasnain Malik', obligation: 5_000_000, paid: 0 },
]
const SEED_KEY = 'np.seeded.v1'

/**
 * One-time setup of the five initial people. Runs once per database (flag in kv), matches existing people by name
 * (case/space-insensitive) and updates them instead of creating duplicates. The only payment recorded is Salman's
 * PKR 50,000, as stated by the owner — and only if Salman has no recorded payment yet.
 */
export async function seedNamesPayments(): Promise<boolean> {
  await applyRenames()
  if ((await db.kv.get(SEED_KEY))?.value) return false
  let created = false
  await db.transaction('rw', [db.npPeople, db.npPayments, db.kv], async () => {
    if ((await db.kv.get(SEED_KEY))?.value) return
    const people = await livePeople()
    for (const s of NP_SEED) {
      let p = people.find((x) => norm(x.name) === norm(s.name)) ?? people.find((x) => s.formerly?.some((n) => norm(n) === norm(x.name)))
      if (p && norm(p.name) !== norm(s.name)) { await db.npPeople.update(p.id, { name: s.name, ...bump(p) }); p = { ...p, name: s.name } }
      if (p) {
        if (p.obligation !== s.obligation) await db.npPeople.update(p.id, { obligation: s.obligation, ...bump(p) })
      } else {
        p = { ...baseEntity(), id: `np-seed-${norm(s.name).replace(/\W+/g, '-')}`, name: s.name, phone: '', obligation: s.obligation, notes: '' }
        await db.npPeople.put(p)
        created = true
      }
      if (s.paid) {
        const pays = (await db.npPayments.where('personId').equals(p.id).toArray()).filter((x) => !x.voided && !x.deletedAt)
        if (!pays.length) {
          await db.npPayments.put({
            ...baseEntity(), id: `np-seed-pay-${p.id}`, receiptNo: await nextNo('np', 'NPR'), personId: p.id, amount: s.paid, at: now(), method: 'other', reference: 'Opening balance',
            notes: `Initial record: ${s.name} paid PKR ${(s.paid / 100).toLocaleString('en-PK')} (entered by the owner when the module was set up). Edit the date, method and reference if needed.`, linkedRef: '', voided: false,
          })
        }
      }
    }
    await db.kv.put({ key: SEED_KEY, value: Date.now() })
  })
  await gxAudit('npPerson', 'seed', 'create', 'Names & Payments initial records checked/created (Kaleem, Salman, Awais, Nauman, Hasnain Malik)')
  return created
}

/** Owner-requested renames (e.g. Nauman → Noman), applied once to an existing record — never creates a duplicate. */
async function applyRenames() {
  const people = await livePeople()
  for (const s of NP_SEED) for (const old of s.formerly ?? []) {
    const p = people.find((x) => norm(x.name) === norm(old))
    if (!p || people.some((x) => norm(x.name) === norm(s.name))) continue
    await db.npPeople.update(p.id, { name: s.name, ...bump(p) })
    await gxAudit('npPerson', p.id, 'update', `Renamed ${p.name} → ${s.name}`)
  }
}

export async function saveNpPerson(input: Pick<NpPerson, 'name' | 'phone' | 'obligation' | 'notes'>, id: string | null): Promise<string> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Name is required.')
  if (!isMoney(input.obligation)) throw new Error('Payment amount must be 0 or more.')
  if ((await livePeople()).some((p) => p.id !== id && norm(p.name) === norm(name))) throw new Error(`“${name}” already exists. Open that record instead of adding a duplicate.`)
  if (id) {
    const prev = await db.npPeople.get(id)
    if (!prev) throw new Error('Person not found.')
    await db.npPeople.update(id, { ...input, name, ...bump(prev) })
    await gxAudit('npPerson', id, 'update', `${name}: obligation ${pkr(input.obligation)}`)
    return id
  }
  const pid = uid()
  await db.npPeople.add({ ...baseEntity(), id: pid, ...input, name })
  await gxAudit('npPerson', pid, 'create', `${name}: obligation ${pkr(input.obligation)}`)
  return pid
}

export async function trashNpPerson(id: string) {
  const p = await db.npPeople.get(id)
  if (!p) return
  if ((await db.npPayments.where('personId').equals(id).toArray()).some((x) => !x.voided && !x.deletedAt)) throw new Error('This person has recorded payments. Void them first (they stay in the history).')
  await db.npPeople.update(id, { deletedAt: Date.now(), ...bump(p) })
  await gxAudit('npPerson', id, 'delete', p.name)
}

export interface NpPaymentInput { id: string; personId: string; amount: Paisa; at: string; method: PaymentMethod; reference: string; notes: string; linkedRef: string }
export async function addNpPayment(input: NpPaymentInput): Promise<{ payment: NpPayment; duplicate: boolean }> {
  const existing = await db.npPayments.get(input.id)
  if (existing) return { payment: existing, duplicate: true }
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Amount must be greater than 0.')
  if (!input.at) throw new Error('Payment date is required.')
  let payment!: NpPayment
  let committed = false
  await db.transaction('rw', [db.npPeople, db.npPayments, db.kv], async () => {
    if (await db.npPayments.get(input.id)) throw new Error('DUPLICATE')
    const p = await db.npPeople.get(input.personId)
    if (!p || p.deletedAt) throw new Error('Person not found.')
    const pays = (await db.npPayments.where('personId').equals(p.id).toArray()).filter((x) => !x.voided && !x.deletedAt)
    const remaining = p.obligation - pays.reduce((a, x) => a + x.amount, 0)
    if (input.amount > remaining) throw new Error(remaining > 0 ? `${p.name} only has ${pkr(remaining)} remaining. Increase their payment amount first if they owe more.` : `${p.name} has already paid in full.`)
    const ref = input.reference.trim().toLowerCase()
    if (ref && pays.some((x) => x.reference.trim().toLowerCase() === ref)) throw new Error(`Reference “${input.reference}” is already recorded for ${p.name}.`)
    payment = { ...baseEntity(), ...input, reference: input.reference.trim(), linkedRef: input.linkedRef.trim(), receiptNo: await nextNo('np', 'NPR'), voided: false }
    await db.npPayments.add(payment)
  }).then(() => { committed = true }).catch((e) => { if ((e as Error).message === 'DUPLICATE' || isConstraint(e)) return; throw e })
  if (!committed) {
    const saved = await db.npPayments.get(input.id)
    if (!saved) throw new Error('The payment could not be saved. Please try again.')
    return { payment: saved, duplicate: true }
  }
  await gxAudit('npPayment', payment.id, 'create', `${payment.receiptNo}: ${pkr(payment.amount)}`)
  return { payment, duplicate: false }
}

/** Amounts are corrected by voiding and re-entering; other details can be edited (audited). */
export async function updateNpPayment(id: string, patch: Pick<Partial<NpPayment>, 'at' | 'method' | 'reference' | 'notes' | 'linkedRef'>) {
  const p = await db.npPayments.get(id)
  if (!p) throw new Error('Payment not found.')
  if (p.voided) throw new Error('Voided payments cannot be edited.')
  await db.npPayments.update(id, { ...patch, ...bump(p) })
  await gxAudit('npPayment', id, 'update', `${p.receiptNo}: ${Object.keys(patch).join(', ')}`)
}

export async function voidNpPayment(id: string, reason: string) {
  const p = await db.npPayments.get(id)
  if (!p) throw new Error('Payment not found.')
  if (p.voided) throw new Error('Already voided.')
  await db.npPayments.update(id, { voided: true, notes: `${p.notes}${p.notes ? '\n' : ''}VOID: ${reason}`, ...bump(p) })
  await gxAudit('npPayment', id, 'void', `${p.receiptNo} ${pkr(p.amount)} — ${reason}`)
}
