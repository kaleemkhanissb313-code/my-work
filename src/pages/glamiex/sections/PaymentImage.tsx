import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, FolderOpen, ImagePlus, LayoutList, LayoutGrid, Plus, RotateCcw, Save, ShieldAlert, Trash2, UserMinus} from 'lucide-react'
import { Button, Field, Input, Select } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { db } from '@/lib/db'
import { pkr } from '@/features/glamiex/money'
import {
  IMAGE_TYPES, MAX_PEOPLE, TEMPLATES, imageFileError, newDesign, newPerson, takePrefill, totals, validateDesign,
  type GxPayImage, type PayDesign, type PayPerson,
} from '@/features/glamiex/payImage/model'
import { cropToSquare, renderPaymentImage } from '@/features/glamiex/payImage/render'
import { useGx } from '../context'
import { nowLocal } from './shared'

const uid = () => crypto.randomUUID()

export default function PaymentImage() {
  const { tz } = useGx()
  const today = nowLocal(tz).date
  // A design handed over from the partner ledger replaces the blank one (and counts as unsaved).
  const [prefilled] = useState(takePrefill)
  const [design, setDesign] = useState<PayDesign>(() => prefilled ?? newDesign(today))
  const [savedId, setSavedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(!!prefilled)
  const partners = useLiveQuery(() => db.bpPartners.orderBy('order').toArray(), [])
  const [showErrors, setShowErrors] = useState(false)
  const [photoErrors, setPhotoErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const preview = useRef<HTMLCanvasElement>(null)
  const saved = useLiveQuery(() => db.gxPayImages.orderBy('updatedAt').reverse().toArray(), [])
  const current = saved?.find((s) => s.id === savedId)

  const check = useMemo(() => validateDesign(design), [design])
  const sum = useMemo(() => totals(design.people), [design.people])

  // Live preview: redraw on every change (at most once per frame).
  useEffect(() => {
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (preview.current && !cancelled) void renderPaymentImage(preview.current, design, 1)
    })
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [design])

  const update = (patch: Partial<PayDesign>) => { setDesign((d) => ({ ...d, ...patch })); setDirty(true) }
  const updatePerson = (key: string, patch: Partial<PayPerson>) =>
    update({ people: design.people.map((p) => (p.key === key ? { ...p, ...patch } : p)) })

  const addPerson = () => { if (design.people.length < MAX_PEOPLE) update({ people: [...design.people, newPerson(today)] }) }
  /** Adds a business partner (name + photo), reusing an empty row when there is one. */
  const addPartner = (id: string) => {
    const bp = partners?.find((x) => x.id === id)
    if (!bp) return
    const empty = design.people.find((p) => !p.name.trim() && !p.amount.trim())
    if (empty) updatePerson(empty.key, { name: bp.name, photo: bp.photo })
    else if (design.people.length < MAX_PEOPLE) update({ people: [...design.people, { ...newPerson(today), name: bp.name, photo: bp.photo }] })
  }
  const removePerson = async (p: PayPerson) => {
    if (design.people.length === 1) return
    if ((p.name || p.amount || p.photo) && !(await confirm({ title: 'Remove this person?', body: `${p.name.trim() || 'This person'} will be removed from the design.`, confirmLabel: 'Remove', danger: true }))) return
    update({ people: design.people.filter((x) => x.key !== p.key) })
  }

  const onPhoto = async (p: PayPerson, file: File | undefined) => {
    if (!file) return
    const err = imageFileError(file)
    if (err) { setPhotoErrors((e) => ({ ...e, [p.key]: err })); return }
    try {
      const photo = await cropToSquare(file)
      setPhotoErrors(({ [p.key]: _, ...rest }) => rest)
      updatePerson(p.key, { photo })
    } catch {
      setPhotoErrors((e) => ({ ...e, [p.key]: 'This image could not be read. Try another file.' }))
    }
  }

  const requireValid = () => {
    setShowErrors(true)
    if (!check.ok) { toast('Fix the highlighted fields first', 'error'); return false }
    return true
  }

  const download = async () => {
    if (!requireValid()) return
    setBusy(true)
    try {
      const canvas = await renderPaymentImage(document.createElement('canvas'), design, 2)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) throw new Error('export failed')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `payment-record-${today}.png`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      toast('Image downloaded')
    } catch { toast('Could not create the image', 'error') } finally { setBusy(false) }
  }

  const save = async (asNew: boolean) => {
    if (!requireValid()) return
    const name = design.title.trim() || 'Payment Summary'
    const now = Date.now()
    let target: GxPayImage | undefined = !asNew ? current : undefined
    if (!target) target = saved?.find((s) => s.name.toLowerCase() === name.toLowerCase())
    if (target && !(await confirm({ title: 'Overwrite saved design?', body: `“${target.name}” is already saved. Replace it with this version?`, confirmLabel: 'Overwrite', danger: true }))) return
    const row: GxPayImage = { id: target?.id ?? uid(), name, design, createdAt: target?.createdAt ?? now, updatedAt: now }
    await db.gxPayImages.put(row)
    setSavedId(row.id); setDirty(false)
    toast(target ? 'Saved design updated' : 'Design saved')
  }

  const open = async (row: GxPayImage) => {
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', body: 'Opening another design replaces what you are editing.', confirmLabel: 'Open design', danger: true }))) return
    setDesign(row.design); setSavedId(row.id); setDirty(false); setShowErrors(false); setPhotoErrors({})
  }

  const remove = async (row: GxPayImage) => {
    if (!(await confirm({ title: 'Delete saved design?', body: `“${row.name}” will be permanently deleted from this device.`, confirmLabel: 'Delete', danger: true }))) return
    await db.gxPayImages.delete(row.id)
    if (row.id === savedId) setSavedId(null)
    toast('Design deleted')
  }

  const reset = async () => {
    if (dirty && !(await confirm({ title: 'Start a new design?', body: 'Unsaved changes to this design will be lost.', confirmLabel: 'Reset', danger: true }))) return
    setDesign(newDesign(today)); setSavedId(null); setDirty(false); setShowErrors(false); setPhotoErrors({})
  }

  const applyTemplate = (id: PayDesign['template']) => {
    const t = TEMPLATES.find((x) => x.id === id)!
    update({ template: t.id, bg: t.bg, fg: t.fg, accent: t.accent })
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <div className="min-w-0 space-y-4">
        {/* Design */}
        <section className="card p-4 sm:p-5" aria-labelledby="pi-design">
          <h2 id="pi-design" className="mb-3 font-semibold">Design</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Heading" htmlFor="pi-title">
              <Input id="pi-title" value={design.title} maxLength={60} onChange={(e) => update({ title: e.target.value })} />
            </Field>
            <Field label="Template" htmlFor="pi-template">
              <Select id="pi-template" value={design.template} onChange={(e) => applyTemplate(e.target.value as PayDesign['template'])}>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </Field>
            <div>
              <span className="label">Image layout</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Image layout">
                {([['list', 'List', LayoutList], ['grid', 'Cards', LayoutGrid]] as const).map(([id, label, Icon]) => (
                  <button key={id} type="button" role="radio" aria-checked={design.layout === id} onClick={() => update({ layout: id })}
                    className={cn('btn h-11 text-sm', design.layout === id ? 'btn-3d' : 'btn-soft')}><Icon className="h-4 w-4" aria-hidden />{label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([['bg', 'Background'], ['fg', 'Text'], ['accent', 'Accent']] as const).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="label">{label}</span>
                  <input type="color" value={design[k]} onChange={(e) => update({ [k]: e.target.value })} aria-label={`${label} colour`}
                    className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface p-1" />
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* People */}
        <section className="card p-4 sm:p-5" aria-labelledby="pi-people">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="pi-people" className="font-semibold">People <span className="text-sm font-normal text-muted">({design.people.length}/{MAX_PEOPLE})</span></h2>
            <div className="flex flex-wrap gap-2">
              {!!partners?.length && (
                <Select aria-label="Add a business partner" className="h-10 w-auto" value="" disabled={design.people.length >= MAX_PEOPLE && !design.people.some((p) => !p.name.trim() && !p.amount.trim())}
                  onChange={(e) => addPartner(e.target.value)}>
                  <option value="">Add partner…</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
              <Button icon={Plus} onClick={addPerson} disabled={design.people.length >= MAX_PEOPLE}>Add person</Button>
            </div>
          </div>
          <ol className="space-y-3">
            {design.people.map((p, i) => {
              const err = showErrors ? check.people[i] : {}
              const fid = (f: string) => `pi-${p.key}-${f}`
              return (
                <li key={p.key} className="rounded-2xl border border-line p-3 sm:p-4" aria-label={`Person ${i + 1}`}>
                  <div className="flex gap-3">
                    <div className="shrink-0 text-center">
                      <label className="group relative grid h-20 w-20 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line bg-raised text-muted hover:border-accent">
                        {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" aria-hidden />}
                        <input type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" aria-label={`Profile image for person ${i + 1}`}
                          onChange={(e) => { void onPhoto(p, e.target.files?.[0]); e.target.value = '' }} />
                      </label>
                      {p.photo && <button type="button" className="mt-1 text-xs text-muted hover:text-danger" onClick={() => updatePerson(p.key, { photo: null })}>Remove photo</button>}
                    </div>
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                      <Field label="Full name" htmlFor={fid('name')} error={err.name}>
                        <Input id={fid('name')} value={p.name} maxLength={60} autoComplete="off" aria-invalid={!!err.name} onChange={(e) => updatePerson(p.key, { name: e.target.value })} />
                      </Field>
                      <Field label="Amount (Rs)" htmlFor={fid('amount')} error={err.amount}>
                        <Input id={fid('amount')} value={p.amount} inputMode="decimal" autoComplete="off" placeholder="0" aria-invalid={!!err.amount} className="text-end tabular-nums"
                          onChange={(e) => updatePerson(p.key, { amount: e.target.value.replace(/[^\d.,]/g, '') })} />
                      </Field>
                      <Field label="Payment date" htmlFor={fid('date')} error={err.date}>
                        <Input id={fid('date')} type="date" value={p.date} aria-invalid={!!err.date} onChange={(e) => updatePerson(p.key, { date: e.target.value })} />
                      </Field>
                      <Field label="Status" htmlFor={fid('status')}>
                        <Select id={fid('status')} value={p.status} onChange={(e) => updatePerson(p.key, { status: e.target.value as PayPerson['status'] })}>
                          <option value="paid">Paid</option><option value="pending">Pending</option>
                        </Select>
                      </Field>
                      <Field label="Transaction reference (optional)" htmlFor={fid('ref')}>
                        <Input id={fid('ref')} value={p.reference ?? ''} maxLength={40} autoComplete="off" onChange={(e) => updatePerson(p.key, { reference: e.target.value })} />
                      </Field>
                      <Field label="Note (optional)" htmlFor={fid('note')}>
                        <Input id={fid('note')} value={p.note} maxLength={80} autoComplete="off" onChange={(e) => updatePerson(p.key, { note: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                  {photoErrors[p.key] && <p role="alert" className="mt-2 text-sm text-danger">{photoErrors[p.key]}</p>}
                  {design.people.length > 1 && (
                    <div className="mt-2 flex justify-end">
                      <Button variant="ghost" icon={UserMinus} onClick={() => void removePerson(p)}>Remove person</Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        {/* Saved designs */}
        <section className="card p-4 sm:p-5" aria-labelledby="pi-saved">
          <h2 id="pi-saved" className="mb-1 font-semibold">Saved designs</h2>
          <p className="mb-3 text-xs text-muted">Stored only on this device. Not synced, backed up or published.</p>
          {!saved?.length ? <p className="text-sm text-muted">No saved designs yet.</p> : (
            <ul className="divide-y divide-line">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-sm font-medium', s.id === savedId && 'text-accent')}>{s.name}</div>
                    <div className="text-xs text-muted">{s.design.people.length} {s.design.people.length === 1 ? 'person' : 'people'} · {pkr(totals(s.design.people).total)} · {new Date(s.updatedAt).toLocaleString()}</div>
                  </div>
                  <Button variant="ghost" icon={FolderOpen} onClick={() => void open(s)} aria-label={`Open ${s.name}`}>Open</Button>
                  <Button variant="ghost" icon={Trash2} onClick={() => void remove(s)} aria-label={`Delete ${s.name}`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Preview + actions */}
      <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start" aria-label="Preview">
        <div className="card p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Live preview</h2>
            <span className="text-sm tabular-nums text-muted">Total <b className="text-fg">{pkr(sum.total)}</b></span>
          </div>
          <div className="overflow-hidden rounded-xl border border-line">
            <canvas ref={preview} className="block h-auto w-full" role="img" aria-label="Payment summary preview" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="primary" icon={Download} loading={busy} onClick={() => void download()} className="col-span-2">Download Image</Button>
            <Button icon={Save} onClick={() => void save(false)}>{savedId ? 'Save changes' : 'Save design'}</Button>
            <Button icon={RotateCcw} onClick={() => void reset()}>Reset</Button>
            {savedId && <Button variant="ghost" icon={Plus} onClick={() => void save(true)} className="col-span-2">Save as new design</Button>}
          </div>
          {current && <p className="mt-2 flex items-center gap-1 text-xs text-muted">Editing “{current.name}”{dirty && ' · unsaved changes'}</p>}
          <p className="mt-3 flex gap-2 rounded-xl bg-raised p-2.5 text-xs text-muted"><ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
            The image is labelled as a payment record. It is not an official bank receipt or a verified transaction confirmation.</p>
        </div>
      </aside>
    </div>
  )
}
