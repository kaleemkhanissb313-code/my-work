import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { BookOpen, History, Palette, Plus, Settings2, X } from 'lucide-react'
import { Badge, Button, Field, Input, Select, Toggle } from '@/components/ui'
import { safeWrite } from '@/components/feedback'
import { db } from '@/lib/db'
import { updateGxSettings } from '@/features/glamiex/service'
import { ExportButtons, Section } from '@/features/glamiex/ui'
import { zoneList } from '@/features/tasks/timezones'
import type { GxPreset, GxSettings } from '@/features/glamiex/types'
import { cn } from '@/lib/cn'
import { useGx } from '../context'

const PRESETS: { id: GxPreset; name: string; desc: string; swatch: string }[] = [
  { id: 'neon', name: 'Neon 3D', desc: 'Dark, violet & electric-blue rim light, dimensional cards', swatch: 'linear-gradient(135deg,#0b1020,#3b0764 60%,#1d4ed8)' },
  { id: 'glass', name: 'Glass Finance', desc: 'Translucent surfaces, elegant gradients, soft shadows', swatch: 'linear-gradient(135deg,rgba(124,58,237,.5),rgba(59,130,246,.35)),#111827' },
  { id: 'executive', name: 'Executive Pro', desc: 'Clean navy, restrained accents, compact tables', swatch: 'linear-gradient(135deg,#0b1326,#18264a)' },
  { id: 'aurora', name: 'Aurora Analytics', desc: 'Blue-purple aurora, prominent charts', swatch: 'radial-gradient(circle at 20% 20%,#818cf8,transparent 60%),radial-gradient(circle at 80% 30%,#c084fc,transparent 60%),#0f172a' },
  { id: 'minimal', name: 'Minimal Business', desc: 'Light surfaces, subtle depth, highly readable', swatch: 'linear-gradient(135deg,#ffffff,#eef2f7)' },
]
const ACCENTS: { id: GxSettings['gxAccent']; label: string; color: string }[] = [
  { id: 'violet', label: 'Violet', color: '#7c3aed' }, { id: 'blue', label: 'Blue', color: '#2563eb' }, { id: 'emerald', label: 'Emerald', color: '#059669' }, { id: 'rose', label: 'Rose', color: '#e11d48' },
]

