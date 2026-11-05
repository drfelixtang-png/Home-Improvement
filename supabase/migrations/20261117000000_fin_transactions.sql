-- Finance page: single transactions imported from bank and card exports.
-- Descriptions are kept short with account and card numbers removed.
-- kind: income and expense feed the monthly income and spending; transfer (between own accounts)
-- and capital (large one-time moves such as a mortgage payout) are kept out of the monthly figures.
-- reviewed = false marks a best guess waiting for the owner to confirm on the page.
create table public.fin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account text not null,
  posted_on date not null,
  amount numeric not null,          -- positive is money in, negative is money out
  currency text not null default 'CAD' check (currency in ('CAD', 'USD', 'HKD')),
  description text not null,
  seq integer not null default 0,   -- tells apart identical rows on the same day
  kind text not null check (kind in ('income', 'expense', 'transfer', 'capital')),
  line text not null,
  reviewed boolean not null default true,
  source text not null default 'statement',
  created_at timestamptz not null default now(),
  unique (user_id, account, posted_on, amount, description, seq)
);
create index fin_transactions_user_idx on public.fin_transactions (user_id, posted_on);
alter table public.fin_transactions enable row level security;
create policy "owner only" on public.fin_transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
