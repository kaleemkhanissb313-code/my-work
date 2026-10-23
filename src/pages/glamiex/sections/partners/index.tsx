import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Spinner, Tabs } from '@/components/ui'
import { toast } from '@/components/feedback'
import { db } from '@/lib/db'
import { computeFigures, netPosition } from '@/features/glamiex/partners/engine'
import { seedPartners, useBpData } from '@/features/glamiex/partners/service'
import { EntryForm } from './EntryForm'
import { QuickEntry } from './QuickEntry'
import { BpCtx, type BpCtxValue, type FormKind } from './shared'

const Dashboard = lazy(() => import('./Dashboard'))
const Ledger = lazy(() => import('./Ledger'))
const ProfitLoss = lazy(() => import('./ProfitLoss'))
const Account = lazy(() => import('./Account'))
const PartnerSettings = lazy(() => import('./PartnerSettings'))
const PartnerReports = lazy(() => import('./PartnerReports'))

type Tab = 'dashboard' | 'ledger' | 'pl' | 'reports' | 'settings'
const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' }, { id: 'ledger', label: 'Ledger' }, { id: 'pl', label: 'Profit & Loss' },
  { id: 'reports', label: 'Reports' }, { id: 'settings', label: 'Partners & shares' },
]

/** /glamiex/partners/:id — id is a tab, or a partner id for that partner's account page. */
export default function Partners({ id }: { id?: string }) {
  const nav = useNavigate()
  const data = useBpData()
  const [form, setForm] = useState<{ kind: FormKind; preset?: { partnerId?: string } } | null>(null)
  const appProjects = useLiveQuery(() => db.projects.filter((p) => !p.deletedAt).toArray(), [])
  useEffect(() => { void seedPartners().catch((e) => toast((e as Error).message, 'error')) }, [])

  const ctx = useMemo<BpCtxValue | null>(() => {
    if (!data || data.partners.length < 5) return null
    const projects = [...new Set([...data.txns.map((t) => t.project).filter(Boolean), ...(appProjects ?? []).map((p) => p.name)])].sort()
    return {
      ...data, projects, figures: computeFigures(data.partners, data.txns), net: netPosition(data.partners, data.txns), byId: new Map(data.partners.map((p) => [p.id, p])),
      openForm: (kind, preset) => setForm({ kind, preset }),
    }
  }, [data, appProjects])

  if (!ctx) return <Spinner label="Loading partner accounts" />
  const partner = id ? ctx.byId.get(id) : undefined
  const tab: Tab = partner ? 'dashboard' : (TABS.find((t) => t.id === id)?.id ?? 'dashboard')

  return (
    <BpCtx.Provider value={ctx}>
      <div className="space-y-4">
        <Tabs label="Partner sections" tabs={TABS} value={partner ? ('' as Tab) : tab} onChange={(t) => nav(`/glamiex/partners/${t === 'dashboard' ? '' : t}`)} />
        <Suspense fallback={<Spinner />}>
          {partner ? <Account partner={partner} /> : tab === 'ledger' ? <Ledger /> : tab === 'pl' ? <ProfitLoss /> : tab === 'reports' ? <PartnerReports /> : tab === 'settings' ? <PartnerSettings /> : <Dashboard />}
        </Suspense>
      </div>
      {form && (form.kind === 'minus' || form.kind === 'plus') && <QuickEntry sign={form.kind} preset={form.preset} onClose={() => setForm(null)} />}
      {form && form.kind !== 'minus' && form.kind !== 'plus' && <EntryForm kind={form.kind} preset={form.preset} onClose={() => setForm(null)} />}
    </BpCtx.Provider>
  )
}
