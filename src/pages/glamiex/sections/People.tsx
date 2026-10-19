import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2, User, Users, Wallet } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { safeWrite, toast } from '@/components/feedback'
import { gxAudit, gxPeopleRepo, saveRecord } from '@/features/glamiex/service'
import { orderBalance, personBalance } from '@/features/glamiex/engine'
import { pkr } from '@/features/glamiex/money'
import { zoned } from '@/features/glamiex/time'
import { AttachmentField, ConfirmText, DataTable, ExportButtons, Money, MoneyInput, PayBadge, Section, rs, type Col } from '@/features/glamiex/ui'
import { PAYMENT_TYPES, PERSON_TYPES, type GxPerson, type PersonType } from '@/features/glamiex/types'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { BackLink, Stat } from './shared'

export default function People({ id }: { id?: string }) {
  if (id && id !== 'new') return <PersonDetail id={id} />
  return <PeopleList openNew={id === 'new'} />
}

const typeLabel = (t: PersonType) => PERSON_TYPES.find((x) => x.id === t)?.label ?? t
const typeTone = (t: PersonType) => (t === 'customer' ? 'accent' : t === 'owner' || t === 'partner' ? 'secure' : t === 'staff' ? 'work' : 'muted') as 'accent'

function PeopleList({ openNew }: { openNew: boolean }) {
  const { data, tz, go } = useGx()
  const [type, setType] = useState<PersonType | ''>('')
  const [only, setOnly] = useState<'all' | 'owing' | 'credit'>('all')
  const [editing, setEditing] = useState<GxPerson | 'new' | null>(openNew ? 'new' : null)
  const rows = useMemo(() => live(data.people).filter((p) => !type || p.type === type).map((p) => ({ p, b: personBalance(p, data, tz) }))
    .filter((r) => only === 'all' || (only === 'owing' ? r.b.balance > 0 : r.b.balance < 0)), [data, tz, type, only])
  type R = (typeof rows)[number]
  const cols: Col<R>[] = [
    { key: 'name', label: 'Name', render: (r) => <div><div className="font-medium">{r.p.name}</div><div className="text-xs text-muted">{r.p.phone}</div></div>, sort: (r) => r.p.name, text: (r) => `${r.p.name} ${r.p.phone} ${r.p.email}` },
    { key: 'type', label: 'Type', render: (r) => <Badge tone={typeTone(r.p.type)}>{typeLabel(r.p.type)}</Badge>, sort: (r) => r.p.type },
    { key: 'due', label: 'Charges', align: 'right', render: (r) => <Money v={r.b.opening + r.b.charges - r.b.refunds} />, sort: (r) => r.b.charges },
    { key: 'recv', label: 'Received', align: 'right', render: (r) => <Money v={r.b.received} />, sort: (r) => r.b.received },
    { key: 'out', label: 'Paid out', align: 'right', render: (r) => <Money v={r.b.paidOut} />, sort: (r) => r.b.paidOut },
    { key: 'bal', label: 'Outstanding', align: 'right', render: (r) => <BalanceText v={r.b.balance} />, sort: (r) => r.b.balance },
  ]
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select aria-label="Type" className="w-auto" value={type} onChange={(e) => setType(e.target.value as PersonType | '')}><option value="">All people</option>{PERSON_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
        <Select aria-label="Balance" className="w-auto" value={only} onChange={(e) => setOnly(e.target.value as typeof only)}><option value="all">Any balance</option><option value="owing">Owes the business</option><option value="credit">Business owes them</option></Select>
        <div className="ml-auto flex flex-wrap gap-2">
          <ExportButtons name="Customer balance report" period={`As at ${zoned(new Date().toISOString(), tz).date}`} sheets={() => [{ name: 'Balances', rows: [['Name', 'Type', 'Phone', 'Opening (Rs)', 'Charges (Rs)', 'Refunds (Rs)', 'Received (Rs)', 'Paid out (Rs)', 'Adjustments (Rs)', 'Outstanding (Rs)'], ...rows.map((r) => [r.p.name, typeLabel(r.p.type), r.p.phone, rs(r.b.opening), rs(r.b.charges), rs(r.b.refunds), rs(r.b.received), rs(r.b.paidOut), rs(r.b.adjustments), rs(r.b.balance)])] }]} />
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add person</Button>
        </div>
      </div>
      {!live(data.people).length ? <EmptyState icon={Users} title="No people yet" action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add person</Button>}>Add customers, staff, partners, owners and suppliers. Balances are calculated from sales, payments, refunds and adjustments.</EmptyState> : (
        <DataTable rows={rows} cols={cols} rowKey={(r) => r.p.id} onRowClick={(r) => go(`people/${r.p.id}`)} initialSort={{ key: 'bal', dir: -1 }}
          card={(r) => <div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raised"><User className="h-5 w-5 text-muted" /></div>
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.p.name}</div><div className="text-xs text-muted"><Badge tone={typeTone(r.p.type)}>{typeLabel(r.p.type)}</Badge> {r.p.phone}</div></div><BalanceText v={r.b.balance} /></div>} />
      )}
      {editing && <PersonForm person={editing === 'new' ? null : editing} onClose={(nid) => { setEditing(null); if (nid && editing === 'new') go(`people/${nid}`) }} />}
    </div>
  )
}

