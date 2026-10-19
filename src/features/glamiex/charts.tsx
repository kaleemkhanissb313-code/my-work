import { useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Maximize2 } from 'lucide-react'
import { useChartTheme, tooltipStyle } from '@/features/charts/theme'
import { IconButton, Modal, Select, Tabs } from '@/components/ui'
import { pkr, pkrCompact } from './money'
import type { SeriesPoint, ProductPerf } from './engine'
import { GROUPINGS, type Grouping } from './time'

/* All values arrive in PAISA; axes/tooltips format as PKR. */
const moneyTick = (v: number) => pkrCompact(v).replace('Rs ', '')
const moneyTip = (v: unknown) => pkr(Number(v))

function Frame({ title, subtitle, controls, children, empty, height = 300 }: { title: string; subtitle?: string; controls?: React.ReactNode; children: (h: number) => React.ReactElement; empty?: string | false; height?: number }) {
  const [big, setBig] = useState(false)
  const body = (h: number) => empty
    ? <div className="grid place-items-center rounded-xl border border-dashed border-line text-center text-sm text-muted" style={{ height: h }}><p className="max-w-xs p-4">{empty}</p></div>
    : <div style={{ width: '100%', height: h }}><ResponsiveContainer width="100%" height="100%">{children(h)}</ResponsiveContainer></div>
  return (
    <section className="card gx-chart gx-rise p-4">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{title}</h3>{subtitle && <p className="text-xs text-muted">{subtitle}</p>}</div>
        {controls}
        <IconButton icon={Maximize2} label={`Expand ${title}`} onClick={() => setBig(true)} />
      </div>
      {body(height)}
      <Modal open={big} onClose={() => setBig(false)} title={title} wide>{body(Math.min(560, typeof window !== 'undefined' ? window.innerHeight * 0.6 : 480))}</Modal>
    </section>
  )
}

