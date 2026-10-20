import { useEffect, useMemo, useState } from 'react'
import { Download, Pencil } from 'lucide-react'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { toast } from '@/components/feedback'
import { DataTable, type Col } from '@/features/glamiex/ui'
import { PR_METHODS, PR_STATUSES, filterRecords, formatAmount, longDate, parseAmount, weekday, type PayRecord, type PrFilter, type PrStatus } from '@/features/glamiex/payRecords/model'
import { renderRecord } from '@/features/glamiex/payRecords/render'
import { downloadRecord } from './actions'

const thumbs = new Map<string, string>()
/** Small rendered image of the record (cached per version). */
function Thumb({ r }: { r: PayRecord }) {
  const key = `${r.id}:${r.version}`
  const [src, setSrc] = useState(() => thumbs.get(key) ?? null)
  useEffect(() => {
    if (src) return
    let off = false
    void renderRecord(document.createElement('canvas'), r, 0.12).then((c) => { const u = c.toDataURL('image/jpeg', 0.7); thumbs.set(key, u); if (!off) setSrc(u) })
    return () => { off = true }
  }, [key, r, src])
  return src ? <img src={src} alt={`Payment image: ${r.title}`} className="h-16 w-12 shrink-0 rounded-md border border-line object-cover object-top" /> : <span className="block h-16 w-12 shrink-0 rounded-md bg-raised" aria-hidden />
}

const tone = (s: PrStatus) => (s === 'paid' ? 'ok' : s === 'pending' ? 'warn' : 'danger') as 'ok' | 'warn' | 'danger'
const label = (s: PrStatus) => PR_STATUSES.find((x) => x.id === s)?.label ?? s

export function History({ rows, showPartner, onEdit }: { rows: PayRecord[]; showPartner?: boolean; onEdit: (r: PayRecord) => void }) {
  const [f, setF] = useState<PrFilter>({ q: '', from: '', to: '', min: null, max: null, status: '' })
  const [minT, setMinT] = useState('')
  const [maxT, setMaxT] = useState('')
  const list = useMemo(() => filterRecords(rows, f), [rows, f])
  const dl = async (r: PayRecord) => { try { await downloadRecord(r, 'png'); toast('PNG downloaded') } catch (e) { toast((e as Error).message, 'error') } }
  const actions = (r: PayRecord) => (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(r)} aria-label={`Edit ${r.title} for ${r.partnerName}`}>Edit</Button>
      <Button size="sm" variant="ghost" icon={Download} onClick={() => void dl(r)} aria-label={`Download ${r.title} for ${r.partnerName}`}>PNG</Button>
    </div>
  )
  const cols: Col<PayRecord>[] = [
    { key: 'img', label: 'Image', render: (r) => <Thumb r={r} /> },
    ...(showPartner ? [{ key: 'partner', label: 'Partner', render: (r: PayRecord) => <b>{r.partnerName}</b>, sort: (r: PayRecord) => r.partnerName, text: (r: PayRecord) => r.partnerName }] : []),
    { key: 'title', label: 'Title', render: (r) => <span className="line-clamp-2">{r.title}</span>, sort: (r) => r.title, text: (r) => r.title },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{formatAmount(r.amount, r.currency)}</span>, sort: (r) => r.amount },
    { key: 'date', label: 'Date & day', render: (r) => <span className="whitespace-nowrap">{longDate(r.date)}<span className="block text-xs text-muted">{weekday(r.date)}</span></span>, sort: (r) => r.date + r.time },
    { key: 'method', label: 'Method', render: (r) => PR_METHODS.find((m) => m.id === r.method)?.label ?? '—', text: (r) => r.method ?? '' },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={tone(r.status)}>{label(r.status)}</Badge>, sort: (r) => r.status },
    { key: 'ref', label: 'Reference', render: (r) => <span className="font-mono text-xs">{r.reference || '—'}</span>, text: (r) => r.reference },
    { key: 'actions', label: 'Actions', align: 'right', render: actions },
  ]
  return (
    <div className="space-y-3">
      <div className="card grid grid-cols-2 gap-3 p-3 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Search" htmlFor="ph-q" className="col-span-2 md:col-span-3 xl:col-span-2"><Input id="ph-q" type="search" placeholder="Title, name, reference…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
        <Field label="From" htmlFor="ph-from"><Input id="ph-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To" htmlFor="ph-to"><Input id="ph-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Min amount" htmlFor="ph-min"><Input id="ph-min" inputMode="decimal" value={minT} onChange={(e) => { setMinT(e.target.value); setF({ ...f, min: parseAmount(e.target.value) }) }} /></Field>
        <Field label="Max amount" htmlFor="ph-max"><Input id="ph-max" inputMode="decimal" value={maxT} onChange={(e) => { setMaxT(e.target.value); setF({ ...f, max: parseAmount(e.target.value) }) }} /></Field>
        <Field label="Status" htmlFor="ph-status"><Select id="ph-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as PrStatus | '' })}><option value="">All</option>{PR_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
      </div>
      <p className="text-xs text-muted">{list.length} of {rows.length} records</p>
      <DataTable rows={list} cols={cols} rowKey={(r) => r.id} searchable={false} initialSort={{ key: 'date', dir: -1 }} empty="No payment records yet."
        card={(r) => (
          <div className="flex gap-3">
            <Thumb r={r} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2"><span className="line-clamp-1 font-medium">{showPartner ? `${r.partnerName} · ` : ''}{r.title}</span><Badge tone={tone(r.status)}>{label(r.status)}</Badge></div>
              <div className="font-semibold tabular-nums">{formatAmount(r.amount, r.currency)}</div>
              <div className="text-xs text-muted">{longDate(r.date)} · {weekday(r.date)}{r.reference ? ` · ${r.reference}` : ''}</div>
              {actions(r)}
            </div>
          </div>
        )} />
    </div>
  )
}
