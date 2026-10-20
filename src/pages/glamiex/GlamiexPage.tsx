import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router'
import {
  ArrowLeftRight, BarChart3, CalendarDays, CalendarRange, Calendar as CalendarIcon, ChevronsLeft, ChevronsRight, FileBarChart, Gem, Handshake, ImageDown, Images, LayoutDashboard,
  LayoutGrid, Megaphone, Bike, HandCoins, Truck, Undo2, ClipboardList, Package, Receipt, Scale, Settings2, Sheet, ShoppingCart, TrendingUp, Users, Wallet, X,
} from 'lucide-react'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'
import { updateGxSettings, useGxData, useGxSettings } from '@/features/glamiex/service'
import { GxCtx } from './context'
import { SYSTEM_SHEETS } from '@/features/sheets/systemSheets'

export const GX_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'sales', label: 'Sales & Orders', icon: ShoppingCart },
  { id: 'people', label: 'Customers & People', icon: Users },
  { id: 'payments', label: 'Deposits & Payments', icon: Wallet },
  { id: 'names', label: 'Names & Payments', icon: HandCoins },
  { id: 'partners', label: 'Business Partners', icon: Handshake },
  { id: 'payment-image', label: '5 Payments', icon: ImageDown },
  { id: 'returns', label: 'Returns and Refunds', icon: Undo2 },
  { id: 'deliveries', label: 'Deliveries and Shipments', icon: Truck },
  { id: 'riders', label: 'Delivery Partners & Riders', icon: Bike },
  { id: 'logistics-reports', label: 'Return & Delivery Reports', icon: ClipboardList },
  { id: 'ad-income', label: 'Advertising Revenue', icon: TrendingUp },
  { id: 'ad-spend', label: 'Advertising Expenses', icon: Megaphone },
  { id: 'expenses', label: 'Business Expenses', icon: Receipt },
  { id: 'pnl', label: 'Profit & Loss', icon: Scale },
  { id: 'analytics', label: 'Sales Analytics', icon: BarChart3 },
  { id: 'weekly', label: 'Weekly Reports', icon: CalendarDays },
  { id: 'monthly', label: 'Monthly Reports', icon: CalendarRange },
  { id: 'yearly', label: 'Yearly Reports', icon: CalendarIcon },
  { id: 'media', label: 'Pictures & Videos', icon: Images },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'sheets', label: 'Overall Sheets', icon: Sheet },
  { id: 'reports', label: 'Reports & Exports', icon: FileBarChart },
  { id: 'settings', label: 'GLAMIEX Settings', icon: Settings2 },
] as const
export type GxSectionId = (typeof GX_SECTIONS)[number]['id']
const SHEET_NAV = [{ id: 'all', label: 'All Sheets' }, ...SYSTEM_SHEETS.map((s) => ({ id: s.key, label: s.title })), { id: 'custom', label: 'Custom Sheet' }, { id: 'archived', label: 'Archived Sheets' }]

const Overview = lazy(() => import('./sections/Overview'))
const Products = lazy(() => import('./sections/Products'))
const Sales = lazy(() => import('./sections/Sales'))
const People = lazy(() => import('./sections/People'))
const Payments = lazy(() => import('./sections/Payments'))
const AdIncome = lazy(() => import('./sections/AdIncome'))
const AdSpend = lazy(() => import('./sections/AdSpend'))
const Expenses = lazy(() => import('./sections/Expenses'))
const Pnl = lazy(() => import('./sections/Pnl'))
const Analytics = lazy(() => import('./sections/Analytics'))
const PeriodReport = lazy(() => import('./sections/PeriodReport'))
const MediaSection = lazy(() => import('./sections/MediaSection'))
const Transactions = lazy(() => import('./sections/Transactions'))
const Reports = lazy(() => import('./sections/Reports'))
const SettingsSection = lazy(() => import('./sections/SettingsSection'))
const Sheets = lazy(() => import('./sections/Sheets'))
const NamesPayments = lazy(() => import('./sections/NamesPayments'))
const Returns = lazy(() => import('./sections/Returns'))
const Deliveries = lazy(() => import('./sections/Deliveries'))
const Riders = lazy(() => import('./sections/Riders'))
const LogisticsReports = lazy(() => import('./sections/LogisticsReports'))
const PaymentImageCreator = lazy(() => import('./sections/payrecords'))
const Partners = lazy(() => import('./sections/partners'))

const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) }

