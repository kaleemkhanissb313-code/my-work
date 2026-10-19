-- GLAMIEX sales & finance module.
-- Same local-first sync shape as the other entity tables (see 20261020000001_init.sql), protected by RLS.
-- Money inside `data` is integer PAISA (Rs 1 = 100). Generated columns expose typed values for reporting.

do $$
declare t text;
begin
  foreach t in array array[
    'gx_products','gx_stock_moves','gx_orders','gx_refunds','gx_people','gx_payments','gx_ad_income','gx_ad_spend','gx_expenses'
  ] loop
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
-- Note: ids are text because stock moves use deterministic keys like "sale:<orderId>:<productId>" (idempotency).
-- Deletion policy: financial tables have NO delete policy — posted records are soft-deleted / voided / reversed, never hard-deleted by clients.
create policy "gx_products: owner delete" on public.gx_products for delete using (user_id = (select auth.uid()));
create policy "gx_people: owner delete" on public.gx_people for delete using (user_id = (select auth.uid()));
create policy "gx_expenses: owner delete" on public.gx_expenses for delete using (user_id = (select auth.uid()));
create policy "gx_ad_income: owner delete" on public.gx_ad_income for delete using (user_id = (select auth.uid()));
create policy "gx_ad_spend: owner delete" on public.gx_ad_spend for delete using (user_id = (select auth.uid()));

-- Typed projections
alter table public.gx_products add column if not exists sku text generated always as (data ->> 'sku') stored,
                               add column if not exists name text generated always as (data ->> 'name') stored,
                               add column if not exists sell_price_paisa bigint generated always as ((data ->> 'sellPrice')::bigint) stored,
                               add column if not exists buy_price_paisa bigint generated always as ((data ->> 'buyPrice')::bigint) stored;
alter table public.gx_orders   add column if not exists order_no text generated always as (data ->> 'orderNo') stored,
                               add column if not exists status text generated always as (data ->> 'status') stored,
                               add column if not exists sold_at text generated always as (data ->> 'at') stored,
                               add column if not exists person_id text generated always as (data ->> 'personId') stored;
alter table public.gx_payments add column if not exists txn_no text generated always as (data ->> 'txnNo') stored,
                               add column if not exists type text generated always as (data ->> 'type') stored,
                               add column if not exists amount_paisa bigint generated always as ((data ->> 'amount')::bigint) stored,
                               add column if not exists voided boolean generated always as ((data ->> 'voided')::boolean) stored;
alter table public.gx_stock_moves add column if not exists product_id text generated always as (data ->> 'productId') stored,
                               add column if not exists qty integer generated always as ((data ->> 'qty')::integer) stored;

-- Server-side duplicate protection (per user)
create unique index if not exists gx_products_user_sku_uq on public.gx_products (user_id, sku) where deleted_at_ms is null;
create unique index if not exists gx_orders_user_no_uq on public.gx_orders (user_id, order_no);
create unique index if not exists gx_payments_user_txn_uq on public.gx_payments (user_id, txn_no);
create index if not exists gx_stock_product_idx on public.gx_stock_moves (user_id, product_id);

-- Sanity checks on posted money (paisa must be whole, payments positive)
alter table public.gx_payments add constraint gx_payments_amount_positive check (amount_paisa > 0);
alter table public.gx_products add constraint gx_products_prices_nonneg check (sell_price_paisa >= 0 and buy_price_paisa >= 0);

-- Append-only financial audit trail
create table if not exists public.gx_audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity text not null check (char_length(entity) <= 30),
  entity_id text not null,
  action text not null check (action in ('create','update','cancel','refund','void','delete','restore','adjust')),
  summary text not null default '' check (char_length(summary) <= 300),
  at timestamptz not null default now()
);
create index if not exists gx_audit_user_at_idx on public.gx_audit_events (user_id, at desc);
alter table public.gx_audit_events enable row level security;
create policy "gx_audit: owner insert" on public.gx_audit_events for insert with check (user_id = (select auth.uid()));
create policy "gx_audit: owner select" on public.gx_audit_events for select using (user_id = (select auth.uid()));

-- Overall Sheets (user spreadsheets) — same owner-only RLS pattern; sheets may be hard-deleted from Trash.
create table if not exists public.gx_sheets (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 5000000),
  version integer not null default 1 check (version > 0),
  updated_at_ms bigint not null,
  deleted_at_ms bigint,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists gx_sheets_user_cursor_idx on public.gx_sheets (user_id, server_updated_at);
alter table public.gx_sheets enable row level security;
alter table public.gx_sheets force row level security;
create policy "gx_sheets: owner all" on public.gx_sheets for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger gx_sheets_touch before insert or update on public.gx_sheets for each row execute function public.touch_sync_row();