export function GroupingSelect({ value, onChange }: { value: Exclude<Grouping, 'hour'>; onChange: (g: Exclude<Grouping, 'hour'>) => void }) {
  return (
    <Select aria-label="Group by" className="h-9 w-auto py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value as Exclude<Grouping, 'hour'>)}>
      {GROUPINGS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
    </Select>
  )
}

/** 1. Revenue Growth — smooth area chart of revenue, total costs and net profit. */
export function RevenueGrowthChart({ data, smooth = true, gradient = true, controls }: { data: SeriesPoint[]; smooth?: boolean; gradient?: boolean; controls?: React.ReactNode }) {
  const t = useChartTheme()
  const rows = data.map((p) => ({ label: p.label, Revenue: p.netSales, Costs: p.netCogs + p.adSpend + p.expenses, 'Net profit': p.netProfit }))
  const empty = rows.every((r) => !r.Revenue && !r.Costs && !r['Net profit']) && 'No sales, costs or expenses in this period yet. Record a sale to see growth.'
  const colors = { Revenue: t.palette[0], Costs: t.danger, 'Net profit': t.ok }
  const type = smooth ? 'monotone' : 'linear'
  return (
    <Frame title="Revenue growth" subtitle="Net sales vs. total costs (COGS + ads + expenses) and net profit" controls={controls} empty={empty}>
      {() => (
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>{Object.entries(colors).map(([k, c]) => (
            <linearGradient key={k} id={`gx-g-${k.replace(' ', '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={gradient ? 0.45 : 0.15} /><stop offset="100%" stopColor={c} stopOpacity={gradient ? 0.02 : 0.15} /></linearGradient>
          ))}</defs>
          <CartesianGrid stroke={t.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={t.muted} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} minTickGap={16} />
          <YAxis stroke={t.muted} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} width={52} tickFormatter={moneyTick} />
          <Tooltip {...tooltipStyle(t)} formatter={moneyTip} />
          <Legend wrapperStyle={{ fontSize: 12, color: t.fg }} />
          {Object.entries(colors).map(([k, c]) => <Area key={k} type={type} dataKey={k} stroke={c} strokeWidth={2} fill={`url(#gx-g-${k.replace(' ', '')})`} animationDuration={700} />)}
        </AreaChart>
      )}
    </Frame>
  )
}

/** 2. Sales Comparison — grouped bars of sales, expenses and profit per period. */
export function SalesComparisonChart({ data, controls }: { data: SeriesPoint[]; controls?: React.ReactNode }) {
  const t = useChartTheme()
  const rows = data.map((p) => ({ label: p.label, Sales: p.netSales, Expenses: p.adSpend + p.expenses, 'Gross profit': p.grossProfit, 'Net profit': p.netProfit }))
  const empty = rows.every((r) => !r.Sales && !r.Expenses) && 'Nothing to compare yet for this period.'
  return (
    <Frame title="Sales comparison" subtitle="Sales, operating expenses and profit side by side" controls={controls} empty={empty}>
      {() => (
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={t.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={t.muted} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} minTickGap={8} />
          <YAxis stroke={t.muted} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} width={52} tickFormatter={moneyTick} />
          <Tooltip {...tooltipStyle(t)} formatter={moneyTip} cursor={{ fill: t.line, fillOpacity: 0.3 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: t.fg }} />
          <Bar dataKey="Sales" fill={t.palette[0]} radius={[6, 6, 0, 0]} animationDuration={700} />
          <Bar dataKey="Expenses" fill={t.palette[2]} radius={[6, 6, 0, 0]} animationDuration={700} />
          <Bar dataKey="Gross profit" fill={t.palette[1]} radius={[6, 6, 0, 0]} animationDuration={700} />
          <Bar dataKey="Net profit" radius={[6, 6, 0, 0]} animationDuration={700}>
            {rows.map((r, i) => <Cell key={i} fill={r['Net profit'] < 0 ? t.danger : t.ok} />)}
          </Bar>
        </BarChart>
      )}
    </Frame>
  )
}

/** 3. Money Distribution — donut of where revenue went (costs, ad spend, expense categories, net profit). */
export function MoneyDistributionChart({ rows, loss }: { rows: { name: string; value: number }[]; loss: number }) {
  const t = useChartTheme()
  const total = rows.reduce((a, r) => a + r.value, 0)
  const empty = !rows.length && 'No costs or profit recorded in this period.'
  return (
    <Frame title="Money distribution" subtitle={loss ? `Net LOSS of ${pkr(loss)} in this period (not shown as a slice)` : 'Share of costs, expenses and net profit'} empty={empty}>
      {() => (
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2} stroke={t.surface} animationDuration={700}
            label={({ percent }: { percent: number }) => (percent >= 0.06 ? `${(percent * 100).toFixed(0)}%` : '')} labelLine={false}>
            {rows.map((r, i) => <Cell key={r.name} fill={r.name === 'Net profit' ? t.ok : t.palette[(i + 1) % t.palette.length]} />)}
          </Pie>
          <Tooltip {...tooltipStyle(t)} formatter={(v: unknown) => `${pkr(Number(v))} (${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%)`} />
          <Legend wrapperStyle={{ fontSize: 12, color: t.fg }} />
        </PieChart>
      )}
    </Frame>
  )
}

/** 4. Product Performance — ranked horizontal bars by units, revenue or profit. */
export function ProductPerformanceChart({ perf }: { perf: ProductPerf[] }) {
  const t = useChartTheme()
  const [metric, setMetric] = useState<'units' | 'revenue' | 'profit'>('revenue')
  const rows = [...perf].filter((p) => p.units !== 0 || p.revenue !== 0).sort((a, b) => b[metric] - a[metric]).slice(0, 10).map((p) => ({ name: p.product.name.length > 22 ? `${p.product.name.slice(0, 21)}…` : p.product.name, value: p[metric] }))
  const isMoney = metric !== 'units'
  return (
    <Frame title="Product performance" subtitle="Top 10 products in this period" empty={!rows.length && 'No product sales in this period.'} height={Math.max(220, rows.length * 34 + 40)}
      controls={<Tabs label="Product metric" value={metric} onChange={setMetric} tabs={[{ id: 'revenue', label: 'Revenue' }, { id: 'units', label: 'Units' }, { id: 'profit', label: 'Profit' }]} />}>
      {() => (
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid stroke={t.line} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" stroke={t.muted} tick={{ fill: t.muted, fontSize: 11 }} tickFormatter={isMoney ? moneyTick : undefined} allowDecimals={false} />
          <YAxis type="category" dataKey="name" stroke={t.muted} tick={{ fill: t.fg, fontSize: 12 }} width={120} tickLine={false} />
          <Tooltip {...tooltipStyle(t)} formatter={(v: unknown) => (isMoney ? pkr(Number(v)) : `${v} units`)} cursor={{ fill: t.line, fillOpacity: 0.3 }} />
          <Bar dataKey="value" name={metric} radius={[0, 6, 6, 0]} animationDuration={700}>
            {rows.map((r, i) => <Cell key={i} fill={metric === 'profit' && r.value < 0 ? t.danger : t.palette[i % 2]} />)}
          </Bar>
        </BarChart>
      )}
    </Frame>
  )
}

/** 5. Daily & Hourly Trends — line charts of sales and order activity. */
export function TrendsChart({ daily, hourlyRows, weekday }: { daily: SeriesPoint[]; hourlyRows: { label: string; orders: number; sales: number }[]; weekday: { day: string; orders: number; sales: number }[] }) {
  const t = useChartTheme()
  const [mode, setMode] = useState<'daily' | 'hourly' | 'weekday'>('daily')
  const rows = mode === 'daily' ? daily.map((p) => ({ label: p.label, sales: p.netSales, orders: p.orders })) : mode === 'hourly' ? hourlyRows : weekday.map((w) => ({ label: w.day, ...w }))
  const empty = rows.every((r) => !r.orders && !r.sales) && 'No orders in this period yet.'
  return (
    <Frame title="Sales & order trends" subtitle={mode === 'hourly' ? 'When orders happen during the day' : mode === 'weekday' ? 'Busiest days of the week' : 'Day-by-day activity'} empty={empty}
      controls={<Tabs label="Trend view" value={mode} onChange={setMode} tabs={[{ id: 'daily', label: 'Daily' }, { id: 'hourly', label: 'Hourly' }, { id: 'weekday', label: 'Weekday' }]} />}>
      {() => (
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={t.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={t.muted} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} minTickGap={12} />
          <YAxis yAxisId="m" stroke={t.muted} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} width={52} tickFormatter={moneyTick} />
          <YAxis yAxisId="o" orientation="right" stroke={t.muted} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} width={32} allowDecimals={false} />
          <Tooltip {...tooltipStyle(t)} formatter={(v: unknown, n: unknown) => (n === 'Orders' ? String(v) : pkr(Number(v)))} />
          <Legend wrapperStyle={{ fontSize: 12, color: t.fg }} />
          <Line yAxisId="m" type="monotone" dataKey="sales" name="Sales" stroke={t.palette[0]} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} animationDuration={700} />
          <Line yAxisId="o" type="monotone" dataKey="orders" name="Orders" stroke={t.palette[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} animationDuration={700} />
        </LineChart>
      )}
    </Frame>
  )
}
