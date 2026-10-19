import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ChartType } from '@/types/models'
import { tooltipStyle, useChartTheme } from './theme'

export type ChartRow = Record<string, string | number | null>

export interface DataChartProps {
  type: ChartType
  data: ChartRow[]
  xKey: string
  yKeys: string[]
  showLegend?: boolean
  showLabels?: boolean
  height?: number
  /** Format numbers in tooltips/labels (e.g. hours or currency). */
  valueFormatter?: (v: number) => string
  /** Accessible description of what the chart shows. */
  ariaLabel: string
}

/** Shared Recharts renderer for user datasets and app-data reports. Colours follow the app theme. */
export function DataChart({ type, data, xKey, yKeys, showLegend = true, showLabels = false, height = 300, valueFormatter, ariaLabel }: DataChartProps) {
  const t = useChartTheme()
  const tt = tooltipStyle(t)
  const fmt = (v: unknown) => (typeof v === 'number' && valueFormatter ? valueFormatter(v) : String(v ?? ''))
  const axis = { stroke: t.muted, tick: { fill: t.muted, fontSize: 12 }, tickLine: false }
  const color = (i: number) => t.palette[i % t.palette.length]

  let chart: React.ReactElement
  if (type === 'pie' || type === 'donut') {
    const key = yKeys[0]
    const slices = data
      .map((r) => ({ name: String(r[xKey] ?? ''), value: typeof r[key] === 'number' ? (r[key] as number) : Number(r[key]) }))
      .filter((s) => Number.isFinite(s.value) && s.value > 0)
    chart = (
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius={type === 'donut' ? '55%' : 0} outerRadius="80%" paddingAngle={type === 'donut' ? 2 : 0}
          stroke={t.surface} isAnimationActive={false}
          label={showLabels ? ({ name, value }: { name: string; value: number }) => `${name}: ${fmt(value)}` : false}
          labelLine={showLabels}>
          {slices.map((s, i) => <Cell key={s.name + i} fill={color(i)} />)}
        </Pie>
        <Tooltip {...tt} formatter={(v) => fmt(v)} />
        {showLegend && <Legend wrapperStyle={{ color: t.fg, fontSize: 12 }} />}
      </PieChart>
    )
  } else {
    const common = { data, margin: { top: 16, right: 16, bottom: 8, left: 0 } }
    const grid = <CartesianGrid stroke={t.line} strokeDasharray="3 3" vertical={false} />
    const x = <XAxis dataKey={xKey} {...axis} />
    const y = <YAxis {...axis} width={56} tickFormatter={(v: number) => (valueFormatter ? valueFormatter(v) : String(v))} />
    const tip = <Tooltip {...tt} formatter={(v) => fmt(v)} cursor={{ fill: t.line, fillOpacity: 0.3 }} />
    const legend = showLegend ? <Legend wrapperStyle={{ color: t.fg, fontSize: 12 }} /> : null
    const labels = (k: string) => (showLabels ? <LabelList dataKey={k} position="top" fill={t.fg} fontSize={11} formatter={(v: unknown) => fmt(v)} /> : null)
    if (type === 'line') {
      chart = (
        <LineChart {...common}>{grid}{x}{y}{tip}{legend}
          {yKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={color(i)} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls>{labels(k)}</Line>)}
        </LineChart>
      )
    } else if (type === 'area') {
      chart = (
        <AreaChart {...common}>{grid}{x}{y}{tip}{legend}
          {yKeys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={color(i)} fill={color(i)} fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} connectNulls>{labels(k)}</Area>)}
        </AreaChart>
      )
    } else {
      chart = (
        <BarChart {...common}>{grid}{x}{y}{tip}{legend}
          {yKeys.map((k, i) => <Bar key={k} dataKey={k} fill={color(i)} radius={[6, 6, 0, 0]} isAnimationActive={false}>{labels(k)}</Bar>)}
        </BarChart>
      )
    }
  }

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
    </div>
  )
}
