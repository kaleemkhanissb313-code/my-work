import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import type { GxData } from '@/features/glamiex/engine'
import { zoned } from '@/features/glamiex/time'
import { cn } from '@/lib/cn'

/** Earliest local date with any GLAMIEX activity (used to narrow the "All time" range). */
export function earliestDate(d: GxData, tz: string): string | null {
  const dates: string[] = []
  for (const o of d.orders) if (!o.deletedAt) dates.push(zoned(o.at, tz).date)
  for (const p of d.payments) if (!p.deletedAt) dates.push(zoned(p.at, tz).date)
  for (const e of d.expenses) if (!e.deletedAt && e.date) dates.push(e.date)
  for (const a of d.adIncome) if (!a.deletedAt && a.reportDate) dates.push(a.reportDate)
  for (const a of d.adSpend) if (!a.deletedAt && a.start) dates.push(a.start)
  return dates.length ? dates.sort()[0] : null
}

/** Sticky save/cancel bar: pinned to the bottom on phones (above the app bottom nav), inline on larger screens. */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('glass sticky bottom-20 z-20 -mx-1 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-2xl p-3 lg:bottom-4', className)}
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom) * 0)' }}>
      {children}
    </div>
  )
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return <Link to={to} className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />{label}</Link>
}

export const nowLocal = (tz: string) => { const z = zoned(new Date().toISOString(), tz); return { date: z.date, time: z.time } }

export function Stat({ label, children, tone }: { label: string; children: ReactNode; tone?: 'ok' | 'danger' | 'warn' }) {
  return (
    <div className="rounded-xl bg-raised/60 p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cn('mt-0.5 font-semibold tabular-nums', tone === 'ok' && 'text-ok', tone === 'danger' && 'text-danger', tone === 'warn' && 'text-warn')}>{children}</div>
    </div>
  )
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}
