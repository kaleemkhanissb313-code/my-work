import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { Link } from 'react-router'
import { Archive, ArchiveRestore, Package, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Modal, Select, TagInput, Textarea } from '@/components/ui'
import { safeWrite, toast } from '@/components/feedback'
import { adjustStock, createProduct, gxAudit, gxProductRepo, normaliseSku, updateProduct } from '@/features/glamiex/service'
import { productPerformance, type ProductPerf } from '@/features/glamiex/engine'
import { pkr } from '@/features/glamiex/money'
import { zoned } from '@/features/glamiex/time'
import { AttachmentField, ConfirmText, DataTable, ExportButtons, Money, MoneyInput, rs, Section, type Col } from '@/features/glamiex/ui'
import type { GxProduct, ProductStatus } from '@/features/glamiex/types'
import { cn } from '@/lib/cn'
import { useGx, live } from '../context'
import { ActionBar, BackLink, FormGrid, Stat } from './shared'

const STATUSES: ProductStatus[] = ['active', 'inactive', 'discontinued']

export default function Products({ id }: { id?: string }) {
  if (id === 'new') return <ProductForm product={null} />
  if (id) return <ProductDetail id={id} />
  return <ProductList />
}

function ProductList() {
  const { data, tz, go } = useGx()
  const [cat, setCat] = useState('')
  const [status, setStatus] = useState<'active' | 'all' | 'low' | 'archived'>('active')
  const perf = useMemo(() => productPerformance(data, null, tz), [data, tz])
  const cats = [...new Set(live(data.products).map((p) => p.category).filter(Boolean))].sort()
  const rows = perf.filter((p) => (!cat || p.product.category === cat) && (
    status === 'all' ? !p.product.archived : status === 'archived' ? p.product.archived : status === 'low' ? !p.product.archived && p.stock <= p.product.lowStockAt : !p.product.archived && p.product.status === 'active'))

  const cols: Col<ProductPerf>[] = [
    { key: 'name', label: 'Product', render: (p) => <ProductName p={p} />, sort: (p) => p.product.name, text: (p) => `${p.product.name} ${p.product.sku} ${p.product.category} ${p.product.tags.join(' ')}` },
    { key: 'cat', label: 'Category', render: (p) => p.product.category || '—', sort: (p) => p.product.category },
    { key: 'buy', label: 'Cost', align: 'right', render: (p) => <Money v={p.product.buyPrice} />, sort: (p) => p.product.buyPrice },
    { key: 'sell', label: 'Price', align: 'right', render: (p) => <Money v={p.product.sellPrice} />, sort: (p) => p.product.sellPrice },
    { key: 'unit', label: 'Unit profit', align: 'right', render: (p) => <Money v={p.product.sellPrice - p.product.buyPrice} tone />, sort: (p) => p.product.sellPrice - p.product.buyPrice },
    { key: 'stock', label: 'Stock', align: 'right', render: (p) => <span className={cn(p.stock <= p.product.lowStockAt && 'font-semibold text-warn', p.stock < 0 && 'text-danger')}>{p.stock}</span>, sort: (p) => p.stock },
    { key: 'units', label: 'Sold', align: 'right', render: (p) => p.units, sort: (p) => p.units },
    { key: 'rev', label: 'Revenue', align: 'right', render: (p) => <Money v={p.revenue} />, sort: (p) => p.revenue },
    { key: 'profit', label: 'Gross profit', align: 'right', render: (p) => <Money v={p.profit} tone />, sort: (p) => p.profit },
    { key: 'margin', label: 'Margin', align: 'right', render: (p) => (p.margin == null ? '—' : `${(p.margin * 100).toFixed(1)}%`), sort: (p) => p.margin ?? -1 },
  ]
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select aria-label="Category" className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">Active</option><option value="low">Low stock</option><option value="all">All (not archived)</option><option value="archived">Archived</option>
        </Select>
        <div className="ms-auto flex flex-wrap gap-2">
          <ExportButtons name="Product performance" period="All time" sheets={() => [{ name: 'Products', rows: [['Product', 'SKU', 'Category', 'Cost (Rs)', 'Price (Rs)', 'Stock', 'Units sold', 'Revenue (Rs)', 'Cost of sales (Rs)', 'Gross profit (Rs)', 'Margin %'], ...rows.map((p) => [p.product.name, p.product.sku, p.product.category, rs(p.product.buyPrice), rs(p.product.sellPrice), p.stock, p.units, rs(p.revenue), rs(p.cost), rs(p.profit), p.margin == null ? '' : +(p.margin * 100).toFixed(2)])] }]} />
          <Button variant="primary" icon={Plus} onClick={() => go('products/new')}>Add product</Button>
        </div>
      </div>
      {!live(data.products).length ? (
        <EmptyState icon={Package} title="No products yet" action={<Button variant="primary" icon={Plus} onClick={() => go('products/new')}>Add product</Button>}>Add products with buying and selling prices; GLAMIEX calculates profit, margin and stock automatically.</EmptyState>
      ) : (
        <DataTable rows={rows} cols={cols} rowKey={(p) => p.product.id} onRowClick={(p) => go(`products/${p.product.id}`)} initialSort={{ key: 'rev', dir: -1 }}
          card={(p) => (
            <div className="flex gap-3">
              <ThumbById id={p.product.imageIds[0]} alt={p.product.name} size="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><div className="truncate font-medium">{p.product.name}</div><Money v={p.product.sellPrice} /></div>
                <div className="text-xs text-muted">{p.product.sku}{p.product.category && ` · ${p.product.category}`}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs"><span className={cn(p.stock <= p.product.lowStockAt && 'font-semibold text-warn')}>Stock {p.stock}</span><span>Sold {p.units}</span><span>Profit <Money v={p.profit} tone /></span></div>
              </div>
            </div>
          )} />
      )}
    </div>
  )
}

