-- GLAMIEX returns, deliveries, delivery partners, rider settlements, and Names & Payments.
-- Same local-first sync shape and RLS as 20261021000001_glamiex.sql. Money inside `data` is integer PAISA.

do $$
declare t text;
begin
  foreach t in array array['gx_returns','gx_shipments','gx_partners','gx_rider_payments','np_people','np_payments'] loop
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

-- Financial records (returns, settlements, Names & Payments receipts) have NO delete policy: they are voided or
-- soft-deleted, never hard-deleted by clients. Partner profiles and shipments may be deleted by their owner.
create policy "gx_partners: owner delete" on public.gx_partners for delete using (user_id = (select auth.uid()));
create policy "gx_shipments: owner delete" on public.gx_shipments for delete using (user_id = (select auth.uid()));
create policy "np_people: owner delete" on public.np_people for delete using (user_id = (select auth.uid()));

-- Server-side duplicate protection (per user)
alter table public.gx_returns add column if not exists return_no text generated always as (data ->> 'returnNo') stored;
alter table public.gx_shipments add column if not exists shipment_no text generated always as (data ->> 'shipmentNo') stored;
alter table public.gx_rider_payments add column if not exists settlement_no text generated always as (data ->> 'settlementNo') stored,
                                     add column if not exists amount_paid_paisa bigint generated always as ((data ->> 'amountPaid')::bigint) stored;
alter table public.np_payments add column if not exists receipt_no text generated always as (data ->> 'receiptNo') stored,
                               add column if not exists amount_paisa bigint generated always as ((data ->> 'amount')::bigint) stored;
create unique index if not exists gx_returns_user_no_uq on public.gx_returns (user_id, return_no);
create unique index if not exists gx_shipments_user_no_uq on public.gx_shipments (user_id, shipment_no);
create unique index if not exists gx_rider_payments_user_no_uq on public.gx_rider_payments (user_id, settlement_no);
create unique index if not exists np_payments_user_no_uq on public.np_payments (user_id, receipt_no);
