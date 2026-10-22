/**
 * Feature catalogue shared by navigation, page guards and sync. MUST match public.app_features and
 * public.record_feature() in supabase/migrations/20261025000001_access_control.sql (checked by a unit test).
 */
export type FeatureKey =
  | 'life' | 'foods' | 'home' | 'work' | 'customize' | 'projects' | 'tasks' | 'calendar' | 'documents' | 'media' | 'studio'
  | 'links' | 'tools' | 'graphs' | 'finance' | 'glamiex' | 'security' | 'vault' | 'sharing'

export const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: 'life', label: 'My Life' }, { key: 'foods', label: 'Foods' }, { key: 'home', label: 'Home' }, { key: 'work', label: 'Work' },
  { key: 'customize', label: 'Customize dashboard' }, { key: 'projects', label: 'Projects' }, { key: 'tasks', label: 'Tasks' },
  { key: 'calendar', label: 'Calendar & timelines' }, { key: 'documents', label: 'Documents & notes' }, { key: 'media', label: 'Media library & files' },
  { key: 'studio', label: 'Image Studio' }, { key: 'links', label: 'Links & bookmarks' }, { key: 'tools', label: 'Tools & calculator' },
  { key: 'graphs', label: 'Graphs & reports' }, { key: 'finance', label: 'Finance' }, { key: 'glamiex', label: 'GLAMIEX Business' },
  { key: 'security', label: 'Security Center' }, { key: 'vault', label: 'Private Vault' }, { key: 'sharing', label: 'Sharing' },
]
export const featureLabel = (k: FeatureKey) => FEATURES.find((f) => f.key === k)?.label ?? k

/** Path prefix → feature (most specific first). Paths not listed (dashboard, settings, access, privacy…) are always open to signed-in users. */
const PATHS: [string, FeatureKey][] = [
  ['/life/foods', 'foods'], ['/life', 'life'], ['/home', 'home'], ['/work', 'work'], ['/projects', 'projects'], ['/tasks', 'tasks'],
  ['/calendar', 'calendar'], ['/timelines', 'calendar'], ['/documents', 'documents'], ['/notes', 'documents'], ['/templates', 'documents'],
  ['/media', 'media'], ['/studio', 'studio'], ['/links', 'links'], ['/time', 'tools'], ['/calculator', 'tools'], ['/numbers', 'tools'],
  ['/colors', 'tools'], ['/text', 'tools'], ['/graphs', 'graphs'], ['/reports', 'graphs'], ['/finance', 'finance'], ['/glamiex', 'glamiex'],
  ['/security', 'security'], ['/vault', 'vault'],
]
export function featureForPath(path: string): FeatureKey | null {
  for (const [p, f] of PATHS) if (path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)) return f
  return null
}

/** Remote table → feature (records are per-collection, see recordFeature). */
export const TABLE_FEATURE: Record<string, FeatureKey | 'records'> = {
  docs: 'documents', folders: 'documents', projects: 'projects', tasks: 'tasks', events: 'calendar', media_files: 'media', bookmarks: 'links',
  timer_sessions: 'tools', datasets: 'graphs', habit_logs: 'life', vault_items: 'vault', palettes: 'tools', records: 'records',
}
export const tableFeature = (remote: string): FeatureKey | 'records' => TABLE_FEATURE[remote] ?? (/^(gx_|np_|bp_|pr_)/.test(remote) ? 'glamiex' : 'life')

export function recordFeature(collection: string | undefined): FeatureKey {
  if (collection === 'foods') return 'foods'
  if (['chores', 'groceries', 'maintenance', 'bills', 'inventory', 'contacts'].includes(collection ?? '')) return 'home'
  if (['workspaces', 'meetings', 'invoices'].includes(collection ?? '')) return 'work'
  if (['expenses', 'budgets', 'income'].includes(collection ?? '')) return 'finance'
  return 'life'
}

/** Kinds of items that can be shared (must match the allow-list in public.create_share). */
export const SHAREABLE: { table: 'docs' | 'records' | 'projects' | 'tasks' | 'events' | 'datasets'; label: string }[] = [
  { table: 'docs', label: 'Document / note' }, { table: 'records', label: 'Personal record (Foods, Goals…)' }, { table: 'projects', label: 'Project' },
  { table: 'tasks', label: 'Task' }, { table: 'events', label: 'Calendar event' }, { table: 'datasets', label: 'Dataset' },
]
