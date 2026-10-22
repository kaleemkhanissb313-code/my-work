import { useMemo, useState, type ReactNode } from 'react'
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, startOfMonth, startOfWeek, startOfYear } from 'date-fns'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeftRight } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { fmtDate, parseDate } from '@/lib/dates'
import { cn } from '@/lib/cn'

export interface GanttRow {
  id: string
  label: string
  sublabel?: string
  /** yyyy-mm-dd */
  start: string | null
  /** yyyy-mm-dd (inclusive) */
  end: string | null
  color?: string
  milestone?: boolean
  depth?: number
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  onOpen?: () => void
  /** 0–100, drawn as a darker fill inside the bar. */
  progress?: number
  done?: boolean
}

export type GanttZoom = 'day' | 'week' | 'month'
const PX: Record<GanttZoom, number> = { day: 32, week: 10, month: 3 }
const LABEL_W = 'w-36 sm:w-56'
const LABEL_PX_SM = 144

function rangeFor(zoom: GanttZoom, anchor: Date) {
  if (zoom === 'day') { const s = startOfWeek(anchor, { weekStartsOn: 1 }); return { start: s, end: addDays(s, 41) } }
  if (zoom === 'week') { const s = startOfWeek(anchor, { weekStartsOn: 1 }); return { start: s, end: addDays(addWeeks(s, 26), -1) } }
  const s = startOfMonth(anchor); return { start: s, end: addDays(addMonths(s, 12), -1) }
}

function defaultAnchor(zoom: GanttZoom, rows: GanttRow[]) {
  const today = new Date()
  const dates = rows.flatMap((r) => [r.start, r.end]).filter((d): d is string => !!d).sort()
  // Start near today, but if everything is in the future start at the earliest date.
  const earliest = dates[0] ? parseDate(dates[0]) : null
  const back = zoom === 'day' ? addDays(today, -7) : zoom === 'week' ? addWeeks(today, -4) : addMonths(today, -2)
  if (earliest && earliest > back) return earliest
  return back
}

/** Reusable Gantt-style timeline (no dependencies): bars for date ranges, diamonds for milestones, today line, zoom and navigation. */
export function Gantt({ rows, initialZoom = 'week', ariaLabel = 'Timeline' }: { rows: GanttRow[]; initialZoom?: GanttZoom; ariaLabel?: string }) {
  const [zoom, setZoom] = useState<GanttZoom>(initialZoom)
  const [anchor, setAnchor] = useState<Date>(() => defaultAnchor(initialZoom, rows))
  const { start, end } = rangeFor(zoom, anchor)
  const px = PX[zoom]
  const days = differenceInCalendarDays(end, start) + 1
  const width = days * px

  const units = useMemo(() => {
    const out: { x: number; w: number; label: string; weekend?: boolean }[] = []
    let d = start
    while (d <= end) {
      const next = zoom === 'day' ? addDays(d, 1) : zoom === 'week' ? addWeeks(d, 1) : addMonths(d, 1)
      const x = differenceInCalendarDays(d, start) * px
      const w = Math.min(differenceInCalendarDays(next, d), differenceInCalendarDays(end, d) + 1) * px
      out.push({ x, w, label: zoom === 'day' ? format(d, 'd') : zoom === 'week' ? format(d, 'MMM d') : format(d, 'MMM'), weekend: zoom === 'day' && (d.getDay() === 0 || d.getDay() === 6) })
      d = next
    }
    return out
  }, [start, end, zoom, px])

  const groups = useMemo(() => {
    const out: { x: number; w: number; label: string }[] = []
    let d = zoom === 'month' ? startOfYear(start) : startOfMonth(start)
    while (d <= end) {
      const next = zoom === 'month' ? addYears(d, 1) : addMonths(d, 1)
      const s = d < start ? start : d
      const e = addDays(next, -1) > end ? end : addDays(next, -1)
      out.push({ x: differenceInCalendarDays(s, start) * px, w: (differenceInCalendarDays(e, s) + 1) * px, label: zoom === 'month' ? format(d, 'yyyy') : format(d, 'MMMM yyyy') })
      d = next
    }
    return out
  }, [start, end, zoom, px])

  const todayX = differenceInCalendarDays(new Date(), start) * px
  const shift = (dir: number) => setAnchor((a) => (zoom === 'day' ? addWeeks(a, 3 * dir) : zoom === 'week' ? addWeeks(a, 13 * dir) : addMonths(a, 6 * dir)))
  const fit = () => {
    const dates = rows.flatMap((r) => [r.start, r.end]).filter((d): d is string => !!d).sort()
    if (dates[0]) setAnchor(parseDate(dates[0]))
  }

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/70 p-2">
        <div role="group" aria-label="Zoom" className="flex rounded-xl border border-line p-0.5">
          {(['day', 'week', 'month'] as GanttZoom[]).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}
              className={cn('rounded-lg px-2.5 py-1 text-xs capitalize', zoom === z ? 'bg-raised font-semibold text-fg shadow' : 'text-muted hover:text-fg')}>{z}</button>
          ))}
        </div>
        <IconButton icon={ChevronLeft} label="Earlier" onClick={() => shift(-1)} />
        <Button size="sm" onClick={() => setAnchor(defaultAnchor(zoom, []))}>Today</Button>
        <IconButton icon={ChevronRight} label="Later" onClick={() => shift(1)} />
        <IconButton icon={ChevronsLeftRight} label="Jump to earliest item" onClick={fit} disabled={!rows.some((r) => r.start || r.end)} />
        <span className="ms-auto text-xs text-muted">{format(start, 'MMM d, yyyy')} – {format(end, 'MMM d, yyyy')}</span>
      </div>
      <div className="overflow-x-auto" role="region" aria-label={ariaLabel} tabIndex={0}>
        <div className="relative" style={{ minWidth: `calc(${LABEL_PX_SM}px + ${width}px)` }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface text-[11px] text-muted">
            <div className={cn('sticky start-0 z-30 shrink-0 border-e border-line bg-surface p-2 font-medium', LABEL_W)}>Item</div>
            <div className="relative shrink-0" style={{ width }}>
              <div className="relative h-5 border-b border-line/50">
                {groups.map((g) => <div key={g.x} className="absolute top-0 truncate border-s border-line/60 px-1 font-medium text-fg" style={{ left: g.x, width: g.w }}>{g.label}</div>)}
              </div>
              <div className="relative h-5">
                {units.map((u) => <div key={u.x} className={cn('absolute top-0 truncate border-s border-line/40 px-0.5 text-center', u.weekend && 'bg-raised/60')} style={{ left: u.x, width: u.w }}>{u.label}</div>)}
              </div>
            </div>
          </div>
          {/* Rows */}
          <ul>
            {rows.map((r) => <GanttRowView key={r.id} r={r} start={start} px={px} width={width} units={units} />)}
          </ul>
          {todayX >= 0 && todayX <= width && (
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 hidden w-0 sm:block" style={{ left: `calc(14rem + ${todayX + px / 2}px)` }}>
              <div className="h-full border-s-2 border-danger/70" />
            </div>
          )}
          {todayX >= 0 && todayX <= width && (
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-0 sm:hidden" style={{ left: `calc(9rem + ${todayX + px / 2}px)` }}>
              <div className="h-full border-s-2 border-danger/70" />
            </div>
          )}
        </div>
      </div>
      <p className="flex flex-wrap gap-3 border-t border-line/70 p-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-5 rounded bg-accent" aria-hidden />Date range</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-accent" aria-hidden />Milestone</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-danger" aria-hidden />Today</span>
      </p>
    </div>
  )
}

