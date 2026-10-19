import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { baseEntity, makeRepo } from '@/services/repo'
import { localTimeZone } from '@/lib/dates'
import type {
  GxAdIncome, GxAdSpend, GxAuditEvent, GxEntity, GxExpense, GxOrder, GxOrderItem, GxPayment, GxPerson, GxProduct, GxRefund, GxSettings,
  GxStockMove, Paisa, PaymentMethod, StockReason,
} from './types'
import { DEFAULT_EXPENSE_CATEGORIES } from './types'
import { orderBalance, orderTotal, stockOf, type GxData } from './engine'
import { pkr } from './money'
import { zoned } from './time'

/* ---------------- Settings ---------------- */
export const DEFAULT_GX_SETTINGS: GxSettings = {
  timeZone: localTimeZone(), taxRatePct: 0, taxInclusive: false, allowNegativeStock: false, defaultLowStock: 5,
  preset: 'neon', gxAccent: 'violet', density: 'comfortable', chartStyle: 'smooth', chartGradient: true, sidebar: 'expanded',
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
}
const mergeGx = (v: Partial<GxSettings> | undefined): GxSettings => ({ ...DEFAULT_GX_SETTINGS, ...v })
export async function getGxSettings() { return mergeGx((await db.kv.get('gx.settings'))?.value as Partial<GxSettings>) }
export async function updateGxSettings(patch: Partial<GxSettings>) {
  await db.kv.put({ key: 'gx.settings', value: { ...(await getGxSettings()), ...patch } })
  await gxAudit('settings', 'settings', 'update', Object.keys(patch).join(', '))
}
export function useGxSettings(): GxSettings {
  const row = useLiveQuery(() => db.kv.get('gx.settings'), [])
  return mergeGx(row?.value as Partial<GxSettings> | undefined)
}

/* ---------------- Live data ---------------- */
export function useGxData(): GxData | undefined {
  return useLiveQuery(async () => {
    const [products, stock, orders, refunds, people, payments, adIncome, adSpend, expenses] = await Promise.all([
      db.gxProducts.toArray(), db.gxStock.toArray(), db.gxOrders.toArray(), db.gxRefunds.toArray(), db.gxPeople.toArray(),
      db.gxPayments.toArray(), db.gxAdIncome.toArray(), db.gxAdSpend.toArray(), db.gxExpenses.toArray(),
    ])
    return { products, stock, orders, refunds, people, payments, adIncome, adSpend, expenses }
  }, [])
}

/* ---------------- Audit trail ---------------- */
export async function gxAudit(entity: GxEntity, entityId: string, action: GxAuditEvent['action'], summary: string) {
  try { await db.gxAudit.add({ id: uid(), at: Date.now(), entity, entityId, action, summary: summary.slice(0, 300) }) } catch { /* never block the action */ }
}

/* ---------------- Repos for simple records ---------------- */
export const gxPeopleRepo = makeRepo<GxPerson>(db.gxPeople, () => ({ name: '', type: 'customer', phone: '', email: '', address: '', openingBalance: 0, notes: '', attachmentIds: [] }))
export const gxAdIncomeRepo = makeRepo<GxAdIncome>(db.gxAdIncome, () => ({ platform: '', campaign: '', reportDate: '', periodStart: '', periodEnd: '', gross: 0, adjustments: 0, currency: 'PKR', exchangeRate: 1, netPkr: 0, notes: '', attachmentIds: [] }))
export const gxAdSpendRepo = makeRepo<GxAdSpend>(db.gxAdSpend, () => ({ platform: '', campaign: '', campaignId: '', amount: 0, currency: 'PKR', exchangeRate: 1, amountPkr: 0, start: '', end: '', clicks: null, impressions: null, conversions: null, attributedSales: null, notes: '', attachmentIds: [] }))
export const gxExpenseRepo = makeRepo<GxExpense>(db.gxExpenses, () => ({ category: 'Miscellaneous', description: '', amount: 0, date: '', method: 'cash', vendor: '', notes: '', attachmentIds: [] }))
export const gxProductRepo = makeRepo<GxProduct>(db.gxProducts, () => ({ name: '', sku: '', category: '', description: '', buyPrice: 0, sellPrice: 0, lowStockAt: 5, status: 'active', supplierName: '', supplierContact: '', imageIds: [], videoIds: [], dateAdded: '' }))

