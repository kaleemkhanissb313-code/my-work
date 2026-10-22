/**
 * Automatic sync so a change on one device (e.g. phone) appears on the others (e.g. laptop) without pressing
 * "Sync now". Runs only when the cloud backend is configured and the user is signed in:
 *  - on start / sign-in, when the tab regains focus or the device comes back online,
 *  - every 2 minutes while the app is visible,
 *  - 5 seconds after any local change (debounced, so typing doesn't trigger a sync per keystroke).
 */
import { db, entityTables } from '@/lib/db'
import { cloudConfigured } from './supabase'
import { authState } from './auth'
import { syncNow, syncState } from './sync'

let started = false
let timer: ReturnType<typeof setTimeout> | null = null

async function run() {
  if (!authState.get().session || syncState.get().running || !navigator.onLine) return
  try { await syncNow() } catch { /* error is shown in Settings → Cloud sync; next trigger retries */ }
}
function soon(ms = 5000) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void run() }, ms)
}

export function startAutoSync() {
  if (!cloudConfigured || started) return
  started = true
  // Local writes mark rows dirty (syncedAt = null); schedule a push. Writes made BY sync set syncedAt, so they don't loop.
  for (const name of entityTables) {
    const t = db.table(name)
    t.hook('creating', (_k, obj: { syncedAt?: number | null }) => { if (obj?.syncedAt == null) soon() })
    t.hook('updating', (mods: { syncedAt?: number | null }) => { if (!('syncedAt' in mods) || mods.syncedAt == null) soon() })
    t.hook('deleting', () => { soon() })
  }
  authState.subscribe(() => { if (authState.get().session) soon(500) })
  window.addEventListener('focus', () => soon(500))
  window.addEventListener('online', () => soon(500))
  setInterval(() => { if (document.visibilityState === 'visible') void run() }, 120_000)
  soon(1000)
}
