// @vitest-environment node
import { db } from '@/lib/db'
import { createOrder, createProduct, refundOrder } from './service'
import { stockOf, summary, type GxData } from './engine'
import {
  addNpPayment, updateNpPayment, addRiderPayment, assignPickup, inspectReturn, postReturnRefund, receiveReturn, saveNpPerson, savePartner, saveReturn, saveShipment,
  seedNamesPayments, setShipmentStatus, voidNpPayment, type PartnerInput, type ReturnInput,
} from './logisticsService'
import { logisticsSummary, npTotals, partnerAccount, returnCalc, shipmentEarning } from './logistics'

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const ALL = { from: '2000-01-01', to: '2100-01-01' }
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const load = async (): Promise<GxData> => ({
  products: await db.gxProducts.toArray(), stock: await db.gxStock.toArray(), orders: await db.gxOrders.toArray(), refunds: await db.gxRefunds.toArray(),
  people: await db.gxPeople.toArray(), payments: await db.gxPayments.toArray(), adIncome: [], adSpend: [], expenses: [],
  returns: await db.gxReturns.toArray(), shipments: await db.gxShipments.toArray(), partners: await db.gxPartners.toArray(), riderPays: await db.gxRiderPays.toArray(),
  npPeople: await db.npPeople.toArray(), npPayments: await db.npPayments.toArray(),
})
const partner = (o: Partial<PartnerInput> = {}): PartnerInput => ({
  name: 'Ali Rider', kind: 'rider', code: 'R1', phone: '', email: '', method: 'cash', rateRule: 'per_order', perOrder: 10000, perProduct: 3000, perKm: 0,
  pickupRate: 5000, countPickupAsDelivery: false, failedPolicy: 'none', failedFixed: 0, returnedPolicy: 'none', returnedFixed: 0, status: 'active', notes: '', attachmentIds: [], ...o,
})
const ret = (orderId: string, productId: string, qty: number, o: Partial<ReturnInput> = {}): ReturnInput => ({
  orderId, productId, qtyReturned: qty, at: new Date().toISOString(), reason: 'damaged', refundAmount: 0, shippingCost: 0, handlingCost: 0, otherCost: 0,
  condition: '', notes: '', attachmentIds: [], customerName: '', customerContact: '', imageId: null, ...o,
})
const ship = (partnerId: string | null, qty = 1) => ({
  orderId: null, customerName: 'C', customerAddress: '', customerPhone: '', items: [{ productId: 'x', name: 'Item', qty }], partnerId, distanceKm: null, expectedDate: '',
  customerCharge: 0, actualCost: 0, extraCharge: 0, trackingNo: '', proofIds: [], notes: '', attachmentIds: [],
})

