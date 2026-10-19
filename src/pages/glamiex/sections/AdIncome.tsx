import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, Field, IconButton, Input, Modal, Textarea } from '@/components/ui'
import { confirm, safeWrite, toast } from '@/components/feedback'
import { gxAdIncomeRepo, gxAudit, saveRecord } from '@/features/glamiex/service'
import { convert, pkr } from '@/features/glamiex/money'
import { inRange } from '@/features/glamiex/time'
import { AttachmentField, DataTable, ExportButtons, Money, MoneyInput, RangeBar, rs, useRange, type Col } from '@/features/glamiex/ui'
import type { GxAdIncome } from '@/features/glamiex/types'
import { useGx, live } from '../context'
import { Stat, earliestDate, nowLocal } from './shared'
import { CurrencyRate, PLATFORMS, validRate } from './adShared'

export default function AdIncome({ id }: { id?: string }) {
  const { data, tz } = useGx()
  const { state, setState, range: raw } = useRange('adIncome', tz, 'thisYear')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [editing, setEditing] = useState<GxAdIncome | 'new' | null>(id === 'new' ? 'new' : null)
  const rows = useMemo(() => live(data.adIncome).filter((x) => inRange(x.reportDate, range)), [data.adIncome, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = rows.reduce((a, x) => a + x.netPkr, 0)
  const byPlatform = [...rows.reduce((m, x) => m.set(x.platform, (m.get(x.platform) ?? 0) + x.netPkr), new Map<string, number>())].sort((a, b) => b[1] - a[1])

  const cols: Col<GxAdIncome>[] = [
    { key: 'date', label: 'Report date', render: (x) => x.reportDate, sort: (x) => x.reportDate, text: (x) => `${x.platform} ${x.campaign} ${x.notes}` },
    { key: 'plat', label: 'Platform', render: (x) => <div><div className="font-medium">{x.platform}</div><div className="text-xs text-muted">{x.campaign}</div></div>, sort: (x) => x.platform },
    { key: 'period', label: 'Period', render: (x) => (x.periodStart ? `${x.periodStart} → ${x.periodEnd || '…'}` : '—') },
    { key: 'gross', label: 'Gross', align: 'right', render: (x) => `${x.currency} ${(x.gross / 100).toLocaleString('en-PK')}`, sort: (x) => x.gross },
    { key: 'adj', label: 'Adjustments', align: 'right', render: (x) => `${(x.adjustments / 100).toLocaleString('en-PK')}`, sort: (x) => x.adjustments },
    { key: 'rate', label: 'Rate', align: 'right', render: (x) => (x.currency === 'PKR' ? '—' : x.exchangeRate) },
    { key: 'net', label: 'Net (PKR)', align: 'right', render: (x) => <b className="text-ok"><Money v={x.netPkr} /></b>, sort: (x) => x.netPkr },
    { key: 'act', label: '', render: (x) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton icon={Pencil} label="Edit" onClick={() => setEditing(x)} /><IconButton icon={Trash2} label="Delete" onClick={async () => {
      if (!(await confirm({ title: 'Delete advertising income?', body: `${x.platform} — ${pkr(x.netPkr)}. It moves to Trash and can be restored.`, danger: true, confirmLabel: 'Delete' }))) return
      await safeWrite(() => gxAdIncomeRepo.trash(x.id)); await gxAudit('adIncome', x.id, 'delete', `${x.platform} ${pkr(x.netPkr)}`)
      toast('Moved to trash', 'success', { label: 'Undo', run: () => void gxAdIncomeRepo.restore(x.id) })
    }} /></div> },
  ]
  return (
    <div>
      <RangeBar state={state} setState={setState} range={range} extra={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add income</Button>} />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Net advertising income" tone="ok"><Money v={total} /></Stat>
        <Stat label="Reports">{rows.length}</Stat>
        {byPlatform.slice(0, 2).map(([p, v]) => <Stat key={p} label={p}><Money v={v} /></Stat>)}
      </div>
      <p className="mb-3 text-xs text-muted">Advertising income is recognised on its report date and kept separate from product sales and from advertising spend.</p>
      <DataTable rows={rows} cols={cols} rowKey={(x) => x.id} onRowClick={setEditing} initialSort={{ key: 'date', dir: -1 }} empty="No advertising income recorded for this period."
        toolbar={<ExportButtons name="Advertising income" period={`${range.from} to ${range.to}`} sheets={() => [{ name: 'Ad income', rows: [['Report date', 'Platform', 'Campaign', 'Period start', 'Period end', 'Currency', 'Gross', 'Adjustments', 'Rate', 'Net (Rs)'], ...rows.map((x) => [x.reportDate, x.platform, x.campaign, x.periodStart, x.periodEnd, x.currency, x.gross / 100, x.adjustments / 100, x.exchangeRate, rs(x.netPkr)])] }]} />}
        card={(x) => <div className="flex items-center justify-between gap-2"><div><div className="font-medium">{x.platform}</div><div className="text-xs text-muted">{x.reportDate}{x.campaign && ` · ${x.campaign}`}</div></div><b className="text-ok"><Money v={x.netPkr} /></b></div>} />
      {editing && <IncomeForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function IncomeForm({ item, onClose }: { item: GxAdIncome | null; onClose: () => void }) {
  const { tz } = useGx()
  const today = nowLocal(tz).date
  const [f, setF] = useState({ platform: item?.platform ?? 'YouTube', campaign: item?.campaign ?? '', reportDate: item?.reportDate ?? today, periodStart: item?.periodStart ?? '', periodEnd: item?.periodEnd ?? '', gross: item?.gross ?? null as number | null, adjustments: item?.adjustments ?? 0 as number | null, currency: item?.currency ?? 'PKR', rate: String(item?.exchangeRate ?? 1), notes: item?.notes ?? '', attachmentIds: item?.attachmentIds ?? [] })
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const net = convert((f.gross ?? 0) + (f.adjustments ?? 0), f.currency === 'PKR' ? 1 : Number(f.rate) || 0)
  const save = async () => {
    if (!f.platform.trim()) return setErr('Platform is required.')
    if (!f.reportDate) return setErr('Report date is required.')
    if (f.gross == null || f.gross < 0) return setErr('Enter gross earnings.')
    if (!validRate(f.currency, f.rate)) return setErr('Enter a valid exchange rate.')
    if (f.periodStart && f.periodEnd && f.periodEnd < f.periodStart) return setErr('Period end must be after start.')
    const ok = await safeWrite(() => saveRecord(gxAdIncomeRepo, 'adIncome', item?.id ?? null, { platform: f.platform.trim(), campaign: f.campaign, reportDate: f.reportDate, periodStart: f.periodStart, periodEnd: f.periodEnd, gross: f.gross!, adjustments: f.adjustments ?? 0, currency: f.currency, exchangeRate: f.currency === 'PKR' ? 1 : Number(f.rate), netPkr: net, notes: f.notes, attachmentIds: f.attachmentIds }, `${f.platform} ${pkr(net)}`), 'Saved')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={item ? 'Edit advertising income' : 'Add advertising income'} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Platform / source" htmlFor="ai-p"><Input id="ai-p" list="ai-pl" value={f.platform} onChange={(e) => set('platform', e.target.value)} /><datalist id="ai-pl">{PLATFORMS.map((p) => <option key={p} value={p} />)}</datalist></Field>
        <Field label="Campaign / account" htmlFor="ai-c"><Input id="ai-c" value={f.campaign} onChange={(e) => set('campaign', e.target.value)} /></Field>
        <Field label="Reporting date" htmlFor="ai-d"><Input id="ai-d" type="date" value={f.reportDate} onChange={(e) => set('reportDate', e.target.value)} /></Field>
        <Field label="Period start" htmlFor="ai-ps"><Input id="ai-ps" type="date" value={f.periodStart} onChange={(e) => set('periodStart', e.target.value)} /></Field>
        <Field label="Period end" htmlFor="ai-pe"><Input id="ai-pe" type="date" value={f.periodEnd} onChange={(e) => set('periodEnd', e.target.value)} /></Field>
        <CurrencyRate idPrefix="ai" currency={f.currency} rate={f.rate} onCurrency={(c) => set('currency', c)} onRate={(r) => set('rate', r)} />
        <Field label="Gross earnings" htmlFor="ai-g"><MoneyInput id="ai-g" prefix={f.currency} value={f.gross} onChange={(v) => set('gross', v)} /></Field>
        <Field label="Adjustments (− for deductions)" htmlFor="ai-a"><MoneyInput id="ai-a" prefix={f.currency} allowNegative value={f.adjustments} onChange={(v) => set('adjustments', v)} /></Field>
        <div className="rounded-xl bg-raised/60 p-3 text-sm">Net earnings: <b className="text-ok">{pkr(net)}</b>{f.currency !== 'PKR' && <span className="block text-xs text-muted">= ({f.currency} {(((f.gross ?? 0) + (f.adjustments ?? 0)) / 100).toLocaleString()}) × {f.rate || 0}</span>}</div>
        <Field label="Notes" htmlFor="ai-n" className="sm:col-span-2 lg:col-span-3"><Textarea id="ai-n" className="min-h-[44px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      <div className="mt-3"><AttachmentField label="Report / payout evidence" ids={f.attachmentIds} onChange={(ids) => set('attachmentIds', ids)} tag="ad-report" /></div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </Modal>
  )
}

