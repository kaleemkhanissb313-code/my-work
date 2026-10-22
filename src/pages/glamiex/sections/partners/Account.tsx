import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowLeftRight, Landmark, PiggyBank } from 'lucide-react'
import { Link } from 'react-router'
import { Button, Field, Input } from '@/components/ui'
import { cn } from '@/lib/cn'
import { pkr } from '@/features/glamiex/money'
import { ExportButtons } from '@/features/glamiex/ui'
import { partnerEntries, pct } from '@/features/glamiex/partners/engine'
import type { BpPartner } from '@/features/glamiex/partners/types'
import { TxnTable } from './Ledger'
import { statementSheet } from './PartnerReports'
import { Avatar, TYPE_GROUPS, effectiveType, useBp } from './shared'

export default function Account({ partner: p }: { partner: BpPartner }) {
  const { txns, figures, byId, openForm } = useBp()
  const f = figures.partners.find((x) => x.partnerId === p.id)!
  const [group, setGroup] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const mine = useMemo(() => partnerEntries(txns, p.id), [txns, p.id])
  const types = TYPE_GROUPS.find((g) => g.id === group)!.types
  const rows = mine.filter((t) => (!types.length || types.includes(effectiveType(t)) || (group === 'corrections' && t.type === 'correction')) && (!from || t.date >= from) && (!to || t.date <= to))
  const capShare = figures.capital > 0 ? Math.round((Math.max(0, f.capital) / figures.capital) * 10_000) : 0

  const stat = (label: string, v: number, tone?: 'ok' | 'danger' | 'warn') => (
    <div className="rounded-2xl border border-line p-3"><div className="text-xs text-muted">{label}</div>
      <div className={cn('text-lg font-bold tabular-nums', tone === 'ok' && 'text-ok', tone === 'danger' && 'text-danger', tone === 'warn' && 'text-warn')}>{pkr(v)}</div></div>
  )

  return (
    <div className="space-y-4">
      <Link to="/glamiex/partners" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />All partners</Link>
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <Avatar p={p} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold">{p.name}</h2>
          <p className="text-xs text-muted">Ownership {pct(p.ownershipBp)} · Profit share {pct(p.profitBp)} · Loss share {pct(p.lossBp)} · Share of current capital {pct(capShare)}</p>
        </div>
        <div className="text-end"><div className="text-xs text-muted">Outstanding balance</div><div className={cn('text-2xl font-bold tabular-nums', f.balance < 0 && 'text-danger')}>{pkr(f.balance)}</div></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={PiggyBank} onClick={() => openForm('investment')}>Add investment</Button>
        <Button icon={ArrowLeftRight} onClick={() => openForm('transfer', { partnerId: p.id })}>Record payment from {p.name}</Button>
        <Button icon={Landmark} onClick={() => openForm('withdrawal', { partnerId: p.id })}>Capital withdrawal</Button>
        <ExportButtons name={`Partner statement ${p.name}`} period={from || to ? `${from || 'start'} → ${to || 'today'}` : 'All time'} sheets={() => [statementSheet(p, rows, byId)]} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stat('Total investments', f.contributed)}
        {stat('Capital withdrawals', f.withdrawn, f.withdrawn ? 'warn' : undefined)}
        {stat('Profit allocated', f.profitAllocated, f.profitAllocated ? 'ok' : undefined)}
        {stat('Profit paid', f.profitPaid)}
        {stat('Loss allocated', f.lossAllocated, f.lossAllocated ? 'danger' : undefined)}
        {stat('Money received', f.received)}
        {stat('Money paid', f.paid)}
        {stat('Unpaid profit', f.profitPayable, f.profitPayable ? 'warn' : undefined)}
        {stat(f.settlement >= 0 ? 'Owed by other partners' : 'Owes other partners', Math.abs(f.settlement), f.settlement < 0 ? 'warn' : undefined)}
        {stat('Capital balance', f.capital)}
      </div>
      <section className="space-y-3" aria-labelledby="acct-history">
        <h2 id="acct-history" className="font-semibold">Transaction history</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
          {TYPE_GROUPS.map((g) => (
            <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}
              className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', group === g.id ? 'border-accent bg-accent text-onaccent' : 'border-line text-muted')}>{g.label}</button>
          ))}
        </div>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field label="From" htmlFor="ac-from"><Input id="ac-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="ac-to"><Input id="ac-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <TxnTable rows={rows} partnerId={p.id} />
      </section>
    </div>
  )
}
