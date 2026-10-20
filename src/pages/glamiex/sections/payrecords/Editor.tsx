import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Copy, Download, Eye, FileImage, ImagePlus, Pencil, Printer, RotateCcw, Save, ShieldAlert, Trash2, Undo2, UserRoundPen, Wand2, X,
} from 'lucide-react'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { IMAGE_TYPES, imageFileError } from '@/features/glamiex/payImage/model'
import { updatePartner } from '@/features/glamiex/partners/service'
import type { BpPartner } from '@/features/glamiex/partners/types'
import {
  CURRENCIES, PR_FONTS, PR_METHODS, PR_STATUSES, PR_TEMPLATES, blankRecord, defaultDesign, duplicateOf, formatAmount, longDate, parseAmount, validateRecord, weekday,
  type Currency, type PayRecord, type PrDesign, type PrDraft, type PrMethod, type PrStatus, type PrTemplate,
} from '@/features/glamiex/payRecords/model'
import { renderRecord } from '@/features/glamiex/payRecords/render'
import { deleteRecord, saveRecord } from '@/features/glamiex/payRecords/service'
import { CropDialog } from '@/features/glamiex/payRecords/CropDialog'
import { downloadRecord, printRecord } from './actions'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** Moves an ISO date to the chosen weekday within the same Monday–Sunday week. */
function moveToWeekday(iso: string, day: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const cur = (dt.getUTCDay() + 6) % 7, target = DAYS.indexOf(day)
  dt.setUTCDate(dt.getUTCDate() + (target - cur))
  return dt.toISOString().slice(0, 10)
}
const strip = (d: PrDraft) => JSON.stringify(d)
const toDraft = (r: PayRecord): PrDraft => {
  const { createdAt: _c, updatedAt: _u, deletedAt: _d, archived: _a, favorite: _f, pinned: _p, tags: _t, version: _v, syncedAt: _s, color: _co, folderId: _fo, ...rest } = r
  return { ...rest, design: { ...defaultDesign(), ...rest.design } }
}