export default function SettingsSection() {
  const { settings: s } = useGx()
  const set = (p: Partial<GxSettings>) => void safeWrite(() => updateGxSettings(p), 'Saved')
  const zones = useMemo(() => zoneList(), [])
  const [newCat, setNewCat] = useState('')
  const audit = useLiveQuery(() => db.gxAudit.orderBy('at').reverse().limit(500).toArray(), [])
  return (
    <div className="space-y-4">
      <Section title="Design preset" icon={Palette}>
        <p className="mb-3 text-sm text-muted">Presets only change how GLAMIEX looks. Your data and calculations are never touched.</p>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="Design preset">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={s.preset === p.id} onClick={() => set({ preset: p.id })}
              className={cn('flex flex-col overflow-hidden rounded-2xl border text-left transition', s.preset === p.id ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-accent/50')}>
              <span className="h-16 w-full" style={{ background: p.swatch }} aria-hidden />
              <span className="p-3"><span className="block text-sm font-semibold">{p.name}</span><span className="block text-xs text-muted">{p.desc}</span></span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <fieldset><legend className="label">Accent color</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">{ACCENTS.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={s.gxAccent === a.id} onClick={() => set({ gxAccent: a.id })}
                className={cn('flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm', s.gxAccent === a.id ? 'border-accent font-semibold' : 'border-line')}>
                <span className="h-4 w-4 rounded-full" style={{ background: a.color }} aria-hidden />{a.label}</button>
            ))}</div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Card density" htmlFor="gs-den"><Select id="gs-den" value={s.density} onChange={(e) => set({ density: e.target.value as GxSettings['density'] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></Select></Field>
            <Field label="Chart lines" htmlFor="gs-chart"><Select id="gs-chart" value={s.chartStyle} onChange={(e) => set({ chartStyle: e.target.value as GxSettings['chartStyle'] })}><option value="smooth">Smooth curves</option><option value="linear">Straight lines</option></Select></Field>
            <Field label="Sidebar" htmlFor="gs-side"><Select id="gs-side" value={s.sidebar} onChange={(e) => set({ sidebar: e.target.value as GxSettings['sidebar'] })}><option value="expanded">Expanded</option><option value="collapsed">Icons only</option></Select></Field>
            <div className="flex items-end"><Toggle label="Gradient chart fills" checked={s.chartGradient} onChange={(v) => set({ chartGradient: v })} /></div>
          </div>
        </div>
      </Section>

      <Section title="Business settings" icon={Settings2}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Time zone" htmlFor="gs-tz" hint="Dates, days and hours in reports use this zone"><Select id="gs-tz" value={s.timeZone} onChange={(e) => set({ timeZone: e.target.value })}>{zones.map((z) => <option key={z}>{z}</option>)}</Select></Field>
          <Field label="Currency" htmlFor="gs-cur" hint="All amounts are stored and reported in PKR"><Input id="gs-cur" value="PKR (Rs)" disabled /></Field>
          <Field label="Default sales tax %" htmlFor="gs-tax" hint="0 = no automatic tax on new sales">
            <Input id="gs-tax" inputMode="decimal" defaultValue={String(s.taxRatePct)} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 100) set({ taxRatePct: v }) }} />
          </Field>
          <Field label="Default low-stock alert" htmlFor="gs-low"><Input id="gs-low" inputMode="numeric" defaultValue={String(s.defaultLowStock)} onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0) set({ defaultLowStock: v }) }} /></Field>
        </div>
        <Toggle label="Allow selling more than current stock" description="Off (recommended): a sale is blocked when stock is insufficient." checked={s.allowNegativeStock} onChange={(v) => set({ allowNegativeStock: v })} />
        <div className="mt-3">
          <div className="label">Expense categories</div>
          <div className="flex flex-wrap gap-1.5">{s.expenseCategories.map((c) => (
            <span key={c} className="chip border-line py-1 text-xs">{c}<button type="button" aria-label={`Remove ${c}`} onClick={() => set({ expenseCategories: s.expenseCategories.filter((x) => x !== c) })}><X className="h-3 w-3" /></button></span>
          ))}</div>
          <form className="mt-2 flex gap-2 sm:max-w-sm" onSubmit={(e) => { e.preventDefault(); const c = newCat.trim(); if (c && !s.expenseCategories.includes(c)) set({ expenseCategories: [...s.expenseCategories, c] }); setNewCat('') }}>
            <Input aria-label="New category" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} /><Button type="submit" icon={Plus}>Add</Button>
          </form>
        </div>
      </Section>

      <Section title="Accounting assumptions" icon={BookOpen} defaultOpen={false}>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li><b className="text-fg">Money</b> is stored as whole paisa (Rs 1 = 100 paisa), so totals never drift from rounding.</li>
          <li><b className="text-fg">Sales</b> count on the sale date. <b className="text-fg">Cancelled</b> sales are excluded completely and their stock is returned. <b className="text-fg">Refunds</b> are separate records that reduce revenue (and COGS for returned units) on the refund date.</li>
          <li><b className="text-fg">Net sales</b> = item totals − discounts − refunds. <b className="text-fg">Tax</b> is collected for the government and is not revenue.</li>
          <li><b className="text-fg">COGS</b> uses the unit cost saved with each sale; changing a product's price later never rewrites past sales.</li>
          <li><b className="text-fg">Gross profit</b> = net sales − COGS. <b className="text-fg">Net profit</b> = gross profit + advertising income − advertising spend − business expenses.</li>
          <li><b className="text-fg">Advertising income</b> counts on its report date. <b className="text-fg">Advertising spend</b> is spread evenly across the campaign's days for profit, and treated as paid on the start date for cash reports.</li>
          <li><b className="text-fg">Customer deposits</b> are customer credit, not revenue. <b className="text-fg">Owner contributions and loans</b> are financing. <b className="text-fg">Owner drawings</b> are not expenses.</li>
          <li><b className="text-fg">Cash received</b> = recorded payments only. <b className="text-fg">Receivables</b> = opening balance + sales − refunds − payments ± adjustments, per customer, never negative (negative = customer credit).</li>
          <li>Posted sales and payments are corrected with <b className="text-fg">cancellations, refunds and voids</b> — not edited — and every change is in the audit trail.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">These rules suit a small trading business on a simple accrual basis. Check with your accountant for tax filing; GLAMIEX is not certified accounting software.</p>
      </Section>

      <Section title={`Audit trail (${audit?.length ?? 0})`} icon={History} defaultOpen={false}
        actions={<ExportButtons name="GLAMIEX audit trail" period="All time" sheets={() => [{ name: 'Audit', rows: [['When', 'Record', 'ID', 'Action', 'Summary'], ...(audit ?? []).map((a) => [format(a.at, 'yyyy-MM-dd HH:mm:ss'), a.entity, a.entityId, a.action, a.summary])] }]} />}>
        {!audit?.length ? <p className="text-sm text-muted">No changes recorded yet.</p> : (
          <ul className="max-h-96 divide-y divide-line/60 overflow-y-auto text-sm">{audit.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5"><span className="w-36 text-xs text-muted">{format(a.at, 'MMM d, HH:mm:ss')}</span><Badge>{a.entity}</Badge>
              <Badge tone={a.action === 'delete' || a.action === 'void' || a.action === 'cancel' ? 'danger' : a.action === 'refund' ? 'warn' : 'muted'}>{a.action}</Badge><span className="min-w-0 flex-1 text-muted">{a.summary}</span></li>
          ))}</ul>
        )}
        <p className="mt-2 text-xs text-muted">Kept on this device and included in backups. The cloud copy (when sync is enabled) is append-only.</p>
      </Section>
    </div>
  )
}
