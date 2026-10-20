import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
  AlertTriangle, ArrowLeft, Bold, BookTemplate, Check, ClipboardCopy, Code, Copy, Download, FileQuestion, FileText, Heading1, Heading2, Heading3,
  Italic, Link2, List, ListOrdered, Loader2, Minus, Pilcrow, Printer, Quote, Redo2, RotateCcw, Save, SquareCode, Star, Strikethrough, Tags,
  Trash2, Undo2, Wand2,
} from 'lucide-react'
import { db } from '@/lib/db'
import { docsRepo } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Card, CardTitle, EmptyState, Field, IconButton, Input, Modal, Select, Spinner, TagInput } from '@/components/ui'
import { AREA_LABEL, normaliseUrl } from '@/lib/format'
import { htmlToMarkdown, htmlToText, printHtml, standaloneHtml } from '@/lib/markdown'
import { textStats } from '@/lib/text'
import { downloadText } from '@/services/backup'
import { AI_TASKS, AiUnavailableError, parseList, runAi, type AiTask } from '@/services/ai'
import { trackRecent } from '@/services/recents'
import { ColorPicker, docPath } from '@/features/docs/shared'
import { cn } from '@/lib/cn'
import type { Area, Doc } from '@/types/models'
import { escapeHtml } from '@/lib/html'

const AUTOSAVE_MS = 800
const AREAS: Area[] = ['personal', 'work', 'home', 'life']
const draftKey = (id: string) => `b2a-draft-${id}`
const DOC_AI_TASKS: AiTask[] = ['summarize', 'improve', 'organize', 'tags']

interface Draft { title: string; description: string; content: string; at: number }
const readDraft = (id: string): Draft | null => {
  try {
    const raw = localStorage.getItem(draftKey(id))
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    return typeof d?.content === 'string' && typeof d.at === 'number' ? d : null
  } catch { return null }
}
const writeDraft = (id: string, d: Draft) => { try { localStorage.setItem(draftKey(id), JSON.stringify(d)) } catch { /* quota / private mode */ } }
const clearDraft = (id: string) => { try { localStorage.removeItem(draftKey(id)) } catch { /* ignore */ } }

const isSafeHref = (href: string | null | undefined) => !!href && /^(https?:\/\/|mailto:)/i.test(href.trim())
const fileBase = (title: string) => (title.trim() || 'document').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)
const fmtTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Link mark that only accepts http(s)/mailto hrefs, including when parsing stored or pasted HTML. */
const SafeLink = Link.extend({
  parseHTML() {
    return [{ tag: 'a[href]', getAttrs: (el) => (isSafeHref((el as HTMLElement).getAttribute('href')) ? null : false) }]
  },
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: 'https',
  validate: (href) => isSafeHref(href),
  HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
})

