import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Info, Receipt, Scale, TriangleAlert } from 'lucide-react'
import { Button, Field, Input, Select } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { pkr } from '@/features/glamiex/money'
import { KpiCard, MoneyInput } from '@/features/glamiex/ui'
import { overlappingAllocations, pct, periodResult, shareTotal, splitByShares } from '@/features/glamiex/partners/engine'
import { blankDraft, postTxn } from '@/features/glamiex/partners/service'
import { FULL_SHARE, type BpLine } from '@/features/glamiex/partners/types'
import { useGx } from '../../context'
import { nowLocal } from '../shared'
import { TxnTable } from './Ledger'
import { Avatar, useBp } from './shared'

const monthStart = (d: string) => `${d.slice(0, 7)}-01`

export default function ProfitLoss() {
  const { tz } = useGx()
  const { partners, txns, projects, figures, openForm } = useBp()
  const today = nowLocal(tz).date
  const [start, setStart] = useState(monthStart(today))
  const [end, setEnd] = useState(today)
  const [project, setProject] = useState<string | null>(null)
  const [mode, setMode] = useState<'percent' | 'manual'>('percent')
  const [manual, setManual] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const r = useMemo(() => periodResult(txns, start, end, project), [txns, start, end, project])
  const loss = r.net < 0
  const amount = Math.abs(r.net)
  const shareKey = loss ? 'lossBp' : 'profitBp'
  const shares = partners.map((p) => ({ partnerId: p.id, bp: p[shareKey] }))
  const sharesOk = shareTotal(shares.map((s) => s.bp)) === FULL_SHARE
  const overlaps = useMemo(() => overlappingAllocations(txns, start, end, project), [txns, start, end, project])
  const lines: BpLine[] = useMemo(() => {
    if (mode === 'manual') return partners.map((p) => ({ partnerId: p.id, amount: manual[p.id] ?? 0 }))
    return sharesOk && amount ? splitByShares(amount, shares) : []
  }, [mode, manual, partners, sharesOk, amount, shares])
  const linesSum = lines.reduce((a, l) => a + l.amount, 0)
  const rangeOk = start && end && start <= end
  const problem = !rangeOk ? 'Choose a valid period' : !amount ? 'There is no profit or loss in this period' : mode === 'percent' && !sharesOk ? `${loss ? 'Loss' : 'Profit'}-sharing percentages must total 100%`
    : linesSum !== amount ? `Partner amounts add up to ${pkr(linesSum)}; they must equal ${pkr(amount)}` : null

  const confirmAllocation = async () => {
    if (problem) { toast(problem, 'error'); return }
    const overlapNote = overlaps.length ? ` ${overlaps.length} earlier allocation(s) already cover part of this period.` : ''
    if (!(await confirm({ title: `Confirm ${loss ? 'loss' : 'profit'} allocation`, body: `${pkr(amount)} ${loss ? 'loss' : 'profit'} for ${start} → ${end}${project != null ? ` (${project || 'general business'})` : ''} will be assigned to partners.${overlapNote}`, confirmLabel: 'Confirm allocation', danger: !!overlaps.length }))) return
    setBusy(true)
    try {
      const n = nowLocal(tz)
      const d = { ...blankDraft(loss ? 'loss_alloc' : 'profit_alloc', end <= n.date ? end : n.date, n.time), amount, lines,
        period: { start, end }, allocMode: mode, basis: r, project: project ?? '',
        description: `${loss ? 'Loss' : 'Profit'} for ${start} → ${end}${mode === 'manual' ? ' (manually agreed split)' : ''}` }
      const row = await postTxn(d, { allowDuplicate: true })
      toast(`Allocated ${pkr(amount)} · ${row.txnNo}`)
      setManual({})
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }

  const allocations = txns.filter((t) => t.type === 'profit_alloc' || t.type === 'loss_alloc' || (t.type === 'correction' && (t.reversesType === 'profit_alloc' || t.reversesType === 'loss_alloc')))

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
        <Field label="From" htmlFor="pl-start"><Input id="pl-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="To" htmlFor="pl-end"><Input id="pl-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Business or project" htmlFor="pl-project" className="col-span-2">
          <Select id="pl-project" value={project ?? '*'} onChange={(e) => setProject(e.target.value === '*' ? null : e.target.value)}>
            <option value="*">Whole business (all projects)</option><option value="">General business only</option>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:grid-cols-4">
        <KpiCard label="Total revenue" value={r.revenue} tone="ok" />
        <KpiCard label="Total business expenses" value={r.expenses} />
        <KpiCard label={loss ? 'Net loss' : 'Net profit'} value={r.net} tone="auto" sub="Revenue − expenses" />
        <KpiCard label="Not yet allocated (all time)" value={figures.unallocated} tone={figures.unallocated ? 'warn' : undefined} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={Receipt} onClick={() => openForm('cash')}>Record revenue or expense</Button>
      </div>

      <section className="card space-y-3 p-4" aria-labelledby="pl-split">
        <h2 id="pl-split" className="flex items-center gap-2 font-semibold"><Scale className="h-4 w-4" aria-hidden />Distribute {loss ? 'loss' : 'profit'}</h2>
        <p className="flex gap-2 text-xs text-muted"><Info className="h-4 w-4 shrink-0" aria-hidden />
          Business ownership, capital contributed and profit/loss shares are separate. Splits use the agreed {loss ? 'loss' : 'profit'}-sharing percentages (or amounts you enter), never capital automatically.</p>
        <div className="grid grid-cols-2 gap-2 sm:w-96" role="radiogroup" aria-label="Split method">
          {([['percent', 'Agreed percentages'], ['manual', 'Manual amounts']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={cn('btn h-10 text-sm', mode === id ? 'btn-3d' : 'btn-soft')}>{label}</button>
          ))}
        </div>
        {mode === 'percent' && !sharesOk && (
          <p className="flex items-center gap-2 text-sm text-warn" role="status"><TriangleAlert className="h-4 w-4" aria-hidden />
            {loss ? 'Loss' : 'Profit'}-sharing percentages total {pct(shareTotal(shares.map((s) => s.bp)))}. <Link className="underline" to="/glamiex/partners/settings">Set them to 100%</Link></p>
        )}
        <ul className="divide-y divide-line">
          {partners.map((p) => {
            const amt = lines.find((l) => l.partnerId === p.id)?.amount ?? 0
            return (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <Avatar p={p} size="sm" />
                <label htmlFor={`pl-m-${p.id}`} className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}
                  <span className="block text-xs font-normal text-muted">Agreed share {pct(p[shareKey])}</span></label>
                {mode === 'manual'
                  ? <div className="w-36 sm:w-44"><MoneyInput id={`pl-m-${p.id}`} value={manual[p.id] || null} onChange={(v) => setManual((m) => ({ ...m, [p.id]: v ?? 0 }))} /></div>
                  : <span className={cn('tabular-nums font-semibold', loss && amt > 0 && 'text-danger')}>{loss && amt ? '−' : ''}{pkr(amt)}</span>}
              </li>
            )
          })}
        </ul>
        {overlaps.length > 0 && <p className="text-sm text-warn" role="status">Already allocated for an overlapping period: {overlaps.map((t) => `${t.txnNo} (${t.period!.start} → ${t.period!.end})`).join(', ')}. Allocating again would count the same result twice.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-sm">{problem ? <span className="text-muted">{problem}</span> : <>Ready to allocate <b>{pkr(amount)}</b> {loss ? 'loss' : 'profit'}</>}</span>
          <Button variant="primary" loading={busy} disabled={!!problem} onClick={() => void confirmAllocation()}>Confirm allocation</Button>
        </div>
      </section>

      <section aria-labelledby="pl-history">
        <h2 id="pl-history" className="mb-2 font-semibold">Allocation history</h2>
        <TxnTable rows={allocations} />
      </section>
    </div>
  )
}