function ThumbById({ id, alt, size }: { id?: string; alt: string; size: string }) {
  const m = useLiveQuery(async () => (id ? db.media.get(id) : undefined), [id])
  return <div className={cn('shrink-0 overflow-hidden rounded-xl bg-raised', size)}>{m?.thumbnail ? <img loading="lazy" decoding="async" src={m.thumbnail} alt={alt} className="h-full w-full object-cover" /> : <Package className="m-auto h-full w-1/2 text-muted" aria-hidden />}</div>
}
function ProductName({ p }: { p: ProductPerf }) {
  return <div className="flex items-center gap-2"><ThumbById id={p.product.imageIds[0]} alt={p.product.name} size="h-9 w-9" /><div className="min-w-0"><div className="truncate font-medium">{p.product.name}</div><div className="text-xs text-muted">{p.product.sku}{p.product.status !== 'active' && <Badge className="ms-1">{p.product.status}</Badge>}</div></div></div>
}

function ProductForm({ product, onDone }: { product: GxProduct | null; onDone?: () => void }) {
  const { data, go, settings } = useGx()
  const [f, setF] = useState(() => ({
    name: product?.name ?? '', sku: product?.sku ?? '', category: product?.category ?? '', description: product?.description ?? '',
    buyPrice: product?.buyPrice ?? null as number | null, sellPrice: product?.sellPrice ?? null as number | null, lowStockAt: String(product?.lowStockAt ?? settings.defaultLowStock),
    status: product?.status ?? 'active' as ProductStatus, supplierName: product?.supplierName ?? '', supplierContact: product?.supplierContact ?? '',
    imageIds: product?.imageIds ?? [], videoIds: product?.videoIds ?? [], tags: product?.tags ?? [], dateAdded: product?.dateAdded ?? new Date().toISOString().slice(0, 10), opening: '0',
  }))
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const cats = [...new Set(live(data.products).map((p) => p.category).filter(Boolean))]

  const save = async () => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Name is required.'
    const sku = normaliseSku(f.sku)
    if (!sku) e.sku = 'SKU is required.'
    else if (live(data.products).some((p) => p.sku === sku && p.id !== product?.id)) e.sku = 'This SKU is already used.'
    if (f.buyPrice == null || f.buyPrice < 0) e.buyPrice = 'Enter the buying price.'
    if (f.sellPrice == null || f.sellPrice < 0) e.sellPrice = 'Enter the selling price.'
    if (!/^\d+$/.test(f.lowStockAt)) e.lowStockAt = 'Whole number.'
    if (!product && !/^\d+$/.test(f.opening)) e.opening = 'Whole number ≥ 0.'
    setErr(e)
    if (Object.keys(e).length) return
    setBusy(true)
    const payload: Partial<GxProduct> = { name: f.name.trim(), sku, category: f.category.trim(), description: f.description, buyPrice: f.buyPrice!, sellPrice: f.sellPrice!, lowStockAt: Number(f.lowStockAt), status: f.status, supplierName: f.supplierName, supplierContact: f.supplierContact, imageIds: f.imageIds, videoIds: f.videoIds, tags: f.tags, dateAdded: f.dateAdded }
    const r = product ? await safeWrite(() => updateProduct(product.id, payload), 'Product saved') : await safeWrite(() => createProduct(payload, Number(f.opening)), 'Product added')
    setBusy(false)
    if (r === undefined) return
    if (onDone) onDone(); else go(`products/${product ? product.id : (r as GxProduct).id}`)
  }
  const unit = f.sellPrice != null && f.buyPrice != null ? f.sellPrice - f.buyPrice : null

  return (
    <div>
      {!onDone && <BackLink to="/glamiex/products" label="Products" />}
      <form onSubmit={(e) => { e.preventDefault(); void save() }} noValidate className="space-y-4">
        <Section title="Product details" icon={Package}>
          <FormGrid>
            <Field label="Product name *" error={err.name} htmlFor="p-name" className="lg:col-span-2"><Input id="p-name" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={120} /></Field>
            <Field label="SKU / product ID *" error={err.sku} htmlFor="p-sku" hint="Saved in capitals, must be unique"><Input id="p-sku" value={f.sku} onChange={(e) => set('sku', e.target.value)} autoCapitalize="characters" /></Field>
            <Field label="Category" htmlFor="p-cat"><Input id="p-cat" list="p-cats" value={f.category} onChange={(e) => set('category', e.target.value)} /><datalist id="p-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
            <Field label="Status" htmlFor="p-status"><Select id="p-status" value={f.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Date added" htmlFor="p-date"><Input id="p-date" type="date" value={f.dateAdded} onChange={(e) => set('dateAdded', e.target.value)} /></Field>
            <Field label="Description" htmlFor="p-desc" className="sm:col-span-2 lg:col-span-3"><Textarea id="p-desc" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
          </FormGrid>
        </Section>
        <Section title="Pricing & stock" icon={PackagePlus}>
          <FormGrid>
            <Field label="Buying price (unit cost) *" error={err.buyPrice} htmlFor="p-buy"><MoneyInput id="p-buy" value={f.buyPrice} onChange={(v) => set('buyPrice', v)} aria-invalid={!!err.buyPrice} /></Field>
            <Field label="Selling price *" error={err.sellPrice} htmlFor="p-sell"><MoneyInput id="p-sell" value={f.sellPrice} onChange={(v) => set('sellPrice', v)} aria-invalid={!!err.sellPrice} /></Field>
            <div className="rounded-xl bg-raised/60 p-3 text-sm">Unit gross profit: <b className={cn(unit != null && unit < 0 ? 'text-danger' : 'text-ok')}>{unit == null ? '—' : pkr(unit)}</b>
              {unit != null && f.sellPrice ? <span className="text-muted"> · {((unit / f.sellPrice) * 100).toFixed(1)}% margin</span> : null}</div>
            {!product && <Field label="Opening stock" error={err.opening} htmlFor="p-open" hint="Later changes use stock movements"><Input id="p-open" inputMode="numeric" pattern="[0-9]*" value={f.opening} onChange={(e) => set('opening', e.target.value.replace(/\D/g, ''))} /></Field>}
            <Field label="Low-stock alert at" error={err.lowStockAt} htmlFor="p-low"><Input id="p-low" inputMode="numeric" pattern="[0-9]*" value={f.lowStockAt} onChange={(e) => set('lowStockAt', e.target.value.replace(/\D/g, ''))} /></Field>
          </FormGrid>
          {product && <p className="mt-2 text-xs text-muted">Changing prices affects new sales only — past sales keep their saved price and cost.</p>}
        </Section>
        <Section title="Supplier, tags & media" icon={Package} defaultOpen={!!product}>
          <FormGrid>
            <Field label="Supplier name" htmlFor="p-sup"><Input id="p-sup" value={f.supplierName} onChange={(e) => set('supplierName', e.target.value)} /></Field>
            <Field label="Supplier contact" htmlFor="p-supc"><Input id="p-supc" value={f.supplierContact} onChange={(e) => set('supplierContact', e.target.value)} /></Field>
            <Field label="Tags"><TagInput value={f.tags} onChange={(t) => set('tags', t)} /></Field>
          </FormGrid>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <AttachmentField label="Product images (first = main image)" ids={f.imageIds} onChange={(ids) => set('imageIds', ids)} accept="image" tag="product-image" />
            <AttachmentField label="Product videos" ids={f.videoIds} onChange={(ids) => set('videoIds', ids)} accept="video" tag="product-video" />
          </div>
        </Section>
        <ActionBar>
          <Button onClick={() => (onDone ? onDone() : go(product ? `products/${product.id}` : 'products'))}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>{product ? 'Save changes' : 'Add product'}</Button>
        </ActionBar>
      </form>
    </div>
  )
}

