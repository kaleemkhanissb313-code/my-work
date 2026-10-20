import type { BaseEntity } from '@/types/models'
import { parseRupees } from '../money'

/* Payment Image Creator: one payment record (and image) per partner payment. Money is integer minor units. */

/** Workspace order for the Payment Image Creator. Profiles are shared with Business Partners (no duplicates). */
export const PR_PARTNER_ORDER = ['bp-kaleem', 'bp-awais', 'bp-salman', 'bp-hasnain', 'bp-noman'] as const

export const CURRENCIES = [
  { id: 'PKR', symbol: 'Rs', label: 'Pakistani Rupee (Rs)' },
  { id: 'USD', symbol: '$', label: 'US Dollar ($)' },
  { id: 'AED', symbol: 'AED', label: 'UAE Dirham (AED)' },
  { id: 'SAR', symbol: 'SAR', label: 'Saudi Riyal (SAR)' },
  { id: 'GBP', symbol: '£', label: 'British Pound (£)' },
  { id: 'EUR', symbol: '€', label: 'Euro (€)' },
] as const
export type Currency = (typeof CURRENCIES)[number]['id']

export const PR_METHODS = [
  { id: 'cash', label: 'Cash' }, { id: 'bank', label: 'Bank Transfer' }, { id: 'easypaisa', label: 'Easypaisa' },
  { id: 'jazzcash', label: 'JazzCash' }, { id: 'other', label: 'Other' },
] as const
export type PrMethod = (typeof PR_METHODS)[number]['id']

export const PR_STATUSES = [
  { id: 'pending', label: 'Pending', color: '#d97706' },
  { id: 'paid', label: 'Paid', color: '#059669' },
  { id: 'cancelled', label: 'Cancelled', color: '#dc2626' },
] as const
export type PrStatus = (typeof PR_STATUSES)[number]['id']

export const PR_TEMPLATES = [
  { id: 'minimal', label: 'Minimal professional', bg: '#f4f5f7', fg: '#14161c', accent: '#0f766e' },
  { id: 'dark', label: 'Premium dark', bg: '#0e1014', fg: '#f3f1ea', accent: '#d4af37' },
  { id: 'white', label: 'Clean white', bg: '#ffffff', fg: '#111427', accent: '#2563eb' },
  { id: 'gradient', label: 'Modern gradient', bg: '#4f46e5', fg: '#ffffff', accent: '#ec4899' },
] as const
export type PrTemplate = (typeof PR_TEMPLATES)[number]['id']
export const PR_FONTS = [
  { id: 'modern', label: 'Modern sans' }, { id: 'elegant', label: 'Elegant serif' }, { id: 'rounded', label: 'Friendly' },
] as const
export type PrFont = (typeof PR_FONTS)[number]['id']
export type PrLayout = 'portrait' | 'compact'

export interface PrDesign { template: PrTemplate; bg: string; fg: string; accent: string; font: PrFont; layout: PrLayout }

export interface PayRecord extends BaseEntity {
  partnerId: string
  /** Partner name as shown on this record (defaults to the profile name; editable per record). */
  partnerName: string
  title: string
  amount: number
  currency: Currency
  /** Saved wall-clock date and time; never changed by opening the record later. */
  date: string
  time: string
  method: PrMethod | null
  sender: string
  receiver: string
  purpose: string
  reference: string
  status: PrStatus
  /** True only when the user confirmed the payment was actually made (required for Paid). */
  paidConfirmed: boolean
  location: string
  notes: string
  /** Cropped JPEG data URLs stored with the record. */
  photo: string | null
  proof: string | null
  design: PrDesign
}

export type PrDraft = Omit<PayRecord, keyof BaseEntity> & { id: string | null }

export function defaultDesign(t: PrTemplate = 'minimal'): PrDesign {
  const x = PR_TEMPLATES.find((p) => p.id === t)!
  return { template: x.id, bg: x.bg, fg: x.fg, accent: x.accent, font: 'modern', layout: 'portrait' }
}

