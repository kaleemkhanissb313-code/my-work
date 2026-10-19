import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, Download, Wand2, FileText, FileVideo, HardDrive, Image as ImageIcon, Images, Search, Star, Trash2, Upload, X, XCircle } from 'lucide-react'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { baseEntity } from '@/services/repo'
import { downloadBlob } from '@/services/backup'
import { safeWrite } from '@/components/feedback'
import { Badge, Button, EmptyState, Field, IconButton, Input, Modal, PageHeader, Progress, Select, Spinner, TagInput, Textarea } from '@/components/ui'
import { fileSize } from '@/lib/numbers'
import { cn } from '@/lib/cn'
import { FolderPanel, trashedToast, type FolderFilter } from '@/features/docs/shared'
import {
  ACCEPT_ATTR, ALLOWED_LABEL, isTextual, kindOf, makeThumbnail, mediaRepo, readWithProgress, typeLabel, validateFile, type MediaKind,
} from '@/features/media/media'
import type { MediaFile } from '@/types/models'

type SortKey = 'date' | 'name' | 'size'
interface Upload { id: string; name: string; size: number; progress: number; status: 'reading' | 'saving' | 'done' | 'error'; error?: string }

const KIND_ICON = { image: ImageIcon, video: FileVideo, document: FileText } as const

