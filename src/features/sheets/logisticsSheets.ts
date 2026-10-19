/**
 * Live Overall Sheets for returns, deliveries, riders and Names & Payments. Generated from records through the same
 * pure functions as the GLAMIEX screens, so they never drift. Money is in RUPEES (paisa / 100) for sheet formulas.
 */
import type { GxData } from '@/features/glamiex/engine'
import { logisticsSummary, npTotals, partnerAccount, pickupEarning, returnCalc, shipmentCost, shipmentEarning, shipmentUnits } from '@/features/glamiex/logistics'
import { inRange, zoned, type DateRange } from '@/features/glamiex/time'
import { DISPOSITIONS, RETURN_REASONS, RETURN_STATUSES, SHIPMENT_STATUSES, RATE_RULES } from '@/features/glamiex/types'
import { summary } from '@/features/glamiex/engine'
import type { ColType, CondRule, SheetCol, TotalFn } from './types'
import type { LiveSheet } from './systemSheets'

export type LogisticsKey = 'returns' | 'return-costs' | 'refunds' | 'deliveries' | 'riders' | 'rider-earnings' | 'rider-payments' | 'rider-balances' | 'reverse' | 'returned-stock' | 'delivery-expenses' | 'return-delivery-summary' | 'names-payments'
export const LOGISTICS_SHEETS: { key: LogisticsKey; title: string; ranged: boolean; desc: string }[] = [
  { key: 'returns', title: 'Product Returns Sheet', ranged: true, desc: 'Every return with quantities, reason and status' },
  { key: 'return-costs', title: 'Return Cost Sheet', ranged: true, desc: 'Per-return stock cost, refund, shipping, handling and net impact' },
  { key: 'refunds', title: 'Refunds Sheet', ranged: true, desc: 'Every refund posted on orders (returns and sales refunds)' },
  { key: 'deliveries', title: 'Deliveries Sheet', ranged: true, desc: 'Every shipment with products, rider, charges and status' },
  { key: 'riders', title: 'Delivery Riders Sheet', ranged: false, desc: 'Rider and courier profiles and rate rules' },
  { key: 'rider-earnings', title: 'Rider Earnings Sheet', ranged: true, desc: 'Activity and earnings per rider for the period' },
  { key: 'rider-payments', title: 'Rider Payments Sheet', ranged: true, desc: 'Every rider settlement payment' },
  { key: 'rider-balances', title: 'Outstanding Rider Balances Sheet', ranged: false, desc: 'What each rider is still owed' },
  { key: 'reverse', title: 'Reverse Delivery Sheet', ranged: true, desc: 'Return pickups from customers back to the business' },
  { key: 'returned-stock', title: 'Returned Inventory Sheet', ranged: true, desc: 'Inspection results and recoverable stock value' },
  { key: 'delivery-expenses', title: 'Delivery Expenses Sheet', ranged: true, desc: 'Delivery and return costs by shipment / return' },
  { key: 'return-delivery-summary', title: 'Return and Delivery Summary Sheet', ranged: true, desc: 'All return and delivery totals for the period' },
  { key: 'names-payments', title: 'Names and Payments Sheet', ranged: false, desc: 'Payment obligations, amounts paid and remaining per person' },
]

const R = (p: number) => Math.round(p) / 100
const col = (id: string, name: string, type: ColType = 'text', width = 130): SheetCol => ({ id, name, type, width })
const sumOf = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, 'sum' as TotalFn]))
const lbl = <T extends string>(list: { id: T; label: string }[], id: T | null) => list.find((x) => x.id === id)?.label ?? (id ?? '')
const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt)
const neg: CondRule = { id: 'neg', colId: 'net', op: 'neg', value: '', color: '#b91c1c', bg: '', label: '▼' }