export function blankRecord(partner: { id: string; name: string; photo: string | null }, date: string, time: string): PrDraft {
  return {
    id: null, partnerId: partner.id, partnerName: partner.name, title: 'Payment Record', amount: 0, currency: 'PKR', date, time,
    method: null, sender: '', receiver: partner.name, purpose: '', reference: '', status: 'pending', paidConfirmed: false,
    location: '', notes: '', photo: partner.photo, proof: null, design: defaultDesign(),
  }
}

/* ---------- Dates ---------- */
const parts = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null }
const utc = (iso: string) => { const p = parts(iso); if (!p) return null; const dt = new Date(Date.UTC(p.y, p.m - 1, p.d)); return dt.getUTCDate() === p.d && dt.getUTCMonth() === p.m - 1 ? dt : null }
/** "Wednesday" for "2026-10-21"; '' for invalid dates. Computed from the date itself, independent of time zone. */
export const weekday = (iso: string) => { const d = utc(iso); return d ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(d) : '' }
/** "21 October 2026". */
export const longDate = (iso: string) => { const d = utc(iso); return d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : '' }
/** "15:05" → "3:05 PM". */
export function time12(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return ''
  const h = +m[1]
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/* ---------- Money ---------- */
export const currencyOf = (c: Currency) => CURRENCIES.find((x) => x.id === c) ?? CURRENCIES[0]
export function formatAmount(minor: number, c: Currency) {
  const frac = Math.abs(minor) % 100 !== 0
  const body = new Intl.NumberFormat('en-PK', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 }).format(Math.abs(minor) / 100)
  return `${minor < 0 ? '-' : ''}${currencyOf(c).symbol} ${body}`
}
/** Parses "1,250.50" → 125050 minor units, or null. */
export const parseAmount = (text: string) => { const v = parseRupees(text); return v != null && v > 0 ? v : null }

/* ---------- Validation ---------- */
export function validateRecord(r: PrDraft): Record<string, string> {
  const e: Record<string, string> = {}
  if (!r.partnerId) e.partnerId = 'Choose a partner'
  if (!r.partnerName.trim()) e.partnerName = 'Enter the partner name'
  if (!r.title.trim()) e.title = 'Enter a payment title'
  if (!Number.isSafeInteger(r.amount) || r.amount <= 0) e.amount = 'Enter an amount greater than zero'
  if (!weekday(r.date)) e.date = 'Choose a valid date'
  if (!/^\d{2}:\d{2}$/.test(r.time)) e.time = 'Choose a time'
  if (r.status === 'paid' && !r.paidConfirmed) e.paidConfirmed = 'Confirm the payment was actually made, or keep it Pending'
  if (r.reference.length > 60) e.reference = 'Keep the reference under 60 characters'
  return e
}

/** Copy for "Duplicate": new record, reference cleared (references must never be invented or reused), status back to Pending. */
export function duplicateOf(r: PayRecord | PrDraft): PrDraft {
  const { id: _id, ...rest } = r as PayRecord
  const base = Object.fromEntries(Object.entries(rest).filter(([k]) => !['createdAt', 'updatedAt', 'deletedAt', 'archived', 'favorite', 'pinned', 'tags', 'version', 'syncedAt', 'color', 'folderId'].includes(k)))
  return { ...(base as Omit<PrDraft, 'id'>), id: null, title: `${r.title} (copy)`.slice(0, 80), reference: '', status: 'pending', paidConfirmed: false }
}

export interface PrFilter { q: string; from: string; to: string; min: number | null; max: number | null; status: PrStatus | '' }
export function filterRecords(rows: PayRecord[], f: PrFilter) {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) => !r.deletedAt
    && (!f.status || r.status === f.status)
    && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to)
    && (f.min == null || r.amount >= f.min) && (f.max == null || r.amount <= f.max)
    && (!q || [r.title, r.partnerName, r.sender, r.receiver, r.purpose, r.reference, r.location, r.notes].join(' ').toLowerCase().includes(q)))
}
