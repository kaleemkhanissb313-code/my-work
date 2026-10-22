import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { KeyRound, LogIn, ShieldAlert } from 'lucide-react'
import { Button, EmptyState, Spinner } from '@/components/ui'
import { toast } from '@/components/feedback'
import { cloudConfigured } from '@/services/supabase'
import { authState } from '@/services/auth'
import { can, isAdmin, useAccess } from '@/services/access'
import { accessApi, type AccessRequest } from '@/services/accessApi'
import { featureForPath, featureLabel, type FeatureKey } from './features'

/** Pages anyone may open on a cloud installation without signing in. */
const PUBLIC = [/^\/auth(\/|$)/, /^\/s\//]

/**
 * Shows the page only when the signed-in user may use its feature. This is a convenience for the interface — the
 * database independently refuses every read and write for features that are not granted.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { session, ready } = authState.use()
  const access = useAccess()
  if (!cloudConfigured || PUBLIC.some((r) => r.test(pathname))) return <>{children}</>
  if (!ready || (session && access.loading)) return <Spinner label="Checking access" />
  if (!session) return (
    <EmptyState icon={LogIn} title="Sign in to continue" action={<Link to={`/auth?next=${encodeURIComponent(pathname)}`} className="btn btn-3d h-10 px-4 text-sm"><LogIn className="h-4 w-4" aria-hidden />Sign in</Link>}>
      Your workspace is private. Sign in with your account to open it.
    </EmptyState>
  )
  if (access.error) return <EmptyState icon={ShieldAlert} title="Permissions unavailable">{access.error}</EmptyState>
  const feature = featureForPath(pathname)
  if (!access.ownerConfigured && !pathname.startsWith('/access')) return (
    <EmptyState icon={KeyRound} title="Setup not finished" action={<Link to="/access" className="btn btn-soft h-10 px-4 text-sm">Open Access Control</Link>}>
      The website owner has not claimed ownership yet, so no features are available. If you are the owner, open Access Control to finish setup.
    </EmptyState>
  )
  if (!can(feature, access)) return <NoAccess feature={feature!} />
  return <>{children}</>
}

export function NoAccess({ feature }: { feature: FeatureKey }) {
  const access = useAccess()
  const [busy, setBusy] = useState(false)
  const [mine, setMine] = useState<AccessRequest[] | null>(null)
  const load = () => accessApi.requests().then(setMine).catch(() => setMine([]))
  useEffect(() => { void load() }, [feature])
  const pending = mine?.find((r) => r.feature === feature && r.status === 'pending')
  const rejected = mine?.find((r) => r.feature === feature && r.status === 'rejected')
  const request = async () => {
    setBusy(true)
    try { await accessApi.requestAccess(feature); toast('Request sent to the website owner'); await load() } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <EmptyState icon={ShieldAlert} title={featureLabel(feature)}
      action={isAdmin(access) ? undefined : pending ? <p className="text-sm text-muted" role="status">Request sent {new Date(pending.created_at).toLocaleDateString()} — waiting for the owner.</p>
        : <Button variant="primary" icon={KeyRound} loading={busy} onClick={() => void request()}>Request access</Button>}>
      Access to this feature has not been granted. Please request permission from the website owner.
      {rejected && !pending && <span className="mt-1 block text-xs">Your last request was declined; you can ask again.</span>}
    </EmptyState>
  )
}

/** Hides a control the user may not use (interface only — enforcement is in the database). */
export function IfFeature({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const access = useAccess()
  return can(feature, access) ? <>{children}</> : null
}
