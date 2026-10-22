import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Eye, Lock, Pencil, Save, Share2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui'
import { toast } from '@/components/feedback'
import { accessApi, type SharedItem } from '@/services/accessApi'
import { htmlToMarkdown, markdownToHtml } from '@/lib/markdown'
import { time12 } from '@/lib/time12'

/** Read-only fields worth showing for non-document items (everything is rendered as plain text). */
const SHOW: Record<string, string[]> = {
  records: ['category', 'dueDate', 'amount'], projects: ['status', 'startDate', 'deadline', 'description'], tasks: ['status', 'priority', 'dueDate', 'description'],
  events: ['start', 'end', 'location', 'description'], datasets: ['description'],
}
const text = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** /shared/:id — an item shared with the signed-in person.  /s/:token — a view-only link anyone can open. */
export function SharedItemPage() {
  const { id, token } = useParams()
  const [item, setItem] = useState<SharedItem | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const load = async () => {
    try { setItem(token ? await accessApi.openLink(token) : await accessApi.openShare(id!)); setErr(null) }
    catch (e) { setErr(token ? 'This link is invalid, has expired or was revoked.' : (e as Error).message) }
  }
  useEffect(() => { void load() }, [id, token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <EmptyState icon={Lock} title="Not available">{err}</EmptyState>
  if (!item) return <Spinner label="Opening shared item" />
  const d = item.data
  const title = text(d.title ?? d.name) || item.title || 'Untitled'
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={title} icon={Share2} description={`Shared ${token ? 'by link' : 'with you'} · ${item.permission === 'editor' ? 'you can edit' : 'view only'}${item.expires_at ? ` · until ${new Date(item.expires_at).toLocaleDateString()} ${time12(new Date(item.expires_at))}` : ''}`}
        actions={<>{item.permission === 'editor' && !editing && !token && <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}<Badge tone="muted"><Eye className="me-1 inline h-3 w-3" />Only this item is shared</Badge></>} />
      {editing ? <EditShared id={id!} item={item} onDone={() => { setEditing(false); void load() }} /> : (
        <Card>
          {item.table === 'docs' ? <SafeDoc html={text(d.content)} /> : (
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              {(SHOW[item.table] ?? []).filter((k) => d[k] != null && d[k] !== '').map((k) => <Row key={k} k={k} v={text(d[k])} />)}
              {item.table === 'records' && typeof d.fields === 'object' && d.fields !== null && Object.entries(d.fields as Record<string, unknown>).filter(([, v]) => v != null && v !== '').map(([k, v]) => <Row key={k} k={k} v={text(v)} />)}
            </dl>
          )}
        </Card>
      )}
    </div>
  )
}
const Row = ({ k, v }: { k: string; v: string }) => <><dt className="font-medium capitalize text-muted">{k.replace(/([A-Z])/g, ' $1')}</dt><dd className="whitespace-pre-wrap break-words">{v}</dd></>

/** Renders shared document HTML safely: converted to Markdown and back (every character escaped, no raw HTML kept). */
function SafeDoc({ html }: { html: string }) {
  const safe = useMemo(() => markdownToHtml(htmlToMarkdown(html)), [html])
  return safe.trim() ? <div className="prose-editor min-h-0" dangerouslySetInnerHTML={{ __html: safe }} /> : <p className="text-sm text-muted">This document is empty.</p>
}

function EditShared({ id, item, onDone }: { id: string; item: SharedItem; onDone: () => void }) {
  const isDoc = item.table === 'docs'
  const titleKey = item.data.title !== undefined ? 'title' : 'name'
  const [title, setTitle] = useState(text(item.data[titleKey]))
  const [body, setBody] = useState(isDoc ? htmlToMarkdown(text(item.data.content)) : text(item.data.description ?? ''))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const patch: Record<string, unknown> = { ...item.data, [titleKey]: title.trim(), updatedAt: Date.now() }
      if (isDoc) patch.content = markdownToHtml(body)
      else if ('description' in item.data) patch.description = body
      await accessApi.updateShared(id, patch)
      toast('Saved to the owner’s copy'); onDone()
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Card className="space-y-3">
      <Field label="Title" htmlFor="se-t"><Input id="se-t" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
      {(isDoc || 'description' in item.data) && <Field label={isDoc ? 'Content (Markdown)' : 'Description'} htmlFor="se-b"><Textarea id="se-b" className="min-h-[240px] font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} /></Field>}
      <div className="flex justify-end gap-2"><Button onClick={onDone}>Cancel</Button><Button variant="primary" icon={Save} loading={busy} onClick={() => void save()}>Save</Button></div>
    </Card>
  )
}
