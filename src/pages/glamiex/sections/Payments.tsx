import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Ban, Plus, Wallet } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui'
import { toast } from '@/components/feedback'
import { addPayment, newSubmissionId, voidPayment } from '@/features/glamiex/service'
import { orderBalance } from '@/features/glamiex/engine'
import { pkr } from '@/features/glamiex/money'
import { inRange, wallToIso, zoned } from '@/features/glamiex/time'
import { AttachmentField, ConfirmText, DataTable, ExportButtons, Money, MoneyInput, RangeBar, Section, rs, useRange, type Col } from '@/features/glamiex/ui'
import { PAYMENT_METHODS, PAYMENT_TYPES, type GxPayment, type PaymentMethod, type PaymentType } from '@/features/glamiex/types'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { ActionBar, BackLink, FormGrid, Stat, earliestDate, nowLocal } from './shared'

export default function Payments({ id }: { id?: string }) {
  if (id === 'new') return <PaymentForm />
  if (id) return <PaymentDetail id={id} />
  return <PaymentList />
}

const typeInfo = (t: PaymentType) => PAYMENT_TYPES.find((x) => x.id === t)!

function PaymentList() {
  const { data, tz, go } = useGx()
  const { state, setState, range: raw } = useRange('payments', tz, 'thisMonth')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [type, setType] = useState<PaymentType | ''>('')
  const [showVoid, setShowVoid] = useState(false)
  const people = new Map(data.people.map((p) => [p.id, p]))
  const rows = useMemo(() => data.payments.filter((p) => !p.deletedAt && (showVoid || !p.voided) && (!type || p.type === type) && inRange(zoned(p.at, tz).date, range)).map((p) => ({ p, z: zoned(p.at, tz) })), [data.payments, tz, range.from, range.to, type, showVoid]) // eslint-disable-line react-hooks/exhaustive-deps
  const sum = (types: PaymentType[]) => rows.filter((r) => !r.p.voided && types.includes(r.p.type)).reduce((a, r) => a + r.p.amount, 0)
  type R = (typeof rows)[number]
  const cols: Col<R>[] = [
    { key: 'no', label: 'Txn', render: (r) => <span className={cn('font-mono text-xs', r.p.voided && 'line-through')}>{r.p.txnNo}</span>, sort: (r) => r.p.txnNo, text: (r) => `${r.p.txnNo} ${r.p.reference} ${people.get(r.p.personId ?? '')?.name ?? ''} ${r.p.notes}` },
    { key: 'date', label: 'Date & time', render: (r) => <span className="whitespace-nowrap">{r.z.date} <span className="text-muted">{r.z.time12} · {r.z.weekday.slice(0, 3)}</span></span>, sort: (r) => r.p.at },
    { key: 'person', label: 'Person', render: (r) => people.get(r.p.personId ?? '')?.name ?? '—', sort: (r) => people.get(r.p.personId ?? '')?.name ?? '' },
    { key: 'type', label: 'Type', render: (r) => <TypeBadge t={r.p.type} />, sort: (r) => r.p.type },
    { key: 'method', label: 'Method', render: (r) => PAYMENT_METHODS.find((m) => m.id === r.p.method)?.label, sort: (r) => r.p.method },
    { key: 'ref', label: 'Reference', render: (r) => r.p.reference || '—' },
    { key: 'amt', label: 'Amount', align: 'right', render: (r) => <span className={cn(r.p.voided && 'line-through opacity-60', typeInfo(r.p.type).dir === 'in' ? 'text-ok' : typeInfo(r.p.type).dir === 'out' ? 'text-danger' : '')}>{typeInfo(r.p.type).dir === 'out' ? '−' : typeInfo(r.p.type).dir === 'in' ? '+' : ''}{pkr(r.p.amount)}</span>, sort: (r) => r.p.amount },
  ]
  return (
    <div>
      <RangeBar state={state} setState={setState} range={range} extra={<Button variant="primary" icon={Plus} onClick={() => go('payments/new')}>Record payment</Button>} />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Customer payments" tone="ok"><Money v={sum(['customer_payment'])} /></Stat>
        <Stat label="Customer deposits (credit)" tone="ok"><Money v={sum(['customer_deposit'])} /></Stat>
        <Stat label="Owner / loan financing"><Money v={sum(['owner_contribution', 'loan_in'])} /></Stat>
        <Stat label="Paid out (payouts, drawings, refunds)" tone="danger"><Money v={sum(['payout', 'owner_drawing', 'refund_paid'])} /></Stat>
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.p.id} onRowClick={(r) => go(`payments/${r.p.id}`)} initialSort={{ key: 'date', dir: -1 }} empty="No payments in this period."
        toolbar={<>
          <Select aria-label="Type" className="w-auto max-w-[14rem]" value={type} onChange={(e) => setType(e.target.value as PaymentType | '')}><option value="">All types</option>{PAYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} />Show voided</label>
          <ExportButtons name="Person deposit report" period={`${range.from} to ${range.to}`} sheets={() => [{ name: 'Payments', rows: [['Txn', 'Date', 'Time', 'Day', 'Person', 'Type', 'Direction', 'Method', 'Reference', 'Amount (Rs)', 'Allocated to orders (Rs)', 'Voided'], ...rows.map((r) => [r.p.txnNo, r.z.date, r.z.time, r.z.weekday, people.get(r.p.personId ?? '')?.name ?? '', typeInfo(r.p.type).label, typeInfo(r.p.type).dir, r.p.method, r.p.reference, rs(r.p.amount), rs(r.p.allocations.reduce((a, x) => a + x.amount, 0)), r.p.voided ? 'yes' : ''])] }]} />
        </>}
        card={(r) => <div className={cn(r.p.voided && 'opacity-60')}>
          <div className="flex items-start justify-between gap-2"><span className="font-mono text-xs text-muted">{r.p.txnNo}</span><TypeBadge t={r.p.type} /></div>
          <div className="mt-1 flex items-end justify-between gap-2"><div className="text-sm">{people.get(r.p.personId ?? '')?.name ?? '—'}<div className="text-xs text-muted">{r.z.date} {r.z.time12}{r.p.voided && ' · VOID'}</div></div>
            <b className={cn('text-base', typeInfo(r.p.type).dir === 'in' ? 'text-ok' : typeInfo(r.p.type).dir === 'out' ? 'text-danger' : '')}>{pkr(r.p.amount)}</b></div>
        </div>} />
    </div>
  )
}

