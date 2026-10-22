// @vitest-environment node
/**
 * Two-user security tests for feature permissions, access requests, roles and sharing — executed against the real
 * migrations on Postgres (PGlite), with every query running AS the user under test (RLS enforced).
 */
import { addUser, as, denied, freshDb, type Db } from './harness'

const FOOD = 'f0000000-0000-0000-0000-000000000001'
const DOC = 'd0000000-0000-0000-0000-000000000001'
let db: Db, O: string, A: string, B: string, C: string
const owner = <T>(fn: Parameters<typeof as<T>>[2]) => as(db, O, fn)
const asA = <T>(fn: Parameters<typeof as<T>>[2]) => as(db, A, fn)
const asB = <T>(fn: Parameters<typeof as<T>>[2]) => as(db, B, fn)
const allow = (u: string, f: string, v = true) => owner((q) => q('select public.set_feature_permission($1, $2, $3)', [u, f, v]))
const foodsOf = (u: string) => as(db, u, (q) => q<{ id: string }>(`select id from public.records where data->>'collection' = 'foods'`))

beforeAll(async () => {
  db = await freshDb()
  O = await addUser(db, 9, 'owner@example.test')
  A = await addUser(db, 1, 'a@example.test')
  B = await addUser(db, 2, 'b@example.test')
  C = await addUser(db, 3, 'c@example.test')
  await db.query(`insert into public.app_config (key, value) values ('owner_email', 'owner@example.test')`)
}, 60_000)

describe('ownership', () => {
  it('only the configured owner email can claim ownership, and only once', async () => {
    expect(await denied(asA((q) => q('select public.claim_ownership()')))).toMatch(/configured owner/)
    await owner((q) => q('select public.claim_ownership()'))
    await owner((q) => q('select public.claim_ownership()')) // idempotent for the owner
    expect(await owner((q) => q<{ a: { role: string } }>('select public.my_access() as a'))).toMatchObject([{ a: { role: 'owner' } }])
  })

  it('ordinary users cannot grant themselves roles or permissions, through any path', async () => {
    expect(await denied(asA((q) => q(`insert into public.app_roles (user_id, role) values ($1, 'admin')`, [A])))).toMatch(/row-level security|permission/)
    expect(await denied(asA((q) => q(`insert into public.feature_permissions (user_id, feature, allowed) values ($1, 'foods', true)`, [A])))).toMatch(/row-level security|permission/)
    expect(await denied(asA((q) => q('select public.set_feature_permission($1, $2, true)', [A, 'foods'])))).toMatch(/owner or an administrator/)
    expect(await denied(asA((q) => q(`select public.set_user_role($1, 'admin')`, [A])))).toMatch(/Only the owner/)
    await asA((q) => q(`update public.feature_permissions set allowed = true where user_id = $1`, [A])) // silently affects 0 rows
    expect(await asA((q) => q<{ a: { features: string[] } }>('select public.my_access() as a'))).toMatchObject([{ a: { features: [] } }])
    expect(await denied(asA((q) => q('select public.admin_list_users()')))).toMatch(/Only the owner/)
  })
})

describe('feature permissions (default deny, enforced in the database)', () => {
  it('User A allowed Foods can use it; User B denied cannot read or write it even via direct API calls', async () => {
    await allow(A, 'foods')
    await allow(B, 'foods', false)
    await asA((q) => q(`insert into public.records (id, data, updated_at_ms) values ($1, '{"collection":"foods","title":"Biryani"}', 1)`, [FOOD]))
    expect(await foodsOf(A)).toHaveLength(1)
    // B: cannot create Foods records at all (direct table insert = what a hand-crafted API request does)
    expect(await denied(asB((q) => q(`insert into public.records (id, data, updated_at_ms) values (gen_random_uuid(), '{"collection":"foods","title":"x"}', 1)`)))).toMatch(/row-level security/)
    // …and cannot see A's record by id, nor by changing the request parameters
    expect(await asB((q) => q('select id from public.records where id = $1', [FOOD]))).toHaveLength(0)
    expect(await foodsOf(B)).toHaveLength(0)
  })

  it('features are independent: B can be allowed My Life while still denied Foods', async () => {
    await allow(B, 'life')
    await asB((q) => q(`insert into public.records (id, data, updated_at_ms) values (gen_random_uuid(), '{"collection":"goals","title":"Run 5k"}', 1)`))
    expect(await denied(asB((q) => q(`insert into public.records (id, data, updated_at_ms) values (gen_random_uuid(), '{"collection":"foods","title":"x"}', 1)`)))).toMatch(/row-level security/)
    // B also cannot smuggle a Foods record in by editing a My Life record's collection
    expect(await denied(asB((q) => q(`update public.records set data = data || '{"collection":"foods"}'`)))).toMatch(/row-level security/)
  })

  it('revoking A’s permission blocks A immediately (reads and writes), and re-allowing restores the same data', async () => {
    await allow(A, 'foods', false)
    expect(await foodsOf(A)).toHaveLength(0)
    // Rows hidden by RLS are skipped by UPDATE (0 rows) rather than raising; the title check below proves nothing changed.
    await asA((q) => q(`update public.records set data = data || '{"title":"changed while revoked"}' where id = $1`, [FOOD]))
    expect(await denied(asA((q) => q(`insert into public.records (id, data, updated_at_ms) values (gen_random_uuid(), '{"collection":"foods","title":"x"}', 1)`)))).toMatch(/row-level security/)
    await allow(A, 'foods', true)
    expect(await asA((q) => q<{ t: string }>(`select data->>'title' as t from public.records where id = $1`, [FOOD]))).toEqual([{ t: 'Biryani' }])
  })

  it('a user with no permissions at all (new account) gets nothing', async () => {
    expect(await as(db, C, (q) => q<{ a: { features: string[]; role: null } }>('select public.my_access() as a'))).toMatchObject([{ a: { features: [], role: null } }])
    expect(await denied(as(db, C, (q) => q(`insert into public.docs (id, data, updated_at_ms) values (gen_random_uuid(), '{}', 1)`)))).toMatch(/row-level security/)
  })
})

