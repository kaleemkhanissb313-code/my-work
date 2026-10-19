import { db } from '@/lib/db'
import { decryptJSON, deriveAesKey, encryptJSON, fromB64, PBKDF2_ITERATIONS, randomBytes, toB64 } from '@/lib/crypto'
import { createStore } from '@/lib/store'
import { uid } from '@/lib/id'
import { audit } from './audit'
import { baseEntity } from './repo'
import type { VaultItem } from '@/types/models'

/**
 * Private Vault — client-side (end-to-end) encryption.
 * The AES-GCM key is derived from a vault passphrase that is never stored. Only ciphertext is written
 * to IndexedDB (and to the cloud if sync is enabled). Forgetting the passphrase means the data cannot
 * be recovered by anyone, including the server operator.
 */
export interface VaultMeta { salt: string; iterations: number; check: { ciphertext: string; iv: string } }
export interface VaultPlain { title: string; body: string; kind: 'note' | 'login' | 'document' | 'card' | 'other' }
export interface DecryptedVaultItem extends VaultPlain { id: string; updatedAt: number; createdAt: number }

const META_KEY = 'vault.meta'
const CHECK = 'b2a-vault-ok'

let key: CryptoKey | null = null
export const vaultState = createStore<{ unlocked: boolean }>({ unlocked: false })

export async function getVaultMeta() { return (await db.kv.get(META_KEY))?.value as VaultMeta | undefined }

export async function createVault(passphrase: string) {
  if (passphrase.length < 10) throw new Error('Use a vault passphrase of at least 10 characters.')
  if (await getVaultMeta()) throw new Error('A vault already exists.')
  const salt = randomBytes(16)
  const k = await deriveAesKey(passphrase, salt)
  const meta: VaultMeta = { salt: toB64(salt), iterations: PBKDF2_ITERATIONS, check: await encryptJSON(k, CHECK) }
  await db.kv.put({ key: META_KEY, value: meta })
  key = k
  vaultState.set({ unlocked: true })
  await audit('vault_created', 'Private vault created')
}

export async function unlockVault(passphrase: string) {
  const meta = await getVaultMeta()
  if (!meta) throw new Error('No vault exists yet.')
  const k = await deriveAesKey(passphrase, fromB64(meta.salt), meta.iterations)
  try {
    if ((await decryptJSON<string>(k, meta.check.ciphertext, meta.check.iv)) !== CHECK) throw new Error()
  } catch {
    await audit('vault_unlock_failed', 'Wrong vault passphrase')
    throw new Error('Incorrect vault passphrase.')
  }
  key = k
  vaultState.set({ unlocked: true })
  await audit('vault_unlocked', 'Private vault unlocked')
}

export function lockVault() {
  if (!key) return
  key = null
  vaultState.set({ unlocked: false })
  void audit('vault_locked', 'Private vault locked')
}

function requireKey() {
  if (!key) throw new Error('Vault is locked.')
  return key
}

export async function addVaultItem(plain: VaultPlain) {
  const { ciphertext, iv } = await encryptJSON(requireKey(), plain)
  const row: VaultItem = { ...baseEntity(), id: uid(), ciphertext, iv }
  await db.vault.add(row)
  return row.id
}

export async function updateVaultItem(id: string, plain: VaultPlain) {
  const { ciphertext, iv } = await encryptJSON(requireKey(), plain)
  await db.vault.where('id').equals(id).modify((r) => { r.ciphertext = ciphertext; r.iv = iv; r.updatedAt = Date.now(); r.version++; r.syncedAt = null })
}

export async function listVaultItems(): Promise<DecryptedVaultItem[]> {
  const k = requireKey()
  const rows = (await db.vault.toArray()).filter((r) => !r.deletedAt)
  const out: DecryptedVaultItem[] = []
  for (const r of rows) {
    try { out.push({ ...(await decryptJSON<VaultPlain>(k, r.ciphertext, r.iv)), id: r.id, updatedAt: r.updatedAt, createdAt: r.createdAt }) }
    catch { out.push({ id: r.id, title: '⚠ Unreadable item', body: 'This item could not be decrypted (corrupted or encrypted with a different key).', kind: 'other', updatedAt: r.updatedAt, createdAt: r.createdAt }) }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Vault items are deleted permanently (no plaintext trash copy). */
export const deleteVaultItem = (id: string) => db.vault.delete(id)
