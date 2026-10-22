-- =====================================================================================================================
-- Access control: owner/admin roles, per-user feature permissions (default DENY), access requests, permission audit,
-- and per-item sharing (to a specific person by email, or by an unguessable view-only link).
--
-- Security model
--  * Everything is enforced here, in Postgres, not in the browser. The browser only has the public anon key.
--  * Roles live in public.app_roles, which has NO insert/update/delete policies: they can only change through the
--    SECURITY DEFINER functions below, which check the caller's role first. Users cannot grant themselves anything.
--  * Feature permissions are additionally enforced on every data table with RESTRICTIVE row-level-security policies
--    (they are AND-ed with the existing "owner only" policies), so a denied feature cannot be read or written even
--    by calling the API directly with a valid session.
--  * Shared items are only reachable through SECURITY DEFINER functions that validate the share on every call.
--  * Setup (once, in the Supabase SQL editor — never from the browser):
--        insert into public.app_config (key, value) values ('owner_email', 'you@example.com');
--    then sign in with that email in the app and choose "Claim ownership" (calls public.claim_ownership()).
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------- configuration
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
alter table public.app_config force row level security;
-- no policies: readable/writable only by the database owner / service role (SQL editor), never by app users.

-- ---------------------------------------------------------------------------------------------- roles
create table if not exists public.app_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);
create unique index if not exists app_roles_single_owner on public.app_roles (role) where role = 'owner';
alter table public.app_roles enable row level security;
alter table public.app_roles force row level security;

