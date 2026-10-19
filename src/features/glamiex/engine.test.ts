import { adKpis, dailyAgg, distribution, hourly, orderBalance, personBalance, productPerformance, receivables, series, spread, summary, type GxData } from './engine'
import { parseRupees, pctChange, pkr, pkrCompact, convert } from './money'
import { presetRange, previousRange, wallToIso, zoned, bucketsInRange } from './time'
import type { GxOrder, GxPayment, GxPerson, GxProduct } from './types'

const TZ = 'Asia/Karachi' // UTC+5, no DST
const base = { createdAt: 0, updatedAt: 0, deletedAt: null, archived: false, favorite: false, pinned: false, tags: [], version: 1 }
const at = (date: string, time = '12:00') => wallToIso(date, time, TZ)
const product = (id: string, buy: number, sell: number): GxProduct => ({
  ...base, id, name: id, sku: id.toUpperCase(), category: 'Test', description: '', buyPrice: buy, sellPrice: sell, lowStockAt: 2, status: 'active',
  supplierName: '', supplierContact: '', imageIds: [], videoIds: [], dateAdded: '2026-01-01',
})
const order = (id: string, date: string, items: [string, number, number, number][], o: Partial<GxOrder> = {}): GxOrder => ({
  ...base, id, orderNo: id, personId: null, discount: 0, tax: 0, status: 'completed', method: 'cash', at: at(date), notes: '', attachmentIds: [],
  cancelledAt: null, cancelReason: '', items: items.map(([productId, qty, unitPrice, unitCost]) => ({ productId, name: productId, sku: productId, qty, unitPrice, unitCost })), ...o,
})
const pay = (id: string, type: GxPayment['type'], amount: number, date: string, o: Partial<GxPayment> = {}): GxPayment => ({
  ...base, id, txnNo: id, personId: null, type, amount, method: 'cash', at: at(date), reference: '', allocations: [], notes: '', attachmentIds: [], voided: false, ...o,
})
const person = (id: string, type: GxPerson['type'] = 'customer', opening = 0): GxPerson => ({ ...base, id, name: id, type, phone: '', email: '', address: '', openingBalance: opening, notes: '', attachmentIds: [] })

/** Known scenario (amounts in paisa; Rs 1 = 100):
 *  Shirt: cost Rs 500, price Rs 1,000. Bag: cost Rs 1,200, price Rs 2,000.
 *  o1 (Oct 5): 2 shirts + 1 bag, discount Rs 200, tax Rs 100 → gross 4,000, net 3,800, COGS 2,200, total 3,900. Customer Ali.
 *  o2 (Oct 10): 3 shirts → gross 3,000, COGS 1,500. Walk-in, unpaid.
 *  o3 (Oct 12): 1 bag — CANCELLED (must be ignored everywhere).
 *  Refund (Oct 15) of 1 shirt from o1: Rs 1,000, restocked (COGS −500, units −1).
 *  Ad income Oct 20: Rs 3,000. Ad spend Rs 3,100 over Oct 1–31 (31 days → Rs 100/day).
 *  Expenses: Shipping Rs 400 (Oct 6), Packaging Rs 100 (Oct 7).
 *  Payments: Ali pays Rs 2,000 allocated to o1 (Oct 6); Ali deposit Rs 500 (Oct 8); owner contributes Rs 10,000 (Oct 1).
 */