describe('Names & Payments', () => {
  it('seeds the five people once with only Salman and Awais paid, and totals are correct', async () => {
    await seedNamesPayments()
    await seedNamesPayments() // second run must not duplicate anything
    const t = npTotals(await db.npPeople.toArray(), await db.npPayments.toArray())
    expect(t.rows.map((r) => r.person.name).sort()).toEqual(['Awais', 'Hasnain Malik', 'Kaleem', 'Noman', 'Salman'])
    expect(t.obligations).toBe(25_000_000)
    expect(t.received).toBe(10_000_000)
    expect(t.remaining).toBe(15_000_000)
    expect(t.paidPeople).toBe(2)
    expect(t.pendingPeople).toBe(3)
    expect(t.rows.filter((r) => r.status === 'paid').map((r) => r.person.name).sort()).toEqual(['Awais', 'Salman'])
    expect(t.rows.filter((r) => !['Salman', 'Awais'].includes(r.person.name)).every((r) => r.status === 'pending' && r.paid === 0)).toBe(true)
    expect(await db.npPayments.count()).toBe(2)
  })

  it('on a device set up earlier, records Awais’s reported payment exactly once', async () => {
    // Earlier setup: people exist, only Salman paid, initial setup already done.
    for (const n of ['Kaleem', 'Salman', 'Awais', 'Noman', 'Hasnain Malik']) await saveNpPerson({ name: n, phone: '', obligation: 5_000_000, notes: '' }, null)
    await db.kv.put({ key: 'np.seeded.v1', value: 1 })
    await seedNamesPayments()
    await seedNamesPayments()
    const t = npTotals(await db.npPeople.toArray(), await db.npPayments.toArray())
    expect(t.rows.find((r) => r.person.name === 'Awais')).toMatchObject({ paid: 5_000_000, remaining: 0, status: 'paid' })
    expect((await db.npPayments.toArray()).filter((p) => p.personId === t.rows.find((r) => r.person.name === 'Awais')!.person.id)).toHaveLength(1)
  })

  it('lets the owner correct a payment amount, but never above what the person owes', async () => {
    await seedNamesPayments()
    const salman = (await db.npPeople.toArray()).find((p) => p.name === 'Salman')!
    const pay = (await db.npPayments.toArray()).find((p) => p.personId === salman.id)!
    await updateNpPayment(pay.id, { amount: 4_000_000 })
    expect(npTotals(await db.npPeople.toArray(), await db.npPayments.toArray()).rows.find((r) => r.person.id === salman.id)).toMatchObject({ paid: 4_000_000, status: 'partial' })
    await expect(updateNpPayment(pay.id, { amount: 6_000_000 })).rejects.toThrow(/more than Salman owes/)
    await expect(updateNpPayment(pay.id, { amount: 0 })).rejects.toThrow(/greater than 0/)
  })

  it('renames an existing Nauman record to Noman without duplicating it', async () => {
    await saveNpPerson({ name: 'Nauman', phone: '0311', obligation: 5_000_000, notes: '' }, null)
    await seedNamesPayments()
    await seedNamesPayments()
    const people = (await db.npPeople.toArray()).filter((p) => !p.deletedAt)
    expect(people.filter((p) => /^(noman|nauman)$/i.test(p.name)).map((p) => [p.name, p.phone])).toEqual([['Noman', '0311']])
    expect(people).toHaveLength(5)
  })

  it('updates existing people instead of creating duplicates', async () => {
    await saveNpPerson({ name: '  kaleem ', phone: '0300', obligation: 0, notes: '' }, null)
    await seedNamesPayments()
    const people = await db.npPeople.toArray()
    expect(people.filter((p) => p.name.toLowerCase().trim() === 'kaleem')).toHaveLength(1)
    expect(people.find((p) => p.phone === '0300')!.obligation).toBe(5_000_000)
    await expect(saveNpPerson({ name: 'SALMAN', phone: '', obligation: 1, notes: '' }, null)).rejects.toThrow(/already exists/)
  })

  it('supports partial and multiple payments, blocks overpayment and double submit, and voiding restores the balance', async () => {
    await seedNamesPayments()
    const awais = (await db.npPeople.toArray()).find((p) => p.name === 'Kaleem')! // a person with nothing paid yet
    const base = { personId: awais.id, at: new Date().toISOString(), method: 'cash' as const, notes: '', linkedRef: '' }
    const a = await addNpPayment({ ...base, id: 's1', amount: 2_000_000, reference: 'TX1' })
    expect((await addNpPayment({ ...base, id: 's1', amount: 2_000_000, reference: 'TX1' })).duplicate).toBe(true)
    await addNpPayment({ ...base, id: 's2', amount: 1_000_000, reference: 'TX2' })
    await expect(addNpPayment({ ...base, id: 's3', amount: 2_500_000, reference: 'TX3' })).rejects.toThrow(/remaining/)
    await expect(addNpPayment({ ...base, id: 's4', amount: 100, reference: 'tx1' })).rejects.toThrow(/already recorded/)
    let t = npTotals(await db.npPeople.toArray(), await db.npPayments.toArray())
    expect(t.rows.find((r) => r.person.id === awais.id)).toMatchObject({ paid: 3_000_000, remaining: 2_000_000, status: 'partial' })
    expect(t.received).toBe(13_000_000)
    await voidNpPayment(a.payment.id, 'entered twice')
    t = npTotals(await db.npPeople.toArray(), await db.npPayments.toArray())
    expect(t.rows.find((r) => r.person.id === awais.id)!.paid).toBe(1_000_000)
    expect(t.pendingPeople).toBe(3)
  })
})

