/**
 * Thin wrappers over the Web Crypto API (SubtleCrypto). No home-grown primitives.
 *  - PIN / password verification: PBKDF2-SHA-256, 310,000 iterations, 16-byte random salt.
 *  - Vault encryption: AES-256-GCM with a key derived from the vault passphrase via PBKDF2.
 *    The derived key is non-extractable and only lives in memory while the vault is unlocked.
 */
export const PBKDF2_ITERATIONS = 310_000

const enc = new TextEncoder()
const dec = new TextDecoder()

export const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

async function pbkdf2Bits(secret: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256)
}

export interface SecretHash { salt: string; hash: string; iterations: number }

export async function hashSecret(secret: string, iterations = PBKDF2_ITERATIONS): Promise<SecretHash> {
  const salt = randomBytes(16)
  return { salt: toB64(salt), hash: toB64(await pbkdf2Bits(secret, salt, iterations)), iterations }
}

/** Constant-time comparison of the derived hash. */
export async function verifySecret(secret: string, h: SecretHash): Promise<boolean> {
  const got = new Uint8Array(await pbkdf2Bits(secret, fromB64(h.salt), h.iterations))
  const want = fromB64(h.hash)
  if (got.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]
  return diff === 0
}

export async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJSON(key: CryptoKey, value: unknown) {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return { ciphertext: toB64(ct), iv: toB64(iv) }
}

/** Throws if the key is wrong or the ciphertext was tampered with (GCM authentication). */
export async function decryptJSON<T>(key: CryptoKey, ciphertext: string, iv: string): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext))
  return JSON.parse(dec.decode(pt)) as T
}

/** Password strength estimate (length + character classes); guidance only, not a security guarantee. */
export function passwordStrength(pw: string) {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (pw.length >= 16) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (/^(.)\1+$/.test(pw) || /^(1234|password|qwerty)/i.test(pw)) score = 0
  const label = score <= 2 ? 'Weak' : score <= 4 ? 'Fair' : 'Strong'
  return { score: Math.min(score, 6), label }
}
