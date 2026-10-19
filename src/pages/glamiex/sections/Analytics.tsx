import { useMemo, useState } from 'react'
import { distribution, hourly, productPerformance, series, weekdayTotals, type SeriesPoint } from '@/features/glamiex/engine'
import { autoGrouping, type Grouping } from '@/features/glamiex/time'
import { DataTable, ExportButtons, Money, RangeBar, rs, useRange, type Col } from '@/features/glamiex/ui'
import { GroupingSelect, MoneyDistributionChart, ProductPerformanceChart, RevenueGrowthChart, SalesComparisonChart, TrendsChart } from '@/features/glamiex/charts'
import { useGx } from '../context'
import { earliestDate } from './shared'

export function PeriodTable({ rows }: { rows: SeriesPoint[] }) {
  const cols: Col<SeriesPoint>[] = [
    { key: 'p', label: 'Period', render: (r) => r.label, sort: (r) => r.key, text: (r) => r.label },
    { key: 'o', label: 'Orders', align: 'right', render: (r) => r.orders, sort: (r) => r.orders },
    { key: 'u', label: 'Units', align: 'right', render: (r) => r.netUnits, sort: (r) => r.netUnits },
    { key: 's', label: 'Net sales', align: 'right', render: (r) => <Money v={r.netSales} />, sort: (r) => r.netSales },
    { key: 'c', label: 'COGS', align: 'right', render: (r) => <Money v={r.netCogs} />, sort: (r) => r.netCogs },
    { key: 'ai', label: 'Ad income', align: 'right', render: (r) => <Money v={r.adIncome} />, sort: (r) => r.adIncome },
    { key: 'as', label: 'Ad spend', align: 'right', render: (r) => <Money v={r.adSpend} />, sort: (r) => r.adSpend },
    { key: 'e', label: 'Expenses', align: 'right', render: (r) => <Money v={r.expenses} />, sort: (r) => r.expenses },
    { key: 'np', label: 'Net profit', align: 'right', render: (r) => <b><Money v={r.netProfit} tone /></b>, sort: (r) => r.netProfit },
    { key: 'd', label: 'Deposits', align: 'right', render: (r) => <Money v={r.deposits} />, sort: (r) => r.deposits },
  ]
  return <DataTable rows={rows} cols={cols} rowKey={(r) => r.key} searchable={false} pageSize={100}
    card={(r) => <div className="flex items-center justify-between gap-2 text-sm"><div><div className="font-medium">{r.label}</div><div className="text-xs text-muted">{r.orders} orders · {r.netUnits} units · sales <Money v={r.netSales} /></div></div><b><Money v={r.netProfit} tone /></b></div>} />
}

export const periodRows = (rows: SeriesPoint[]) => [['Period', 'Orders', 'Units', 'Net sales (Rs)', 'COGS (Rs)', 'Gross profit (Rs)', 'Ad income (Rs)', 'Ad spend (Rs)', 'Expenses (Rs)', 'Net profit (Rs)', 'Deposits (Rs)', 'Cash in (Rs)', 'Cash out (Rs)'],
  ...rows.map((p) => [p.label, p.orders, p.netUnits, rs(p.netSales), rs(p.netCogs), rs(p.grossProfit), rs(p.adIncome), rs(p.adSpend), rs(p.expenses), rs(p.netProfit), rs(p.deposits), rs(p.cashIn), rs(p.cashOut)])]

export default function Analytics() {
  const { data, tz, settings } = useGx()
  const { state, setState, range: raw } = useRange('analytics', tz, 'last30')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [grouping, setGrouping] = useState<Exclude<Grouping, 'hour'> | null>(null)
  const g = grouping ?? autoGrouping(range)
  const v = useMemo(() => ({
    series: series(data, range, g, tz), daily: series(data, range, 'day', tz), hourly: hourly(data, range, tz), weekday: weekdayTotals(data, range, tz),
    dist: distribution(data, range, tz), perf: productPerformance(data, range, tz),
  }), [data, range.from, range.to, g, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const control = <GroupingSelect value={g} onChange={setGrouping} />
  return (
    <div className="space-y-4">
      <RangeBar state={state} setState={setState} range={range} extra={<>{control}<ExportButtons name="Sales analytics" period={`${range.from} to ${range.to}`} sheets={() => [{ name: 'Periods', rows: periodRows(v.series) }, { name: 'Hourly', rows: [['Hour', 'Orders', 'Sales (Rs)'], ...v.hourly.map((h) => [h.label, h.orders, rs(h.sales)])] }]} /></>} />
      <div className="grid gap-4 xl:grid-cols-2">
        <RevenueGrowthChart data={v.series} smooth={settings.chartStyle === 'smooth'} gradient={settings.chartGradient} controls={control} />
        <SalesComparisonChart data={v.series} controls={control} />
        <ProductPerformanceChart perf={v.perf} />
        <MoneyDistributionChart rows={v.dist.rows} loss={v.dist.loss} />
        <div className="xl:col-span-2"><TrendsChart daily={v.daily} hourlyRows={v.hourly} weekday={v.weekday} /></div>
      </div>
      <div><h2 className="mb-2 text-sm font-semibold">Data behind the charts</h2><PeriodTable rows={v.series} /></div>
    </div>
  )
}
