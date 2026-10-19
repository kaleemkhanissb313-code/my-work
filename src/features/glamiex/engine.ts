/**
 * GLAMIEX accounting engine (pure functions, no DB access, fully unit-tested).
 *
 * Accounting assumptions (also shown in GLAMIEX → Settings):
 *  1. Sales are recognised on the sale date. Cancelled orders are excluded entirely. Refunded orders stay as
 *     sales and the refund record reverses revenue on the REFUND date.
 *  2. Net sales = Σ(qty × unit price) − order discounts − refunds. Tax is collected on behalf of the government
 *     and is NOT revenue (reported separately).
 *  3. COGS uses the unit-cost snapshot stored on each sale; restocked refund units reverse their COGS.
 *  4. Gross profit = net sales − COGS.
 *     Net profit = gross profit + advertising income − advertising spend − business expenses.
 *  5. Advertising income is recognised on its report date (net, converted to PKR).
 *     Advertising spend is spread evenly per day across the campaign's start–end dates (so a monthly campaign
 *     counts in each week it ran). In cash reports, ad spend is treated as paid on the campaign start date.
 *  6. Deposits from customers are customer credit (a liability), not revenue. Owner contributions and loans are
 *     financing. Owner drawings are not expenses. None of these affect profit.
 *  7. Cash received = recorded payments only (not order value).
 *  8. Receivables = what customers still owe as at the end of the range (opening balance + sales − refunds −
 *     payments/deposits ± adjustments), never negative per customer; negative balances are shown as customer credit.
 */
import type { GxAdIncome, GxAdSpend, GxExpense, GxOrder, GxPayment, GxPerson, GxProduct, GxRefund, GxStockMove, Paisa, PaymentType } from './types'
import { bucketOf, bucketsInRange, daysInclusive, inRange, zoned, type DateRange, type Grouping } from './time'
import { addDays } from 'date-fns'
import { parseDate, toISODate } from '@/lib/dates'
import { safeRatio } from './money'

export interface GxData {
  products: GxProduct[]
  stock: GxStockMove[]
  orders: GxOrder[]
  refunds: GxRefund[]
  people: GxPerson[]
  payments: GxPayment[]
  adIncome: GxAdIncome[]
  adSpend: GxAdSpend[]
  expenses: GxExpense[]
}

const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt)

/* ---------------- Order-level maths ---------------- */
export const orderGross = (o: Pick<GxOrder, 'items'>) => o.items.reduce((a, i) => a + i.qty * i.unitPrice, 0)
export const orderCost = (o: Pick<GxOrder, 'items'>) => o.items.reduce((a, i) => a + i.qty * i.unitCost, 0)
export const orderUnits = (o: Pick<GxOrder, 'items'>) => o.items.reduce((a, i) => a + i.qty, 0)
/** Amount the customer must pay (incl. tax). */
export const orderTotal = (o: Pick<GxOrder, 'items' | 'discount' | 'tax'>) => orderGross(o) - o.discount + o.tax

export function orderPaid(orderId: string, payments: GxPayment[]): Paisa {
  let s = 0
  for (const p of payments) if (!p.voided && !p.deletedAt) for (const a of p.allocations) if (a.orderId === orderId) s += a.amount
  return s
}
export const orderRefunded = (orderId: string, refunds: GxRefund[]) => refunds.filter((r) => r.orderId === orderId && !r.deletedAt).reduce((a, r) => a + r.amount, 0)

export type PayStatus = 'paid' | 'partial' | 'unpaid' | 'refunded' | 'cancelled'
export function orderBalance(o: GxOrder, payments: GxPayment[], refunds: GxRefund[]) {
  const total = orderTotal(o)
  const refunded = orderRefunded(o.id, refunds)
  const paid = orderPaid(o.id, payments)
  const due = o.status === 'cancelled' ? 0 : total - refunded
  const balance = due - paid
  const status: PayStatus = o.status === 'cancelled' ? 'cancelled' : o.status === 'refunded' ? 'refunded' : balance <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
  return { total, refunded, paid, due, balance, status }
}