function TypeBadge({ t }: { t: PaymentType }) {
  const i = typeInfo(t)
  return <Badge tone={t === 'owner_contribution' || t === 'loan_in' || t === 'owner_drawing' ? 'secure' : i.dir === 'in' ? 'ok' : i.dir === 'out' ? 'danger' : 'muted'}>{i.label}</Badge>
}

function PaymentForm() {
  const { data, tz, go } = useGx()
  const [params] = useSearchParams()
  const [sub] = useState(newSubmissionId)
  const n = nowLocal(tz)
  const initialPerson = params.get('person') ?? ''
  const people = live(data.people)
  const [personId, setPersonId] = useState(initialPerson)
  const person = people.find((p) => p.id === personId)
  const defaultType: PaymentType = !person ? 'customer_payment' : person.type === 'owner' || person.type === 'partner' ? 'owner_contribution' : person.type === 'customer' ? 'customer_payment' : 'payout'
  const [type, setType] = useState<PaymentType>(defaultType)
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(n.date)
  const [time, setTime] = useState(n.time)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [alloc, setAlloc] = useState<Record<string, number | null>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canAllocate = type === 'customer_payment' || type === 'customer_deposit'
  const openOrders = useMemo(() => live(data.orders).filter((o) => o.status !== 'cancelled' && (personId ? o.personId === personId : !o.personId)).map((o) => ({ o, b: orderBalance(o, data.payments, data.refunds) })).filter((x) => x.b.balance > 0).sort((a, b) => a.o.at.localeCompare(b.o.at)), [data, personId])
  const allocated = Object.values(alloc).reduce<number>((a, v) => a + (v ?? 0), 0)
  const autoAllocate = () => {
    let left = amount ?? 0
    const next: Record<string, number | null> = {}
    for (const x of openOrders) { if (left <= 0) break; const a = Math.min(left, x.b.balance); next[x.o.id] = a; left -= a }
    setAlloc(next)
  }
  const day = date ? zoned(wallToIso(date, time || '00:00', tz), tz).weekday : ''

  const save = async () => {
    setErr(null)
    if (!amount || amount <= 0) return setErr('Enter an amount greater than 0.')
    if (!date) return setErr('Choose a date.')
    if (canAllocate && allocated > amount) return setErr('Allocations exceed the amount.')
    if ((type === 'owner_contribution' || type === 'owner_drawing') && person && person.type !== 'owner' && person.type !== 'partner') return setErr('Owner contributions and drawings must be linked to an owner or partner.')
    setBusy(true)
    try {
      const r = await addPayment({ id: sub, personId: personId || null, type, amount, method, at: wallToIso(date, time || '00:00', tz), reference, notes, attachmentIds: attachments,
        allocations: canAllocate ? Object.entries(alloc).filter(([, v]) => v && v > 0).map(([orderId, v]) => ({ orderId, amount: v! })) : [] })
      toast(r.duplicate ? `Already saved as ${r.payment.txnNo}` : `${r.payment.txnNo} saved`, r.duplicate ? 'info' : 'success')
      go(personId ? `people/${personId}` : 'payments')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div>
      <BackLink to={initialPerson ? `/glamiex/people/${initialPerson}` : '/glamiex/payments'} label="Back" />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
        <Section title="Payment or deposit" icon={Wallet}>
          <FormGrid>
            <Field label="Person" htmlFor="pf-person"><Select id="pf-person" value={personId} onChange={(e) => { setPersonId(e.target.value); setAlloc({}) }}><option value="">— None / walk-in —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}</Select></Field>
            <Field label="Transaction type" htmlFor="pf-type" hint={typeInfo(type).hint}><Select id="pf-type" value={type} onChange={(e) => setType(e.target.value as PaymentType)}>{PAYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
            <Field label="Amount (PKR)" htmlFor="pf-amt"><MoneyInput id="pf-amt" value={amount} onChange={setAmount} /></Field>
            <Field label="Date" htmlFor="pf-date" hint={day}><Input id="pf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Time" htmlFor="pf-time" hint={tz}><Input id="pf-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Method" htmlFor="pf-method"><Select id="pf-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
            <Field label="Reference number" htmlFor="pf-ref"><Input id="pf-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank / wallet transaction ID" /></Field>
            <Field label="Notes" htmlFor="pf-notes" className="sm:col-span-2"><Textarea id="pf-notes" className="min-h-[44px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </FormGrid>
          <div className="mt-4"><AttachmentField label="Receipt / screenshot" ids={attachments} onChange={setAttachments} tag="payment-receipt" /></div>
        </Section>
        {canAllocate && (
          <Section title="Apply to orders" icon={Wallet} actions={openOrders.length > 0 && <Button size="sm" onClick={autoAllocate} disabled={!amount}>Auto (oldest first)</Button>}>
            {!openOrders.length ? <p className="text-sm text-muted">{personId ? 'This person has no unpaid orders.' : 'No unpaid walk-in orders.'} The full amount is kept as {type === 'customer_deposit' ? 'a deposit' : 'customer credit'}.</p> : (
              <ul className="space-y-2">{openOrders.map((x) => (
                <li key={x.o.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 text-sm">
                  <Link to={`/glamiex/sales/${x.o.id}`} className="font-mono text-xs hover:text-accent">{x.o.orderNo}</Link>
                  <span className="flex-1 text-xs text-muted">{zoned(x.o.at, tz).date} · due {pkr(x.b.balance)}</span>
                  <div className="w-40"><MoneyInput value={alloc[x.o.id] ?? null} onChange={(v) => setAlloc({ ...alloc, [x.o.id]: v != null ? Math.min(v, x.b.balance) : null })} aria-invalid={false} /></div>
                </li>
              ))}</ul>
            )}
            <p className={cn('mt-2 text-xs', allocated > (amount ?? 0) ? 'text-danger' : 'text-muted')}>Allocated {pkr(allocated)} of {pkr(amount ?? 0)} · unallocated {pkr(Math.max(0, (amount ?? 0) - allocated))} stays as customer credit.</p>
          </Section>
        )}
        {err && <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{err}</p>}
        <ActionBar><Button onClick={() => go('payments')}>Cancel</Button><Button type="submit" variant="primary" size="lg" loading={busy}>Save {typeInfo(type).dir === 'out' ? 'payout' : 'payment'}</Button></ActionBar>
      </form>
    </div>
  )
}

function PaymentDetail({ id }: { id: string }) {
  const { data, tz } = useGx()
  const [voiding, setVoiding] = useState(false)
  const p = data.payments.find((x) => x.id === id) as GxPayment | undefined
  if (!p) return <div><BackLink to="/glamiex/payments" label="Payments" /><EmptyState icon={Wallet} title="Payment not found" /></div>
  const z = zoned(p.at, tz)
  const person = data.people.find((x) => x.id === p.personId)
  const t = typeInfo(p.type)
  return (
    <div className="space-y-4">
      <BackLink to="/glamiex/payments" label="Payments" />
      <div className="card flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className={cn('font-mono text-lg font-bold', p.voided && 'line-through')}>{p.txnNo}</h2><TypeBadge t={p.type} />{p.voided && <Badge tone="danger">VOID</Badge>}</div>
          <p className="text-sm text-muted">{z.weekday}, {z.date} at {z.time12} · {PAYMENT_METHODS.find((m) => m.id === p.method)?.label}{p.reference && ` · ref ${p.reference}`}</p>
          {person && <Link to={`/glamiex/people/${person.id}`} className="text-sm text-accent">{person.name}</Link>}
        </div>
        <div className={cn('text-2xl font-bold tabular-nums', t.dir === 'in' ? 'text-ok' : t.dir === 'out' ? 'text-danger' : '')}>{pkr(p.amount)}</div>
        {!p.voided && <Button variant="ghost" icon={Ban} onClick={() => setVoiding(true)}>Void</Button>}
      </div>
      <p className="text-sm text-muted">{t.hint}.</p>
      {p.allocations.length > 0 && <Section title="Applied to orders" icon={Wallet}><ul className="divide-y divide-line/60">{p.allocations.map((a) => { const o = data.orders.find((x) => x.id === a.orderId); return <li key={a.orderId}><Link to={`/glamiex/sales/${a.orderId}`} className="flex min-h-[44px] items-center justify-between py-2 text-sm hover:text-accent"><span className="font-mono text-xs">{o?.orderNo ?? a.orderId}</span><Money v={a.amount} /></Link></li> })}</ul></Section>}
      {p.notes && <Section title="Notes" icon={Wallet}><p className="whitespace-pre-wrap text-sm">{p.notes}</p></Section>}
      {p.attachmentIds.length > 0 && <Section title="Receipt" icon={Wallet}><AttachmentField label="" ids={p.attachmentIds} onChange={() => toast('Posted payments are read-only; void and re-enter to change.', 'info')} tag="payment-receipt" /></Section>}
      <ConfirmText open={voiding} danger needReason title={`Void ${p.txnNo}?`} label="Void payment" onClose={() => setVoiding(false)}
        body={`The payment stays in the records (marked VOID) for the audit trail but no longer counts in balances, cash or reports. Order allocations are released. This cannot be undone — re-enter the payment if it was voided by mistake.`}
        onConfirm={async (reason) => { await voidPayment(id, reason); toast('Payment voided') }} />
    </div>
  )
}
