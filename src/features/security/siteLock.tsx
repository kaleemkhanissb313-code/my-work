/*
 * Entry password for the whole website (shown to anyone who opens the link). Unlocking lasts for the browser tab
 * session; closing the tab locks it again.
 * NOTE: this is a client-side check — the hash ships in the public JS bundle and a short password like this can be
 * guessed quickly, so it keeps casual visitors out but is NOT strong security. Your data itself never leaves your
 * own device unless you sign in to the cloud; real account security is the Supabase sign-in + permissions.
 */
import type { ReactNode } from 'react'
import { PasswordGate, sha256Hex } from '@/components/PasswordGate'

const ENTRY_SHA256 = 'f1d97b71b1b4e61a855a588b9b1b19a93c527c93f72add14d04fbe518e209e9b' // SHA-256('workMYwork-entry:' + password)
const SALT = 'workMYwork-entry:'
const KEY = 'b2a-site-unlocked'

const isUnlocked = () => { try { return sessionStorage.getItem(KEY) === ENTRY_SHA256.slice(0, 16) } catch { return false } }
async function verify(password: string) {
  const ok = (await sha256Hex(SALT + password)) === ENTRY_SHA256
  if (ok) { try { sessionStorage.setItem(KEY, ENTRY_SHA256.slice(0, 16)) } catch { /* unlock lasts for this page only */ } }
  return ok
}

export function SiteLock({ children }: { children: ReactNode }) {
  return <PasswordGate fullScreen unlocked={isUnlocked()} verify={verify} title="workMYwork" subtitle="Enter the password to open this website.">{children}</PasswordGate>
}
