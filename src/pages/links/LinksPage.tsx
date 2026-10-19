import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive, ArchiveRestore, Copy, Download, ExternalLink, FileUp, Layers, Link2, List, Pencil, Plus, Search, Star, Trash2,
} from 'lucide-react'
import { db } from '@/lib/db'
import { bookmarksRepo } from '@/services/repo'
import { downloadText } from '@/services/backup'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Checkbox, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, TagInput, Textarea } from '@/components/ui'
import { AREA_LABEL, AREA_TONE, isValidUrl, normaliseUrl } from '@/lib/format'
import { objectsToCSV, parseCSV } from '@/lib/csv'
import type { Area, Bookmark } from '@/types/models'

type SortKey = 'updated' | 'created' | 'title' | 'domain'
const AREAS: Area[] = ['personal', 'work', 'home', 'life']
const MAX_IMPORT = 5000

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }
const hueOf = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360 }

function LetterAvatar({ url }: { url: string }) {
  const host = hostOf(url)
  return (
    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold uppercase text-white shadow-inner"
      style={{ backgroundColor: `hsl(${hueOf(host || url)} 55% 45%)` }}>
      {(host || '?').charAt(0)}
    </span>
  )
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

interface Parsed { url: string; title: string; category: string; tags: string[] }

function parseBookmarksHtml(html: string): Parsed[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: Parsed[] = []
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const url = normaliseUrl(a.getAttribute('href') ?? '')
    if (!url || !/^https?:/i.test(a.getAttribute('href') ?? '')) continue
    // Netscape format: <DT><H3>Folder</H3><DL><p><DT><A …>. The folder name is the H3 just before the enclosing DL.
    const dl = a.closest('dl')
    let folder = ''
    let prev = dl?.previousElementSibling
    while (prev && prev.tagName !== 'H3' && prev.tagName !== 'DT') prev = prev.previousElementSibling
    if (prev?.tagName === 'H3') folder = prev.textContent?.trim() ?? ''
    else folder = dl?.parentElement?.querySelector(':scope > h3')?.textContent?.trim() ?? ''
    const tags = (a.getAttribute('tags') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20)
    out.push({ url, title: (a.textContent ?? '').trim().slice(0, 300), category: folder.slice(0, 80), tags })
  }
  return out
}

function parseBookmarksCsv(text: string): Parsed[] {
  const rows = parseCSV(text)
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const hasHeader = head.includes('url')
  const col = (name: string, fallback: number) => (hasHeader ? head.indexOf(name) : fallback)
  const iu = col('url', 0), it = col('title', 1), ic = col('category', 2), itags = hasHeader ? head.indexOf('tags') : -1
  const out: Parsed[] = []
  for (const r of hasHeader ? rows.slice(1) : rows) {
    const raw = (r[iu] ?? '').trim()
    if (!/^https?:\/\//i.test(raw)) continue
    const url = normaliseUrl(raw)
    if (!url) continue
    const tags = itags >= 0 ? (r[itags] ?? '').split(/[;,]/).map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 20) : []
    out.push({ url, title: (it >= 0 ? r[it] ?? '' : '').trim().slice(0, 300), category: (ic >= 0 ? r[ic] ?? '' : '').trim().slice(0, 80), tags })
  }
  return out
}