/* ---------------- Daily aggregation (single source of truth) ---------------- */
export interface Agg {
  grossSales: Paisa; discounts: Paisa; tax: Paisa; refunds: Paisa; cogs: Paisa; refundCost: Paisa
  units: number; refundUnits: number; orders: number
  adIncome: Paisa; adSpend: Paisa; expenses: Paisa
  cashIn: Paisa; cashOut: Paisa; customerReceipts: Paisa; deposits: Paisa; financing: Paisa; drawings: Paisa
}
const emptyAgg = (): Agg => ({
  grossSales: 0, discounts: 0, tax: 0, refunds: 0, cogs: 0, refundCost: 0, units: 0, refundUnits: 0, orders: 0,
  adIncome: 0, adSpend: 0, expenses: 0, cashIn: 0, cashOut: 0, customerReceipts: 0, deposits: 0, financing: 0, drawings: 0,
})
const addAgg = (a: Agg, b: Partial<Agg>) => { for (const k in b) (a as unknown as Record<string, number>)[k] += (b as Record<string, number>)[k] ?? 0 }

const IN_TYPES: PaymentType[] = ['customer_payment', 'customer_deposit', 'owner_contribution', 'loan_in']
const OUT_TYPES: PaymentType[] = ['payout', 'owner_drawing', 'refund_paid']

/** Split an integer amount across `days` days exactly (remainder goes to the earliest days). */
export function spread(amount: Paisa, days: number): Paisa[] {
  if (days <= 0) return []
  const base = Math.trunc(amount / days)
  let rem = amount - base * days
  return Array.from({ length: days }, () => {
    const extra = rem > 0 ? 1 : rem < 0 ? -1 : 0
    rem -= extra
    return base + extra
  })
}

export function dailyAgg(d: GxData, r: DateRange, tz: string): Map<string, Agg> {
  const m = new Map<string, Agg>()
  const at = (date: string) => { let a = m.get(date); if (!a) { a = emptyAgg(); m.set(date, a) } return a }
  const orders = live(d.orders)
  const orderById = new Map(orders.map((o) => [o.id, o]))

  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const date = zoned(o.at, tz).date
    if (!inRange(date, r)) continue
    addAgg(at(date), { grossSales: orderGross(o), discounts: o.discount, tax: o.tax, cogs: orderCost(o), units: orderUnits(o), orders: 1 })
  }
  for (const f of live(d.refunds)) {
    const o = orderById.get(f.orderId)
    if (!o || o.status === 'cancelled') continue
    const date = zoned(f.at, tz).date
    if (!inRange(date, r)) continue
    addAgg(at(date), { refunds: f.amount, refundCost: f.restock.reduce((a, x) => a + x.qty * x.unitCost, 0), refundUnits: f.restock.reduce((a, x) => a + x.qty, 0) })
  }
  for (const x of live(d.adIncome)) if (inRange(x.reportDate, r)) addAgg(at(x.reportDate), { adIncome: x.netPkr })
  for (const x of live(d.adSpend)) {
    const start = x.start, end = x.end && x.end >= x.start ? x.end : x.start
    const days = daysInclusive(start, end)
    const parts = spread(x.amountPkr, days)
    for (let i = 0; i < days; i++) {
      const day = toISODate(addDays(parseDate(start), i))
      if (inRange(day, r)) at(day).adSpend += parts[i]
    }
    if (inRange(start, r)) at(start).cashOut += x.amountPkr
  }
  for (const x of live(d.expenses)) if (inRange(x.date, r)) addAgg(at(x.date), { expenses: x.amount, cashOut: x.amount })
  for (const p of d.payments) {
    if (p.voided || p.deletedAt) continue
    const date = zoned(p.at, tz).date
    if (!inRange(date, r)) continue
    const a = at(date)
    if (IN_TYPES.includes(p.type)) a.cashIn += p.amount
    if (OUT_TYPES.includes(p.type)) a.cashOut += p.amount
    if (p.type === 'customer_payment') a.customerReceipts += p.amount
    if (p.type === 'customer_deposit') { a.deposits += p.amount; a.customerReceipts += p.amount }
    if (p.type === 'owner_contribution' || p.type === 'loan_in') a.financing += p.amount
    if (p.type === 'owner_drawing') a.drawings += p.amount
  }
  return m
}