export function Editor({ partner, record, today, now, onSaved, onCleared }: {
  partner: BpPartner; record: PayRecord | null; today: string; now: string
  onSaved: (r: PayRecord) => void; onCleared: () => void
}) {
  const fresh = () => blankRecord({ id: partner.id, name: partner.name, photo: partner.photo }, today, now)
  const [d, setD] = useState<PrDraft>(() => (record ? toDraft(record) : fresh()))
  const [saved, setSaved] = useState<string>(() => (record ? strip(toDraft(record)) : strip(d)))
  const [amountText, setAmountText] = useState(() => (record ? String(record.amount / 100) : ''))
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [crop, setCrop] = useState<{ kind: 'photo' | 'proof'; src: string } | null>(null)
  const [fileErr, setFileErr] = useState<Record<string, string>>({})
  const [generated, setGenerated] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const preview = useRef<HTMLCanvasElement>(null)
  const firstField = useRef<HTMLInputElement>(null)

  const dirty = strip(d) !== saved
  const errors = useMemo(() => validateRecord(d), [d])
  const err = (k: string) => (shown ? errors[k] : undefined)
  const set = (patch: Partial<PrDraft>) => setD((x) => ({ ...x, ...patch }))
  const setDesign = (patch: Partial<PrDesign>) => setD((x) => ({ ...x, design: { ...x.design, ...patch } }))

  // Live preview, redrawn once per frame at most.
  useEffect(() => {
    let off = false
    const raf = requestAnimationFrame(() => { if (preview.current && !off) void renderRecord(preview.current, d, 0.5) })
    return () => { off = true; cancelAnimationFrame(raf) }
  }, [d, mobileView])

  const pickFile = (kind: 'photo' | 'proof', file?: File) => {
    if (!file) return
    const e = imageFileError(file)
    if (e) { setFileErr((x) => ({ ...x, [kind]: e })); return }
    setFileErr(({ [kind]: _, ...rest }) => rest)
    const reader = new FileReader()
    reader.onload = () => setCrop({ kind, src: String(reader.result) })
    reader.onerror = () => setFileErr((x) => ({ ...x, [kind]: 'This image could not be read' }))
    reader.readAsDataURL(file)
  }

  const requireValid = () => {
    setShown(true)
    if (Object.keys(errors).length) { toast(Object.values(errors)[0], 'error'); setMobileView('edit'); return false }
    return true
  }
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn() } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(null) } }

  const save = () => { if (requireValid()) void run('save', async () => {
    const row = await saveRecord(d)
    const next = toDraft(row)
    setD(next); setSaved(strip(next)); onSaved(row)
    toast(d.id ? 'Payment record updated' : 'Payment record saved')
  }) }
  const download = (ext: 'png' | 'jpg') => { if (requireValid()) void run(ext, async () => { await downloadRecord(d, ext); toast(`${ext.toUpperCase()} downloaded`) }) }
  const generate = () => { if (requireValid()) void run('gen', async () => { const c = await renderRecord(document.createElement('canvas'), d, 1); setGenerated(c.toDataURL('image/png')) }) }
  const print = () => { if (requireValid()) void run('print', () => printRecord(d)) }
  const duplicate = async () => {
    if (dirty && d.id && !(await confirm({ title: 'Duplicate with unsaved changes?', body: 'The copy includes your unsaved edits. The saved record stays as it was.', confirmLabel: 'Duplicate' }))) return
    const copy = duplicateOf(d)
    setD(copy); setSaved(''); onCleared()
    toast('Copy created — reference cleared and status set to Pending. Save to keep it.')
  }
  const reset = async () => {
    if (dirty && !(await confirm({ title: 'Reset the form?', body: 'Unsaved changes will be lost. Saved records are not affected.', confirmLabel: 'Reset', danger: true }))) return
    const f = fresh(); setD(f); setSaved(strip(f)); setAmountText(''); setShown(false); onCleared()
  }
  const cancelEditing = async () => {
    if (!record) return
    if (!(await confirm({ title: 'Discard changes?', body: 'The saved record is restored exactly as it was.', confirmLabel: 'Discard changes', danger: true }))) return
    const r = toDraft(record); setD(r); setAmountText(String(record.amount / 100)); setShown(false)
  }
  const remove = async () => {
    if (!d.id) return
    if (!(await confirm({ title: 'Delete this payment record?', body: `“${d.title}” for ${d.partnerName} will be removed from all histories and devices. It can be restored from Trash.`, confirmLabel: 'Delete record', danger: true }))) return
    await deleteRecord(d.id); toast('Payment record deleted')
    const f = fresh(); setD(f); setSaved(strip(f)); setAmountText(''); onCleared()
  }
  const saveProfilePhoto = async () => {
    if (!(await confirm({ title: `Use as ${partner.name}'s profile picture?`, body: 'New payment records for this partner will start with this picture. Existing records keep their own.', confirmLabel: 'Update profile' }))) return
    await run('profile', async () => { await updatePartner(partner.id, { name: partner.name, phone: partner.phone, notes: partner.notes, photo: d.photo }); toast('Profile picture saved') })
  }
  const saveProfileName = async () => {
    const name = d.partnerName.trim()
    if (!name || name === partner.name) return
    if (!(await confirm({ title: `Rename ${partner.name}?`, body: `The partner profile will be called “${name}” everywhere in GLAMIEX. Existing payment records keep the name they were saved with.`, confirmLabel: 'Rename partner' }))) return
    await run('profile', async () => { await updatePartner(partner.id, { name, phone: partner.phone, notes: partner.notes, photo: partner.photo }); toast('Partner renamed') })
  }

  const day = weekday(d.date)
  const pic = (kind: 'photo' | 'proof', label: string, src: string | null, round: boolean) => (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        <label className={cn('relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden border border-dashed border-line bg-raised text-muted hover:border-accent', round ? 'rounded-full' : 'rounded-xl')}>
          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" aria-hidden />}
          <input type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" aria-label={`Upload ${label.toLowerCase()}`} onChange={(e) => { pickFile(kind, e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <div className="flex flex-col items-start gap-1 text-xs">
          {src && <button type="button" className="text-muted hover:text-fg" onClick={() => setCrop({ kind, src })}>Crop again</button>}
          {src && <button type="button" className="text-muted hover:text-danger" onClick={() => set({ [kind]: null })}>Remove</button>}
          {kind === 'photo' && src !== partner.photo && <button type="button" className="text-accent" onClick={() => void saveProfilePhoto()}>Save as profile picture</button>}
        </div>
      </div>
      {fileErr[kind] && <p role="alert" className="mt-1 text-sm text-danger">{fileErr[kind]}</p>}
    </div>
  )

  const actions = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
      <Button variant="primary" icon={Save} loading={busy === 'save'} onClick={save} className="col-span-2 sm:col-span-4 xl:col-span-2">{d.id ? 'Save changes' : 'Save Payment Record'}</Button>
      <Button icon={Wand2} loading={busy === 'gen'} onClick={generate}>Generate Image</Button>
      <Button icon={Pencil} className="xl:hidden" onClick={() => { setMobileView('edit'); setTimeout(() => firstField.current?.focus(), 50) }}>Edit Details</Button>
      <Button icon={Pencil} className="hidden xl:inline-flex" onClick={() => firstField.current?.focus()}>Edit Details</Button>
      <Button icon={Download} loading={busy === 'png'} onClick={() => download('png')}>Download PNG</Button>
      <Button icon={FileImage} loading={busy === 'jpg'} onClick={() => download('jpg')}>Download JPG</Button>
      <Button icon={Printer} loading={busy === 'print'} onClick={print}>Print Payment Record</Button>
      <Button icon={Copy} onClick={() => void duplicate()}>Duplicate Record</Button>
      <Button icon={RotateCcw} onClick={() => void reset()}>Reset Form</Button>
      {record && dirty && <Button icon={Undo2} onClick={() => void cancelEditing()}>Cancel editing</Button>}
      {d.id && <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>Delete record</Button>}
    </div>
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <div className="xl:hidden">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Editor view">
          {([['edit', 'Edit details', Pencil], ['preview', 'Preview', Eye]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} className={cn('btn h-11 text-sm', mobileView === v ? 'btn-3d' : 'btn-soft')}><Icon className="h-4 w-4" aria-hidden />{label}</button>
          ))}
        </div>
      </div>

      <form className={cn('min-w-0 space-y-4', mobileView === 'preview' && 'max-xl:hidden')} onSubmit={(e) => { e.preventDefault(); save() }} aria-label="Payment details">
        <p className="text-sm text-muted">{d.id ? <>Editing a saved record{dirty && <b className="text-warn"> · unsaved changes</b>}</> : 'New payment record'} for <b className="text-fg">{partner.name}</b></p>
        <section className="card grid gap-3 p-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Partner</h3>
          <Field label="Partner name" htmlFor="pr-name" error={err('partnerName')}>
            <div className="flex gap-2">
              <Input id="pr-name" ref={firstField} value={d.partnerName} maxLength={60} onChange={(e) => set({ partnerName: e.target.value })} />
              {d.partnerName.trim() && d.partnerName.trim() !== partner.name && <Button icon={UserRoundPen} aria-label="Rename partner profile" title="Rename the partner profile" onClick={() => void saveProfileName()} />}
            </div>
          </Field>
          {pic('photo', 'Partner profile picture', d.photo, true)}
        </section>

        <section className="card grid gap-3 p-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Payment</h3>
          <Field label="Payment title or heading" htmlFor="pr-title" error={err('title')} className="sm:col-span-2">
            <Input id="pr-title" value={d.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Payment amount" htmlFor="pr-amount" error={err('amount')}>
            <Input id="pr-amount" inputMode="decimal" autoComplete="off" className="text-right tabular-nums" value={amountText} placeholder="0"
              onChange={(e) => { const t = e.target.value.replace(/[^\d.,]/g, ''); setAmountText(t); set({ amount: parseAmount(t) ?? 0 }) }} />
          </Field>
          <Field label="Currency" htmlFor="pr-cur">
            <Select id="pr-cur" value={d.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>{CURRENCIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          </Field>
          <Field label="Payment date" htmlFor="pr-date" error={err('date')} hint={day ? `${longDate(d.date)}` : undefined}>
            <Input id="pr-date" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Day of the week" htmlFor="pr-day" hint="Set automatically from the date">
            <Select id="pr-day" value={day} disabled={!day} onChange={(e) => set({ date: moveToWeekday(d.date, e.target.value) })}>
              {!day && <option value="">—</option>}{DAYS.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Payment time" htmlFor="pr-time" error={err('time')}><Input id="pr-time" type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} /></Field>
          <Field label="Payment method" htmlFor="pr-method">
            <Select id="pr-method" value={d.method ?? ''} onChange={(e) => set({ method: (e.target.value || null) as PrMethod | null })}>
              <option value="">Not specified</option>{PR_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Payment status" htmlFor="pr-status">
            <Select id="pr-status" value={d.status} onChange={(e) => set({ status: e.target.value as PrStatus, paidConfirmed: false })}>
              {PR_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          {d.status === 'paid' && (
            <label className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm sm:col-span-2', err('paidConfirmed') ? 'border-danger' : 'border-line')}>
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={d.paidConfirmed} onChange={(e) => set({ paidConfirmed: e.target.checked })} />
              <span>I have confirmed this payment was actually made.<span className="block text-xs text-muted">Leave the status as Pending until you have checked it.</span>
                {err('paidConfirmed') && <span role="alert" className="block text-xs text-danger">{err('paidConfirmed')}</span>}</span>
            </label>
          )}
        </section>

        <section className="card grid gap-3 p-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Details</h3>
          <Field label="Sender name" htmlFor="pr-sender"><Input id="pr-sender" value={d.sender} maxLength={60} onChange={(e) => set({ sender: e.target.value })} /></Field>
          <Field label="Receiver name" htmlFor="pr-receiver"><Input id="pr-receiver" value={d.receiver} maxLength={60} onChange={(e) => set({ receiver: e.target.value })} /></Field>
          <Field label="Payment purpose or description" htmlFor="pr-purpose" className="sm:col-span-2"><Input id="pr-purpose" value={d.purpose} maxLength={160} onChange={(e) => set({ purpose: e.target.value })} /></Field>
          <Field label="Transaction / reference number" htmlFor="pr-ref" error={err('reference')} hint="Only enter a real reference — never make one up">
            <Input id="pr-ref" value={d.reference} maxLength={60} autoComplete="off" onChange={(e) => set({ reference: e.target.value })} />
          </Field>
          <Field label="Payment location" htmlFor="pr-loc"><Input id="pr-loc" value={d.location} maxLength={80} onChange={(e) => set({ location: e.target.value })} /></Field>
          <Field label="Additional notes" htmlFor="pr-notes" className="sm:col-span-2"><Textarea id="pr-notes" rows={3} value={d.notes} maxLength={400} onChange={(e) => set({ notes: e.target.value })} /></Field>
          <div className="sm:col-span-2">{pic('proof', 'Payment picture or proof', d.proof, false)}</div>
        </section>

        <section className="card grid gap-3 p-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Design</h3>
          <Field label="Template" htmlFor="pr-template">
            <Select id="pr-template" value={d.design.template} onChange={(e) => { const t = PR_TEMPLATES.find((x) => x.id === e.target.value)!; setDesign({ template: t.id as PrTemplate, bg: t.bg, fg: t.fg, accent: t.accent }) }}>
              {PR_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Typography" htmlFor="pr-font">
            <Select id="pr-font" value={d.design.font} onChange={(e) => setDesign({ font: e.target.value as PrDesign['font'] })}>{PR_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
          </Field>
          <Field label="Layout" htmlFor="pr-layout">
            <Select id="pr-layout" value={d.design.layout} onChange={(e) => setDesign({ layout: e.target.value as PrDesign['layout'] })}><option value="portrait">Portrait list</option><option value="compact">Compact grid</option></Select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            {([['bg', 'Background'], ['fg', 'Text'], ['accent', 'Accent']] as const).map(([k, label]) => (
              <label key={k} className="block"><span className="label">{label}</span>
                <input type="color" value={d.design[k]} aria-label={`${label} colour`} onChange={(e) => setDesign({ [k]: e.target.value })} className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface p-1" /></label>
            ))}
          </div>
        </section>
        <button type="submit" hidden />
      </form>

      <aside className={cn('min-w-0 xl:sticky xl:top-20 xl:self-start', mobileView === 'edit' && 'max-xl:hidden')} aria-label="Live preview">
        <div className="card space-y-3 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Live preview</h3>
            <span className="text-sm tabular-nums">{d.amount ? formatAmount(d.amount, d.currency) : '—'}</span></div>
          <div className="overflow-hidden rounded-xl border border-line"><canvas ref={preview} role="img" aria-label="Payment image preview" className="block h-auto w-full" /></div>
          {actions}
          <p className="flex gap-2 rounded-xl bg-raised p-2.5 text-xs text-muted"><ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
            Images are labelled as payment records, not bank receipts or verified transfer confirmations. Creating one does not prove that money was sent.</p>
        </div>
      </aside>
      <div className={cn('xl:hidden', mobileView === 'preview' && 'hidden')}>{actions}</div>

      {crop && (
        <CropDialog src={crop.src} title={crop.kind === 'photo' ? 'Crop profile picture' : 'Crop payment proof'} aspects={crop.kind === 'photo' ? ['square'] : ['original', 'landscape', 'square']}
          onClose={() => setCrop(null)} onDone={(url) => { set({ [crop.kind]: url }); setCrop(null) }} />
      )}
      <Modal open={!!generated} onClose={() => setGenerated(null)} title="Generated payment image" wide footer={<>
        <Button icon={X} onClick={() => setGenerated(null)}>Close</Button>
        <Button icon={Download} onClick={() => download('png')}>Download PNG</Button>
        <Button variant="primary" icon={FileImage} onClick={() => download('jpg')}>Download JPG</Button>
      </>}>
        {generated && <img src={generated} alt={`Payment record for ${d.partnerName}`} className="mx-auto max-h-[70vh] w-auto rounded-xl" />}
      </Modal>
    </div>
  )
}
