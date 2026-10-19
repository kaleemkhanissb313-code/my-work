import { db } from '@/lib/db'
import { hashSecret, verifySecret, type SecretHash } from '@/lib/crypto'
import { createStore } from '@/lib/store'
import { audit } from './audit'
import { getSettings, updateSettings } from './settings'
import { lockVault } from './vault'

/**
 * App lock. IMPORTANT LIMITATION: this is a local privacy screen. It hides the UI and clears in-memory
 * vault keys, but it does not encrypt the IndexedDB store; anyone with the device's browser profile and
 * dev tools could read non-vault data. Real protection for sensitive items is the encrypted Private Vault
 * (and, for cloud data, Supabase Auth + Row Level Security on the server).
 */
export const lockState = createStore<{ locked: boolean; ready: boolean }>({ locked: false, ready: false })

const PIN_KEY = 'security.pin'
const ATTEMPTS_KEY = 'security.attempts'
export const MAX_FREE_ATTEMPTS = 5

export interface Attempts { failures: number; lockedUntil: number }

export async function hasPin() { return !!(await db.kv.get(PIN_KEY)) }

export function validatePin(pin: string): string | null {
  if (!/^\S+$/.test(pin)) return 'PIN/password cannot contain spaces.'
  if (/^\d+$/.test(pin) && pin.length < 4) return 'A numeric PIN needs at least 4 digits.'
  if (!/^\d+$/.test(pin) && pin.length < 6) return 'A password needs at least 6 characters.'
  if (/^(\d)\1+$/.test(pin) || pin === '1234' || pin === '123456') return 'That PIN is too easy to guess.'
  return null
}

export async function setPin(pin: string) {
  const err = validatePin(pin)
  if (err) throw new Error(err)
  await db.kv.put({ key: PIN_KEY, value: await hashSecret(pin) })
  await db.kv.delete(ATTEMPTS_KEY)
  const s = await getSettings()
  await updateSettings({ lock: { ...s.lock, enabled: true } })
  await audit('pin_set', 'App lock PIN/password set')
}

export async function removePin(currentPin: string) {
  const ok = await checkPin(currentPin)
  if (!ok.ok) throw new Error(ok.error)
  await db.kv.delete(PIN_KEY)
  const s = await getSettings()
  await updateSettings({ lock: { ...s.lock, enabled: false } })
  await audit('pin_removed', 'App lock disabled')
}

export async function getAttempts(): Promise<Attempts> {
  return ((await db.kv.get(ATTEMPTS_KEY))?.value as Attempts) ?? { failures: 0, lockedUntil: 0 }
}

/** Exponential back-off after MAX_FREE_ATTEMPTS failures: 30s, 60s, 120s … capped at 1h. */
export const backoffMs = (failures: number) =>
  failures < MAX_FREE_ATTEMPTS ? 0 : Math.min(3_600_000, 30_000 * 2 ** (failures - MAX_FREE_ATTEMPTS))

export async function checkPin(pin: string, now = Date.now()): Promise<{ ok: true } | { ok: false; error: string; retryAt?: number }> {
  const att = await getAttempts()
  if (att.lockedUntil > now) return { ok: false, error: 'Too many attempts. Try again later.', retryAt: att.lockedUntil }
  const stored = (await db.kv.get(PIN_KEY))?.value as SecretHash | undefined
  if (!stored) return { ok: true }
  if (await verifySecret(pin, stored)) {
    await db.kv.delete(ATTEMPTS_KEY)
    return { ok: true }
  }
  const failures = att.failures + 1
  const wait = backoffMs(failures)
  await db.kv.put({ key: ATTEMPTS_KEY, value: { failures, lockedUntil: wait ? now + wait : 0 } satisfies Attempts })
  await audit('unlock_failed', `Failed unlock attempt #${failures}`)
  return { ok: false, error: wait ? 'Incorrect. Too many attempts — temporarily locked.' : 'Incorrect PIN or password.', retryAt: wait ? now + wait : undefined }
}

export async function lockApp(reason = 'manual') {
  if (!(await hasPin())) return false
  lockVault()
  lockState.set((s) => ({ ...s, locked: true }))
  await audit('lock', `App locked (${reason})`)
  return true
}

export async function unlockApp(pin: string) {
  const r = await checkPin(pin)
  if (r.ok) {
    lockState.set((s) => ({ ...s, locked: false }))
    await audit('unlock', 'App unlocked')
  }
  return r
}

/** Called once on start-up: lock immediately if a PIN is configured. */
export async function initLock() {
  const s = await getSettings()
  const pin = await hasPin()
  lockState.set({ locked: pin && s.lock.enabled, ready: true })
}
