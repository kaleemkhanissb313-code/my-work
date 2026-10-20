-- GLAMIEX business partners: partner profiles and the investment / profit-loss / settlement ledger.
-- Same local-first sync shape and RLS as 20261021000001_glamiex.sql. Money inside `data` is integer PAISA.

do $$
declare t text;
begin
  foreach t in array array['bp_partners','bp_txns'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id text primary key,
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
      drop trigger if exists %1$s_touch on public.%1$I;
      create trigger %1$s_touch before insert or update on public.%1$I for each row execute function public.touch_sync_row();
    $f$, t);
  end loop;
end $$;

-- No delete policy on either table: partners are permanent and ledger entries are corrected with reversal entries.

-- Server-side duplicate protection and validation (per user)
alter table public.bp_txns add column if not exists txn_no text generated always as (data ->> 'txnNo') stored,
                           add column if not exists amount_paisa bigint generated always as ((data ->> 'amount')::bigint) stored;
create unique index if not exists bp_txns_user_no_uq on public.bp_txns (user_id, txn_no);
alter table public.bp_txns add constraint bp_txns_amount_positive check (amount_paisa > 0);
