/**
 * Thin client for the access-control and sharing functions in supabase/migrations/20261025000001_access_control.sql.
 * Every call is authorised again by the database; nothing here is trusted for security.
 */
import { supabase } from './supabase'
import { refreshAccess } from './access'
import type { FeatureKey } from '@/features/access/features'

const sb = () => {
  const c = supabase()
  if (!c) throw new Error('Accounts and sharing need the cloud backend, which is not configured on this installation.')
  return c
}
const unwrap = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export interface AdminUser { id: string; email: string; display_name: string | null; role: 'owner' | 'admin' | null; created_at: string }
export interface Permission { user_id: string; feature: FeatureKey; allowed: boolean; updated_at: string }
export interface AccessRequest { id: string; user_id: string; feature: FeatureKey; message: string; status: 'pending' | 'approved' | 'rejected'; created_at: string; decided_at: string | null }
export interface AuditRow { id: number; at: string; actor: string | null; target: string | null; feature: string | null; action: string; detail: string | null }
export type ShareTable = 'docs' | 'records' | 'projects' | 'tasks' | 'events' | 'datasets'
export interface Share {
  id: string; item_table: ShareTable; item_id: string; item_title: string; recipient_email: string | null; permission: 'viewer' | 'editor'
  expires_at: string | null; revoked_at: string | null; created_at: string; last_accessed_at: string | null; is_link: boolean
}
export interface SharedWithMe { id: string; item_table: ShareTable; item_title: string; permission: 'viewer' | 'editor'; expires_at: string | null; created_at: string; owner_name: string }
export interface SharedItem { table: ShareTable; title: string; permission: 'viewer' | 'editor'; expires_at: string | null; data: Record<string, unknown> }

export const accessApi = {
  async claimOwnership() { unwrap(await sb().rpc('claim_ownership')); await refreshAccess() },
  async users() { return unwrap<AdminUser[]>(await sb().rpc('admin_list_users')) },
  async permissions() { return unwrap<Permission[]>(await sb().from('feature_permissions').select('user_id,feature,allowed,updated_at')) },
  async setPermission(userId: string, feature: FeatureKey, allowed: boolean) { unwrap(await sb().rpc('set_feature_permission', { p_user: userId, p_feature: feature, p_allowed: allowed })) },
  async setRole(userId: string, role: 'admin' | null) { unwrap(await sb().rpc('set_user_role', { p_user: userId, p_role: role })) },
  async requestAccess(feature: FeatureKey, message = '') { unwrap(await sb().rpc('request_access', { p_feature: feature, p_message: message })) },
  async requests() { return unwrap<AccessRequest[]>(await sb().from('access_requests').select('id,user_id,feature,message,status,created_at,decided_at').order('created_at', { ascending: false }).limit(500)) },
  async decide(requestId: string, approve: boolean) { unwrap(await sb().rpc('decide_access_request', { p_request: requestId, p_approve: approve })) },
  async audit() { return unwrap<AuditRow[]>(await sb().from('permission_audit').select('id,at,actor,target,feature,action,detail').order('at', { ascending: false }).limit(300)) },

  async myShares(): Promise<Share[]> {
    const rows = unwrap<(Omit<Share, 'is_link'> & { recipient_email: string | null })[]>(await sb().from('shares')
      .select('id,item_table,item_id,item_title,recipient_email,permission,expires_at,revoked_at,created_at,last_accessed_at').order('created_at', { ascending: false }))
    return rows.map((r) => ({ ...r, is_link: !r.recipient_email }))
  },
  async createShare(table: ShareTable, itemId: string, recipientEmail: string | null, permission: 'viewer' | 'editor', expiresAt: string | null) {
    return unwrap<{ id: string; token: string | null }>(await sb().rpc('create_share', { p_table: table, p_item_id: itemId, p_recipient_email: recipientEmail, p_permission: permission, p_expires_at: expiresAt }))
  },
  async revokeShare(id: string) { unwrap(await sb().rpc('revoke_share', { p_share: id })) },
  async sharedWithMe() { return unwrap<SharedWithMe[]>(await sb().rpc('shared_with_me')) },
  async openShare(id: string) { return unwrap<SharedItem>(await sb().rpc('open_share', { p_share: id })) },
  async openLink(token: string) { return unwrap<SharedItem>(await sb().rpc('open_share_link', { p_token: token })) },
  async updateShared(id: string, data: Record<string, unknown>) { unwrap(await sb().rpc('update_shared_item', { p_share: id, p_data: data })) },
}

export type ShareStatus = 'active' | 'expired' | 'revoked'
export const shareStatus = (s: Pick<Share, 'revoked_at' | 'expires_at'>, now = Date.now()): ShareStatus =>
  s.revoked_at ? 'revoked' : s.expires_at && Date.parse(s.expires_at) <= now ? 'expired' : 'active'

/** Public link for a share token (works with the app's base path, e.g. GitHub Pages /my-work/). */
export const shareLink = (token: string) => `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/s/${encodeURIComponent(token)}`
