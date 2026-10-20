import type { BaseEntity } from '@/types/models'
import type { Paisa, PaymentMethod } from '../types'

/* Business Partner investment & money management. Money is integer paisa; shares are basis points (10000 = 100%). */

export const PARTNER_SEED = [
  { id: 'bp-noman', name: 'Noman' },
  { id: 'bp-kaleem', name: 'Kaleem' },
  { id: 'bp-awais', name: 'Awais' },
  { id: 'bp-salman', name: 'Salman' },
  { id: 'bp-hasnain', name: 'Hasnain' },
] as const
export const FULL_SHARE = 10_000

export interface BpPartner extends BaseEntity {
  name: string
  phone: string
  notes: string
  /** Square-cropped JPEG data URL, or null for initials. */
  photo: string | null
  order: number
  /** Business ownership, profit-sharing and loss-sharing are separate agreements (basis points). */
  ownershipBp: number
  profitBp: number
  lossBp: number
}

export type BpTxnType =
  | 'initial_capital' | 'investment' | 'revenue' | 'expense' | 'transfer'
  | 'profit_alloc' | 'profit_dist' | 'loss_alloc' | 'withdrawal' | 'correction'

export const TXN_TYPES: { id: BpTxnType; label: string; short: string }[] = [
  { id: 'initial_capital', label: 'Initial capital', short: 'Capital' },
  { id: 'investment', label: 'Additional investment', short: 'Investment' },
  { id: 'revenue', label: 'Business revenue', short: 'Revenue' },
  { id: 'expense', label: 'Business expense', short: 'Expense' },
  { id: 'transfer', label: 'Partner-to-partner transfer', short: 'Transfer' },
  { id: 'profit_alloc', label: 'Profit allocation', short: 'Profit allocated' },
  { id: 'profit_dist', label: 'Profit distribution', short: 'Profit paid' },
  { id: 'loss_alloc', label: 'Loss allocation', short: 'Loss allocated' },
  { id: 'withdrawal', label: 'Capital withdrawal', short: 'Withdrawal' },
  { id: 'correction', label: 'Refund or correction (reversal)', short: 'Reversal' },
]
export const txnLabel = (t: BpTxnType) => TXN_TYPES.find((x) => x.id === t)?.label ?? t

export interface BpLine { partnerId: string; amount: Paisa }

export interface BpTxn extends BaseEntity {
  txnNo: string
  type: BpTxnType
  /** Local wall-clock date/time in the GLAMIEX time zone. */
  date: string
  time: string
  /** Total amount, always positive. For split types it equals the sum of `lines`. */
  amount: Paisa
  lines: BpLine[]
  fromId: string | null
  toId: string | null
  method: PaymentMethod | null
  reference: string
  description: string
  /** Business or project name; '' = general business. */
  project: string
  proofIds: string[]
  /** Profit / loss allocations: the period and figures they were based on. */
  period: { start: string; end: string } | null
  allocMode: 'percent' | 'manual' | null
  basis: { revenue: Paisa; expenses: Paisa; net: Paisa } | null
  /** Reversal entries: the reversed transaction's id and type, plus the reason. */
  reverses: string | null
  reversesType: BpTxnType | null
  reason: string
  /** Set on the original when a reversal is posted. */
  reversedBy: string | null
}

export type BpTxnDraft = Omit<BpTxn, keyof BaseEntity | 'txnNo' | 'reversedBy'>
