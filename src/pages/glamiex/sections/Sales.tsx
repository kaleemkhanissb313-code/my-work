import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Minus, Plus, Receipt, RotateCcw, ShoppingCart, Trash2, UserPlus, Wallet } from 'lucide-react'
import { Badge, Button, Checkbox, EmptyState, Field, IconButton, Input, Modal, Select, Textarea } from '@/components/ui'
import { safeWrite, toast } from '@/components/feedback'
import { addPayment, cancelOrder, createOrder, gxPeopleRepo, gxAudit, newSubmissionId, refundOrder, updateOrderInfo } from '@/features/glamiex/service'
import { orderBalance, orderGross, orderUnits, stockOf } from '@/features/glamiex/engine'
import { pkr } from '@/features/glamiex/money'
import { inRange, wallToIso, zoned } from '@/features/glamiex/time'
import { AttachmentField, ConfirmText, DataTable, ExportButtons, Money, MoneyInput, PayBadge, RangeBar, Section, rs, useRange, type Col } from '@/features/glamiex/ui'
import { PAYMENT_METHODS, type GxOrder, type PaymentMethod } from '@/features/glamiex/types'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { ActionBar, BackLink, FormGrid, Stat, earliestDate, nowLocal } from './shared'

export default function Sales({ id }: { id?: string }) {
  if (id === 'new') return <NewSale />
  if (id) return <OrderDetail id={id} />
  return <SalesList />
}

