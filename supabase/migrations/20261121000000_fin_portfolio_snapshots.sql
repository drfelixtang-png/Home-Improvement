-- Finance page: half-year snapshots of the whole stock and crypto portfolio, one row per holding per date.
-- source 'rebuilt' = today's share counts priced at that date's close; 'saved' = taken on the day.
create table public.fin_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  as_of date not null,
  symbol text not null,
  name text not null default '',
  owner text not null,
  account text not null,
  asset_type text not null default 'stock',
  shares numeric not null,
  price numeric not null,
  price_date date,
  currency text not null check (currency in ('CAD', 'USD', 'HKD')),
  value_cad numeric not null,
  source text not null default 'rebuilt',
  created_at timestamptz not null default now(),
  unique (user_id, as_of, symbol, account)
);
create index fin_portfolio_snapshots_user_idx on public.fin_portfolio_snapshots (user_id, as_of);
alter table public.fin_portfolio_snapshots enable row level security;
create policy "owner only" on public.fin_portfolio_snapshots for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
