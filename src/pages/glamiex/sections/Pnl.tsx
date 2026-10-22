import { useMemo } from 'react'
import { Scale, Wallet } from 'lucide-react'
import { pnlLines, cashLines, buildReport } from '@/features/glamiex/reports'
import { pkr } from '@/features/glamiex/money'
import { Delta, ExportButtons, Money, RangeBar, Section, useRange } from '@/features/glamiex/ui'
import { cn } from '@/lib/cn'
import { useGx } from '../context'
import { Stat, earliestDate } from './shared'

export default function Pnl() {
  const { data, tz } = useGx()
  const { state, setState, range: raw } = useRange('pnl', tz, 'thisMonth')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const p = useMemo(() => pnlLines(data, range, tz), [data, range.from, range.to, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => cashLines(data, range, tz), [data, range.from, range.to, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const period = `${range.from} to ${range.to}`
  return (
    <div className="space-y-4">
      <RangeBar state={state} setState={setState} range={range} extra={<ExportButtons name="Profit and loss" period={period} sheets={() => [...buildReport('pnl', data, range, tz), ...buildReport('cash', data, range, tz)]} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales revenue"><Money v={p.cur.netSales} /></Stat>
        <Stat label="Gross profit" tone={p.cur.grossProfit >= 0 ? 'ok' : 'danger'}><Money v={p.cur.grossProfit} /> {p.cur.grossMargin != null && <span className="text-xs text-muted">({(p.cur.grossMargin * 100).toFixed(1)}%)</span>}</Stat>
        <Stat label="Net profit" tone={p.cur.netProfit >= 0 ? 'ok' : 'danger'}><Money v={p.cur.netProfit} /> {p.cur.netMargin != null && <span className="text-xs text-muted">({(p.cur.netMargin * 100).toFixed(1)}%)</span>}</Stat>
        <Stat label="Net cash movement" tone={c.s.netCash >= 0 ? 'ok' : 'danger'}><Money v={c.s.netCash} /></Stat>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Section title="Profit & loss statement" icon={Scale}>
          <div className="overflow-x-auto">
            <table className="gx-table w-full min-w-[480px] text-sm">
              <thead><tr className="text-start text-xs text-muted"><th className="py-2 pe-2">Line</th><th className="py-2 text-end">This period</th><th className="py-2 text-end">Previous</th><th className="py-2 text-end">Change</th></tr></thead>
              <tbody>{p.lines.map((l) => (
                <tr key={l.label} className={cn('border-t border-line/60', l.kind === 'sub' && 'font-semibold', l.kind === 'total' && 'border-t-2 border-line text-base font-bold')}>
                  <td className={cn('py-2 pe-2', l.kind === 'indent' && 'ps-4 text-muted')}>{l.label}</td>
                  <td className={cn('gx-num py-2', l.kind === 'total' && (l.cur >= 0 ? 'text-ok' : 'text-danger'))}>{pkr(l.cur)}</td>
                  <td className="gx-num py-2 text-muted">{pkr(l.prev)}</td>
                  <td className="py-2 text-end"><Delta cur={l.cur} prev={l.prev} money /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Previous period: {p.prevRange.from} → {p.prevRange.to}. Tax collected ({pkr(p.cur.tax)}) is excluded from revenue. Deposits, owner contributions, loans and drawings never affect profit.</p>
        </Section>
        <div className="space-y-4">
          <Section title="Cash movement (separate from profit)" icon={Wallet}>
            <ul className="space-y-1.5 text-sm">
              {c.byType.filter((t) => t.dir !== 'none' && t.amount).map((t) => <li key={t.id} className="flex justify-between gap-2"><span>{t.label}</span><span className={t.dir === 'in' ? 'text-ok' : 'text-danger'}>{t.dir === 'in' ? '+' : '−'}{pkr(t.amount)}</span></li>)}
              {c.expenses > 0 && <li className="flex justify-between gap-2"><span>Business expenses</span><span className="text-danger">−{pkr(c.expenses)}</span></li>}
              {c.adCash > 0 && <li className="flex justify-between gap-2"><span>Advertising spend paid</span><span className="text-danger">−{pkr(c.adCash)}</span></li>}
              <li className="flex justify-between gap-2 border-t border-line pt-2 font-semibold"><span>Net cash movement</span><Money v={c.s.netCash} tone /></li>
            </ul>
          </Section>
          <Section title="Balances at period end" icon={Wallet}>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span>Outstanding receivables</span><b className="text-warn">{pkr(p.cur.receivables)}</b></li>
              <li className="flex justify-between"><span>Customer credit / unapplied deposits</span><b>{pkr(p.cur.customerCredit)}</b></li>
              <li className="flex justify-between"><span>Owner & loan financing (period)</span><b>{pkr(p.cur.financing)}</b></li>
              <li className="flex justify-between"><span>Owner drawings (period)</span><b>{pkr(p.cur.drawings)}</b></li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}
