import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase is optional. Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app runs fully local
 * (IndexedDB) and cloud features show a clear "not configured" state.
 * Only the public anon key is ever used in the browser; authorization is enforced by Row Level Security.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudConfigured = Boolean(url && anon)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured) return null
  client ??= createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

/** Map Supabase auth errors to messages that don't reveal whether an account exists. */
export function friendlyAuthError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? ''
  if (/invalid login|invalid credentials/i.test(msg)) return 'Email or password is incorrect.'
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a moment and try again.'
  if (/password/i.test(msg) && /short|weak|least/i.test(msg)) return 'Password does not meet the requirements (min 8 characters).'
  if (/network|fetch/i.test(msg)) return 'Network error — check your connection.'
  return 'Something went wrong. Please try again.'
}
