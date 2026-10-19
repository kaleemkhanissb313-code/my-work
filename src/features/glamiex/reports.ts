import type { Sheet, Cell } from '@/lib/xlsx'
import { adKpis, orderBalance, orderGross, orderUnits, personBalance, productPerformance, series, summary, type GxData } from './engine'
import { inRange, previousRange, zoned, type DateRange } from './time'
import { pctChange } from './money'
import { PAYMENT_TYPES } from './types'

const rs = (p: number) => Math.round(p) / 100
const pct = (v: number | null) => (v == null ? '' : +(v * 100).toFixed(2))
const chg = (a: number, b: number) => { const c = pctChange(a, b); return c == null ? 'n/a' : +c.toFixed(1) }

/** Profit & loss lines with previous-period comparison. Amounts in paisa. */
export function pnlLines(d: GxData, r: DateRange, tz: string) {
  const cur = summary(d, r, tz), prev = summary(d, previousRange(r), tz)
  const cats = new Map<string, [number, number]>()
  const pr = previousRange(r)
  for (const e of d.expenses) {
    if (e.deletedAt) continue
    const k = e.category || 'Other'
    const v = cats.get(k) ?? [0, 0]
    if (inRange(e.date, r)) v[0] += e.amount
    if (inRange(e.date, pr)) v[1] += e.amount
    cats.set(k, v)
  }
  type L = { label: string; cur: number; prev: number; kind: 'line' | 'sub' | 'total' | 'indent'; sign?: 1 | -1 }
  const lines: L[] = [
    { label: 'Gross sales', cur: cur.grossSales, prev: prev.grossSales, kind: 'line' },
    { label: 'Less: discounts', cur: -cur.discounts, prev: -prev.discounts, kind: 'indent' },
    { label: 'Less: refunds', cur: -cur.refunds, prev: -prev.refunds, kind: 'indent' },
    { label: 'Net sales revenue', cur: cur.netSales, prev: prev.netSales, kind: 'sub' },
    { label: 'Cost of goods sold', cur: -cur.netCogs, prev: -prev.netCogs, kind: 'indent' },
    { label: 'Gross profit', cur: cur.grossProfit, prev: prev.grossProfit, kind: 'sub' },
    { label: 'Advertising income', cur: cur.adIncome, prev: prev.adIncome, kind: 'line' },
    { label: 'Advertising spend', cur: -cur.adSpend, prev: -prev.adSpend, kind: 'indent' },
    { label: 'Delivery charges collected', cur: cur.deliveryIncome, prev: prev.deliveryIncome, kind: 'line' },
    { label: 'Delivery costs (riders & couriers)', cur: -cur.deliveryCost, prev: -prev.deliveryCost, kind: 'indent' },
    { label: 'Return costs (shipping, pickup, handling)', cur: -cur.returnCost, prev: -prev.returnCost, kind: 'indent' },
    ...[...cats].filter(([, v]) => v[0] || v[1]).map(([k, v]) => ({ label: `Expense: ${k}`, cur: -v[0], prev: -v[1], kind: 'indent' as const })),
    { label: 'Net profit', cur: cur.netProfit, prev: prev.netProfit, kind: 'total' },
  ]
  return { cur, prev, lines, prevRange: pr }
}

export function cashLines(d: GxData, r: DateRange, tz: string) {
  const s = summary(d, r, tz)
  const byType = PAYMENT_TYPES.map((t) => ({ ...t, amount: d.payments.filter((p) => !p.voided && !p.deletedAt && p.type === t.id && inRange(zoned(p.at, tz).date, r)).reduce((a, p) => a + p.amount, 0) }))
  const adCash = d.adSpend.filter((x) => !x.deletedAt && inRange(x.start, r)).reduce((a, x) => a + x.amountPkr, 0)
  return { s, byType, adCash, expenses: s.expenses }
}

export type ReportKey = 'sales' | 'products' | 'balances' | 'deposits' | 'ads' | 'pnl' | 'cash' | 'weekly' | 'monthly' | 'yearly'
export const REPORTS: { key: ReportKey; name: string; desc: string }[] = [
  { key: 'sales', name: 'Sales report', desc: 'Every order with items, discounts, tax, received and balance' },
  { key: 'products', name: 'Product performance report', desc: 'Units, revenue, cost, profit, margin and stock per product' },
  { key: 'balances', name: 'Customer balance report', desc: 'What each customer owes (or holds as credit) at the end of the period' },
  { key: 'deposits', name: 'Person deposit report', desc: 'Payments, deposits, contributions and payouts by person' },
  { key: 'ads', name: 'Advertising income & expense report', desc: 'Ad earnings, campaign spend, CPC, CPA, ROAS' },
  { key: 'pnl', name: 'Profit & loss report', desc: 'Revenue to net profit with previous-period comparison' },
  { key: 'cash', name: 'Cash movement report', desc: 'Cash in and out by type — separate from profit' },
  { key: 'weekly', name: 'Weekly report', desc: 'Week-by-week sales, costs and profit' },
  { key: 'monthly', name: 'Monthly report', desc: 'Month-by-month sales, costs and profit' },
  { key: 'yearly', name: 'Yearly report', desc: 'Year-by-year sales, costs and profit' },
]