const data: GxData = {
  products: [product('shirt', 50000, 100000), product('bag', 120000, 200000)],
  stock: [],
  orders: [
    order('o1', '2026-10-05', [['shirt', 2, 100000, 50000], ['bag', 1, 200000, 120000]], { discount: 20000, tax: 10000, personId: 'ali' }),
    order('o2', '2026-10-10', [['shirt', 3, 100000, 50000]]),
    order('o3', '2026-10-12', [['bag', 1, 200000, 120000]], { status: 'cancelled' }),
  ],
  refunds: [{ ...base, id: 'f1', orderId: 'o1', amount: 100000, restock: [{ productId: 'shirt', qty: 1, unitCost: 50000 }], reason: 'size', at: at('2026-10-15') }],
  people: [person('ali'), person('owner', 'owner')],
  payments: [
    pay('p1', 'customer_payment', 200000, '2026-10-06', { personId: 'ali', allocations: [{ orderId: 'o1', amount: 200000 }] }),
    pay('p2', 'customer_deposit', 50000, '2026-10-08', { personId: 'ali' }),
    pay('p3', 'owner_contribution', 1000000, '2026-10-01', { personId: 'owner' }),
    pay('p4', 'customer_payment', 999900, '2026-10-09', { personId: 'ali', voided: true }),
  ],
  adIncome: [{ ...base, id: 'ai', platform: 'YouTube', campaign: '', reportDate: '2026-10-20', periodStart: '2026-10-01', periodEnd: '2026-10-20', gross: 300000, adjustments: 0, currency: 'PKR', exchangeRate: 1, netPkr: 300000, notes: '', attachmentIds: [] }],
  adSpend: [{ ...base, id: 'as', platform: 'Meta', campaign: 'Oct', campaignId: '1', amount: 310000, currency: 'PKR', exchangeRate: 1, amountPkr: 310000, start: '2026-10-01', end: '2026-10-31', clicks: 1000, impressions: 50000, conversions: 20, attributedSales: 700000, notes: '', attachmentIds: [] }],
  expenses: [
    { ...base, id: 'e1', category: 'Shipping', description: '', amount: 40000, date: '2026-10-06', method: 'cash', vendor: '', notes: '', attachmentIds: [] },
    { ...base, id: 'e2', category: 'Packaging', description: '', amount: 10000, date: '2026-10-07', method: 'cash', vendor: '', notes: '', attachmentIds: [] },
  ],
}
const OCT = { from: '2026-10-01', to: '2026-10-31' }

describe('money helpers', () => {
  it('parses and formats PKR exactly', () => {
    expect(parseRupees('1,250')).toBe(125000)
    expect(parseRupees('Rs 1,250.5')).toBe(125050)
    expect(parseRupees('0.1')).toBe(10)
    expect(parseRupees('1.234')).toBeNull()
    expect(parseRupees('abc')).toBeNull()
    expect(pkr(125000)).toBe('Rs 1,250')
    expect(pkr(125050)).toBe('Rs 1,250.50')
    expect(pkr(-5000, { decimals: 2 })).toBe('-Rs 50.00')
    expect(pkrCompact(125_000_000)).toBe('Rs 1.25M')
    expect(convert(1000, 278.5)).toBe(278500) // $10.00 → Rs 2,785.00
  })
  it('never divides by zero when comparing periods', () => {
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(0, 0)).toBe(0)
    expect(pctChange(100, 0)).toBeNull()
    expect(pctChange(-50, -100)).toBe(50)
  })
})