function ProductDetail({ id }: { id: string }) {
  const { data, tz, go } = useGx()
  const [editing, setEditing] = useState(false)
  const [adjust, setAdjust] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const product = data.products.find((p) => p.id === id)
  const perf = useMemo(() => productPerformance(data, null, tz).find((p) => p.product.id === id), [data, tz, id])
  if (!product || !perf) return <div><BackLink to="/glamiex/products" label="Products" /><EmptyState icon={Package} title="Product not found" /></div>
  if (editing) return <div><BackLink to={`/glamiex/products/${id}`} label={product.name} /><ProductForm product={product} onDone={() => setEditing(false)} /></div>

  const moves = data.stock.filter((s) => s.productId === id && !s.deletedAt).sort((a, b) => b.at.localeCompare(a.at))
  const sales = live(data.orders).filter((o) => o.items.some((i) => i.productId === id)).sort((a, b) => b.at.localeCompare(a.at))
  return (
    <div className="space-y-4">
      <BackLink to="/glamiex/products" label="Products" />
      <div className="card flex flex-wrap items-start gap-4 p-4">
        <ThumbById id={product.imageIds[0]} alt={product.name} size="h-24 w-24 sm:h-28 sm:w-28" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">{product.name}</h2>
          <p className="text-sm text-muted">{product.sku}{product.category && ` · ${product.category}`} · added {product.dateAdded}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={product.status === 'active' ? 'ok' : 'muted'}>{product.status}</Badge>{product.archived && <Badge>archived</Badge>}{product.tags.map((t) => <Badge key={t} tone="accent">#{t}</Badge>)}</div>
          {product.description && <p className="mt-2 whitespace-pre-wrap text-sm">{product.description}</p>}
          {product.supplierName && <p className="mt-1 text-xs text-muted">Supplier: {product.supplierName} {product.supplierContact}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
          <Button icon={PackagePlus} onClick={() => setAdjust(true)}>Stock</Button>
          <Button icon={product.archived ? ArchiveRestore : Archive} onClick={async () => { await safeWrite(() => gxProductRepo.toggle(id, 'archived'), product.archived ? 'Restored' : 'Archived'); await gxAudit('product', id, 'update', product.archived ? 'unarchived' : 'archived') }}>{product.archived ? 'Unarchive' : 'Archive'}</Button>
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDel(true)}>Delete</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Buying price"><Money v={product.buyPrice} /></Stat>
        <Stat label="Selling price"><Money v={product.sellPrice} /></Stat>
        <Stat label="Unit gross profit" tone={product.sellPrice - product.buyPrice >= 0 ? 'ok' : 'danger'}><Money v={product.sellPrice - product.buyPrice} /></Stat>
        <Stat label="Current stock" tone={perf.stock <= product.lowStockAt ? 'warn' : undefined}>{perf.stock}</Stat>
        <Stat label="Units sold">{perf.units}</Stat>
        <Stat label="Total revenue"><Money v={perf.revenue} /></Stat>
        <Stat label="Total product cost"><Money v={perf.cost} /></Stat>
        <Stat label="Gross profit / margin" tone={perf.profit >= 0 ? 'ok' : 'danger'}><Money v={perf.profit} /> {perf.margin != null && <span className="text-xs text-muted">({(perf.margin * 100).toFixed(1)}%)</span>}</Stat>
      </div>
      {(product.imageIds.length > 1 || product.videoIds.length > 0) && (
        <Section title="Gallery" icon={Package}>
          <div className="grid gap-4 md:grid-cols-2">
            <AttachmentField label="Images" ids={product.imageIds} onChange={(ids) => void safeWrite(() => updateProduct(id, { imageIds: ids }))} accept="image" tag="product-image" />
            <AttachmentField label="Videos" ids={product.videoIds} onChange={(ids) => void safeWrite(() => updateProduct(id, { videoIds: ids }))} accept="video" tag="product-video" />
          </div>
        </Section>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={`Sales (${sales.length})`} icon={Package}>
          {!sales.length ? <p className="text-sm text-muted">No sales yet.</p> : (
            <ul className="max-h-80 divide-y divide-line/60 overflow-y-auto">{sales.map((o) => {
              const line = o.items.filter((i) => i.productId === id)
              const q = line.reduce((a, i) => a + i.qty, 0)
              return <li key={o.id}><Link to={`/glamiex/sales/${o.id}`} className="flex min-h-[44px] items-center gap-2 py-2 text-sm hover:text-accent">
                <span className="font-mono text-xs text-muted">{o.orderNo}</span><span className="flex-1">{zoned(o.at, tz).date}</span>{o.status !== 'completed' && <Badge tone="danger">{o.status}</Badge>}
                <span>{q} × <Money v={line[0].unitPrice} /></span></Link></li>
            })}</ul>
          )}
        </Section>
        <Section title="Stock movements" icon={PackagePlus}>
          {!moves.length ? <p className="text-sm text-muted">No stock movements yet.</p> : (
            <ul className="max-h-80 divide-y divide-line/60 overflow-y-auto">{moves.map((m) => (
              <li key={m.id} className="flex min-h-[40px] items-center gap-2 py-1.5 text-sm"><span className="w-24 text-xs text-muted">{zoned(m.at, tz).date}</span><Badge>{m.reason}</Badge><span className="min-w-0 flex-1 truncate text-muted">{m.note}</span><b className={cn('tabular-nums', m.qty > 0 ? 'text-ok' : 'text-danger')}>{m.qty > 0 ? '+' : ''}{m.qty}</b></li>
            ))}</ul>
          )}
        </Section>
      </div>
      <StockModal open={adjust} productId={id} onClose={() => setAdjust(false)} />
      <ConfirmText open={confirmDel} danger title="Delete product?" label="Move to trash" onClose={() => setConfirmDel(false)}
        body={sales.length ? <>This product appears in {sales.length} sale(s). Those sales keep their saved name, price and cost; the product moves to Trash and can be restored. Archive it instead if you just want to hide it.</> : 'The product moves to Trash and can be restored.'}
        onConfirm={async () => { await gxProductRepo.trash(id); await gxAudit('product', id, 'delete', product.name); toast('Product moved to trash'); go('products') }} />
    </div>
  )
}

function StockModal({ open, productId, onClose }: { open: boolean; productId: string; onClose: () => void }) {
  const [qty, setQty] = useState('')
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [reason, setReason] = useState<'purchase' | 'adjust'>('purchase')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(qty)
  return (
    <Modal open={open} onClose={onClose} title="Stock movement" footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!n} onClick={async () => {
        setBusy(true)
        const ok = await safeWrite(() => adjustStock(productId, dir === 'in' ? n : -n, reason, note), 'Stock updated')
        setBusy(false)
        if (ok !== undefined) { setQty(''); setNote(''); onClose() }
      }}>Save movement</Button>
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Direction" htmlFor="s-dir"><Select id="s-dir" value={dir} onChange={(e) => setDir(e.target.value as 'in' | 'out')}><option value="in">Add stock (+)</option><option value="out">Remove stock (−)</option></Select></Field>
        <Field label="Quantity" htmlFor="s-qty"><Input id="s-qty" inputMode="numeric" pattern="[0-9]*" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Type" htmlFor="s-type"><Select id="s-type" value={reason} onChange={(e) => setReason(e.target.value as 'purchase' | 'adjust')}><option value="purchase">Purchase / restock</option><option value="adjust">Adjustment (damage, count correction)</option></Select></Field>
        <Field label="Note" htmlFor="s-note"><Input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <p className="mt-2 text-xs text-muted">Sales, cancellations and refunds update stock automatically.</p>
    </Modal>
  )
}
