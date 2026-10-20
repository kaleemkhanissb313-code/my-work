import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Package, Plus, ShoppingCart } from 'lucide-react'
import { logisticsSummary } from '@/features/glamiex/logistics'
import { distribution, hourly, productPerformance, series, summary, weekdayTotals, orderBalance, orderTotal } from '@/features/glamiex/engine'
import { autoGrouping, previousRange, zoned, type Grouping } from '@/features/glamiex/time'
import { KpiCard, Money, PayBadge, RangeBar, Section, useRange } from '@/features/glamiex/ui'
import { GroupingSelect, MoneyDistributionChart, ProductPerformanceChart, RevenueGrowthChart, SalesComparisonChart, TrendsChart } from '@/features/glamiex/charts'
import { useGx, live } from '../context'
import { earliestDate } from './shared'

export default function Overview() {
  const { data, tz, settings } = useGx()
  const { state, setState, range: raw } = useRange('overview', tz)
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [grouping, setGrouping] = useState<Exclude<Grouping, 'hour'> | null>(null)
  const g = grouping ?? autoGrouping(range)

  const v = useMemo(() => {
    const cur = summary(data, range, tz)
    const prev = summary(data, previousRange(range), tz)
    return {
      cur, prev, series: series(data, range, g, tz), daily: series(data, range, 'day', tz), hourly: hourly(data, range, tz), weekday: weekdayTotals(data, range, tz),
      dist: distribution(data, range, tz), perf: productPerformance(data, range, tz),
      lg: logisticsSummary(data, range, tz, cur.units), lgPrev: logisticsSummary(data, previousRange(range), tz, prev.units),
      lowStock: productPerformance(data, null, tz).filter((p) => p.product.status === 'active' && p.stock <= p.product.lowStockAt).sort((a, b) => a.stock - b.stock),
    }
  }, [data, range.from, range.to, g, tz]) // eslint-disable-line react-hooks/exhaustive-deps

  const { cur, prev, lg, lgPrev } = v
  const lgKpis = [
    { label: 'Total returned products', value: lg.returnedUnits, prev: lgPrev.returnedUnits, kind: 'count' as const, invert: true, to: 'returns' },
    { label: 'Return rate', value: lg.returnRate, prev: lgPrev.returnRate ?? 0, kind: 'pct' as const, invert: true, to: 'returns', sub: 'of units sold' },
    { label: 'Total refunds', value: cur.refunds, prev: prev.refunds, invert: true, to: 'returns' },
    { label: 'Return shipping costs', value: lg.returnShipping, prev: lgPrev.returnShipping, invert: true, to: 'returns' },
    { label: 'Returned stock buying cost', value: lg.returnedStockCost, prev: lgPrev.returnedStockCost, to: 'returns', sub: 'informational' },
    { label: 'Delivered orders', value: lg.deliveredOrders, prev: lgPrev.deliveredOrders, kind: 'count' as const, to: 'deliveries' },
    { label: 'Products delivered', value: lg.productsDelivered, prev: lgPrev.productsDelivered, kind: 'count' as const, to: 'deliveries' },
    { label: 'Failed deliveries', value: lg.failed, prev: lgPrev.failed, kind: 'count' as const, invert: true, to: 'deliveries' },
    { label: 'Total delivery expenses', value: lg.deliveryExpense, prev: lgPrev.deliveryExpense, invert: true, to: 'deliveries' },
    { label: 'Rider earnings', value: lg.riderEarnings, prev: lgPrev.riderEarnings, to: 'riders' },
    { label: 'Rider payments made', value: lg.riderPaid, prev: lgPrev.riderPaid, to: 'riders' },
    { label: 'Outstanding rider payments', value: lg.outstanding, prev: lgPrev.outstanding, invert: true, tone: lg.outstanding > 0 ? 'warn' as const : undefined, to: 'riders' },
    { label: 'Reverse delivery expenses', value: lg.reverseDelivery, prev: lgPrev.reverseDelivery, invert: true, to: 'returns' },
    { label: 'Net return & delivery impact', value: lg.netImpact, prev: lgPrev.netImpact, tone: 'auto' as const, to: 'logistics-reports' },
  ]
  const recent = useMemo(() => live(data.orders).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6), [data.orders])
  const isEmpty = !live(data.products).length && !live(data.orders).length

  const kpis = [
    { label: 'Sales revenue', value: cur.netSales, prev: prev.netSales, to: 'analytics', sub: cur.tax ? `+ ${(cur.tax / 100).toLocaleString('en-PK')} tax` : undefined },
    { label: 'Units sold', value: cur.netUnits, prev: prev.netUnits, kind: 'count' as const, to: 'products' },
    { label: 'Orders', value: cur.orders, prev: prev.orders, kind: 'count' as const, to: 'sales' },
    { label: 'Product cost (COGS)', value: cur.netCogs, prev: prev.netCogs, invert: true, to: 'pnl' },
    { label: 'Gross profit', value: cur.grossProfit, prev: prev.grossProfit, tone: 'auto' as const, to: 'pnl' },
    { label: 'Advertising income', value: cur.adIncome, prev: prev.adIncome, to: 'ad-income' },
    { label: 'Advertising spend', value: cur.adSpend, prev: prev.adSpend, invert: true, to: 'ad-spend' },
    { label: 'Other expenses', value: cur.expenses, prev: prev.expenses, invert: true, to: 'expenses' },
    { label: 'Net profit', value: cur.netProfit, prev: prev.netProfit, tone: 'auto' as const, to: 'pnl' },
    { label: 'Deposits received', value: cur.deposits, prev: prev.deposits, to: 'payments', sub: cur.financing ? `Owner/loans: ${(cur.financing / 100).toLocaleString('en-PK')}` : undefined },
    { label: 'Outstanding receivables', value: cur.receivables, prev: prev.receivables, invert: true, tone: cur.receivables > 0 ? 'warn' as const : undefined, to: 'people' },
    { label: 'Best-selling product', value: cur.bestSeller ? cur.bestSeller.product.name : null, kind: 'text' as const, to: cur.bestSeller ? `products/${cur.bestSeller.product.id}` : 'products', sub: cur.bestSeller ? `${cur.bestSeller.units} units` : 'No sales yet' },
    { label: 'Average order value', value: cur.aov, prev: prev.aov ?? 0, to: 'sales' },
    { label: 'Net profit margin', value: cur.netMargin, prev: prev.netMargin ?? 0, kind: 'pct' as const, tone: 'auto' as const, to: 'pnl' },
  ]

  return (
    <div className="space-y-4">
      <RangeBar state={state} setState={setState} range={range} extra={<>
        <Link to="/glamiex/products/new" className="btn btn-soft h-10 px-3 text-sm"><Package className="h-4 w-4" aria-hidden />Product</Link>
        <Link to="/glamiex/sales/new" className="btn btn-3d h-10 px-4 text-sm"><Plus className="h-4 w-4" aria-hidden />New sale</Link>
      </>} />

      {isEmpty && (
        <div className="card flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-0 flex-1"><h2 className="font-semibold">Welcome to GLAMIEX</h2><p className="text-sm text-muted">Every number here is calculated from your own records. Start by adding a product, then record a sale.</p></div>
          <Link to="/glamiex/products/new" className="btn btn-3d h-11 px-4 text-sm"><Package className="h-4 w-4" />Add first product</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 lg:grid-cols-4 2xl:grid-cols-7">
        {kpis.map((k, i) => <KpiCard key={k.label} {...k} to={`/glamiex/${k.to}`} delay={i * 25} />)}
      </div>
      <Section title="Returns & deliveries" icon={ShoppingCart} defaultOpen={lg.returns > 0 || lg.deliveredOrders > 0 || lg.failed > 0 || live(data.shipments).length > 0}>
        <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 lg:grid-cols-4 2xl:grid-cols-7">
          {lgKpis.map((k, i) => <KpiCard key={k.label} {...k} to={`/glamiex/${k.to}`} delay={i * 20} />)}
        </div>
        <p className="mt-2 text-xs text-muted">Refunds reduce net sales once; restocked returns reverse their cost once. Rider payments settle rider earnings already counted as delivery expenses.</p>
      </Section>
      <p className="text-xs text-muted">Arrows compare with the previous equivalent period ({previousRange(range).from} → {previousRange(range).to}). Cash received this period: <Money v={cur.customerReceipts} /> from customers · tax collected <Money v={cur.tax} /> (not revenue).</p>

      {v.lowStock.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 border-warn/40 p-3 text-sm" role="status">
          <AlertTriangle className="h-4 w-4 text-warn" aria-hidden /><b>Low stock:</b>
          {v.lowStock.slice(0, 6).map((p) => <Link key={p.product.id} to={`/glamiex/products/${p.product.id}`} className="chip border-warn/40 text-warn">{p.product.name}: {p.stock}</Link>)}
          {v.lowStock.length > 6 && <span className="text-muted">+{v.lowStock.length - 6} more</span>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <RevenueGrowthChart data={v.series} smooth={settings.chartStyle === 'smooth'} gradient={settings.chartGradient} controls={<GroupingSelect value={g} onChange={setGrouping} />} />
        <SalesComparisonChart data={v.series} controls={<GroupingSelect value={g} onChange={setGrouping} />} />
        <MoneyDistributionChart rows={v.dist.rows} loss={v.dist.loss} />
        <ProductPerformanceChart perf={v.perf} />
        <div className="xl:col-span-2"><TrendsChart daily={v.daily} hourlyRows={v.hourly} weekday={v.weekday} /></div>
      </div>

      <Section title="Recent sales" icon={ShoppingCart} actions={<Link to="/glamiex/sales" className="text-xs text-accent">All sales</Link>}>
        {!recent.length ? <p className="text-sm text-muted">No sales recorded yet.</p> : (
          <ul className="divide-y divide-line/60">
            {recent.map((o) => {
              const b = orderBalance(o, data.payments, data.refunds)
              return (
                <li key={o.id}><Link to={`/glamiex/sales/${o.id}`} className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:text-accent">
                  <span className="font-mono text-xs text-muted">{o.orderNo}</span>
                  <span className="min-w-0 flex-1 truncate">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span>
                  <span className="text-xs text-muted">{zoned(o.at, tz).date}</span>
                  <PayBadge s={b.status} />
                  <span className="w-28 text-right font-semibold"><Money v={orderTotal(o)} /></span>
                </Link></li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
