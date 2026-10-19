/**
 * Returns, deliveries and rider accounting (pure functions, no DB access, unit-tested in logistics.test.ts).
 *
 * Rules:
 *  - Return refunds and restocks are posted as ordinary GxRefund records, so the sales engine (net sales, COGS,
 *    stock) already includes them. Nothing here adds the refund or the product cost a second time.
 *  - Return costs = return shipping (pickup rider pay, or the direct shipping cost when no rider) + handling + other.
 *  - Delivery cost = rider earnings for finished shipments (accrual on the final-status date) + the cost of
 *    couriers without a partner account. Rider settlements are cash paid against that payable, not new expenses.
 *  - Customer-paid delivery charges are delivery income, kept separate from delivery cost.
 *  - Exactly ONE rate rule applies per shipment (the partner's selected rule, snapshotted at assignment).
 */
import type { GxPartner, GxReturn, GxRiderPayment, GxShipment, NpPayment, NpPerson, RateSnapshot } from './logisticsTypes'
import type { Paisa } from './types'
import { inRange, zoned, type DateRange } from './time'

export interface LgData { returns: GxReturn[]; shipments: GxShipment[]; partners: GxPartner[]; riderPays: GxRiderPayment[] }
const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt)

export const rateOf = (p: GxPartner): RateSnapshot => ({
  rule: p.rateRule, perOrder: p.perOrder, perProduct: p.perProduct, perKm: p.perKm,
  failed: p.failedPolicy, failedFixed: p.failedFixed, returned: p.returnedPolicy, returnedFixed: p.returnedFixed,
})

export const shipmentUnits = (s: Pick<GxShipment, 'items'>) => s.items.reduce((a, i) => a + i.qty, 0)

/** Normal-rate earning for one shipment under its single rate rule (no policy, no extras). */
export function baseRate(rate: RateSnapshot, units: number, km: number | null): Paisa {
  switch (rate.rule) {
    case 'per_order': return rate.perOrder
    case 'per_product': return rate.perProduct * units
    case 'per_km': return Math.round(rate.perKm * Math.max(0, km ?? 0))
  }
}

/** What the rider earned for this shipment (0 until it reaches a paid final status). */
export function shipmentEarning(s: GxShipment): Paisa {
  if (!s.partnerId || !s.rate || s.deletedAt) return 0
  const base = baseRate(s.rate, shipmentUnits(s), s.distanceKm)
  const policy = (p: RateSnapshot['failed'], fixed: Paisa) => (p === 'full' ? base : p === 'fixed' ? fixed : 0)
  switch (s.status) {
    case 'delivered': return base + s.extraCharge
    case 'failed': return policy(s.rate.failed, s.rate.failedFixed)
    case 'returned': return policy(s.rate.returned, s.rate.returnedFixed)
    default: return 0
  }
}
/** Whether a shipment counts as an eligible (paid) delivery for the rider. */
export const isEligible = (s: GxShipment) => shipmentEarning(s) > 0 || (s.status === 'delivered' && !!s.partnerId)

/** Total delivery cost of a shipment: rider earning, or the external courier cost when there is no partner. */
export const shipmentCost = (s: GxShipment): Paisa =>
  s.deletedAt ? 0 : s.partnerId ? shipmentEarning(s) : (s.finalAt ? s.actualCost : 0)

/** Local date on which a shipment's cost / income is recognised. */
export const shipmentDate = (s: GxShipment, tz: string) => (s.finalAt ? zoned(s.finalAt, tz).date : null)

/** Rider pay for a return pickup — earned once the returned goods are received. */
export const pickupEarning = (r: GxReturn): Paisa => (!r.deletedAt && r.pickupPartnerId && r.received ? r.pickupPay : 0)

export function pickupPayFor(p: GxPartner, qty: number, km: number | null = null): Paisa {
  return p.countPickupAsDelivery ? baseRate(rateOf(p), qty, km) : p.pickupRate
}

/* ---------------- Per-return maths ---------------- */
export function returnCalc(r: GxReturn) {
  const stockCost = r.qtyReturned * r.unitCost
  const saleValue = r.qtyReturned * r.unitPrice
  const shipping = r.pickupPartnerId ? pickupEarning(r) : r.shippingCost
  const returnExpense = shipping + r.handlingCost + r.otherCost
  const recoverable = r.disposition === 'sellable' ? stockCost : r.disposition === 'damaged_stock' || r.disposition === 'repair' ? Math.min(r.salvageValue, stockCost) : 0
  const refund = r.status === 'rejected' ? 0 : r.refundAmount
  return {
    qtyReturned: r.qtyReturned, retained: r.qtySold - r.qtyReturned, unitCost: r.unitCost, stockCost, unitPrice: r.unitPrice, saleValue,
    refund, shipping, handling: r.handlingCost, other: r.otherCost, returnExpense, recoverable,
    /** Effect on the business: −refund + value recovered − return costs (negative = cost). */
    netImpact: -refund + recoverable - returnExpense,
  }
}