export interface Metrics extends Agg {
  netSales: Paisa; netCogs: Paisa; grossProfit: Paisa; netProfit: Paisa; netUnits: number
  aov: Paisa | null; grossMargin: number | null; netMargin: number | null; netCash: Paisa
}
export function metricsFrom(a: Agg): Metrics {
  const netSales = a.grossSales - a.discounts - a.refunds
  const netCogs = a.cogs - a.refundCost
  const grossProfit = netSales - netCogs
  const netProfit = grossProfit + a.adIncome - a.adSpend - a.expenses
  return {
    ...a, netSales, netCogs, grossProfit, netProfit, netUnits: a.units - a.refundUnits,
    aov: a.orders ? Math.round(netSales / a.orders) : null,
    grossMargin: safeRatio(grossProfit, netSales), netMargin: safeRatio(netProfit, netSales), netCash: a.cashIn - a.cashOut,
  }
}
export const sumAggs = (aggs: Iterable<Agg>) => { const t = emptyAgg(); for (const a of aggs) addAgg(t, a); return t }

/* ---------------- Balances ---------------- */
/** Balance of a person as at `asOf` (inclusive, local date). Positive = they owe the business. */
export function personBalance(p: GxPerson, d: GxData, tz: string, asOf?: string) {
  const before = (iso: string) => !asOf || zoned(iso, tz).date <= asOf
  let charges = 0, refunds = 0, received = 0, paidOut = 0, adjustments = 0
  const orders = live(d.orders).filter((o) => o.personId === p.id && o.status !== 'cancelled' && before(o.at))
  const ids = new Set(orders.map((o) => o.id))
  for (const o of orders) charges += orderTotal(o)
  for (const f of live(d.refunds)) if (ids.has(f.orderId) && before(f.at)) refunds += f.amount
  for (const x of d.payments) {
    if (x.voided || x.deletedAt || x.personId !== p.id || !before(x.at)) continue
    if (IN_TYPES.includes(x.type)) received += x.amount
    else if (OUT_TYPES.includes(x.type)) paidOut += x.amount
    else if (x.type === 'adjustment') adjustments += x.amount
  }
  const balance = p.openingBalance + charges - refunds - received + paidOut - adjustments
  return { opening: p.openingBalance, charges, refunds, received, paidOut, adjustments, balance, orders: orders.length }
}

export function receivables(d: GxData, tz: string, asOf?: string) {
  let owed = 0, credit = 0
  const rows: { person: GxPerson; balance: Paisa }[] = []
  for (const p of live(d.people)) {
    if (p.type !== 'customer') continue
    const { balance } = personBalance(p, d, tz, asOf)
    if (balance > 0) owed += balance
    if (balance < 0) credit += -balance
    if (balance !== 0) rows.push({ person: p, balance })
  }
  // Orders with no customer still have balances due (walk-in credit sales).
  for (const o of live(d.orders)) {
    if (o.personId || o.status === 'cancelled' || (asOf && zoned(o.at, tz).date > asOf)) continue
    const b = orderBalance(o, d.payments, d.refunds).balance
    if (b > 0) owed += b
  }
  return { owed, credit, rows: rows.sort((a, b) => b.balance - a.balance) }
}

/* ---------------- Products ---------------- */
export const stockOf = (productId: string, stock: GxStockMove[]) => stock.reduce((a, s) => (s.productId === productId && !s.deletedAt ? a + s.qty : a), 0)

export interface ProductPerf { product: GxProduct; units: number; revenue: Paisa; cost: Paisa; profit: Paisa; margin: number | null; stock: number }
/** Per-product performance in a range (line revenue before order-level discounts; refunds reverse restocked units). */
export function productPerformance(d: GxData, r: DateRange | null, tz: string): ProductPerf[] {
  const map = new Map<string, ProductPerf>()
  for (const p of live(d.products)) map.set(p.id, { product: p, units: 0, revenue: 0, cost: 0, profit: 0, margin: null, stock: stockOf(p.id, d.stock) })
  const orderById = new Map(d.orders.map((o) => [o.id, o]))
  for (const o of live(d.orders)) {
    if (o.status === 'cancelled' || (r && !inRange(zoned(o.at, tz).date, r))) continue
    for (const i of o.items) {
      const x = map.get(i.productId)
      if (!x) continue
      x.units += i.qty; x.revenue += i.qty * i.unitPrice; x.cost += i.qty * i.unitCost
    }
  }
  for (const f of live(d.refunds)) {
    const o = orderById.get(f.orderId)
    if (!o || o.status === 'cancelled' || (r && !inRange(zoned(f.at, tz).date, r))) continue
    for (const s of f.restock) {
      const x = map.get(s.productId)
      const line = o.items.find((i) => i.productId === s.productId)
      if (!x || !line) continue
      x.units -= s.qty; x.revenue -= s.qty * line.unitPrice; x.cost -= s.qty * s.unitCost
    }
  }
  for (const x of map.values()) { x.profit = x.revenue - x.cost; x.margin = safeRatio(x.profit, x.revenue) }
  return [...map.values()]
}

