import { useEffect, useMemo, useState } from 'react'
import { Ban, FileBarChart, HandCoins, History, Pencil, Plus, Printer, Trash2, UserPlus, Users } from 'lucide-react'
import { Badge, Button, Field, IconButton, Input, Modal, Select, Tabs, Textarea } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { addNpPayment, saveNpPerson, seedNamesPayments, trashNpPerson, updateNpPayment, voidNpPayment } from '@/features/glamiex/logisticsService'
import { npBalance, npTotals } from '@/features/glamiex/logistics'
import { pkr } from '@/features/glamiex/money'
import { bucketOf, inRange, wallToIso, zoned } from '@/features/glamiex/time'
import { ConfirmText, DataTable, ExportButtons, KpiCard, Money, MoneyInput, RangeBar, Section, rs, useRange, type Col } from '@/features/glamiex/ui'
import { PAYMENT_METHODS, type NpPayment, type NpPerson, type PaymentMethod } from '@/features/glamiex/types'
import { newSubmissionId } from '@/features/glamiex/service'
import { printHtml } from '@/lib/markdown'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { nowLocal } from './shared'
import { escapeHtml } from '@/lib/html'

type Tab = 'people' | 'history' | 'reports'
const methodLabel = (m: PaymentMethod) => PAYMENT_METHODS.find((x) => x.id === m)?.label ?? m

export function printReceipt(p: NpPayment, person: NpPerson | undefined, tz: string, balanceAfter: { paid: number; remaining: number }) {
  const z = zoned(p.at, tz)
  printHtml(`Receipt ${p.receiptNo}`, `
    <h1>Payment receipt</h1>
    <p><b>Receipt no.</b> ${escapeHtml(p.receiptNo)}${p.voided ? ' — <b style="color:#b91c1c">VOID</b>' : ''}</p>
    <table>
      <tr><th style="text-align:left">Received from</th><td>${escapeHtml(person?.name ?? '—')}</td></tr>
      <tr><th style="text-align:left">Amount</th><td><b>${escapeHtml(pkr(p.amount))}</b></td></tr>
      <tr><th style="text-align:left">Date & time</th><td>${escapeHtml(`${z.weekday}, ${z.date} ${z.time}`)} (${escapeHtml(tz)})</td></tr>
      <tr><th style="text-align:left">Payment method</th><td>${escapeHtml(methodLabel(p.method))}</td></tr>
      <tr><th style="text-align:left">Transaction reference</th><td>${escapeHtml(p.reference || '—')}</td></tr>
      ${p.linkedRef ? `<tr><th style="text-align:left">Linked transaction</th><td>${escapeHtml(p.linkedRef)}</td></tr>` : ''}
      <tr><th style="text-align:left">Total payment amount</th><td>${escapeHtml(pkr(person?.obligation ?? 0))}</td></tr>
      <tr><th style="text-align:left">Paid to date</th><td>${escapeHtml(pkr(balanceAfter.paid))}</td></tr>
      <tr><th style="text-align:left">Remaining balance</th><td>${escapeHtml(pkr(balanceAfter.remaining))}</td></tr>
    </table>
    ${p.notes ? `<p>${escapeHtml(p.notes)}</p>` : ''}
    <p style="margin-top:2em;color:#666">GLAMIEX · Names & Payments · generated ${escapeHtml(new Date().toLocaleString())}</p>`)
}