export function BalanceText({ v }: { v: number }) {
  if (v === 0) return <span className="text-muted">Settled</span>
  return <span className={cn('font-semibold tabular-nums', v > 0 ? 'text-warn' : 'text-ok')} title={v > 0 ? 'Owes the business' : 'Business owes them / credit'}>{v > 0 ? `Owes ${pkr(v)}` : `Credit ${pkr(-v)}`}</span>
}

function PersonForm({ person, onClose }: { person: GxPerson | null; onClose: (id?: string) => void }) {
  const [f, setF] = useState({ name: person?.name ?? '', type: person?.type ?? 'customer' as PersonType, phone: person?.phone ?? '', email: person?.email ?? '', address: person?.address ?? '', openingBalance: person?.openingBalance ?? 0 as number | null, notes: person?.notes ?? '', attachmentIds: person?.attachmentIds ?? [] })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.name.trim()) return setErr('Name is required.')
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setErr('Enter a valid email or leave it empty.')
    setBusy(true)
    const id = await safeWrite(() => saveRecord(gxPeopleRepo, 'person', person?.id ?? null, { ...f, name: f.name.trim(), openingBalance: f.openingBalance ?? 0 }, f.name), 'Saved')
    setBusy(false)
    if (id) onClose(id)
  }
  return (
    <Modal open onClose={() => onClose()} title={person ? 'Edit person' : 'Add person'} wide footer={<><Button onClick={() => onClose()}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *" htmlFor="pe-name"><Input id="pe-name" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Type" htmlFor="pe-type" hint={f.type === 'owner' || f.type === 'partner' ? 'Their contributions are financing, never revenue' : undefined}><Select id="pe-type" value={f.type} onChange={(e) => set('type', e.target.value as PersonType)}>{PERSON_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
        <Field label="Phone" htmlFor="pe-phone"><Input id="pe-phone" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email" htmlFor="pe-email"><Input id="pe-email" type="email" inputMode="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Address" htmlFor="pe-addr" className="sm:col-span-2"><Input id="pe-addr" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Opening balance" htmlFor="pe-open" hint="Positive = they owe the business; negative = business owes them"><MoneyInput id="pe-open" allowNegative value={f.openingBalance} onChange={(v) => set('openingBalance', v)} /></Field>
        <Field label="Notes" htmlFor="pe-notes"><Textarea id="pe-notes" className="min-h-[44px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="sm:col-span-2"><AttachmentField label="Attachments (ID, contract…)" ids={f.attachmentIds} onChange={(ids) => set('attachmentIds', ids)} tag="person" /></div>
      </div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </Modal>
  )
}

function PersonDetail({ id }: { id: string }) {
  const { data, tz, go } = useGx()
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const p = data.people.find((x) => x.id === id)
  if (!p) return <div><BackLink to="/glamiex/people" label="People" /><EmptyState icon={Users} title="Person not found" /></div>
  const b = personBalance(p, data, tz)
  const orders = live(data.orders).filter((o) => o.personId === id).sort((a, c) => c.at.localeCompare(a.at))
  const pays = data.payments.filter((x) => x.personId === id && !x.deletedAt).sort((a, c) => c.at.localeCompare(a.at))
  const history = [
    ...orders.map((o) => ({ at: o.at, kind: 'Sale', ref: o.orderNo, amount: o.status === 'cancelled' ? 0 : orderBalance(o, data.payments, data.refunds).total, sign: 1, to: `sales/${o.id}`, note: o.status === 'cancelled' ? 'cancelled' : '' })),
    ...data.refunds.filter((r) => orders.some((o) => o.id === r.orderId) && !r.deletedAt).map((r) => ({ at: r.at, kind: 'Refund credit', ref: orders.find((o) => o.id === r.orderId)!.orderNo, amount: r.amount, sign: -1, to: `sales/${r.orderId}`, note: r.reason })),
    ...pays.map((x) => {
      const t = PAYMENT_TYPES.find((y) => y.id === x.type)!
      return { at: x.at, kind: t.label, ref: x.txnNo, amount: x.voided ? 0 : x.amount, sign: t.dir === 'out' ? 1 : -1, to: `payments/${x.id}`, note: x.voided ? 'VOID' : x.reference }
    }),
  ].sort((a, c) => a.at.localeCompare(c.at))
  let run = p.openingBalance
  const ledger = history.map((h) => { run += h.sign * h.amount; return { ...h, balance: run } }).reverse()

  return (
    <div className="space-y-4">
      <BackLink to="/glamiex/people" label="People" />
      <div className="card flex flex-wrap items-start gap-3 p-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-raised"><User className="h-7 w-7 text-muted" /></div>
        <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{p.name}</h2><p className="text-sm text-muted"><Badge tone={typeTone(p.type)}>{typeLabel(p.type)}</Badge> {p.phone} {p.email}</p>{p.address && <p className="text-xs text-muted">{p.address}</p>}{p.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{p.notes}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/glamiex/payments/new?person=${id}`} className="btn btn-3d h-10 px-4 text-sm"><Wallet className="h-4 w-4" />Record payment</Link>
          {p.type === 'customer' && <Link to="/glamiex/sales/new" className="btn btn-soft h-10 px-3 text-sm">New sale</Link>}
          <Button icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>
          <Button variant="ghost" icon={Trash2} onClick={() => setDel(true)}>Delete</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label="Opening balance"><Money v={b.opening} /></Stat>
        <Stat label="Total charged (sales)"><Money v={b.charges} /></Stat>
        <Stat label="Refunds credited"><Money v={b.refunds} /></Stat>
        <Stat label="Received / deposited" tone="ok"><Money v={b.received} /></Stat>
        <Stat label="Paid out to them"><Money v={b.paidOut} /></Stat>
        <Stat label="Adjustments"><Money v={b.adjustments} /></Stat>
        <Stat label="Outstanding" tone={b.balance > 0 ? 'warn' : b.balance < 0 ? 'ok' : undefined}><BalanceText v={b.balance} /></Stat>
      </div>
      <Section title="Account statement" icon={Wallet} actions={<ExportButtons name={`Statement — ${p.name}`} period="All time" sheets={() => [{ name: 'Statement', rows: [['Date', 'Type', 'Reference', 'Amount (Rs)', 'Effect', 'Running balance (Rs)', 'Note'], ...[...ledger].reverse().map((h) => [zoned(h.at, tz).date, h.kind, h.ref, rs(h.amount), h.sign > 0 ? 'increases what they owe' : 'reduces what they owe', rs(h.balance), h.note])] }]} />}>
        {!ledger.length ? <p className="text-sm text-muted">No transactions yet.</p> : (
          <ul className="divide-y divide-line/60">{ledger.map((h, i) => (
            <li key={i}><Link to={`/glamiex/${h.to}`} className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm hover:text-accent">
              <span className="w-24 text-xs text-muted">{zoned(h.at, tz).date}</span><span className="min-w-0 flex-1"><span className="font-medium">{h.kind}</span> <span className="font-mono text-xs text-muted">{h.ref}</span>{h.note && <span className="text-xs text-muted"> · {h.note}</span>}</span>
              <span className={cn('w-28 text-right tabular-nums', h.sign > 0 ? '' : 'text-ok')}>{h.sign > 0 ? '+' : '−'}{pkr(h.amount)}</span>
              <span className="w-28 text-right text-xs tabular-nums text-muted">bal {pkr(h.balance)}</span>
            </Link></li>
          ))}</ul>
        )}
      </Section>
      {orders.length > 0 && <Section title={`Orders (${orders.length})`} icon={Wallet} defaultOpen={false}>
        <ul className="divide-y divide-line/60">{orders.map((o) => { const ob = orderBalance(o, data.payments, data.refunds); return (
          <li key={o.id}><Link to={`/glamiex/sales/${o.id}`} className="flex min-h-[44px] items-center gap-3 py-2 text-sm hover:text-accent"><span className="font-mono text-xs">{o.orderNo}</span><span className="flex-1 text-xs text-muted">{zoned(o.at, tz).date}</span><PayBadge s={ob.status} /><Money v={ob.total} />{ob.balance > 0 && o.status !== 'cancelled' && <span className="text-xs text-warn">due {pkr(ob.balance)}</span>}</Link></li>
        ) })}</ul>
      </Section>}
      {p.attachmentIds.length > 0 && <Section title="Attachments" icon={User}><AttachmentField label="" ids={p.attachmentIds} onChange={(ids) => void safeWrite(() => gxPeopleRepo.update(id, { attachmentIds: ids }))} tag="person" /></Section>}
      {edit && <PersonForm person={p} onClose={() => setEdit(false)} />}
      <ConfirmText open={del} danger title={`Delete ${p.name}?`} label="Move to trash" onClose={() => setDel(false)}
        body={orders.length || pays.length ? `This person has ${orders.length} order(s) and ${pays.length} payment(s). Those records are kept; the person moves to Trash and can be restored.` : 'The person moves to Trash and can be restored.'}
        onConfirm={async () => { await gxPeopleRepo.trash(id); await gxAudit('person', id, 'delete', p.name); toast('Moved to trash'); go('people') }} />
    </div>
  )
}
