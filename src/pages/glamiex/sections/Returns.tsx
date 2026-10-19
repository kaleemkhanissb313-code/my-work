import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, ClipboardCheck, PackageOpen, Plus, Truck, Undo2 } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { db } from '@/lib/db'
import { assignPickup, inspectReturn, postReturnRefund, receiveReturn, saveReturn, setReturnStatus, trashReturn, type ReturnInput } from '@/features/glamiex/logisticsService'
import { returnCalc } from '@/features/glamiex/logistics'
import { pkr } from '@/features/glamiex/money'
import { inRange, wallToIso, zoned } from '@/features/glamiex/time'
import { AttachmentField, DataTable, ExportButtons, KpiCard, Money, MoneyInput, RangeBar, Section, rs, useRange, type Col } from '@/features/glamiex/ui'
import {
  DISPOSITIONS, PAYMENT_METHODS, RETURN_REASONS, RETURN_STATUSES, type GxReturn, type PaymentMethod, type ReturnDisposition, type ReturnReason, type ReturnStatus,
} from '@/features/glamiex/types'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { ActionBar, BackLink, FormGrid, Stat, nowLocal } from './shared'

export const statusLabel = (s: ReturnStatus) => RETURN_STATUSES.find((x) => x.id === s)?.label ?? s
export const reasonLabel = (s: ReturnReason) => RETURN_REASONS.find((x) => x.id === s)?.label ?? s
const tone = (s: ReturnStatus) => (['refunded', 'completed', 'restock_approved'].includes(s) ? 'ok' : s === 'rejected' || s === 'damaged' ? 'danger' : ['received', 'inspection_pending', 'refund_pending'].includes(s) ? 'warn' : 'muted') as 'ok' | 'danger' | 'warn' | 'muted'
export function ReturnBadge({ s }: { s: ReturnStatus }) { return <Badge tone={tone(s)}>{statusLabel(s)}</Badge> }
/** Statuses a user may pick by hand (refunded / restock approved are set by posting). */
const MANUAL: ReturnStatus[] = ['requested', 'approved', 'pickup_scheduled', 'received', 'inspection_pending', 'damaged', 'refund_pending', 'rejected', 'completed']

export default function Returns({ id }: { id?: string }) {
  if (id === 'new') return <ReturnForm item={null} />
  if (id) return <ReturnDetail id={id} />
  return <ReturnList />
}