export default function NamesPayments() {
  const { data, tz } = useGx()
  const [tab, setTab] = useState<Tab>('people')
  const [editPerson, setEditPerson] = useState<NpPerson | 'new' | null>(null)
  const [paying, setPaying] = useState<string | null | 'pick'>(null)
  useEffect(() => { void seedNamesPayments().then((created) => { if (created) toast('Names & Payments set up with the five initial people', 'success') }).catch((e) => toast((e as Error).message, 'error')) }, [])

  const t = useMemo(() => npTotals(data.npPeople, data.npPayments), [data.npPeople, data.npPayments])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted">Payment obligations per person, kept separate from product sales and rider payments. A payment counts as received only when it is recorded here.</p>
        <Button icon={UserPlus} onClick={() => setEditPerson('new')}>Add name</Button>
        <Button variant="primary" icon={HandCoins} onClick={() => setPaying('pick')}>Record payment</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Total payment obligations" value={t.obligations} sub={`${t.rows.length} people`} />
        <KpiCard label="Total payments received" value={t.received} tone="ok" />
        <KpiCard label="Remaining pending balance" value={t.remaining} tone={t.remaining > 0 ? 'warn' : undefined} />
        <KpiCard label="Paid people" value={t.paidPeople} kind="count" tone="ok" />
        <KpiCard label="Pending people" value={t.pendingPeople} kind="count" tone={t.pendingPeople ? 'warn' : undefined} sub={t.partialPeople ? `${t.partialPeople} partly paid` : 'not fully paid'} />
      </div>
      <Tabs label="Names & Payments views" value={tab} onChange={setTab} tabs={[{ id: 'people', label: 'Names', icon: Users }, { id: 'history', label: 'Transaction history', icon: History }, { id: 'reports', label: 'Daily / monthly reports', icon: FileBarChart }]} />
      {tab === 'people' && <PeopleTab rows={t.rows} onEdit={setEditPerson} onPay={setPaying} />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'reports' && <ReportsTab />}
      {editPerson && <PersonForm person={editPerson === 'new' ? null : editPerson} onClose={() => setEditPerson(null)} />}
      {paying && <PaymentForm personId={paying === 'pick' ? null : paying} onClose={() => setPaying(null)} />}
      <p className="text-xs text-muted">Time zone: {tz}. Statuses: <b>Paid</b> = recorded payments cover the full amount · <b>Partly paid</b> · <b>Pending</b> = nothing recorded yet.</p>
    </div>
  )
}

type Row = ReturnType<typeof npTotals>['rows'][number]
function StatusBadge({ s }: { s: Row['status'] }) {
  return <Badge tone={s === 'paid' ? 'ok' : s === 'partial' ? 'warn' : 'danger'}>{s === 'paid' ? 'Paid' : s === 'partial' ? 'Partly paid' : 'Pending'}</Badge>
}

function PeopleTab({ rows, onEdit, onPay }: { rows: Row[]; onEdit: (p: NpPerson) => void; onPay: (id: string) => void }) {
  const { tz } = useGx()
  const [status, setStatus] = useState<'' | Row['status']>('')
  const list = rows.filter((r) => !status || r.status === status)
  const cols: Col<Row>[] = [
    { key: 'name', label: 'Name', render: (r) => <div><div className="font-medium">{r.person.name}</div>{r.person.phone && <div className="text-xs text-muted">{r.person.phone}</div>}</div>, sort: (r) => r.person.name, text: (r) => `${r.person.name} ${r.person.phone} ${r.person.notes}` },
    { key: 'ob', label: 'Payment amount', align: 'right', render: (r) => <Money v={r.person.obligation} />, sort: (r) => r.person.obligation },
    { key: 'paid', label: 'Paid', align: 'right', render: (r) => <span className="text-ok"><Money v={r.paid} /></span>, sort: (r) => r.paid },
    { key: 'rem', label: 'Remaining', align: 'right', render: (r) => <b className={r.remaining ? 'text-warn' : ''}><Money v={r.remaining} /></b>, sort: (r) => r.remaining },
    { key: 'st', label: 'Status', render: (r) => <StatusBadge s={r.status} />, sort: (r) => r.status },
    { key: 'last', label: 'Last payment', render: (r) => r.last ? <span className="whitespace-nowrap text-xs">{zoned(r.last.at, tz).date} · {pkr(r.last.amount)}</span> : <span className="text-xs text-muted">—</span>, sort: (r) => r.last?.at ?? '' },
    { key: 'act', label: '', render: (r) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {r.remaining > 0 && <Button size="sm" icon={HandCoins} onClick={() => onPay(r.person.id)}>Pay</Button>}
      <IconButton icon={Pencil} label={`Edit ${r.person.name}`} onClick={() => onEdit(r.person)} />
      <IconButton icon={Trash2} label={`Delete ${r.person.name}`} onClick={async () => {
        if (!(await confirm({ title: `Delete ${r.person.name}?`, body: 'The name moves to Trash. People with recorded payments cannot be deleted.', danger: true, confirmLabel: 'Delete' }))) return
        try { await trashNpPerson(r.person.id); toast('Moved to trash') } catch (e) { toast((e as Error).message, 'error') }
      }} />
    </div> },
  ]
  return (
    <DataTable rows={list} cols={cols} rowKey={(r) => r.person.id} onRowClick={(r) => onEdit(r.person)} initialSort={{ key: 'name', dir: 1 }} empty="No names yet."
      toolbar={<>
        <Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="">All statuses</option><option value="paid">Paid</option><option value="partial">Partly paid</option><option value="pending">Pending</option></Select>
        <ExportButtons name="Names and payments" period="As of today" sheets={() => [{ name: 'Names', rows: [['Name', 'Phone', 'Payment amount (Rs)', 'Paid (Rs)', 'Remaining (Rs)', 'Status', 'Payments'], ...list.map((r) => [r.person.name, r.person.phone, rs(r.person.obligation), rs(r.paid), rs(r.remaining), r.status, r.count]),
          ['Total', '', rs(list.reduce((a, r) => a + r.person.obligation, 0)), rs(list.reduce((a, r) => a + r.paid, 0)), rs(list.reduce((a, r) => a + r.remaining, 0)), '', list.reduce((a, r) => a + r.count, 0)]] }]} />
      </>}
      card={(r) => <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.person.name}</div><div className="text-xs text-muted">Paid {pkr(r.paid)} of {pkr(r.person.obligation)}</div></div>
        <div className="text-end"><StatusBadge s={r.status} />{r.remaining > 0 && <div className="mt-1 text-sm font-semibold text-warn">{pkr(r.remaining)} due</div>}</div>
      </div>} />
  )
}

