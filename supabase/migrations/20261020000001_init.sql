-- Basic to Advanced — initial schema
-- Every user-owned table is protected by Row Level Security: a user can only read and write rows whose
-- user_id = auth.uid(). The browser only ever holds the public anon key; the service-role key is never used client-side.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: owner read"   on public.profiles for select using (id = (select auth.uid()));
create policy "profiles: owner update" on public.profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Shared trigger: server-side change cursor + immutable ownership
-- ---------------------------------------------------------------------------
create or replace function public.touch_sync_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;          -- ownership can never be transferred by an update
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Entity tables (local-first sync). The client stores its canonical record in `data` (jsonb);
-- typed generated columns expose frequently-queried fields for indexing and reporting.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'docs','folders','projects','tasks','events','media_files','bookmarks','timer_sessions',
    'datasets','records','habit_logs','vault_items','palettes'
  ] loop
    execute format($f$
      create table if not exists public.%1$I (
        id uuid primary key,
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 2000000),
        version integer not null default 1 check (version > 0),
        updated_at_ms bigint not null,
        deleted_at_ms bigint,
        created_at timestamptz not null default now(),
        server_updated_at timestamptz not null default clock_timestamp()
      );
      create index if not exists %1$s_user_cursor_idx on public.%1$I (user_id, server_updated_at);
      alter table public.%1$I enable row level security;
      alter table public.%1$I force row level security;
      create policy "%1$s: owner select" on public.%1$I for select using (user_id = (select auth.uid()));
      create policy "%1$s: owner insert" on public.%1$I for insert with check (user_id = (select auth.uid()));
      create policy "%1$s: owner update" on public.%1$I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
      create policy "%1$s: owner delete" on public.%1$I for delete using (user_id = (select auth.uid()));
      drop trigger if exists %1$s_touch on public.%1$I;
      create trigger %1$s_touch before insert or update on public.%1$I for each row execute function public.touch_sync_row();
    $f$, t);
  end loop;
end $$;

-- Typed projections (generated, read-only)
alter table public.docs       add column if not exists title text generated always as (data ->> 'title') stored,
                              add column if not exists kind text generated always as (data ->> 'kind') stored,
                              add column if not exists area text generated always as (data ->> 'area') stored;
alter table public.projects   add column if not exists name text generated always as (data ->> 'name') stored,
                              add column if not exists status text generated always as (data ->> 'status') stored,
                              add column if not exists deadline text generated always as (data ->> 'deadline') stored;
alter table public.tasks      add column if not exists title text generated always as (data ->> 'title') stored,
                              add column if not exists status text generated always as (data ->> 'status') stored,
                              add column if not exists due_date text generated always as (data ->> 'dueDate') stored,
                              add column if not exists project_id text generated always as (data ->> 'projectId') stored,
                              add column if not exists area text generated always as (data ->> 'area') stored;
alter table public.events     add column if not exists title text generated always as (data ->> 'title') stored,
                              add column if not exists starts_at text generated always as (data ->> 'start') stored;
alter table public.records    add column if not exists collection text generated always as (data ->> 'collection') stored,
                              add column if not exists area text generated always as (data ->> 'area') stored,
                              add column if not exists due_date text generated always as (data ->> 'dueDate') stored;
alter table public.media_files add column if not exists name text generated always as (data ->> 'name') stored,
                              add column if not exists mime text generated always as (data ->> 'mime') stored;
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists records_user_collection_idx on public.records (user_id, collection);

comment on table public.vault_items is 'Client-side encrypted (AES-256-GCM). data contains only {ciphertext, iv, …metadata}; the server never sees plaintext or keys.';

-- ---------------------------------------------------------------------------
-- Preferences & audit
-- ---------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 100000),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
create policy "prefs: owner all" on public.user_preferences for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Append-only security audit trail (users can add and read their own events, never edit or delete them).
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (char_length(type) <= 40),
  detail text not null default '' check (char_length(detail) <= 300),
  at timestamptz not null default now()
);
create index if not exists audit_user_at_idx on public.audit_events (user_id, at desc);
alter table public.audit_events enable row level security;
create policy "audit: owner insert" on public.audit_events for insert with check (user_id = (select auth.uid()));
create policy "audit: owner select" on public.audit_events for select using (user_id = (select auth.uid()));

-- AI usage log used by the `ai` edge function for per-user rate limiting.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task text not null,
  at timestamptz not null default now()
);
create index if not exists ai_usage_user_at_idx on public.ai_usage (user_id, at desc);
alter table public.ai_usage enable row level security;
create policy "ai_usage: owner insert" on public.ai_usage for insert with check (user_id = (select auth.uid()));
create policy "ai_usage: owner select" on public.ai_usage for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private file storage: objects live at media/<user_id>/<file_id>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "media: owner read"   on storage.objects for select using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: owner insert" on storage.objects for insert with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: owner update" on storage.objects for update using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: owner delete" on storage.objects for delete using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
