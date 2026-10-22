import { useMemo, useState } from 'react'
import { Ban, Bike, HandCoins, Pencil, Plus, Printer } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea, Toggle } from '@/components/ui'
import { toast } from '@/components/feedback'
import { addRiderPayment, savePartner, voidRiderPayment, type PartnerInput } from '@/features/glamiex/logisticsService'
import { partnerAccount, pickupEarning, shipmentEarning, shipmentUnits, type PartnerAccount } from '@/features/glamiex/logistics'
import { pkr } from '@/features/glamiex/money'
import { wallToIso, zoned } from '@/features/glamiex/time'
import { AttachmentField, ConfirmText, DataTable, ExportButtons, KpiCard, Money, MoneyInput, RangeBar, Section, rs, useRange, type Col } from '@/features/glamiex/ui'
import { PAY_POLICIES, PAYMENT_METHODS, RATE_RULES, type GxPartner, type GxRiderPayment, type PartialPayPolicy, type PaymentMethod, type RateRule } from '@/features/glamiex/types'
import { newSubmissionId } from '@/features/glamiex/service'
import { printHtml } from '@/lib/markdown'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { BackLink, Stat, nowLocal } from './shared'
import { ShipBadge, shipLabel } from './Deliveries'
import { escapeHtml } from '@/lib/html'

const ruleLabel = (r: RateRule) => RATE_RULES.find((x) => x.id === r)?.label ?? r
const rateText = (p: GxPartner) => p.rateRule === 'per_order' ? `${pkr(p.perOrder)} / delivery` : p.rateRule === 'per_product' ? `${pkr(p.perProduct)} / product` : `${pkr(p.perKm)} / km`
const ALL = (to: string) => ({ from: '0000-01-01', to })

export default function Riders({ id }: { id?: string }) {
  if (id) return <RiderDetail id={id} />
  return <RiderList />
}