function HistoryTab() {
  const { data, tz } = useGx()
  const { state, setState, range } = useRange('np-history', tz, 'all')
  const [showVoid, setShowVoid] = useState(false)
  const [editing, setEditing] = useState<NpPayment | null>(null)
  const [voiding, setVoiding] = useState<NpPayment | null>(null)
  const people = new Map(data.npPeople.map((p) => [p.id, p]))
  const rows = useMemo(() => data.npPayments.filter((p) => !p.deletedAt && (showVoid || !p.voided) && (state.preset === 'all' || inRange(zoned(p.at, tz).date, range))), [data.npPayments, showVoid, state.preset, range.from, range.to, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const receipt = (p: NpPayment) => { const person = people.get(p.personId); printReceipt(p, person, tz, person ? npBalance(person, data.npPayments) : { paid: 0, remaining: 0 }) }
  const cols: Col<NpPayment>[] = [
    { key: 'no', label: 'Receipt', render: (p) => <span className={cn('font-mono text-xs', p.voided && 'line-through')}>{p.receiptNo}</span>, sort: (p) => p.receiptNo, text: (p) => `${p.receiptNo} ${people.get(p.personId)?.name ?? ''} ${p.reference} ${p.notes} ${p.linkedRef}` },
    { key: 'date', label: 'Date & time', render: (p) => { const z = zoned(p.at, tz); return <span className="whitespace-nowrap">{z.date} <span className="text-muted">{z.time}</span></span> }, sort: (p) => p.at },
    { key: 'person', label: 'Name', render: (p) => people.get(p.personId)?.name ?? '—', sort: (p) => people.get(p.personId)?.name ?? '' },
    { key: 'method', label: 'Method', render: (p) => methodLabel(p.method), sort: (p) => p.method },
    { key: 'ref', label: 'Reference', render: (p) => <div>{p.reference || '—'}{p.linkedRef && <div className="text-xs text-muted">Linked: {p.linkedRef}</div>}</div> },
    { key: 'amt', label: 'Amount', align: 'right', render: (p) => <b className={cn('text-ok', p.voided && 'line-through opacity-60')}>{pkr(p.amount)}</b>, sort: (p) => p.amount },
    { key: 'act', label: '', render: (p) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <IconButton icon={Printer} label={`Print receipt ${p.receiptNo}`} onClick={() => receipt(p)} />
      {!p.voided && <IconButton icon={Pencil} label={`Edit ${p.receiptNo}`} onClick={() => setEditing(p)} />}
      {!p.voided && <IconButton icon={Ban} label={`Void ${p.receiptNo}`} onClick={() => setVoiding(p)} />}
    </div> },
  ]
  return (
    <div>
      <RangeBar state={state} setState={setState} range={range} />
      <DataTable rows={rows} cols={cols} rowKey={(p) => p.id} onRowClick={(p) => !p.voided && setEditing(p)} initialSort={{ key: 'date', dir: -1 }} empty="No payments recorded yet."
        toolbar={<>
          <label className="flex min-h-[44px] items-center gap-2 text-xs"><input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} />Show voided</label>
          <ExportButtons name="Names and payments transactions" period={state.preset === 'all' ? 'All time' : `${range.from} to ${range.to}`} sheets={() => [{ name: 'Transactions', rows: [['Receipt', 'Date', 'Time', 'Name', 'Method', 'Reference', 'Linked transaction', 'Amount (Rs)', 'Voided', 'Notes'],
            ...rows.map((p) => { const z = zoned(p.at, tz); return [p.receiptNo, z.date, z.time, people.get(p.personId)?.name ?? '', methodLabel(p.method), p.reference, p.linkedRef, p.voided ? 0 : rs(p.amount), p.voided ? 'VOID' : '', p.notes] })] }]} />
        </>}
        card={(p) => <div className={cn('flex items-center gap-3', p.voided && 'opacity-60')}>
          <div className="min-w-0 flex-1"><div className="truncate font-medium">{people.get(p.personId)?.name ?? '—'}</div><div className="text-xs text-muted">{p.receiptNo} · {zoned(p.at, tz).date} · {methodLabel(p.method)}{p.voided && ' · VOID'}</div></div>
          <b className="text-ok">{pkr(p.amount)}</b>
          <span onClick={(e) => e.stopPropagation()}><IconButton icon={Printer} label="Print receipt" onClick={() => receipt(p)} /></span>
        </div>} />
      {editing && <EditPayment p={editing} onClose={() => setEditing(null)} />}
      <ConfirmText open={!!voiding} danger needReason title={`Void ${voiding?.receiptNo}?`} label="Void payment" onClose={() => setVoiding(null)}
        body="The payment stays in the history (marked VOID) but no longer counts as received. Re-enter it if it was voided by mistake."
        onConfirm={async (reason) => { await voidNpPayment(voiding!.id, reason); toast('Payment voided') }} />
    </div>
  )
}

function ReportsTab() {
  const { data, tz } = useGx()
  const { state, setState, range } = useRange('np-reports', tz, 'thisYear')
  const [g, setG] = useState<'day' | 'month'>('month')
  const people = new Map(data.npPeople.map((p) => [p.id, p.name]))
  const rows = useMemo(() => {
    const m = new Map<string, { label: string; count: number; amount: number; names: Set<string> }>()
    for (const p of data.npPayments) {
      if (p.voided || p.deletedAt) continue
      const date = zoned(p.at, tz).date
      if (!inRange(date, range)) continue
      const b = bucketOf(date, g)
      const x = m.get(b.key) ?? { label: b.label, count: 0, amount: 0, names: new Set<string>() }
      x.count++; x.amount += p.amount; x.names.add(people.get(p.personId) ?? '—')
      m.set(b.key, x)
    }
    return [...m].sort((a, b) => b[0].localeCompare(a[0])).map(([key, v]) => ({ key, ...v }))
  }, [data.npPayments, range.from, range.to, g, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = rows.reduce((a, r) => a + r.amount, 0)
  return (
    <Section title={`${g === 'day' ? 'Daily' : 'Monthly'} payments received`} icon={FileBarChart} actions={<ExportButtons name={`Names and payments ${g === 'day' ? 'daily' : 'monthly'} report`} period={`${range.from} to ${range.to}`}
      sheets={() => [{ name: 'Report', rows: [['Period', 'Payments', 'Amount received (Rs)', 'Names'], ...rows.map((r) => [r.label, r.count, rs(r.amount), [...r.names].join(', ')]), ['Total', rows.reduce((a, r) => a + r.count, 0), rs(total), '']] }]} />}>
      <RangeBar state={state} setState={setState} range={range} extra={<Select aria-label="Group by" className="w-auto" value={g} onChange={(e) => setG(e.target.value as 'day' | 'month')}><option value="day">Daily</option><option value="month">Monthly</option></Select>} />
      {!rows.length ? <p className="text-sm text-muted">No payments in this period.</p> : (
        <ul className="divide-y divide-line/60">
          {rows.map((r) => <li key={r.key} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="w-32 font-medium">{r.label}</span><span className="min-w-0 flex-1 truncate text-xs text-muted">{r.count} payment{r.count === 1 ? '' : 's'} · {[...r.names].join(', ')}</span><b className="text-ok"><Money v={r.amount} /></b></li>)}
          <li className="flex items-center justify-between py-2 text-sm font-semibold"><span>Total</span><Money v={total} /></li>
        </ul>
      )}
    </Section>
  )
}

function PersonForm({ person, onClose }: { person: NpPerson | null; onClose: () => void }) {
  const { data, tz } = useGx()
  const [f, setF] = useState({ name: person?.name ?? '', phone: person?.phone ?? '', obligation: person?.obligation ?? 5_000_000 as number | null, notes: person?.notes ?? '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const bal = person ? npBalance(person, data.npPayments) : null
  const history = person ? data.npPayments.filter((p) => p.personId === person.id && !p.deletedAt).sort((a, b) => b.at.localeCompare(a.at)) : []
  const save = async () => {
    setErr(null)
    if (f.obligation == null) return setErr('Enter the payment amount (0 if none).')
    setBusy(true)
    try { await saveNpPerson({ ...f, obligation: f.obligation }, person?.id ?? null); toast('Saved'); onClose() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={person ? `Edit ${person.name}` : 'Add name'} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="np-n"><Input id="np-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!person} /></Field>
        <Field label="Phone" htmlFor="np-p"><Input id="np-p" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Payment amount (PKR)" htmlFor="np-o" hint="What this person is expected to pay in total"><MoneyInput id="np-o" value={f.obligation} onChange={(v) => setF({ ...f, obligation: v })} /></Field>
        <Field label="Notes" htmlFor="np-x"><Textarea id="np-x" className="min-h-[44px]" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
      {bal && <div className="mt-4">
        <div className="mb-2 flex flex-wrap gap-3 text-sm"><span>Paid <b className="text-ok">{pkr(bal.paid)}</b></span><span>Remaining <b className="text-warn">{pkr(bal.remaining)}</b></span><StatusBadge s={bal.status} /></div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Payment history</h3>
        {!history.length ? <p className="text-sm text-muted">No payments recorded.</p> : <ul className="divide-y divide-line/60 text-sm">{history.map((p) => (
          <li key={p.id} className={cn('flex items-center gap-2 py-1.5', p.voided && 'opacity-60')}><span className="font-mono text-xs">{p.receiptNo}</span><span className="flex-1 text-xs text-muted">{zoned(p.at, tz).date} · {methodLabel(p.method)}{p.reference && ` · ${p.reference}`}{p.voided && ' · VOID'}</span><b className={cn(p.voided && 'line-through')}>{pkr(p.amount)}</b>
            <IconButton icon={Printer} label="Print receipt" onClick={() => printReceipt(p, person!, tz, bal)} /></li>
        ))}</ul>}
      </div>}
    </Modal>
  )
}

function PaymentForm({ personId: initial, onClose }: { personId: string | null; onClose: () => void }) {
  const { data, tz } = useGx()
  const [sub] = useState(newSubmissionId)
  const people = live(data.npPeople).sort((a, b) => a.name.localeCompare(b.name))
  const [personId, setPersonId] = useState(initial ?? people.find((p) => npBalance(p, data.npPayments).remaining > 0)?.id ?? '')
  const person = people.find((p) => p.id === personId)
  const bal = person ? npBalance(person, data.npPayments) : null
  const n = nowLocal(tz)
  const [amount, setAmount] = useState<number | null>(bal?.remaining || null)
  const [date, setDate] = useState(n.date)
  const [time, setTime] = useState(n.time)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [linkedRef, setLinkedRef] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const txns = useMemo(() => data.payments.filter((p) => !p.voided && !p.deletedAt).map((p) => p.txnNo), [data.payments])
  const save = async () => {
    setErr(null)
    if (!person) return setErr('Choose a name.')
    if (!amount || amount <= 0) return setErr('Enter an amount greater than 0.')
    if (!date) return setErr('Choose the payment date.')
    if (linkedRef && !txns.includes(linkedRef)) return setErr('The linked transaction number was not found. Leave it empty to keep this payment independent.')
    setBusy(true)
    try {
      const r = await addNpPayment({ id: sub, personId: person.id, amount, at: wallToIso(date, time || '00:00', tz), method, reference, notes, linkedRef })
      toast(r.duplicate ? `Already saved as ${r.payment.receiptNo}` : `${r.payment.receiptNo} saved for ${person.name}`, r.duplicate ? 'info' : 'success', { label: 'Print receipt', run: () => printReceipt(r.payment, person, tz, npBalance(person, [...data.npPayments, r.payment])) })
      onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title="Record payment" wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save payment</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name" htmlFor="npp-p"><Select id="npp-p" value={personId} onChange={(e) => { setPersonId(e.target.value); const p = people.find((x) => x.id === e.target.value); setAmount(p ? npBalance(p, data.npPayments).remaining || null : null) }}>
          <option value="">Choose…</option>{people.map((p) => { const b = npBalance(p, data.npPayments); return <option key={p.id} value={p.id}>{p.name} — {b.remaining ? `${pkr(b.remaining)} due` : 'paid'}</option> })}</Select></Field>
        <Field label="Amount (PKR)" htmlFor="npp-a" hint={bal ? `Remaining ${pkr(bal.remaining)} — partial payments are fine` : undefined}><MoneyInput id="npp-a" value={amount} onChange={setAmount} /></Field>
        <Field label="Payment method" htmlFor="npp-m"><Select id="npp-m" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        <Field label="Date" htmlFor="npp-d"><Input id="npp-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Time" htmlFor="npp-t" hint={tz}><Input id="npp-t" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Transaction reference" htmlFor="npp-r"><Input id="npp-r" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank / wallet transaction ID" /></Field>
        <Field label="Link to GLAMIEX transaction (optional)" htmlFor="npp-l" hint="Only if this money is also a sales/rider transaction"><Input id="npp-l" list="npp-txns" value={linkedRef} onChange={(e) => setLinkedRef(e.target.value)} placeholder="e.g. RCV-00012" /><datalist id="npp-txns">{txns.slice(-200).map((t) => <option key={t} value={t} />)}</datalist></Field>
        <Field label="Notes" htmlFor="npp-n" className="sm:col-span-2"><Textarea id="npp-n" className="min-h-[44px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {!people.length && <p className="mt-2 text-sm text-muted"><Plus className="inline h-3 w-3" /> Add a name first.</p>}
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </Modal>
  )
}

function EditPayment({ p, onClose }: { p: NpPayment; onClose: () => void }) {
  const { tz } = useGx()
  const z = zoned(p.at, tz)
  const [f, setF] = useState({ date: z.date, time: z.time, method: p.method, reference: p.reference, notes: p.notes, linkedRef: p.linkedRef })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await updateNpPayment(p.id, { at: wallToIso(f.date, f.time || '00:00', tz), method: f.method, reference: f.reference.trim(), notes: f.notes, linkedRef: f.linkedRef.trim() }); toast('Saved (recorded in the audit trail)'); onClose() }
    catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Edit ${p.receiptNo}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <p className="mb-3 text-sm text-muted">Amount <b>{pkr(p.amount)}</b> is locked — void this payment and record it again to change the amount.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" htmlFor="ep-d"><Input id="ep-d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Time" htmlFor="ep-t"><Input id="ep-t" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        <Field label="Method" htmlFor="ep-m"><Select id="ep-m" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        <Field label="Reference" htmlFor="ep-r"><Input id="ep-r" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Linked transaction" htmlFor="ep-l"><Input id="ep-l" value={f.linkedRef} onChange={(e) => setF({ ...f, linkedRef: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="ep-n"><Textarea id="ep-n" className="min-h-[44px]" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