export function buildLogisticsSheet(key: LogisticsKey, d: GxData, r: DateRange, tz: string): LiveSheet {
  const orderNo = new Map(d.orders.map((o) => [o.id, o.orderNo]))
  const partner = new Map(d.partners.map((p) => [p.id, p.name]))
  const day = (iso: string | null) => (iso ? zoned(iso, tz).date : '')
  const rets = () => live(d.returns).filter((x) => inRange(day(x.at), r))
  switch (key) {
    case 'returns': return {
      columns: [col('no', 'Return', 'text', 105), col('date', 'Date', 'date', 105), col('order', 'Order', 'text', 105), col('cust', 'Customer', 'text', 150), col('contact', 'Contact', 'text', 120), col('prod', 'Product', 'text', 180),
        col('sold', 'Qty sold', 'number', 80), col('ret', 'Qty returned', 'number', 100), col('kept', 'Qty retained', 'number', 100), col('reason', 'Reason', 'text', 150), col('cond', 'Condition', 'text', 140), col('st', 'Status', 'text', 140)],
      rows: rets().map((x) => ({ id: x.id, link: `/glamiex/returns/${x.id}`, cells: { no: x.returnNo, date: day(x.at), order: orderNo.get(x.orderId) ?? '', cust: x.customerName, contact: x.customerContact, prod: x.productName,
        sold: x.qtySold, ret: x.qtyReturned, kept: x.qtySold - x.qtyReturned, reason: lbl(RETURN_REASONS, x.reason), cond: x.condition, st: lbl(RETURN_STATUSES, x.status) } })),
      totals: sumOf(['ret']), rules: [{ id: 'rej', colId: 'st', op: 'eq', value: 'Rejected', color: '#64748b', bg: '', label: '✕' }],
    }
    case 'return-costs': return {
      columns: [col('no', 'Return', 'text', 105), col('prod', 'Product', 'text', 180), col('ret', 'Qty returned', 'number', 100), col('uc', 'Unit buying cost', 'pkr'), col('sc', 'Returned stock cost', 'pkr', 150),
        col('up', 'Unit selling price', 'pkr'), col('ref', 'Refund', 'pkr'), col('ship', 'Return delivery', 'pkr'), col('hand', 'Handling + other', 'pkr', 140), col('tot', 'Total return expense', 'pkr', 160), col('rec', 'Recoverable value', 'pkr', 140), col('net', 'Net impact', 'pkr')],
      rows: rets().filter((x) => x.status !== 'rejected').map((x) => { const c = returnCalc(x); return { id: x.id, link: `/glamiex/returns/${x.id}`, cells: { no: x.returnNo, prod: x.productName, ret: x.qtyReturned, uc: R(x.unitCost), sc: R(c.stockCost), up: R(x.unitPrice),
        ref: R(c.refund), ship: R(c.shipping), hand: R(c.handling + c.other), tot: R(c.returnExpense), rec: R(c.recoverable), net: R(c.netImpact) } } }),
      totals: sumOf(['ret', 'sc', 'ref', 'ship', 'hand', 'tot', 'rec', 'net']), rules: [neg],
    }
    case 'refunds': return {
      columns: [col('date', 'Date', 'date', 105), col('order', 'Order', 'text', 110), col('src', 'Source', 'text', 130), col('reason', 'Reason', 'text', 220), col('units', 'Units restocked', 'number', 120), col('amt', 'Refund amount', 'pkr')],
      rows: live(d.refunds).filter((f) => inRange(day(f.at), r) && (f.amount > 0 || f.restock.length)).sort((a, b) => a.at.localeCompare(b.at)).map((f) => ({ id: f.id, link: `/glamiex/sales/${f.orderId}`, cells: {
        date: day(f.at), order: orderNo.get(f.orderId) ?? '', src: f.id.startsWith('ret') ? (f.amount ? 'Return refund' : 'Return restock') : 'Sales refund', reason: f.reason, units: f.restock.reduce((a, x) => a + x.qty, 0), amt: R(f.amount) } })),
      totals: sumOf(['units', 'amt']), rules: [],
    }
    case 'deliveries': return {
      columns: [col('no', 'Delivery', 'text', 105), col('order', 'Order', 'text', 105), col('cust', 'Customer', 'text', 150), col('phone', 'Phone', 'text', 120), col('addr', 'Address', 'text', 200), col('items', 'Products', 'text', 220),
        col('units', 'Qty', 'number', 70), col('rider', 'Rider / courier', 'text', 140), col('disp', 'Dispatched', 'date', 105), col('exp', 'Expected', 'date', 105), col('del', 'Delivered', 'date', 105),
        col('chg', 'Customer paid', 'pkr'), col('cost', 'Delivery cost', 'pkr'), col('st', 'Status', 'text', 130), col('trk', 'Tracking', 'text', 120)],
      rows: live(d.shipments).filter((s) => inRange(day(s.finalAt ?? s.dispatchAt ?? new Date(s.createdAt).toISOString()), r)).map((s) => ({ id: s.id, link: `/glamiex/deliveries/${s.id}`, cells: {
        no: s.shipmentNo, order: orderNo.get(s.orderId ?? '') ?? '', cust: s.customerName, phone: s.customerPhone, addr: s.customerAddress, items: s.items.map((i) => `${i.qty}× ${i.name}`).join(', '), units: shipmentUnits(s),
        rider: partner.get(s.partnerId ?? '') ?? '', disp: day(s.dispatchAt), exp: s.expectedDate, del: day(s.deliveredAt), chg: R(s.customerCharge), cost: R(shipmentCost(s)), st: lbl(SHIPMENT_STATUSES, s.status), trk: s.trackingNo } })),
      totals: sumOf(['units', 'chg', 'cost']), rules: [{ id: 'fail', colId: 'st', op: 'eq', value: 'Failed delivery', color: '#b91c1c', bg: '', label: '⚠' }],
    }
    case 'riders': return {
      columns: [col('name', 'Rider / company', 'text', 170), col('kind', 'Type', 'text', 90), col('code', 'Rider ID', 'text', 90), col('phone', 'Phone', 'text', 120), col('rule', 'Rate rule', 'text', 160), col('rate', 'Rate', 'pkr', 100), col('pick', 'Pickup rate', 'pkr', 110), col('st', 'Status', 'text', 90)],
      rows: live(d.partners).map((p) => ({ id: p.id, link: `/glamiex/riders/${p.id}`, cells: { name: p.name, kind: p.kind, code: p.code, phone: p.phone, rule: lbl(RATE_RULES, p.rateRule), rate: R(p.rateRule === 'per_order' ? p.perOrder : p.rateRule === 'per_product' ? p.perProduct : p.perKm), pick: R(p.pickupRate), st: p.status } })),
      totals: {}, rules: [],
    }
    case 'rider-earnings': return {
      columns: [col('name', 'Rider / company', 'text', 170), col('asg', 'Assigned', 'number', 90), col('pick', 'Picked up', 'number', 90), col('del', 'Delivered units', 'number', 110), col('ord', 'Delivered orders', 'number', 120), col('fail', 'Failed', 'number', 70),
        col('canc', 'Cancelled', 'number', 90), col('ret', 'Returned', 'number', 80), col('pu', 'Pickups', 'number', 80), col('se', 'Delivery earnings', 'pkr', 140), col('pe', 'Pickup earnings', 'pkr', 130), col('add', 'Additions', 'pkr', 100), col('ded', 'Deductions', 'pkr', 100), col('earn', 'Total earned', 'pkr')],
      rows: live(d.partners).map((p) => { const a = partnerAccount(p, d, tz, r); return { id: p.id, link: `/glamiex/riders/${p.id}`, cells: { name: p.name, asg: a.assignedUnits, pick: a.pickedUpUnits, del: a.deliveredUnits, ord: a.deliveredOrders, fail: a.failed, canc: a.cancelled, ret: a.returned, pu: a.pickups,
        se: R(a.shipmentEarnings), pe: R(a.pickupEarnings), add: R(a.additions), ded: R(a.deductions), earn: R(a.earned) } } }),
      totals: sumOf(['asg', 'pick', 'del', 'ord', 'fail', 'canc', 'ret', 'pu', 'se', 'pe', 'add', 'ded', 'earn']), rules: [],
    }
    case 'rider-payments': return {
      columns: [col('no', 'Settlement', 'text', 110), col('date', 'Paid on', 'date', 105), col('rider', 'Rider', 'text', 150), col('from', 'Period from', 'date', 105), col('to', 'Period to', 'date', 105), col('jobs', 'Completed deliveries', 'number', 140),
        col('gross', 'Gross earnings', 'pkr'), col('add', 'Additions', 'pkr', 100), col('ded', 'Deductions', 'pkr', 100), col('paid', 'Amount paid', 'pkr'), col('method', 'Method', 'text', 100), col('ref', 'Reference', 'text', 120), col('void', 'Voided', 'text', 70)],
      rows: live(d.riderPays).filter((x) => inRange(day(x.at), r)).sort((a, b) => a.at.localeCompare(b.at)).map((x) => ({ id: x.id, link: `/glamiex/riders/${x.partnerId}`, cells: { no: x.settlementNo, date: day(x.at), rider: partner.get(x.partnerId) ?? '', from: x.periodFrom, to: x.periodTo, jobs: x.completedDeliveries,
        gross: R(x.grossEarnings), add: R(x.additions), ded: R(x.deductions), paid: x.voided ? 0 : R(x.amountPaid), method: x.method, ref: x.reference, void: x.voided ? 'VOID' : '' } })),
      totals: sumOf(['paid']), rules: [],
    }
    case 'rider-balances': return {
      columns: [col('name', 'Rider / company', 'text', 180), col('earn', 'Total earned', 'pkr', 140), col('paid', 'Total paid', 'pkr', 140), col('bal', 'Outstanding', 'pkr', 140)],
      rows: live(d.partners).map((p) => { const a = partnerAccount(p, d, tz); return { id: p.id, link: `/glamiex/riders/${p.id}`, cells: { name: p.name, earn: R(a.outstanding + a.paid), paid: R(a.paid), bal: R(a.outstanding) } } }),
      totals: sumOf(['earn', 'paid', 'bal']), rules: [{ id: 'due', colId: 'bal', op: 'pos', value: '', color: '#a16207', bg: '', label: 'Due' }],
    }
    case 'reverse': return {
      columns: [col('no', 'Return', 'text', 105), col('prod', 'Product', 'text', 170), col('rider', 'Pickup rider', 'text', 140), col('pdate', 'Pickup date', 'date', 105), col('qty', 'Products collected', 'number', 130), col('cost', 'Reverse delivery cost', 'pkr', 160),
        col('refund', 'Customer refund', 'text', 130), col('wh', 'Warehouse receipt', 'text', 130), col('insp', 'Inspection', 'text', 170), col('pay', 'Rider pay for pickup', 'pkr', 150)],
      rows: rets().filter((x) => x.pickupPartnerId || x.shippingCost).map((x) => ({ id: x.id, link: `/glamiex/returns/${x.id}`, cells: { no: x.returnNo, prod: x.productName, rider: partner.get(x.pickupPartnerId ?? '') ?? 'Customer / courier', pdate: x.pickupDate, qty: x.pickupQty,
        cost: R(returnCalc(x).shipping), refund: x.refundPostedAt ? 'Refunded' : x.refundAmount ? 'Pending' : 'None', wh: x.received ? `Received ${day(x.receivedAt)}` : 'Not received', insp: x.disposition ? lbl(DISPOSITIONS, x.disposition) : x.received ? 'Pending' : '—', pay: R(pickupEarning(x)) } })),
      totals: sumOf(['qty', 'cost', 'pay']), rules: [],
    }
    case 'returned-stock': return {
      columns: [col('no', 'Return', 'text', 105), col('prod', 'Product', 'text', 180), col('qty', 'Qty', 'number', 70), col('recv', 'Received', 'text', 90), col('disp', 'Inspection result', 'text', 200), col('sell', 'Back in sellable stock', 'number', 160),
        col('cost', 'Stock cost', 'pkr'), col('rec', 'Recoverable value', 'pkr', 140)],
      rows: rets().filter((x) => x.status !== 'rejected').map((x) => ({ id: x.id, link: `/glamiex/returns/${x.id}`, cells: { no: x.returnNo, prod: x.productName, qty: x.qtyReturned, recv: x.received ? 'Yes' : 'No', disp: x.disposition ? lbl(DISPOSITIONS, x.disposition) : 'Not inspected',
        sell: x.restockPostedAt ? x.qtyReturned : 0, cost: R(x.qtyReturned * x.unitCost), rec: R(returnCalc(x).recoverable) } })),
      totals: sumOf(['qty', 'sell', 'cost', 'rec']), rules: [],
    }
    case 'delivery-expenses': {
      const ships = live(d.shipments).filter((s) => s.finalAt && inRange(day(s.finalAt), r)).map((s) => ({ id: s.id, link: `/glamiex/deliveries/${s.id}`, cells: {
        date: day(s.finalAt), ref: s.shipmentNo, kind: 'Delivery', who: partner.get(s.partnerId ?? '') ?? 'External courier', st: lbl(SHIPMENT_STATUSES, s.status), earn: R(shipmentEarning(s)), cost: R(shipmentCost(s)), income: R(s.status === 'delivered' ? s.customerCharge : 0) } }))
      const retRows = rets().filter((x) => returnCalc(x).returnExpense > 0).map((x) => { const c = returnCalc(x); return { id: `r-${x.id}`, link: `/glamiex/returns/${x.id}`, cells: {
        date: day(x.at), ref: x.returnNo, kind: 'Return', who: partner.get(x.pickupPartnerId ?? '') ?? '', st: lbl(RETURN_STATUSES, x.status), earn: R(pickupEarning(x)), cost: R(c.returnExpense), income: 0 } } })
      return {
        columns: [col('date', 'Date', 'date', 105), col('ref', 'Reference', 'text', 110), col('kind', 'Type', 'text', 90), col('who', 'Rider / courier', 'text', 150), col('st', 'Status', 'text', 130), col('earn', 'Rider pay', 'pkr', 110), col('cost', 'Expense', 'pkr', 110), col('income', 'Charged to customer', 'pkr', 150)],
        rows: [...ships, ...retRows].sort((a, b) => String(a.cells.date).localeCompare(String(b.cells.date))), totals: sumOf(['earn', 'cost', 'income']), rules: [],
      }
    }
    case 'return-delivery-summary': {
      const s = summary(d, r, tz)
      const l = logisticsSummary(d, r, tz, s.units)
      const lines: [string, number, 'pkr' | 'number' | 'percent'][] = [
        ['Returns recorded', l.returns, 'number'], ['Total returned products', l.returnedUnits, 'number'], ['Return rate (% of units sold)', l.returnRate == null ? 0 : +(l.returnRate * 100).toFixed(2), 'percent'],
        ['Refunds approved', l.refundsApproved, 'pkr'], ['Refunds posted', l.refundsPosted, 'pkr'], ['Return shipping / reverse delivery', l.returnShipping, 'pkr'], ['Return handling & other', l.returnHandling, 'pkr'],
        ['Returned stock buying cost (informational)', l.returnedStockCost, 'pkr'], ['Recoverable inventory value', l.recoverable, 'pkr'], ['Delivered orders', l.deliveredOrders, 'number'], ['Products delivered', l.productsDelivered, 'number'],
        ['Failed deliveries', l.failed, 'number'], ['Delivery charges collected', l.deliveryIncome, 'pkr'], ['Delivery expenses', l.deliveryExpense, 'pkr'], ['Rider earnings', l.riderEarnings, 'pkr'], ['Rider payments made', l.riderPaid, 'pkr'],
        ['Outstanding rider payments (period end)', l.outstanding, 'pkr'], ['Net return and delivery impact', l.netImpact, 'pkr'],
      ]
      return {
        columns: [col('m', 'Metric', 'text', 300), col('v', `${r.from} → ${r.to}`, 'pkr', 170)],
        rows: lines.map(([m, v, t], i) => ({ id: `s${i}`, cells: { m, v: t === 'pkr' ? R(v) : v } })), totals: {}, rules: [{ id: 'n', colId: 'v', op: 'neg', value: '', color: '#b91c1c', bg: '', label: '▼' }],
        rowFmt: Object.fromEntries(lines.map(([, , t], i) => [`s${i}`, t === 'number' ? { fmt: 'number' as const } : t === 'percent' ? { fmt: 'decimal2' as const } : {}]).filter(([, v]) => Object.keys(v).length)),
      }
    }
    case 'names-payments': {
      const t = npTotals(d.npPeople, d.npPayments)
      return {
        columns: [col('name', 'Name', 'text', 180), col('phone', 'Phone', 'text', 120), col('ob', 'Payment amount', 'pkr', 140), col('paid', 'Paid', 'pkr', 130), col('rem', 'Remaining', 'pkr', 130), col('st', 'Status', 'text', 110), col('n', 'Payments', 'number', 90)],
        rows: t.rows.map((x) => ({ id: x.person.id, link: '/glamiex/names', cells: { name: x.person.name, phone: x.person.phone, ob: R(x.person.obligation), paid: R(x.paid), rem: R(x.remaining), st: x.status === 'paid' ? 'Paid' : x.status === 'partial' ? 'Partly paid' : 'Pending', n: x.count } })),
        totals: sumOf(['ob', 'paid', 'rem', 'n']), rules: [{ id: 'pend', colId: 'st', op: 'eq', value: 'Pending', color: '#b91c1c', bg: '', label: '●' }, { id: 'paid', colId: 'st', op: 'eq', value: 'Paid', color: '#047857', bg: '', label: '✓' }],
      }
    }
  }
}