describe('Returns', () => {
  it('records a partial return (10 sold, 3 returned, 7 retained), refunds once and restocks only after approval', async () => {
    const p = await createProduct({ name: 'Shirt', sku: 'S1', buyPrice: 50000, sellPrice: 100000 }, 20)
    const { order } = await createOrder({ id: 'o1', personId: null, items: [{ productId: p.id, qty: 10, unitPrice: 100000 }], discount: 0, tax: 0, method: 'cash', at: new Date().toISOString(), notes: '', attachmentIds: [], received: 1_000_000 })
    const stockAfterSale = stockOf(p.id, await db.gxStock.toArray())
    expect(stockAfterSale).toBe(10)
    const before = summary(await load(), ALL, TZ)

    const id = await saveReturn(ret(order.id, p.id, 3, { refundAmount: 300000, shippingCost: 20000, handlingCost: 5000 }), null)
    const r = (await db.gxReturns.get(id))!
    expect(returnCalc(r)).toMatchObject({ qtyReturned: 3, retained: 7, stockCost: 150000, refund: 300000, returnExpense: 25000 })
    await expect(saveReturn(ret(order.id, p.id, 8), null)).rejects.toThrow(/Only 7 of 10/)

    // Not received yet → cannot restock; stock unchanged
    await expect(inspectReturn(id, 'sellable')).rejects.toThrow(/received/)
    expect(stockOf(p.id, await db.gxStock.toArray())).toBe(10)

    await postReturnRefund(id, { payNow: true, method: 'cash' })
    await expect(postReturnRefund(id, { payNow: true, method: 'cash' })).rejects.toThrow(/already posted/)
    await receiveReturn(id)
    await inspectReturn(id, 'sellable')
    await expect(inspectReturn(id, 'sellable')).rejects.toThrow(/locked/)
    expect(stockOf(p.id, await db.gxStock.toArray())).toBe(13)

    const after = summary(await load(), ALL, TZ)
    expect(before.netSales - after.netSales).toBe(300000) // refund counted exactly once
    expect(before.netCogs - after.netCogs).toBe(150000) // restocked units reverse their cost once
    expect(before.netProfit - after.netProfit).toBe(300000 - 150000 + 25000) // + return shipping & handling
    expect((await db.gxPayments.toArray()).filter((x) => x.type === 'refund_paid')).toHaveLength(1)
  })

  it('never puts damaged or written-off units back into sellable stock', async () => {
    const p = await createProduct({ name: 'Mug', sku: 'M1', buyPrice: 20000, sellPrice: 50000 }, 5)
    const { order } = await createOrder({ id: 'o2', personId: null, items: [{ productId: p.id, qty: 2, unitPrice: 50000 }], discount: 0, tax: 0, method: 'cash', at: new Date().toISOString(), notes: '', attachmentIds: [], received: 0 })
    const id = await saveReturn(ret(order.id, p.id, 2), null)
    await receiveReturn(id)
    await inspectReturn(id, 'write_off')
    expect(stockOf(p.id, await db.gxStock.toArray())).toBe(3)
    expect(returnCalc((await db.gxReturns.get(id))!).recoverable).toBe(0)
  })

  it('does not double count with a refund already made from the sales screen', async () => {
    const p = await createProduct({ name: 'Cap', sku: 'C1', buyPrice: 10000, sellPrice: 30000 }, 5)
    const { order } = await createOrder({ id: 'o3', personId: null, items: [{ productId: p.id, qty: 2, unitPrice: 30000 }], discount: 0, tax: 0, method: 'cash', at: new Date().toISOString(), notes: '', attachmentIds: [], received: 60000 })
    await refundOrder({ orderId: order.id, amount: 30000, restock: [{ productId: p.id, qty: 1 }], reason: 'size', at: new Date().toISOString(), payNow: false, method: 'cash' })
    await expect(saveReturn(ret(order.id, p.id, 2), null)).rejects.toThrow(/Only 1 of 2/)
    const id = await saveReturn(ret(order.id, p.id, 1, { refundAmount: 40000 }), null)
    await expect(postReturnRefund(id, { payNow: false, method: 'cash' })).rejects.toThrow(/cannot exceed/)
  })
})

