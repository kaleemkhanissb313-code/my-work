/**
 * What the current user may use. This only drives the interface (navigation, page messages); the database enforces
 * the same rules with row-level security, so hiding something here is never the only protection.
 *  - Local-only installation (no Supabase): single user on their own device → everything is available.
 *  - Cloud installation: permissions come from public.my_access(); signed-out visitors must sign in.
 */
import { createStore } from '@/lib/store'
import { cloudConfigured, supabase } from './supabase'
import { authState } from './auth'
import { FEATURES, type FeatureKey } from '@/features/access/features'

export type Role = 'owner' | 'admin' | null
export interface AccessState { loading: boolean; role: Role; features: Set<FeatureKey>; ownerConfigured: boolean; error: string | null; signedIn: boolean }

const ALL = new Set(FEATURES.map((f) => f.key))
export const accessState = createStore<AccessState>(
  cloudConfigured
    ? { loading: true, role: null, features: new Set(), ownerConfigured: true, error: null, signedIn: false }
    : { loading: false, role: 'owner', features: ALL, ownerConfigured: true, error: null, signedIn: false },
)

export async function refreshAccess() {
  const sb = supabase()
  if (!sb) return
  const session = authState.get().session
  if (!session) { accessState.set({ loading: false, role: null, features: new Set(), ownerConfigured: true, error: null, signedIn: false }); return }
  const { data, error } = await sb.rpc('my_access')
  if (error) {
    accessState.set({ loading: false, role: null, features: new Set(), ownerConfigured: true, signedIn: true,
      error: /function|does not exist|schema cache/i.test(error.message) ? 'Access control is not set up on the server yet (apply the latest database migration).' : 'Could not load your permissions. Check your connection and try again.' })
    return
  }
  const a = data as { role: Role; features: FeatureKey[]; ownerConfigured: boolean }
  accessState.set({ loading: false, role: a.role, features: new Set(a.features), ownerConfigured: a.ownerConfigured, error: null, signedIn: true })
}

let started = false
export function initAccess() {
  if (!cloudConfigured || started) return
  started = true
  authState.subscribe(() => void refreshAccess())
  void refreshAccess()
  // Permission changes made by the owner apply without a reload: refresh on focus and every minute.
  window.addEventListener('focus', () => void refreshAccess())
  setInterval(() => { if (document.visibilityState === 'visible') void refreshAccess() }, 60_000)
}

export const can = (f: FeatureKey | null, s: AccessState = accessState.get()) => f == null || s.features.has(f)
export const isAdmin = (s: AccessState = accessState.get()) => s.role === 'owner' || s.role === 'admin'
export const useAccess = () => accessState.use()
