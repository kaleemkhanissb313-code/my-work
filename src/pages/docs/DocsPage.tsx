import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive, ArchiveRestore, BookTemplate, Copy, FileText, FileUp, FolderInput, LayoutGrid, List, NotebookPen, Pencil, Plus, Search,
  Sparkles, Star, StickyNote, Trash2,
} from 'lucide-react'
import { db } from '@/lib/db'
import { docsRepo } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { AREA_LABEL, AREA_TONE } from '@/lib/format'
import { markdownToHtml } from '@/lib/markdown'
import { cn } from '@/lib/cn'
import { BUILTIN_TEMPLATES, type BuiltinTemplate } from '@/features/docs/templates'
import { ColorPicker, FolderPanel, TextPromptModal, docPath, trashedToast, type FolderFilter } from '@/features/docs/shared'
import type { Area, Doc } from '@/types/models'

type Kind = 'document' | 'note' | 'template'
type SortKey = 'updated' | 'created' | 'title'
const AREAS: Area[] = ['personal', 'work', 'home', 'life']
const MAX_IMPORT_BYTES = 5 * 1024 * 1024

const META: Record<Kind, { title: string; singular: string; description: string; icon: typeof FileText }> = {
  document: { title: 'Documents', singular: 'document', description: 'Rich-text documents with autosave, export and folders.', icon: FileText },
  note: { title: 'Notes', singular: 'note', description: 'Quick notes — capture now, organise later.', icon: StickyNote },
  template: { title: 'Templates', singular: 'template', description: 'Reusable starting points for new documents and notes.', icon: BookTemplate },
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
const readLS = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

export function DocsPage({ kind }: { kind: Kind }) {
  const meta = META[kind]
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [folder, setFolder] = useState<FolderFilter>('all')
  const [tag, setTag] = useState('')
  const [area, setArea] = useState<Area | ''>('')
  const [favOnly, setFavOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const layoutKey = `b2a-docs-layout-${kind}`
  const [layout, setLayoutState] = useState<'grid' | 'list'>(() => (readLS(layoutKey) === 'list' ? 'list' : 'grid'))
  const setLayout = (l: 'grid' | 'list') => { setLayoutState(l); writeLS(layoutKey, l) }
  const [renaming, setRenaming] = useState<Doc | null>(null)
  const [organizing, setOrganizing] = useState<Doc | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset filters when switching between documents / notes / templates.
  useEffect(() => { setQ(''); setFolder('all'); setTag(''); setArea(''); setFavOnly(false); setShowArchived(false) }, [kind])

  const all = useLiveQuery(() => db.docs.toArray(), [])

  const base = useMemo(() => (all ?? []).filter((d) => !d.deletedAt && (kind === 'template' ? d.isTemplate : d.kind === kind && !d.isTemplate)), [all, kind])
  const textIndex = useMemo(() => new Map(base.map((d) => [d.id, `${d.title} ${d.description} ${d.tags.join(' ')} ${plain(d.content)}`.toLowerCase()])), [base])
  const allTags = useMemo(() => [...new Set(base.flatMap((d) => d.tags))].sort(), [base])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, none: 0 }
    for (const d of base) {
      if (d.archived) continue
      c.all++
      const f = d.folderId ?? 'none'
      c[f] = (c[f] ?? 0) + 1
    }
    return c
  }, [base])

  const items = useMemo(() => {
    const term = q.toLowerCase().trim()
    return base
      .filter((d) => (showArchived ? d.archived : !d.archived))
      .filter((d) => folder === 'all' || (folder === 'none' ? !d.folderId : d.folderId === folder))
      .filter((d) => !tag || d.tags.includes(tag))
      .filter((d) => !area || d.area === area)
      .filter((d) => !favOnly || d.favorite)
      .filter((d) => !term || (textIndex.get(d.id) ?? '').includes(term))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (sort === 'title') return (a.title || '').localeCompare(b.title || '')
        if (sort === 'created') return b.createdAt - a.createdAt
        return b.updatedAt - a.updatedAt
      })
  }, [base, q, folder, tag, area, favOnly, showArchived, sort, textIndex])

  // Deep link: ?open=<id> navigates straight to the editor.
  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !all) return
    const d = all.find((x) => x.id === openId)
    params.delete('open'); setParams(params, { replace: true })
    if (d) navigate(docPath(d))
  }, [openId, all, params, setParams, navigate])

  const folderForNew = folder !== 'all' && folder !== 'none' ? folder : null

  const createNew = async () => {
    const d = await safeWrite(() => docsRepo.create({
      kind: kind === 'note' ? 'note' : 'document', title: kind === 'template' ? 'Untitled template' : 'Untitled',
      isTemplate: kind === 'template', folderId: folderForNew, area: area || 'personal',
    }))
    if (d) navigate(docPath(d))
  }

  const applyTemplate = async (t: Pick<BuiltinTemplate, 'title' | 'content' | 'kind' | 'description'> & { tags?: string[]; area?: Area }) => {
    const d = await safeWrite(() => docsRepo.create({
      kind: t.kind, title: t.title, content: t.content, description: t.description, tags: [...(t.tags ?? [])], area: t.area ?? 'personal', isTemplate: false,
    }), `Created from “${t.title}”`)
    if (d) navigate(docPath(d))
  }

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    let created: Doc | undefined
    let count = 0
    for (const f of Array.from(files)) {
      if (!/\.(md|markdown|txt)$/i.test(f.name)) { toast(`${f.name}: only .md, .markdown or .txt files can be imported`, 'error'); continue }
      if (f.size > MAX_IMPORT_BYTES) { toast(`${f.name}: file is larger than 5 MB`, 'error'); continue }
      let text: string
      try { text = await f.text() } catch { toast(`${f.name}: could not read the file`, 'error'); continue }
      const heading = text.match(/^\s*#\s+(.+)$/m)?.[1]?.trim()
      const title = (heading || f.name.replace(/\.[^.]+$/, '')).slice(0, 200)
      const d = await safeWrite(() => docsRepo.create({
        kind: kind === 'note' ? 'note' : 'document', title, content: markdownToHtml(text), isTemplate: kind === 'template', folderId: folderForNew,
      }), undefined, `Could not import ${f.name}`)
      if (d) { created = d; count++ }
    }
    if (fileRef.current) fileRef.current.value = ''
    if (count === 1 && created) { toast(`Imported “${created.title}”`); navigate(docPath(created)) }
    else if (count > 1) toast(`Imported ${count} files`)
  }

  const moveFolderItemsOut = async (folderId: string) => {
    const ids = await db.docs.filter((d) => d.folderId === folderId).primaryKeys()
    for (const id of ids) await docsRepo.update(id, { folderId: null })
  }

  const filtersActive = !!(q || tag || area || favOnly || showArchived || folder !== 'all')
  const Icon = meta.icon

  return (
    <div>
      <PageHeader title={meta.title} description={meta.description} icon={Icon}
        actions={<>
          <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple className="hidden" aria-hidden tabIndex={-1}
            onChange={(e) => void importFiles(e.target.files)} />
          <Button icon={FileUp} onClick={() => fileRef.current?.click()} title="Import Markdown or text files">Import Markdown</Button>
          <Button variant="primary" icon={Plus} onClick={() => void createNew()}>New {meta.singular}</Button>
        </>} />

      {kind === 'template' && (
        <section aria-labelledby="builtin-heading" className="mb-8">
          <h2 id="builtin-heading" className="mb-3 text-sm font-semibold text-muted">Built-in starter templates</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BUILTIN_TEMPLATES.map((t) => (
              <li key={t.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{t.title}</h3>
                  <Badge tone="accent">Built-in</Badge>
                </div>
                <p className="mt-1 flex-1 text-sm text-muted">{t.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge>{t.kind === 'note' ? 'Note' : 'Document'}</Badge>
                  <Button size="sm" variant="primary" icon={Sparkles} className="ms-auto" onClick={() => void applyTemplate(t)}>Use template</Button>
                </div>
              </li>
            ))}
          </ul>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">Your templates</h2>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <FolderPanel scope="documents" value={folder} onChange={setFolder} counts={counts} onBeforeDelete={moveFolderItemsOut} />
        </aside>

        <section aria-label={`${meta.title} list`} className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input type="search" className="ps-9" placeholder={`Search ${meta.title.toLowerCase()}…`} aria-label={`Search ${meta.title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select aria-label="Sort" className="w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="updated">Sort: Last edited</option>
              <option value="created">Sort: Created</option>
              <option value="title">Sort: Title</option>
            </Select>
            <Select aria-label="Filter by area" className="w-auto" value={area} onChange={(e) => setArea(e.target.value as Area | '')}>
              <option value="">All areas</option>
              {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
            </Select>
            {allTags.length > 0 && (
              <Select aria-label="Filter by tag" className="w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All tags</option>
                {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
              </Select>
            )}
            <IconButton icon={Star} label="Favorites only" active={favOnly} onClick={() => setFavOnly(!favOnly)} />
            <IconButton icon={Archive} label={showArchived ? 'Showing archived' : 'Show archived'} active={showArchived} onClick={() => setShowArchived(!showArchived)} />
            <div className="flex rounded-xl border border-line" role="group" aria-label="Layout">
              <IconButton icon={LayoutGrid} label="Card layout" active={layout === 'grid'} onClick={() => setLayout('grid')} />
              <IconButton icon={List} label="List layout" active={layout === 'list'} onClick={() => setLayout('list')} />
            </div>
          </div>

          {!all ? <Spinner /> : items.length === 0 ? (
            <EmptyState icon={kind === 'note' ? NotebookPen : Icon}
              title={filtersActive ? 'Nothing matches these filters' : kind === 'template' ? 'No templates of your own yet' : `No ${meta.title.toLowerCase()} yet`}
              action={filtersActive
                ? <Button onClick={() => { setQ(''); setTag(''); setArea(''); setFavOnly(false); setShowArchived(false); setFolder('all') }}>Clear filters</Button>
                : <Button variant="primary" icon={Plus} onClick={() => void createNew()}>New {meta.singular}</Button>}>
              {filtersActive ? 'Try a different search or clear the filters.'
                : kind === 'template' ? 'Open any document and choose “Save as template”, or create one here.'
                : `Create a ${meta.singular} or import a Markdown file.`}
            </EmptyState>
          ) : (
            <ul className={cn(layout === 'list' ? 'space-y-2' : kind === 'note' ? 'grid gap-3 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3')}>
              {items.map((d) => (
                <DocItem key={d.id} d={d} layout={layout} dense={kind === 'note'} isTemplatePage={kind === 'template'}
                  onRename={() => setRenaming(d)} onOrganize={() => setOrganizing(d)}
                  onUse={() => void applyTemplate({ title: d.title, content: d.content, kind: d.kind, description: d.description, tags: d.tags, area: d.area })} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <TextPromptModal open={!!renaming} title="Rename" label="Title" initial={renaming?.title ?? ''} submitLabel="Rename"
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          if (!renaming) return
          const ok = await safeWrite(() => docsRepo.update(renaming.id, { title }).then(() => true), 'Renamed')
          if (ok) setRenaming(null)
        }} />
      <OrganizeModal doc={organizing} onClose={() => setOrganizing(null)} />
    </div>
  )
}

function DocItem({ d, layout, dense, isTemplatePage, onRename, onOrganize, onUse }: {
  d: Doc; layout: 'grid' | 'list'; dense: boolean; isTemplatePage: boolean
  onRename: () => void; onOrganize: () => void; onUse: () => void
}) {
  const snippet = useMemo(() => plain(d.content).slice(0, dense ? 140 : 200), [d.content, dense])
  const updated = new Date(d.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  const actions = (
    <div className="flex flex-wrap items-center">
      {isTemplatePage && <Button size="sm" variant="primary" icon={Sparkles} onClick={onUse} className="me-1">Use template</Button>}
      <IconButton icon={Star} label={d.favorite ? 'Remove from favorites' : 'Add to favorites'} active={d.favorite} onClick={() => void safeWrite(() => docsRepo.toggle(d.id, 'favorite'))} />
      <IconButton icon={Pencil} label="Rename" onClick={onRename} />
      <IconButton icon={FolderInput} label="Move to folder / color label" onClick={onOrganize} />
      <IconButton icon={Copy} label="Duplicate" onClick={() => void safeWrite(() => docsRepo.duplicate(d.id, (x) => ({ title: `${x.title} (copy)` })), 'Duplicated')} />
      {!isTemplatePage && (
        <IconButton icon={BookTemplate} label="Save as template" onClick={() => void safeWrite(() => docsRepo.duplicate(d.id, (x) => ({ title: x.title, isTemplate: true, archived: false })), 'Saved as template — find it under Templates')} />
      )}
      <IconButton icon={d.archived ? ArchiveRestore : Archive} label={d.archived ? 'Unarchive' : 'Archive'}
        onClick={() => void safeWrite(() => docsRepo.toggle(d.id, 'archived'), d.archived ? 'Restored from archive' : 'Archived')} />
      <IconButton icon={Trash2} label="Move to trash" onClick={async () => {
        const ok = await safeWrite(() => docsRepo.trash(d.id).then(() => true))
        if (ok) trashedToast(() => docsRepo.restore(d.id))
      }} />
    </div>
  )

  const meta = (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <Badge tone={AREA_TONE[d.area]}>{AREA_LABEL[d.area]}</Badge>
      {d.archived && <Badge tone="warn">Archived</Badge>}
      <span>Edited {updated}</span>
      {d.tags.slice(0, 4).map((t) => <span key={t} className="text-accent">#{t}</span>)}
    </div>
  )

  const title = (
    <Link to={docPath(d)} className="flex min-w-0 items-center gap-2 font-semibold hover:text-accent focus-visible:text-accent">
      {d.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />}
      {d.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-warn" aria-label="Favorite" />}
      <span className="truncate">{d.title || 'Untitled'}</span>
    </Link>
  )

  if (layout === 'list') {
    return (
      <li className="card flex flex-wrap items-center gap-3 p-3" style={d.color ? { borderLeft: `4px solid ${d.color}` } : undefined}>
        <div className="min-w-0 flex-1">
          {title}
          {d.description && <p className="truncate text-sm text-muted">{d.description}</p>}
          <div className="mt-1">{meta}</div>
        </div>
        {actions}
      </li>
    )
  }
  return (
    <li className={cn('card card-hover flex flex-col', dense ? 'p-3' : 'p-4')} style={d.color ? { borderTop: `4px solid ${d.color}` } : undefined}>
      {title}
      {d.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{d.description}</p>}
      <p className={cn('mt-2 flex-1 break-words text-sm text-muted/90', dense ? 'line-clamp-4' : 'line-clamp-3')}>{snippet || <em>Empty</em>}</p>
      <div className="mt-3">{meta}</div>
      <div className="-mx-1 mt-2 border-t border-line/60 pt-2">{actions}</div>
    </li>
  )
}

function OrganizeModal({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const folders = useLiveQuery(() => db.folders.where('scope').equals('documents').filter((f) => !f.deletedAt).sortBy('name'), [])
  const [folderId, setFolderId] = useState<string>('')
  const [color, setColor] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (doc) { setFolderId(doc.folderId ?? ''); setColor(doc.color) } }, [doc])
  const save = async () => {
    if (!doc) return
    setBusy(true)
    const ok = await safeWrite(() => docsRepo.update(doc.id, { folderId: folderId || null, color }).then(() => true), 'Updated')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal open={!!doc} onClose={onClose} title={`Organize “${doc?.title || 'Untitled'}”`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Folder" htmlFor="org-folder">
          <Select id="org-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">No folder</option>
            {folders?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <div>
          <span className="label">Color label</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
    </Modal>
  )
}
