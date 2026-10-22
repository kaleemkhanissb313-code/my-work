import { useMemo, useState } from 'react'
import { Badge, Select } from '@/components/ui'
import { orderTotal } from '@/features/glamiex/engine'
import { pkr } from '@/features/glamiex/money'
import { inRange, zoned } from '@/features/glamiex/time'
import { DataTable, ExportButtons, RangeBar, rs, useRange, type Col } from '@/features/glamiex/ui'
import { PAYMENT_TYPES } from '@/features/glamiex/types'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { Stat, earliestDate } from './shared'
import { to12 } from '@/features/glamiex/time'

type Kind = 'Sale' | 'Refund' | 'Payment' | 'Ad income' | 'Ad spend' | 'Expense'
interface Tx { id: string; at: string; date: string; time: string; day: string; kind: Kind; ref: string; party: string; desc: string; inflow: number; outflow: number; status: string; to: string }

export default function Transactions() {
  const { data, tz, go } = useGx()
  const { state, setState, range: raw } = useRange('transactions', tz, 'thisMonth')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [kind, setKind] = useState<Kind | ''>('')
  const people = new Map(data.people.map((p) => [p.id, p.name]))
  const rows = useMemo(() => {
    const out: Tx[] = []
    const z = (iso: string) => zoned(iso, tz)
    const day = (date: string) => zoned(`${date}T07:00:00.000Z`, tz).weekday
    for (const o of live(data.orders)) { const t = z(o.at); out.push({ id: `o${o.id}`, at: o.at, date: t.date, time: t.time, day: t.weekday, kind: 'Sale', ref: o.orderNo, party: people.get(o.personId ?? '') ?? 'Walk-in', desc: o.items.map((i) => `${i.qty}× ${i.name}`).join(', '), inflow: 0, outflow: 0, status: o.status, to: `sales/${o.id}` }) ; out[out.length - 1].desc += ` · value ${pkr(orderTotal(o))}` }
    for (const r of live(data.refunds)) { const t = z(r.at); const o = data.orders.find((x) => x.id === r.orderId); out.push({ id: `r${r.id}`, at: r.at, date: t.date, time: t.time, day: t.weekday, kind: 'Refund', ref: o?.orderNo ?? '', party: people.get(o?.personId ?? '') ?? 'Walk-in', desc: r.reason || 'Refund (revenue reversal)', inflow: 0, outflow: 0, status: 'posted', to: `sales/${r.orderId}` }) }
    for (const p of data.payments.filter((x) => !x.deletedAt)) { const t = z(p.at); const info = PAYMENT_TYPES.find((x) => x.id === p.type)!; out.push({ id: `p${p.id}`, at: p.at, date: t.date, time: t.time, day: t.weekday, kind: 'Payment', ref: p.txnNo, party: people.get(p.personId ?? '') ?? '—', desc: info.label + (p.reference ? ` · ${p.reference}` : ''), inflow: !p.voided && info.dir === 'in' ? p.amount : 0, outflow: !p.voided && info.dir === 'out' ? p.amount : 0, status: p.voided ? 'void' : 'posted', to: `payments/${p.id}` }) }
    for (const a of live(data.adIncome)) out.push({ id: `ai${a.id}`, at: `${a.reportDate}T12:00`, date: a.reportDate, time: '', day: day(a.reportDate), kind: 'Ad income', ref: a.campaign, party: a.platform, desc: `Net advertising earnings${a.currency !== 'PKR' ? ` (${a.currency} @ ${a.exchangeRate})` : ''}`, inflow: a.netPkr, outflow: 0, status: 'posted', to: 'ad-income' })
    for (const a of live(data.adSpend)) out.push({ id: `as${a.id}`, at: `${a.start}T12:00`, date: a.start, time: '', day: day(a.start), kind: 'Ad spend', ref: a.campaignId || a.campaign, party: a.platform, desc: `${a.campaign} (${a.start} → ${a.end || a.start})`, inflow: 0, outflow: a.amountPkr, status: 'posted', to: 'ad-spend' })
    for (const e of live(data.expenses)) out.push({ id: `e${e.id}`, at: `${e.date}T12:00`, date: e.date, time: '', day: day(e.date), kind: 'Expense', ref: e.category, party: e.vendor, desc: e.description || e.category, inflow: 0, outflow: e.amount, status: 'posted', to: 'expenses' })
    return out.filter((t) => inRange(t.date, range) && (!kind || t.kind === kind))
  }, [data, tz, range.from, range.to, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const totIn = rows.reduce((a, r) => a + r.inflow, 0), totOut = rows.reduce((a, r) => a + r.outflow, 0)
  const cols: Col<Tx>[] = [
    { key: 'date', label: 'Date', render: (r) => <span className="whitespace-nowrap">{r.date} <span className="text-muted">{to12(r.time)} {r.day.slice(0, 3)}</span></span>, sort: (r) => r.at, text: (r) => `${r.ref} ${r.party} ${r.desc}` },
    { key: 'kind', label: 'Type', render: (r) => <Badge tone={r.kind === 'Sale' ? 'accent' : r.kind === 'Refund' || r.kind === 'Expense' || r.kind === 'Ad spend' ? 'danger' : 'ok'}>{r.kind}</Badge>, sort: (r) => r.kind },
    { key: 'ref', label: 'Reference', render: (r) => <span className="font-mono text-xs">{r.ref}</span>, sort: (r) => r.ref },
    { key: 'party', label: 'Party', render: (r) => r.party, sort: (r) => r.party },
    { key: 'desc', label: 'Description', render: (r) => <span className={cn('line-clamp-1', r.status === 'void' || r.status === 'cancelled' ? 'line-through opacity-60' : '')}>{r.desc}</span> },
    { key: 'in', label: 'Cash in', align: 'right', render: (r) => (r.inflow ? <span className="text-ok">{pkr(r.inflow)}</span> : ''), sort: (r) => r.inflow },
    { key: 'out', label: 'Cash out', align: 'right', render: (r) => (r.outflow ? <span className="text-danger">{pkr(r.outflow)}</span> : ''), sort: (r) => r.outflow },
  ]
  return (
    <div>
      <RangeBar state={state} setState={setState} range={range} />
      <div className="mb-3 grid grid-cols-3 gap-2 sm:max-w-xl"><Stat label="Cash in" tone="ok">{pkr(totIn)}</Stat><Stat label="Cash out" tone="danger">{pkr(totOut)}</Stat><Stat label="Net" tone={totIn - totOut >= 0 ? 'ok' : 'danger'}>{pkr(totIn - totOut)}</Stat></div>
      <p className="mb-3 text-xs text-muted">Sales and refunds are listed for context; their cash appears as payments. Ad spend is shown on its start date.</p>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} onRowClick={(r) => go(r.to)} initialSort={{ key: 'date', dir: -1 }} empty="No transactions in this period."
        toolbar={<>
          <Select aria-label="Type" className="w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind | '')}><option value="">All types</option>{(['Sale', 'Refund', 'Payment', 'Ad income', 'Ad spend', 'Expense'] as Kind[]).map((k) => <option key={k}>{k}</option>)}</Select>
          <ExportButtons name="Transactions" period={`${range.from} to ${range.to}`} sheets={() => [{ name: 'Transactions', rows: [['Date', 'Time', 'Day', 'Type', 'Reference', 'Party', 'Description', 'Status', 'Cash in (Rs)', 'Cash out (Rs)'], ...rows.sort((a, b) => a.at.localeCompare(b.at)).map((r) => [r.date, r.time, r.day, r.kind, r.ref, r.party, r.desc, r.status, r.inflow ? rs(r.inflow) : '', r.outflow ? rs(r.outflow) : ''])] }]} />
        </>}
        card={(r) => <div><div className="flex items-start justify-between gap-2"><Badge tone={r.kind === 'Sale' ? 'accent' : r.inflow ? 'ok' : 'danger'}>{r.kind}</Badge><span className="text-xs text-muted">{r.date} {to12(r.time)}</span></div>
          <div className="mt-1 line-clamp-2 text-sm">{r.desc}</div><div className="mt-1 flex items-center justify-between text-xs text-muted"><span>{r.party} · {r.ref}</span>{r.inflow ? <b className="text-ok">+{pkr(r.inflow)}</b> : r.outflow ? <b className="text-danger">−{pkr(r.outflow)}</b> : null}</div></div>} />
    </div>
  )
}
