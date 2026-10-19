import { useMemo, useState } from 'react'
import { Minus, Plus, Trash2, Truck } from 'lucide-react'
import { Badge, Button, EmptyState, Field, IconButton, Input, Select, Textarea } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { saveShipment, setShipmentStatus, trashShipment, type ShipmentInput } from '@/features/glamiex/logisticsService'
import { baseRate, shipmentCost, shipmentEarning, shipmentUnits } from '@/features/glamiex/logistics'
import { pkr } from '@/features/glamiex/money'
import { inRange, zoned } from '@/features/glamiex/time'
import { AttachmentField, DataTable, ExportButtons, KpiCard, Money, MoneyInput, RangeBar, Section, rs, useRange, type Col } from '@/features/glamiex/ui'
import { FINAL_SHIPMENT, RATE_RULES, SHIPMENT_STATUSES, type GxShipment, type ShipmentStatus } from '@/features/glamiex/types'
import { useGx, live } from '../context'
import { ActionBar, BackLink, FormGrid, Stat } from './shared'

export const shipLabel = (s: ShipmentStatus) => SHIPMENT_STATUSES.find((x) => x.id === s)?.label ?? s
const shipTone = (s: ShipmentStatus) => (s === 'delivered' ? 'ok' : s === 'failed' || s === 'returned' ? 'danger' : s === 'cancelled' ? 'muted' : 'warn') as 'ok' | 'danger' | 'muted' | 'warn'
export function ShipBadge({ s }: { s: ShipmentStatus }) { return <Badge tone={shipTone(s)}>{shipLabel(s)}</Badge> }

export default function Deliveries({ id }: { id?: string }) {
  if (id === 'new') return <ShipmentForm item={null} />
  if (id) return <ShipmentEdit id={id} />
  return <ShipmentList />
}

