-- Finance page: individual stock holdings inside an investment account, priced live from the markets feed.
-- Only symbols and share counts are stored; no account numbers.
create table public.fin_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.fin_accounts (id) on delete cascade,
  symbol text not null,            -- Yahoo Finance symbol, e.g. 0700.HK
  name text not null default '',
  name_zh text not null default '',
  shares numeric not null,
  currency text not null default 'HKD' check (currency in ('CAD', 'USD', 'HKD')),
  last_price numeric,              -- price when the holding was entered, used if the live price is missing
  updated_at timestamptz not null default now(),
  unique (account_id, symbol)
);
create index fin_holdings_user_idx on public.fin_holdings (user_id);
alter table public.fin_holdings enable row level security;
create policy "owner only" on public.fin_holdings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
