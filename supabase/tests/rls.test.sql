-- pgTAP checks for Row Level Security. Run with: supabase test db
begin;
select plan(8);

-- Two users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

-- Act as user A and create a task
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.tasks (id, data, updated_at_ms) values ('10000000-0000-0000-0000-000000000001', '{"title":"A task"}', 1);
select is((select count(*)::int from public.tasks), 1, 'owner sees own task');
select is((select title from public.tasks limit 1), 'A task', 'generated title column populated');

-- Inserting a row for someone else must fail
select throws_ok(
  $$insert into public.tasks (id, user_id, data, updated_at_ms) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', '{}', 1)$$,
  '42501', null, 'cannot insert rows owned by another user');

-- Switch to user B
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.tasks), 0, 'other user cannot see A''s task');
update public.tasks set data = '{"title":"hacked"}' where id = '10000000-0000-0000-0000-000000000001';
delete from public.tasks where id = '10000000-0000-0000-0000-000000000001';

-- Back to A: row unchanged and present
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select title from public.tasks where id = '10000000-0000-0000-0000-000000000001'), 'A task', 'other user could not update or delete');

-- Ownership cannot be transferred by update
update public.tasks set user_id = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.tasks), 1, 'user_id is immutable');

-- Audit log is append-only
insert into public.audit_events (type, detail) values ('sign_in', 'test');
delete from public.audit_events;
select is((select count(*)::int from public.audit_events), 1, 'audit events cannot be deleted by the user');

-- Anonymous role sees nothing
set local role anon;
set local request.jwt.claims to '{}';
select is((select count(*)::int from public.tasks), 0, 'anon cannot read data');

select * from finish();
rollback;
