import type { Session } from '@supabase/supabase-js'
import { createStore } from '@/lib/store'
import { cloudConfigured, friendlyAuthError, supabase } from './supabase'
import { audit } from './audit'
import { switchAccount } from '@/lib/accountScope'

export const authState = createStore<{ session: Session | null; ready: boolean }>({ session: null, ready: !cloudConfigured })

export function initAuth() {
  const sb = supabase()
  if (!sb) return
  // Switching accounts reopens the app on that account's own local database (never another account's data).
  const apply = (session: Session | null) => {
    if (switchAccount(session?.user.id ?? null)) { location.reload(); return }
    authState.set({ session, ready: true })
  }
  sb.auth.getSession().then(({ data }) => apply(data.session))
  sb.auth.onAuthStateChange((_evt, session) => apply(session))
}

const need = () => {
  const sb = supabase()
  if (!sb) throw new Error('Cloud accounts are not configured on this installation.')
  return sb
}

const wrap = async (fn: () => Promise<{ error: unknown }>) => {
  const { error } = await fn()
  if (error) throw new Error(friendlyAuthError(error))
}

export const auth = {
  async signIn(email: string, password: string) {
    await wrap(() => need().auth.signInWithPassword({ email, password }))
    await audit('sign_in', 'Signed in')
  },
  async signUp(email: string, password: string, displayName: string) {
    if (password.length < 8) throw new Error('Use at least 8 characters for your password.')
    return wrap(() => need().auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: location.origin } }))
  },
  /** Always reports success to avoid revealing whether an email is registered. */
  async resetPassword(email: string) {
    await need().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth?mode=update` })
  },
  async updatePassword(password: string) {
    if (password.length < 8) throw new Error('Use at least 8 characters for your password.')
    await wrap(() => need().auth.updateUser({ password }))
  },
  async signOut(scope: 'local' | 'global' = 'local') {
    await need().auth.signOut({ scope })
    await audit('sign_out', scope === 'global' ? 'Signed out of all sessions' : 'Signed out')
  },
}