describe('access requests', () => {
  it('a request never grants access by itself; the owner approves or rejects; users cannot approve their own', async () => {
    const [{ id }] = await as(db, C, (q) => q<{ id: string }>(`select public.request_access('documents', 'Please') as id`))
    const [{ id: again }] = await as(db, C, (q) => q<{ id: string }>(`select public.request_access('documents') as id`))
    expect(again).toBe(id) // one pending request per feature
    expect(await as(db, C, (q) => q<{ a: { features: string[] } }>('select public.my_access() as a'))).toMatchObject([{ a: { features: [] } }])
    expect(await denied(as(db, C, (q) => q('select public.decide_access_request($1, true)', [id])))).toMatch(/owner or an administrator/)
    // Direct table writes are not allowed: the update affects nothing and the request stays pending.
    await as(db, C, (q) => q(`update public.access_requests set status = 'approved' where id = $1`, [id]))
    expect(await as(db, C, (q) => q<{ status: string }>('select status from public.access_requests where id = $1', [id]))).toEqual([{ status: 'pending' }])
    // other users cannot see C's requests
    expect(await asB((q) => q('select id from public.access_requests'))).toHaveLength(0)
    await owner((q) => q('select public.decide_access_request($1, true)', [id]))
    expect(await as(db, C, (q) => q<{ a: { features: string[] } }>('select public.my_access() as a'))).toMatchObject([{ a: { features: ['documents'] } }])
    expect(await owner((q) => q<{ status: string }>('select status from public.access_requests where id = $1', [id]))).toEqual([{ status: 'approved' }])
    // revoke after approval
    await allow(C, 'documents', false)
    expect(await as(db, C, (q) => q<{ a: { features: string[] } }>('select public.my_access() as a'))).toMatchObject([{ a: { features: [] } }])
  })

  it('every permission change is in the audit log, readable only by admins', async () => {
    const rows = await owner((q) => q<{ action: string }>('select action from public.permission_audit'))
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['claim_owner', 'allow', 'deny']))
    expect(await asA((q) => q('select id from public.permission_audit'))).toHaveLength(0)
  })
})

