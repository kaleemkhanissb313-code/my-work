// @vitest-environment node
import { addUser, as, freshDb, type Db } from './harness'

const T1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const D1 = 'aaaaaaaa-0000-0000-0000-000000000002'
let db: Db, A: string, B: string
beforeAll(async () => {
  db = await freshDb()
  const O = await addUser(db, 9, 'owner@example.test')
  A = await addUser(db, 1, 'a@example.test')
  B = await addUser(db, 2, 'b@example.test')
  await db.query(`insert into public.app_config (key, value) values ('owner_email', 'owner@example.test')`)
  await as(db, O, (q) => q('select public.claim_ownership()'))
  for (const u of [A, B]) for (const f of ['tasks', 'documents']) await as(db, O, (q) => q('select public.set_feature_permission($1, $2, true)', [u, f]))
}, 60_000)

describe('per-user data isolation', () => {
  it('a user sees only their own rows; another user cannot read, change or delete them', async () => {
    await as(db, A, (q) => q(`insert into public.tasks (id, data, updated_at_ms) values ('${T1}', '{"title":"A private task"}', 1)`))
    await as(db, A, (q) => q(`insert into public.docs (id, data, updated_at_ms) values ('${D1}', '{"title":"A diary"}', 1)`))
    expect(await as(db, A, (q) => q('select id from public.tasks'))).toHaveLength(1)
    expect(await as(db, B, (q) => q('select id from public.tasks'))).toHaveLength(0)
    expect(await as(db, B, (q) => q(`select id from public.docs where id = '${D1}'`))).toHaveLength(0)
    await as(db, B, (q) => q(`update public.tasks set data = '{"title":"hacked"}' where id = '${T1}'`))
    await as(db, B, (q) => q(`delete from public.docs where id = '${D1}'`))
    expect(await as(db, A, (q) => q<{ t: string }>(`select data->>'title' as t from public.tasks where id = '${T1}'`))).toEqual([{ t: 'A private task' }])
    expect(await as(db, A, (q) => q('select id from public.docs'))).toHaveLength(1)
  })

  it('anonymous visitors (someone who only has the website URL) see nothing', async () => {
    expect(await as(db, null, (q) => q('select id from public.tasks'))).toHaveLength(0)
    expect(await as(db, null, (q) => q('select id from public.docs'))).toHaveLength(0)
  })
})
