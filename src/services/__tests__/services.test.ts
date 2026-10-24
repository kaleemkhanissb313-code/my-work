// @vitest-environment node
// Node environment: real WebCrypto (crypto.subtle) + fake-indexeddb from the setup file.
import { db } from '@/lib/db'
import { docsRepo, recordsRepo, tasksRepo } from '../repo'
import { backoffMs, checkPin, getAttempts, hasPin, lockApp, lockState, MAX_FREE_ATTEMPTS, removePin, setPin, unlockApp, validatePin } from '../security'
import { addVaultItem, createVault, listVaultItems, lockVault, unlockVault, vaultState } from '../vault'
import { exportBackup, importBackup } from '../backup'
import { getSettings, mergeSettings, updateSettings } from '../settings'
import { searchAll } from '../search'
import { hashSecret, verifySecret, encryptJSON, decryptJSON, deriveAesKey, randomBytes } from '@/lib/crypto'

beforeEach(async () => {
  lockVault()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('repository persistence', () => {
  it('creates, updates (bumping version and marking dirty), trashes and restores', async () => {
    const t = await tasksRepo.create({ title: 'Write report', dueDate: '2026-10-21' })
    expect((await db.tasks.get(t.id))?.title).toBe('Write report')
    await db.tasks.update(t.id, { syncedAt: 123 })
    await tasksRepo.update(t.id, { status: 'in_progress' })
    const u = (await db.tasks.get(t.id))!
    expect(u.status).toBe('in_progress')
    expect(u.version).toBe(2)
    expect(u.syncedAt).toBeNull()
    await tasksRepo.trash(t.id)
    expect((await db.tasks.get(t.id))?.deletedAt).toBeTypeOf('number')
    await tasksRepo.restore(t.id)
    expect((await db.tasks.get(t.id))?.deletedAt).toBeNull()
  })

  it('fails loudly when updating a missing row (no silent data loss)', async () => {
    await expect(tasksRepo.update('missing', { title: 'x' })).rejects.toThrow(/not found/)
  })

  it('duplicates with a new id and fresh metadata', async () => {
    const d = await docsRepo.create({ title: 'Plan', content: '<p>Hi</p>', tags: ['a'] })
    const copy = (await docsRepo.duplicate(d.id, (x) => ({ title: `${x.title} (copy)` })))!
    expect(copy.id).not.toBe(d.id)
    expect(copy.title).toBe('Plan (copy)')
    expect(copy.content).toBe('<p>Hi</p>')
    expect(copy.version).toBe(1)
  })

  it('searches across modules and excludes trashed items', async () => {
    await docsRepo.create({ title: 'Quarterly budget', content: '<p>numbers</p>' })
    const t = await tasksRepo.create({ title: 'Budget review' })
    await recordsRepo.create({ collection: 'bills', title: 'Electricity', fields: { account: 'budget-123' } })
    expect((await searchAll('budget')).map((h) => h.type).sort()).toEqual(['doc', 'record', 'task'])
    await tasksRepo.trash(t.id)
    expect((await searchAll('budget')).some((h) => h.type === 'task')).toBe(false)
    expect(await searchAll('   ')).toEqual([])
  })
})

describe('settings', () => {
  it('merges defaults and persists updates', async () => {
    expect((await getSettings()).theme).toBe('light')
    await updateSettings({ theme: 'light', currency: 'PKR' })
    const s = await getSettings()
    expect(s.theme).toBe('light'); expect(s.currency).toBe('PKR'); expect(s.pomodoro.workMin).toBe(25)
    expect(mergeSettings({ dashboardWidgets: [{ id: 'calc', visible: false }] }).dashboardWidgets[0]).toEqual({ id: 'calc', visible: false })
  })
})

describe('app lock', () => {
  it('validates PIN strength', () => {
    expect(validatePin('12')).toMatch(/4 digits/)
    expect(validatePin('1111')).toMatch(/easy/)
    expect(validatePin('abc')).toMatch(/6 characters/)
    expect(validatePin('4826')).toBeNull()
  })

  it('stores only a salted hash, verifies, and locks/unlocks', async () => {
    await setPin('4826')
    const stored = JSON.stringify((await db.kv.get('security.pin'))?.value)
    expect(stored).not.toContain('4826')
    expect(await hasPin()).toBe(true)
    expect(await lockApp()).toBe(true)
    expect(lockState.get().locked).toBe(true)
    expect((await unlockApp('0000')).ok).toBe(false)
    expect((await unlockApp('4826')).ok).toBe(true)
    expect(lockState.get().locked).toBe(false)
    expect((await getAttempts()).failures).toBe(0) // reset after success
    await expect(removePin('9999')).rejects.toThrow()
    await removePin('4826')
    expect(await hasPin()).toBe(false)
  }, 20_000)

  it('applies exponential back-off after repeated failures', async () => {
    expect(backoffMs(MAX_FREE_ATTEMPTS - 1)).toBe(0)
    expect(backoffMs(MAX_FREE_ATTEMPTS)).toBe(30_000)
    expect(backoffMs(MAX_FREE_ATTEMPTS + 1)).toBe(60_000)
    expect(backoffMs(100)).toBe(3_600_000)
    await setPin('4826')
    const now = 1_000_000
    for (let i = 0; i < MAX_FREE_ATTEMPTS; i++) await checkPin('0000', now)
    const r = await checkPin('4826', now + 1000) // correct PIN still refused during lockout
    expect(r.ok).toBe(false)
    expect((await checkPin('4826', now + 31_000)).ok).toBe(true)
  }, 30_000)
})

describe('crypto & private vault', () => {
  it('hashes and verifies secrets', async () => {
    const h = await hashSecret('correct horse', 1000)
    expect(await verifySecret('correct horse', h)).toBe(true)
    expect(await verifySecret('wrong', h)).toBe(false)
  })

  it('AES-GCM detects wrong keys and tampering', async () => {
    const k1 = await deriveAesKey('pass-one-long', randomBytes(16), 1000)
    const k2 = await deriveAesKey('pass-two-long', randomBytes(16), 1000)
    const { ciphertext, iv } = await encryptJSON(k1, { secret: 42 })
    expect(await decryptJSON(k1, ciphertext, iv)).toEqual({ secret: 42 })
    await expect(decryptJSON(k2, ciphertext, iv)).rejects.toThrow()
    const tampered = (ciphertext[0] === 'A' ? 'B' : 'A') + ciphertext.slice(1)
    await expect(decryptJSON(k1, tampered, iv)).rejects.toThrow()
  })

  it('stores only ciphertext and requires the passphrase to read', async () => {
    await expect(createVault('short')).rejects.toThrow(/10 characters/)
    await createVault('a long vault passphrase')
    await addVaultItem({ title: 'Recovery codes', body: 'ABCD-EFGH', kind: 'note' })
    const raw = JSON.stringify(await db.vault.toArray())
    expect(raw).not.toContain('Recovery codes')
    expect(raw).not.toContain('ABCD-EFGH')
    lockVault()
    expect(vaultState.get().unlocked).toBe(false)
    await expect(listVaultItems()).rejects.toThrow(/locked/)
    await expect(unlockVault('wrong passphrase!!')).rejects.toThrow(/Incorrect/)
    await unlockVault('a long vault passphrase')
    expect((await listVaultItems())[0]).toMatchObject({ title: 'Recovery codes', body: 'ABCD-EFGH' })
  }, 30_000)
})

describe('backup & restore', () => {
  it('round-trips data and merges by last-write-wins', async () => {
    const t = await tasksRepo.create({ title: 'Original' })
    const backup = JSON.parse(JSON.stringify(await exportBackup(false)))
    await tasksRepo.update(t.id, { title: 'Edited after backup' })
    await db.docs.clear()
    let r = await importBackup(backup)
    expect((await db.tasks.get(t.id))?.title).toBe('Edited after backup') // newer local kept
    expect(r.skipped).toBeGreaterThan(0)
    await db.tasks.clear()
    r = await importBackup(backup)
    expect(r.inserted).toBe(1)
    expect((await db.tasks.get(t.id))?.title).toBe('Original')
  })

  it('rejects files that are not backups', async () => {
    await expect(importBackup({ hello: 'world' })).rejects.toThrow(/not a valid/)
  })
})