/** Create/update with an audit entry. */
export async function saveRecord<T extends { id: string }>(repo: { create: (d: Partial<T>) => Promise<T>; update: (id: string, d: Partial<T>) => Promise<void> }, entity: GxEntity, id: string | null, data: Partial<T>, label: string) {
  if (id) { await repo.update(id, data); await gxAudit(entity, id, 'update', label); return id }
  const row = await repo.create(data); await gxAudit(entity, row.id, 'create', label); return row.id
}

/* ---------------- Numbering ---------------- */
async function nextNo(key: string, prefix: string) {
  const row = await db.kv.get(`gx.seq.${key}`)
  const n = ((row?.value as number) ?? 0) + 1
  await db.kv.put({ key: `gx.seq.${key}`, value: n })
  return `${prefix}-${String(n).padStart(5, '0')}`
}
export const normaliseSku = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '-')

const isConstraint = (e: unknown) => e instanceof Dexie.ConstraintError || (e as { name?: string })?.name === 'ConstraintError' ||
  (e as { inner?: { name?: string } })?.inner?.name === 'ConstraintError'

const stockMove = (id: string, productId: string, qty: number, reason: StockReason, refId: string | null, note: string, at = new Date().toISOString()): GxStockMove =>
  ({ ...baseEntity(), id, productId, qty, reason, refId, note, at })

/* ---------------- Products & stock ---------------- */
export async function createProduct(data: Partial<GxProduct>, openingStock: number): Promise<GxProduct> {
  const sku = normaliseSku(data.sku ?? '')
  if (!sku) throw new Error('SKU is required.')
  if (!Number.isInteger(openingStock) || openingStock < 0) throw new Error('Opening stock must be a whole number ≥ 0.')
  const p: GxProduct = { ...baseEntity(), ...gxDefaults(), ...data, sku, id: uid() } as GxProduct
  try {
    await db.transaction('rw', db.gxProducts, db.gxStock, async () => {
      await db.gxProducts.add(p)
      if (openingStock) await db.gxStock.add(stockMove(`opening:${p.id}`, p.id, openingStock, 'opening', p.id, 'Opening stock'))
    })
  } catch (e) {
    if (isConstraint(e)) throw new Error(`SKU “${sku}” is already used by another product.`)
    throw e
  }
  await gxAudit('product', p.id, 'create', `${p.name} (${sku}), opening stock ${openingStock}`)
  return p
}
const gxDefaults = () => ({ name: '', category: '', description: '', buyPrice: 0, sellPrice: 0, lowStockAt: 5, status: 'active' as const, supplierName: '', supplierContact: '', imageIds: [], videoIds: [], dateAdded: new Date().toISOString().slice(0, 10) })

export async function updateProduct(id: string, data: Partial<GxProduct>) {
  const patch = { ...data, ...(data.sku != null ? { sku: normaliseSku(data.sku) } : {}) }
  try { await gxProductRepo.update(id, patch) } catch (e) {
    if (isConstraint(e)) throw new Error(`SKU “${patch.sku}” is already used by another product.`)
    throw e
  }
  await gxAudit('product', id, 'update', Object.keys(data).join(', '))
}

export async function adjustStock(productId: string, qty: number, reason: 'purchase' | 'adjust', note: string) {
  if (!Number.isInteger(qty) || qty === 0) throw new Error('Enter a whole, non-zero quantity.')
  await db.gxStock.add(stockMove(uid(), productId, qty, reason, null, note))
  await gxAudit('stock', productId, 'adjust', `${qty > 0 ? '+' : ''}${qty} (${reason}) ${note}`)
}

/* ---------------- Sales ---------------- */
export interface OrderInput {
  /** Client-generated submission id. Re-submitting the same id never creates a second sale. */
  id: string
  personId: string | null
  items: { productId: string; qty: number; unitPrice: Paisa }[]
  discount: Paisa
  tax: Paisa
  method: PaymentMethod
  at: string
  notes: string
  attachmentIds: string[]
  received: Paisa
}

