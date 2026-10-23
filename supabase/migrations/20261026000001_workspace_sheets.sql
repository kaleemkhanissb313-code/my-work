-- Personal workspace spreadsheets (/sheets). Same owner-only RLS pattern as gx_sheets, gated by the "documents" feature.
create table if not exists public.ws_sheets (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 5000000),
  version integer not null default 1 check (version > 0),
  updated_at_ms bigint not null,
  deleted_at_ms bigint,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists ws_sheets_user_cursor_idx on public.ws_sheets (user_id, server_updated_at);
alter table public.ws_sheets enable row level security;
alter table public.ws_sheets force row level security;
drop policy if exists "ws_sheets: owner all" on public.ws_sheets;
create policy "ws_sheets: owner all" on public.ws_sheets for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "ws_sheets: feature gate" on public.ws_sheets;
create policy "ws_sheets: feature gate" on public.ws_sheets as restrictive for all to authenticated
  using (public.has_feature('documents')) with check (public.has_feature('documents'));
drop trigger if exists ws_sheets_touch on public.ws_sheets;
create trigger ws_sheets_touch before insert or update on public.ws_sheets for each row execute function public.touch_sync_row();
