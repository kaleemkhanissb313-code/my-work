import { useState } from 'react'
import { ImagePlus, Info } from 'lucide-react'
import { Button, Field, Input, Textarea } from '@/components/ui'
import { toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { imageFileError, IMAGE_TYPES } from '@/features/glamiex/payImage/model'
import { cropToSquare } from '@/features/glamiex/payImage/render'
import { parsePercent, pct, shareTotal } from '@/features/glamiex/partners/engine'
import { updatePartner, updateShares, type ShareKind } from '@/features/glamiex/partners/service'
import { FULL_SHARE, type BpPartner } from '@/features/glamiex/partners/types'
import { Avatar, useBp } from './shared'

function ProfileCard({ p }: { p: BpPartner }) {
  const [form, setForm] = useState({ name: p.name, phone: p.phone, notes: p.notes, photo: p.photo })
  const [photoErr, setPhotoErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = form.name !== p.name || form.phone !== p.phone || form.notes !== p.notes || form.photo !== p.photo
  const onPhoto = async (file?: File) => {
    if (!file) return
    const e = imageFileError(file)
    if (e) { setPhotoErr(e); return }
    try { const photo = await cropToSquare(file); setForm((f) => ({ ...f, photo })); setPhotoErr(null) } catch { setPhotoErr('This image could not be read') }
  }
  const save = async () => {
    setBusy(true)
    try { await updatePartner(p.id, form); toast(`${form.name.trim()} updated`) } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <li className="card p-4" aria-label={`${p.name} profile`}>
      <div className="flex gap-3">
        <div className="shrink-0 text-center">
          <label className="relative block cursor-pointer" title="Upload profile image">
            <Avatar p={{ name: form.name, photo: form.photo }} size="lg" />
            <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-muted"><ImagePlus className="h-3.5 w-3.5" aria-hidden /></span>
            <input type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" aria-label={`Profile image for ${p.name}`} onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {form.photo && <button type="button" className="mt-2 text-xs text-muted hover:text-danger" onClick={() => setForm((f) => ({ ...f, photo: null }))}>Remove</button>}
        </div>
        <div className="grid min-w-0 flex-1 gap-2">
          <Field label="Name" htmlFor={`pf-n-${p.id}`}><Input id={`pf-n-${p.id}`} value={form.name} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Phone (optional)" htmlFor={`pf-p-${p.id}`}><Input id={`pf-p-${p.id}`} value={form.phone} maxLength={30} inputMode="tel" onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
          <Field label="Notes (optional)" htmlFor={`pf-o-${p.id}`}><Textarea id={`pf-o-${p.id}`} rows={2} value={form.notes} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        </div>
      </div>
      {photoErr && <p role="alert" className="mt-2 text-sm text-danger">{photoErr}</p>}
      <div className="mt-3 flex justify-end"><Button variant="primary" disabled={!dirty || !form.name.trim()} loading={busy} onClick={() => void save()}>Save profile</Button></div>
    </li>
  )
}

const SHARE_COLS: { kind: ShareKind; label: string; hint: string }[] = [
  { kind: 'ownershipBp', label: 'Business ownership', hint: 'Who owns how much of the business' },
  { kind: 'profitBp', label: 'Profit share', hint: 'How net profit is divided' },
  { kind: 'lossBp', label: 'Loss share', hint: 'How a net loss is divided' },
]

function SharesEditor() {
  const { partners, figures } = useBp()
  const [text, setText] = useState(() => Object.fromEntries(SHARE_COLS.map((c) => [c.kind, Object.fromEntries(partners.map((p) => [p.id, String(p[c.kind] / 100)]))])) as Record<ShareKind, Record<string, string>>)
  const [busy, setBusy] = useState<ShareKind | null>(null)
  const parsed = (k: ShareKind) => partners.map((p) => parsePercent(text[k][p.id] ?? ''))
  const total = (k: ShareKind) => shareTotal(parsed(k).map((v) => v ?? 0))
  const valid = (k: ShareKind) => parsed(k).every((v) => v != null) && total(k) === FULL_SHARE
  const save = async (k: ShareKind) => {
    if (!valid(k)) { toast('Each column must total exactly 100%', 'error'); return }
    setBusy(k)
    try { await updateShares(k, Object.fromEntries(partners.map((p, i) => [p.id, parsed(k)[i]!]))); toast('Percentages saved') } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(null) }
  }
  return (
    <section className="card p-4" aria-labelledby="sh-title">
      <h2 id="sh-title" className="font-semibold">Ownership and sharing agreement</h2>
      <p className="mb-3 mt-1 flex gap-2 text-xs text-muted"><Info className="h-4 w-4 shrink-0" aria-hidden />These three agreements can differ from each other and from the capital each partner has put in. Each column must total 100% before it can be saved or used.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-2">Partner</th><th className="py-2 text-right">Capital share (actual)</th>
            {SHARE_COLS.map((c) => <th key={c.kind} className="py-2 text-right" title={c.hint}>{c.label} %</th>)}</tr></thead>
          <tbody>
            {partners.map((p) => {
              const f = figures.partners.find((x) => x.partnerId === p.id)!
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-2"><span className="flex items-center gap-2"><Avatar p={p} size="sm" />{p.name}</span></td>
                  <td className="py-2 text-right tabular-nums text-muted">{figures.capital > 0 ? pct(Math.round((Math.max(0, f.capital) / figures.capital) * FULL_SHARE)) : '—'}</td>
                  {SHARE_COLS.map((c) => {
                    const bad = parsePercent(text[c.kind][p.id] ?? '') == null
                    return (
                      <td key={c.kind} className="py-2 pl-2">
                        <Input aria-label={`${p.name} ${c.label} percent`} inputMode="decimal" value={text[c.kind][p.id] ?? ''} aria-invalid={bad} className={cn('ml-auto w-24 text-right tabular-nums', bad && 'border-danger')}
                          onChange={(e) => setText((t) => ({ ...t, [c.kind]: { ...t[c.kind], [p.id]: e.target.value.replace(/[^\d.]/g, '') } }))} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            <tr className="border-t border-line font-semibold"><td className="py-2">Total</td><td className="py-2 text-right text-muted">{figures.capital > 0 ? '100%' : '—'}</td>
              {SHARE_COLS.map((c) => <td key={c.kind} className={cn('py-2 text-right tabular-nums', valid(c.kind) ? 'text-ok' : 'text-danger')}>{pct(total(c.kind))}</td>)}</tr>
            <tr><td /><td />
              {SHARE_COLS.map((c) => <td key={c.kind} className="py-2 text-right"><Button size="sm" disabled={!valid(c.kind)} loading={busy === c.kind} onClick={() => void save(c.kind)}>Save {c.label.split(' ')[0].toLowerCase()}</Button></td>)}</tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function PartnerSettings() {
  const { partners } = useBp()
  return (
    <div className="space-y-4">
      <SharesEditor />
      <section aria-labelledby="pf-title">
        <h2 id="pf-title" className="mb-1 font-semibold">Partner profiles</h2>
        <p className="mb-3 text-xs text-muted">The five partners are permanent. Editing a name or photo never changes or removes their recorded transactions.</p>
        <ul className="grid gap-3 lg:grid-cols-2">{partners.map((p) => <ProfileCard key={p.id} p={p} />)}</ul>
      </section>
    </div>
  )
}
