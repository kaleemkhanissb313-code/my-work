import { useMemo, useState } from 'react'
import { FileBarChart, ImageDown } from 'lucide-react'
import { Link } from 'react-router'
import { Field, Input } from '@/components/ui'
import { ExportButtons, rs } from '@/features/glamiex/ui'
import type { Cell, Sheet } from '@/lib/xlsx'
import { computeFigures, effectOf, pct } from '@/features/glamiex/partners/engine'
import { txnLabel, type BpPartner, type BpTxn } from '@/features/glamiex/partners/types'
import { PAYMENT_METHODS } from '@/features/glamiex/types'
import { partiesOf, useBp } from './shared'

const HEAD = ['Date', 'Time', 'Entry no.', 'Type', 'Partners', 'Amount (Rs)', 'Project', 'Method', 'Reference', 'Description', 'Status']
const status = (t: BpTxn) => (t.reversedBy ? 'Reversed' : t.type === 'correction' ? `Reverses ${t.reference}` : 'Active')
const method = (t: BpTxn) => (t.method ? PAYMENT_METHODS.find((m) => m.id === t.method)?.label ?? t.method : '')
const row = (t: BpTxn, byId: Map<string, BpPartner>): Cell[] => [t.date, t.time, t.txnNo, txnLabel(t.type), partiesOf(t, byId), rs(t.amount), t.project || 'General', method(t), t.reference, t.description, status(t)]

export function ledgerSheet(txns: BpTxn[], byId: Map<string, BpPartner>, name = 'Ledger'): Sheet {
  return { name, rows: [HEAD, ...txns.map((t) => row(t, byId))] }
}

export function statementSheet(p: BpPartner, txns: BpTxn[], byId: Map<string, BpPartner>): Sheet {
  const mine = (t: BpTxn) => {
    const { sign } = effectOf(t)
    if (t.fromId === p.id) return -sign * t.amount
    if (t.toId === p.id) return sign * t.amount
    return sign * (t.lines.find((l) => l.partnerId === p.id)?.amount ?? 0)
  }
  return { name: p.name.slice(0, 31), rows: [[...HEAD, `${p.name} amount (Rs)`], ...txns.map((t) => [...row(t, byId), rs(mine(t))])] }
}

function partnerSummarySheet(partners: BpPartner[], txns: BpTxn[]): Sheet {
  const f = computeFigures(partners, txns)
  return {
    name: 'Partner summary',
    rows: [
      ['Partner', 'Ownership %', 'Profit share %', 'Loss share %', 'Invested', 'Withdrawn', 'Capital', 'Profit allocated', 'Profit paid', 'Unpaid profit', 'Loss allocated', 'Received from partners', 'Paid to partners', 'Settlement (+ owed to / − owes)', 'Balance'],
      ...partners.map((p) => {
        const x = f.partners.find((y) => y.partnerId === p.id)!
        return [p.name, pct(p.ownershipBp), pct(p.profitBp), pct(p.lossBp), rs(x.contributed), rs(x.withdrawn), rs(x.capital), rs(x.profitAllocated), rs(x.profitPaid), rs(x.profitPayable), rs(x.lossAllocated), rs(x.received), rs(x.paid), rs(x.settlement), rs(x.balance)]
      }),
      [],
      ['Business cash', rs(f.cash)], ['Total capital', rs(f.capital)], ['Revenue', rs(f.revenue)], ['Expenses', rs(f.expenses)], ['Net profit / loss', rs(f.net)],
      ['Profit allocated', rs(f.profitAllocated)], ['Loss allocated', rs(f.lossAllocated)], ['Not yet allocated', rs(f.unallocated)], ['Distributions paid', rs(f.distributed)],
      ['Books reconcile', f.reconciles ? 'Yes' : 'NO — check entries'],
    ],
  }
}

