/**
 * Live "Overall Sheets" generated from GLAMIEX records through the accounting engine — never stored, so they can
 * never drift from the official figures. Money is shown in RUPEES (paisa / 100) so sheet formulas work naturally.
 * Only whitelisted product fields are editable, and edits are applied through the audited product service after
 * the user confirms.
 */
import { orderBalance, orderGross, orderUnits, personBalance, productPerformance, series, summary, adKpis, type GxData } from '@/features/glamiex/engine'
import { inRange, previousRange, zoned, type DateRange } from '@/features/glamiex/time'
import { pnlLines } from '@/features/glamiex/reports'
import { PAYMENT_TYPES } from '@/features/glamiex/types'
import { pctChange } from '@/features/glamiex/money'
import type { CellFmt, ColType, CondRule, SheetCol, TotalFn } from './types'

export type SystemKey = 'overview' | 'products' | 'sales' | 'people' | 'payments' | 'ad-income' | 'ad-spend' | 'expenses' | 'pnl' | 'stock' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export const SYSTEM_SHEETS: { key: SystemKey; title: string; ranged: boolean; desc: string }[] = [
  { key: 'overview', title: 'Business Overview Sheet', ranged: true, desc: 'All key totals for the period vs the previous period' },
  { key: 'products', title: 'Products Sheet', ranged: true, desc: 'Prices, profit, stock and sales per product (prices editable)' },
  { key: 'sales', title: 'Sales and Orders Sheet', ranged: true, desc: 'Every sale with totals, received and balance' },
  { key: 'people', title: 'Customers and People Sheet', ranged: false, desc: 'Balances per person' },
  { key: 'payments', title: 'Deposits and Payments Sheet', ranged: true, desc: 'Every payment, deposit and payout' },
  { key: 'ad-income', title: 'Advertising Income Sheet', ranged: true, desc: 'Advertising earnings by report' },
  { key: 'ad-spend', title: 'Advertising Expenses Sheet', ranged: true, desc: 'Campaign spend with CPC, CPA, ROAS' },
  { key: 'expenses', title: 'Business Expenses Sheet', ranged: true, desc: 'Business expenses by category' },
  { key: 'pnl', title: 'Profit and Loss Sheet', ranged: true, desc: 'P&L statement with comparison' },
  { key: 'stock', title: 'Stock and Inventory Sheet', ranged: false, desc: 'Stock ledger summary and stock value' },
  { key: 'daily', title: 'Daily Report Sheet', ranged: true, desc: 'Day-by-day totals' },
  { key: 'weekly', title: 'Weekly Report Sheet', ranged: true, desc: 'Week-by-week totals' },
  { key: 'monthly', title: 'Monthly Report Sheet', ranged: true, desc: 'Month-by-month totals' },
  { key: 'yearly', title: 'Yearly Report Sheet', ranged: true, desc: 'Year-by-year totals' },
]

export interface LiveRow { id: string; cells: Record<string, string | number | null>; link?: string }
export interface LiveSheet { columns: SheetCol[]; rows: LiveRow[]; totals: Record<string, TotalFn>; rules: CondRule[]; rowFmt?: Record<string, CellFmt>; editable?: Record<string, 'name' | 'category' | 'buyPrice' | 'sellPrice' | 'lowStockAt'> }

const R = (p: number) => Math.round(p) / 100
const col = (id: string, name: string, type: ColType = 'text', width = 130): SheetCol => ({ id, name, type, width })
const profitRules = (colIds: string[]): CondRule[] => colIds.flatMap((c) => [
  { id: `${c}-p`, colId: c, op: 'pos' as const, value: '', color: '#047857', bg: '', label: '▲' },
  { id: `${c}-n`, colId: c, op: 'neg' as const, value: '', color: '#b91c1c', bg: '', label: '▼' },
])
const sumOf = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, 'sum' as TotalFn]))