/* ---------------- Daily logistics aggregates (merged into the main engine) ---------------- */
export interface LgAgg { deliveryIncome: Paisa; deliveryCost: Paisa; returnCost: Paisa; riderPaid: Paisa; directLogisticsCash: Paisa }
export function logisticsDaily(d: LgData, r: DateRange, tz: string, add: (date: string, a: Partial<LgAgg>) => void) {
  for (const s of live(d.shipments)) {
    const date = shipmentDate(s, tz)
    if (!date || !inRange(date, r)) continue
    const cost = shipmentCost(s)
    add(date, { deliveryIncome: s.status === 'delivered' ? s.customerCharge : 0, deliveryCost: cost, directLogisticsCash: s.partnerId ? 0 : cost })
  }
  for (const x of live(d.returns)) {
    const date = zoned(x.at, tz).date
    const direct = (x.pickupPartnerId ? 0 : x.shippingCost) + x.handlingCost + x.otherCost
    if (inRange(date, r) && direct) add(date, { returnCost: direct, directLogisticsCash: direct })
    const pick = pickupEarning(x)
    if (pick && x.receivedAt) { const pd = zoned(x.receivedAt, tz).date; if (inRange(pd, r)) add(pd, { returnCost: pick }) }
  }
  for (const p of live(d.riderPays)) {
    if (p.voided) continue
    const date = zoned(p.at, tz).date
    if (inRange(date, r)) add(date, { riderPaid: p.amountPaid })
  }
}

/* ---------------- Partner accounts ---------------- */
export interface PartnerAccount {
  partner: GxPartner
  assignedUnits: number; pickedUpUnits: number; deliveredUnits: number; deliveredOrders: number
  failed: number; cancelled: number; returned: number; pickups: number; eligible: number
  shipmentEarnings: Paisa; pickupEarnings: Paisa; extras: Paisa; additions: Paisa; deductions: Paisa
  earned: Paisa; paid: Paisa; outstanding: Paisa
}
const PICKED: GxShipment['status'][] = ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned']

/** Account of one partner. With a range, activity is limited to that period; balances are always all-time up to `range.to`. */
export function partnerAccount(p: GxPartner, d: LgData, tz: string, range?: DateRange): PartnerAccount {
  const inR = (date: string | null) => !range || (!!date && inRange(date, range))
  const upTo = (date: string | null) => !range || (!!date && date <= range.to)
  const ships = live(d.shipments).filter((s) => s.partnerId === p.id)
  const acc: PartnerAccount = {
    partner: p, assignedUnits: 0, pickedUpUnits: 0, deliveredUnits: 0, deliveredOrders: 0, failed: 0, cancelled: 0, returned: 0, pickups: 0, eligible: 0,
    shipmentEarnings: 0, pickupEarnings: 0, extras: 0, additions: 0, deductions: 0, earned: 0, paid: 0, outstanding: 0,
  }
  let earnedAll = 0
  for (const s of ships) {
    const date = shipmentDate(s, tz) ?? (s.dispatchAt ? zoned(s.dispatchAt, tz).date : zoned(new Date(s.createdAt).toISOString(), tz).date)
    const e = shipmentEarning(s)
    if (upTo(shipmentDate(s, tz))) earnedAll += e
    if (!inR(date)) continue
    const u = shipmentUnits(s)
    acc.assignedUnits += u
    if (PICKED.includes(s.status)) acc.pickedUpUnits += u
    if (s.status === 'delivered') { acc.deliveredUnits += u; acc.deliveredOrders++; acc.extras += s.extraCharge }
    if (s.status === 'failed') acc.failed++
    if (s.status === 'cancelled') acc.cancelled++
    if (s.status === 'returned') acc.returned++
    if (isEligible(s)) acc.eligible++
    acc.shipmentEarnings += e
  }
  for (const r of live(d.returns)) {
    if (r.pickupPartnerId !== p.id) continue
    const e = pickupEarning(r)
    const date = r.receivedAt ? zoned(r.receivedAt, tz).date : null
    if (e && upTo(date)) earnedAll += e
    if (!e || !inR(date)) continue
    acc.pickups++; acc.pickupEarnings += e
    if (p.countPickupAsDelivery) acc.eligible++
  }
  let paidAll = 0
  for (const x of live(d.riderPays)) {
    if (x.partnerId !== p.id || x.voided) continue
    const date = zoned(x.at, tz).date
    if (upTo(date)) { earnedAll += x.additions - x.deductions; paidAll += x.amountPaid }
    if (inR(date)) { acc.additions += x.additions; acc.deductions += x.deductions; acc.paid += x.amountPaid }
  }
  acc.earned = acc.shipmentEarnings + acc.pickupEarnings + acc.additions - acc.deductions
  if (!range) acc.paid = paidAll
  acc.outstanding = earnedAll - paidAll
  return acc
}

