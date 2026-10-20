import { Link } from 'react-router'
import { ArrowLeftRight, CheckCircle2, HandCoins, Landmark, PiggyBank, Receipt, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { pkr } from '@/features/glamiex/money'
import { KpiCard } from '@/features/glamiex/ui'
import { Avatar, useBp } from './shared'

export default function Dashboard() {
  const { partners, figures: f, txns, openForm } = useBp()
  const fig = (id: string) => f.partners.find((x) => x.partnerId === id)!
  const maxCap = Math.max(1, ...f.partners.map((p) => Math.max(0, p.capital)))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button variant="primary" icon={PiggyBank} onClick={() => openForm('investment')}>Add investment</Button>
        <Button icon={ArrowLeftRight} onClick={() => openForm('transfer')}>Record payment</Button>
        <Button icon={Receipt} onClick={() => openForm('cash')}>Revenue / expense</Button>
        <Button icon={HandCoins} onClick={() => openForm('distribution')} disabled={!f.partners.some((p) => p.profitPayable > 0)}>Pay out profit</Button>
        <Button icon={Landmark} onClick={() => openForm('withdrawal')}>Capital withdrawal</Button>
      </div>

      {!txns.length ? (
        <p className="card p-4 text-sm text-muted">No entries yet. Every figure here comes only from entries you record — there is no sample data. Start with <b>Add investment</b>.</p>
      ) : (
        <p className={cn('flex items-center gap-2 text-sm', f.reconciles ? 'text-ok' : 'text-danger')} role="status">
          {f.reconciles ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <TriangleAlert className="h-4 w-4" aria-hidden />}
          {f.reconciles ? `Books reconcile: cash ${pkr(f.cash)} = partner balances + unallocated result` : `Books do not reconcile${f.inconsistent.length ? ` — check ${f.inconsistent.join(', ')}` : ''}`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:grid-cols-3 xl:grid-cols-4">
        <KpiCard label="Total business capital" value={f.capital} sub="Contributions − withdrawals" />
        <KpiCard label="Capital contributed" value={f.contributed} sub={f.withdrawn ? `${pkr(f.withdrawn)} withdrawn` : undefined} />
        <KpiCard label="Business cash balance" value={f.cash} tone={f.cash < 0 ? 'danger' : undefined} />
        <KpiCard label="Net profit / loss" value={f.net} tone="auto" sub={f.unallocated ? `${pkr(f.unallocated)} not yet allocated` : 'Fully allocated'} />
        <KpiCard label="Total revenue" value={f.revenue} tone="ok" />
        <KpiCard label="Total business expenses" value={f.expenses} />
        <KpiCard label="Profit distributions paid" value={f.distributed} />
        <KpiCard label="Outstanding partner settlements" value={f.outstandingSettlements} tone={f.outstandingSettlements ? 'warn' : undefined} />
      </div>

      <section aria-labelledby="bp-partners">
        <h2 id="bp-partners" className="mb-2 font-semibold">Partners</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {partners.map((p) => {
            const x = fig(p.id)
            const pl = x.profitAllocated - x.lossAllocated
            return (
              <Link key={p.id} to={`/glamiex/partners/${p.id}`} className="card card-hover block p-4" aria-label={`${p.name} account`}>
                <div className="flex items-center gap-3">
                  <Avatar p={p} />
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">Balance <b className={cn('tabular-nums', x.balance < 0 ? 'text-danger' : 'text-fg')}>{pkr(x.balance)}</b></div></div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden><div className="h-full rounded-full bg-accent" style={{ width: `${(Math.max(0, x.capital) / maxCap) * 100}%` }} /></div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted">Invested capital</dt><dd className="text-right font-medium tabular-nums">{pkr(x.capital)}</dd>
                  <dt className="text-muted">Profit / loss</dt><dd className={cn('text-right font-medium tabular-nums', pl > 0 && 'text-ok', pl < 0 && 'text-danger')}>{pkr(pl)}</dd>
                  <dt className="text-muted">Money received</dt><dd className="text-right tabular-nums">{pkr(x.received)}</dd>
                  <dt className="text-muted">Money paid</dt><dd className="text-right tabular-nums">{pkr(x.paid)}</dd>
                  <dt className="text-muted">Unpaid profit</dt><dd className="text-right tabular-nums">{pkr(x.profitPayable)}</dd>
                  <dt className="text-muted">{x.settlement >= 0 ? 'Owed by partners' : 'Owes partners'}</dt><dd className={cn('text-right tabular-nums', x.settlement < 0 && 'text-warn')}>{pkr(Math.abs(x.settlement))}</dd>
                </dl>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
