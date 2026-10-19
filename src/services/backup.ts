import { z } from 'zod'
import { db, entityTables } from '@/lib/db'
import { audit } from './audit'

/**
 * Full JSON backup. Vault rows stay encrypted (ciphertext only). Media blobs are included as base64
 * when `includeMedia` is set. Import merges by id using last-write-wins on updatedAt.
 */
export const BACKUP_FORMAT = 'basic-to-advanced-backup'
export const BACKUP_VERSION = 1

const blobToB64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result))
  r.onerror = () => rej(r.error)
  r.readAsDataURL(b)
})
const b64ToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob()

export async function exportBackup(includeMedia = true) {
  const tables: Record<string, unknown[]> = {}
  for (const name of entityTables) {
    let rows = await db.table(name).toArray()
    if (name === 'media') {
      rows = includeMedia
        ? await Promise.all(rows.map(async (m) => ({ ...m, blob: await blobToB64(m.blob) })))
        : rows.map(({ blob: _b, ...m }) => m)
    }
    tables[name] = rows
  }
  for (const name of ['links', 'savedViews', 'calcHistory', 'audit', 'gxAudit'] as const) tables[name] = await db.table(name).toArray()
  const settings = await db.kv.get('settings')
  const gxSettings = await db.kv.get('gx.settings')
  const vaultMeta = await db.kv.get('vault.meta')
  await audit('backup_exported', includeMedia ? 'Backup exported (with media)' : 'Backup exported (no media)')
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: settings?.value ?? null, gxSettings: gxSettings?.value ?? null, vaultMeta: vaultMeta?.value ?? null, tables }
}

const rowSchema = z.object({ id: z.string().min(1) }).passthrough()
const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().max(BACKUP_VERSION),
  settings: z.unknown().optional(),
  vaultMeta: z.unknown().optional(),
  tables: z.record(z.array(rowSchema)),
})

export interface ImportReport { inserted: number; updated: number; skipped: number; errors: string[] }

export async function importBackup(json: unknown): Promise<ImportReport> {
  const parsed = backupSchema.safeParse(json)
  if (!parsed.success) throw new Error('This file is not a valid Basic to Advanced backup.')
  const data = parsed.data
  const report: ImportReport = { inserted: 0, updated: 0, skipped: 0, errors: [] }
  const allowed = new Set<string>([...entityTables, 'links', 'savedViews', 'calcHistory', 'gxAudit'])
  // Refuse to import vault rows encrypted with a different vault key than the one on this device.
  const localMeta = (await db.kv.get('vault.meta'))?.value as { salt?: string } | undefined
  const incomingMeta = data.vaultMeta as { salt?: string } | null | undefined
  const vaultCompatible = !incomingMeta || !localMeta || localMeta.salt === incomingMeta.salt

  await db.transaction('rw', [...allowed].map((n) => db.table(n)).concat(db.table('kv')), async () => {
    for (const [name, rows] of Object.entries(data.tables)) {
      if (!allowed.has(name)) continue
      if (name === 'vault' && !vaultCompatible) { report.skipped += rows.length; report.errors.push('Vault items skipped: they belong to a different vault passphrase.'); continue }
      const table = db.table(name)
      for (const raw of rows) {
        try {
          const row = { ...raw } as Record<string, unknown>
          if (name === 'media') {
            if (typeof row.blob !== 'string') { report.skipped++; continue }
            row.blob = await b64ToBlob(row.blob as string)
          }
          const existing = await table.get(row.id as string)
          if (!existing) { await table.add(row); report.inserted++ }
          else if ((row.updatedAt as number ?? 0) > ((existing as { updatedAt?: number }).updatedAt ?? 0)) { await table.put(row); report.updated++ }
          else report.skipped++
        } catch (e) {
          report.errors.push(`${name}: ${(e as Error).message}`)
        }
      }
    }
    if (incomingMeta && !localMeta) await db.kv.put({ key: 'vault.meta', value: incomingMeta })
  })
  await audit('backup_imported', `Imported ${report.inserted} new, ${report.updated} updated`)
  return report
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadText = (text: string, filename: string, mime = 'text/plain;charset=utf-8') => downloadBlob(new Blob([text], { type: mime }), filename)
