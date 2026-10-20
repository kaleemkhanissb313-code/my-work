import type { Paisa } from '../types'
import { FULL_SHARE, type BpLine, type BpPartner, type BpTxn, type BpTxnDraft, type BpTxnType } from './types'

/*
 * Pure accounting for the partner ledger.
 *
 * Cash (business bank/cash):  + capital, investments, revenue      − expenses, withdrawals, profit paid out
 * Not cash:                   partner-to-partner transfers (money moves between partners, outside the business),
 *                             profit/loss allocations (they only assign results to partners).
 * Partner equity:             capital − withdrawals + profit allocated − loss allocated − profit paid
 * Reconciliation:             cash = Σ partner equity + net profit not yet allocated
 * A reversal ("correction") cancels exactly the effect of the entry it reverses.
 */

export interface PartnerFigures {
  partnerId: string
  contributed: Paisa
  withdrawn: Paisa
  capital: Paisa
  profitAllocated: Paisa
  profitPaid: Paisa
  lossAllocated: Paisa
  /** Allocated profit the business still owes the partner. */
  profitPayable: Paisa
  /** Partner-to-partner money. */
  received: Paisa
  paid: Paisa
  /** paid − received. Positive: other partners owe this partner; negative: this partner owes others. */
  settlement: Paisa
  /** Current balance (equity) in the business. */
  balance: Paisa
}

export interface BusinessFigures {
  cash: Paisa
  contributed: Paisa
  withdrawn: Paisa
  capital: Paisa
  revenue: Paisa
  expenses: Paisa
  net: Paisa
  profitAllocated: Paisa
  lossAllocated: Paisa
  unallocated: Paisa
  distributed: Paisa
  /** Total partner-to-partner balances still outstanding. */
  outstandingSettlements: Paisa
  partners: PartnerFigures[]
  reconciles: boolean
  /** Entries whose split lines do not add up to the total (should never happen). */
  inconsistent: string[]
}

const sumLines = (lines: BpLine[]) => lines.reduce((a, l) => a + l.amount, 0)

/** Effective type and sign of an entry (reversals count as the negated original). */
export function effectOf(t: Pick<BpTxn, 'type' | 'reversesType'>): { type: BpTxnType; sign: 1 | -1 } {
  return t.type === 'correction' && t.reversesType ? { type: t.reversesType, sign: -1 } : { type: t.type, sign: 1 }
}

export function computeFigures(partners: Pick<BpPartner, 'id'>[], txns: BpTxn[]): BusinessFigures {
  const blank = (partnerId: string): PartnerFigures => ({
    partnerId, contributed: 0, withdrawn: 0, capital: 0, profitAllocated: 0, profitPaid: 0, lossAllocated: 0, profitPayable: 0, received: 0, paid: 0, settlement: 0, balance: 0,
  })
  const byId = new Map(partners.map((p) => [p.id, blank(p.id)]))
  const get = (id: string) => { let f = byId.get(id); if (!f) { f = blank(id); byId.set(id, f) } return f }
  let cash = 0, revenue = 0, expenses = 0
  const inconsistent: string[] = []

  for (const t of txns) {
    if (t.deletedAt) continue
    const { type, sign } = effectOf(t)
    const a = sign * t.amount
    const splits = ['initial_capital', 'investment', 'withdrawal', 'profit_alloc', 'loss_alloc', 'profit_dist'].includes(type)
    if (splits && sumLines(t.lines) !== t.amount) inconsistent.push(t.txnNo)
    const each = (k: keyof PartnerFigures) => { for (const l of t.lines) (get(l.partnerId)[k] as number) += sign * l.amount }
    switch (type) {
      case 'initial_capital': case 'investment': cash += a; each('contributed'); break
      case 'withdrawal': cash -= a; each('withdrawn'); break
      case 'revenue': cash += a; revenue += a; break
      case 'expense': cash -= a; expenses += a; break
      case 'profit_alloc': each('profitAllocated'); break
      case 'loss_alloc': each('lossAllocated'); break
      case 'profit_dist': cash -= a; each('profitPaid'); break
      case 'transfer':
        if (t.fromId) get(t.fromId).paid += a
        if (t.toId) get(t.toId).received += a
        break
      case 'correction': break
    }
  }

  const list = [...byId.values()].map((f) => {
    f.capital = f.contributed - f.withdrawn
    f.profitPayable = f.profitAllocated - f.profitPaid
    f.settlement = f.paid - f.received
    f.balance = f.capital + f.profitAllocated - f.lossAllocated - f.profitPaid
    return f
  })
  const tot = (k: keyof PartnerFigures) => list.reduce((s, f) => s + (f[k] as number), 0)
  const net = revenue - expenses
  const profitAllocated = tot('profitAllocated'), lossAllocated = tot('lossAllocated')
  const unallocated = net - (profitAllocated - lossAllocated)
  return {
    cash, revenue, expenses, net, profitAllocated, lossAllocated, unallocated,
    contributed: tot('contributed'), withdrawn: tot('withdrawn'), capital: tot('capital'), distributed: tot('profitPaid'),
    outstandingSettlements: list.reduce((s, f) => s + Math.max(0, f.settlement), 0),
    partners: partners.map((p) => byId.get(p.id)!),
    reconciles: inconsistent.length === 0 && cash === tot('balance') + unallocated,
    inconsistent,
  }
}

