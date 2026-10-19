import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, Field, IconButton, Input, Modal, Textarea } from '@/components/ui'
import { confirm, safeWrite, toast } from '@/components/feedback'
import { gxAdSpendRepo, gxAudit, saveRecord } from '@/features/glamiex/service'
import { adKpis, campaignKpis, summary } from '@/features/glamiex/engine'
import { convert, pkr } from '@/features/glamiex/money'
import { AttachmentField, DataTable, ExportButtons, Money, MoneyInput, RangeBar, rs, useRange, type Col } from '@/features/glamiex/ui'
import type { GxAdSpend } from '@/features/glamiex/types'
import { useGx, live } from '../context'
import { Stat, earliestDate, nowLocal } from './shared'
import { CurrencyRate, PLATFORMS, validRate } from './adShared'

const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}%`)
const fmtX = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}×`)
const fmtMoney = (v: number | null) => (v == null ? '—' : pkr(v))
const overlaps = (x: GxAdSpend, from: string, to: string) => x.start <= to && (x.end || x.start) >= from

export default function AdSpend({ id }: { id?: string }) {
  const { data, tz } = useGx()
  const { state, setState, range: raw } = useRange('adSpend', tz, 'thisYear')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [editing, setEditing] = useState<GxAdSpend | 'new' | null>(id === 'new' ? 'new' : null)
  const rows = useMemo(() => live(data.adSpend).filter((x) => overlaps(x, range.from, range.to)), [data.adSpend, range.from, range.to])
  const k = adKpis(rows)
  const recognised = summary(data, range, tz).adSpend

  const cols: Col<GxAdSpend>[] = [
    { key: 'camp', label: 'Campaign', render: (x) => <div><div className="font-medium">{x.campaign || '(unnamed)'}</div><div className="text-xs text-muted">{x.platform}{x.campaignId && ` · ${x.campaignId}`}</div></div>, sort: (x) => x.campaign, text: (x) => `${x.campaign} ${x.platform} ${x.campaignId} ${x.notes}` },
    { key: 'dates', label: 'Dates', render: (x) => <span className="whitespace-nowrap text-xs">{x.start} → {x.end || x.start}</span>, sort: (x) => x.start },
    { key: 'amt', label: 'Spent (PKR)', align: 'right', render: (x) => <b><Money v={x.amountPkr} /></b>, sort: (x) => x.amountPkr },
    { key: 'clicks', label: 'Clicks', align: 'right', render: (x) => x.clicks ?? '—', sort: (x) => x.clicks ?? -1 },
    { key: 'imp', label: 'Impr.', align: 'right', render: (x) => x.impressions?.toLocaleString('en-PK') ?? '—', sort: (x) => x.impressions ?? -1 },
    { key: 'conv', label: 'Conv.', align: 'right', render: (x) => x.conversions ?? '—', sort: (x) => x.conversions ?? -1 },
    { key: 'cpc', label: 'CPC', align: 'right', render: (x) => fmtMoney(campaignKpis(x).cpc), sort: (x) => campaignKpis(x).cpc ?? -1 },
    { key: 'cpa', label: 'CPA', align: 'right', render: (x) => fmtMoney(campaignKpis(x).cpa), sort: (x) => campaignKpis(x).cpa ?? -1 },
    { key: 'cr', label: 'Conv. rate', align: 'right', render: (x) => fmtPct(campaignKpis(x).conversionRate), sort: (x) => campaignKpis(x).conversionRate ?? -1 },
    { key: 'roas', label: 'ROAS', align: 'right', render: (x) => fmtX(campaignKpis(x).roas), sort: (x) => campaignKpis(x).roas ?? -1 },
    { key: 'act', label: '', render: (x) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton icon={Pencil} label="Edit" onClick={() => setEditing(x)} /><IconButton icon={Trash2} label="Delete" onClick={async () => {
      if (!(await confirm({ title: 'Delete campaign spend?', body: `${x.campaign || x.platform} — ${pkr(x.amountPkr)}. It moves to Trash.`, danger: true, confirmLabel: 'Delete' }))) return
      await safeWrite(() => gxAdSpendRepo.trash(x.id)); await gxAudit('adSpend', x.id, 'delete', `${x.campaign} ${pkr(x.amountPkr)}`)
      toast('Moved to trash', 'success', { label: 'Undo', run: () => void gxAdSpendRepo.restore(x.id) })
    }} /></div> },
  ]
  return (
    <div>
      <RangeBar state={state} setState={setState} range={range} extra={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add campaign spend</Button>} />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Spend recognised in period" tone="danger"><Money v={recognised} /></Stat>
        <Stat label="Total of listed campaigns"><Money v={k.total} /></Stat>
        <Stat label="Cost per click">{fmtMoney(k.cpc)}</Stat>
        <Stat label="Cost per acquisition">{fmtMoney(k.cpa)}</Stat>
        <Stat label="Click-through rate">{fmtPct(k.ctr)}</Stat>
        <Stat label="Conversion rate">{fmtPct(k.conversionRate)}</Stat>
        <Stat label="ROAS" tone={k.roas != null ? (k.roas >= 1 ? 'ok' : 'danger') : undefined}>{fmtX(k.roas)}</Stat>
        <Stat label="Ad ROI" tone={k.roi != null ? (k.roi >= 0 ? 'ok' : 'danger') : undefined}>{fmtPct(k.roi)}</Stat>
      </div>
      <p className="mb-3 text-xs text-muted">Spend is spread evenly over each campaign's dates when calculating profit, so a campaign is counted once even across overlapping reports. ROAS/ROI use "attributed sales" you enter per campaign; metrics show “—” when the inputs are missing.</p>
      <DataTable rows={rows} cols={cols} rowKey={(x) => x.id} onRowClick={setEditing} initialSort={{ key: 'dates', dir: -1 }} empty="No advertising spend for this period."
        toolbar={<ExportButtons name="Advertising spend" period={`${range.from} to ${range.to}`} sheets={() => [{ name: 'Ad spend', rows: [['Platform', 'Campaign', 'Campaign ID', 'Start', 'End', 'Currency', 'Amount', 'Rate', 'Spent (Rs)', 'Clicks', 'Impressions', 'Conversions', 'Attributed sales (Rs)', 'CPC (Rs)', 'CPA (Rs)', 'Conv. rate %', 'ROAS'],
          ...rows.map((x) => { const c = campaignKpis(x); return [x.platform, x.campaign, x.campaignId, x.start, x.end, x.currency, x.amount / 100, x.exchangeRate, rs(x.amountPkr), x.clicks, x.impressions, x.conversions, x.attributedSales == null ? '' : rs(x.attributedSales), c.cpc == null ? '' : rs(c.cpc), c.cpa == null ? '' : rs(c.cpa), c.conversionRate == null ? '' : +c.conversionRate.toFixed(2), c.roas == null ? '' : +c.roas.toFixed(2)] })] }]} />}
        card={(x) => <div><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{x.campaign || x.platform}</div><div className="text-xs text-muted">{x.platform} · {x.start} → {x.end || x.start}</div></div><b className="text-danger"><Money v={x.amountPkr} /></b></div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted"><span>CPC {fmtMoney(campaignKpis(x).cpc)}</span><span>CPA {fmtMoney(campaignKpis(x).cpa)}</span><span>ROAS {fmtX(campaignKpis(x).roas)}</span></div></div>} />
      {editing && <SpendForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

const intOrNull = (s: string) => (s.trim() === '' ? null : Number.isInteger(Number(s)) && Number(s) >= 0 ? Number(s) : NaN)

function SpendForm({ item, onClose }: { item: GxAdSpend | null; onClose: () => void }) {
  const { tz } = useGx()
  const today = nowLocal(tz).date
  const [f, setF] = useState({ platform: item?.platform ?? 'Facebook / Meta', campaign: item?.campaign ?? '', campaignId: item?.campaignId ?? '', amount: item?.amount ?? null as number | null, currency: item?.currency ?? 'PKR', rate: String(item?.exchangeRate ?? 1), start: item?.start ?? today, end: item?.end ?? today, clicks: item?.clicks?.toString() ?? '', impressions: item?.impressions?.toString() ?? '', conversions: item?.conversions?.toString() ?? '', attributedSales: item?.attributedSales ?? null as number | null, notes: item?.notes ?? '', attachmentIds: item?.attachmentIds ?? [] })
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const pkrAmt = convert(f.amount ?? 0, f.currency === 'PKR' ? 1 : Number(f.rate) || 0)
  const save = async () => {
    if (!f.platform.trim()) return setErr('Platform is required.')
    if (f.amount == null || f.amount <= 0) return setErr('Enter the amount spent.')
    if (!validRate(f.currency, f.rate)) return setErr('Enter a valid exchange rate.')
    if (!f.start) return setErr('Start date is required.')
    if (f.end && f.end < f.start) return setErr('End date must be on or after the start date.')
    const [clicks, impressions, conversions] = [intOrNull(f.clicks), intOrNull(f.impressions), intOrNull(f.conversions)]
    if ([clicks, impressions, conversions].some((v) => Number.isNaN(v))) return setErr('Clicks, impressions and conversions must be whole numbers.')
    if (clicks != null && impressions != null && clicks > impressions) return setErr('Clicks cannot exceed impressions.')
    if (conversions != null && clicks != null && conversions > clicks) return setErr('Conversions cannot exceed clicks.')
    const ok = await safeWrite(() => saveRecord(gxAdSpendRepo, 'adSpend', item?.id ?? null, { platform: f.platform.trim(), campaign: f.campaign, campaignId: f.campaignId, amount: f.amount!, currency: f.currency, exchangeRate: f.currency === 'PKR' ? 1 : Number(f.rate), amountPkr: pkrAmt, start: f.start, end: f.end || f.start, clicks, impressions, conversions, attributedSales: f.attributedSales, notes: f.notes, attachmentIds: f.attachmentIds }, `${f.campaign || f.platform} ${pkr(pkrAmt)}`), 'Saved')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={item ? 'Edit campaign spend' : 'Add campaign spend'} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Platform" htmlFor="as-p"><Input id="as-p" list="as-pl" value={f.platform} onChange={(e) => set('platform', e.target.value)} /><datalist id="as-pl">{PLATFORMS.map((p) => <option key={p} value={p} />)}</datalist></Field>
        <Field label="Campaign name" htmlFor="as-c"><Input id="as-c" value={f.campaign} onChange={(e) => set('campaign', e.target.value)} /></Field>
        <Field label="Campaign ID" htmlFor="as-id"><Input id="as-id" value={f.campaignId} onChange={(e) => set('campaignId', e.target.value)} /></Field>
        <Field label="Start date" htmlFor="as-s"><Input id="as-s" type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
        <Field label="End date" htmlFor="as-e"><Input id="as-e" type="date" value={f.end} min={f.start} onChange={(e) => set('end', e.target.value)} /></Field>
        <CurrencyRate idPrefix="as" currency={f.currency} rate={f.rate} onCurrency={(c) => set('currency', c)} onRate={(r) => set('rate', r)} />
        <Field label="Amount spent" htmlFor="as-a" hint={f.currency !== 'PKR' ? `= ${pkr(pkrAmt)}` : undefined}><MoneyInput id="as-a" prefix={f.currency} value={f.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Clicks" htmlFor="as-cl"><Input id="as-cl" inputMode="numeric" value={f.clicks} onChange={(e) => set('clicks', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Impressions" htmlFor="as-im"><Input id="as-im" inputMode="numeric" value={f.impressions} onChange={(e) => set('impressions', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Conversions" htmlFor="as-cv"><Input id="as-cv" inputMode="numeric" value={f.conversions} onChange={(e) => set('conversions', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Attributed sales (PKR)" htmlFor="as-at" hint="Sales the platform credits to this campaign (for ROAS)"><MoneyInput id="as-at" value={f.attributedSales} onChange={(v) => set('attributedSales', v)} /></Field>
        <Field label="Notes" htmlFor="as-n" className="sm:col-span-2"><Textarea id="as-n" className="min-h-[44px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      <div className="mt-3"><AttachmentField label="Invoice / report" ids={f.attachmentIds} onChange={(ids) => set('attachmentIds', ids)} tag="ad-report" /></div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </Modal>
  )
}
