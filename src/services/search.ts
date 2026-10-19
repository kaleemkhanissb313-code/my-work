import { db } from '@/lib/db'
import type { EntityType, RecordItem } from '@/types/models'
import { COLLECTIONS } from '@/features/records/collections'

export interface SearchHit { type: EntityType; id: string; title: string; subtitle: string; path: string; score: number }

export const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

/** Simple relevance: every term must appear; title matches weigh more. */
export function score(q: string, title: string, body = ''): number {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return 0
  const t = title.toLowerCase(), b = body.toLowerCase()
  let s = 0
  for (const term of terms) {
    if (t.includes(term)) s += t.startsWith(term) ? 6 : 4
    else if (b.includes(term)) s += 1
    else return 0
  }
  return s
}

export const recordPath = (r: Pick<RecordItem, 'collection'>) => COLLECTIONS[r.collection]?.path ?? '/'

/** Universal search across all modules. The Private Vault is deliberately excluded (encrypted). */
export async function searchAll(q: string, limit = 50): Promise<SearchHit[]> {
  const query = q.trim()
  if (!query) return []
  const hits: SearchHit[] = []
  const push = (h: Omit<SearchHit, 'score'>, body = '') => {
    const s = score(query, h.title, `${h.subtitle} ${body}`)
    if (s) hits.push({ ...h, score: s })
  }
  const live = <T extends { deletedAt: number | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt)
  const [docs, projects, tasks, events, media, bookmarks, records, datasets, gxProducts, gxOrders, gxPeople] = await Promise.all([
    db.docs.toArray(), db.projects.toArray(), db.tasks.toArray(), db.events.toArray(), db.media.toArray(),
    db.bookmarks.toArray(), db.records.toArray(), db.datasets.toArray(), db.gxProducts.toArray(), db.gxOrders.toArray(), db.gxPeople.toArray(),
  ])
  live(docs).forEach((d) => push({ type: 'doc', id: d.id, title: d.title || 'Untitled', subtitle: d.isTemplate ? 'Template' : d.kind === 'note' ? 'Note' : 'Document', path: `/${d.kind === 'note' ? 'notes' : 'documents'}/${d.id}` }, `${d.description} ${d.tags.join(' ')} ${stripHtml(d.content)}`))
  live(projects).forEach((p) => push({ type: 'project', id: p.id, title: p.name, subtitle: `Project · ${p.status}`, path: `/projects/${p.id}` }, `${p.description} ${p.tags.join(' ')}`))
  live(tasks).forEach((t) => push({ type: 'task', id: t.id, title: t.title, subtitle: `Task · ${t.status.replace('_', ' ')}`, path: `/tasks?open=${t.id}` }, `${t.description} ${t.category} ${t.tags.join(' ')} ${t.subtasks.map((s) => s.title).join(' ')}`))
  live(events).forEach((e) => push({ type: 'event', id: e.id, title: e.title, subtitle: `Event · ${e.start.slice(0, 10)}`, path: `/calendar?date=${e.start.slice(0, 10)}` }, `${e.location} ${e.notes}`))
  live(media).forEach((m) => push({ type: 'media', id: m.id, title: m.name, subtitle: `Media · ${m.mime}`, path: `/media?open=${m.id}` }, `${m.description} ${m.tags.join(' ')}`))
  live(bookmarks).forEach((b) => push({ type: 'bookmark', id: b.id, title: b.title || b.url, subtitle: `Link · ${b.category}`, path: `/links?open=${b.id}` }, `${b.url} ${b.description} ${b.notes} ${b.tags.join(' ')}`))
  live(records).forEach((r) => push({ type: 'record', id: r.id, title: r.title, subtitle: COLLECTIONS[r.collection]?.label ?? r.collection, path: `${recordPath(r)}?open=${r.id}` }, `${r.category} ${r.tags.join(' ')} ${Object.values(r.fields).join(' ')}`))
  live(datasets).forEach((d) => push({ type: 'dataset', id: d.id, title: d.name, subtitle: 'Dataset', path: `/graphs?open=${d.id}` }, d.columns.join(' ')))
  // GLAMIEX
  const peopleById = new Map(gxPeople.map((p) => [p.id, p.name]))
  live(gxProducts).forEach((p) => push({ type: 'gx', id: p.id, title: p.name, subtitle: `GLAMIEX product · ${p.sku}`, path: `/glamiex/products/${p.id}` }, `${p.sku} ${p.category} ${p.description} ${p.tags.join(' ')}`))
  live(gxOrders).forEach((o) => push({ type: 'gx', id: o.id, title: o.orderNo, subtitle: `GLAMIEX sale · ${o.status}`, path: `/glamiex/sales/${o.id}` }, `${peopleById.get(o.personId ?? '') ?? ''} ${o.items.map((i) => i.name).join(' ')} ${o.notes}`))
  live(gxPeople).forEach((p) => push({ type: 'gx', id: p.id, title: p.name, subtitle: `GLAMIEX ${p.type}`, path: `/glamiex/people/${p.id}` }, `${p.phone} ${p.email} ${p.notes}`))
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}
