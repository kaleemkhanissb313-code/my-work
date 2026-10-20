import { createContext, useContext } from 'react'
import { cn } from '@/lib/cn'
import { initials } from '@/features/glamiex/payImage/model'
import type { BusinessFigures } from '@/features/glamiex/partners/engine'
import type { BpPartner, BpTxn, BpTxnType } from '@/features/glamiex/partners/types'

export interface BpCtxValue {
  partners: BpPartner[]
  txns: BpTxn[]
  figures: BusinessFigures
  byId: Map<string, BpPartner>
  projects: string[]
  /** Opens an entry form (see EntryForm). */
  openForm: (kind: FormKind, preset?: { partnerId?: string }) => void
}
export type FormKind = 'investment' | 'transfer' | 'cash' | 'withdrawal' | 'distribution'
export const BpCtx = createContext<BpCtxValue | null>(null)
export function useBp() {
  const v = useContext(BpCtx)
  if (!v) throw new Error('BpCtx missing')
  return v
}

export function Avatar({ p, size = 'md', className }: { p: Pick<BpPartner, 'name' | 'photo'> | undefined; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg' }[size]
  return p?.photo
    ? <img src={p.photo} alt="" className={cn('shrink-0 rounded-full object-cover', s, className)} />
    : <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full bg-accent/15 font-bold text-accent', s, className)}>{initials(p?.name ?? '?')}</span>
}

/** Who an entry involves, as display text. */
export function partiesOf(t: BpTxn, byId: Map<string, BpPartner>) {
  const n = (id: string | null) => (id ? byId.get(id)?.name ?? 'Unknown' : '—')
  if (t.fromId || t.toId) return `${n(t.fromId)} → ${n(t.toId)}`
  if (t.lines.length) return t.lines.map((l) => n(l.partnerId)).join(', ')
  return 'Business'
}

/** Type groups used by the account filters. */
export const TYPE_GROUPS: { id: string; label: string; types: BpTxnType[] }[] = [
  { id: 'all', label: 'All', types: [] },
  { id: 'investments', label: 'Investments', types: ['initial_capital', 'investment'] },
  { id: 'cash', label: 'Revenue & expenses', types: ['revenue', 'expense'] },
  { id: 'transfers', label: 'Transfers', types: ['transfer'] },
  { id: 'profits', label: 'Profits', types: ['profit_alloc', 'profit_dist'] },
  { id: 'losses', label: 'Losses', types: ['loss_alloc'] },
  { id: 'withdrawals', label: 'Withdrawals', types: ['withdrawal'] },
  { id: 'corrections', label: 'Corrections', types: ['correction'] },
]
export const effectiveType = (t: BpTxn): BpTxnType => (t.type === 'correction' && t.reversesType ? t.reversesType : t.type)

export const TYPE_TONE: Partial<Record<BpTxnType, 'ok' | 'danger' | 'warn' | 'accent' | 'muted' | 'work'>> = {
  initial_capital: 'accent', investment: 'accent', revenue: 'ok', expense: 'danger', transfer: 'work',
  profit_alloc: 'ok', profit_dist: 'warn', loss_alloc: 'danger', withdrawal: 'warn', correction: 'muted',
}

export const RECORD_NOTE = 'Recording an entry here does not move real money. It is a record of a payment made outside this app.'