describe('Deliveries and rider payments', () => {
  it('80 deliveries × PKR 100 = PKR 8,000; paying PKR 5,000 leaves PKR 3,000 and does not change profit', async () => {
    const pid = await savePartner(partner(), null)
    for (let i = 0; i < 80; i++) { const s = await saveShipment(ship(pid, 2), null); await setShipmentStatus(s, 'delivered') }
    const failed = await saveShipment(ship(pid), null); await setShipmentStatus(failed, 'failed')
    let d = await load()
    let acc = partnerAccount(d.partners[0], d, TZ)
    expect(acc.deliveredOrders).toBe(80)
    expect(acc.deliveredUnits).toBe(160)
    expect(acc.failed).toBe(1)
    expect(acc.earned).toBe(800000) // per-order rule only — not also per product
    const profitBefore = summary(d, ALL, TZ).netProfit
    expect(profitBefore).toBe(-800000)

    const pay = { partnerId: pid, periodFrom: '2000-01-01', periodTo: '2100-01-01', additions: 0, deductions: 0, at: new Date().toISOString(), method: 'cash' as const, notes: '', attachmentIds: [] }
    await addRiderPayment({ ...pay, id: 'p1', amountPaid: 500000, reference: 'JC-1' })
    expect((await addRiderPayment({ ...pay, id: 'p1', amountPaid: 500000, reference: 'JC-1' })).duplicate).toBe(true)
    await expect(addRiderPayment({ ...pay, id: 'p2', amountPaid: 100, reference: 'jc-1' })).rejects.toThrow(/already recorded/)
    await expect(addRiderPayment({ ...pay, id: 'p3', amountPaid: 300001, reference: '' })).rejects.toThrow(/more than the amount due/)
    d = await load()
    acc = partnerAccount(d.partners[0], d, TZ)
    expect(acc.paid).toBe(500000)
    expect(acc.outstanding).toBe(300000)
    const s = summary(d, ALL, TZ)
    expect(s.netProfit).toBe(profitBefore) // settlement is not a second expense
    expect(s.riderPaid).toBe(500000)
    expect(logisticsSummary(d, ALL, TZ, 0)).toMatchObject({ deliveredOrders: 80, productsDelivered: 160, failed: 1, deliveryExpense: 800000, outstanding: 300000 })
  })

  it('applies failed / returned policies and per-product rates from the snapshot taken at assignment', async () => {
    const pid = await savePartner(partner({ rateRule: 'per_product', perProduct: 3000, failedPolicy: 'fixed', failedFixed: 2000, returnedPolicy: 'full' }), null)
    const a = await saveShipment(ship(pid, 4), null); await setShipmentStatus(a, 'delivered')
    const b = await saveShipment(ship(pid, 4), null); await setShipmentStatus(b, 'failed')
    const c = await saveShipment(ship(pid, 2), null); await setShipmentStatus(c, 'returned')
    await savePartner(partner({ rateRule: 'per_product', perProduct: 9999 }), pid) // later rate change
    const s = await db.gxShipments.toArray()
    expect(s.map(shipmentEarning).sort((x, y) => x - y)).toEqual([2000, 6000, 12000])
    await expect(saveShipment({ ...ship(null), partnerId: pid }, a)).resolves.toBe(a) // same partner → allowed
    const other = await savePartner(partner({ name: 'Other', code: 'R2' }), null)
    await expect(saveShipment({ ...ship(null), partnerId: other }, a)).rejects.toThrow(/finished/)
  })

  it('pays a return pickup at the pickup rate and does not count it as a delivery unless the policy says so', async () => {
    const p = await createProduct({ name: 'Bag', sku: 'B1', buyPrice: 50000, sellPrice: 90000 }, 5)
    const { order } = await createOrder({ id: 'o4', personId: null, items: [{ productId: p.id, qty: 1, unitPrice: 90000 }], discount: 0, tax: 0, method: 'cash', at: new Date().toISOString(), notes: '', attachmentIds: [], received: 0 })
    const pid = await savePartner(partner({ pickupRate: 7000 }), null)
    const id = await saveReturn(ret(order.id, p.id, 1), null)
    await assignPickup(id, pid, '2026-10-20', 1)
    let d = await load()
    expect(partnerAccount(d.partners[0], d, TZ).earned).toBe(0) // not earned before receipt
    await receiveReturn(id)
    d = await load()
    const acc = partnerAccount(d.partners[0], d, TZ)
    expect(acc).toMatchObject({ pickups: 1, pickupEarnings: 7000, deliveredOrders: 0, eligible: 0, outstanding: 7000 })
    expect(summary(d, ALL, TZ).returnCost).toBe(7000)
  })
})