function RiderList() {
  const { data, tz, go } = useGx()
  const { state, setState, range } = useRange('riders', tz, 'thisMonth')
  const [editing, setEditing] = useState<GxPartner | 'new' | null>(null)
  const all = state.preset === 'all'
  const rows = useMemo(() => live(data.partners).map((p) => ({ a: partnerAccount(p, data, tz, all ? undefined : range), bal: partnerAccount(p, data, tz, ALL(all ? '9999-12-31' : range.to)).outstanding })),
    [data, tz, all, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps
  type R = (typeof rows)[number]
  const t = (f: (a: PartnerAccount) => number) => rows.reduce((s, r) => s + f(r.a), 0)
  const cols: Col<R>[] = [
    { key: 'name', label: 'Rider / company', render: (r) => <div><div className="font-medium">{r.a.partner.name} {r.a.partner.status === 'inactive' && <Badge>inactive</Badge>}</div><div className="text-xs text-muted">{r.a.partner.code && `${r.a.partner.code} · `}{r.a.partner.kind === 'company' ? 'Company' : 'Rider'} · {r.a.partner.phone}</div></div>, sort: (r) => r.a.partner.name, text: (r) => `${r.a.partner.name} ${r.a.partner.code} ${r.a.partner.phone}` },
    { key: 'rate', label: 'Rate rule', render: (r) => <span className="text-xs">{rateText(r.a.partner)}</span> },
    { key: 'asg', label: 'Assigned', align: 'right', render: (r) => r.a.assignedUnits, sort: (r) => r.a.assignedUnits },
    { key: 'pick', label: 'Picked up', align: 'right', render: (r) => r.a.pickedUpUnits, sort: (r) => r.a.pickedUpUnits },
    { key: 'del', label: 'Delivered', align: 'right', render: (r) => <span>{r.a.deliveredUnits} <span className="text-xs text-muted">({r.a.deliveredOrders} orders)</span></span>, sort: (r) => r.a.deliveredUnits },
    { key: 'fail', label: 'Failed / cancelled / returned', align: 'right', render: (r) => `${r.a.failed} / ${r.a.cancelled} / ${r.a.returned}` },
    { key: 'earn', label: 'Earned', align: 'right', render: (r) => <Money v={r.a.earned} />, sort: (r) => r.a.earned },
    { key: 'paid', label: 'Paid', align: 'right', render: (r) => <span className="text-ok"><Money v={r.a.paid} /></span>, sort: (r) => r.a.paid },
    { key: 'bal', label: 'Outstanding', align: 'right', render: (r) => <b className={r.bal > 0 ? 'text-warn' : ''}><Money v={r.bal} /></b>, sort: (r) => r.bal },
  ]
  return (
    <div className="space-y-3">
      <RangeBar state={state} setState={setState} range={range} extra={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add rider / company</Button>} />
      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:grid-cols-4">
        <KpiCard label="Rider earnings (period)" value={t((a) => a.earned)} />
        <KpiCard label="Rider payments made (period)" value={t((a) => a.paid)} tone="ok" />
        <KpiCard label="Outstanding rider payments" value={rows.reduce((s, r) => s + r.bal, 0)} tone="warn" sub={all ? 'all time' : `as at ${range.to}`} />
        <KpiCard label="Products delivered" value={t((a) => a.deliveredUnits)} kind="count" sub={`${t((a) => a.deliveredOrders)} orders`} />
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.a.partner.id} onRowClick={(r) => go(`riders/${r.a.partner.id}`)} initialSort={{ key: 'bal', dir: -1 }} empty="No riders or delivery companies yet."
        toolbar={<ExportButtons name="Rider accounts" period={all ? 'All time' : `${range.from} to ${range.to}`} sheets={() => [{ name: 'Riders', rows: [
          ['Rider / company', 'ID', 'Rate rule', 'Assigned', 'Picked up', 'Delivered units', 'Delivered orders', 'Failed', 'Cancelled', 'Returned', 'Pickups', 'Earned (Rs)', 'Paid (Rs)', 'Outstanding (Rs)'],
          ...rows.map((r) => [r.a.partner.name, r.a.partner.code, rateText(r.a.partner), r.a.assignedUnits, r.a.pickedUpUnits, r.a.deliveredUnits, r.a.deliveredOrders, r.a.failed, r.a.cancelled, r.a.returned, r.a.pickups, rs(r.a.earned), rs(r.a.paid), rs(r.bal)]),
        ] }]} />}
        card={(r) => <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.a.partner.name}</div><div className="text-xs text-muted">{r.a.deliveredOrders} delivered · {rateText(r.a.partner)}</div></div>
          <div className="text-end"><div className="text-xs text-muted">Due</div><b className={r.bal > 0 ? 'text-warn' : ''}>{pkr(r.bal)}</b></div>
        </div>} />
      {editing && <PartnerForm partner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function RiderDetail({ id }: { id: string }) {
  const { data, tz } = useGx()
  const { state, setState, range } = useRange(`rider-${id}`, tz, 'thisMonth')
  const [edit, setEdit] = useState(false)
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState<GxRiderPayment | null>(null)
  const p = data.partners.find((x) => x.id === id)
  if (!p || p.deletedAt) return <div><BackLink to="/glamiex/riders" label="Riders" /><EmptyState icon={Bike} title="Rider not found" /></div>
  const all = state.preset === 'all'
  const a = partnerAccount(p, data, tz, all ? undefined : range)
  const due = partnerAccount(p, data, tz, ALL('9999-12-31')).outstanding
  const ships = live(data.shipments).filter((s) => s.partnerId === p.id && (all || ((d) => d >= range.from && d <= range.to)(zoned(s.finalAt ?? s.dispatchAt ?? new Date(s.createdAt).toISOString(), tz).date)))
  const pickups = live(data.returns).filter((r) => r.pickupPartnerId === p.id)
  const pays = data.riderPays.filter((x) => x.partnerId === p.id && !x.deletedAt).sort((x, y) => y.at.localeCompare(x.at))
  const period = all ? 'All time' : `${range.from} to ${range.to}`
  const statement = () => {
    const row = (k: string, v: string) => `<tr><th style="text-align:left">${escapeHtml(k)}</th><td style="text-align:right">${escapeHtml(v)}</td></tr>`
    printHtml(`Settlement statement — ${p.name}`, `<h1>Rider settlement statement</h1><p><b>${escapeHtml(p.name)}</b>${p.code ? ` (${escapeHtml(p.code)})` : ''} · ${escapeHtml(period)} · rate: ${escapeHtml(rateText(p))}</p>
      <table>${row('Products assigned', String(a.assignedUnits))}${row('Products picked up', String(a.pickedUpUnits))}${row('Products delivered', `${a.deliveredUnits} (${a.deliveredOrders} orders)`)}${row('Failed / cancelled / returned', `${a.failed} / ${a.cancelled} / ${a.returned}`)}
      ${row('Delivery earnings', pkr(a.shipmentEarnings))}${row('Return pickups', `${a.pickups} · ${pkr(a.pickupEarnings)}`)}${row('Additional charges', pkr(a.additions))}${row('Deductions', `−${pkr(a.deductions)}`)}${row('Total earned', pkr(a.earned))}${row('Paid in period', pkr(a.paid))}${row('Outstanding balance (all time)', pkr(due))}</table>
      <h2>Deliveries</h2><table><thead><tr><th>Delivery</th><th>Date</th><th>Customer</th><th>Units</th><th>Status</th><th>Earning</th></tr></thead><tbody>${ships.map((s) => `<tr><td>${escapeHtml(s.shipmentNo)}</td><td>${escapeHtml(s.finalAt ? zoned(s.finalAt, tz).date : '')}</td><td>${escapeHtml(s.customerName)}</td><td>${shipmentUnits(s)}</td><td>${escapeHtml(shipLabel(s.status))}</td><td style="text-align:right">${escapeHtml(pkr(shipmentEarning(s)))}</td></tr>`).join('')}</tbody></table>
      <h2>Payments</h2><table><thead><tr><th>Settlement</th><th>Date</th><th>Method</th><th>Reference</th><th>Paid</th></tr></thead><tbody>${pays.filter((x) => !x.voided).map((x) => `<tr><td>${escapeHtml(x.settlementNo)}</td><td>${escapeHtml(zoned(x.at, tz).date)}</td><td>${escapeHtml(x.method)}</td><td>${escapeHtml(x.reference)}</td><td style="text-align:right">${escapeHtml(pkr(x.amountPaid))}</td></tr>`).join('')}</tbody></table>`)
  }
  const payCols: Col<GxRiderPayment>[] = [
    { key: 'no', label: 'Settlement', render: (x) => <span className={cn('font-mono text-xs', x.voided && 'line-through')}>{x.settlementNo}</span>, sort: (x) => x.settlementNo, text: (x) => `${x.settlementNo} ${x.reference} ${x.notes}` },
    { key: 'date', label: 'Paid on', render: (x) => `${zoned(x.at, tz).date} ${zoned(x.at, tz).time}`, sort: (x) => x.at },
    { key: 'period', label: 'Period', render: (x) => <span className="text-xs">{x.periodFrom} → {x.periodTo}</span> },
    { key: 'gross', label: 'Gross (snapshot)', align: 'right', render: (x) => <span>{pkr(x.grossEarnings)} <span className="text-xs text-muted">({x.completedDeliveries})</span></span> },
    { key: 'adj', label: '+ / −', align: 'right', render: (x) => <span className="text-xs">+{pkr(x.additions)} / −{pkr(x.deductions)}</span> },
    { key: 'ref', label: 'Method · ref', render: (x) => <span className="text-xs">{PAYMENT_METHODS.find((m) => m.id === x.method)?.label}{x.reference && ` · ${x.reference}`}</span> },
    { key: 'amt', label: 'Paid', align: 'right', render: (x) => <b className={cn('text-ok', x.voided && 'line-through opacity-60')}>{pkr(x.amountPaid)}</b>, sort: (x) => x.amountPaid },
    { key: 'act', label: '', render: (x) => !x.voided && <span onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" icon={Ban} onClick={() => setVoiding(x)}>Void</Button></span> },
  ]
  return (
    <div className="space-y-4">
      <BackLink to="/glamiex/riders" label="Riders" />
      <div className="card flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{p.name} {p.status === 'inactive' && <Badge>inactive</Badge>}</h2>
          <p className="text-sm text-muted">{p.kind === 'company' ? 'Delivery company' : 'Rider'}{p.code && ` · ID ${p.code}`}{p.phone && ` · ${p.phone}`}{p.email && ` · ${p.email}`} · pays by {PAYMENT_METHODS.find((m) => m.id === p.method)?.label}</p>
          <p className="text-xs text-muted">Rule: {ruleLabel(p.rateRule)} — {rateText(p)} · pickups: {p.countPickupAsDelivery ? 'count as deliveries' : pkr(p.pickupRate)} · failed: {PAY_POLICIES.find((x) => x.id === p.failedPolicy)?.label}{p.failedPolicy === 'fixed' && ` ${pkr(p.failedFixed)}`} · returned: {PAY_POLICIES.find((x) => x.id === p.returnedPolicy)?.label}{p.returnedPolicy === 'fixed' && ` ${pkr(p.returnedFixed)}`}</p>
        </div>
        <div className="text-end"><div className="text-xs text-muted">Outstanding</div><div className={cn('text-2xl font-bold tabular-nums', due > 0 && 'text-warn')}>{pkr(due)}</div></div>
        <div className="flex flex-wrap gap-2"><Button icon={Pencil} onClick={() => setEdit(true)}>Edit</Button><Button icon={Printer} onClick={statement}>Statement</Button><Button variant="primary" icon={HandCoins} onClick={() => setPaying(true)}>Pay rider</Button></div>
      </div>
      <RangeBar state={state} setState={setState} range={range} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Products assigned">{a.assignedUnits}</Stat><Stat label="Picked up">{a.pickedUpUnits}</Stat><Stat label="Delivered">{a.deliveredUnits} ({a.deliveredOrders})</Stat>
        <Stat label="Failed / cancelled / returned">{a.failed} / {a.cancelled} / {a.returned}</Stat><Stat label="Eligible (paid) jobs">{a.eligible}</Stat>
        <Stat label="Delivery earnings"><Money v={a.shipmentEarnings} /></Stat><Stat label="Return pickups">{a.pickups} · <Money v={a.pickupEarnings} /></Stat><Stat label="Extra charges incl.">{pkr(a.extras)}</Stat>
        <Stat label="Additions / deductions">+{pkr(a.additions)} / −{pkr(a.deductions)}</Stat><Stat label="Total earned"><Money v={a.earned} /></Stat><Stat label="Paid" tone="ok"><Money v={a.paid} /></Stat><Stat label="Outstanding (all time)" tone={due > 0 ? 'warn' : undefined}><Money v={due} /></Stat>
      </div>
      <Section title={`Deliveries (${ships.length})`} icon={Bike}>
        {!ships.length ? <p className="text-sm text-muted">No deliveries in this period.</p> : <ul className="divide-y divide-line/60">{ships.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="font-mono text-xs">{s.shipmentNo}</span><span className="min-w-0 flex-1 truncate">{s.customerName} · {shipmentUnits(s)} units</span><ShipBadge s={s.status} /><b className="w-24 text-end"><Money v={shipmentEarning(s)} /></b></li>
        ))}</ul>}
      </Section>
      {pickups.length > 0 && <Section title={`Return pickups (${pickups.length})`} icon={Bike} defaultOpen={false}>
        <ul className="divide-y divide-line/60">{pickups.map((r) => <li key={r.id} className="flex items-center gap-2 py-2 text-sm"><span className="font-mono text-xs">{r.returnNo}</span><span className="flex-1">{r.pickupQty || r.qtyReturned} × {r.productName} · {r.received ? 'received' : 'not yet received'}</span><b><Money v={pickupEarning(r)} /></b></li>)}</ul>
      </Section>}
      <Section title="Payment history" icon={HandCoins} actions={<ExportButtons name={`Rider settlements ${p.name}`} period="All time" sheets={() => [{ name: 'Settlements', rows: [['Settlement', 'Paid on', 'Period from', 'Period to', 'Completed deliveries', 'Gross (Rs)', 'Additions (Rs)', 'Deductions (Rs)', 'Paid (Rs)', 'Method', 'Reference', 'Voided'],
        ...pays.map((x) => [x.settlementNo, zoned(x.at, tz).date, x.periodFrom, x.periodTo, x.completedDeliveries, rs(x.grossEarnings), rs(x.additions), rs(x.deductions), x.voided ? 0 : rs(x.amountPaid), x.method, x.reference, x.voided ? 'VOID' : ''])] }]} />}>
        <DataTable rows={pays} cols={payCols} rowKey={(x) => x.id} searchable={false} empty="No payments yet."
          card={(x) => <div className={cn('flex items-center gap-2', x.voided && 'opacity-60')}><div className="min-w-0 flex-1"><div className="font-mono text-xs">{x.settlementNo}{x.voided && ' · VOID'}</div><div className="text-xs text-muted">{zoned(x.at, tz).date} · {x.periodFrom} → {x.periodTo}</div></div><b className="text-ok">{pkr(x.amountPaid)}</b></div>} />
      </Section>
      {p.notes && <Section title="Notes" icon={Bike}><p className="whitespace-pre-wrap text-sm">{p.notes}</p></Section>}
      {edit && <PartnerForm partner={p} onClose={() => setEdit(false)} />}
      {paying && <SettlementForm partner={p} onClose={() => setPaying(false)} />}
      <ConfirmText open={!!voiding} danger needReason title={`Void ${voiding?.settlementNo}?`} label="Void payment" onClose={() => setVoiding(null)}
        body="The payment stays in the history (marked VOID) and the rider's outstanding balance goes back up by this amount."
        onConfirm={async (reason) => { await voidRiderPayment(voiding!.id, reason); toast('Payment voided') }} />
    </div>
  )
}

function PartnerForm({ partner, onClose }: { partner: GxPartner | null; onClose: () => void }) {
  const { go } = useGx()
  const [f, setF] = useState<PartnerInput>(() => partner ? (({ id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, archived: _a, favorite: _f, pinned: _p, tags: _t, version: _v, syncedAt: _s, ...rest }) => rest)(partner) : {
    name: '', kind: 'rider', code: '', phone: '', email: '', method: 'cash', rateRule: 'per_order', perOrder: 10000, perProduct: 0, perKm: 0, pickupRate: 0, countPickupAsDelivery: false,
    failedPolicy: 'none', failedFixed: 0, returnedPolicy: 'none', returnedFixed: 0, status: 'active', notes: '', attachmentIds: [],
  })
  const set = <K extends keyof PartnerInput>(k: K, v: PartnerInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setErr(null); setBusy(true)
    try { const id = await savePartner(f, partner?.id ?? null); toast('Saved'); onClose(); if (!partner) go(`riders/${id}`) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const money = (k: 'perOrder' | 'perProduct' | 'perKm' | 'pickupRate' | 'failedFixed' | 'returnedFixed', label: string, hint?: string) =>
    <Field label={label} htmlFor={`pt-${k}`} hint={hint}><MoneyInput id={`pt-${k}`} value={f[k]} onChange={(v) => set(k, v ?? 0)} /></Field>
  const policy = (k: 'failedPolicy' | 'returnedPolicy', label: string) => <Field label={label} htmlFor={`pt-${k}`}><Select id={`pt-${k}`} value={f[k]} onChange={(e) => set(k, e.target.value as PartialPayPolicy)}>{PAY_POLICIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
  return (
    <Modal open onClose={onClose} title={partner ? `Edit ${partner.name}` : 'Add rider or delivery company'} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name" htmlFor="pt-n"><Input id="pt-n" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Type" htmlFor="pt-k"><Select id="pt-k" value={f.kind} onChange={(e) => set('kind', e.target.value as PartnerInput['kind'])}><option value="rider">Rider</option><option value="company">Delivery company</option></Select></Field>
        <Field label="Rider ID" htmlFor="pt-c"><Input id="pt-c" value={f.code} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="Phone" htmlFor="pt-p"><Input id="pt-p" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email" htmlFor="pt-e"><Input id="pt-e" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Payment method" htmlFor="pt-m"><Select id="pt-m" value={f.method} onChange={(e) => set('method', e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        <Field label="Payment rule (only one applies)" htmlFor="pt-r"><Select id="pt-r" value={f.rateRule} onChange={(e) => set('rateRule', e.target.value as RateRule)}>{RATE_RULES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
        {f.rateRule === 'per_order' && money('perOrder', 'Rate per delivery')}
        {f.rateRule === 'per_product' && money('perProduct', 'Rate per product')}
        {f.rateRule === 'per_km' && money('perKm', 'Rate per km')}
        {money('pickupRate', 'Return pickup rate', 'Used for reverse deliveries')}
        {policy('failedPolicy', 'Failed deliveries')}
        {f.failedPolicy === 'fixed' && money('failedFixed', 'Fixed pay per failed delivery')}
        {policy('returnedPolicy', 'Returned shipments')}
        {f.returnedPolicy === 'fixed' && money('returnedFixed', 'Fixed pay per returned shipment')}
        <Field label="Status" htmlFor="pt-s"><Select id="pt-s" value={f.status} onChange={(e) => set('status', e.target.value as PartnerInput['status'])}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        <Field label="Notes" htmlFor="pt-x" className="sm:col-span-2"><Textarea id="pt-x" className="min-h-[44px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      <div className="mt-2"><Toggle label="Count return pickups as completed deliveries" description="When on, a pickup is paid at the normal delivery rate and counts as an eligible delivery." checked={f.countPickupAsDelivery} onChange={(v) => set('countPickupAsDelivery', v)} /></div>
      <div className="mt-2"><AttachmentField label="Documents / receipts" ids={f.attachmentIds} onChange={(ids) => set('attachmentIds', ids)} tag="partner-doc" /></div>
      <p className="mt-2 text-xs text-muted">Rate changes apply to deliveries assigned from now on; past deliveries keep the rate they were assigned with.</p>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </Modal>
  )
}

function SettlementForm({ partner, onClose }: { partner: GxPartner; onClose: () => void }) {
  const { data, tz } = useGx()
  const [sub] = useState(newSubmissionId)
  const n = nowLocal(tz)
  const lastTo = data.riderPays.filter((x) => x.partnerId === partner.id && !x.voided && !x.deletedAt).map((x) => x.periodTo).sort().pop()
  const [from, setFrom] = useState(lastTo ? new Date(Date.parse(lastTo) + 86400000).toISOString().slice(0, 10) : n.date.slice(0, 8) + '01')
  const [to, setTo] = useState(n.date)
  const [additions, setAdditions] = useState<number | null>(0)
  const [deductions, setDeductions] = useState<number | null>(0)
  const [date, setDate] = useState(n.date)
  const [time, setTime] = useState(n.time)
  const [method, setMethod] = useState<PaymentMethod>(partner.method)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [att, setAtt] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const period = from && to && from <= to ? partnerAccount(partner, data, tz, { from, to }) : null
  const dueNow = partnerAccount(partner, data, tz, ALL(date || n.date)).outstanding + (additions ?? 0) - (deductions ?? 0)
  const [amount, setAmount] = useState<number | null>(Math.max(0, partnerAccount(partner, data, tz, ALL(n.date)).outstanding) || null)
  const save = async () => {
    setErr(null); setBusy(true)
    try {
      const r = await addRiderPayment({ id: sub, partnerId: partner.id, periodFrom: from, periodTo: to, additions: additions ?? 0, deductions: deductions ?? 0, amountPaid: amount ?? 0, at: wallToIso(date, time || '00:00', tz), method, reference, notes, attachmentIds: att })
      toast(r.duplicate ? `Already saved as ${r.payment.settlementNo}` : `${r.payment.settlementNo} saved`, r.duplicate ? 'info' : 'success'); onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Pay ${partner.name}`} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save payment</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Settlement period from" htmlFor="st-f"><Input id="st-f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="to" htmlFor="st-t"><Input id="st-t" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
          <Stat label="Completed (eligible) jobs">{period?.eligible ?? '—'}</Stat>
          <Stat label="Gross earnings">{period ? pkr(period.shipmentEarnings + period.pickupEarnings) : '—'}</Stat>
        </div>
        <Field label="Additional charges" htmlFor="st-a"><MoneyInput id="st-a" value={additions} onChange={setAdditions} /></Field>
        <Field label="Deductions" htmlFor="st-d"><MoneyInput id="st-d" value={deductions} onChange={setDeductions} /></Field>
        <Field label="Amount paid" htmlFor="st-p" hint={`Amount due: ${pkr(Math.max(0, dueNow))} — partial payments are fine`}><MoneyInput id="st-p" value={amount} onChange={setAmount} /></Field>
        <Field label="Payment date" htmlFor="st-dt"><Input id="st-dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Time" htmlFor="st-tm" hint={tz}><Input id="st-tm" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Method" htmlFor="st-m"><Select id="st-m" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        <Field label="Transaction reference" htmlFor="st-r"><Input id="st-r" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Notes" htmlFor="st-n" className="sm:col-span-2"><Textarea id="st-n" className="min-h-[44px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="mt-3"><AttachmentField label="Receipt" ids={att} onChange={setAtt} tag="rider-payment-receipt" /></div>
      <p className="mt-2 text-xs text-muted">A rider payment settles what the rider has earned — it is cash paid, not a new delivery expense. Payments above the amount due and repeated references are blocked.</p>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </Modal>
  )
}