export function validateOrder(input: OrderInput, products: GxProduct[]): string | null {
  if (!input.items.length) return 'Add at least one product.'
  for (const i of input.items) {
    if (!products.some((p) => p.id === i.productId)) return 'A product in this order no longer exists.'
    if (!Number.isInteger(i.qty) || i.qty <= 0) return 'Quantities must be whole numbers greater than 0.'
    if (!Number.isInteger(i.unitPrice) || i.unitPrice < 0) return 'Prices cannot be negative.'
  }
  const gross = input.items.reduce((a, i) => a + i.qty * i.unitPrice, 0)
  if (input.discount < 0 || input.discount > gross) return 'Discount must be between 0 and the subtotal.'
  if (input.tax < 0) return 'Tax cannot be negative.'
  if (input.received < 0) return 'Amount received cannot be negative.'
  if (input.received > gross - input.discount + input.tax) return 'Amount received is more than the order total. Record the extra as a customer deposit instead.'
  return null
}

export async function createOrder(input: OrderInput): Promise<{ order: GxOrder; duplicate: boolean }> {
  const existing = await db.gxOrders.get(input.id)
  if (existing) return { order: existing, duplicate: true } // idempotent re-submit
  const products = await db.gxProducts.bulkGet(input.items.map((i) => i.productId))
  const err = validateOrder(input, products.filter(Boolean) as GxProduct[])
  if (err) throw new Error(err)
  const settings = await getGxSettings()

  let order!: GxOrder
  let committed = false
  await db.transaction('rw', [db.gxOrders, db.gxStock, db.gxPayments, db.gxProducts, db.kv], async () => {
    if (await db.gxOrders.get(input.id)) throw new Error('DUPLICATE')
    const stock = await db.gxStock.toArray()
    // Merge duplicate lines for the same product + price
    const items: GxOrderItem[] = []
    for (const i of input.items) {
      const p = products.find((x) => x?.id === i.productId)!
      const same = items.find((x) => x.productId === i.productId && x.unitPrice === i.unitPrice)
      if (same) same.qty += i.qty
      else items.push({ productId: p.id, name: p.name, sku: p.sku, qty: i.qty, unitPrice: i.unitPrice, unitCost: p.buyPrice })
    }
    const perProduct = new Map<string, number>()
    for (const i of items) perProduct.set(i.productId, (perProduct.get(i.productId) ?? 0) + i.qty)
    if (!settings.allowNegativeStock) {
      for (const [pid, q] of perProduct) {
        const have = stockOf(pid, stock)
        if (have < q) throw new Error(`Not enough stock for ${items.find((x) => x.productId === pid)!.name}: ${have} available, ${q} requested.`)
      }
    }
    const orderNo = await nextNo('order', 'GX')
    order = { ...baseEntity(), id: input.id, orderNo, personId: input.personId, items, discount: input.discount, tax: input.tax, status: 'completed', method: input.method, at: input.at, notes: input.notes, attachmentIds: input.attachmentIds, cancelledAt: null, cancelReason: '' }
    await db.gxOrders.add(order)
    // Deterministic ids: replaying this transaction can never deduct stock twice.
    await db.gxStock.bulkAdd([...perProduct].map(([pid, q]) => stockMove(`sale:${order.id}:${pid}`, pid, -q, 'sale', order.id, orderNo, input.at)))
    if (input.received > 0) {
      const txnNo = await nextNo('payment', 'RCV')
      await db.gxPayments.add({ ...baseEntity(), id: `pay:${order.id}`, txnNo, personId: input.personId, type: 'customer_payment', amount: input.received, method: input.method, at: input.at, reference: orderNo, allocations: [{ orderId: order.id, amount: input.received }], notes: `Received with ${orderNo}`, attachmentIds: [], voided: false })
    }
  }).then(() => { committed = true }).catch((e) => { if ((e as Error).message === 'DUPLICATE' || isConstraint(e)) return; throw e })
  if (!committed) {
    const saved = await db.gxOrders.get(input.id)
    if (!saved) throw new Error('The sale could not be saved (a conflicting record exists). Please try again.')
    return { order: saved, duplicate: true }
  }
  await gxAudit('order', order.id, 'create', `${order.orderNo}: ${pkr(orderTotal(order))}, received ${pkr(input.received)}`)
  return { order, duplicate: false }
}