/** Revenue, expenses and net for a date range (inclusive) and optional project. */
export function periodResult(txns: BpTxn[], start: string, end: string, project: string | null) {
  let revenue = 0, expenses = 0
  for (const t of txns) {
    if (t.deletedAt || t.date < start || t.date > end) continue
    if (project != null && t.project !== project) continue
    const { type, sign } = effectOf(t)
    if (type === 'revenue') revenue += sign * t.amount
    else if (type === 'expense') expenses += sign * t.amount
  }
  return { revenue, expenses, net: revenue - expenses }
}

/** Existing, not-reversed allocations whose period overlaps the range for the same project. */
export function overlappingAllocations(txns: BpTxn[], start: string, end: string, project: string | null) {
  return txns.filter((t) => (t.type === 'profit_alloc' || t.type === 'loss_alloc') && !t.reversedBy && !t.deletedAt && t.period
    && t.period.start <= end && t.period.end >= start && (project == null || t.project === project))
}

export const shareTotal = (bps: number[]) => bps.reduce((a, b) => a + b, 0)

/** Splits an amount by basis-point shares exactly (largest remainder), so the parts always add up. */
export function splitByShares(amount: Paisa, shares: { partnerId: string; bp: number }[]): BpLine[] {
  if (shareTotal(shares.map((s) => s.bp)) !== FULL_SHARE) throw new Error('Shares must total 100%')
  const raw = shares.map((s) => ({ partnerId: s.partnerId, exact: (amount * s.bp) / FULL_SHARE }))
  const lines = raw.map((r) => ({ partnerId: r.partnerId, amount: Math.floor(r.exact) }))
  let left = amount - lines.reduce((a, l) => a + l.amount, 0)
  const order = raw.map((r, i) => ({ i, frac: r.exact - Math.floor(r.exact) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) lines[order[k].i].amount += 1
  return lines.filter((l) => l.amount !== 0)
}

/** Parses "20", "33.33" → basis points, or null when invalid (0–100, max 2 decimals). */
export function parsePercent(text: string): number | null {
  const s = text.trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null
  const [w, f = ''] = s.split('.')
  const bp = Number(w) * 100 + Number((f + '00').slice(0, 2))
  return bp <= FULL_SHARE ? bp : null
}
export const pct = (bp: number) => `${(bp / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}%`

/** Validation of a new ledger entry. Returns field → message. */
export function validateDraft(d: BpTxnDraft, partnerIds: string[]): Record<string, string> {
  const e: Record<string, string> = {}
  if (!Number.isSafeInteger(d.amount) || d.amount <= 0) e.amount = 'Enter an amount greater than zero'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) e.date = 'Choose a date'
  if (!/^\d{2}:\d{2}$/.test(d.time)) e.time = 'Choose a time'
  const known = new Set(partnerIds)
  if (d.lines.some((l) => !known.has(l.partnerId) || !Number.isSafeInteger(l.amount) || l.amount < 0)) e.lines = 'Invalid partner amounts'
  switch (d.type) {
    case 'initial_capital': case 'investment': case 'withdrawal': case 'profit_alloc': case 'loss_alloc': case 'profit_dist': {
      if (!d.lines.some((l) => l.amount > 0)) e.lines = 'Enter an amount for at least one partner'
      else if (!e.amount && sumLines(d.lines) !== d.amount) e.lines = `Partner amounts add up to ${(sumLines(d.lines) / 100).toLocaleString('en-PK')} — they must equal the total`
      break
    }
    case 'transfer':
      if (!d.fromId || !known.has(d.fromId)) e.fromId = 'Choose the paying partner'
      if (!d.toId || !known.has(d.toId)) e.toId = 'Choose the receiving partner'
      if (d.fromId && d.fromId === d.toId) e.toId = 'Paying and receiving partner must be different'
      if (!d.method) e.method = 'Choose a payment method'
      break
    case 'revenue': case 'expense':
      if (!d.description.trim()) e.description = 'Describe the revenue or expense'
      break
    case 'correction':
      if (!d.reverses) e.reverses = 'Missing the entry to reverse'
      if (d.reason.trim().length < 3) e.reason = 'Give a reason for the correction'
      break
  }
  return e
}

/** A recent, not-reversed entry with the same type, date, amount, parties and split — likely a double entry. */
export function findDuplicate(txns: BpTxn[], d: BpTxnDraft): BpTxn | undefined {
  const key = (l: BpLine[]) => l.filter((x) => x.amount).map((x) => `${x.partnerId}:${x.amount}`).sort().join('|')
  return txns.find((t) => !t.reversedBy && !t.deletedAt && t.type === d.type && t.date === d.date && t.amount === d.amount
    && t.fromId === d.fromId && t.toId === d.toId && key(t.lines) === key(d.lines) && t.project === d.project)
}

/** The reversal entry for `t` (same amounts and parties, flagged as a correction). */
export function reversalOf(t: BpTxn, reason: string, date: string, time: string): BpTxnDraft {
  return {
    type: 'correction', reversesType: t.type, reverses: t.id, reason: reason.trim(), date, time,
    amount: t.amount, lines: t.lines, fromId: t.fromId, toId: t.toId, method: t.method, reference: t.txnNo,
    description: `Reversal of ${t.txnNo}`, project: t.project, proofIds: [], period: t.period, allocMode: t.allocMode, basis: t.basis,
  }
}

/** Entries that involve a partner, with that partner's signed effect on their balance or settlement. */
export function partnerEntries(txns: BpTxn[], partnerId: string) {
  return txns.filter((t) => !t.deletedAt && (t.fromId === partnerId || t.toId === partnerId || t.lines.some((l) => l.partnerId === partnerId && l.amount)))
}
