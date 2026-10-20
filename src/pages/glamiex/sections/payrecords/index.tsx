import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Layers, Users } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { seedPartners, useBpData } from '@/features/glamiex/partners/service'
import { PR_PARTNER_ORDER, type PayRecord } from '@/features/glamiex/payRecords/model'
import { useRecords } from '@/features/glamiex/payRecords/service'
import { useGx } from '../../context'
import { nowLocal } from '../shared'
import { Avatar } from '../partners/shared'
import { Editor } from './Editor'
import { History } from './History'

const GroupSummary = lazy(() => import('../PaymentImage'))

/** /glamiex/payment-image/:id — id is a partner id, "all" or "group". */
export default function PaymentImageCreator({ id }: { id?: string }) {
  const { tz } = useGx()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const bp = useBpData()
  const records = useRecords()
  const [editing, setEditing] = useState<PayRecord | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  useEffect(() => { void seedPartners().catch((e) => toast((e as Error).message, 'error')) }, [])

  const partners = useMemo(() => {
    const all = bp?.partners ?? []
    return PR_PARTNER_ORDER.map((pid) => all.find((p) => p.id === pid)).filter((p): p is NonNullable<typeof p> => !!p)
  }, [bp])
  const view = id === 'all' || id === 'group' ? id : partners.find((p) => p.id === id)?.id ?? PR_PARTNER_ORDER[0]
  const partner = partners.find((p) => p.id === view)

  // ?edit=<recordId> opens that record in its partner's workspace.
  const editId = params.get('edit')
  useEffect(() => {
    if (!editId || !records) return
    const r = records.find((x) => x.id === editId)
    if (r) { setEditing(r); setEditorKey((k) => k + 1) }
    setParams((p) => { p.delete('edit'); return p }, { replace: true })
  }, [editId, records, setParams])

  const go = async (to: string) => {
    if (document.querySelector('[aria-label="Payment details"] .text-warn') && !(await confirm({ title: 'Leave without saving?', body: 'Unsaved changes in this payment record will be lost.', confirmLabel: 'Leave', danger: true }))) return
    setEditing(null); setEditorKey((k) => k + 1)
    nav(`/glamiex/payment-image/${to}`)
  }
  const edit = (r: PayRecord) => {
    if (r.partnerId !== view) { nav(`/glamiex/payment-image/${r.partnerId}?edit=${r.id}`); return }
    setEditing(r); setEditorKey((k) => k + 1); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!bp || partners.length < 5 || !records) return <Spinner label="Loading Payment Image Creator" />
  const n = nowLocal(tz)
  const tab = (key: string, label: React.ReactNode, active: boolean, count?: number) => (
    <button key={key} type="button" role="tab" aria-selected={active} onClick={() => void go(key)}
      className={cn('flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium', active ? 'border-accent bg-raised' : 'border-line text-muted hover:text-fg')}>
      {label}{count != null && <span className="rounded-full bg-raised px-1.5 text-xs tabular-nums text-muted">{count}</span>}
    </button>
  )
  const count = (pid: string) => records.filter((r) => r.partnerId === pid).length

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Create an individual payment image for each partner. Records are saved and kept separate per partner.</p>
      <div role="tablist" aria-label="Partner workspaces" className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1" style={{ scrollbarWidth: 'none' }}>
        {partners.map((p) => tab(p.id, <><Avatar p={p} size="sm" />{p.name}</>, view === p.id, count(p.id)))}
        {tab('all', <><Users className="h-4 w-4" aria-hidden />All partners</>, view === 'all', records.length)}
        {tab('group', <><Layers className="h-4 w-4" aria-hidden />Group summary</>, view === 'group')}
      </div>

      {view === 'group' ? (
        <Suspense fallback={<Spinner />}><GroupSummary /></Suspense>
      ) : view === 'all' ? (
        <section aria-labelledby="pr-all"><h2 id="pr-all" className="mb-2 font-semibold">All partners' payment records</h2><History rows={records} showPartner onEdit={edit} /></section>
      ) : partner && (
        <>
          <Editor key={`${partner.id}-${editorKey}`} partner={partner} record={editing?.partnerId === partner.id ? editing : null} today={n.date} now={n.time}
            onSaved={(r) => setEditing(r)} onCleared={() => setEditing(null)} />
          <section aria-labelledby="pr-hist">
            <h2 id="pr-hist" className="mb-2 font-semibold">{partner.name}'s payment history</h2>
            <History rows={records.filter((r) => r.partnerId === partner.id)} onEdit={edit} />
          </section>
        </>
      )}
    </div>
  )
}