/** Editable fields of a posted sale (financial lines are changed only via cancel/refund). */
export async function updateOrderInfo(id: string, patch: Pick<Partial<GxOrder>, 'personId' | 'notes' | 'attachmentIds' | 'method'>) {
  await db.gxOrders.where('id').equals(id).modify((o) => { Object.assign(o, patch); o.updatedAt = Date.now(); o.version++; o.syncedAt = null })
  await gxAudit('order', id, 'update', Object.keys(patch).join(', '))
}

export async function cancelOrder(id: string, reason: string) {
  await db.transaction('rw', db.gxOrders, db.gxStock, db.gxRefunds, async () => {
    const o = await db.gxOrders.get(id)
    if (!o) throw new Error('Order not found.')
    if (o.status !== 'completed') throw new Error(`This order is already ${o.status}.`)
    const refunds = await db.gxRefunds.where('orderId').equals(id).toArray()
    if (refunds.some((r) => !r.deletedAt)) throw new Error('This order has refunds. Refund the remaining items instead of cancelling.')
    const perProduct = new Map<string, number>()
    for (const i of o.items) perProduct.set(i.productId, (perProduct.get(i.productId) ?? 0) + i.qty)
    await db.gxStock.bulkPut([...perProduct].map(([pid, q]) => stockMove(`cancel:${id}:${pid}`, pid, q, 'cancel', id, `Cancel ${o.orderNo}`)))
    await db.gxOrders.update(id, { status: 'cancelled', cancelledAt: Date.now(), cancelReason: reason, updatedAt: Date.now(), version: o.version + 1, syncedAt: null })
  })
  await gxAudit('order', id, 'cancel', reason || 'Cancelled')
}

export interface RefundInput { orderId: string; amount: Paisa; restock: { productId: string; qty: number }[]; reason: string; at: string; payNow: boolean; method: PaymentMethod }
export async function refundOrder(input: RefundInput): Promise<GxRefund> {
  let refund!: GxRefund
  await db.transaction('rw', [db.gxOrders, db.gxRefunds, db.gxStock, db.gxPayments, db.kv], async () => {
    const o = await db.gxOrders.get(input.orderId)
    if (!o) throw new Error('Order not found.')
    if (o.status === 'cancelled') throw new Error('Cancelled orders cannot be refunded.')
    const prior = (await db.gxRefunds.where('orderId').equals(o.id).toArray()).filter((r) => !r.deletedAt)
    const refundedSoFar = prior.reduce((a, r) => a + r.amount, 0)
    const maxRefund = orderTotal(o) - refundedSoFar
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Refund amount must be greater than 0.')
    if (input.amount > maxRefund) throw new Error(`Refund cannot exceed ${pkr(maxRefund)} (order total minus earlier refunds).`)
    const restock: GxRefund['restock'] = []
    for (const r of input.restock.filter((x) => x.qty > 0)) {
      const line = o.items.filter((i) => i.productId === r.productId)
      const sold = line.reduce((a, i) => a + i.qty, 0)
      const returned = prior.flatMap((p) => p.restock).filter((x) => x.productId === r.productId).reduce((a, x) => a + x.qty, 0)
      if (!Number.isInteger(r.qty) || r.qty > sold - returned) throw new Error(`Cannot return more ${line[0]?.name ?? 'items'} than were sold (${sold - returned} left).`)
      restock.push({ productId: r.productId, qty: r.qty, unitCost: line[0].unitCost })
    }
    refund = { ...baseEntity(), id: uid(), orderId: o.id, amount: input.amount, restock, reason: input.reason, at: input.at }
    await db.gxRefunds.add(refund)
    if (restock.length) await db.gxStock.bulkAdd(restock.map((x) => stockMove(`refund:${refund.id}:${x.productId}`, x.productId, x.qty, 'refund', refund.id, `Refund ${o.orderNo}`, input.at)))
    if (input.payNow) {
      const txnNo = await nextNo('payment', 'RFD')
      await db.gxPayments.add({ ...baseEntity(), id: `rfp:${refund.id}`, txnNo, personId: o.personId, type: 'refund_paid', amount: input.amount, method: input.method, at: input.at, reference: o.orderNo, allocations: [{ orderId: o.id, amount: -input.amount }], notes: input.reason, attachmentIds: [], voided: false })
    }
    if (refundedSoFar + input.amount >= orderTotal(o)) await db.gxOrders.update(o.id, { status: 'refunded', updatedAt: Date.now(), version: o.version + 1, syncedAt: null })
  })
  await gxAudit('refund', refund.id, 'refund', `${pkr(refund.amount)} on order ${input.orderId}${input.reason ? ` — ${input.reason}` : ''}`)
  return refund
}