export function GlamiexPage() {
  const { section = 'overview', id } = useParams()
  const nav = useNavigate()
  const data = useGxData()
  const settings = useGxSettings()
  const [sheet, setSheet] = useState(false)
  const collapsed = settings.sidebar === 'collapsed'
  const current = GX_SECTIONS.find((s) => s.id === section) ?? GX_SECTIONS[0]
  const ctx = useMemo(() => (data ? { data, settings, tz: settings.timeZone, go: (p: string) => nav(`/glamiex/${p}`) } : null), [data, settings, nav])

  // Module shortcuts (Shift + key, never while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      const map: Record<string, string> = { S: 'sales/new', P: 'products/new', E: 'expenses/new', D: 'payments/new', O: 'overview' }
      const to = map[e.key.toUpperCase()]
      if (to) { e.preventDefault(); nav(`/glamiex/${to}`) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  useEffect(() => { document.title = `${current.label} · GLAMIEX` ; return () => { document.title = 'workMYwork — Basic to Advanced' } }, [current.label])

  const content = () => {
    switch (current.id) {
      case 'overview': return <Overview />
      case 'products': return <Products id={id} />
      case 'sales': return <Sales id={id} />
      case 'people': return <People id={id} />
      case 'payments': return <Payments id={id} />
      case 'ad-income': return <AdIncome id={id} />
      case 'ad-spend': return <AdSpend id={id} />
      case 'expenses': return <Expenses id={id} />
      case 'pnl': return <Pnl />
      case 'analytics': return <Analytics />
      case 'weekly': return <PeriodReport unit="week" />
      case 'monthly': return <PeriodReport unit="month" />
      case 'yearly': return <PeriodReport unit="year" />
      case 'media': return <MediaSection />
      case 'transactions': return <Transactions />
      case 'reports': return <Reports />
      case 'settings': return <SettingsSection />
      case 'sheets': return <Sheets id={id} />
      case 'names': return <NamesPayments />
      case 'returns': return <Returns id={id} />
      case 'deliveries': return <Deliveries id={id} />
      case 'riders': return <Riders id={id} />
      case 'logistics-reports': return <LogisticsReports />
      case 'payment-image': return <PaymentImageCreator id={id} />
      case 'partners': return <Partners id={id} />
    }
  }

  return (
    <div className="gx -mx-2 -mt-2 p-2 sm:-mx-3 sm:p-3" data-preset={settings.preset} data-accent={settings.gxAccent} data-density={settings.density}>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white btn-3d"><Gem className="h-5 w-5" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">GLAMIEX</div>
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{current.label}</h1>
        </div>
        <button type="button" className="btn btn-soft h-10 px-3 text-sm lg:hidden" onClick={() => setSheet(true)} aria-haspopup="dialog"><LayoutGrid className="h-4 w-4" aria-hidden />Sections</button>
        <span className="hidden text-xs text-muted xl:block">Shortcuts: <span className="kbd">Shift S</span> sale · <span className="kbd">Shift P</span> product · <span className="kbd">Shift D</span> payment · <span className="kbd">Shift E</span> expense</span>
      </div>

      {/* Mobile / tablet: horizontally swipeable section bar */}
      <nav aria-label="GLAMIEX sections" className="-mx-2 mb-3 flex gap-1.5 overflow-x-auto px-2 pb-1 lg:hidden" style={{ scrollbarWidth: 'none' }}>
        {GX_SECTIONS.map((s) => (
          <NavLink key={s.id} to={s.id === 'sheets' ? '/glamiex/sheets/all' : `/glamiex/${s.id}`} className={() => cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium', section === s.id ? 'border-accent bg-accent text-onaccent' : 'border-line text-muted')}>
            <s.icon className="h-3.5 w-3.5" aria-hidden />{s.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex gap-4">
        {/* Desktop: collapsible module sidebar */}
        <aside className={cn('sticky top-16 hidden h-[calc(100vh-5rem)] shrink-0 overflow-y-auto transition-[width] duration-300 lg:block', collapsed ? 'w-[60px]' : 'w-56')} aria-label="GLAMIEX navigation">
          <nav className="card flex flex-col gap-0.5 p-2">
            {GX_SECTIONS.map((s) => (
              <div key={s.id}>
                <NavLink to={s.id === 'sheets' ? '/glamiex/sheets/all' : `/glamiex/${s.id}`} title={collapsed ? s.label : undefined} aria-label={collapsed ? s.label : undefined}
                  className={() => cn('nav-item py-1.5', collapsed && 'justify-center px-0', section === s.id && 'active')}>
                  <s.icon className="h-4 w-4 shrink-0" aria-hidden />{!collapsed && <span className="truncate">{s.label}</span>}
                </NavLink>
                {s.id === 'sheets' && section === 'sheets' && !collapsed && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2">
                    {SHEET_NAV.map((x) => (
                      <NavLink key={x.id} to={`/glamiex/sheets/${x.id}`} className={() => cn('nav-item py-1 text-xs', (id ?? 'all') === x.id && 'active')}>{x.label}</NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button type="button" className={cn('nav-item mt-1 border-t border-line/60 pt-2', collapsed && 'justify-center px-0')} onClick={() => void updateGxSettings({ sidebar: collapsed ? 'expanded' : 'collapsed' })}
              aria-label={collapsed ? 'Expand GLAMIEX sidebar' : 'Collapse GLAMIEX sidebar'}>
              {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <><ChevronsLeft className="h-4 w-4" aria-hidden />Collapse</>}
            </button>
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {!ctx ? <Spinner label="Loading GLAMIEX" /> : (
            <GxCtx.Provider value={ctx}>
              <Suspense fallback={<Spinner />}>{content()}</Suspense>
            </GxCtx.Provider>
          )}
        </div>
      </div>

      {/* Mobile "all sections" sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:hidden" role="dialog" aria-modal="true" aria-label="GLAMIEX sections" onClick={() => setSheet(false)}>
          <div className="glass max-h-[80vh] w-full overflow-y-auto rounded-t-3xl p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">GLAMIEX sections</h2>
              <button className="btn btn-ghost h-11 w-11" aria-label="Close" onClick={() => setSheet(false)}><X className="h-5 w-5" /></button></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GX_SECTIONS.map((s) => (
                <NavLink key={s.id} to={s.id === 'sheets' ? '/glamiex/sheets/all' : `/glamiex/${s.id}`} onClick={() => setSheet(false)} className={({ isActive }) => cn('flex min-h-[56px] items-center gap-2 rounded-2xl border p-3 text-sm', isActive ? 'border-accent bg-raised font-semibold' : 'border-line')}>
                  <s.icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />{s.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