function ReturnList() {
  const { data, tz, go } = useGx()
  const { state, setState, range } = useRange('returns', tz, 'thisMonth')
  const [status, setStatus] = useState<ReturnStatus | ''>('')
  const [reason, setReason] = useState<ReturnReason | ''>('')
  const all = state.preset === 'all'
  const rows = useMemo(() => live(data.returns).filter((r) => (all || inRange(zoned(r.at, tz).date, range)) && (!status || r.status === status) && (!reason || r.reason === reason)).map((r) => ({ r, c: returnCalc(r) })),
    [data.returns, all, range.from, range.to, status, reason, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const counted = rows.filter((x) => x.r.status !== 'rejected')
  const sum = (f: (x: (typeof rows)[number]) => number) => counted.reduce((a, x) => a + f(x), 0)
  type R = (typeof rows)[number]
  const orders = new Map(data.orders.map((o) => [o.id, o.orderNo]))
  const quickStatus = (r: GxReturn) => (
    <Select aria-label={`Status of ${r.returnNo}`} className="h-9 w-auto min-w-[9rem] py-1 text-xs" value={r.status} onClick={(e) => e.stopPropagation()}
      onChange={async (e) => { try { await setReturnStatus(r.id, e.target.value as ReturnStatus); toast('Status updated', 'success', undefined, 1200) } catch (err) { toast((err as Error).message, 'error') } }}>
      {RETURN_STATUSES.map((s) => <option key={s.id} value={s.id} disabled={!MANUAL.includes(s.id) && s.id !== r.status}>{s.label}</option>)}
    </Select>
  )
  const cols: Col<R>[] = [
    { key: 'no', label: 'Return', render: (x) => <span className="font-mono text-xs">{x.r.returnNo}</span>, sort: (x) => x.r.returnNo, text: (x) => `${x.r.returnNo} ${orders.get(x.r.orderId) ?? ''} ${x.r.productName} ${x.r.customerName} ${x.r.notes}` },
    { key: 'date', label: 'Date', render: (x) => zoned(x.r.at, tz).date, sort: (x) => x.r.at },
    { key: 'order', label: 'Order', render: (x) => <span className="font-mono text-xs">{orders.get(x.r.orderId) ?? '—'}</span>, sort: (x) => orders.get(x.r.orderId) ?? '' },
    { key: 'prod', label: 'Product', render: (x) => <div><div>{x.r.productName}</div><div className="text-xs text-muted">{x.r.customerName || 'Walk-in'}</div></div>, sort: (x) => x.r.productName },
    { key: 'qty', label: 'Returned / sold', align: 'right', render: (x) => <span>{x.r.qtyReturned} / {x.r.qtySold} <span className="text-xs text-muted">({x.c.retained} kept)</span></span>, sort: (x) => x.r.qtyReturned },
    { key: 'reason', label: 'Reason', render: (x) => reasonLabel(x.r.reason), sort: (x) => x.r.reason },
    { key: 'refund', label: 'Refund', align: 'right', render: (x) => <Money v={x.c.refund} />, sort: (x) => x.c.refund },
    { key: 'cost', label: 'Return costs', align: 'right', render: (x) => <Money v={x.c.returnExpense} />, sort: (x) => x.c.returnExpense },
    { key: 'net', label: 'Net impact', align: 'right', render: (x) => <Money v={x.c.netImpact} tone />, sort: (x) => x.c.netImpact },
    { key: 'st', label: 'Status', render: (x) => quickStatus(x.r), sort: (x) => x.r.status },
  ]
  return (
    <div className="space-y-3">
      <RangeBar state={state} setState={setState} range={range} extra={<Button variant="primary" icon={Plus} onClick={() => go('returns/new')}>Record return</Button>} />
      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Returned products" value={sum((x) => x.r.qtyReturned)} kind="count" sub={`${counted.length} returns`} />
        <KpiCard label="Refunds approved" value={sum((x) => x.c.refund)} invert />
        <KpiCard label="Refunds posted" value={counted.filter((x) => x.r.refundPostedAt).reduce((a, x) => a + x.r.refundAmount, 0)} />
        <KpiCard label="Return shipping & handling" value={sum((x) => x.c.returnExpense)} invert />
        <KpiCard label="Returned stock buying cost" value={sum((x) => x.c.stockCost)} sub="not an extra expense" />
        <KpiCard label="Recoverable inventory value" value={sum((x) => x.c.recoverable)} tone="ok" />
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(x) => x.r.id} onRowClick={(x) => go(`returns/${x.r.id}`)} initialSort={{ key: 'date', dir: -1 }} empty="No returns in this period."
        toolbar={<>
          <Select aria-label="Status filter" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as ReturnStatus | '')}><option value="">All statuses</option>{RETURN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
          <Select aria-label="Reason filter" className="w-auto" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason | '')}><option value="">All reasons</option>{RETURN_REASONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
          <ExportButtons name="Product returns" period={all ? 'All time' : `${range.from} to ${range.to}`} sheets={() => [{ name: 'Returns', rows: [
            ['Return', 'Date', 'Order', 'Customer', 'Product', 'Qty sold', 'Qty returned', 'Qty retained', 'Unit cost (Rs)', 'Returned stock cost (Rs)', 'Unit price (Rs)', 'Refund (Rs)', 'Return shipping (Rs)', 'Handling + other (Rs)', 'Total return expense (Rs)', 'Recoverable value (Rs)', 'Net impact (Rs)', 'Reason', 'Status', 'Disposition'],
            ...rows.map(({ r, c }) => [r.returnNo, zoned(r.at, tz).date, orders.get(r.orderId) ?? '', r.customerName, r.productName, r.qtySold, r.qtyReturned, c.retained, rs(r.unitCost), rs(c.stockCost), rs(r.unitPrice), rs(c.refund), rs(c.shipping), rs(c.handling + c.other), rs(c.returnExpense), rs(c.recoverable), rs(c.netImpact), reasonLabel(r.reason), statusLabel(r.status), r.disposition ?? '']),
          ] }]} />
        </>}
        card={(x) => <div>
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium">{x.r.qtyReturned} × {x.r.productName}</div><div className="text-xs text-muted">{x.r.returnNo} · {orders.get(x.r.orderId)} · {zoned(x.r.at, tz).date}</div></div><b><Money v={x.c.refund} /></b></div>
          <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-muted">{reasonLabel(x.r.reason)} · {x.c.retained} kept</span>{quickStatus(x.r)}</div>
        </div>} />
    </div>
  )
}