describe('time helpers', () => {
  it('converts between wall time in Karachi and UTC', () => {
    expect(wallToIso('2026-10-05', '00:30', TZ)).toBe('2026-10-04T19:30:00.000Z')
    expect(zoned('2026-10-04T19:30:00.000Z', TZ)).toMatchObject({ date: '2026-10-05', hour: 0, weekday: 'Monday' })
  })
  it('resolves presets and previous periods', () => {
    expect(presetRange('thisWeek', '2026-10-21')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(presetRange('lastMonth', '2026-10-21')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(previousRange({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(previousRange({ from: '2026-10-19', to: '2026-10-25' })).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(bucketsInRange({ from: '2026-01-15', to: '2026-12-31' }, 'quarter').map((b) => b.key)).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'])
  })
})

describe('accounting engine (known scenario)', () => {
  it('computes October P&L correctly', () => {
    const s = summary(data, OCT, TZ)
    expect(s.orders).toBe(2) // cancelled o3 excluded
    expect(s.grossSales).toBe(700000)
    expect(s.discounts).toBe(20000)
    expect(s.refunds).toBe(100000)
    expect(s.netSales).toBe(580000) // 7,000 − 200 − 1,000
    expect(s.tax).toBe(10000) // reported, not revenue
    expect(s.netCogs).toBe(320000) // 3,700 − 500
    expect(s.grossProfit).toBe(260000)
    expect(s.adIncome).toBe(300000)
    expect(s.adSpend).toBe(310000)
    expect(s.expenses).toBe(50000)
    expect(s.netProfit).toBe(200000) // 2,600 + 3,000 − 3,100 − 500
    expect(s.netUnits).toBe(5) // 6 sold − 1 returned
    expect(s.aov).toBe(290000)
    expect(s.bestSeller?.product.id).toBe('shirt')
  })

  it('keeps financing and deposits out of revenue and counts only real cash', () => {
    const s = summary(data, OCT, TZ)
    expect(s.financing).toBe(1000000)
    expect(s.deposits).toBe(50000)
    expect(s.customerReceipts).toBe(250000) // voided payment ignored
    expect(s.cashIn).toBe(1250000)
    expect(s.cashOut).toBe(310000 + 50000) // ad spend (on start) + expenses
    expect(s.netSales).toBe(580000) // unaffected by the Rs 10,000 contribution
  })

  it('computes order balances and statuses', () => {
    const o1 = orderBalance(data.orders[0], data.payments, data.refunds)
    expect(o1).toMatchObject({ total: 390000, refunded: 100000, paid: 200000, balance: 90000, status: 'partial' })
    expect(orderBalance(data.orders[1], data.payments, data.refunds).status).toBe('unpaid')
    expect(orderBalance(data.orders[2], data.payments, data.refunds)).toMatchObject({ status: 'cancelled', balance: 0 })
  })

  it('computes person balances and receivables', () => {
    const ali = personBalance(data.people[0], data, TZ)
    // charges 3,900 − refund 1,000 − received (2,000 + 500) = 400
    expect(ali).toMatchObject({ charges: 390000, refunds: 100000, received: 250000, balance: 40000 })
    expect(personBalance(data.people[1], data, TZ).balance).toBe(-1000000) // business owes the owner (equity)
    const rec = receivables(data, TZ)
    expect(rec.owed).toBe(40000 + 300000) // Ali + unpaid walk-in o2
    expect(personBalance(data.people[0], data, TZ, '2026-10-05').balance).toBe(390000) // before any payment
  })

  it('spreads ad spend exactly across days and ranges', () => {
    expect(spread(1000, 3)).toEqual([334, 333, 333])
    expect(spread(-1000, 3).reduce((a, b) => a + b)).toBe(-1000)
    const firstWeek = summary(data, { from: '2026-10-01', to: '2026-10-07' }, TZ)
    expect(firstWeek.adSpend).toBe(70000)
    const weeks = series(data, OCT, 'week', TZ)
    expect(weeks.reduce((a, w) => a + w.adSpend, 0)).toBe(310000)
    expect(weeks.reduce((a, w) => a + w.netProfit, 0)).toBe(200000) // series sums to the summary
  })

  it('product performance, hourly, distribution and ad KPIs', () => {
    const perf = productPerformance(data, OCT, TZ)
    const shirt = perf.find((x) => x.product.id === 'shirt')!
    expect(shirt).toMatchObject({ units: 4, revenue: 400000, cost: 200000, profit: 200000 })
    expect(hourly(data, OCT, TZ)[12].orders).toBe(2)
    const dist = distribution(data, OCT, TZ)
    expect(dist.rows.find((r) => r.name === 'Net profit')?.value).toBe(200000)
    expect(dist.rows.find((r) => r.name === 'Shipping')?.value).toBe(40000)
    const k = adKpis(data.adSpend)
    expect(k).toMatchObject({ cpc: 310, cpa: 15500, conversionRate: 2 })
    expect(k.roas).toBeCloseTo(700000 / 310000)
    expect(adKpis([]).cpc).toBeNull()
  })

  it('daily aggregation ignores days outside the range', () => {
    const m = dailyAgg(data, { from: '2026-10-10', to: '2026-10-10' }, TZ)
    expect([...m.keys()]).toEqual(['2026-10-10'])
    expect(m.get('2026-10-10')!.grossSales).toBe(300000)
  })
})
