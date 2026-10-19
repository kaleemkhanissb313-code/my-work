// @vitest-environment node
import { db } from '@/lib/db'
import { addPayment, adjustStock, cancelOrder, createOrder, createProduct, refundOrder, updateGxSettings, updateProduct, voidPayment, type OrderInput } from './service'
import { orderBalance, stockOf } from './engine'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const sale = (id: string, productId: string, qty: number, o: Partial<OrderInput> = {}): OrderInput => ({
  id, personId: null, items: [{ productId, qty, unitPrice: 100000 }], discount: 0, tax: 0, method: 'cash', at: '2026-10-20T07:00:00.000Z', notes: '', attachmentIds: [], received: 0, ...o,
})
const stock = async (pid: string) => stockOf(pid, await db.gxStock.toArray())

describe('GLAMIEX services', () => {
  it('creates products with opening stock and enforces unique SKUs', async () => {
    const p = await createProduct({ name: 'Shirt', sku: ' sh 01 ', buyPrice: 50000, sellPrice: 100000 }, 10)
    expect(p.sku).toBe('SH-01')
    expect(await stock(p.id)).toBe(10)
    await expect(createProduct({ name: 'Other', sku: 'sh-01' }, 0)).rejects.toThrow(/already used/)
    await adjustStock(p.id, 5, 'purchase', 'restock')
    expect(await stock(p.id)).toBe(15)
  })

  it('posts a sale atomically, snapshots cost, and is idempotent on re-submit', async () => {
    const p = await createProduct({ name: 'Shirt', sku: 'S1', buyPrice: 50000, sellPrice: 100000 }, 10)
    const first = await createOrder(sale('sub-1', p.id, 3, { received: 100000 }))
    expect(first.duplicate).toBe(false)
    expect(first.order.orderNo).toBe('GX-00001')
    expect(first.order.items[0].unitCost).toBe(50000)
    const again = await createOrder(sale('sub-1', p.id, 3, { received: 100000 })) // double click / retry
    expect(again.duplicate).toBe(true)
    expect(await stock(p.id)).toBe(7) // deducted once
    expect(await db.gxOrders.count()).toBe(1)
    expect(await db.gxPayments.count()).toBe(1)
    // Changing the product price later must not rewrite history
    await updateProduct(p.id, { buyPrice: 90000 })
    expect((await db.gxOrders.get('sub-1'))!.items[0].unitCost).toBe(50000)
  })

  it('blocks overselling unless negative stock is allowed', async () => {
    const p = await createProduct({ name: 'Bag', sku: 'B1' }, 2)
    await expect(createOrder(sale('s', p.id, 3))).rejects.toThrow(/Not enough stock/)
    expect(await db.gxOrders.count()).toBe(0)
    await updateGxSettings({ allowNegativeStock: true })
    await createOrder(sale('s2', p.id, 3))
    expect(await stock(p.id)).toBe(-1)
  })

  it('validates order inputs', async () => {
    const p = await createProduct({ name: 'Bag', sku: 'B2' }, 5)
    await expect(createOrder(sale('x', p.id, 0))).rejects.toThrow(/whole numbers/)
    await expect(createOrder(sale('y', p.id, 1, { discount: 999999 }))).rejects.toThrow(/Discount/)
    await expect(createOrder(sale('z', p.id, 1, { received: 200000 }))).rejects.toThrow(/more than the order total/)
  })

  it('cancels by reversing stock, and refunds with restock and status changes', async () => {
    const p = await createProduct({ name: 'Cap', sku: 'C1', buyPrice: 20000 }, 10)
    await createOrder(sale('a', p.id, 2))
    await cancelOrder('a', 'customer changed mind')
    expect(await stock(p.id)).toBe(10)
    await expect(cancelOrder('a', '')).rejects.toThrow(/already cancelled/)

    await createOrder(sale('b', p.id, 4, { received: 400000 }))
    expect(await stock(p.id)).toBe(6)
    await expect(refundOrder({ orderId: 'b', amount: 500000, restock: [], reason: '', at: '2026-10-21T07:00:00.000Z', payNow: false, method: 'cash' })).rejects.toThrow(/cannot exceed/)
    await expect(refundOrder({ orderId: 'b', amount: 100000, restock: [{ productId: p.id, qty: 5 }], reason: '', at: '2026-10-21T07:00:00.000Z', payNow: false, method: 'cash' })).rejects.toThrow(/more/)
    await refundOrder({ orderId: 'b', amount: 100000, restock: [{ productId: p.id, qty: 1 }], reason: 'damaged', at: '2026-10-21T07:00:00.000Z', payNow: true, method: 'cash' })
    expect(await stock(p.id)).toBe(7)
    expect((await db.gxOrders.get('b'))!.status).toBe('completed')
    expect((await db.gxPayments.toArray()).some((x) => x.type === 'refund_paid' && x.amount === 100000)).toBe(true)
    // Cash refund on a fully-paid order: order and customer both end up settled (no phantom balance)
    const ob = orderBalance((await db.gxOrders.get('b'))!, await db.gxPayments.toArray(), await db.gxRefunds.toArray())
    expect(ob).toMatchObject({ due: 300000, paid: 300000, balance: 0, status: 'paid' })
    await refundOrder({ orderId: 'b', amount: 300000, restock: [{ productId: p.id, qty: 3 }], reason: '', at: '2026-10-22T07:00:00.000Z', payNow: false, method: 'cash' })
    expect((await db.gxOrders.get('b'))!.status).toBe('refunded')
    await expect(cancelOrder('b', '')).rejects.toThrow()
  })

  it('allocates payments without exceeding order balances; voided payments stop counting', async () => {
    const p = await createProduct({ name: 'Mug', sku: 'M1' }, 10)
    await createOrder(sale('o', p.id, 2)) // total Rs 2,000
    await expect(addPayment({ id: 'p0', personId: null, type: 'customer_payment', amount: 300000, method: 'cash', at: '2026-10-20T08:00:00.000Z', reference: '', allocations: [{ orderId: 'o', amount: 300000 }], notes: '', attachmentIds: [] })).rejects.toThrow(/exceeds its balance/)
    const r = await addPayment({ id: 'p1', personId: null, type: 'customer_payment', amount: 150000, method: 'bank', at: '2026-10-20T08:00:00.000Z', reference: 'TID-9', allocations: [{ orderId: 'o', amount: 150000 }], notes: '', attachmentIds: [] })
    expect(r.payment.txnNo).toBe('RCV-00001')
    expect((await addPayment({ ...r.payment, id: 'p1' })).duplicate).toBe(true)
    const o = (await db.gxOrders.get('o'))!
    expect(orderBalance(o, await db.gxPayments.toArray(), []).balance).toBe(50000)
    await voidPayment('p1', 'entered twice')
    expect(orderBalance(o, await db.gxPayments.toArray(), []).balance).toBe(200000)
    expect((await db.gxAudit.toArray()).some((a) => a.action === 'void')).toBe(true)
  })
})