function ReturnForm({ item }: { item: GxReturn | null }) {
  const { data, tz, go } = useGx()
  const n = nowLocal(tz)
  const orders = useMemo(() => live(data.orders).filter((o) => o.status !== 'cancelled').sort((a, b) => b.at.localeCompare(a.at)), [data.orders])
  const [orderId, setOrderId] = useState(item?.orderId ?? '')
  const order = orders.find((o) => o.id === orderId)
  const person = data.people.find((p) => p.id === order?.personId)
  const [productId, setProductId] = useState(item?.productId ?? '')
  const line = order?.items.find((i) => i.productId === productId)
  const sold = order?.items.filter((i) => i.productId === productId).reduce((a, i) => a + i.qty, 0) ?? 0
  const z = item ? zoned(item.at, tz) : null
  const [f, setF] = useState({
    qty: item?.qtyReturned ?? 1, date: z?.date ?? n.date, time: z?.time ?? n.time, reason: item?.reason ?? 'damaged' as ReturnReason, refund: item?.refundAmount ?? null as number | null,
    shipping: item?.shippingCost ?? 0 as number | null, handling: item?.handlingCost ?? 0 as number | null, other: item?.otherCost ?? 0 as number | null, condition: item?.condition ?? '',
    notes: item?.notes ?? '', attachmentIds: item?.attachmentIds ?? [], customerName: item?.customerName ?? '', customerContact: item?.customerContact ?? '', status: item?.status ?? 'requested' as ReturnStatus,
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = !!(item?.refundPostedAt || item?.restockPostedAt)
  const suggested = line ? f.qty * line.unitPrice : 0
  const save = async () => {
    setErr(null)
    if (!order || !line) return setErr('Choose the order and the product being returned.')
    setBusy(true)
    try {
      const input: ReturnInput = {
        orderId: order.id, productId, qtyReturned: Number(f.qty), at: wallToIso(f.date, f.time || '00:00', tz), reason: f.reason, refundAmount: f.refund ?? 0, shippingCost: f.shipping ?? 0,
        handlingCost: f.handling ?? 0, otherCost: f.other ?? 0, condition: f.condition, notes: f.notes, attachmentIds: f.attachmentIds, imageId: item?.imageId ?? null,
        customerName: f.customerName || person?.name || '', customerContact: f.customerContact || person?.phone || '', status: f.status,
      }
      const rid = await saveReturn(input, item?.id ?? null)
      toast(item ? 'Return updated' : 'Return recorded'); go(`returns/${rid}`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div>
      <BackLink to={item ? `/glamiex/returns/${item.id}` : '/glamiex/returns'} label="Back" />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
        <Section title={item ? `Edit ${item.returnNo}` : 'Record a returned product'} icon={Undo2}>
          {locked && <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 p-2 text-xs">The refund or restock is posted, so order, product, quantity and refund are locked.</p>}
          <FormGrid>
            <Field label="Original order" htmlFor="rf-o"><Select id="rf-o" disabled={locked} value={orderId} onChange={(e) => { setOrderId(e.target.value); setProductId('') }}>
              <option value="">Choose order…</option>{orders.slice(0, 500).map((o) => <option key={o.id} value={o.id}>{o.orderNo} · {zoned(o.at, tz).date} · {data.people.find((p) => p.id === o.personId)?.name ?? 'Walk-in'}</option>)}</Select></Field>
            <Field label="Product" htmlFor="rf-p"><Select id="rf-p" disabled={locked || !order} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Choose product…</option>{[...new Map(order?.items.map((i) => [i.productId, i]) ?? []).values()].map((i) => <option key={i.productId} value={i.productId}>{i.name} ({i.sku})</option>)}</Select></Field>
            <Field label="Quantity returned" htmlFor="rf-q" hint={line ? `Sold ${sold} · ${Math.max(0, sold - Number(f.qty || 0))} retained` : undefined}><Input id="rf-q" disabled={locked} type="number" inputMode="numeric" min={1} max={sold || undefined} value={f.qty} onChange={(e) => set('qty', Number(e.target.value))} /></Field>
            <Field label="Return date" htmlFor="rf-d"><Input id="rf-d" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
            <Field label="Time" htmlFor="rf-t" hint={tz}><Input id="rf-t" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></Field>
            <Field label="Reason" htmlFor="rf-r"><Select id="rf-r" value={f.reason} onChange={(e) => set('reason', e.target.value as ReturnReason)}>{RETURN_REASONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
            <Field label="Customer name" htmlFor="rf-cn"><Input id="rf-cn" value={f.customerName} placeholder={person?.name ?? 'Walk-in'} onChange={(e) => set('customerName', e.target.value)} /></Field>
            <Field label="Customer contact" htmlFor="rf-cc"><Input id="rf-cc" value={f.customerContact} placeholder={person?.phone ?? ''} onChange={(e) => set('customerContact', e.target.value)} /></Field>
            <Field label="Status" htmlFor="rf-s"><Select id="rf-s" value={f.status} onChange={(e) => set('status', e.target.value as ReturnStatus)}>{RETURN_STATUSES.filter((s) => MANUAL.includes(s.id) || s.id === f.status).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
          </FormGrid>
        </Section>
        <Section title="Money" icon={PackageOpen}>
          <FormGrid>
            <Field label="Approved refund amount" htmlFor="rf-rf" hint={line ? `Selling value of returned units: ${pkr(suggested)}` : undefined}><MoneyInput id="rf-rf" disabled={locked} value={f.refund} onChange={(v) => set('refund', v)} /></Field>
            <Field label="Return shipping cost" htmlFor="rf-sh" hint="Leave 0 if a pickup rider will be assigned (their pay is used instead)"><MoneyInput id="rf-sh" value={f.shipping} onChange={(v) => set('shipping', v)} /></Field>
            <Field label="Handling / inspection cost" htmlFor="rf-h"><MoneyInput id="rf-h" value={f.handling} onChange={(v) => set('handling', v)} /></Field>
            <Field label="Other return costs" htmlFor="rf-x"><MoneyInput id="rf-x" value={f.other} onChange={(v) => set('other', v)} /></Field>
            <Field label="Product condition" htmlFor="rf-c"><Input id="rf-c" value={f.condition} onChange={(e) => set('condition', e.target.value)} placeholder="e.g. box opened, scratched" /></Field>
            <Field label="Notes" htmlFor="rf-n"><Textarea id="rf-n" className="min-h-[44px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </FormGrid>
          {line && !f.refund && suggested > 0 && !locked && <Button size="sm" className="mt-2" onClick={() => set('refund', suggested)}>Use {pkr(suggested)}</Button>}
          <div className="mt-3"><AttachmentField label="Photos / receipts" ids={f.attachmentIds} onChange={(ids) => set('attachmentIds', ids)} tag="return-attachment" /></div>
        </Section>
        {err && <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{err}</p>}
        <ActionBar><Button onClick={() => go(item ? `returns/${item.id}` : 'returns')}>Cancel</Button><Button type="submit" variant="primary" size="lg" loading={busy}>Save return</Button></ActionBar>
      </form>
    </div>
  )
}

function ReturnDetail({ id }: { id: string }) {
  const { data, tz, go } = useGx()
  const r = data.returns.find((x) => x.id === id)
  const [edit, setEdit] = useState(false)
  if (!r || r.deletedAt) return <div><BackLink to="/glamiex/returns" label="Returns" /><EmptyState icon={Undo2} title="Return not found" /></div>
  if (edit) return <ReturnForm item={r} />
  const c = returnCalc(r)
  const o = data.orders.find((x) => x.id === r.orderId)
  return (
    <div className="space-y-4">
      <BackLink to="/glamiex/returns" label="Returns" />
      <div className="card flex flex-wrap items-start gap-3 p-4">
        <ProductImage id={r.imageId} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-mono text-lg font-bold">{r.returnNo}</h2><ReturnBadge s={r.status} />{r.disposition && <Badge>{DISPOSITIONS.find((d) => d.id === r.disposition)?.label}</Badge>}</div>
          <p className="text-sm">{r.qtyReturned} × <b>{r.productName}</b> from <button className="font-mono text-accent" onClick={() => go(`sales/${r.orderId}`)}>{o?.orderNo}</button> · {r.customerName || 'Walk-in'}{r.customerContact && ` · ${r.customerContact}`}</p>
          <p className="text-xs text-muted">{zoned(r.at, tz).date} {zoned(r.at, tz).time} · {reasonLabel(r.reason)}{r.condition && ` · ${r.condition}`}</p>
        </div>
        <Button onClick={() => setEdit(true)}>Edit</Button>
        {!r.refundPostedAt && !r.restockPostedAt && <Button variant="ghost" onClick={async () => {
          if (!(await confirm({ title: `Delete ${r.returnNo}?`, body: 'It moves to Trash. Nothing has been posted to the books yet.', danger: true, confirmLabel: 'Delete' }))) return
          try { await trashReturn(r.id); toast('Deleted'); go('returns') } catch (e) { toast((e as Error).message, 'error') }
        }}>Delete</Button>}
      </div>

      <Section title="Cost of this return" icon={PackageOpen}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Quantity sold / returned / retained">{r.qtySold} / {r.qtyReturned} / {c.retained}</Stat>
          <Stat label="Unit buying cost"><Money v={r.unitCost} /></Stat>
          <Stat label="Returned stock cost (qty × cost)"><Money v={c.stockCost} /></Stat>
          <Stat label="Original selling price"><Money v={r.unitPrice} /></Stat>
          <Stat label="Approved refund" tone="danger"><Money v={c.refund} /></Stat>
          <Stat label={r.pickupPartnerId ? 'Return delivery (pickup rider)' : 'Return shipping'}><Money v={c.shipping} /></Stat>
          <Stat label="Handling + other"><Money v={c.handling + c.other} /></Stat>
          <Stat label="Total return expense" tone="danger"><Money v={c.returnExpense} /></Stat>
          <Stat label="Recoverable inventory value" tone="ok"><Money v={c.recoverable} /></Stat>
          <Stat label="Net financial impact" tone={c.netImpact < 0 ? 'danger' : 'ok'}><Money v={c.netImpact} /></Stat>
        </div>
        <p className="mt-2 text-xs text-muted">Returned stock cost is shown for information — it is not charged as an expense again (it was part of cost of goods when the sale was made). Net impact = −refund + recoverable value − return expenses.</p>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <PickupPanel r={r} />
        <InspectPanel r={r} />
        <RefundPanel r={r} />
      </div>
      {r.notes && <Section title="Notes" icon={Undo2}><p className="whitespace-pre-wrap text-sm">{r.notes}</p></Section>}
      {r.attachmentIds.length > 0 && <Section title="Attachments" icon={Undo2}><AttachmentField label="" ids={r.attachmentIds} onChange={() => setEdit(true)} tag="return-attachment" /></Section>}
    </div>
  )
}

function ProductImage({ id }: { id: string | null }) {
  const url = useLiveQuery(async () => { if (!id) return null; const m = await db.media.get(id); return m && !m.deletedAt ? m.thumbnail ?? null : null }, [id])
  if (!url) return <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-raised text-muted"><PackageOpen className="h-6 w-6" aria-hidden /></div>
  return <img loading="lazy" decoding="async" src={url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
}

function PickupPanel({ r }: { r: GxReturn }) {
  const { data, tz } = useGx()
  const partners = live(data.partners).filter((p) => p.status === 'active' || p.id === r.pickupPartnerId)
  const [partnerId, setPartnerId] = useState(r.pickupPartnerId ?? '')
  const [date, setDate] = useState(r.pickupDate || nowLocal(tz).date)
  const [qty, setQty] = useState(r.pickupQty || r.qtyReturned)
  const run = async (f: () => Promise<void>, msg: string) => { try { await f(); toast(msg) } catch (e) { toast((e as Error).message, 'error') } }
  return (
    <Section title="Return pickup & warehouse" icon={Truck}>
      <div className="space-y-2">
        <Field label="Pickup rider / courier" htmlFor="pk-p"><Select id="pk-p" disabled={r.received} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">None (customer sends it)</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pickup date" htmlFor="pk-d"><Input id="pk-d" type="date" disabled={r.received} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Products collected" htmlFor="pk-q"><Input id="pk-q" type="number" inputMode="numeric" min={0} max={r.qtyReturned} disabled={r.received} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
        </div>
        {!r.received && <Button className="w-full" onClick={() => void run(() => assignPickup(r.id, partnerId || null, date, qty), 'Pickup saved')}>Save pickup</Button>}
        {r.pickupPartnerId && <p className="text-xs text-muted">Rider pay for this pickup: <b>{pkr(r.pickupPay)}</b> — earned when the goods are received. {data.partners.find((p) => p.id === r.pickupPartnerId)?.countPickupAsDelivery ? 'Counts as a delivery (partner policy).' : 'Not counted as a customer delivery.'}</p>}
        <div className="flex items-center gap-2 border-t border-line/60 pt-2 text-sm">
          {r.received ? <><CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />Received {r.receivedAt && zoned(r.receivedAt, tz).date}</> :
            <Button variant="primary" className="w-full" icon={CheckCircle2} disabled={r.status === 'rejected'} onClick={() => void run(() => receiveReturn(r.id), 'Marked as received at the warehouse')}>Mark received at warehouse</Button>}
        </div>
      </div>
    </Section>
  )
}

function InspectPanel({ r }: { r: GxReturn }) {
  const [disp, setDisp] = useState<ReturnDisposition>(r.disposition ?? 'sellable')
  const [salvage, setSalvage] = useState<number | null>(r.salvageValue || null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (disp === 'sellable' && !(await confirm({ title: `Restock ${r.qtyReturned} × ${r.productName}?`, body: 'Adds these units back to sellable stock and reverses their cost of goods. This is posted once and then locked.', confirmLabel: 'Restock' }))) return
    setBusy(true)
    try { await inspectReturn(r.id, disp, disp === 'sellable' ? 0 : salvage ?? 0); toast(disp === 'sellable' ? 'Restocked as sellable' : 'Inspection saved') } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Section title="Inspection" icon={ClipboardCheck}>
      {r.restockPostedAt ? <p className="text-sm"><CheckCircle2 className="mr-1 inline h-4 w-4 text-ok" />{r.qtyReturned} unit(s) restocked as sellable.</p> : !r.received ? <p className="text-sm text-muted">Available after the goods are received. Sellable stock only increases once they are received and approved.</p> : (
        <div className="space-y-2">
          <fieldset className="space-y-1" aria-label="Inspection result">{DISPOSITIONS.map((d) => (
            <label key={d.id} className={cn('flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm', disp === d.id ? 'border-accent bg-raised' : 'border-line')}>
              <input type="radio" name={`disp-${r.id}`} checked={disp === d.id} onChange={() => setDisp(d.id)} />{d.label}</label>
          ))}</fieldset>
          {(disp === 'damaged_stock' || disp === 'repair') && <Field label="Estimated recoverable value" htmlFor="in-s" hint="Kept out of sellable stock"><MoneyInput id="in-s" value={salvage} onChange={setSalvage} /></Field>}
          <Button variant="primary" className="w-full" loading={busy} onClick={() => void run()}>Save inspection</Button>
        </div>
      )}
    </Section>
  )
}

function RefundPanel({ r }: { r: GxReturn }) {
  const [payNow, setPayNow] = useState(true)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!(await confirm({ title: `Post refund of ${pkr(r.refundAmount)}?`, body: `Reduces net sales once (as a refund on the original order)${payNow ? ' and records the cash paid back to the customer' : '; the amount stays owed to the customer until paid'}. It cannot be posted twice.`, confirmLabel: 'Post refund' }))) return
    setBusy(true)
    try { await postReturnRefund(r.id, { payNow, method }); toast('Refund posted') } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Section title="Customer refund" icon={Undo2}>
      {r.refundPostedAt ? <p className="text-sm"><CheckCircle2 className="mr-1 inline h-4 w-4 text-ok" />Refund of <b>{pkr(r.refundAmount)}</b> posted on {r.refundPostedAt.slice(0, 10)}.</p> : r.status === 'rejected' ? <p className="text-sm text-muted">Rejected — no refund.</p> : !r.refundAmount ? <p className="text-sm text-muted">Set an approved refund amount (Edit) to post a refund. A return with no refund (e.g. exchange) is fine.</p> : (
        <div className="space-y-2">
          <p className="text-sm">Approved: <b>{pkr(r.refundAmount)}</b></p>
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />Paid back to the customer now</label>
          {payNow && <Select aria-label="Refund method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>}
          <Button variant="primary" className="w-full" loading={busy} onClick={() => void run()}>Post refund</Button>
        </div>
      )}
    </Section>
  )
}