function StatusPicker({ s }: { s: GxShipment }) {
  return (
    <Select aria-label={`Status of ${s.shipmentNo}`} className="h-9 w-auto min-w-[9rem] py-1 text-xs" value={s.status} onClick={(e) => e.stopPropagation()}
      onChange={async (e) => { try { await setShipmentStatus(s.id, e.target.value as ShipmentStatus); toast(`${s.shipmentNo}: ${shipLabel(e.target.value as ShipmentStatus)}`, 'success', undefined, 1200) } catch (err) { toast((err as Error).message, 'error') } }}>
      {SHIPMENT_STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
    </Select>
  )
}

function ShipmentList() {
  const { data, tz, go } = useGx()
  const { state, setState, range } = useRange('deliveries', tz, 'thisMonth')
  const [status, setStatus] = useState<ShipmentStatus | ''>('')
  const [partner, setPartner] = useState('')
  const all = state.preset === 'all'
  const partners = new Map(data.partners.map((p) => [p.id, p]))
  const orders = new Map(data.orders.map((o) => [o.id, o.orderNo]))
  const day = (s: GxShipment) => zoned(s.finalAt ?? s.dispatchAt ?? new Date(s.createdAt).toISOString(), tz).date
  const rows = useMemo(() => live(data.shipments).filter((s) => (all || inRange(day(s), range)) && (!status || s.status === status) && (!partner || (partner === '-' ? !s.partnerId : s.partnerId === partner))),
    [data.shipments, all, range.from, range.to, status, partner, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const delivered = rows.filter((s) => s.status === 'delivered')
  const cols: Col<GxShipment>[] = [
    { key: 'no', label: 'Delivery', render: (s) => <div><span className="font-mono text-xs">{s.shipmentNo}</span>{s.trackingNo && <div className="text-xs text-muted">#{s.trackingNo}</div>}</div>, sort: (s) => s.shipmentNo, text: (s) => `${s.shipmentNo} ${s.trackingNo} ${s.customerName} ${s.customerPhone} ${s.customerAddress} ${orders.get(s.orderId ?? '') ?? ''} ${partners.get(s.partnerId ?? '')?.name ?? ''} ${s.items.map((i) => i.name).join(' ')}` },
    { key: 'order', label: 'Order', render: (s) => <span className="font-mono text-xs">{orders.get(s.orderId ?? '') ?? '—'}</span>, sort: (s) => orders.get(s.orderId ?? '') ?? '' },
    { key: 'cust', label: 'Customer', render: (s) => <div><div>{s.customerName || '—'}</div><div className="max-w-[14rem] truncate text-xs text-muted">{s.customerPhone} {s.customerAddress}</div></div>, sort: (s) => s.customerName },
    { key: 'items', label: 'Products', render: (s) => <span className="text-xs">{s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span>, sort: (s) => shipmentUnits(s) },
    { key: 'rider', label: 'Rider / courier', render: (s) => partners.get(s.partnerId ?? '')?.name ?? <span className="text-muted">Unassigned</span>, sort: (s) => partners.get(s.partnerId ?? '')?.name ?? '' },
    { key: 'exp', label: 'Expected', render: (s) => s.expectedDate || '—', sort: (s) => s.expectedDate },
    { key: 'chg', label: 'Customer paid', align: 'right', render: (s) => <Money v={s.customerCharge} />, sort: (s) => s.customerCharge },
    { key: 'cost', label: 'Delivery cost', align: 'right', render: (s) => <Money v={shipmentCost(s)} />, sort: (s) => shipmentCost(s) },
    { key: 'st', label: 'Status', render: (s) => <StatusPicker s={s} />, sort: (s) => s.status },
  ]
  return (
    <div className="space-y-3">
      <RangeBar state={state} setState={setState} range={range} extra={<Button variant="primary" icon={Plus} onClick={() => go('deliveries/new')}>New delivery</Button>} />
      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Delivered orders" value={delivered.length} kind="count" sub={`${delivered.reduce((a, s) => a + shipmentUnits(s), 0)} products`} />
        <KpiCard label="Failed deliveries" value={rows.filter((s) => s.status === 'failed').length} kind="count" tone="danger" />
        <KpiCard label="Returned to sender" value={rows.filter((s) => s.status === 'returned').length} kind="count" />
        <KpiCard label="In progress" value={rows.filter((s) => !FINAL_SHIPMENT.includes(s.status)).length} kind="count" tone="warn" />
        <KpiCard label="Delivery charges collected" value={delivered.reduce((a, s) => a + s.customerCharge, 0)} tone="ok" />
        <KpiCard label="Delivery costs" value={rows.reduce((a, s) => a + shipmentCost(s), 0)} invert />
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(s) => s.id} onRowClick={(s) => go(`deliveries/${s.id}`)} initialSort={{ key: 'no', dir: -1 }} empty="No deliveries in this period."
        toolbar={<>
          <Select aria-label="Status filter" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus | '')}><option value="">All statuses</option>{SHIPMENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
          <Select aria-label="Rider filter" className="w-auto" value={partner} onChange={(e) => setPartner(e.target.value)}><option value="">All riders</option><option value="-">Unassigned / external</option>{live(data.partners).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <ExportButtons name="Deliveries" period={all ? 'All time' : `${range.from} to ${range.to}`} sheets={() => [{ name: 'Deliveries', rows: [
            ['Delivery', 'Order', 'Customer', 'Phone', 'Address', 'Products', 'Units', 'Rider / courier', 'Dispatched', 'Expected', 'Delivered', 'Status', 'Tracking', 'Customer paid (Rs)', 'Rider earning (Rs)', 'Delivery cost (Rs)'],
            ...rows.map((s) => [s.shipmentNo, orders.get(s.orderId ?? '') ?? '', s.customerName, s.customerPhone, s.customerAddress, s.items.map((i) => `${i.qty}× ${i.name}`).join(', '), shipmentUnits(s), partners.get(s.partnerId ?? '')?.name ?? '',
              s.dispatchAt ? zoned(s.dispatchAt, tz).date : '', s.expectedDate, s.deliveredAt ? zoned(s.deliveredAt, tz).date : '', shipLabel(s.status), s.trackingNo, rs(s.customerCharge), rs(shipmentEarning(s)), rs(shipmentCost(s))]),
          ] }]} />
        </>}
        card={(s) => <div>
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium">{s.customerName || 'Customer'}</div><div className="truncate text-xs text-muted">{s.shipmentNo} · {s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div></div><span className="text-xs text-muted">{partners.get(s.partnerId ?? '')?.name ?? 'Unassigned'}</span></div>
          <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-muted">{s.customerPhone}</span><StatusPicker s={s} /></div>
        </div>} />
    </div>
  )
}

function ShipmentEdit({ id }: { id: string }) {
  const { data } = useGx()
  const s = data.shipments.find((x) => x.id === id)
  if (!s || s.deletedAt) return <div><BackLink to="/glamiex/deliveries" label="Deliveries" /><EmptyState icon={Truck} title="Delivery not found" /></div>
  return <ShipmentForm item={s} />
}

function ShipmentForm({ item }: { item: GxShipment | null }) {
  const { data, tz, go } = useGx()
  const orders = useMemo(() => live(data.orders).filter((o) => o.status !== 'cancelled').sort((a, b) => b.at.localeCompare(a.at)), [data.orders])
  const partners = live(data.partners).filter((p) => p.status === 'active' || p.id === item?.partnerId)
  const products = live(data.products)
  const [f, setF] = useState<ShipmentInput>(() => item ? {
    orderId: item.orderId, customerName: item.customerName, customerAddress: item.customerAddress, customerPhone: item.customerPhone, items: item.items, partnerId: item.partnerId, distanceKm: item.distanceKm,
    expectedDate: item.expectedDate, customerCharge: item.customerCharge, actualCost: item.actualCost, extraCharge: item.extraCharge, trackingNo: item.trackingNo, proofIds: item.proofIds, notes: item.notes, attachmentIds: item.attachmentIds,
  } : { orderId: null, customerName: '', customerAddress: '', customerPhone: '', items: [], partnerId: null, distanceKm: null, expectedDate: '', customerCharge: 0, actualCost: 0, extraCharge: 0, trackingNo: '', proofIds: [], notes: '', attachmentIds: [] })
  const set = <K extends keyof ShipmentInput>(k: K, v: ShipmentInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const order = orders.find((o) => o.id === f.orderId)
  const shippedElsewhere = (pid: string) => live(data.shipments).filter((s) => s.orderId === f.orderId && s.id !== item?.id && !['cancelled', 'returned', 'failed'].includes(s.status)).flatMap((s) => s.items).filter((i) => i.productId === pid).reduce((a, i) => a + i.qty, 0)
  const pickOrder = (orderId: string) => {
    const o = orders.find((x) => x.id === orderId)
    const person = data.people.find((p) => p.id === o?.personId)
    const lines = o ? [...o.items.reduce((m, i) => m.set(i.productId, { productId: i.productId, name: i.name, qty: (m.get(i.productId)?.qty ?? 0) + i.qty }), new Map<string, { productId: string; name: string; qty: number }>()).values()] : []
    setF((x) => ({ ...x, orderId: orderId || null, customerName: person?.name ?? x.customerName, customerPhone: person?.phone ?? x.customerPhone, customerAddress: person?.address ?? x.customerAddress,
      items: lines.map((l) => ({ ...l, qty: Math.max(0, l.qty - live(data.shipments).filter((s) => s.orderId === orderId && s.id !== item?.id && !['cancelled', 'returned', 'failed'].includes(s.status)).flatMap((s) => s.items).filter((i) => i.productId === l.productId).reduce((a, i) => a + i.qty, 0)) })) }))
  }
  const partner = partners.find((p) => p.id === f.partnerId)
  const rate = item?.partnerId === f.partnerId && item?.rate ? item.rate : partner ? { rule: partner.rateRule, perOrder: partner.perOrder, perProduct: partner.perProduct, perKm: partner.perKm } : null
  const preview = rate ? baseRate({ failed: 'none', failedFixed: 0, returned: 'none', returnedFixed: 0, ...rate }, f.items.reduce((a, i) => a + i.qty, 0), f.distanceKm) + f.extraCharge : f.actualCost
  const save = async () => {
    setErr(null); setBusy(true)
    try { const sid = await saveShipment(f, item?.id ?? null); toast(item ? 'Delivery updated' : 'Delivery created'); go(item ? 'deliveries' : `deliveries/${sid}`) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const final = item && FINAL_SHIPMENT.includes(item.status)
  return (
    <div>
      <BackLink to="/glamiex/deliveries" label="Deliveries" />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
        <Section title={item ? `${item.shipmentNo} · ${shipLabel(item.status)}` : 'New delivery'} icon={Truck} actions={item && <StatusPicker s={item} />}>
          {item && <p className="mb-3 text-xs text-muted">Dispatched {item.dispatchAt ? zoned(item.dispatchAt, tz).date + ' ' + zoned(item.dispatchAt, tz).time : '—'} · Delivered {item.deliveredAt ? zoned(item.deliveredAt, tz).date + ' ' + zoned(item.deliveredAt, tz).time : '—'}</p>}
          <FormGrid>
            <Field label="Order (optional)" htmlFor="sf-o"><Select id="sf-o" value={f.orderId ?? ''} onChange={(e) => pickOrder(e.target.value)}><option value="">— No order / manual —</option>{orders.slice(0, 500).map((o) => <option key={o.id} value={o.id}>{o.orderNo} · {zoned(o.at, tz).date} · {data.people.find((p) => p.id === o.personId)?.name ?? 'Walk-in'}</option>)}</Select></Field>
            <Field label="Customer name" htmlFor="sf-cn"><Input id="sf-cn" value={f.customerName} onChange={(e) => set('customerName', e.target.value)} /></Field>
            <Field label="Phone" htmlFor="sf-ph"><Input id="sf-ph" inputMode="tel" value={f.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} /></Field>
            <Field label="Address" htmlFor="sf-ad" className="sm:col-span-2"><Textarea id="sf-ad" className="min-h-[44px]" value={f.customerAddress} onChange={(e) => set('customerAddress', e.target.value)} /></Field>
            <Field label="Expected delivery date" htmlFor="sf-ex"><Input id="sf-ex" type="date" value={f.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} /></Field>
          </FormGrid>
        </Section>
        <Section title="Products in this shipment" icon={Truck}>
          <ul className="space-y-2">
            {f.items.map((i, k) => {
              const ordered = order?.items.filter((x) => x.productId === i.productId).reduce((a, x) => a + x.qty, 0)
              return (
                <li key={k} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{i.name}{ordered != null && <span className="text-xs text-muted"> · ordered {ordered}, in other shipments {shippedElsewhere(i.productId)}</span>}</span>
                  <IconButton icon={Minus} label="Less" onClick={() => set('items', f.items.map((x, j) => (j === k ? { ...x, qty: Math.max(0, x.qty - 1) } : x)))} />
                  <Input aria-label={`Quantity of ${i.name}`} className="w-16 text-center" type="number" inputMode="numeric" value={i.qty} onChange={(e) => set('items', f.items.map((x, j) => (j === k ? { ...x, qty: Number(e.target.value) } : x)))} />
                  <IconButton icon={Plus} label="More" onClick={() => set('items', f.items.map((x, j) => (j === k ? { ...x, qty: x.qty + 1 } : x)))} />
                  <IconButton icon={Trash2} label={`Remove ${i.name}`} onClick={() => set('items', f.items.filter((_, j) => j !== k))} />
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Select aria-label="Add product" className="w-auto min-w-[12rem]" value="" onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (p) set('items', [...f.items, { productId: p.id, name: p.name, qty: 1 }]) }}>
              <option value="">+ Add product…</option>{products.filter((p) => !f.items.some((i) => i.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</Select>
          </div>
          <p className="mt-2 text-xs text-muted">Shipping does not change stock — stock was already deducted when the sale was recorded. One order can be split across several shipments.</p>
        </Section>
        <Section title="Rider, charges and tracking" icon={Truck}>
          {final && <p className="mb-2 text-xs text-warn">This delivery is finished; change its status back to edit the rider.</p>}
          <FormGrid>
            <Field label="Rider / delivery company" htmlFor="sf-p"><Select id="sf-p" disabled={!!final} value={f.partnerId ?? ''} onChange={(e) => set('partnerId', e.target.value || null)}><option value="">None (external courier)</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code && ` (${p.code})`}</option>)}</Select></Field>
            {partner && <Field label="Rate rule" htmlFor="sf-rule" hint="Set on the partner; copied when assigned"><Input id="sf-rule" disabled value={RATE_RULES.find((r) => r.id === (rate?.rule ?? partner.rateRule))?.label} /></Field>}
            {rate?.rule === 'per_km' && <Field label="Distance (km)" htmlFor="sf-km"><Input id="sf-km" type="number" inputMode="decimal" min={0} value={f.distanceKm ?? ''} onChange={(e) => set('distanceKm', e.target.value === '' ? null : Number(e.target.value))} /></Field>}
            <Field label="Delivery charge paid by customer" htmlFor="sf-cc"><MoneyInput id="sf-cc" value={f.customerCharge} onChange={(v) => set('customerCharge', v ?? 0)} /></Field>
            {partner ? <Field label="Special charge for rider" htmlFor="sf-xc" hint="Added to the rider's pay when delivered"><MoneyInput id="sf-xc" value={f.extraCharge} onChange={(v) => set('extraCharge', v ?? 0)} /></Field>
              : <Field label="Actual delivery cost (external courier)" htmlFor="sf-ac"><MoneyInput id="sf-ac" value={f.actualCost} onChange={(v) => set('actualCost', v ?? 0)} /></Field>}
            <Field label="Tracking number" htmlFor="sf-tr"><Input id="sf-tr" value={f.trackingNo} onChange={(e) => set('trackingNo', e.target.value)} /></Field>
            <Field label="Notes" htmlFor="sf-n"><Textarea id="sf-n" className="min-h-[44px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </FormGrid>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label={partner ? 'Rider pay if delivered' : 'Delivery cost'}><Money v={preview} /></Stat>
            <Stat label="Customer paid"><Money v={f.customerCharge} /></Stat>
            <Stat label="Delivery margin" tone={f.customerCharge - preview >= 0 ? 'ok' : 'danger'}><Money v={f.customerCharge - preview} /></Stat>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <AttachmentField label="Proof of delivery" ids={f.proofIds} onChange={(ids) => set('proofIds', ids)} accept="image" tag="delivery-proof" />
            <AttachmentField label="Other attachments" ids={f.attachmentIds} onChange={(ids) => set('attachmentIds', ids)} tag="delivery-attachment" />
          </div>
        </Section>
        {err && <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{err}</p>}
        <ActionBar>
          {item && <Button variant="ghost" onClick={async () => {
            if (!(await confirm({ title: `Delete ${item.shipmentNo}?`, body: 'It moves to Trash and no longer counts in rider pay or delivery costs.', danger: true, confirmLabel: 'Delete' }))) return
            try { await trashShipment(item.id); toast('Deleted'); go('deliveries') } catch (e) { toast((e as Error).message, 'error') }
          }}>Delete</Button>}
          <Button onClick={() => go('deliveries')}>Cancel</Button><Button type="submit" variant="primary" size="lg" loading={busy}>Save delivery</Button>
        </ActionBar>
      </form>
      {item && <p className="mt-2 text-xs text-muted">Rider pay so far for this delivery: {pkr(shipmentEarning(item))} (final statuses only).</p>}
    </div>
  )
}
