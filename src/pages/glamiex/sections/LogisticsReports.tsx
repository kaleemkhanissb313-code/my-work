import { useMemo, useState } from 'react'
import { FileBarChart } from 'lucide-react'
import { Input, Select } from '@/components/ui'
import { pickupEarning, returnCalc, shipmentCost, shipmentUnits } from '@/features/glamiex/logistics'
import { bucketOf, inRange, zoned, type Grouping } from '@/features/glamiex/time'
import { ExportButtons, Money, RangeBar, Section, rs, useRange } from '@/features/glamiex/ui'
import { RETURN_STATUSES, SHIPMENT_STATUSES } from '@/features/glamiex/types'
import { useGx, live } from '../context'
import { earliestDate } from './shared'

type G = Exclude<Grouping, 'hour' | 'quarter'>
interface Row { key: string; label: string; returns: number; units: number; refunds: number; returnCost: number; stockCost: number; delivered: number; products: number; failed: number; deliveryCost: number; deliveryIncome: number; riderPaid: number }

export default function LogisticsReports() {
  const { data, tz } = useGx()
  const { state, setState, range: raw } = useRange('logistics-reports', tz, 'thisMonth')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [g, setG] = useState<G>('day')
  const [product, setProduct] = useState('')
  const [customer, setCustomer] = useState('')
  const [order, setOrder] = useState('')
  const [rider, setRider] = useState('')
  const [kind, setKind] = useState<'' | 'rider' | 'company'>('')
  const [status, setStatus] = useState('')
  const partners = new Map(data.partners.map((p) => [p.id, p]))
  const orderNo = new Map(data.orders.map((o) => [o.id, o.orderNo]))
  const matchPartner = (id: string | null) => (!rider || id === rider) && (!kind || (id && partners.get(id)?.kind === kind))
  const cust = customer.trim().toLowerCase()

  const rows = useMemo(() => {
    const m = new Map<string, Row>()
    const at = (date: string) => { const b = bucketOf(date, g); let r = m.get(b.key); if (!r) { r = { key: b.key, label: b.label, returns: 0, units: 0, refunds: 0, returnCost: 0, stockCost: 0, delivered: 0, products: 0, failed: 0, deliveryCost: 0, deliveryIncome: 0, riderPaid: 0 }; m.set(b.key, r) } return r }
    for (const x of live(data.returns)) {
      if (x.status === 'rejected' && status !== 'rejected') continue
      if ((product && x.productId !== product) || (order && x.orderId !== order) || (cust && !x.customerName.toLowerCase().includes(cust)) || (status && x.status !== status)) continue
      if ((rider || kind) && !matchPartner(x.pickupPartnerId)) continue
      const date = zoned(x.at, tz).date
      if (!inRange(date, range)) continue
      const c = returnCalc(x), r = at(date)
      r.returns++; r.units += x.qtyReturned; r.refunds += c.refund; r.returnCost += c.returnExpense; r.stockCost += c.stockCost
    }
    for (const s of live(data.shipments)) {
      if (!s.finalAt || !matchPartner(s.partnerId)) continue
      if ((order && s.orderId !== order) || (product && !s.items.some((i) => i.productId === product)) || (cust && !s.customerName.toLowerCase().includes(cust)) || (status && s.status !== status)) continue
      const date = zoned(s.finalAt, tz).date
      if (!inRange(date, range)) continue
      const r = at(date)
      if (s.status === 'delivered') { r.delivered++; r.products += shipmentUnits(s); r.deliveryIncome += s.customerCharge }
      if (s.status === 'failed') r.failed++
      r.deliveryCost += shipmentCost(s)
    }
    if (!product && !order && !cust && !status) for (const p of live(data.riderPays)) {
      if (p.voided || !matchPartner(p.partnerId)) continue
      const date = zoned(p.at, tz).date
      if (inRange(date, range)) at(date).riderPaid += p.amountPaid
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [data, tz, range.from, range.to, g, product, cust, order, rider, kind, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const tot = rows.reduce((a, r) => { for (const k of Object.keys(r) as (keyof Row)[]) if (typeof r[k] === 'number') (a[k] as number) = ((a[k] as number) ?? 0) + (r[k] as number); return a }, {} as Row)
  const reverse = live(data.returns).filter((x) => x.receivedAt && inRange(zoned(x.receivedAt, tz).date, range) && matchPartner(x.pickupPartnerId)).reduce((a, x) => a + pickupEarning(x), 0)
  const heads = ['Period', 'Returns', 'Units returned', 'Refunds (Rs)', 'Return costs (Rs)', 'Returned stock cost (Rs)', 'Delivered orders', 'Products delivered', 'Failed', 'Delivery cost (Rs)', 'Delivery charges collected (Rs)', 'Rider payments (Rs)']
  const line = (r: Row) => [r.label, r.returns, r.units, rs(r.refunds), rs(r.returnCost), rs(r.stockCost), r.delivered, r.products, r.failed, rs(r.deliveryCost), rs(r.deliveryIncome), rs(r.riderPaid)]
  const name = `Returns and delivery ${g === 'day' ? 'daily' : `${g}ly`} report`
  return (
    <div className="space-y-3">
      <RangeBar state={state} setState={setState} range={range} extra={<Select aria-label="Group by" className="w-auto" value={g} onChange={(e) => setG(e.target.value as G)}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></Select>} />
      <div className="card grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Select aria-label="Product" value={product} onChange={(e) => setProduct(e.target.value)}><option value="">All products</option>{live(data.products).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Input aria-label="Customer" placeholder="Customer name…" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        <Select aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value)}><option value="">All orders</option>{live(data.orders).slice(-300).reverse().map((o) => <option key={o.id} value={o.id}>{orderNo.get(o.id)}</option>)}</Select>
        <Select aria-label="Rider" value={rider} onChange={(e) => setRider(e.target.value)}><option value="">All riders / companies</option>{live(data.partners).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select aria-label="Partner type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="">Riders and companies</option><option value="rider">Riders only</option><option value="company">Delivery companies only</option></Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><optgroup label="Return status">{RETURN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup><optgroup label="Delivery status">{SHIPMENT_STATUSES.filter((s) => !RETURN_STATUSES.some((r) => (r.id as string) === s.id)).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup></Select>
      </div>
      <Section title={name} icon={FileBarChart} actions={<ExportButtons name={name} period={`${range.from} to ${range.to}`} sheets={() => [{ name: 'Report', rows: [heads, ...rows.map(line), line({ ...tot, label: 'Total' })] }]} />}>
        {!rows.length ? <p className="text-sm text-muted">No returns or finished deliveries match these filters.</p> : (
          <div className="overflow-x-auto"><table className="gx-table w-full min-w-[900px] text-sm">
            <thead><tr>{heads.map((h) => <th key={h} className="px-2 py-1.5 text-start text-xs font-semibold text-muted">{h.replace(' (Rs)', '')}</th>)}</tr></thead>
            <tbody>{[...rows, { ...tot, key: 'total', label: 'Total' }].map((r) => (
              <tr key={r.key} className={r.key === 'total' ? 'border-t-2 border-line font-semibold' : 'border-t border-line/60'}>
                <td className="px-2 py-1.5">{r.label}</td><td className="gx-num px-2">{r.returns}</td><td className="gx-num px-2">{r.units}</td><td className="gx-num px-2"><Money v={r.refunds} /></td><td className="gx-num px-2"><Money v={r.returnCost} /></td>
                <td className="gx-num px-2"><Money v={r.stockCost} /></td><td className="gx-num px-2">{r.delivered}</td><td className="gx-num px-2">{r.products}</td><td className="gx-num px-2">{r.failed}</td><td className="gx-num px-2"><Money v={r.deliveryCost} /></td>
                <td className="gx-num px-2"><Money v={r.deliveryIncome} /></td><td className="gx-num px-2"><Money v={r.riderPaid} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="mt-2 text-xs text-muted">Reverse (pickup) delivery cost in this range: <Money v={reverse} /> — included in return costs. Rider payments are cash settlements of delivery costs already counted, not extra costs. Returned stock cost is informational (already in cost of goods).</p>
      </Section>
    </div>
  )
}