/* ---------------- Summary, series, distributions ---------------- */
export function summary(d: GxData, r: DateRange, tz: string) {
  const m = metricsFrom(sumAggs(dailyAgg(d, r, tz).values()))
  const perf = productPerformance(d, r, tz).filter((x) => x.units > 0).sort((a, b) => b.units - a.units || b.revenue - a.revenue)
  const rec = receivables(d, tz, r.to)
  return { ...m, bestSeller: perf[0] ?? null, receivables: rec.owed, customerCredit: rec.credit }
}

export interface SeriesPoint extends Metrics { key: string; label: string }
export function series(d: GxData, r: DateRange, g: Exclude<Grouping, 'hour'>, tz: string): SeriesPoint[] {
  const daily = dailyAgg(d, r, tz)
  const buckets = new Map(bucketsInRange(r, g).map((b) => [b.key, { ...b, agg: emptyAgg() }]))
  for (const [date, a] of daily) {
    const b = bucketOf(date, g)
    let slot = buckets.get(b.key)
    if (!slot) { slot = { ...b, agg: emptyAgg() }; buckets.set(b.key, slot) }
    addAgg(slot.agg, a)
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map((b) => ({ key: b.key, label: b.label, ...metricsFrom(b.agg) }))
}

export function hourly(d: GxData, r: DateRange, tz: string) {
  const out = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, orders: 0, sales: 0 }))
  for (const o of live(d.orders)) {
    if (o.status === 'cancelled') continue
    const z = zoned(o.at, tz)
    if (!inRange(z.date, r)) continue
    out[z.hour].orders += 1
    out[z.hour].sales += orderGross(o) - o.discount
  }
  return out
}

export function weekdayTotals(d: GxData, r: DateRange, tz: string) {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const out = names.map((n) => ({ day: n.slice(0, 3), orders: 0, sales: 0 }))
  for (const o of live(d.orders)) {
    if (o.status === 'cancelled') continue
    const z = zoned(o.at, tz)
    if (!inRange(z.date, r)) continue
    const i = names.indexOf(z.weekday)
    if (i >= 0) { out[i].orders++; out[i].sales += orderGross(o) - o.discount }
  }
  return out
}

/** Where the money went: COGS, ad spend, each expense category, and net profit (if positive). */
export function distribution(d: GxData, r: DateRange, tz: string) {
  const m = summary(d, r, tz)
  const cats = new Map<string, number>()
  for (const x of live(d.expenses)) if (inRange(x.date, r)) cats.set(x.category || 'Other', (cats.get(x.category || 'Other') ?? 0) + x.amount)
  const rows = [
    { name: 'Cost of goods', value: m.netCogs },
    { name: 'Advertising spend', value: m.adSpend },
    ...[...cats].map(([name, value]) => ({ name, value })),
    { name: 'Net profit', value: Math.max(0, m.netProfit) },
  ].filter((x) => x.value > 0)
  return { rows, loss: m.netProfit < 0 ? -m.netProfit : 0 }
}

/* ---------------- Advertising KPIs ---------------- */
export function adKpis(spend: GxAdSpend[]) {
  const s = live(spend)
  const total = s.reduce((a, x) => a + x.amountPkr, 0)
  const clicks = s.reduce((a, x) => a + (x.clicks ?? 0), 0)
  const impressions = s.reduce((a, x) => a + (x.impressions ?? 0), 0)
  const conversions = s.reduce((a, x) => a + (x.conversions ?? 0), 0)
  const attributed = s.reduce((a, x) => a + (x.attributedSales ?? 0), 0)
  const hasAttr = s.some((x) => x.attributedSales != null)
  return {
    total, clicks, impressions, conversions, attributed,
    cpc: clicks ? Math.round(total / clicks) : null,
    cpa: conversions ? Math.round(total / conversions) : null,
    ctr: impressions ? (clicks / impressions) * 100 : null,
    conversionRate: clicks ? (conversions / clicks) * 100 : null,
    roas: hasAttr && total ? attributed / total : null,
    roi: hasAttr && total ? ((attributed - total) / total) * 100 : null,
  }
}
export const campaignKpis = (x: GxAdSpend) => adKpis([x])
