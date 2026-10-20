import { parseRupees } from '../money'
import type { Paisa } from '../types'

/* Payment Image Creator: data model, validation and totals (no DOM). */

export const MAX_PEOPLE = 5
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type PayStatus = 'paid' | 'pending'
export type PayTemplate = 'classic' | 'minimal' | 'bold'
export type PayLayout = 'list' | 'grid'

export interface PayPerson {
  key: string
  name: string
  /** Raw text typed by the user, e.g. "1,250.50"; parsed with parseRupees. */
  amount: string
  /** Square-cropped JPEG data URL, or null for an initials avatar. */
  photo: string | null
  date: string
  note: string
  /** Optional transaction reference shown on the image (older saved designs may lack it). */
  reference?: string
  status: PayStatus
}

export interface PayDesign {
  title: string
  template: PayTemplate
  layout: PayLayout
  bg: string
  fg: string
  accent: string
  people: PayPerson[]
}

/** Stored design (local IndexedDB only; never synced or exported). */
export interface GxPayImage { id: string; name: string; design: PayDesign; createdAt: number; updatedAt: number }

export const TEMPLATES: { id: PayTemplate; label: string; bg: string; fg: string; accent: string }[] = [
  { id: 'classic', label: 'Classic', bg: '#ffffff', fg: '#111427', accent: '#0f766e' },
  { id: 'minimal', label: 'Minimal', bg: '#f6f5f2', fg: '#1c1917', accent: '#1c1917' },
  { id: 'bold', label: 'Bold', bg: '#111317', fg: '#f4f5fa', accent: '#4aa3a6' },
]

const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

export function newPerson(date: string): PayPerson {
  return { key: uid(), name: '', amount: '', photo: null, date, note: '', reference: '', status: 'paid' }
}

export function newDesign(date: string): PayDesign {
  const t = TEMPLATES[0]
  return { title: 'Payment Summary', template: t.id, layout: 'list', bg: t.bg, fg: t.fg, accent: t.accent, people: [newPerson(date)] }
}

export interface PersonErrors { name?: string; amount?: string; date?: string }

export function validatePerson(p: PayPerson): PersonErrors {
  const e: PersonErrors = {}
  if (!p.name.trim()) e.name = 'Enter a name'
  else if (p.name.trim().length > 60) e.name = 'Keep the name under 60 characters'
  const v = parseRupees(p.amount)
  if (!p.amount.trim()) e.amount = 'Enter an amount'
  else if (v == null || v <= 0) e.amount = 'Enter a positive amount, e.g. 1500 or 1,250.50'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) e.date = 'Choose a date'
  return e
}

export function validateDesign(d: PayDesign) {
  const people = d.people.map(validatePerson)
  const ok = d.people.length > 0 && d.people.length <= MAX_PEOPLE && people.every((e) => !Object.keys(e).length)
  return { ok, people }
}

/** Amount in paisa, or 0 when the text is not a valid positive amount. */
export const amountOf = (p: PayPerson): Paisa => { const v = parseRupees(p.amount); return v != null && v > 0 ? v : 0 }

export function totals(people: PayPerson[]) {
  let paid = 0, pending = 0
  for (const p of people) { const a = amountOf(p); if (p.status === 'paid') paid += a; else pending += a }
  return { total: paid + pending, paid, pending }
}

/** Returns an error message for unsupported or oversized image files, else null. */
export function imageFileError(file: { type: string; size: number }) {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Use a PNG, JPG or WebP image'
  if (file.size > MAX_IMAGE_BYTES) return 'Image must be 10 MB or smaller'
  return null
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

const PREFILL_KEY = 'gx-payimage-prefill'
/** Hands a design to the Payment Image Creator (used by the partner ledger). Session-only, never persisted. */
export function setPrefill(d: PayDesign) { try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify(d)) } catch { /* ignore */ } }
export function takePrefill(): PayDesign | null {
  try { const v = sessionStorage.getItem(PREFILL_KEY); sessionStorage.removeItem(PREFILL_KEY); return v ? (JSON.parse(v) as PayDesign) : null } catch { return null }
}