export function LinksPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('')
  const [area, setArea] = useState<Area | ''>('')
  const [favOnly, setFavOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<SortKey>('updated')
  const [grouped, setGrouped] = useState(false)
  const [editing, setEditing] = useState<Bookmark | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const all = useLiveQuery(() => db.bookmarks.toArray(), [])
  const base = useMemo(() => (all ?? []).filter((b) => !b.deletedAt), [all])
  const categories = useMemo(() => [...new Set(base.map((b) => b.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [base])
  const allTags = useMemo(() => [...new Set(base.flatMap((b) => b.tags))].sort(), [base])

  const items = useMemo(() => {
    const term = q.toLowerCase().trim()
    return base
      .filter((b) => (showArchived ? b.archived : !b.archived))
      .filter((b) => !category || b.category === category)
      .filter((b) => !tag || b.tags.includes(tag))
      .filter((b) => !area || b.area === area)
      .filter((b) => !favOnly || b.favorite)
      .filter((b) => !term || [b.title, b.url, b.description, b.notes, b.category, ...b.tags].join(' ').toLowerCase().includes(term))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        switch (sort) {
          case 'title': return (a.title || a.url).localeCompare(b.title || b.url)
          case 'domain': return hostOf(a.url).localeCompare(hostOf(b.url))
          case 'created': return b.createdAt - a.createdAt
          default: return b.updatedAt - a.updatedAt
        }
      })
  }, [base, q, category, tag, area, favOnly, showArchived, sort])

  const groups = useMemo(() => {
    const m = new Map<string, Bookmark[]>()
    for (const b of items) { const k = b.category || 'Uncategorized'; m.set(k, [...(m.get(k) ?? []), b]) }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  // Deep link: ?open=<id>
  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !all) return
    const b = all.find((x) => x.id === openId && !x.deletedAt)
    if (b) setEditing(b)
    params.delete('open'); setParams(params, { replace: true })
  }, [openId, all, params, setParams])

  const exportCsv = () => {
    const csv = objectsToCSV(items, [
      { key: 'url', label: 'url' }, { key: 'title', label: 'title' }, { key: 'category', label: 'category' },
      { key: 'description', label: 'description' }, { key: 'notes', label: 'notes' }, { key: (b) => b.tags.join(';'), label: 'tags' },
      { key: 'area', label: 'area' }, { key: (b) => (b.favorite ? 'yes' : ''), label: 'favorite' }, { key: (b) => new Date(b.createdAt).toISOString(), label: 'created' },
    ])
    downloadText(csv, `bookmarks-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')
  }

  const importFile = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!f) return
    if (f.size > 20 * 1024 * 1024) { toast('File is larger than 20 MB', 'error'); return }
    setImporting(true)
    try {
      const text = await f.text()
      const isCsv = /\.csv$/i.test(f.name) || f.type === 'text/csv'
      let parsed: Parsed[]
      try { parsed = isCsv ? parseBookmarksCsv(text) : parseBookmarksHtml(text) } catch (e) { toast(`Could not parse ${f.name}: ${(e as Error).message}`, 'error'); return }
      if (!parsed.length) { toast('No http(s) links found in this file', 'warn'); return }
      const existing = new Set(base.map((b) => b.url))
      const seen = new Set<string>()
      const fresh = parsed.filter((p) => { if (existing.has(p.url) || seen.has(p.url)) return false; seen.add(p.url); return true }).slice(0, MAX_IMPORT)
      const skipped = parsed.length - fresh.length
      const ok = await safeWrite(() => db.transaction('rw', db.bookmarks, async () => {
        for (const p of fresh) await bookmarksRepo.create({ url: p.url, title: p.title || hostOf(p.url), category: p.category || 'Imported', tags: p.tags, area: 'personal' })
        return true
      }), undefined, 'Import failed')
      if (ok) toast(`Imported ${fresh.length} bookmark(s)${skipped ? `, skipped ${skipped} duplicate(s)` : ''}`)
    } catch {
      toast(`Could not read ${f.name}`, 'error')
    } finally { setImporting(false) }
  }

  const filtersActive = !!(q || category || tag || area || favOnly || showArchived)

  const row = (b: Bookmark) => {
    const safe = isValidUrl(b.url)
    return (
      <li key={b.id} className="card flex flex-wrap items-center gap-3 p-3">
        <LetterAvatar url={b.url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {safe
              ? <a href={b.url} target="_blank" rel="noopener noreferrer" className="truncate font-medium hover:text-accent hover:underline">{b.title || hostOf(b.url)}</a>
              : <span className="truncate font-medium">{b.title || b.url}</span>}
            {b.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-warn" aria-label="Favorite" />}
          </div>
          <p className="truncate text-xs text-muted">{b.url}</p>
          {b.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{b.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {b.category && !grouped && <Badge>{b.category}</Badge>}
            <Badge tone={AREA_TONE[b.area]}>{AREA_LABEL[b.area]}</Badge>
            {b.archived && <Badge tone="warn">Archived</Badge>}
            {b.tags.map((t) => <span key={t} className="text-accent">#{t}</span>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center">
          {safe && (
            <a href={b.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${b.title || b.url} in a new tab`} title="Open in new tab"
              className="btn btn-ghost h-9 w-9 rounded-xl"><ExternalLink className="h-4 w-4" aria-hidden /></a>
          )}
          <IconButton icon={Copy} label="Copy URL" onClick={async () => {
            const ok = await copyText(b.url)
            toast(ok ? 'URL copied' : 'Could not copy — select the URL and copy it manually', ok ? 'success' : 'error')
          }} />
          <IconButton icon={Star} label={b.favorite ? 'Remove from favorites' : 'Add to favorites'} active={b.favorite} onClick={() => void safeWrite(() => bookmarksRepo.toggle(b.id, 'favorite'))} />
          <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(b)} />
          <IconButton icon={b.archived ? ArchiveRestore : Archive} label={b.archived ? 'Unarchive' : 'Archive'}
            onClick={() => void safeWrite(() => bookmarksRepo.toggle(b.id, 'archived'), b.archived ? 'Restored from archive' : 'Archived')} />
          <IconButton icon={Trash2} label="Move to trash" onClick={async () => {
            const ok = await safeWrite(() => bookmarksRepo.trash(b.id).then(() => true))
            if (ok) toast('Moved to trash', 'success', { label: 'Undo', run: () => void safeWrite(() => bookmarksRepo.restore(b.id), 'Restored') })
          }} />
        </div>
      </li>
    )
  }

  return (
    <div>
      <PageHeader title="Links" description="Bookmarks saved on this device. Page previews are not fetched, for privacy." icon={Link2}
        actions={<>
          <input ref={fileRef} type="file" accept=".html,.htm,.csv,text/html,text/csv" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => void importFile(e.target.files?.[0])} />
          <Button icon={FileUp} loading={importing} onClick={() => fileRef.current?.click()} title="Import a browser bookmarks HTML export or a CSV (url,title,category)">Import</Button>
          <Button icon={Download} onClick={exportCsv} disabled={!items.length}>Export CSV</Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add link</Button>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" className="pl-9" placeholder="Search links…" aria-label="Search links" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Filter by category" className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        {allTags.length > 0 && (
          <Select aria-label="Filter by tag" className="w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </Select>
        )}
        <Select aria-label="Filter by area" className="w-auto" value={area} onChange={(e) => setArea(e.target.value as Area | '')}>
          <option value="">All areas</option>
          {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
        </Select>
        <Select aria-label="Sort" className="w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="updated">Sort: Last edited</option>
          <option value="created">Sort: Added</option>
          <option value="title">Sort: Title</option>
          <option value="domain">Sort: Domain</option>
        </Select>
        <IconButton icon={Star} label="Favorites only" active={favOnly} onClick={() => setFavOnly(!favOnly)} />
        <IconButton icon={Archive} label={showArchived ? 'Showing archived' : 'Show archived'} active={showArchived} onClick={() => setShowArchived(!showArchived)} />
        <div className="flex rounded-xl border border-line" role="group" aria-label="View">
          <IconButton icon={List} label="List view" active={!grouped} onClick={() => setGrouped(false)} />
          <IconButton icon={Layers} label="Group by category" active={grouped} onClick={() => setGrouped(true)} />
        </div>
      </div>

      {!all ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={Link2} title={filtersActive ? 'Nothing matches these filters' : 'No links yet'}
          action={filtersActive
            ? <Button onClick={() => { setQ(''); setCategory(''); setTag(''); setArea(''); setFavOnly(false); setShowArchived(false) }}>Clear filters</Button>
            : <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add link</Button>}>
          {filtersActive ? 'Try a different search or clear the filters.' : 'Save a link, or import bookmarks exported from your browser (HTML) or a CSV file.'}
        </EmptyState>
      ) : grouped ? (
        <div className="space-y-6">
          {groups.map(([name, list]) => (
            <section key={name} aria-label={name}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">{name}<Badge>{list.length}</Badge></h2>
              <ul className="space-y-2">{list.map(row)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">{items.map(row)}</ul>
      )}

      <BookmarkEditor key={editing === 'new' ? 'new' : editing?.id ?? 'none'} open={!!editing} item={editing === 'new' ? null : editing}
        categories={categories} defaultCategory={category} onClose={() => setEditing(null)} />
    </div>
  )
}

function BookmarkEditor({ open, item, categories, defaultCategory, onClose }: {
  open: boolean; item: Bookmark | null; categories: string[]; defaultCategory: string; onClose: () => void
}) {
  const [form, setForm] = useState(() => ({
    url: item?.url ?? '', title: item?.title ?? '', description: item?.description ?? '', category: item?.category ?? (defaultCategory || 'General'),
    notes: item?.notes ?? '', tags: item?.tags ?? [], area: item?.area ?? ('personal' as Area), favorite: item?.favorite ?? false,
  }))
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    const url = normaliseUrl(form.url)
    if (!url) { setErr('Enter a valid http:// or https:// URL.'); return }
    setErr(null)
    setSaving(true)
    const data = {
      url, title: form.title.trim() || hostOf(url), description: form.description.trim(), category: form.category.trim() || 'General',
      notes: form.notes, tags: form.tags, area: form.area, favorite: form.favorite,
    }
    const ok = item
      ? await safeWrite(() => bookmarksRepo.update(item.id, data).then(() => true), 'Link saved')
      : await safeWrite(() => bookmarksRepo.create(data).then(() => true), 'Link added')
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit link' : 'Add link'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>{item ? 'Save' : 'Add link'}</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label="URL" htmlFor="bm-url" error={err} className="sm:col-span-2" hint="Only http(s) links. Page titles and previews are not fetched (privacy) — the title defaults to the site name.">
          <Input id="bm-url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://example.com" inputMode="url" required aria-invalid={!!err} />
        </Field>
        <Field label="Title" htmlFor="bm-title" className="sm:col-span-2">
          <Input id="bm-title" value={form.title} maxLength={300} onChange={(e) => set('title', e.target.value)} placeholder={hostOf(normaliseUrl(form.url) ?? '') || 'Defaults to the hostname'} />
        </Field>
        <Field label="Category" htmlFor="bm-cat">
          <Input id="bm-cat" list="bm-categories" value={form.category} maxLength={80} onChange={(e) => set('category', e.target.value)} />
          <datalist id="bm-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Area" htmlFor="bm-area">
          <Select id="bm-area" value={form.area} onChange={(e) => set('area', e.target.value as Area)}>
            {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </Select>
        </Field>
        <Field label="Description" htmlFor="bm-desc" className="sm:col-span-2">
          <Input id="bm-desc" value={form.description} maxLength={500} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="bm-notes" className="sm:col-span-2">
          <Textarea id="bm-notes" value={form.notes} maxLength={5000} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <Field label="Tags" className="sm:col-span-2"><TagInput value={form.tags} onChange={(t) => set('tags', t)} /></Field>
        <Checkbox label="Favorite" checked={form.favorite} onChange={(v) => set('favorite', v)} className="sm:col-span-2" />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
