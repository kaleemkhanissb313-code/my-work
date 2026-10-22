/**
 * Keeps each account's data in its own on-device database, so two people using the same browser never see each
 * other's records. The first account that signs in on a device adopts the existing local data (the device owner's);
 * every other account — and the signed-out state after that — gets a separate database.
 */
export const DEFAULT_DB = 'basic-to-advanced'
const ACTIVE_KEY = 'b2a-active-user'
const OWNER_KEY = 'b2a-default-db-owner'

const read = (k: string) => { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* storage blocked: stays in default DB */ } }

/** Pure rule (unit-tested). */
export function dbNameFor(activeUser: string | null, defaultDbOwner: string | null): string {
  if (activeUser) return !defaultDbOwner || defaultDbOwner === activeUser ? DEFAULT_DB : `${DEFAULT_DB}__${activeUser}`
  return defaultDbOwner ? `${DEFAULT_DB}__guest` : DEFAULT_DB
}

/** Name of the database to open on this page load. */
export function currentDbName(): string {
  const active = read(ACTIVE_KEY)
  const owner = read(OWNER_KEY)
  if (active && !owner) write(OWNER_KEY, active) // first signed-in account adopts the existing local data
  return dbNameFor(active, owner ?? active)
}

/** Records the signed-in account. Returns true when the page must reload to open that account's database. */
export function switchAccount(userId: string | null): boolean {
  const prev = read(ACTIVE_KEY)
  if ((prev ?? null) === (userId ?? null)) return false
  write(ACTIVE_KEY, userId)
  return dbNameFor(prev, read(OWNER_KEY) ?? prev) !== dbNameFor(userId, read(OWNER_KEY) ?? userId)
}