/* ---------------- Return & delivery summary (dashboard cards) ---------------- */
export function logisticsSummary(d: LgData, r: DateRange, tz: string, unitsSold: number) {
  const rets = live(d.returns).filter((x) => x.status !== 'rejected' && inRange(zoned(x.at, tz).date, r))
  const calc = rets.map(returnCalc)
  const sum = (f: (c: ReturnType<typeof returnCalc>) => number) => calc.reduce((a, c) => a + f(c), 0)
  const ships = live(d.shipments).filter((s) => { const date = shipmentDate(s, tz); return date && inRange(date, r) })
  const delivered = ships.filter((s) => s.status === 'delivered')
  const accounts = live(d.partners).map((p) => partnerAccount(p, d, tz, r))
  const returnedUnits = rets.reduce((a, x) => a + x.qtyReturned, 0)
  const refundsPosted = live(d.returns).filter((x) => x.refundPostedAt && inRange(zoned(x.refundPostedAt, tz).date, r)).reduce((a, x) => a + x.refundAmount, 0)
  const restockRecovered = live(d.returns).filter((x) => x.restockPostedAt && inRange(zoned(x.restockPostedAt, tz).date, r)).reduce((a, x) => a + x.qtyReturned * x.unitCost, 0)
  const deliveryExpense = ships.reduce((a, s) => a + shipmentCost(s), 0)
  const reverse = sum((c) => c.shipping)
  const returnExpenses = sum((c) => c.returnExpense)
  const deliveryIncome = delivered.reduce((a, s) => a + s.customerCharge, 0)
  return {
    returns: rets.length, returnedUnits, returnRate: unitsSold > 0 ? returnedUnits / unitsSold : null,
    refundsApproved: sum((c) => c.refund), refundsPosted, returnShipping: reverse, returnHandling: sum((c) => c.handling + c.other), returnExpenses,
    returnedStockCost: sum((c) => c.stockCost), recoverable: sum((c) => c.recoverable), restockRecovered,
    deliveredOrders: delivered.length, productsDelivered: delivered.reduce((a, s) => a + shipmentUnits(s), 0),
    failed: ships.filter((s) => s.status === 'failed').length, cancelled: ships.filter((s) => s.status === 'cancelled').length, returnedShipments: ships.filter((s) => s.status === 'returned').length,
    deliveryIncome, deliveryExpense,
    riderEarnings: accounts.reduce((a, x) => a + x.earned, 0), riderPaid: accounts.reduce((a, x) => a + x.paid, 0),
    outstanding: live(d.partners).map((p) => partnerAccount(p, d, tz, { from: '0000-01-01', to: r.to })).reduce((a, x) => a + x.outstanding, 0),
    reverseDelivery: reverse,
    /** Net P&L effect of returns and deliveries in the period (refunds posted, restocked cost recovered, delivery income/expense, return costs). */
    netImpact: -refundsPosted + restockRecovered + deliveryIncome - deliveryExpense - returnExpenses,
  }
}

/* ---------------- Names & Payments ---------------- */
export type NpStatus = 'paid' | 'partial' | 'pending'
export function npBalance(p: NpPerson, pays: NpPayment[]) {
  const mine = pays.filter((x) => x.personId === p.id && !x.voided && !x.deletedAt)
  const paid = mine.reduce((a, x) => a + x.amount, 0)
  const remaining = Math.max(0, p.obligation - paid)
  const status: NpStatus = p.obligation > 0 && paid >= p.obligation ? 'paid' : paid > 0 ? 'partial' : 'pending'
  return { paid, remaining, overpaid: Math.max(0, paid - p.obligation), status, count: mine.length, last: mine.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null }
}
export function npTotals(people: NpPerson[], pays: NpPayment[]) {
  const ps = live(people)
  const rows = ps.map((p) => ({ person: p, ...npBalance(p, pays) }))
  return {
    rows,
    obligations: ps.reduce((a, p) => a + p.obligation, 0),
    received: rows.reduce((a, x) => a + x.paid, 0),
    remaining: rows.reduce((a, x) => a + x.remaining, 0),
    paidPeople: rows.filter((x) => x.status === 'paid').length,
    pendingPeople: rows.filter((x) => x.status !== 'paid').length,
    partialPeople: rows.filter((x) => x.status === 'partial').length,
  }
}
