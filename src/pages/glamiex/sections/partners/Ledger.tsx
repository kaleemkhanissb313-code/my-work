import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ImageDown, Undo2 } from 'lucide-react'
import { Badge, Button, Field, Input, Modal, Select } from '@/components/ui'
import { toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { pkr, toRupees } from '@/features/glamiex/money'
import { AttachmentField, ConfirmText, DataTable, type Col } from '@/features/glamiex/ui'
import { PAYMENT_METHODS } from '@/features/glamiex/types'
import { newDesign, setPrefill, type PayPerson } from '@/features/glamiex/payImage/model'
import { annotateTxn, reverseTxn } from '@/features/glamiex/partners/service'
import { TXN_TYPES, txnLabel, type BpPartner, type BpTxn } from '@/features/glamiex/partners/types'
import { useGx } from '../../context'
import { nowLocal } from '../shared'
import { TYPE_TONE, partiesOf, useBp } from './shared'

/** Builds a Payment Image Creator design from a ledger entry (up to 5 partners). */
export function openPaymentImage(t: BpTxn, byId: Map<string, BpPartner>, nav: (to: string) => void) {
  const person = (id: string, amount: number, note: string): PayPerson => ({
    key: crypto.randomUUID(), name: byId.get(id)?.name ?? 'Partner', photo: byId.get(id)?.photo ?? null, amount: String(toRupees(amount)),
    date: t.date, note, reference: t.txnNo, status: 'paid',
  })
  const people = t.fromId && t.toId
    ? [person(t.toId, t.amount, `Received from ${byId.get(t.fromId)?.name ?? ''}`)]
    : t.lines.filter((l) => l.amount > 0).slice(0, 5).map((l) => person(l.partnerId, l.amount, txnLabel(t.type)))
  setPrefill({ ...newDesign(t.date), title: `${txnLabel(t.type)} · ${t.txnNo}`.slice(0, 60), people })
  nav('/glamiex/payment-image/group')
}

export function TxnDetail({ t, onClose }: { t: BpTxn; onClose: () => void }) {
  const { tz } = useGx()
  const { byId, txns } = useBp()
  const nav = useNavigate()
  const [reversing, setReversing] = useState(false)
  const [desc, setDesc] = useState(t.description)
  const [ref, setRef] = useState(t.reference)
  const reversal = t.reversedBy ? txns.find((x) => x.id === t.reversedBy) : undefined
  const original = t.reverses ? txns.find((x) => x.id === t.reverses) : undefined
  const canImage = t.type !== 'correction' && (t.lines.some((l) => l.amount > 0) || (t.fromId && t.toId))
  const save = async (patch: Partial<Pick<BpTxn, 'description' | 'reference' | 'proofIds'>>) => {
    try { await annotateTxn(t.id, { description: desc, reference: ref, proofIds: t.proofIds, ...patch }); toast('Details saved') } catch (e) { toast((e as Error).message, 'error') }
  }
  const row = (k: string, v: React.ReactNode) => <><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></>
  return (
    <Modal open onClose={onClose} title={`${t.txnNo} · ${txnLabel(t.type)}`} wide footer={<>
      {canImage && <Button icon={ImageDown} onClick={() => openPaymentImage(t, byId, nav)}>Payment image</Button>}
      {t.type !== 'correction' && !t.reversedBy && <Button variant="danger" icon={Undo2} onClick={() => setReversing(true)}>Reverse entry</Button>}
      <Button onClick={onClose}>Close</Button>
    </>}>
      <div className="space-y-4">
        {t.reversedBy && <p className="rounded-xl bg-raised p-2.5 text-sm text-warn" role="status">Reversed by {reversal?.txnNo ?? 'a correction'}{reversal?.reason ? ` — ${reversal.reason}` : ''}. It no longer counts in any balance.</p>}
        {original && <p className="rounded-xl bg-raised p-2.5 text-sm" role="status">This entry cancels {original.txnNo} ({txnLabel(original.type)}). Reason: {t.reason}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {row('Amount', <b className="tabular-nums">{pkr(t.amount)}</b>)}
          {row('Date & time', `${t.date} ${t.time}`)}
          {row('Partners', partiesOf(t, byId))}
          {t.method && row('Payment method', PAYMENT_METHODS.find((m) => m.id === t.method)?.label ?? t.method)}
          {row('Business / project', t.project || 'General business')}
          {t.period && row('Period', `${t.period.start} → ${t.period.end}`)}
          {t.basis && row('Based on', `Revenue ${pkr(t.basis.revenue)} − expenses ${pkr(t.basis.expenses)} = ${pkr(t.basis.net)}`)}
          {t.allocMode && row('Split', t.allocMode === 'percent' ? 'By agreed percentages' : 'Manually agreed amounts')}
          {row('Recorded', new Date(t.createdAt).toLocaleString())}
        </dl>
        {t.lines.length > 0 && (
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="py-1">Partner</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody>{t.lines.map((l) => <tr key={l.partnerId} className="border-t border-line"><td className="py-1.5">{byId.get(l.partnerId)?.name}</td><td className="py-1.5 text-right tabular-nums">{pkr(l.amount)}</td></tr>)}</tbody></table>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Description" htmlFor="bpd-desc"><Input id="bpd-desc" value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== t.description && void save({})} /></Field>
          <Field label="Reference" htmlFor="bpd-ref"><Input id="bpd-ref" value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} onBlur={() => ref !== t.reference && void save({})} /></Field>
        </div>
        <AttachmentField ids={t.proofIds} onChange={(proofIds) => void save({ proofIds })} accept="image" label="Payment proof" tag="partner-proof" />
        <p className="text-xs text-muted">Amounts and partners can't be edited. To fix a mistake, reverse the entry and record it again — both stay in the history.</p>
      </div>
      <ConfirmText open={reversing} onClose={() => setReversing(false)} title={`Reverse ${t.txnNo}?`} label="Post reversal" danger needReason
        body={<>A correction entry cancelling {pkr(t.amount)} will be added. The original stays in the ledger, marked as reversed.</>}
        onConfirm={async (reason) => { const n = nowLocal(tz); await reverseTxn(t, reason, n.date, n.time); toast('Reversal posted'); onClose() }} />
    </Modal>
  )
}

export function TxnTable({ rows, partnerId }: { rows: BpTxn[]; partnerId?: string }) {
  const { byId } = useBp()
  const [open, setOpen] = useState<BpTxn | null>(null)
  const effect = (t: BpTxn) => {
    if (!partnerId) return null
    if (t.fromId === partnerId) return -t.amount
    if (t.toId === partnerId) return t.amount
    return t.lines.find((l) => l.partnerId === partnerId)?.amount ?? 0
  }
  const cols: Col<BpTxn>[] = [
    { key: 'date', label: 'Date', render: (t) => <span className="whitespace-nowrap tabular-nums">{t.date}</span>, sort: (t) => t.date + t.time, text: (t) => t.date },
    { key: 'no', label: 'Entry', render: (t) => <span className={cn('font-mono text-xs', t.reversedBy && 'line-through opacity-60')}>{t.txnNo}</span>, text: (t) => t.txnNo },
    { key: 'type', label: 'Type', render: (t) => <Badge tone={TYPE_TONE[t.type] ?? 'muted'}>{t.type === 'correction' ? `Reversal of ${txnLabel(t.reversesType!).toLowerCase()}` : txnLabel(t.type)}</Badge>, sort: (t) => t.type, text: (t) => txnLabel(t.type) },
    { key: 'who', label: 'Partners', render: (t) => <span className="line-clamp-1">{partiesOf(t, byId)}</span>, text: (t) => partiesOf(t, byId) },
    { key: 'desc', label: 'Description', render: (t) => <span className="line-clamp-1 text-muted">{[t.project, t.description].filter(Boolean).join(' · ')}</span>, text: (t) => `${t.project} ${t.description} ${t.reference}` },
    ...(partnerId ? [{ key: 'mine', label: 'This partner', align: 'right' as const, render: (t: BpTxn) => <span className="tabular-nums">{pkr(effect(t) ?? 0)}</span>, sort: (t: BpTxn) => effect(t) ?? 0 }] : []),
    { key: 'amount', label: 'Amount', align: 'right', render: (t) => <span className={cn('tabular-nums font-medium', t.reversedBy && 'line-through opacity-60')}>{pkr(t.amount)}</span>, sort: (t) => t.amount },
  ]
  return (
    <>
      <DataTable rows={rows} cols={cols} rowKey={(t) => t.id} onRowClick={setOpen} initialSort={{ key: 'date', dir: -1 }} empty="No entries match."
        card={(t) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5"><Badge tone={TYPE_TONE[t.type] ?? 'muted'}>{t.type === 'correction' ? 'Reversal' : txnLabel(t.type)}</Badge>{t.reversedBy && <Badge tone="warn">Reversed</Badge>}</div>
              <div className="mt-1 truncate text-sm font-medium">{partiesOf(t, byId)}</div>
              <div className="truncate text-xs text-muted">{t.date} · {t.txnNo}{t.description ? ` · ${t.description}` : ''}</div>
            </div>
            <div className={cn('text-right font-semibold tabular-nums', t.reversedBy && 'line-through opacity-60')}>{pkr(partnerId ? effect(t) ?? t.amount : t.amount)}</div>
          </div>
        )} />
      {open && <TxnDetail t={open} onClose={() => setOpen(null)} />}
    </>
  )
}

export default function Ledger() {
  const { txns, projects } = useBp()
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [project, setProject] = useState('*')
  const rows = useMemo(() => txns.filter((t) => (!type || t.type === type) && (!from || t.date >= from) && (!to || t.date <= to) && (project === '*' || t.project === project)), [txns, type, from, to, project])
  return (
    <div className="space-y-3">
      <div className="card grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
        <Field label="Type" htmlFor="lg-type"><Select id="lg-type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{TXN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
        <Field label="Project" htmlFor="lg-project"><Select id="lg-project" value={project} onChange={(e) => setProject(e.target.value)}><option value="*">All</option><option value="">General business</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
        <Field label="From" htmlFor="lg-from"><Input id="lg-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="lg-to"><Input id="lg-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted">{rows.length} of {txns.length} entries · oldest first in the books, newest first here. Entries are never deleted; reversed ones are struck through.</p>
      <TxnTable rows={rows} />
    </div>
  )
}