export function DocEditor() {
  const { id = '' } = useParams()
  // Key by id so switching documents fully flushes and resets editor state.
  return <DocEditorInner key={id} id={id} />
}

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function DocEditorInner({ id }: { id: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const doc = useLiveQuery(async () => (await db.docs.get(id)) ?? null, [id])
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deletedAt && !p.archived).toArray(), [])
  const folders = useLiveQuery(() => db.folders.where('scope').equals('documents').filter((f) => !f.deletedAt).sortBy('name'), [])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState('')
  const [draftOffer, setDraftOffer] = useState<Draft | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [showMeta, setShowMeta] = useState(true)

  // Latest unsaved values live in refs so timers / unmount flush see them without re-binding.
  const latest = useRef({ title: '', description: '', content: '' })
  const seq = useRef(0)
  const savedSeq = useRef(0)
  const saving = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const loaded = useRef(false)

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    if (!loaded.current || seq.current === savedSeq.current) return
    if (saving.current) { timer.current = setTimeout(() => void save(), AUTOSAVE_MS); return }
    saving.current = true
    const mySeq = seq.current
    const snapshot = { ...latest.current, title: latest.current.title.trim() || 'Untitled' }
    setStatus('saving')
    try {
      await docsRepo.update(id, snapshot)
      savedSeq.current = mySeq
      setSavedAt(Date.now())
      setSaveError('')
      if (seq.current === mySeq) { clearDraft(id); setStatus('saved') }
      else { setStatus('dirty'); timer.current = setTimeout(() => void save(), AUTOSAVE_MS) }
    } catch (e) {
      console.error(e)
      setSaveError((e as Error).message || 'Unknown error')
      setStatus('error')
    } finally {
      saving.current = false
    }
  }, [id])

  const markChanged = useCallback(() => {
    seq.current++
    setStatus('dirty')
    writeDraft(id, { ...latest.current, at: Date.now() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }, [id, save])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
      SafeLink,
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: '',
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'prose-editor', 'aria-label': 'Document content', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: ed }) => {
      if (!loaded.current) return
      latest.current.content = ed.getHTML()
      markChanged()
    },
  })

  // Initialise local state from the stored doc exactly once.
  useEffect(() => {
    if (!doc || !editor || loaded.current) return
    latest.current = { title: doc.title, description: doc.description, content: doc.content }
    setTitle(doc.title)
    setDescription(doc.description)
    editor.commands.setContent(doc.content || '', { emitUpdate: false })
    loaded.current = true
    setSavedAt(doc.updatedAt)
    const draft = readDraft(id)
    if (draft && draft.at > doc.updatedAt && (draft.content !== doc.content || draft.title !== doc.title || draft.description !== doc.description)) setDraftOffer(draft)
    else if (draft) clearDraft(id)
    void trackRecent('doc', id, doc.title || 'Untitled', docPath(doc))
  }, [doc, editor, id])

  // Flush pending edits when leaving the page (draft stays in localStorage if this fails).
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (loaded.current && seq.current !== savedSeq.current) {
      docsRepo.update(id, { ...latest.current, title: latest.current.title.trim() || 'Untitled' }).then(() => clearDraft(id)).catch(console.error)
    }
  }, [id])

  const unsaved = status === 'dirty' || status === 'saving' || status === 'error'
  useEffect(() => {
    if (!unsaved) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [unsaved])

  // In-app navigation is only blocked when saving has failed (pending edits are flushed on unmount otherwise).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => status === 'error' && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (seq.current === savedSeq.current) toast('Already saved', 'info')
        else void save()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [save])

  const onTitle = (v: string) => { setTitle(v); latest.current.title = v; markChanged() }
  const onDescription = (v: string) => { setDescription(v); latest.current.description = v; markChanged() }

  const restoreDraft = () => {
    if (!draftOffer || !editor) return
    setTitle(draftOffer.title); setDescription(draftOffer.description)
    latest.current = { title: draftOffer.title, description: draftOffer.description, content: draftOffer.content }
    editor.commands.setContent(draftOffer.content, { emitUpdate: false })
    setDraftOffer(null)
    markChanged()
    toast('Draft restored — saving…', 'info')
  }
  const discardDraft = () => { clearDraft(id); setDraftOffer(null) }

  const plainText = editor ? editor.getText({ blockSeparator: '\n\n' }) : ''
  const stats = useMemo(() => textStats(plainText), [plainText])

  const listPath = doc?.isTemplate ? '/templates' : pathname.startsWith('/notes') ? '/notes' : '/documents'
  const listLabel = doc?.isTemplate ? 'Templates' : pathname.startsWith('/notes') ? 'Notes' : 'Documents'

  if (doc === undefined) return <Spinner label="Opening document" />
  if (doc === null) {
    return (
      <EmptyState icon={FileQuestion} title="Document not found"
        action={<RouterLink className="btn btn-3d h-10 px-4 text-sm" to={listPath}><ArrowLeft className="h-4 w-4" aria-hidden />Back to {listLabel}</RouterLink>}>
        It may have been permanently deleted, or the link is wrong.
      </EmptyState>
    )
  }
  if (doc.deletedAt) {
    return (
      <EmptyState icon={Trash2} title="This document is in the Trash"
        action={<div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={RotateCcw} onClick={() => void safeWrite(() => docsRepo.restore(doc.id), 'Restored')}>Restore</Button>
          <RouterLink className="btn btn-soft h-10 px-4 text-sm" to={listPath}>Back to {listLabel}</RouterLink>
        </div>}>
        Restore it to keep editing.
      </EmptyState>
    )
  }

  const flushThen = async <T,>(fn: () => Promise<T>) => { await save(); return fn() }
  const currentHtml = () => editor?.getHTML() ?? latest.current.content
  const exportTitle = title.trim() || 'Untitled'

  const doDuplicate = async () => {
    const d = await safeWrite(() => flushThen(() => docsRepo.duplicate(doc.id, (x) => ({ title: `${x.title} (copy)` }))), 'Duplicated')
    if (d) navigate(docPath(d))
  }
  const doTemplate = () => void safeWrite(() => flushThen(() => docsRepo.duplicate(doc.id, (x) => ({ title: x.title, isTemplate: true, archived: false }))), 'Saved as template — find it under Templates')
  const doTrash = async () => {
    const ok = await safeWrite(() => flushThen(() => docsRepo.trash(doc.id).then(() => true)))
    if (!ok) return
    toast('Moved to trash', 'success', { label: 'Undo', run: () => void safeWrite(() => docsRepo.restore(doc.id), 'Restored') })
    navigate(listPath)
  }
  const meta = (patch: Partial<Doc>) => void safeWrite(() => docsRepo.update(doc.id, patch))

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RouterLink to={listPath} className="btn btn-ghost h-9 px-3 text-sm"><ArrowLeft className="h-4 w-4" aria-hidden />{listLabel}</RouterLink>
        {doc.isTemplate && <Badge tone="accent">Template</Badge>}
        <Badge>{doc.kind === 'note' ? 'Note' : 'Document'}</Badge>
        <SaveIndicator status={status} savedAt={savedAt} error={saveError} onRetry={() => void save()} />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button size="sm" icon={Save} onClick={() => void save()} disabled={status === 'saving'} title="Save now (Ctrl/Cmd+S)">Save</Button>
          <ExportMenu onMarkdown={() => downloadText(htmlToMarkdown(currentHtml()), `${fileBase(exportTitle)}.md`, 'text/markdown;charset=utf-8')}
            onText={() => downloadText(htmlToText(currentHtml()), `${fileBase(exportTitle)}.txt`)}
            onPrint={() => printHtml(exportTitle, currentHtml())}
            onWord={() => downloadText(standaloneHtml(exportTitle, currentHtml()), `${fileBase(exportTitle)}.doc`, 'application/msword')} />
          <IconButton icon={Copy} label="Duplicate" onClick={() => void doDuplicate()} />
          {!doc.isTemplate && <IconButton icon={BookTemplate} label="Save as template" onClick={doTemplate} />}
          <IconButton icon={Trash2} label="Move to trash" onClick={() => void doTrash()} />
          <IconButton icon={Tags} label={showMeta ? 'Hide details panel' : 'Show details panel'} active={showMeta} onClick={() => setShowMeta(!showMeta)} />
        </div>
      </div>

      {draftOffer && (
        <div role="alert" className="card mb-4 flex flex-wrap items-center gap-3 border-warn/50 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-hidden />
          <span className="flex-1">An unsaved draft from {new Date(draftOffer.at).toLocaleString()} was found on this device. It is newer than the saved version.</span>
          <Button size="sm" variant="primary" onClick={restoreDraft}>Restore unsaved draft</Button>
          <Button size="sm" variant="ghost" onClick={discardDraft}>Discard</Button>
        </div>
      )}

      <div className={cn('grid gap-4', showMeta && 'lg:grid-cols-[1fr_300px]')}>
        <div className="min-w-0 space-y-3">
          <Input aria-label="Title" value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Untitled" maxLength={300}
            className="border-transparent bg-transparent px-1 text-2xl font-bold shadow-none focus:border-line sm:text-3xl" />
          <Input aria-label="Description" value={description} onChange={(e) => onDescription(e.target.value)} placeholder="Add a short description…" maxLength={500}
            className="border-transparent bg-transparent px-1 text-muted shadow-none focus:border-line" />
          <Toolbar editor={editor} onLink={() => setLinkOpen(true)} />
          <div className="card min-h-[50vh] p-4 sm:p-6">
            <EditorContent editor={editor} />
          </div>
          <p className="text-xs text-muted" aria-live="polite">{stats.words.toLocaleString()} words · {stats.characters.toLocaleString()} characters · ~{Math.max(1, Math.round(stats.readingMinutes))} min read</p>
        </div>

        {showMeta && (
          <aside className="space-y-4" aria-label="Document details">
            <Card>
              <CardTitle icon={Tags}>Details</CardTitle>
              <div className="space-y-3">
                <Field label="Tags"><TagInput value={doc.tags} onChange={(tags) => meta({ tags })} /></Field>
                <Field label="Folder" htmlFor="doc-folder">
                  <Select id="doc-folder" value={doc.folderId ?? ''} onChange={(e) => meta({ folderId: e.target.value || null })}>
                    <option value="">No folder</option>
                    {folders?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </Field>
                <Field label="Area" htmlFor="doc-area">
                  <Select id="doc-area" value={doc.area} onChange={(e) => meta({ area: e.target.value as Area })}>
                    {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
                  </Select>
                </Field>
                <Field label="Project" htmlFor="doc-project">
                  <Select id="doc-project" value={doc.projectId ?? ''} onChange={(e) => meta({ projectId: e.target.value || null })}>
                    <option value="">No project</option>
                    {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <div><span className="label">Color label</span><ColorPicker value={doc.color} onChange={(color) => meta({ color })} /></div>
                <Button size="sm" icon={Star} className={cn('w-full', doc.favorite && 'text-warn')} aria-pressed={doc.favorite}
                  onClick={() => void safeWrite(() => docsRepo.toggle(doc.id, 'favorite'))}>{doc.favorite ? 'Favorited' : 'Add to favorites'}</Button>
                <dl className="grid grid-cols-2 gap-1 text-xs text-muted">
                  <dt>Words</dt><dd className="text-right tabular-nums text-fg">{stats.words.toLocaleString()}</dd>
                  <dt>Characters</dt><dd className="text-right tabular-nums text-fg">{stats.characters.toLocaleString()}</dd>
                  <dt>Created</dt><dd className="text-right text-fg">{new Date(doc.createdAt).toLocaleDateString()}</dd>
                </dl>
              </div>
            </Card>
            <AiPanel getText={() => htmlToText(currentHtml())} editor={editor} existingTags={doc.tags} onAddTags={(tags) => meta({ tags })} />
          </aside>
        )}
      </div>

      <LinkModal open={linkOpen} editor={editor} onClose={() => setLinkOpen(false)} />

      <Modal open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="Unsaved changes"
        footer={<>
          <Button onClick={() => blocker.reset?.()}>Stay</Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>Leave anyway</Button>
        </>}>
        <p className="text-sm text-muted">Your latest edits could not be saved. A draft is kept on this device and will be offered next time you open this document.</p>
      </Modal>
    </div>
  )
}

function SaveIndicator({ status, savedAt, error, onRetry }: { status: SaveStatus; savedAt: number | null; error: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
      {status === 'saving' && <span className="flex items-center gap-1 text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Saving…</span>}
      {status === 'dirty' && <span className="text-muted">Unsaved changes…</span>}
      {(status === 'saved' || status === 'idle') && savedAt && <span className="flex items-center gap-1 text-muted"><Check className="h-3.5 w-3.5 text-ok" aria-hidden />Saved · {fmtTime(savedAt)}</span>}
      {status === 'error' && (
        <span className="flex items-center gap-2 text-danger" title={error}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />Save failed
          <button type="button" className="font-semibold underline" onClick={onRetry}>Retry</button>
        </span>
      )}
    </div>
  )
}

function ExportMenu({ onMarkdown, onText, onPrint, onWord }: { onMarkdown: () => void; onText: () => void; onPrint: () => void; onWord: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  const item = (label: string, Icon: typeof FileText, run: () => void) => (
    <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-raised"
      onClick={() => { setOpen(false); run() }}><Icon className="h-4 w-4 text-muted" aria-hidden />{label}</button>
  )
  return (
    <div className="relative" ref={ref}>
      <Button size="sm" icon={Download} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Export</Button>
      {open && (
        <div role="menu" className="glass absolute right-0 z-30 mt-1 w-56 rounded-xl p-1">
          {item('Markdown (.md)', FileText, onMarkdown)}
          {item('Plain text (.txt)', FileText, onText)}
          {item('Print / Save as PDF', Printer, onPrint)}
          {item('Word (.doc)', FileText, onWord)}
        </div>
      )}
    </div>
  )
}

function Toolbar({ editor, onLink }: { editor: Editor | null; onLink: () => void }) {
  if (!editor) return null
  const btn = (label: string, Icon: typeof Bold, active: boolean, run: () => void, disabled = false) => (
    <IconButton key={label} icon={Icon} label={label} active={active} disabled={disabled} onClick={run} className={cn(active && 'bg-raised')} />
  )
  const c = () => editor.chain().focus()
  const sep = (k: string) => <span key={k} className="mx-1 h-6 w-px bg-line" aria-hidden />
  return (
    <div role="toolbar" aria-label="Formatting" className="card sticky top-2 z-20 flex flex-wrap items-center gap-0.5 p-1.5">
      {btn('Heading 1', Heading1, editor.isActive('heading', { level: 1 }), () => c().toggleHeading({ level: 1 }).run())}
      {btn('Heading 2', Heading2, editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run())}
      {btn('Heading 3', Heading3, editor.isActive('heading', { level: 3 }), () => c().toggleHeading({ level: 3 }).run())}
      {btn('Paragraph', Pilcrow, editor.isActive('paragraph'), () => c().setParagraph().run())}
      {sep('s1')}
      {btn('Bold', Bold, editor.isActive('bold'), () => c().toggleBold().run())}
      {btn('Italic', Italic, editor.isActive('italic'), () => c().toggleItalic().run())}
      {btn('Strikethrough', Strikethrough, editor.isActive('strike'), () => c().toggleStrike().run())}
      {btn('Inline code', Code, editor.isActive('code'), () => c().toggleCode().run())}
      {btn('Link', Link2, editor.isActive('link'), onLink)}
      {sep('s2')}
      {btn('Bullet list', List, editor.isActive('bulletList'), () => c().toggleBulletList().run())}
      {btn('Numbered list', ListOrdered, editor.isActive('orderedList'), () => c().toggleOrderedList().run())}
      {btn('Quote', Quote, editor.isActive('blockquote'), () => c().toggleBlockquote().run())}
      {btn('Code block', SquareCode, editor.isActive('codeBlock'), () => c().toggleCodeBlock().run())}
      {btn('Horizontal rule', Minus, false, () => c().setHorizontalRule().run())}
      {sep('s3')}
      {btn('Undo', Undo2, false, () => c().undo().run(), !editor.can().undo())}
      {btn('Redo', Redo2, false, () => c().redo().run(), !editor.can().redo())}
    </div>
  )
}

function LinkModal({ open, editor, onClose }: { open: boolean; editor: Editor | null; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const active = !!editor?.isActive('link')
  useEffect(() => {
    if (open && editor) { setUrl((editor.getAttributes('link').href as string | undefined) ?? ''); setErr(null) }
  }, [open, editor])
  if (!editor) return null
  const apply = () => {
    const raw = url.trim()
    const href = /^mailto:/i.test(raw) ? (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(raw) ? raw : null) : normaliseUrl(raw)
    if (!href) { setErr('Enter a valid http(s) or mailto: link.'); return }
    if (editor.state.selection.empty && !active) {
      editor.chain().focus().insertContent({ type: 'text', text: raw, marks: [{ type: 'link', attrs: { href } }] }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={active ? 'Edit link' : 'Insert link'}
      footer={<>
        {active && <Button variant="ghost" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onClose() }}>Remove link</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={apply}>Apply</Button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); apply() }}>
        <Field label="URL" htmlFor="link-url" error={err} hint="http://, https:// or mailto: only. “example.com” becomes https://example.com.">
          <Input id="link-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" inputMode="url" />
        </Field>
      </form>
    </Modal>
  )
}

function AiPanel({ getText, editor, existingTags, onAddTags }: { getText: () => string; editor: Editor | null; existingTags: string[]; onAddTags: (tags: string[]) => void }) {
  const [busy, setBusy] = useState<AiTask | null>(null)
  const [result, setResult] = useState<{ task: AiTask; text: string } | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const tasks = AI_TASKS.filter((t) => DOC_AI_TASKS.includes(t.id))

  const run = async (task: AiTask) => {
    setBusy(task); setNotice(null); setResult(null)
    try {
      const text = await runAi(task, getText())
      setResult({ task, text })
    } catch (e) {
      setNotice({ tone: e instanceof AiUnavailableError ? 'info' : 'error', text: (e as Error).message })
    } finally { setBusy(null) }
  }

  const copy = async () => {
    if (!result) return
    try { await navigator.clipboard.writeText(result.text); toast('Copied') } catch { toast('Could not copy to clipboard', 'error') }
  }
  const insertBelow = () => {
    if (!result || !editor) return
    const html = result.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${p.split('\n').map(escapeHtml).join('<br>')}</p>`).join('')
    editor.chain().focus('end').insertContent(html).run()
    toast('Inserted at the end of the document')
  }
  const suggestedTags = result?.task === 'tags'
    ? [...new Set(parseList(result.text).flatMap((l) => l.split(',')).map((t) => t.trim().toLowerCase().replace(/^#/, '').slice(0, 32)).filter(Boolean))].slice(0, 8)
    : []

  return (
    <Card>
      <CardTitle icon={Wand2}>AI assistant</CardTitle>
      <p className="mb-3 text-xs text-muted">Optional. Sends this document’s text to the AI service only when you click. Results are never applied automatically.</p>
      <div className="flex flex-wrap gap-1.5">
        {tasks.map((t) => (
          <Button key={t.id} size="sm" loading={busy === t.id} disabled={!!busy} title={t.hint} onClick={() => void run(t.id)}>{t.label}</Button>
        ))}
      </div>
      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={cn('mt-3 rounded-xl border p-2 text-xs', notice.tone === 'error' ? 'border-danger/40 text-danger' : 'border-line text-muted')}>{notice.text}</p>
      )}
      {result && (
        <div className="mt-3 space-y-2">
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-bg/40 p-3 text-sm">{result.text || <em>(empty response)</em>}</div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" icon={ClipboardCopy} onClick={() => void copy()}>Copy</Button>
            {result.task === 'tags'
              ? <Button size="sm" variant="primary" icon={Tags} disabled={!suggestedTags.length}
                  onClick={() => { onAddTags([...new Set([...existingTags, ...suggestedTags])]); toast(`Added ${suggestedTags.length} tag(s)`) }}>Add tags</Button>
              : <Button size="sm" variant="primary" onClick={insertBelow} disabled={!result.text.trim()}>Insert below</Button>}
            <Button size="sm" variant="ghost" onClick={() => setResult(null)}>Dismiss</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