function SalesList() {
  const { data, tz, go } = useGx()
  const { state, setState, range: raw } = useRange('sales', tz, 'thisMonth')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [pay, setPay] = useState('')
  const [product, setProduct] = useState('')
  const people = new Map(data.people.map((p) => [p.id, p]))
  const rows = useMemo(() => live(data.orders)
    .filter((o) => inRange(zoned(o.at, tz).date, range) && (!product || o.items.some((i) => i.productId === product)))
    .map((o) => ({ o, b: orderBalance(o, data.payments, data.refunds), z: zoned(o.at, tz) }))
    .filter((r) => !pay || r.b.status === pay), [data, tz, range.from, range.to, pay, product]) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = rows.reduce((a, r) => (r.o.status === 'cancelled' ? a : { total: a.total + r.b.total, paid: a.paid + r.b.paid, balance: a.balance + Math.max(0, r.b.balance) }), { total: 0, paid: 0, balance: 0 })
  type R = (typeof rows)[number]
  const cols: Col<R>[] = [
    { key: 'no', label: 'Order', render: (r) => <span className="font-mono text-xs">{r.o.orderNo}</span>, sort: (r) => r.o.orderNo, text: (r) => `${r.o.orderNo} ${r.o.items.map((i) => i.name).join(' ')} ${people.get(r.o.personId ?? '')?.name ?? ''} ${r.o.notes}` },
    { key: 'date', label: 'Date & time', render: (r) => <span className="whitespace-nowrap">{r.z.date} <span className="text-muted">{r.z.time} · {r.z.weekday.slice(0, 3)}</span></span>, sort: (r) => r.o.at },
    { key: 'cust', label: 'Customer', render: (r) => people.get(r.o.personId ?? '')?.name ?? <span className="text-muted">Walk-in</span>, sort: (r) => people.get(r.o.personId ?? '')?.name ?? '' },
    { key: 'items', label: 'Items', render: (r) => <span className="line-clamp-1">{r.o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span> },
    { key: 'units', label: 'Units', align: 'right', render: (r) => orderUnits(r.o), sort: (r) => orderUnits(r.o) },
    { key: 'total', label: 'Total', align: 'right', render: (r) => <Money v={r.b.total} />, sort: (r) => r.b.total },
    { key: 'paid', label: 'Received', align: 'right', render: (r) => <Money v={r.b.paid} />, sort: (r) => r.b.paid },
    { key: 'bal', label: 'Balance', align: 'right', render: (r) => <span className={cn(r.b.balance > 0 && 'font-semibold text-warn')}><Money v={r.o.status === 'cancelled' ? 0 : r.b.balance} /></span>, sort: (r) => r.b.balance },
    { key: 'st', label: 'Status', render: (r) => <PayBadge s={r.b.status} />, sort: (r) => r.b.status },
  ]
  return (
    <div>
      <RangeBar state={state} setState={setState} range={range} extra={<Button variant="primary" icon={Plus} onClick={() => go('sales/new')}>New sale</Button>} />
      <div className="mb-3 grid grid-cols-3 gap-2 sm:max-w-xl">
        <Stat label="Order value"><Money v={totals.total} /></Stat><Stat label="Received" tone="ok"><Money v={totals.paid} /></Stat><Stat label="Outstanding" tone={totals.balance ? 'warn' : undefined}><Money v={totals.balance} /></Stat>
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.o.id} onRowClick={(r) => go(`sales/${r.o.id}`)} initialSort={{ key: 'date', dir: -1 }}
        empty={<>No sales in this period. <Link className="text-accent" to="/glamiex/sales/new">Record a sale</Link>.</>}
        toolbar={<>
          <Select aria-label="Payment status" className="w-auto" value={pay} onChange={(e) => setPay(e.target.value)}><option value="">All statuses</option>{['paid', 'partial', 'unpaid', 'refunded', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</Select>
          <Select aria-label="Product" className="w-auto max-w-[12rem]" value={product} onChange={(e) => setProduct(e.target.value)}><option value="">All products</option>{live(data.products).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <ExportButtons name="Sales report" period={`${range.from} to ${range.to}`} sheets={() => [{ name: 'Sales', rows: [['Order', 'Date', 'Time', 'Day', 'Customer', 'Items', 'Units', 'Subtotal (Rs)', 'Discount (Rs)', 'Tax (Rs)', 'Total (Rs)', 'Refunded (Rs)', 'Received (Rs)', 'Balance (Rs)', 'Status', 'Method'],
            ...rows.map((r) => [r.o.orderNo, r.z.date, r.z.time, r.z.weekday, people.get(r.o.personId ?? '')?.name ?? 'Walk-in', r.o.items.map((i) => `${i.qty}x ${i.name}`).join('; '), orderUnits(r.o), rs(orderGross(r.o)), rs(r.o.discount), rs(r.o.tax), rs(r.b.total), rs(r.b.refunded), rs(r.b.paid), rs(r.o.status === 'cancelled' ? 0 : r.b.balance), r.b.status, r.o.method])] }]} />
        </>}
        card={(r) => (
          <div>
            <div className="flex items-start justify-between gap-2"><span className="font-mono text-xs text-muted">{r.o.orderNo}</span><PayBadge s={r.b.status} /></div>
            <div className="mt-1 line-clamp-2 text-sm font-medium">{r.o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted"><span>{r.z.date} {r.z.time}</span><span>{people.get(r.o.personId ?? '')?.name ?? 'Walk-in'}</span></div>
            <div className="mt-2 flex items-end justify-between"><span className="text-xs">{r.b.balance > 0 && r.o.status !== 'cancelled' ? <span className="text-warn">Due <Money v={r.b.balance} /></span> : null}</span><b className="text-base"><Money v={r.b.total} /></b></div>
          </div>
        )} />
    </div>
  )
}

/* ---------------- New sale (mobile-first) ---------------- */
interface Line { key: string; productId: string; qty: number; unitPrice: number | null }

function NewSale() {
  const { data, tz, go, settings } = useGx()
  const [submissionId] = useState(newSubmissionId) // stable id → re-submits never double-post
  const now = nowLocal(tz)
  const products = live(data.products).filter((p) => !p.archived && p.status === 'active')
  const customers = live(data.people).filter((p) => p.type === 'customer')
  const [lines, setLines] = useState<Line[]>([])
  const [pick, setPick] = useState('')
  const [personId, setPersonId] = useState('')
  const [discount, setDiscount] = useState<number | null>(0)
  const [tax, setTax] = useState<number | null>(0)
  const [autoTax, setAutoTax] = useState(settings.taxRatePct > 0)
  const [date, setDate] = useState(now.date)
  const [time, setTime] = useState(now.time)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newCustomer, setNewCustomer] = useState(false)

  const add = (productId: string) => {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    setLines((ls) => ls.some((l) => l.productId === productId) ? ls.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { key: crypto.randomUUID?.() ?? String(Math.random()), productId, qty: 1, unitPrice: p.sellPrice }])
    setPick('')
  }
  const subtotal = lines.reduce((a, l) => a + l.qty * (l.unitPrice ?? 0), 0)
  const taxAmt = autoTax ? Math.round(((subtotal - (discount ?? 0)) * settings.taxRatePct) / 100) : tax ?? 0
  const total = subtotal - (discount ?? 0) + taxAmt
  const balance = total - (received ?? 0)
  const day = date ? zoned(wallToIso(date, time || '00:00', tz), tz).weekday : ''
  const filtered = products.filter((p) => !pick || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(pick.toLowerCase())).slice(0, 8)

  const submit = async () => {
    setErr(null)
    if (!lines.length) return setErr('Add at least one product.')
    if (lines.some((l) => l.unitPrice == null)) return setErr('Every line needs a price.')
    if (!date) return setErr('Choose the sale date.')
    setBusy(true)
    try {
      const r = await createOrder({ id: submissionId, personId: personId || null, items: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice! })), discount: discount ?? 0, tax: taxAmt, method, at: wallToIso(date, time || '00:00', tz), notes, attachmentIds: attachments, received: received ?? 0 })
      toast(r.duplicate ? `Already saved as ${r.order.orderNo}` : `Sale ${r.order.orderNo} saved`, r.duplicate ? 'info' : 'success')
      go(`sales/${r.order.id}`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div>
      <BackLink to="/glamiex/sales" label="Sales" />
      <form className="space-y-4 pb-4" onSubmit={(e) => { e.preventDefault(); void submit() }} noValidate>
        <Section title="Products" icon={ShoppingCart}>
          <div className="relative">
            <Input aria-label="Search products to add" placeholder={products.length ? 'Search product name or SKU…' : 'No active products — add one first'} value={pick} onChange={(e) => setPick(e.target.value)} disabled={!products.length} />
            {(pick || !lines.length) && products.length > 0 && (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Products">
                {filtered.map((p) => {
                  const st = stockOf(p.id, data.stock)
                  return <li key={p.id}><button type="button" onClick={() => add(p.id)} className="card flex min-h-[56px] w-full items-center justify-between gap-2 p-3 text-left text-sm active:scale-[0.99]">
                    <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className={cn('text-xs', st <= 0 ? 'text-danger' : st <= p.lowStockAt ? 'text-warn' : 'text-muted')}>{p.sku} · stock {st}</span></span>
                    <Money v={p.sellPrice} />
                  </button></li>
                })}
                {!filtered.length && <li className="text-sm text-muted">No product matches “{pick}”.</li>}
              </ul>
            )}
          </div>
          {lines.length > 0 && (
            <ul className="mt-3 space-y-2">
              {lines.map((l) => {
                const p = products.find((x) => x.id === l.productId)!
                const st = stockOf(l.productId, data.stock)
                return (
                  <li key={l.key} className="rounded-2xl border border-line p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.name}</div><div className={cn('text-xs', l.qty > st && !settings.allowNegativeStock ? 'text-danger' : 'text-muted')}>{p.sku} · {st} in stock{l.qty > st && !settings.allowNegativeStock ? ' — not enough' : ''}</div></div>
                      <IconButton icon={Trash2} label={`Remove ${p.name}`} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} />
                    </div>
                    <div className="mt-2 grid grid-cols-[auto_1fr] items-end gap-3 sm:grid-cols-[auto_1fr_auto]">
                      <div><div className="label">Quantity</div>
                        <div className="flex items-center gap-1">
                          <IconButton icon={Minus} label="Decrease quantity" className="h-11 w-11 border border-line" onClick={() => setLines(lines.map((x) => (x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} />
                          <Input aria-label="Quantity" inputMode="numeric" pattern="[0-9]*" className="w-16 text-center" value={l.qty} onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, qty: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) } : x)))} />
                          <IconButton icon={Plus} label="Increase quantity" className="h-11 w-11 border border-line" onClick={() => setLines(lines.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)))} />
                        </div>
                      </div>
                      <Field label="Unit price" htmlFor={`price-${l.key}`}><MoneyInput id={`price-${l.key}`} value={l.unitPrice} onChange={(v) => setLines(lines.map((x) => (x.key === l.key ? { ...x, unitPrice: v } : x)))} /></Field>
                      <div className="col-span-2 text-right text-sm sm:col-span-1">Line: <b><Money v={l.qty * (l.unitPrice ?? 0)} /></b></div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        <Section title="Customer, date & payment" icon={Wallet}>
          <FormGrid>
            <Field label="Customer" htmlFor="s-cust">
              <div className="flex gap-2">
                <Select id="s-cust" value={personId} onChange={(e) => setPersonId(e.target.value)}><option value="">Walk-in customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</Select>
                <IconButton icon={UserPlus} label="New customer" className="h-10 w-10 border border-line" onClick={() => setNewCustomer(true)} />
              </div>
            </Field>
            <Field label="Sale date" htmlFor="s-date" hint={day}><Input id="s-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Sale time" htmlFor="s-time" hint={tz}><Input id="s-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Discount" htmlFor="s-disc"><MoneyInput id="s-disc" value={discount} onChange={setDiscount} /></Field>
            <Field label={autoTax ? `Tax (${settings.taxRatePct}% auto)` : 'Tax'} htmlFor="s-tax">
              {autoTax ? <div className="input flex items-center justify-between"><span className="text-muted">Rs</span><span className="tabular-nums">{(taxAmt / 100).toLocaleString('en-PK')}</span></div> : <MoneyInput id="s-tax" value={tax} onChange={setTax} />}
              {settings.taxRatePct > 0 && <Checkbox className="mt-1 text-xs" label="Calculate automatically" checked={autoTax} onChange={setAutoTax} />}
            </Field>
            <Field label="Payment method" htmlFor="s-method"><Select id="s-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
            <Field label="Amount received now" htmlFor="s-recv" hint="Leave empty for an unpaid / credit sale">
              <MoneyInput id="s-recv" value={received} onChange={setReceived} />
              <div className="mt-1 flex gap-2"><button type="button" className="text-xs text-accent underline" onClick={() => setReceived(total)}>Paid in full</button><button type="button" className="text-xs text-muted underline" onClick={() => setReceived(null)}>Unpaid</button></div>
            </Field>
            <Field label="Notes" htmlFor="s-notes" className="sm:col-span-2"><Textarea id="s-notes" className="min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </FormGrid>
          <div className="mt-4"><AttachmentField label="Receipt / proof / video" ids={attachments} onChange={setAttachments} tag="order-evidence" /></div>
        </Section>

        {err && <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{err}</p>}
        <ActionBar className="justify-between">
          <div className="text-sm leading-tight">
            <div className="text-xs text-muted">Subtotal <Money v={subtotal} /> − disc. <Money v={discount ?? 0} /> + tax <Money v={taxAmt} /></div>
            <div className="text-lg font-bold">Total <Money v={total} /></div>
            {received != null && <div className={cn('text-xs', balance > 0 ? 'text-warn' : balance < 0 ? 'text-danger' : 'text-ok')}>{balance > 0 ? `Balance due ${pkr(balance)}` : balance < 0 ? `Over-payment ${pkr(-balance)}` : 'Fully paid'}</div>}
          </div>
          <div className="flex gap-2"><Button onClick={() => go('sales')}>Cancel</Button><Button type="submit" variant="primary" size="lg" loading={busy} disabled={!lines.length}>Save sale</Button></div>
        </ActionBar>
      </form>
      <QuickCustomer open={newCustomer} onClose={() => setNewCustomer(false)} onCreated={setPersonId} />
    </div>
  )
}

function QuickCustomer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="New customer" footer={<><Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!name.trim()} onClick={async () => {
        const p = await safeWrite(() => gxPeopleRepo.create({ name: name.trim(), phone, type: 'customer' }), 'Customer added')
        if (p) { await gxAudit('person', p.id, 'create', p.name); onCreated(p.id); setName(''); setPhone(''); onClose() }
      }}>Add customer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="qc-name"><Input id="qc-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone" htmlFor="qc-phone"><Input id="qc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

/* ---------------- Order detail ---------------- */
function OrderDetail({ id }: { id: string }) {
  const { data, tz, go } = useGx()
  const o = data.orders.find((x) => x.id === id)
  const [payOpen, setPayOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  if (!o) return <div><BackLink to="/glamiex/sales" label="Sales" /><EmptyState icon={ShoppingCart} title="Order not found" /></div>
  const b = orderBalance(o, data.payments, data.refunds)
  const z = zoned(o.at, tz)
  const person = data.people.find((p) => p.id === o.personId)
  const pays = data.payments.filter((p) => p.allocations.some((a) => a.orderId === id) || p.reference === o.orderNo)
  const refunds = data.refunds.filter((r) => r.orderId === id && !r.deletedAt)
  const customers = live(data.people).filter((p) => p.type === 'customer')

  return (
    <div className="space-y-4">
      <BackLink to="/glamiex/sales" label="Sales" />
      <div className="card flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-mono text-lg font-bold">{o.orderNo}</h2><PayBadge s={b.status} /></div>
          <p className="text-sm text-muted">{z.weekday}, {z.date} at {z.time} ({tz}) · {PAYMENT_METHODS.find((m) => m.id === o.method)?.label}</p>
          {o.status === 'cancelled' && <p className="mt-1 text-sm text-danger">Cancelled{o.cancelReason ? `: ${o.cancelReason}` : ''}. Excluded from sales; stock returned.</p>}
        </div>
        {o.status !== 'cancelled' && <div className="flex flex-wrap gap-2">
          {b.balance > 0 && <Button variant="primary" icon={Wallet} onClick={() => setPayOpen(true)}>Record payment</Button>}
          {o.status === 'completed' || b.refunded < b.total ? <Button icon={RotateCcw} onClick={() => setRefundOpen(true)} disabled={b.refunded >= b.total}>Refund</Button> : null}
          {o.status === 'completed' && !refunds.length && <Button variant="ghost" icon={Ban} onClick={() => setCancelOpen(true)}>Cancel sale</Button>}
        </div>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Subtotal"><Money v={orderGross(o)} /></Stat>
        <Stat label="Discount"><Money v={o.discount} /></Stat>
        <Stat label="Tax"><Money v={o.tax} /></Stat>
        <Stat label="Total payable"><Money v={b.total} /></Stat>
        <Stat label="Received" tone="ok"><Money v={b.paid} /></Stat>
        <Stat label={b.balance < 0 ? 'Customer credit' : 'Remaining balance'} tone={b.balance > 0 ? 'warn' : undefined}><Money v={Math.abs(b.balance)} /></Stat>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Items (price & cost at time of sale)" icon={Receipt}>
          <ul className="divide-y divide-line/60">{o.items.map((i, k) => (
            <li key={k} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <Link to={`/glamiex/products/${i.productId}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">{i.name} <span className="text-xs text-muted">{i.sku}</span></Link>
              <span>{i.qty} × <Money v={i.unitPrice} /></span><span className="w-24 text-right font-semibold"><Money v={i.qty * i.unitPrice} /></span>
              <span className="w-full text-xs text-muted">Cost {i.qty} × {pkr(i.unitCost)} · line profit <Money v={i.qty * (i.unitPrice - i.unitCost)} tone /></span>
            </li>
          ))}</ul>
        </Section>
        <Section title="Customer & notes" icon={Wallet}>
          <Field label="Customer" htmlFor="od-cust">
            <Select id="od-cust" value={o.personId ?? ''} onChange={(e) => void safeWrite(() => updateOrderInfo(id, { personId: e.target.value || null }), 'Customer updated')}>
              <option value="">Walk-in customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {person && <Link to={`/glamiex/people/${person.id}`} className="mt-1 inline-block text-xs text-accent">Open {person.name}'s account →</Link>}
          <Field label="Notes" htmlFor="od-notes" className="mt-3"><Textarea id="od-notes" defaultValue={o.notes} onBlur={(e) => e.target.value !== o.notes && void safeWrite(() => updateOrderInfo(id, { notes: e.target.value }), 'Notes saved')} /></Field>
          <div className="mt-3"><AttachmentField label="Receipts, proof & videos" ids={o.attachmentIds} onChange={(ids) => void safeWrite(() => updateOrderInfo(id, { attachmentIds: ids }))} tag="order-evidence" /></div>
        </Section>
        <Section title={`Payments (${pays.length})`} icon={Wallet}>
          {!pays.length ? <p className="text-sm text-muted">No payments recorded.</p> : <ul className="divide-y divide-line/60">{pays.map((p) => (
            <li key={p.id} className={cn('flex flex-wrap items-center gap-2 py-2 text-sm', p.voided && 'line-through opacity-60')}>
              <Link to={`/glamiex/payments/${p.id}`} className="font-mono text-xs hover:text-accent">{p.txnNo}</Link><Badge>{p.type.replace('_', ' ')}</Badge>
              <span className="flex-1 text-xs text-muted">{zoned(p.at, tz).date}</span>
              <b><Money v={p.allocations.find((a) => a.orderId === id)?.amount ?? p.amount} /></b>
            </li>))}</ul>}
        </Section>
        <Section title={`Refunds (${refunds.length})`} icon={RotateCcw} defaultOpen={refunds.length > 0}>
          {!refunds.length ? <p className="text-sm text-muted">No refunds.</p> : <ul className="divide-y divide-line/60">{refunds.map((r) => (
            <li key={r.id} className="py-2 text-sm"><div className="flex items-center gap-2"><span className="flex-1">{zoned(r.at, tz).date} {r.reason && `— ${r.reason}`}</span><b className="text-danger">−<Money v={r.amount} /></b></div>
              {r.restock.length > 0 && <div className="text-xs text-muted">Restocked: {r.restock.map((x) => `${x.qty}× ${o.items.find((i) => i.productId === x.productId)?.name}`).join(', ')}</div>}</li>
          ))}</ul>}
        </Section>
      </div>
      <OrderPaymentModal open={payOpen} order={o} balance={b.balance} onClose={() => setPayOpen(false)} />
      <RefundModal key={refundOpen ? 'open' : 'closed'} open={refundOpen} order={o} max={b.total - b.refunded} paid={b.paid} onClose={() => setRefundOpen(false)} />
      <ConfirmText open={cancelOpen} danger needReason title={`Cancel ${o.orderNo}?`} label="Cancel sale" onClose={() => setCancelOpen(false)}
        body={<>The sale is kept for the audit trail but excluded from all sales and profit figures, and its {orderUnits(o)} unit(s) return to stock. Any payments already received ({pkr(b.paid)}) stay on the customer's account as credit. This cannot be undone.</>}
        onConfirm={async (reason) => { await cancelOrder(id, reason); toast('Sale cancelled'); go(`sales/${id}`) }} />
    </div>
  )
}

function OrderPaymentModal({ open, order, balance, onClose }: { open: boolean; order: GxOrder; balance: number; onClose: () => void }) {
  const { tz } = useGx()
  const [sub] = useState(newSubmissionId)
  const [amount, setAmount] = useState<number | null>(balance)
  const [method, setMethod] = useState<PaymentMethod>(order.method)
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const n = nowLocal(tz)
  return (
    <Modal open={open} onClose={onClose} title={`Payment for ${order.orderNo}`} footer={<><Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!amount || amount <= 0} onClick={async () => {
        setBusy(true)
        try {
          await addPayment({ id: sub, personId: order.personId, type: 'customer_payment', amount: amount!, method, at: wallToIso(n.date, n.time, tz), reference: ref || order.orderNo, allocations: [{ orderId: order.id, amount: Math.min(amount!, balance) }], notes: amount! > balance ? 'Excess kept as customer credit' : '', attachmentIds: [] })
          toast('Payment recorded'); onClose()
        } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
      }}>Save payment</Button></>}>
      <p className="mb-3 text-sm text-muted">Balance due: <b className="text-fg">{pkr(balance)}</b>. Any amount above the balance stays as customer credit.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" htmlFor="op-amt"><MoneyInput id="op-amt" value={amount} onChange={setAmount} /></Field>
        <Field label="Method" htmlFor="op-m"><Select id="op-m" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        <Field label="Reference / transaction ID" htmlFor="op-ref" className="sm:col-span-2"><Input id="op-ref" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function RefundModal({ open, order, max, paid, onClose }: { open: boolean; order: GxOrder; max: number; paid: number; onClose: () => void }) {
  const { data, tz } = useGx()
  const prior = data.refunds.filter((r) => r.orderId === order.id && !r.deletedAt)
  const remaining = (pid: string) => order.items.filter((i) => i.productId === pid).reduce((a, i) => a + i.qty, 0) - prior.flatMap((r) => r.restock).filter((x) => x.productId === pid).reduce((a, x) => a + x.qty, 0)
  const products = [...new Set(order.items.map((i) => i.productId))]
  const [qty, setQty] = useState<Record<string, number>>({})
  const [amount, setAmount] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [payNowTouched, setPayNowTouched] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const suggested = products.reduce((a, pid) => a + (qty[pid] ?? 0) * (order.items.find((i) => i.productId === pid)?.unitPrice ?? 0), 0)
  const refundAmt = amount ?? Math.min(suggested, max)
  // Cash goes back only if the customer has paid more than they will owe after this refund.
  const overpaid = paid - (max - refundAmt)
  const payNow = payNowTouched ?? overpaid > 0
  const setPayNow = (v: boolean) => setPayNowTouched(v)
  const n = nowLocal(tz)
  return (
    <Modal open={open} onClose={onClose} title={`Refund ${order.orderNo}`} wide footer={<><Button onClick={onClose}>Cancel</Button>
      <Button variant="danger" loading={busy} disabled={!(amount ?? suggested)} onClick={async () => {
        setBusy(true)
        try {
          await refundOrder({ orderId: order.id, amount: amount ?? Math.min(suggested, max), restock: products.map((pid) => ({ productId: pid, qty: qty[pid] ?? 0 })), reason, at: wallToIso(n.date, n.time, tz), payNow, method: order.method })
          toast('Refund recorded'); onClose()
        } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
      }}>Record refund</Button></>}>
      <p className="mb-3 text-sm text-muted">Refunds are separate records — the original sale is never edited. Up to <b className="text-fg">{pkr(max)}</b> can still be refunded.</p>
      <div className="mb-3 space-y-2">{products.map((pid) => {
        const it = order.items.find((i) => i.productId === pid)!
        const left = remaining(pid)
        return <div key={pid} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{it.name} <span className="text-xs text-muted">({left} returnable)</span></span>
          <label className="flex items-center gap-2 text-xs">Return to stock<Input inputMode="numeric" className="w-20 text-center" value={qty[pid] ?? 0} onChange={(e) => setQty({ ...qty, [pid]: Math.min(left, Number(e.target.value.replace(/\D/g, '')) || 0) })} aria-label={`Units of ${it.name} returned`} /></label>
        </div>
      })}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Refund amount" htmlFor="rf-amt" hint={suggested ? `Suggested from returned items: ${pkr(Math.min(suggested, max))}` : 'Enter an amount (e.g. partial refund without returns)'}><MoneyInput id="rf-amt" value={amount} onChange={setAmount} placeholder={suggested ? String(Math.min(suggested, max) / 100) : '0'} /></Field>
        <Field label="Reason" htmlFor="rf-r"><Input id="rf-r" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <Checkbox className="mt-3" label="Money paid back to the customer now (records a 'refund paid' cash-out)" checked={payNow} onChange={setPayNow} />
      <p className="mt-1 text-xs text-muted">{overpaid > 0 ? `The customer has paid ${pkr(Math.min(overpaid, refundAmt))} more than they will owe, so cash back is suggested.` : 'Leave unticked to credit the refund against what the customer still owes.'}</p>
    </Modal>
  )
}

