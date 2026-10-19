import { useMemo, useState } from 'react'
import { addMonths, addWeeks, addYears, endOfMonth, endOfWeek, endOfYear, format, startOfMonth, startOfWeek, startOfYear } from 'date-fns'
import { ChevronLeft, ChevronRight, ListOrdered } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { distribution, hourly, productPerformance, series, summary, weekdayTotals, orderBalance, orderTotal } from '@/features/glamiex/engine'
import { inRange, previousRange, zoned } from '@/features/glamiex/time'
import { buildReport } from '@/features/glamiex/reports'
import { parseDate, toISODate } from '@/lib/dates'
import { ExportButtons, KpiCard, Money, PayBadge, Section } from '@/features/glamiex/ui'
import { MoneyDistributionChart, ProductPerformanceChart, RevenueGrowthChart, SalesComparisonChart, TrendsChart } from '@/features/glamiex/charts'
import { Link } from 'react-router-dom'
import { useGx, live } from '../context'
import { PeriodTable, periodRows } from './Analytics'

type Unit = 'week' | 'month' | 'year'
const span = (unit: Unit, anchor: Date) => unit === 'week'
  ? { from: toISODate(startOfWeek(anchor, { weekStartsOn: 1 })), to: toISODate(endOfWeek(anchor, { weekStartsOn: 1 })) }
  : unit === 'month' ? { from: toISODate(startOfMonth(anchor)), to: toISODate(endOfMonth(anchor)) }
  : { from: toISODate(startOfYear(anchor)), to: toISODate(endOfYear(anchor)) }

export default function PeriodReport({ unit }: { unit: Unit }) {
  const { data, tz, settings } = useGx()
  const today = parseDate(zoned(new Date().toISOString(), tz).date)
  const [offset, setOffset] = useState(0)
  const anchor = unit === 'week' ? addWeeks(today, offset) : unit === 'month' ? addMonths(today, offset) : addYears(today, offset)
  const range = span(unit, anchor)
  const label = unit === 'week' ? `Week of ${format(parseDate(range.from), 'd MMM yyyy')}` : unit === 'month' ? format(anchor, 'MMMM yyyy') : format(anchor, 'yyyy')
  const g = unit === 'year' ? 'month' : 'day'
  const v = useMemo(() => ({
    cur: summary(data, range, tz), prev: summary(data, previousRange(range), tz), series: series(data, range, g, tz), daily: series(data, range, 'day', tz),
    hourly: hourly(data, range, tz), weekday: weekdayTotals(data, range, tz), dist: distribution(data, range, tz), perf: productPerformance(data, range, tz),
    orders: live(data.orders).filter((o) => inRange(zoned(o.at, tz).date, range)).sort((a, b) => b.at.localeCompare(a.at)),
  }), [data, range.from, range.to, tz, g]) // eslint-disable-line react-hooks/exhaustive-deps
  const { cur, prev } = v

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton icon={ChevronLeft} label={`Previous ${unit}`} className="border border-line" onClick={() => setOffset(offset - 1)} />
        <div className="min-w-[10rem] text-center"><div className="font-semibold">{label}</div><div className="text-xs text-muted">{range.from} → {range.to}</div></div>
        <IconButton icon={ChevronRight} label={`Next ${unit}`} className="border border-line" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} />
        {offset !== 0 && <Button size="sm" onClick={() => setOffset(0)}>Current {unit}</Button>}
        <div className="ml-auto"><ExportButtons name={`${unit[0].toUpperCase()}${unit.slice(1)}ly report — ${label}`} period={`${range.from} to ${range.to}`}
          sheets={() => [{ name: 'Summary', rows: periodRows(v.series) }, ...buildReport('pnl', data, range, tz), ...buildReport('sales', data, range, tz), ...buildReport('products', data, range, tz)]} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 lg:grid-cols-4">
        <KpiCard label="Net sales" value={cur.netSales} prev={prev.netSales} />
        <KpiCard label="Orders" value={cur.orders} prev={prev.orders} kind="count" />
        <KpiCard label="Units sold" value={cur.netUnits} prev={prev.netUnits} kind="count" />
        <KpiCard label="Gross profit" value={cur.grossProfit} prev={prev.grossProfit} tone="auto" />
        <KpiCard label="Advertising income" value={cur.adIncome} prev={prev.adIncome} />
        <KpiCard label="Advertising spend" value={cur.adSpend} prev={prev.adSpend} invert />
        <KpiCard label="Costs & expenses" value={cur.netCogs + cur.expenses} prev={prev.netCogs + prev.expenses} invert />
        <KpiCard label="Net profit" value={cur.netProfit} prev={prev.netProfit} tone="auto" />
        <KpiCard label="Deposits received" value={cur.deposits} prev={prev.deposits} />
        <KpiCard label="Cash received" value={cur.customerReceipts} prev={prev.customerReceipts} />
        <KpiCard label="Outstanding at end" value={cur.receivables} prev={prev.receivables} invert tone={cur.receivables ? 'warn' : undefined} />
        <KpiCard label="Net margin" value={cur.netMargin} prev={prev.netMargin ?? 0} kind="pct" tone="auto" />
      </div>
      <p className="text-xs text-muted">Compared with the previous {unit} ({previousRange(range).from} → {previousRange(range).to}). “new” means the previous {unit} was zero.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        <RevenueGrowthChart data={v.series} smooth={settings.chartStyle === 'smooth'} gradient={settings.chartGradient} />
        <SalesComparisonChart data={v.series} />
        <MoneyDistributionChart rows={v.dist.rows} loss={v.dist.loss} />
        <ProductPerformanceChart perf={v.perf} />
        <div className="xl:col-span-2"><TrendsChart daily={v.daily} hourlyRows={v.hourly} weekday={v.weekday} /></div>
      </div>
      <div><h2 className="mb-2 text-sm font-semibold">Breakdown by {g === 'day' ? 'day' : 'month'}</h2><PeriodTable rows={v.series} /></div>
      <Section title={`Transactions behind this ${unit} (${v.orders.length} orders)`} icon={ListOrdered} defaultOpen={false}>
        {!v.orders.length ? <p className="text-sm text-muted">No orders.</p> : <ul className="divide-y divide-line/60">{v.orders.map((o) => { const b = orderBalance(o, data.payments, data.refunds); const z = zoned(o.at, tz); return (
          <li key={o.id}><Link to={`/glamiex/sales/${o.id}`} className="flex min-h-[44px] flex-wrap items-center gap-x-3 py-2 text-sm hover:text-accent"><span className="font-mono text-xs">{o.orderNo}</span><span className="text-xs text-muted">{z.date} {z.time}</span><span className="min-w-0 flex-1 truncate">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span><PayBadge s={b.status} /><Money v={orderTotal(o)} /></Link></li>
        ) })}</ul>}
        <p className="mt-2 text-xs text-muted">Payments, ad entries and expenses for this {unit} are in <Link className="text-accent" to="/glamiex/transactions">Transactions</Link>.</p>
      </Section>
    </div>
  )
}