describe('sharing', () => {
  beforeAll(async () => {
    for (const f of ['documents', 'sharing']) await allow(A, f)
    await asA((q) => q(`insert into public.docs (id, data, updated_at_ms) values ($1, '{"title":"Trip plan","body":"secret"}', 1)`, [DOC]))
  })

  it('cannot share without the Sharing permission, or share someone else’s item', async () => {
    await allow(B, 'documents')
    expect(await denied(asB((q) => q(`select public.create_share('docs', $1, 'c@example.test', 'viewer')`, [DOC])))).toMatch(/Sharing has not been enabled/)
    await allow(B, 'sharing')
    expect(await denied(asB((q) => q(`select public.create_share('docs', $1, 'c@example.test', 'viewer')`, [DOC])))).toMatch(/Item not found/)
  })

  it('a person share exposes exactly one item to exactly that person, until revoked', async () => {
    const [{ s }] = await asA((q) => q<{ s: { id: string } }>(`select public.create_share('docs', $1, 'B@Example.test', 'viewer') as s`, [DOC]))
    // B sees it in "shared with me" and can open it (B has no access to A's docs table rows otherwise)
    expect(await asB((q) => q<{ item_title: string }>('select item_title from public.shared_with_me()'))).toEqual([{ item_title: 'Trip plan' }])
    expect(await asB((q) => q<{ d: { data: { body: string } } }>('select public.open_share($1) as d', [s.id]))).toMatchObject([{ d: { data: { body: 'secret' } } }])
    expect(await asB((q) => q('select id from public.docs where id = $1', [DOC]))).toHaveLength(0) // the account is not exposed
    // C (not the recipient) cannot open it by guessing/changing the share id
    expect(await denied(as(db, C, (q) => q('select public.open_share($1)', [s.id])))).toMatch(/not shared with you/)
    // viewer cannot edit
    expect(await denied(asB((q) => q(`select public.update_shared_item($1, '{"title":"x"}')`, [s.id])))).toMatch(/edit access/)
    // revoke → immediately gone
    await asA((q) => q('select public.revoke_share($1)', [s.id]))
    expect(await denied(asB((q) => q('select public.open_share($1)', [s.id])))).toMatch(/revoked/)
    expect(await asB((q) => q('select id from public.shared_with_me()'))).toHaveLength(0)
    // only the owner can revoke
    expect(await denied(asB((q) => q('select public.revoke_share($1)', [s.id])))).toMatch(/not found/)
  })

  it('an editor share lets the recipient edit content but never ownership or identity', async () => {
    const [{ s }] = await asA((q) => q<{ s: { id: string } }>(`select public.create_share('docs', $1, 'b@example.test', 'editor') as s`, [DOC]))
    await asB((q) => q(`select public.update_shared_item($1, '{"title":"Trip plan v2","id":"evil","deletedAt":1}')`, [s.id]))
    expect(await asA((q) => q<{ t: string; i: unknown; d: unknown; u: string }>(`select data->>'title' as t, data->'id' as i, data->'deletedAt' as d, user_id::text as u from public.docs where id = $1`, [DOC])))
      .toEqual([{ t: 'Trip plan v2', i: null, d: null, u: A }])
    await asA((q) => q('select public.revoke_share($1)', [s.id]))
  })

  it('links are view-only, unguessable, expire, and stop working the moment they are revoked', async () => {
    const [{ s }] = await asA((q) => q<{ s: { id: string; token: string } }>(`select public.create_share('docs', $1, null, 'viewer') as s`, [DOC]))
    expect(s.token).toMatch(/^[A-Za-z0-9_-]{43,44}$/)
    // anonymous visitor with the link can view just that item
    expect(await as(db, null, (q) => q<{ d: { title: string } }>('select public.open_share_link($1) as d', [s.token]))).toMatchObject([{ d: { title: 'Trip plan v2' } }])
    // the token is stored only as a hash
    expect(await asA((q) => q<{ n: number }>(`select count(*)::int as n from public.shares where token_hash = $1`, [s.token]))).toEqual([{ n: 0 }])
    // guessed / altered tokens fail with the same generic message
    expect(await denied(as(db, null, (q) => q('select public.open_share_link($1)', [s.token.slice(0, -1) + (s.token.endsWith('A') ? 'B' : 'A')])))).toMatch(/invalid or has expired/)
    expect(await denied(as(db, null, (q) => q('select public.open_share_link($1)', ['x'])))).toMatch(/invalid or has expired/)
    // anonymous visitors still cannot read the table directly
    expect(await as(db, null, (q) => q('select id from public.docs'))).toHaveLength(0)
    expect(await denied(asA((q) => q(`select public.create_share('docs', $1, null, 'editor')`, [DOC])))).toMatch(/view-only/)
    await asA((q) => q('select public.revoke_share($1)', [s.id]))
    expect(await denied(as(db, null, (q) => q('select public.open_share_link($1)', [s.token])))).toMatch(/invalid or has expired/)
  })

  it('expired links and shares stop working', async () => {
    const [{ s }] = await asA((q) => q<{ s: { id: string; token: string } }>(`select public.create_share('docs', $1, null, 'viewer', now() + interval '1 hour') as s`, [DOC]))
    await db.query(`update public.shares set expires_at = now() - interval '1 minute' where id = $1`, [s.id]) // time passes
    expect(await denied(as(db, null, (q) => q('select public.open_share_link($1)', [s.token])))).toMatch(/invalid or has expired/)
    expect(await denied(asA((q) => q(`select public.create_share('docs', $1, null, 'viewer', now() - interval '1 day')`, [DOC])))).toMatch(/future/)
  })

  it('users only see their own shares; share rows cannot be written directly', async () => {
    expect(await asB((q) => q('select id from public.shares'))).toHaveLength(0)
    expect(await denied(asB((q) => q(`insert into public.shares (item_table, item_id, recipient_email) values ('docs', $1, 'b@example.test')`, [DOC])))).toMatch(/row-level security/)
    await asB((q) => q(`update public.shares set revoked_at = null`)) // no effect
    // every share A made is revoked or expired; B's attempt to "un-revoke" changed nothing
    expect(await asA((q) => q<{ n: number }>('select count(*)::int as n from public.shares where revoked_at is null and (expires_at is null or expires_at > now())'))).toEqual([{ n: 0 }])
    expect(await asA((q) => q<{ n: number }>('select count(*)::int as n from public.shares where revoked_at is not null'))).toEqual([{ n: 3 }])
  })
})
