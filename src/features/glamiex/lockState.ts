/*
 * GLAMIEX password lock state. Unlocking lasts only for the current page load:
 * a refresh or reopening the site locks GLAMIEX again.
 * NOTE: client-side check only — the hash ships in the public JS bundle and a 4-digit password is
 * trivially brute-forced, so this is a privacy screen, NOT secure access control.
 */
const PASSWORD_SHA256 = 'd3cd20b35569bccd833c8b7dafcaaaba93dde0f9c9acbc93bf4865b28b785058'
const SALT = 'workMYwork-site:'

let unlocked = false

export const isGlamiexUnlocked = () => unlocked

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Checks the password and unlocks GLAMIEX for this page load when it matches. */
export async function unlockGlamiex(password: string) {
  unlocked = (await sha256Hex(SALT + password)) === PASSWORD_SHA256
  return unlocked
}
