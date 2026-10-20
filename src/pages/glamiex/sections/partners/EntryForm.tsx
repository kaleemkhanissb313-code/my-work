import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { pkr } from '@/features/glamiex/money'
import { AttachmentField, MoneyInput } from '@/features/glamiex/ui'
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/glamiex/types'
import { validateDraft } from '@/features/glamiex/partners/engine'
import { blankDraft, DuplicateError, postTxn } from '@/features/glamiex/partners/service'
import type { BpTxnDraft, BpTxnType } from '@/features/glamiex/partners/types'
import { useGx } from '../../context'
import { nowLocal } from '../shared'
import { Avatar, RECORD_NOTE, useBp, type FormKind } from './shared'

const TITLES: Record<FormKind, string> = {
  investment: 'Add Business Investment', transfer: 'Send Money / Partner Settlement', cash: 'Record revenue or expense',
  withdrawal: 'Capital withdrawal', distribution: 'Pay out profit',
}

export function EntryForm({ kind, preset, onClose }: { kind: FormKind; preset?: { partnerId?: string }; onClose: () => void }) {
  const { tz } = useGx()
  const { partners, figures, projects } = useBp()
  const now = nowLocal(tz)
  const initialType: BpTxnType = kind === 'investment' ? (figures.contributed ? 'investment' : 'initial_capital')
    : kind === 'transfer' ? 'transfer' : kind === 'cash' ? 'revenue' : kind === 'withdrawal' ? 'withdrawal' : 'profit_dist'
  const [d, setD] = useState<BpTxnDraft>(() => {
    const base = blankDraft(initialType, now.date, now.time)
    if (kind === 'transfer' && preset?.partnerId) base.fromId = preset.partnerId
    if (kind === 'distribution') base.lines = figures.partners.filter((f) => f.profitPayable > 0).map((f) => ({ partnerId: f.partnerId, amount: f.profitPayable }))
    if (kind === 'withdrawal' && preset?.partnerId) base.lines = [{ partnerId: preset.partnerId, amount: 0 }]
    if (kind === 'distribution' || kind === 'withdrawal' || kind === 'transfer') base.method = 'cash'
    return base
  })
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const split = kind === 'investment' || kind === 'distribution'
  const lineOf = (id: string) => d.lines.find((l) => l.partnerId === id)?.amount ?? 0
  const setLine = (id: string, amount: number | null) =>
    setD((x) => ({ ...x, lines: [...x.lines.filter((l) => l.partnerId !== id), { partnerId: id, amount: amount ?? 0 }] }))
  const linesSum = d.lines.reduce((a, l) => a + l.amount, 0)
  // Distributions and single-partner withdrawals take their total from the lines.
  const draft: BpTxnDraft = useMemo(() => (kind === 'distribution' || kind === 'withdrawal' ? { ...d, amount: linesSum } : d), [d, kind, linesSum])
  const errors = useMemo(() => validateDraft(draft, partners.map((p) => p.id)), [draft, partners])
  const err = (k: string) => (shown ? errors[k] : undefined)
  const set = (patch: Partial<BpTxnDraft>) => setD((x) => ({ ...x, ...patch }))

  const overPaid = kind === 'distribution' ? figures.partners.filter((f) => lineOf(f.partnerId) > Math.max(0, f.profitPayable)) : []
  const overWithdrawn = kind === 'withdrawal' ? figures.partners.filter((f) => lineOf(f.partnerId) > Math.max(0, f.capital)) : []

  const submit = async (allowDuplicate = false) => {
    setShown(true)
    if (Object.keys(errors).length) { toast(Object.values(errors)[0], 'error'); return }
    setBusy(true)
    try {
      const row = await postTxn(draft, { allowDuplicate })
      toast(`Recorded ${row.txnNo} · ${pkr(row.amount)}`)
      onClose()
    } catch (e) {
      if (e instanceof DuplicateError) {
        const ok = await confirm({ title: 'Possible duplicate entry', body: `${e.existing.txnNo} on ${e.existing.date} has the same type, amount and partners. Record this one as well?`, confirmLabel: 'Record anyway' })
        setBusy(false)
        if (ok) await submit(true)
        return
      }
      toast((e as Error).message, 'error')
    } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={TITLES[kind]} wide footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()}>Save entry</Button>
    </>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        {kind === 'investment' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Entry type" htmlFor="bp-type">
              <Select id="bp-type" value={d.type} onChange={(e) => set({ type: e.target.value as BpTxnType })}>
                <option value="initial_capital">Initial capital</option><option value="investment">Additional investment</option>
              </Select>
            </Field>
            <Field label="Total investment amount" htmlFor="bp-amount" error={err('amount')}>
              <MoneyInput id="bp-amount" value={d.amount || null} onChange={(v) => set({ amount: v ?? 0 })} aria-invalid={!!err('amount')} />
            </Field>
          </div>
        )}
        {kind === 'cash' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="bp-type">
              <Select id="bp-type" value={d.type} onChange={(e) => set({ type: e.target.value as BpTxnType })}>
                <option value="revenue">Business revenue (money in)</option><option value="expense">Business expense (money out)</option>
              </Select>
            </Field>
            <Field label="Amount" htmlFor="bp-amount" error={err('amount')}>
              <MoneyInput id="bp-amount" value={d.amount || null} onChange={(v) => set({ amount: v ?? 0 })} aria-invalid={!!err('amount')} />
            </Field>
          </div>
        )}
        {kind === 'transfer' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Paying partner" htmlFor="bp-from" error={err('fromId')}>
              <Select id="bp-from" value={d.fromId ?? ''} onChange={(e) => set({ fromId: e.target.value || null })}>
                <option value="">Choose…</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Receiving partner" htmlFor="bp-to" error={err('toId')}>
              <Select id="bp-to" value={d.toId ?? ''} onChange={(e) => set({ toId: e.target.value || null })}>
                <option value="">Choose…</option>{partners.filter((p) => p.id !== d.fromId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount" htmlFor="bp-amount" error={err('amount')}>
              <MoneyInput id="bp-amount" value={d.amount || null} onChange={(v) => set({ amount: v ?? 0 })} aria-invalid={!!err('amount')} />
            </Field>
          </div>
        )}
        {kind === 'withdrawal' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Partner" htmlFor="bp-wp" error={err('lines')}>
              <Select id="bp-wp" value={d.lines[0]?.partnerId ?? ''} onChange={(e) => set({ lines: e.target.value ? [{ partnerId: e.target.value, amount: d.lines[0]?.amount ?? 0 }] : [] })}>
                <option value="">Choose…</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount withdrawn" htmlFor="bp-amount" error={err('amount')}>
              <MoneyInput id="bp-amount" value={d.lines[0]?.amount || null} disabled={!d.lines[0]}
                onChange={(v) => d.lines[0] && set({ lines: [{ partnerId: d.lines[0].partnerId, amount: v ?? 0 }] })} />
            </Field>
            {overWithdrawn.length > 0 && <p className="text-sm text-warn sm:col-span-2" role="status">This is more than the partner's current capital balance ({pkr(overWithdrawn[0].capital)}).</p>}
          </div>
        )}

        {split && (
          <fieldset className="rounded-2xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">{kind === 'investment' ? 'Who contributed how much' : 'Profit paid to each partner'}</legend>
            <ul className="divide-y divide-line">
              {partners.map((p) => {
                const f = figures.partners.find((x) => x.partnerId === p.id)!
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <Avatar p={p} size="sm" />
                    <label htmlFor={`bp-line-${p.id}`} className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}
                      {kind === 'distribution' && <span className="block text-xs font-normal text-muted">Unpaid profit {pkr(f.profitPayable)}</span>}
                    </label>
                    <div className="w-36 sm:w-44"><MoneyInput id={`bp-line-${p.id}`} value={lineOf(p.id) || null} onChange={(v) => setLine(p.id, v)} /></div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
              <span>Partners total <b className="tabular-nums">{pkr(linesSum)}</b></span>
              {kind === 'investment' && d.amount > 0 && linesSum !== d.amount && (
                <span className="text-warn">{linesSum < d.amount ? `${pkr(d.amount - linesSum)} still to assign` : `${pkr(linesSum - d.amount)} more than the total`}</span>
              )}
            </div>
            {err('lines') && <p role="alert" className="mt-1 text-sm text-danger">{err('lines')}</p>}
            {overPaid.length > 0 && <p className="mt-1 text-sm text-warn" role="status">More than the unpaid profit for {overPaid.map((f) => partners.find((p) => p.id === f.partnerId)?.name).join(', ')}.</p>}
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" htmlFor="bp-date" error={err('date')}><Input id="bp-date" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Time" htmlFor="bp-time" error={err('time')}><Input id="bp-time" type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} /></Field>
          {(kind !== 'investment') && (
            <Field label={kind === 'cash' ? 'Payment method (optional)' : 'Payment method'} htmlFor="bp-method" error={err('method')}>
              <Select id="bp-method" value={d.method ?? ''} onChange={(e) => set({ method: (e.target.value || null) as PaymentMethod | null })}>
                <option value="">{kind === 'cash' ? 'Not specified' : 'Choose…'}</option>
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
            </Field>
          )}
          {kind !== 'investment' && (
            <Field label="Payment reference (optional)" htmlFor="bp-ref"><Input id="bp-ref" value={d.reference} maxLength={80} autoComplete="off" onChange={(e) => set({ reference: e.target.value })} /></Field>
          )}
          <Field label="Business or project" htmlFor="bp-project" hint="Leave empty for the general business">
            <Input id="bp-project" list="bp-projects" value={d.project} maxLength={60} autoComplete="off" onChange={(e) => set({ project: e.target.value })} />
            <datalist id="bp-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label={kind === 'cash' ? 'Description' : kind === 'transfer' ? 'Description or reason' : 'Description (optional)'} htmlFor="bp-desc" error={err('description')}>
            <Input id="bp-desc" value={d.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
        <AttachmentField ids={d.proofIds} onChange={(proofIds) => set({ proofIds })} accept="image" label="Payment proof image (optional)" tag="partner-proof" />
        <p className="flex gap-2 rounded-xl bg-raised p-2.5 text-xs text-muted"><Info className="h-4 w-4 shrink-0" aria-hidden />{RECORD_NOTE}</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