function periodSummarySheet(txns: BpTxn[], unit: 'month' | 'year'): Sheet {
  const keys = ['contributed', 'withdrawn', 'revenue', 'expenses', 'profitAlloc', 'lossAlloc', 'distributed', 'transfers'] as const
  const map = new Map<string, Record<(typeof keys)[number], number>>()
  for (const t of txns) {
    const k = unit === 'month' ? t.date.slice(0, 7) : t.date.slice(0, 4)
    const b = map.get(k) ?? Object.fromEntries(keys.map((x) => [x, 0])) as Record<(typeof keys)[number], number>
    const { type, sign } = effectOf(t)
    const a = sign * t.amount
    if (type === 'initial_capital' || type === 'investment') b.contributed += a
    else if (type === 'withdrawal') b.withdrawn += a
    else if (type === 'revenue') b.revenue += a
    else if (type === 'expense') b.expenses += a
    else if (type === 'profit_alloc') b.profitAlloc += a
    else if (type === 'loss_alloc') b.lossAlloc += a
    else if (type === 'profit_dist') b.distributed += a
    else if (type === 'transfer') b.transfers += a
    map.set(k, b)
  }
  return {
    name: unit === 'month' ? 'Monthly summary' : 'Yearly summary',
    rows: [[unit === 'month' ? 'Month' : 'Year', 'Capital in', 'Withdrawals', 'Revenue', 'Expenses', 'Net profit / loss', 'Profit allocated', 'Loss allocated', 'Profit paid', 'Partner transfers (not business cash)', 'Net cash movement'],
      ...[...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, b]) => [k, rs(b.contributed), rs(b.withdrawn), rs(b.revenue), rs(b.expenses), rs(b.revenue - b.expenses), rs(b.profitAlloc), rs(b.lossAlloc), rs(b.distributed), rs(b.transfers),
        rs(b.contributed - b.withdrawn + b.revenue - b.expenses - b.distributed)])],
  }
}

export default function PartnerReports() {
  const { partners, txns, byId } = useBp()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const rows = useMemo(() => txns.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)), [txns, from, to])
  const period = from || to ? `${from || 'start'} → ${to || 'today'}` : 'All time'
  const of = (...types: BpTxn['type'][]) => rows.filter((t) => types.includes(effectOf(t).type))

  const reports: { title: string; desc: string; sheets: () => Sheet[] }[] = [
    { title: 'Complete business financial report', desc: 'Partner summary, totals, reconciliation and the full ledger', sheets: () => [partnerSummarySheet(partners, rows), ledgerSheet(rows, byId)] },
    { title: 'Individual partner statements', desc: 'One sheet per partner with every entry and its effect on them', sheets: () => partners.map((p) => statementSheet(p, rows.filter((t) => t.fromId === p.id || t.toId === p.id || t.lines.some((l) => l.partnerId === p.id && l.amount)), byId)) },
    { title: 'Investment report', desc: 'Initial capital, additional investments and withdrawals', sheets: () => [ledgerSheet(of('initial_capital', 'investment', 'withdrawal'), byId, 'Investments')] },
    { title: 'Profit & loss report', desc: 'Revenue, expenses and how results were allocated and paid', sheets: () => [periodSummarySheet(rows, 'month'), ledgerSheet(of('revenue', 'expense', 'profit_alloc', 'loss_alloc', 'profit_dist'), byId, 'P&L entries')] },
    { title: 'Partner settlement report', desc: 'Partner-to-partner payments and who owes whom', sheets: () => [partnerSummarySheet(partners, rows), ledgerSheet(of('transfer'), byId, 'Transfers')] },
    { title: 'Monthly summary', desc: 'Totals for each month', sheets: () => [periodSummarySheet(rows, 'month')] },
    { title: 'Yearly summary', desc: 'Totals for each year', sheets: () => [periodSummarySheet(rows, 'year')] },
  ]
  return (
    <div className="space-y-4">
      <div className="card grid max-w-md grid-cols-2 gap-3 p-3">
        <Field label="From" htmlFor="rp-from"><Input id="rp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="rp-to"><Input id="rp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {reports.map((r) => (
          <li key={r.title} className="card flex flex-col gap-3 p-4">
            <div><h3 className="flex items-center gap-2 font-semibold"><FileBarChart className="h-4 w-4 text-accent" aria-hidden />{r.title}</h3><p className="text-xs text-muted">{r.desc}</p></div>
            <ExportButtons name={r.title} period={period} sheets={r.sheets} />
          </li>
        ))}
        <li className="card flex flex-col gap-3 p-4">
          <div><h3 className="flex items-center gap-2 font-semibold"><ImageDown className="h-4 w-4 text-accent" aria-hidden />Payment summary image (PNG)</h3>
            <p className="text-xs text-muted">Open any ledger entry and choose <b>Payment image</b>, or build one for selected partners.</p></div>
          <Link to="/glamiex/payment-image" className="btn btn-soft h-8 w-fit px-3 text-xs">Open Payment Image Creator</Link>
        </li>
      </ul>
    </div>
  )
}