create or replace function public.is_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and exists (select 1 from public.app_roles r where r.user_id = uid)
$$;
create or replace function public.is_owner(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and exists (select 1 from public.app_roles r where r.user_id = uid and r.role = 'owner')
$$;

create policy "app_roles: self or admin read" on public.app_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------------------------- features
create table if not exists public.app_features (key text primary key, label text not null, sort int not null default 0);
alter table public.app_features enable row level security;
create policy "app_features: signed-in read" on public.app_features for select to authenticated using (true);
insert into public.app_features (key, label, sort) values
  ('life', 'My Life', 10), ('foods', 'Foods', 11), ('home', 'Home', 20), ('work', 'Work', 30), ('customize', 'Customize dashboard', 35),
  ('projects', 'Projects', 40), ('tasks', 'Tasks', 41), ('calendar', 'Calendar & timelines', 50), ('documents', 'Documents & notes', 60),
  ('media', 'Media library & files', 70), ('studio', 'Image Studio', 71), ('links', 'Links & bookmarks', 72), ('tools', 'Tools & calculator', 80),
  ('graphs', 'Graphs & reports', 90), ('finance', 'Finance', 100), ('glamiex', 'GLAMIEX Business', 110),
  ('security', 'Security Center', 120), ('vault', 'Private Vault', 121), ('sharing', 'Sharing', 130)
on conflict (key) do update set label = excluded.label, sort = excluded.sort;

-- Default DENY: a missing row means "not granted".
create table if not exists public.feature_permissions (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null references public.app_features (key) on delete cascade,
  allowed boolean not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);
alter table public.feature_permissions enable row level security;
alter table public.feature_permissions force row level security;
create policy "feature_permissions: self or admin read" on public.feature_permissions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
-- no write policies: changes only through set_feature_permission().

create or replace function public.has_feature(f text, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and (
    public.is_admin(uid)
    or exists (select 1 from public.feature_permissions p where p.user_id = uid and p.feature = f and p.allowed)
  )
$$;

-- ---------------------------------------------------------------------------------------------- audit
create table if not exists public.permission_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  target uuid references auth.users (id) on delete set null,
  feature text,
  action text not null,
  detail text check (char_length(detail) <= 500)
);
alter table public.permission_audit enable row level security;
alter table public.permission_audit force row level security;
create policy "permission_audit: admin read" on public.permission_audit for select to authenticated using (public.is_admin());

create or replace function public._audit(p_target uuid, p_feature text, p_action text, p_detail text) returns void
language sql security definer set search_path = '' as $$
  insert into public.permission_audit (actor, target, feature, action, detail) values (auth.uid(), p_target, p_feature, p_action, left(p_detail, 500))
$$;
revoke execute on function public._audit(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- ownership & roles
create or replace function public.claim_ownership() returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_cfg text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select value into v_cfg from public.app_config where key = 'owner_email';
  if v_cfg is null then raise exception 'The owner email has not been configured on the server.' using errcode = '42501'; end if;
  select email into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null or lower(v_email) <> lower(v_cfg) then raise exception 'Only the configured owner account can claim ownership.' using errcode = '42501'; end if;
  if exists (select 1 from public.app_roles where role = 'owner') then
    if public.is_owner() then return; end if;
    raise exception 'This website already has an owner.' using errcode = '42501';
  end if;
  insert into public.app_roles (user_id, role, granted_by) values (auth.uid(), 'owner', auth.uid())
    on conflict (user_id) do update set role = 'owner';
  perform public._audit(auth.uid(), null, 'claim_owner', 'Ownership claimed');
end $$;

create or replace function public.set_user_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can change roles.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role.' using errcode = '42501'; end if;
  if p_role is null then delete from public.app_roles where user_id = p_user and role = 'admin';
  elsif p_role = 'admin' then insert into public.app_roles (user_id, role, granted_by) values (p_user, 'admin', auth.uid()) on conflict (user_id) do nothing;
  else raise exception 'Unknown role.' using errcode = '22023'; end if;
  perform public._audit(p_user, null, 'set_role', coalesce(p_role, 'user'));
end $$;

-- ---------------------------------------------------------------------------------------------- permissions API
create or replace function public.set_feature_permission(p_user uuid, p_feature text, p_allowed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the owner or an administrator can manage permissions.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own permissions.' using errcode = '42501'; end if;
  if public.is_admin(p_user) and not public.is_owner() then raise exception 'Only the owner can change another administrator.' using errcode = '42501'; end if;
  if not exists (select 1 from public.app_features where key = p_feature) then raise exception 'Unknown feature.' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Unknown user.' using errcode = '22023'; end if;
  insert into public.feature_permissions (user_id, feature, allowed, updated_by, updated_at)
    values (p_user, p_feature, p_allowed, auth.uid(), now())
    on conflict (user_id, feature) do update set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now();
  -- Revoking also revokes the user's outgoing shares of that feature's items? No: shares are checked live (see below).
  update public.access_requests set status = case when p_allowed then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
    where user_id = p_user and feature = p_feature and status = 'pending';
  perform public._audit(p_user, p_feature, case when p_allowed then 'allow' else 'deny' end, null);
end $$;

-- ---------------------------------------------------------------------------------------------- access requests
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feature text not null references public.app_features (key) on delete cascade,
  message text not null default '' check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz
);
create unique index if not exists access_requests_one_pending on public.access_requests (user_id, feature) where status = 'pending';
alter table public.access_requests enable row level security;
alter table public.access_requests force row level security;
create policy "access_requests: self or admin read" on public.access_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
-- no direct writes: use request_access() / decide_access_request().

create or replace function public.request_access(p_feature text, p_message text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.app_features where key = p_feature) then raise exception 'Unknown feature.' using errcode = '22023'; end if;
  if public.has_feature(p_feature) then raise exception 'You already have access to this feature.' using errcode = '22023'; end if;
  if (select count(*) from public.access_requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many requests today. Please wait for the owner to respond.' using errcode = '54000';
  end if;
  select id into v_id from public.access_requests where user_id = auth.uid() and feature = p_feature and status = 'pending';
  if v_id is not null then return v_id; end if; -- one pending request per feature
  insert into public.access_requests (user_id, feature, message) values (auth.uid(), p_feature, left(coalesce(p_message, ''), 500)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.decide_access_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.access_requests;
begin
  if not public.is_admin() then raise exception 'Only the owner or an administrator can review requests.' using errcode = '42501'; end if;
  select * into r from public.access_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then raise exception 'This request is no longer pending.' using errcode = '22023'; end if;
  if p_approve then
    perform public.set_feature_permission(r.user_id, r.feature, true); -- also marks the request approved
  else
    update public.access_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_request;
    perform public._audit(r.user_id, r.feature, 'reject_request', null);
  end if;
end $$;

-- Admin view of users (email comes from auth.users, which the browser cannot read directly).
create or replace function public.admin_list_users() returns table (id uuid, email text, display_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the owner or an administrator can list users.' using errcode = '42501'; end if;
  return query select u.id, u.email::text, p.display_name, r.role, u.created_at
    from auth.users u left join public.profiles p on p.id = u.id left join public.app_roles r on r.user_id = u.id order by u.created_at;
end $$;

-- What the signed-in user may use (drives navigation; enforcement is the RLS below).
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', (select role from public.app_roles where user_id = auth.uid()),
    'features', coalesce((select jsonb_agg(f.key order by f.sort) from public.app_features f where public.has_feature(f.key)), '[]'::jsonb),
    'ownerConfigured', exists (select 1 from public.app_roles where role = 'owner')
  )
$$;

-- ---------------------------------------------------------------------------------------------- enforcement on data
-- Which feature a personal record belongs to.
create or replace function public.record_feature(data jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when data ->> 'collection' = 'foods' then 'foods'
    when data ->> 'collection' in ('chores', 'groceries', 'maintenance', 'bills', 'inventory', 'contacts') then 'home'
    when data ->> 'collection' in ('workspaces', 'meetings', 'invoices') then 'work'
    when data ->> 'collection' in ('expenses', 'budgets', 'income') then 'finance'
    else 'life'
  end
$$;

do $gate$
declare m record;
begin
  for m in select * from (values
    ('docs', 'documents'), ('folders', 'documents'), ('projects', 'projects'), ('tasks', 'tasks'), ('events', 'calendar'),
    ('media_files', 'media'), ('bookmarks', 'links'), ('timer_sessions', 'tools'), ('datasets', 'graphs'), ('habit_logs', 'life'),
    ('vault_items', 'vault'), ('palettes', 'tools'),
    ('gx_products', 'glamiex'), ('gx_stock_moves', 'glamiex'), ('gx_orders', 'glamiex'), ('gx_refunds', 'glamiex'), ('gx_people', 'glamiex'),
    ('gx_payments', 'glamiex'), ('gx_ad_income', 'glamiex'), ('gx_ad_spend', 'glamiex'), ('gx_expenses', 'glamiex'), ('gx_sheets', 'glamiex'),
    ('gx_returns', 'glamiex'), ('gx_shipments', 'glamiex'), ('gx_partners', 'glamiex'), ('gx_rider_payments', 'glamiex'),
    ('np_people', 'glamiex'), ('np_payments', 'glamiex'), ('bp_partners', 'glamiex'), ('bp_txns', 'glamiex'), ('pr_records', 'glamiex')
  ) as t(tbl, feature) loop
    if to_regclass('public.' || m.tbl) is not null then
      execute format('drop policy if exists %I on public.%I', m.tbl || ': feature gate', m.tbl);
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.has_feature(%L)) with check (public.has_feature(%L))',
        m.tbl || ': feature gate', m.tbl, m.feature, m.feature);
    end if;
  end loop;
end $gate$;
drop policy if exists "records: feature gate" on public.records;
create policy "records: feature gate" on public.records as restrictive for all to authenticated
  using (public.has_feature(public.record_feature(data))) with check (public.has_feature(public.record_feature(data)));
-- Private files follow the media feature too.
drop policy if exists "media: feature gate" on storage.objects;
create policy "media: feature gate" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'media' or public.has_feature('media')) with check (bucket_id <> 'media' or public.has_feature('media'));

-- Random bytes / hashing helpers (pgcrypto lives in "extensions" on Supabase and in "public" elsewhere).
create or replace function public.extensions_safe_random(n int) returns bytea language plpgsql volatile set search_path = '' as $$
begin
  begin return extensions.gen_random_bytes(n); exception when undefined_function or invalid_schema_name then return public.gen_random_bytes(n); end;
end $$;
create or replace function public.sha256_hex(t text) returns text language plpgsql immutable set search_path = '' as $$
begin
  begin return encode(extensions.digest(t, 'sha256'), 'hex'); exception when undefined_function or invalid_schema_name then return encode(public.digest(t, 'sha256'), 'hex'); end;
end $$;
revoke execute on function public.extensions_safe_random(int), public.sha256_hex(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- sharing
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_table text not null check (item_table in ('docs', 'records', 'projects', 'tasks', 'events', 'datasets')),
  item_id text not null,
  item_title text not null default '' check (char_length(item_title) <= 200),
  recipient_email text check (recipient_email = lower(recipient_email) and char_length(recipient_email) <= 320),
  token_hash text unique,
  permission text not null default 'viewer' check (permission in ('viewer', 'editor')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  constraint shares_one_target check ((recipient_email is null) <> (token_hash is null)),
  constraint shares_links_view_only check (token_hash is null or permission = 'viewer')
);
create index if not exists shares_owner_idx on public.shares (owner_id);
create index if not exists shares_recipient_idx on public.shares (recipient_email) where revoked_at is null;
alter table public.shares enable row level security;
alter table public.shares force row level security;
-- Owners see all their shares; recipients see active shares addressed to their confirmed email. token_hash is never
-- needed by the client (the plain token is shown once, at creation).
create policy "shares: owner read" on public.shares for select to authenticated using (owner_id = (select auth.uid()));
-- no direct writes: create_share() / revoke_share().

create or replace function public._my_confirmed_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null
$$;
revoke execute on function public._my_confirmed_email() from public, anon, authenticated;

create or replace function public._share_active(s public.shares) returns boolean
language sql stable set search_path = '' as $$
  select s.revoked_at is null and (s.expires_at is null or s.expires_at > now())
$$;

/** Fetches the shared row's data, only if it still exists and still belongs to the share's owner. */
create or replace function public._shared_row(s public.shares) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  execute format('select data from public.%I where id::text = $1 and user_id = $2 and deleted_at_ms is null', s.item_table) into v using s.item_id, s.owner_id;
  return v;
end $$;
revoke execute on function public._shared_row(public.shares) from public, anon, authenticated;

create or replace function public.create_share(p_table text, p_item_id text, p_recipient_email text, p_permission text default 'viewer', p_expires_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_token text; v_id uuid; v_email text := nullif(lower(trim(p_recipient_email)), '');
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.has_feature('sharing') then raise exception 'Sharing has not been enabled for your account.' using errcode = '42501'; end if;
  if p_table not in ('docs', 'records', 'projects', 'tasks', 'events', 'datasets') then raise exception 'This kind of item cannot be shared.' using errcode = '22023'; end if;
  if p_permission not in ('viewer', 'editor') then raise exception 'Unknown permission.' using errcode = '22023'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'The expiry date must be in the future.' using errcode = '22023'; end if;
  execute format($q$select coalesce(data ->> 'title', data ->> 'name', '') from public.%I where id::text = $1 and user_id = $2 and deleted_at_ms is null$q$, p_table)
    into v_title using p_item_id, auth.uid();
  if v_title is null then raise exception 'Item not found.' using errcode = '42501'; end if; -- also hides other users' items
  if v_email is not null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
    if v_email = public._my_confirmed_email() then raise exception 'You cannot share an item with yourself.' using errcode = '22023'; end if;
    insert into public.shares (item_table, item_id, item_title, recipient_email, permission, expires_at)
      values (p_table, p_item_id, left(v_title, 200), v_email, p_permission, p_expires_at) returning id into v_id;
  else
    if p_permission <> 'viewer' then raise exception 'Links are view-only. Share with a person to let them edit.' using errcode = '22023'; end if;
    v_token := translate(encode(public.extensions_safe_random(32), 'base64'), '+/=', '-_');
    insert into public.shares (item_table, item_id, item_title, token_hash, permission, expires_at)
      values (p_table, p_item_id, left(v_title, 200), public.sha256_hex(v_token), 'viewer', p_expires_at) returning id into v_id;
  end if;
  perform public._audit(auth.uid(), 'sharing', 'share', format('%s %s %s', p_table, p_item_id, coalesce(v_email, 'link')));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

create or replace function public.revoke_share(p_share uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shares set revoked_at = now() where id = p_share and owner_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'Share not found.' using errcode = '42501'; end if;
  perform public._audit(auth.uid(), 'sharing', 'revoke_share', p_share::text);
end $$;

create or replace function public.shared_with_me() returns table (id uuid, item_table text, item_title text, permission text, expires_at timestamptz, created_at timestamptz, owner_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.item_table, s.item_title, s.permission, s.expires_at, s.created_at, coalesce(nullif(p.display_name, ''), 'Someone')
  from public.shares s left join public.profiles p on p.id = s.owner_id
  where s.recipient_email = public._my_confirmed_email() and public._share_active(s)
  order by s.created_at desc
$$;

create or replace function public.open_share(p_share uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.shares; v jsonb;
begin
  select * into s from public.shares where id = p_share;
  if s.id is null or s.recipient_email is null or s.recipient_email is distinct from public._my_confirmed_email() or not public._share_active(s) then
    raise exception 'This item is not shared with you, or access was revoked.' using errcode = '42501';
  end if;
  v := public._shared_row(s);
  if v is null then raise exception 'This item no longer exists.' using errcode = '42501'; end if;
  update public.shares set last_accessed_at = now() where id = s.id;
  return jsonb_build_object('table', s.item_table, 'title', s.item_title, 'permission', s.permission, 'expires_at', s.expires_at, 'data', v);
end $$;

create or replace function public.open_share_link(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.shares; v jsonb;
begin
  if p_token is null or char_length(p_token) < 40 or char_length(p_token) > 64 then raise exception 'This link is invalid or has expired.' using errcode = '42501'; end if;
  select * into s from public.shares where token_hash = public.sha256_hex(p_token);
  if s.id is null or not public._share_active(s) then raise exception 'This link is invalid or has expired.' using errcode = '42501'; end if;
  v := public._shared_row(s);
  if v is null then raise exception 'This link is invalid or has expired.' using errcode = '42501'; end if;
  update public.shares set last_accessed_at = now() where id = s.id;
  return jsonb_build_object('table', s.item_table, 'title', s.item_title, 'permission', 'viewer', 'expires_at', s.expires_at, 'data', v);
end $$;

create or replace function public.update_shared_item(p_share uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.shares; n int;
begin
  select * into s from public.shares where id = p_share;
  if s.id is null or s.permission <> 'editor' or s.recipient_email is distinct from public._my_confirmed_email() or not public._share_active(s) then
    raise exception 'You do not have edit access to this item.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 2000000 then raise exception 'Invalid data.' using errcode = '22023'; end if;
  -- The editor may change content, never identity or ownership fields.
  execute format($q$update public.%I set data = $1 || jsonb_build_object('id', data -> 'id', 'deletedAt', data -> 'deletedAt'),
                    version = version + 1, updated_at_ms = (extract(epoch from clock_timestamp()) * 1000)::bigint
                  where id::text = $2 and user_id = $3 and deleted_at_ms is null$q$, s.item_table)
    using p_data, s.item_id, s.owner_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'This item no longer exists.' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------- function privileges
revoke execute on function public.claim_ownership(), public.set_user_role(uuid, text), public.set_feature_permission(uuid, text, boolean),
  public.request_access(text, text), public.decide_access_request(uuid, boolean), public.admin_list_users(), public.my_access(),
  public.create_share(text, text, text, text, timestamptz), public.revoke_share(uuid), public.shared_with_me(), public.open_share(uuid),
  public.update_shared_item(uuid, jsonb) from public, anon;
grant execute on function public.claim_ownership(), public.set_user_role(uuid, text), public.set_feature_permission(uuid, text, boolean),
  public.request_access(text, text), public.decide_access_request(uuid, boolean), public.admin_list_users(), public.my_access(),
  public.create_share(text, text, text, text, timestamptz), public.revoke_share(uuid), public.shared_with_me(), public.open_share(uuid),
  public.update_shared_item(uuid, jsonb) to authenticated;
-- Anyone holding a valid link may open it (the token is the credential).
grant execute on function public.open_share_link(text) to anon, authenticated;
