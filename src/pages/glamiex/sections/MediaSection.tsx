import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, FileText, Images, Trash2, Video } from 'lucide-react'
import { Badge, Button, EmptyState, IconButton, Modal, Select } from '@/components/ui'
import { confirm, toast } from '@/components/feedback'
import { db } from '@/lib/db'
import { fileSize } from '@/lib/numbers'
import { downloadBlob } from '@/services/backup'
import { AttachmentField } from '@/features/glamiex/ui'
import type { MediaFile } from '@/types/models'
import { useGx } from '../context'

const KINDS: Record<string, string> = {
  'product-image': 'Product photos', 'product-video': 'Product videos', 'order-evidence': 'Order evidence', 'payment-receipt': 'Payment receipts',
  'ad-report': 'Advertising reports', 'expense-receipt': 'Expense receipts', person: 'People documents', general: 'Other',
}

export default function MediaSection() {
  const { data } = useGx()
  const [kind, setKind] = useState('')
  const [preview, setPreview] = useState<{ url: string; file: MediaFile } | null>(null)
  const [uploaded, setUploaded] = useState<string[]>([])
  const files = useLiveQuery(() => db.media.filter((m) => !m.deletedAt && m.tags.includes('glamiex')).toArray(), [])
  const used = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of data.products) [...p.imageIds, ...p.videoIds].forEach((id) => m.set(id, `Product: ${p.name}`))
    for (const o of data.orders) o.attachmentIds.forEach((id) => m.set(id, `Order ${o.orderNo}`))
    for (const p of data.payments) p.attachmentIds.forEach((id) => m.set(id, `Payment ${p.txnNo}`))
    for (const x of data.expenses) x.attachmentIds.forEach((id) => m.set(id, `Expense: ${x.category}`))
    for (const x of [...data.adIncome, ...data.adSpend]) x.attachmentIds.forEach((id) => m.set(id, `Advertising: ${x.platform}`))
    for (const x of data.people) x.attachmentIds.forEach((id) => m.set(id, `Person: ${x.name}`))
    return m
  }, [data])
  const list = (files ?? []).filter((f) => !kind || f.tags.includes(kind)).sort((a, b) => b.createdAt - a.createdAt)
  const total = list.reduce((a, f) => a + f.size, 0)

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <AttachmentField label="Upload pictures, videos or documents" ids={uploaded} onChange={setUploaded} tag="general" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Kind" className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All files</option>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <span className="ml-auto text-xs text-muted">{list.length} files · {fileSize(total)} · stored privately on this device</span>
      </div>
      {!list.length ? <EmptyState icon={Images} title="No files yet">Photos, videos and receipts you attach to products, sales, payments, ads and expenses appear here.</EmptyState> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {list.map((f) => (
            <li key={f.id} className="card overflow-hidden p-0">
              <button type="button" className="block aspect-square w-full bg-raised" onClick={() => setPreview({ url: URL.createObjectURL(f.blob), file: f })} aria-label={`Preview ${f.name}`}>
                {f.thumbnail ? <img src={f.thumbnail} alt={f.name} className="h-full w-full object-cover" loading="lazy" /> : <span className="grid h-full place-items-center text-muted">{f.mime.startsWith('video/') ? <Video className="h-8 w-8" /> : <FileText className="h-8 w-8" />}</span>}
              </button>
              <div className="p-2">
                <div className="truncate text-xs font-medium" title={f.name}>{f.name}</div>
                <div className="truncate text-[11px] text-muted">{fileSize(f.size)} · {used.get(f.id) ?? 'Not linked'}</div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                  <Badge className="max-w-full truncate">{KINDS[f.tags.find((t) => KINDS[t]) ?? 'general']}</Badge>
                  <div className="flex">
                    <IconButton icon={Download} label={`Download ${f.name}`} onClick={() => downloadBlob(f.blob, f.name)} />
                    <IconButton icon={Trash2} label={`Delete ${f.name}`} onClick={async () => {
                      const link = used.get(f.id)
                      if (!(await confirm({ title: 'Delete file?', danger: true, confirmLabel: 'Move to trash', body: link ? `This file is attached to ${link}. It will disappear from that record (restorable from Trash).` : 'The file moves to Trash.' }))) return
                      await db.media.update(f.id, { deletedAt: Date.now() }); toast('File moved to trash')
                    }} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!preview} onClose={() => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null) }} title={preview?.file.name ?? ''} wide
        footer={preview && <Button icon={Download} onClick={() => downloadBlob(preview.file.blob, preview.file.name)}>Download</Button>}>
        {preview && (preview.file.mime.startsWith('image/') ? <img src={preview.url} alt={preview.file.name} className="mx-auto max-h-[70vh] rounded-xl object-contain" />
          : preview.file.mime.startsWith('video/') ? <video src={preview.url} controls playsInline className="max-h-[70vh] w-full rounded-xl" />
          : preview.file.mime === 'application/pdf' ? <iframe src={preview.url} title={preview.file.name} className="h-[70vh] w-full rounded-xl" />
          : <p className="text-sm text-muted">No preview for this file type. Use Download.</p>)}
      </Modal>
    </div>
  )
}