export function MediaPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<MediaKind | ''>('')
  const [folder, setFolder] = useState<FolderFilter>('all')
  const [tag, setTag] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('date')
  const [uploads, setUploads] = useState<Upload[]>([])
  const [dragging, setDragging] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const all = useLiveQuery(() => db.media.toArray(), [])
  const base = useMemo(() => (all ?? []).filter((m) => !m.deletedAt), [all])
  const allTags = useMemo(() => [...new Set(base.flatMap((m) => m.tags))].sort(), [base])

  const refreshEstimate = useCallback(async () => {
    try {
      const e = await navigator.storage?.estimate?.()
      if (e && e.quota) setEstimate({ usage: e.usage ?? 0, quota: e.quota })
    } catch { /* not supported */ }
  }, [])
  useEffect(() => { void refreshEstimate() }, [refreshEstimate, all?.length])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length, none: 0 }
    for (const m of base) { const f = m.folderId ?? 'none'; c[f] = (c[f] ?? 0) + 1 }
    return c
  }, [base])

  const items = useMemo(() => {
    const term = q.toLowerCase().trim()
    return base
      .filter((m) => !kind || kindOf(m.mime) === kind)
      .filter((m) => folder === 'all' || (folder === 'none' ? !m.folderId : m.folderId === folder))
      .filter((m) => !tag || m.tags.includes(tag))
      .filter((m) => !favOnly || m.favorite)
      .filter((m) => !term || `${m.name} ${m.description} ${m.tags.join(' ')}`.toLowerCase().includes(term))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : b.createdAt - a.createdAt))
  }, [base, q, kind, folder, tag, favOnly, sort])

  // Deep link: ?open=<id>
  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !all) return
    if (all.some((m) => m.id === openId && !m.deletedAt)) setPreviewId(openId)
    params.delete('open'); setParams(params, { replace: true })
  }, [openId, all, params, setParams])

  const patchUpload = (id: string, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const handleFiles = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const queued = files.map((f) => ({ f, u: { id: uid(), name: f.name, size: f.size, progress: 0, status: 'reading' as Upload['status'] } }))
    setUploads((u) => [...queued.map((x) => x.u), ...u])
    const folderId = folder !== 'all' && folder !== 'none' ? folder : null
    for (const { f, u } of queued) {
      const v = validateFile(f)
      if ('error' in v) { patchUpload(u.id, { status: 'error', error: v.error }); continue }
      try {
        const blob = await readWithProgress(f, v.mime, (p) => patchUpload(u.id, { progress: Math.round(p * 100) }))
        patchUpload(u.id, { status: 'saving' })
        const thumbnail = kindOf(v.mime) === 'image' ? await makeThumbnail(blob) : null
        const row: MediaFile = { ...baseEntity(), id: uid(), name: f.name.slice(0, 255), mime: v.mime, size: f.size, blob, thumbnail, description: '', folderId }
        await db.media.add(row)
        patchUpload(u.id, { status: 'done', progress: 100 })
      } catch (e) {
        const msg = (e as Error)?.name === 'QuotaExceededError' ? 'Not enough browser storage space.' : (e as Error)?.message || 'Upload failed.'
        patchUpload(u.id, { status: 'error', error: msg })
      }
    }
    if (inputRef.current) inputRef.current.value = ''
    void refreshEstimate()
  }

  const moveFolderItemsOut = async (folderId: string) => {
    const ids = await db.media.filter((m) => m.folderId === folderId).primaryKeys()
    for (const id of ids) await mediaRepo.update(id, { folderId: null })
  }

  const trash = async (m: MediaFile) => {
    const ok = await safeWrite(() => mediaRepo.trash(m.id).then(() => true))
    if (ok) { if (previewId === m.id) setPreviewId(null); trashedToast(() => mediaRepo.restore(m.id)) }
  }

  const preview = previewId ? base.find((m) => m.id === previewId) ?? null : null
  const filtersActive = !!(q || kind || tag || favOnly || folder !== 'all')
  const pending = uploads.some((u) => u.status === 'reading' || u.status === 'saving')

  return (
    <div>
      <PageHeader title="Media" description="Images, videos and documents stored privately in this browser." icon={Images}
        actions={<>
          <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden" aria-hidden tabIndex={-1} onChange={(e) => void handleFiles(e.target.files)} />
          <Button variant="primary" icon={Upload} onClick={() => inputRef.current?.click()}>Upload files</Button>
        </>} />

      <div
        className={cn('mb-4 rounded-2xl border-2 border-dashed p-6 text-center transition', dragging ? 'border-accent bg-accent/10' : 'border-line')}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files) }}>
        <Upload className="mx-auto mb-2 h-6 w-6 text-accent" aria-hidden />
        <p className="text-sm">Drag & drop files here, or{' '}
          <button type="button" className="font-semibold text-accent underline" onClick={() => inputRef.current?.click()}>browse</button>
        </p>
        <p className="mt-1 text-xs text-muted">{ALLOWED_LABEL}. Max 100 MB per file.</p>
        {estimate && (
          <div className="mx-auto mt-3 max-w-xs text-xs text-muted">
            <div className="mb-1 flex items-center justify-center gap-1"><HardDrive className="h-3.5 w-3.5" aria-hidden />
              Browser storage: {fileSize(estimate.usage)} used of ~{fileSize(estimate.quota)} available</div>
            <Progress value={(estimate.usage / estimate.quota) * 100} label="Browser storage used" />
          </div>
        )}
      </div>

      {uploads.length > 0 && (
        <section aria-label="Uploads" className="card mb-4 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Uploads</h2>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setUploads((u) => u.filter((x) => x.status === 'reading' || x.status === 'saving'))}>Clear finished</Button>
          </div>
          <ul className="space-y-2">
            {uploads.map((u) => (
              <li key={u.id} className="text-sm">
                <div className="flex items-center gap-2">
                  {u.status === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden /> : u.status === 'error' ? <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden /> : null}
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  <span className="shrink-0 text-xs text-muted">{fileSize(u.size)}</span>
                  <span className="shrink-0 text-xs text-muted">{u.status === 'reading' ? `${u.progress}%` : u.status === 'saving' ? 'Saving…' : u.status === 'done' ? 'Done' : 'Rejected'}</span>
                  <IconButton icon={X} label={`Dismiss ${u.name}`} className="h-7 w-7" disabled={u.status === 'reading' || u.status === 'saving'}
                    onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))} />
                </div>
                {(u.status === 'reading' || u.status === 'saving') && <Progress value={u.progress} label={`Uploading ${u.name}`} />}
                {u.error && <p className="text-xs text-danger" role="alert">{u.name}: {u.error}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <FolderPanel scope="media" value={folder} onChange={setFolder} counts={counts} onBeforeDelete={moveFolderItemsOut} />
        </aside>
        <section aria-label="Media files" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input type="search" className="pl-9" placeholder="Search media…" aria-label="Search media" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select aria-label="Filter by type" className="w-auto" value={kind} onChange={(e) => setKind(e.target.value as MediaKind | '')}>
              <option value="">All types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="document">Documents</option>
            </Select>
            {allTags.length > 0 && (
              <Select aria-label="Filter by tag" className="w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All tags</option>
                {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
              </Select>
            )}
            <Select aria-label="Sort" className="w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="date">Sort: Newest</option>
              <option value="name">Sort: Name</option>
              <option value="size">Sort: Largest</option>
            </Select>
            <IconButton icon={Star} label="Favorites only" active={favOnly} onClick={() => setFavOnly(!favOnly)} />
          </div>

          {!all ? <Spinner /> : items.length === 0 ? (
            <EmptyState icon={Images} title={filtersActive ? 'Nothing matches these filters' : 'No media yet'}
              action={filtersActive
                ? <Button onClick={() => { setQ(''); setKind(''); setTag(''); setFavOnly(false); setFolder('all') }}>Clear filters</Button>
                : <Button variant="primary" icon={Upload} onClick={() => inputRef.current?.click()}>Upload files</Button>}>
              {filtersActive ? 'Try a different search or clear the filters.' : 'Upload images, videos or documents. Files stay on this device unless you enable sync.'}
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((m) => {
                const k = kindOf(m.mime)
                const Icon = KIND_ICON[k]
                return (
                  <li key={m.id} className="card card-hover flex flex-col overflow-hidden p-0">
                    <button type="button" className="relative block aspect-[4/3] w-full bg-raised" onClick={() => setPreviewId(m.id)} aria-label={`Preview ${m.name}`}>
                      {m.thumbnail
                        ? <img src={m.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                        : <span className="grid h-full w-full place-items-center text-muted"><Icon className="h-10 w-10" aria-hidden /></span>}
                      <span className="absolute left-2 top-2"><Badge className="bg-bg/80">{typeLabel(m.mime, m.name)}</Badge></span>
                      {m.favorite && <Star className="absolute right-2 top-2 h-4 w-4 fill-current text-warn" aria-label="Favorite" />}
                    </button>
                    <div className="flex flex-1 flex-col p-2.5">
                      <p className="truncate text-sm font-medium" title={m.name}>{m.name}</p>
                      <p className="text-xs text-muted">{fileSize(m.size)} · {new Date(m.createdAt).toLocaleDateString()}</p>
                      {m.tags.length > 0 && <p className="truncate text-xs text-accent">{m.tags.map((t) => `#${t}`).join(' ')}</p>}
                      <div className="-mx-1 mt-auto flex pt-1">
                        <IconButton icon={Star} label={m.favorite ? 'Remove from favorites' : 'Add to favorites'} active={m.favorite} className="h-8 w-8"
                          onClick={() => void safeWrite(() => mediaRepo.toggle(m.id, 'favorite'))} />
                        <IconButton icon={Download} label={`Download ${m.name}`} className="h-8 w-8" onClick={() => downloadBlob(m.blob, m.name)} />
                        {kindOf(m.mime) === 'image' && m.mime !== 'image/svg+xml' && <Link to={`/studio?media=${m.id}`} className="btn btn-ghost h-8 w-8 rounded-xl" aria-label={`Edit ${m.name} in Image Studio`} title="Edit in Image Studio"><Wand2 className="h-4 w-4" aria-hidden /></Link>}
                        <IconButton icon={Trash2} label={`Move ${m.name} to trash`} className="ml-auto h-8 w-8" onClick={() => void trash(m)} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <PreviewModal item={preview} onClose={() => setPreviewId(null)} onTrash={(m) => void trash(m)} />
    </div>
  )
}

function PreviewModal({ item, onClose, onTrash }: { item: MediaFile | null; onClose: () => void; onTrash: (m: MediaFile) => void }) {
  const folders = useLiveQuery(() => db.folders.where('scope').equals('media').filter((f) => !f.deletedAt).sortBy('name'), [])
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', tags: [] as string[], folderId: '' })
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const itemId = item?.id

  // Object URL lifecycle: create when a file opens, revoke on close/switch. Keyed by id only, so live updates
  // (e.g. toggling favorite) don't recreate the URL and restart a playing video.
  useEffect(() => {
    setUrl(null); setText(null)
    if (!itemId) return
    let cancelled = false
    let u: string | null = null
    void db.media.get(itemId).then((row) => {
      if (cancelled || !row) return
      u = URL.createObjectURL(row.blob)
      setUrl(u)
      if (isTextual(row.mime)) {
        row.blob.slice(0, 200_000).text()
          .then((t) => { if (!cancelled) setText(t + (row.blob.size > 200_000 ? '\n\n… (preview truncated)' : '')) })
          .catch(() => { if (!cancelled) setText('Could not read this file.') })
      }
    }).catch(() => { if (!cancelled) setText('Could not read this file.') })
    return () => { cancelled = true; if (u) URL.revokeObjectURL(u) }
  }, [itemId])

  useEffect(() => {
    if (item) { setForm({ name: item.name, description: item.description, tags: [...item.tags], folderId: item.folderId ?? '' }); setErr(null) }
    // Only reset the form when a different item opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])

  if (!item) return <Modal open={false} onClose={onClose} title="">{null}</Modal>
  const k = kindOf(item.mime)

  const save = async () => {
    const name = form.name.trim()
    if (!name) { setErr('Name is required.'); return }
    setSaving(true)
    const ok = await safeWrite(() => mediaRepo.update(item.id, { name: name.slice(0, 255), description: form.description, tags: form.tags, folderId: form.folderId || null }).then(() => true), 'Saved')
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal open wide onClose={onClose} title={item.name}
      footer={<>
        <Button variant="ghost" icon={Trash2} onClick={() => onTrash(item)} className="mr-auto">Move to trash</Button>
        <Button icon={Download} onClick={() => downloadBlob(item.blob, item.name)}>Download</Button>
        {item.mime.startsWith('image/') && item.mime !== 'image/svg+xml' && <Link to={`/studio?media=${item.id}`} className="btn btn-soft h-10 px-4 text-sm"><Wand2 className="h-4 w-4" aria-hidden />Edit in Image Studio</Link>}
        <Button variant="primary" loading={saving} onClick={() => void save()}>Save changes</Button>
      </>}>
      <div className="mb-4 overflow-hidden rounded-xl border border-line bg-raised">
        {!url ? <Spinner /> : k === 'image' ? (
          <img src={url} alt={item.description || item.name} className="mx-auto max-h-[60vh] w-auto object-contain" />
        ) : k === 'video' ? (
          <video src={url} controls className="max-h-[60vh] w-full" aria-label={item.name} />
        ) : item.mime === 'application/pdf' ? (
          <iframe src={url} title={`PDF preview: ${item.name}`} className="h-[60vh] w-full bg-white" />
        ) : isTextual(item.mime) ? (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-4 text-xs">{text ?? 'Loading…'}</pre>
        ) : (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted">
            <FileText className="h-10 w-10" aria-hidden />
            <p>No in-browser preview for {typeLabel(item.mime, item.name)} files. Download to open it in another app.</p>
          </div>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">{typeLabel(item.mime, item.name)} · {fileSize(item.size)} · Added {new Date(item.createdAt).toLocaleString()}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="media-name" error={err}>
          <Input id="media-name" value={form.name} maxLength={255} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Folder" htmlFor="media-folder">
          <Select id="media-folder" value={form.folderId} onChange={(e) => setForm({ ...form, folderId: e.target.value })}>
            <option value="">No folder</option>
            {folders?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label="Description" htmlFor="media-desc" className="sm:col-span-2">
          <Textarea id="media-desc" value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Tags" className="sm:col-span-2"><TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} /></Field>
      </div>
      <div className="mt-3">
        <Button size="sm" icon={Star} aria-pressed={item.favorite} className={cn(item.favorite && 'text-warn')}
          onClick={() => void safeWrite(() => mediaRepo.toggle(item.id, 'favorite'))}>{item.favorite ? 'Favorited' : 'Add to favorites'}</Button>
      </div>
    </Modal>
  )
}