const periodSheet = (d: GxData, r: DateRange, tz: string, g: 'week' | 'month' | 'year' | 'day'): Sheet => ({
  name: `${g[0].toUpperCase()}${g.slice(1)} summary`,
  rows: [['Period', 'Orders', 'Units', 'Net sales (Rs)', 'COGS (Rs)', 'Gross profit (Rs)', 'Ad income (Rs)', 'Ad spend (Rs)', 'Expenses (Rs)', 'Net profit (Rs)', 'Net margin %', 'Cash in (Rs)', 'Cash out (Rs)', 'Deposits (Rs)'],
    ...series(d, r, g, tz).map((p) => [p.label, p.orders, p.netUnits, rs(p.netSales), rs(p.netCogs), rs(p.grossProfit), rs(p.adIncome), rs(p.adSpend), rs(p.expenses), rs(p.netProfit), pct(p.netMargin), rs(p.cashIn), rs(p.cashOut), rs(p.deposits)] as Cell[])],
})

export function buildReport(key: ReportKey, d: GxData, r: DateRange, tz: string): Sheet[] {
  const people = new Map(d.people.map((p) => [p.id, p.name]))
  switch (key) {
    case 'sales': return [{ name: 'Sales', rows: [['Order', 'Date', 'Time', 'Day', 'Customer', 'Items', 'Units', 'Subtotal (Rs)', 'Discount (Rs)', 'Tax (Rs)', 'Total (Rs)', 'Refunded (Rs)', 'Received (Rs)', 'Balance (Rs)', 'Status'],
      ...d.orders.filter((o) => !o.deletedAt && inRange(zoned(o.at, tz).date, r)).sort((a, b) => a.at.localeCompare(b.at)).map((o) => { const z = zoned(o.at, tz), b = orderBalance(o, d.payments, d.refunds); return [o.orderNo, z.date, z.time, z.weekday, people.get(o.personId ?? '') ?? 'Walk-in', o.items.map((i) => `${i.qty}x ${i.name}`).join('; '), orderUnits(o), rs(orderGross(o)), rs(o.discount), rs(o.tax), rs(b.total), rs(b.refunded), rs(b.paid), rs(o.status === 'cancelled' ? 0 : b.balance), b.status] as Cell[] })] }]
    case 'products': return [{ name: 'Products', rows: [['Product', 'SKU', 'Category', 'Units sold', 'Revenue (Rs)', 'Cost (Rs)', 'Gross profit (Rs)', 'Margin %', 'Current stock'],
      ...productPerformance(d, r, tz).sort((a, b) => b.revenue - a.revenue).map((p) => [p.product.name, p.product.sku, p.product.category, p.units, rs(p.revenue), rs(p.cost), rs(p.profit), pct(p.margin), p.stock] as Cell[])] }]
    case 'balances': return [{ name: 'Balances', rows: [['Customer', 'Phone', 'Opening (Rs)', 'Charges (Rs)', 'Refunds (Rs)', 'Received (Rs)', 'Paid out (Rs)', 'Adjustments (Rs)', `Balance at ${r.to} (Rs)`, 'Status'],
      ...d.people.filter((p) => !p.deletedAt && p.type === 'customer').map((p) => { const b = personBalance(p, d, tz, r.to); return [p.name, p.phone, rs(b.opening), rs(b.charges), rs(b.refunds), rs(b.received), rs(b.paidOut), rs(b.adjustments), rs(b.balance), b.balance > 0 ? 'owes' : b.balance < 0 ? 'credit' : 'settled'] as Cell[] })] }]
    case 'deposits': {
      const rows = d.payments.filter((p) => !p.deletedAt && inRange(zoned(p.at, tz).date, r)).sort((a, b) => a.at.localeCompare(b.at))
      const byPerson = new Map<string, Record<string, number>>()
      for (const p of rows) { if (p.voided) continue; const k = people.get(p.personId ?? '') ?? '(none)'; const m = byPerson.get(k) ?? {}; m[p.type] = (m[p.type] ?? 0) + p.amount; byPerson.set(k, m) }
      return [
        { name: 'By person', rows: [['Person', ...PAYMENT_TYPES.map((t) => `${t.label} (Rs)`)], ...[...byPerson].map(([k, m]) => [k, ...PAYMENT_TYPES.map((t) => rs(m[t.id] ?? 0))] as Cell[])] },
        { name: 'Transactions', rows: [['Txn', 'Date', 'Time', 'Day', 'Person', 'Type', 'Method', 'Reference', 'Amount (Rs)', 'Voided'], ...rows.map((p) => { const z = zoned(p.at, tz); return [p.txnNo, z.date, z.time, z.weekday, people.get(p.personId ?? '') ?? '', PAYMENT_TYPES.find((t) => t.id === p.type)?.label, p.method, p.reference, rs(p.amount), p.voided ? 'yes' : ''] as Cell[] })] },
      ]
    }
    case 'ads': {
      const inc = d.adIncome.filter((x) => !x.deletedAt && inRange(x.reportDate, r))
      const sp = d.adSpend.filter((x) => !x.deletedAt && x.start <= r.to && (x.end || x.start) >= r.from)
      const k = adKpis(sp), s = summary(d, r, tz)
      return [
        { name: 'Summary', rows: [['Metric', 'Value'], ['Advertising income (Rs)', rs(s.adIncome)], ['Advertising spend recognised (Rs)', rs(s.adSpend)], ['Net advertising result (Rs)', rs(s.adIncome - s.adSpend)], ['Clicks', k.clicks], ['Impressions', k.impressions], ['Conversions', k.conversions], ['CPC (Rs)', k.cpc == null ? 'n/a' : rs(k.cpc)], ['CPA (Rs)', k.cpa == null ? 'n/a' : rs(k.cpa)], ['Conversion rate %', k.conversionRate == null ? 'n/a' : +k.conversionRate.toFixed(2)], ['ROAS', k.roas == null ? 'n/a' : +k.roas.toFixed(2)], ['ROI %', k.roi == null ? 'n/a' : +k.roi.toFixed(2)]] },
        { name: 'Income', rows: [['Report date', 'Platform', 'Campaign', 'Currency', 'Gross', 'Adjustments', 'Rate', 'Net (Rs)'], ...inc.map((x) => [x.reportDate, x.platform, x.campaign, x.currency, x.gross / 100, x.adjustments / 100, x.exchangeRate, rs(x.netPkr)] as Cell[])] },
        { name: 'Spend', rows: [['Platform', 'Campaign', 'Start', 'End', 'Spent (Rs)', 'Clicks', 'Impressions', 'Conversions', 'Attributed sales (Rs)'], ...sp.map((x) => [x.platform, x.campaign, x.start, x.end, rs(x.amountPkr), x.clicks, x.impressions, x.conversions, x.attributedSales == null ? '' : rs(x.attributedSales)] as Cell[])] },
      ]
    }
    case 'pnl': {
      const p = pnlLines(d, r, tz)
      return [{ name: 'Profit and loss', rows: [['Line', `${r.from} to ${r.to} (Rs)`, `${p.prevRange.from} to ${p.prevRange.to} (Rs)`, 'Change %'], ...p.lines.map((l) => [l.label, rs(l.cur), rs(l.prev), chg(l.cur, l.prev)] as Cell[]),
        [], ['Gross margin %', pct(p.cur.grossMargin), pct(p.prev.grossMargin), ''], ['Net margin %', pct(p.cur.netMargin), pct(p.prev.netMargin), ''], ['Tax collected (not revenue) (Rs)', rs(p.cur.tax), rs(p.prev.tax), '']] }]
    }
    case 'cash': {
      const c = cashLines(d, r, tz)
      return [{ name: 'Cash movement', rows: [['Item', 'Direction', 'Amount (Rs)'], ...c.byType.filter((t) => t.dir !== 'none').map((t) => [t.label, t.dir, rs(t.amount)] as Cell[]), ['Business expenses', 'out', rs(c.expenses)], ['Advertising spend (paid at campaign start)', 'out', rs(c.adCash)], [], ['Total cash in', '', rs(c.s.cashIn)], ['Total cash out', '', rs(c.s.cashOut)], ['Net cash movement', '', rs(c.s.netCash)]] }]
    }
    case 'weekly': return [periodSheet(d, r, tz, 'week')]
    case 'monthly': return [periodSheet(d, r, tz, 'month')]
    case 'yearly': return [periodSheet(d, r, tz, 'year')]
  }
}