function GanttRowView({ r, start, px, width, units }: { r: GanttRow; start: Date; px: number; width: number; units: { x: number; w: number; weekend?: boolean }[] }) {
  const s = r.start ?? r.end
  let e = r.end ?? r.start
  if (s && e && e < s) e = s
  const color = r.color ?? 'rgb(var(--accent))'
  let bar: ReactNode = null
  if (s && e) {
    const x0 = differenceInCalendarDays(parseDate(r.milestone ? e : s), start) * px
    const x1 = (differenceInCalendarDays(parseDate(e), start) + 1) * px
    const title = r.milestone ? `${r.label}: milestone ${fmtDate(e)}` : `${r.label}: ${fmtDate(s)} – ${fmtDate(e)}`
    if (x1 <= 0) bar = <span className="absolute start-1 top-1/2 -translate-y-1/2 text-[10px] text-muted">◀ {fmtDate(e, 'MMM d')}</span>
    else if (x0 >= width) bar = <span className="absolute end-1 top-1/2 -translate-y-1/2 text-[10px] text-muted">{fmtDate(s, 'MMM d')} ▶</span>
    else if (r.milestone) {
      const cx = x0 + px / 2
      bar = (
        <button type="button" onClick={r.onOpen} aria-label={title} title={title} className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] shadow ring-2 ring-surface"
          style={{ left: cx, background: color }} />
      )
    } else {
      const left = Math.max(0, x0), right = Math.min(width, x1)
      bar = (
        <button type="button" onClick={r.onOpen} aria-label={title} title={title}
          className={cn('absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-md text-start text-[10px] font-medium text-white shadow', r.done && 'opacity-60')}
          style={{ left, width: Math.max(4, right - left), background: color }}>
          {r.progress != null && r.progress > 0 && <span className="absolute inset-y-0 start-0 bg-black/25" style={{ width: `${Math.min(100, r.progress)}%` }} aria-hidden />}
          {right - left > 50 && <span className="relative truncate px-1.5 leading-5">{r.label}</span>}
        </button>
      )
    }
  }
  return (
    <li className="flex border-b border-line/40 last:border-0 hover:bg-raised/30">
      <div className={cn('sticky start-0 z-10 flex shrink-0 items-center gap-1 border-e border-line bg-surface px-2 py-1.5 text-xs', LABEL_W)} style={{ paddingLeft: 8 + (r.depth ?? 0) * 14 }}>
        {r.expandable ? (
          <button type="button" onClick={r.onToggle} aria-expanded={!!r.expanded} aria-label={`${r.expanded ? 'Collapse' : 'Expand'} ${r.label}`} className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted hover:text-fg">
            {r.expanded ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          </button>
        ) : <span className="w-1" />}
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <button type="button" onClick={r.onOpen} disabled={!r.onOpen} className={cn('min-w-0 flex-1 truncate text-start', r.depth ? 'text-muted' : 'font-medium', r.done && 'line-through', r.onOpen && 'hover:text-accent')} title={r.label}>
          {r.label}
        </button>
      </div>
      <div className="relative h-9 shrink-0" style={{ width }}>
        {units.map((u) => <div key={u.x} className={cn('absolute inset-y-0 border-s border-line/30', u.weekend && 'bg-raised/40')} style={{ left: u.x, width: u.w }} aria-hidden />)}
        {bar ?? <span className="absolute start-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">No dates set</span>}
      </div>
    </li>
  )
}


