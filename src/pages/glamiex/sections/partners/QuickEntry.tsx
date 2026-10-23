import { useMemo, useState } from 'react'
import { Info, Minus, Plus } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { AttachmentField, MoneyInput } from '@/features/glamiex/ui'
import { PAYMENT_METHODS, type PaymentMethod } from '@/features/glamiex/types'
import { validateDraft } from '@/features/glamiex/partners/engine'
import { blankDraft, DuplicateError, postTxn } from '@/features/glamiex/partners/service'
import type { BpTxnDraft } from '@/features/glamiex/partners/types'
import { useGx } from '../../context'
import { nowLocal } from '../shared'
import { RECORD_NOTE, signed, signTone, useBp } from './shared'

type Kind = 'investment' | 'expense' | 'income'
const BUSINESS = '__business'

/**
 * One simple form for the overall balance: choose − (investment or expense) or + (income / order payment),
 * the partner, and the amount. Saved as a normal ledger entry, so every report and the books stay consistent.
 */
export function QuickEntry({ sign, preset, onClose }: { sign: 'minus' | 'plus'; preset?: { partnerId?: string }; onClose: () => void }) {
  const { tz } = useGx()
  const { partners, figures, net, projects } = useBp()
  const now = nowLocal(tz)
  const [kind, setKind] = useState<Kind>(sign === 'plus' ? 'income' : 'investment')
  const [who, setWho] = useState<string>(preset?.partnerId ?? (sign === 'plus' ? BUSINESS : ''))
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(now.date)
  const [time, setTime] = useState(now.time)
  const [description, setDescription] = useState('')
  const [project, setProject] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [proofIds, setProofIds] = useState<string[]>([])
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const minus = kind !== 'income'
  const partnerId = who && who !== BUSINESS ? who : null

  const draft = useMemo<BpTxnDraft>(() => {
    const a = amount ?? 0
    const type = kind === 'income' ? 'revenue' : kind === 'expense' ? 'expense' : (figures.contributed ? 'investment' : 'initial_capital')
    return {
      ...blankDraft(type, date, time), amount: a, project: project.trim(), proofIds, method: method || null,
      description: description.trim() || (kind === 'income' ? 'Order payment' : kind === 'expense' ? '' : 'Investment'),
      lines: kind === 'investment' && partnerId ? [{ partnerId, amount: a }] : [],
      fromId: kind === 'expense' ? partnerId : null,
      toId: kind === 'income' ? partnerId : null,
    }
  }, [amount, kind, partnerId, date, time, description, project, method, proofIds, figures.contributed])

  const errors = useMemo(() => {
    const e = validateDraft(draft, partners.map((p) => p.id))
    if (kind === 'investment' && !partnerId) e.who = 'Choose the partner who invested'
    if (!who) e.who = 'Choose a partner'
    if (e.lines && kind === 'investment') { e.who = e.who ?? e.lines; delete e.lines }
    return e
  }, [draft, partners, kind, partnerId, who])
  const err = (k: string) => (shown ? errors[k] : undefined)
  const effect = (minus ? -1 : 1) * (amount ?? 0)
  const partnerNet = partnerId ? net.partners.find((p) => p.partnerId === partnerId)?.balance ?? 0 : null

  const submit = async (allowDuplicate = false) => {
    setShown(true)
    if (Object.keys(errors).length) { toast(Object.values(errors)[0], 'error'); return }
    setBusy(true)
    try {
      const row = await postTxn(draft, { allowDuplicate })
      toast(`Recorded ${row.txnNo} · ${signed(effect)} · overall balance now ${signed(net.balance + effect)}`)
      onClose()
    } catch (e) {
      if (e instanceof DuplicateError) {
        setBusy(false)
        const ok = await confirm({ title: 'Possible duplicate entry', body: `${e.existing.txnNo} on ${e.existing.date} has the same type, amount and partner. Record this one as well?`, confirmLabel: 'Record anyway' })
        if (ok) await submit(true)
        return
      }
      toast((e as Error).message, 'error')
    } finally { setBusy(false) }
  }

  const choice = (k: Kind, label: string, hint: string) => (
    <button type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); if (k === 'investment' && who === BUSINESS) setWho('') }}
      className={cn('flex min-h-[64px] flex-1 flex-col items-start rounded-2xl border p-3 text-start transition',
        kind === k ? (k === 'income' ? 'border-ok bg-ok/10' : 'border-danger bg-danger/10') : 'border-line hover:bg-raised')}>
      <span className={cn('flex items-center gap-1.5 text-sm font-semibold', k === 'income' ? 'text-ok' : 'text-danger')}>
        {k === 'income' ? <Plus className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}{label}
      </span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  )

  return (
    <Modal open onClose={onClose} title={minus ? 'Money out (−)' : 'Money in (+)'} wide footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => void submit()}>Save {signed(effect)}</Button>
    </>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div role="radiogroup" aria-label="Transaction type" className="flex flex-col gap-2 sm:flex-row">
          {choice('investment', 'Investment', 'Partner puts money into the business')}
          {choice('expense', 'Expense', 'Money spent for the business')}
          {choice('income', 'Income / order payment', 'Money received from an order or sale')}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kind === 'investment' ? 'Partner who invested' : kind === 'expense' ? 'Paid by' : 'Received by'} htmlFor="qe-who" error={err('who')}>
            <Select id="qe-who" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose…</option>
              {kind !== 'investment' && <option value={BUSINESS}>Business account (no partner)</option>}
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Amount (PKR)" htmlFor="qe-amount" error={err('amount')} hint="Type the amount without a sign — it is applied automatically.">
            <MoneyInput id="qe-amount" value={amount} onChange={setAmount} aria-invalid={!!err('amount')} />
          </Field>
        </div>

        {/* Live preview of the automatic calculation */}
        <div className="grid gap-2 rounded-2xl border border-line bg-raised/50 p-3 text-sm sm:grid-cols-3" aria-live="polite">
          <div><div className="text-xs text-muted">This entry</div><div className={cn('text-lg font-bold tabular-nums', signTone(effect))}>{signed(effect)}</div></div>
          <div><div className="text-xs text-muted">Overall balance</div><div className="tabular-nums"><span className={signTone(net.balance)}>{signed(net.balance)}</span> → <b className={signTone(net.balance + effect)}>{signed(net.balance + effect)}</b></div></div>
          {partnerNet != null && <div><div className="text-xs text-muted">{partners.find((p) => p.id === partnerId)?.name}</div><div className="tabular-nums"><span className={signTone(partnerNet)}>{signed(partnerNet)}</span> → <b className={signTone(partnerNet + effect)}>{signed(partnerNet + effect)}</b></div></div>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" htmlFor="qe-date" error={err('date')}><Input id="qe-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Time" htmlFor="qe-time" error={err('time')}><Input id="qe-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label={kind === 'expense' ? 'What was it for?' : 'Description (optional)'} htmlFor="qe-desc" error={err('description')}>
            <Input id="qe-desc" value={description} maxLength={200} placeholder={kind === 'income' ? 'Order payment' : kind === 'expense' ? 'e.g. packaging, delivery, ads' : 'Investment'} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Payment method (optional)" htmlFor="qe-method">
            <Select id="qe-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
              <option value="">Not specified</option>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Business or project (optional)" htmlFor="qe-project">
            <Input id="qe-project" list="qe-projects" value={project} maxLength={60} autoComplete="off" onChange={(e) => setProject(e.target.value)} />
            <datalist id="qe-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
        </div>
        <AttachmentField ids={proofIds} onChange={setProofIds} accept="image" label="Proof image (optional)" tag="partner-proof" />
        <p className="flex gap-2 rounded-xl bg-raised p-2.5 text-xs text-muted"><Info className="h-4 w-4 shrink-0" aria-hidden />
          {kind === 'expense' ? 'Only record an expense here if it was not already paid out of money you recorded as an investment — otherwise it would be counted twice. ' : ''}{RECORD_NOTE}</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