/* ---------------- Payments ---------------- */
export interface PaymentInput extends Omit<GxPayment, keyof import('@/types/models').BaseEntity | 'txnNo' | 'voided'> { id: string }

export async function addPayment(input: PaymentInput): Promise<{ payment: GxPayment; duplicate: boolean }> {
  const existing = await db.gxPayments.get(input.id)
  if (existing) return { payment: existing, duplicate: true }
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Amount must be greater than 0.')
  const allocated = input.allocations.reduce((a, x) => a + x.amount, 0)
  if (allocated > input.amount) throw new Error('Allocated amounts exceed the payment amount.')
  if (input.allocations.length && input.type !== 'customer_payment' && input.type !== 'customer_deposit') throw new Error('Only customer payments and deposits can be allocated to orders.')
  let payment!: GxPayment
  let committed = false
  await db.transaction('rw', [db.gxPayments, db.gxOrders, db.gxRefunds, db.kv], async () => {
    if (await db.gxPayments.get(input.id)) throw new Error('DUPLICATE')
    const payments = await db.gxPayments.toArray()
    for (const a of input.allocations) {
      if (a.amount <= 0) throw new Error('Allocation amounts must be greater than 0.')
      const o = await db.gxOrders.get(a.orderId)
      if (!o || o.status === 'cancelled') throw new Error('You can only allocate to open orders.')
      const bal = orderBalance(o, payments, await db.gxRefunds.where('orderId').equals(o.id).toArray()).balance
      if (a.amount > bal) throw new Error(`Allocation to ${o.orderNo} exceeds its balance (${pkr(bal)}).`)
    }
    const prefix = { customer_payment: 'RCV', customer_deposit: 'DEP', owner_contribution: 'CAP', loan_in: 'LON', payout: 'PAY', owner_drawing: 'DRW', refund_paid: 'RFD', adjustment: 'ADJ' }[input.type]
    payment = { ...baseEntity(), ...input, txnNo: await nextNo('payment', prefix), voided: false }
    await db.gxPayments.add(payment)
  }).then(() => { committed = true }).catch((e) => { if ((e as Error).message === 'DUPLICATE' || isConstraint(e)) return; throw e })
  if (!committed) {
    const saved = await db.gxPayments.get(input.id)
    if (!saved) throw new Error('The payment could not be saved (a conflicting record exists). Please try again.')
    return { payment: saved, duplicate: true }
  }
  await gxAudit('payment', payment.id, 'create', `${payment.txnNo} ${payment.type} ${pkr(payment.amount)}`)
  return { payment, duplicate: false }
}

/** Posted payments are voided (kept for audit), never deleted. */
export async function voidPayment(id: string, reason: string) {
  const p = await db.gxPayments.get(id)
  if (!p) throw new Error('Payment not found.')
  if (p.voided) throw new Error('Already voided.')
  await db.gxPayments.update(id, { voided: true, notes: `${p.notes}${p.notes ? '\n' : ''}VOID: ${reason}`, updatedAt: Date.now(), version: p.version + 1, syncedAt: null })
  await gxAudit('payment', id, 'void', `${p.txnNo} ${pkr(p.amount)} — ${reason}`)
}

/* ---------------- Helpers for UI ---------------- */
export const localDateTime = (iso: string, tz: string) => { const z = zoned(iso, tz); return { ...z, label: `${z.date} ${z.time}` } }
export const newSubmissionId = () => uid()
