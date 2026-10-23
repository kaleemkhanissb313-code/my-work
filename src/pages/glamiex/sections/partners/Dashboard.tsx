import { Link } from 'react-router'
import { ArrowLeftRight, CheckCircle2, HandCoins, Landmark, Minus, PiggyBank, Plus, Receipt, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { pkr } from '@/features/glamiex/money'
import { KpiCard } from '@/features/glamiex/ui'
import { Avatar, signed, signTone, useBp } from './shared'

export default function Dashboard() {
  const { partners, figures: f, net, txns, openForm } = useBp()
  const netOf = (id: string) => net.partners.find((x) => x.partnerId === id)!
  const fig = (id: string) => f.partners.find((x) => x.partnerId === id)!
  const maxCap = Math.max(1, ...f.partners.map((p) => Math.max(0, p.capital)))

  return (
    <div className="space-y-4">
      {/* Overall balance: investments & expenses −, income / orders + (updates automatically with every entry) */}
      <section aria-labelledby="bp-overall" className="card overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="bp-overall" className="text-sm font-medium text-muted">Overall balance</h2>
            <div className={cn('text-3xl font-bold tabular-nums sm:text-4xl', signTone(net.balance))}>{signed(net.balance)}</div>
            <p className="mt-1 text-xs text-muted">Income − investments − expenses. {net.balance < 0 ? `${pkr(-net.balance)} still to recover.` : net.balance > 0 ? 'Everything invested has been recovered.' : ''}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            <Button variant="danger" icon={Minus} className="min-h-[48px]" onClick={() => openForm('minus')}>Investment / expense</Button>
            <Button variant="primary" icon={Plus} className="min-h-[48px]" onClick={() => openForm('plus')}>Income / order</Button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-xl bg-raised/60 p-2.5"><dt className="text-xs text-muted">Invested</dt><dd className="font-semibold tabular-nums text-danger">{signed(-net.invested)}</dd></div>
          <div className="rounded-xl bg-raised/60 p-2.5"><dt className="text-xs text-muted">Expenses</dt><dd className="font-semibold tabular-nums text-danger">{signed(-net.expenses)}</dd></div>
          <div className="rounded-xl bg-raised/60 p-2.5"><dt className="text-xs text-muted">Income</dt><dd className="font-semibold tabular-nums text-ok">{signed(net.income)}</dd></div>
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">Overall balance by partner</caption>
            <thead><tr className="text-xs text-muted"><th className="py-1.5 text-start font-medium">Partner</th><th className="py-1.5 text-end font-medium">Invested</th><th className="py-1.5 text-end font-medium">Expenses</th><th className="py-1.5 text-end font-medium">Income</th><th className="py-1.5 text-end font-medium">Balance</th></tr></thead>
            <tbody>
              {partners.map((p) => { const x = netOf(p.id); return (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-2"><Link to={`/glamiex/partners/${p.id}`} className="flex items-center gap-2 font-medium hover:underline"><Avatar p={p} size="sm" />{p.name}</Link></td>
                  <td className="py-2 text-end tabular-nums">{x.invested ? signed(-x.invested) : '—'}</td>
                  <td className="py-2 text-end tabular-nums">{x.expenses ? signed(-x.expenses) : '—'}</td>
                  <td className="py-2 text-end tabular-nums">{x.income ? signed(x.income) : '—'}</td>
                  <td className={cn('py-2 text-end font-semibold tabular-nums', signTone(x.balance))}>{signed(x.balance)}</td>
                </tr>
              ) })}
              {(net.business.expenses !== 0 || net.business.income !== 0) && (
                <tr className="border-t border-line text-muted">
                  <td className="py-2">Business account</td><td className="py-2 text-end">—</td>
                  <td className="py-2 text-end tabular-nums">{net.business.expenses ? signed(-net.business.expenses) : '—'}</td>
                  <td className="py-2 text-end tabular-nums">{net.business.income ? signed(net.business.income) : '—'}</td>
                  <td className={cn('py-2 text-end font-semibold tabular-nums', signTone(net.business.balance))}>{signed(net.business.balance)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-line font-semibold">
                <td className="py-2">Combined</td><td className="py-2 text-end tabular-nums">{signed(-net.invested)}</td><td className="py-2 text-end tabular-nums">{signed(-net.expenses)}</td>
                <td className="py-2 text-end tabular-nums">{signed(net.income)}</td><td className={cn('py-2 text-end tabular-nums', signTone(net.balance))}>{signed(net.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="pt-2 text-sm font-semibold text-muted">Detailed books</h2>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button icon={PiggyBank} onClick={() => openForm('investment')}>Split investment</Button>
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
                    <div className="text-xs text-muted">Overall <b className={cn('tabular-nums', signTone(netOf(p.id).balance))}>{signed(netOf(p.id).balance)}</b> · equity {pkr(x.balance)}</div></div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden><div className="h-full rounded-full bg-accent" style={{ width: `${(Math.max(0, x.capital) / maxCap) * 100}%` }} /></div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted">Invested capital</dt><dd className="text-end font-medium tabular-nums">{pkr(x.capital)}</dd>
                  <dt className="text-muted">Profit / loss</dt><dd className={cn('text-end font-medium tabular-nums', pl > 0 && 'text-ok', pl < 0 && 'text-danger')}>{pkr(pl)}</dd>
                  <dt className="text-muted">Money received</dt><dd className="text-end tabular-nums">{pkr(x.received)}</dd>
                  <dt className="text-muted">Money paid</dt><dd className="text-end tabular-nums">{pkr(x.paid)}</dd>
                  <dt className="text-muted">Unpaid profit</dt><dd className="text-end tabular-nums">{pkr(x.profitPayable)}</dd>
                  <dt className="text-muted">{x.settlement >= 0 ? 'Owed by partners' : 'Owes partners'}</dt><dd className={cn('text-end tabular-nums', x.settlement < 0 && 'text-warn')}>{pkr(Math.abs(x.settlement))}</dd>
                </dl>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
