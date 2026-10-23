import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { makeRepo } from '@/services/repo'
import { gxAudit } from '@/features/glamiex/service'
import { blankSheet, type SheetData } from './ops'
import type { FormatPreset, GxSheet } from './types'

export const sheetsRepo = makeRepo<GxSheet>(db.gxSheets, () => ({ name: 'Untitled sheet', description: '', ...blankSheet(), order: Date.now() }))

export async function createSheet(name: string, data: SheetData = blankSheet(), description = '') {
  const s = await sheetsRepo.create({ name, description, ...data, order: Date.now() })
  await gxAudit('sheet', s.id, 'create', `Sheet “${name}” created`)
  return s
}

/* Personal workspace spreadsheets (/sheets): same engine, separate table, no business audit trail. */
export const wsSheetsRepo = makeRepo<GxSheet>(db.sheets, () => ({ name: 'Untitled sheet', description: '', ...blankSheet(), order: Date.now() }))
export async function createWsSheet(name: string, data: SheetData = blankSheet(), description = '') {
  return wsSheetsRepo.create({ name, description, ...data, order: Date.now() })
}
export function useWsSheets() {
  return useLiveQuery(() => db.sheets.filter((s) => !s.deletedAt).toArray().then((x) => x.sort((a, b) => b.updatedAt - a.updatedAt)), [])
}

/** What the sheet editor needs from the area it runs in (GLAMIEX or the personal workspace). */
export interface SheetHost {
  repo: Pick<typeof sheetsRepo, 'update' | 'toggle' | 'trash'>
  create: (name: string, data: SheetData) => Promise<{ id: string }>
  /** Navigate to a sheet id, or to the list when id is null. */
  open: (id: string | null) => void
  audit?: (id: string, action: 'delete', detail: string) => Promise<void>
  /** Label used on printouts. */
  printTag: string
  deleteNote: string
  links?: { options: (t: string) => { id: string; label: string }[]; label: (t: string, id: string) => string; path: (t: string, id: string) => string }
}

export function useSheets() {
  return useLiveQuery(() => db.gxSheets.filter((s) => !s.deletedAt).toArray().then((x) => x.sort((a, b) => a.order - b.order)), [])
}

/* Reusable formatting presets (saved in kv) */
const PRESET_KEY = 'sheets.formatPresets'
export const DEFAULT_PRESETS: FormatPreset[] = [
  { id: 'header', name: 'Header', fmt: { b: true, bg: '#ede9fe', color: '#3b0764', align: 'center', border: true } },
  { id: 'money', name: 'Money', fmt: { fmt: 'pkr', align: 'right' } },
  { id: 'total', name: 'Total', fmt: { b: true, bg: '#e0f2fe', border: true, fmt: 'pkr' } },
  { id: 'good', name: 'Good / profit', fmt: { color: '#047857', bg: '#d1fae5', b: true } },
  { id: 'bad', name: 'Bad / loss', fmt: { color: '#b91c1c', bg: '#fee2e2', b: true } },
  { id: 'note', name: 'Note', fmt: { i: true, color: '#6b7280' } },
]
export function useFormatPresets(): FormatPreset[] {
  const v = useLiveQuery(() => db.kv.get(PRESET_KEY), [])?.value as FormatPreset[] | undefined
  return v ?? DEFAULT_PRESETS
}
export async function saveFormatPresets(list: FormatPreset[]) { await db.kv.put({ key: PRESET_KEY, value: list }) }