export function buildSystemSheet(key: SystemKey, d: GxData, r: DateRange, tz: string): LiveSheet {
  const people = new Map(d.people.map((p) => [p.id, p.name]))
  switch (key) {
    case 'overview': {
      const c = summary(d, r, tz), p = summary(d, previousRange(r), tz)
      const lines: [string, number, number, 'pkr' | 'number' | 'percent'][] = [
        ['Gross sales', c.grossSales, p.grossSales, 'pkr'], ['Discounts', c.discounts, p.discounts, 'pkr'], ['Refunds', c.refunds, p.refunds, 'pkr'],
        ['Net sales', c.netSales, p.netSales, 'pkr'], ['Orders', c.orders, p.orders, 'number'], ['Units sold (net)', c.netUnits, p.netUnits, 'number'],
        ['Cost of goods sold', c.netCogs, p.netCogs, 'pkr'], ['Gross profit', c.grossProfit, p.grossProfit, 'pkr'], ['Advertising income', c.adIncome, p.adIncome, 'pkr'],
        ['Advertising expenses', c.adSpend, p.adSpend, 'pkr'], ['Business expenses', c.expenses, p.expenses, 'pkr'], ['Net profit', c.netProfit, p.netProfit, 'pkr'],
        ['Customer payments received', c.customerReceipts - c.deposits, p.customerReceipts - p.deposits, 'pkr'], ['Customer deposits received', c.deposits, p.deposits, 'pkr'],
        ['Owner contributions & loans (financing)', c.financing, p.financing, 'pkr'], ['Owner drawings', c.drawings, p.drawings, 'pkr'],
        ['Cash in', c.cashIn, p.cashIn, 'pkr'], ['Cash out', c.cashOut, p.cashOut, 'pkr'], ['Outstanding receivables (period end)', c.receivables, p.receivables, 'pkr'],
        ['Customer credit (period end)', c.customerCredit, p.customerCredit, 'pkr'], ['Tax collected (not revenue)', c.tax, p.tax, 'pkr'],
      ]
      return {
        columns: [col('m', 'Metric', 'text', 280), col('cur', `${r.from} → ${r.to}`, 'pkr', 160), col('prev', 'Previous period', 'pkr', 150), col('chg', 'Change %', 'percent', 110)],
        rows: lines.map(([m, a, b, t], i) => ({ id: `o${i}`, cells: { m, cur: t === 'pkr' ? R(a) : a, prev: t === 'pkr' ? R(b) : b, chg: pctChange(a, b) == null ? 'new' : +pctChange(a, b)!.toFixed(1) } })),
        totals: {}, rules: profitRules(['chg']),
        rowFmt: Object.fromEntries(lines.map(([, , , t], i) => [`o${i}`, t === 'number' ? { fmt: 'number' } : {}]).filter(([, v]) => Object.keys(v as object).length)),
      }
    }
    case 'products': {
      const perf = productPerformance(d, r, tz)
      return {
        columns: [col('name', 'Product', 'text', 200), col('sku', 'SKU', 'text', 100), col('cat', 'Category', 'text', 120), col('buy', 'Buying price', 'pkr'), col('sell', 'Selling price', 'pkr'),
          col('unit', 'Unit profit', 'pkr'), col('units', 'Units sold', 'number', 100), col('rev', 'Revenue', 'pkr'), col('cost', 'Cost of goods', 'pkr'), col('profit', 'Gross profit', 'pkr'),
          col('margin', 'Margin %', 'percent', 100), col('stock', 'Stock left', 'number', 100), col('low', 'Low-stock at', 'number', 110)],
        rows: perf.filter((x) => !x.product.archived).map((x) => ({ id: x.product.id, link: `/glamiex/products/${x.product.id}`, cells: {
          name: x.product.name, sku: x.product.sku, cat: x.product.category, buy: R(x.product.buyPrice), sell: R(x.product.sellPrice), unit: R(x.product.sellPrice - x.product.buyPrice),
          units: x.units, rev: R(x.revenue), cost: R(x.cost), profit: R(x.profit), margin: x.margin == null ? null : +(x.margin * 100).toFixed(2), stock: x.stock, low: x.product.lowStockAt,
        } })),
        totals: sumOf(['units', 'rev', 'cost', 'profit', 'stock']), rules: profitRules(['unit', 'profit']),
        editable: { name: 'name', cat: 'category', buy: 'buyPrice', sell: 'sellPrice', low: 'lowStockAt' },
      }
    }
    case 'sales': return {
      columns: [col('no', 'Order', 'text', 110), col('date', 'Date', 'date', 105), col('time', 'Time', 'time', 70), col('day', 'Day', 'text', 95), col('cust', 'Customer', 'text', 150),
        col('items', 'Items', 'text', 240), col('units', 'Units', 'number', 70), col('sub', 'Subtotal', 'pkr'), col('disc', 'Discount', 'pkr', 110), col('tax', 'Tax', 'pkr', 100), col('total', 'Total', 'pkr'),
        col('ref', 'Refunded', 'pkr', 110), col('paid', 'Received', 'pkr'), col('bal', 'Balance', 'pkr'), col('st', 'Status', 'text', 100)],
      rows: d.orders.filter((o) => !o.deletedAt && inRange(zoned(o.at, tz).date, r)).sort((a, b) => a.at.localeCompare(b.at)).map((o) => {
        const z = zoned(o.at, tz), b = orderBalance(o, d.payments, d.refunds), cancelled = o.status === 'cancelled'
        return { id: o.id, link: `/glamiex/sales/${o.id}`, cells: { no: o.orderNo, date: z.date, time: z.time, day: z.weekday, cust: people.get(o.personId ?? '') ?? 'Walk-in', items: o.items.map((i) => `${i.qty}× ${i.name}`).join(', '),
          units: cancelled ? 0 : orderUnits(o), sub: cancelled ? 0 : R(orderGross(o)), disc: cancelled ? 0 : R(o.discount), tax: cancelled ? 0 : R(o.tax), total: cancelled ? 0 : R(b.total), ref: R(b.refunded), paid: R(b.paid), bal: cancelled ? 0 : R(b.balance), st: b.status } }
      }),
      totals: sumOf(['units', 'sub', 'disc', 'tax', 'total', 'ref', 'paid', 'bal']),
      rules: [{ id: 'unpaid', colId: 'st', op: 'eq', value: 'unpaid', color: '#b91c1c', bg: '', label: '⚠' }, { id: 'partial', colId: 'st', op: 'eq', value: 'partial', color: '#a16207', bg: '', label: '◐' }, { id: 'cancel', colId: 'st', op: 'eq', value: 'cancelled', color: '#64748b', bg: '', label: '✕' }],
    }
    case 'people': return {
      columns: [col('name', 'Name', 'text', 180), col('type', 'Type', 'text', 100), col('phone', 'Phone', 'text', 130), col('open', 'Opening', 'pkr'), col('chg', 'Charges', 'pkr'), col('ref', 'Refunds', 'pkr'),
        col('recv', 'Received', 'pkr'), col('out', 'Paid out', 'pkr'), col('adj', 'Adjustments', 'pkr'), col('bal', 'Outstanding', 'pkr')],
      rows: d.people.filter((p) => !p.deletedAt).map((p) => { const b = personBalance(p, d, tz, r.to); return { id: p.id, link: `/glamiex/people/${p.id}`, cells: { name: p.name, type: p.type, phone: p.phone, open: R(b.opening), chg: R(b.charges), ref: R(b.refunds), recv: R(b.received), out: R(b.paidOut), adj: R(b.adjustments), bal: R(b.balance) } } }),
      totals: sumOf(['chg', 'ref', 'recv', 'out', 'bal']),
      rules: [{ id: 'owes', colId: 'bal', op: 'pos', value: '', color: '#a16207', bg: '', label: 'Owes' }, { id: 'credit', colId: 'bal', op: 'neg', value: '', color: '#047857', bg: '', label: 'Credit' }],
    }
    case 'payments': return {
      columns: [col('no', 'Txn', 'text', 110), col('date', 'Date', 'date', 105), col('time', 'Time', 'time', 70), col('day', 'Day', 'text', 95), col('person', 'Person', 'text', 150), col('type', 'Type', 'text', 200),
        col('dir', 'Direction', 'text', 90), col('method', 'Method', 'text', 100), col('ref', 'Reference', 'text', 130), col('amt', 'Amount', 'pkr'), col('void', 'Voided', 'text', 80)],
      rows: d.payments.filter((p) => !p.deletedAt && inRange(zoned(p.at, tz).date, r)).sort((a, b) => a.at.localeCompare(b.at)).map((p) => {
        const z = zoned(p.at, tz), t = PAYMENT_TYPES.find((x) => x.id === p.type)!
        return { id: p.id, link: `/glamiex/payments/${p.id}`, cells: { no: p.txnNo, date: z.date, time: z.time, day: z.weekday, person: people.get(p.personId ?? '') ?? '', type: t.label, dir: t.dir, method: p.method, ref: p.reference, amt: p.voided ? 0 : R(p.amount), void: p.voided ? 'VOID' : '' } }
      }),
      totals: sumOf(['amt']), rules: [{ id: 'in', colId: 'dir', op: 'eq', value: 'in', color: '#047857', bg: '', label: '↓' }, { id: 'out', colId: 'dir', op: 'eq', value: 'out', color: '#b91c1c', bg: '', label: '↑' }],
    }
    case 'ad-income': return {
      columns: [col('date', 'Report date', 'date', 110), col('plat', 'Platform', 'text', 150), col('camp', 'Campaign', 'text', 150), col('cur', 'Currency', 'text', 80), col('gross', 'Gross', 'number'), col('adj', 'Adjustments', 'number'), col('rate', 'Rate', 'number', 80), col('net', 'Net (PKR)', 'pkr')],
      rows: d.adIncome.filter((x) => !x.deletedAt && inRange(x.reportDate, r)).map((x) => ({ id: x.id, link: '/glamiex/ad-income', cells: { date: x.reportDate, plat: x.platform, camp: x.campaign, cur: x.currency, gross: x.gross / 100, adj: x.adjustments / 100, rate: x.exchangeRate, net: R(x.netPkr) } })),
      totals: sumOf(['net']), rules: [],
    }
    case 'ad-spend': return {
      columns: [col('plat', 'Platform', 'text', 140), col('camp', 'Campaign', 'text', 160), col('start', 'Start', 'date', 105), col('end', 'End', 'date', 105), col('amt', 'Spent (PKR)', 'pkr'), col('clicks', 'Clicks', 'number', 80),
        col('imp', 'Impressions', 'number', 110), col('conv', 'Conversions', 'number', 100), col('attr', 'Attributed sales', 'pkr', 140), col('cpc', 'CPC', 'pkr', 90), col('cpa', 'CPA', 'pkr', 100), col('roas', 'ROAS ×', 'number', 80)],
      rows: d.adSpend.filter((x) => !x.deletedAt && x.start <= r.to && (x.end || x.start) >= r.from).map((x) => { const k = adKpis([x]); return { id: x.id, link: '/glamiex/ad-spend', cells: {
        plat: x.platform, camp: x.campaign, start: x.start, end: x.end, amt: R(x.amountPkr), clicks: x.clicks, imp: x.impressions, conv: x.conversions, attr: x.attributedSales == null ? null : R(x.attributedSales),
        cpc: k.cpc == null ? null : R(k.cpc), cpa: k.cpa == null ? null : R(k.cpa), roas: k.roas == null ? null : +k.roas.toFixed(2) } } }),
      totals: sumOf(['amt', 'clicks', 'imp', 'conv', 'attr']), rules: [],
    }
    case 'expenses': return {
      columns: [col('date', 'Date', 'date', 105), col('cat', 'Category', 'text', 140), col('desc', 'Description', 'text', 220), col('vendor', 'Vendor', 'text', 140), col('method', 'Method', 'text', 100), col('amt', 'Amount', 'pkr')],
      rows: d.expenses.filter((x) => !x.deletedAt && inRange(x.date, r)).sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ id: x.id, link: '/glamiex/expenses', cells: { date: x.date, cat: x.category, desc: x.description, vendor: x.vendor, method: x.method, amt: R(x.amount) } })),
      totals: sumOf(['amt']), rules: [],
    }
    case 'pnl': {
      const p = pnlLines(d, r, tz)
      return {
        columns: [col('line', 'Line', 'text', 260), col('cur', 'This period', 'pkr', 150), col('prev', 'Previous period', 'pkr', 150), col('chg', 'Change %', 'percent', 100)],
        rows: p.lines.map((l, i) => ({ id: `l${i}`, cells: { line: l.label, cur: R(l.cur), prev: R(l.prev), chg: pctChange(l.cur, l.prev) == null ? 'new' : +pctChange(l.cur, l.prev)!.toFixed(1) } })),
        totals: {}, rules: profitRules(['cur']),
      }
    }
    case 'stock': {
      const perf = productPerformance(d, null, tz)
      return {
        columns: [col('name', 'Product', 'text', 200), col('sku', 'SKU', 'text', 100), col('open', 'Opening', 'number', 90), col('purch', 'Purchased', 'number', 100), col('sold', 'Sold', 'number', 80),
          col('ret', 'Returned/cancelled', 'number', 140), col('adj', 'Adjusted', 'number', 90), col('stock', 'Current stock', 'number', 120), col('val', 'Stock value (cost)', 'pkr', 150), col('low', 'Status', 'text', 110)],
        rows: perf.map((x) => {
          const mv = d.stock.filter((s) => s.productId === x.product.id && !s.deletedAt)
          const by = (rs: string[]) => mv.filter((s) => rs.includes(s.reason)).reduce((a, s) => a + s.qty, 0)
          return { id: x.product.id, link: `/glamiex/products/${x.product.id}`, cells: { name: x.product.name, sku: x.product.sku, open: by(['opening']), purch: by(['purchase']), sold: -by(['sale']), ret: by(['refund', 'cancel']), adj: by(['adjust']),
            stock: x.stock, val: R(Math.max(0, x.stock) * x.product.buyPrice), low: x.stock <= 0 ? 'Out of stock' : x.stock <= x.product.lowStockAt ? 'Low stock' : 'OK' } }
        }),
        totals: sumOf(['open', 'purch', 'sold', 'ret', 'adj', 'stock', 'val']),
        rules: [{ id: 'out', colId: 'low', op: 'eq', value: 'Out of stock', color: '#b91c1c', bg: '', label: '⛔' }, { id: 'lowst', colId: 'low', op: 'eq', value: 'Low stock', color: '#a16207', bg: '', label: '⚠' }],
      }
    }
    case 'daily': case 'weekly': case 'monthly': case 'yearly': {
      const g = ({ daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const)[key]
      return {
        columns: [col('p', 'Period', 'text', 130), col('orders', 'Orders', 'number', 80), col('units', 'Units', 'number', 80), col('sales', 'Net sales', 'pkr'), col('cogs', 'COGS', 'pkr'), col('gp', 'Gross profit', 'pkr'),
          col('ai', 'Ad income', 'pkr'), col('as', 'Ad expenses', 'pkr'), col('exp', 'Expenses', 'pkr'), col('np', 'Net profit', 'pkr'), col('cin', 'Cash in', 'pkr'), col('cout', 'Cash out', 'pkr'), col('dep', 'Deposits', 'pkr')],
        rows: series(d, r, g, tz).map((s) => ({ id: s.key, cells: { p: s.label, orders: s.orders, units: s.netUnits, sales: R(s.netSales), cogs: R(s.netCogs), gp: R(s.grossProfit), ai: R(s.adIncome), as: R(s.adSpend), exp: R(s.expenses), np: R(s.netProfit), cin: R(s.cashIn), cout: R(s.cashOut), dep: R(s.deposits) } })),
        totals: sumOf(['orders', 'units', 'sales', 'cogs', 'gp', 'ai', 'as', 'exp', 'np', 'cin', 'cout', 'dep']), rules: profitRules(['gp', 'np']),
      }
    }
  }
}
