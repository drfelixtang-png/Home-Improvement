-- Morning Board, "Finance" page. Private to the owner like every board table.
-- Personal figures are loaded into the database only, never into this repository.
--
-- fin_accounts:   bank, GIC, investment and credit card accounts (no account numbers)
-- fin_balances:   one balance per account per snapshot date
-- fin_properties: properties with ownership share, value, mortgage, and sales
-- fin_ie:         income and spending lines by month (history and new entries);
--                 covers_months spreads a lump sum, e.g. a 6-monthly distribution
-- fin_history:    historical points from the old spreadsheet (investment mix by type,
--                 yearly summary, net equity), each in its original currency
-- fin_archive:    the old balance sheets kept as read-only records
-- fin_settings:   target mix rule, spending estimate and other choices

create table public.fin_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner text not null default 'felix',
  institution text not null,
  name text not null,
  kind text not null check (kind in ('cash', 'gic', 'investment', 'credit_card', 'loan', 'other')),
  currency text not null default 'CAD' check (currency in ('CAD', 'USD', 'HKD')),
  sort integer not null default 0,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.fin_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.fin_accounts (id) on delete cascade,
  as_of date not null,
  amount numeric not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (account_id, as_of)
);
create index fin_balances_user_idx on public.fin_balances (user_id, as_of desc);

create table public.fin_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  address text not null,
  share numeric not null default 1 check (share >= 0 and share <= 1),
  status text not null default 'held' check (status in ('held', 'sold', 'operated')),
  use text not null default '',
  value numeric,
  value_source text not null default '',
  value_as_of date,
  mortgage numeric not null default 0,
  sold_on date,
  sale_price numeric,
  cost numeric,
  note text not null default '',
  sort integer not null default 0,
  unique (user_id, key)
);

create table public.fin_ie (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null,
  kind text not null check (kind in ('income', 'expense')),
  line text not null,
  amount numeric not null,
  currency text not null default 'CAD' check (currency in ('CAD', 'USD', 'HKD')),
  covers_months integer not null default 1 check (covers_months between 1 and 24),
  source text not null default 'manual',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index fin_ie_user_month_idx on public.fin_ie (user_id, month);

create table public.fin_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  as_of date not null,
  measure text not null,
  category text,
  amount numeric not null,
  currency text not null check (currency in ('CAD', 'USD', 'HKD')),
  source text not null default 'sheet',
  note text not null default ''
);
create index fin_history_user_idx on public.fin_history (user_id, measure, as_of);

create table public.fin_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  as_of date,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table public.fin_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger fin_settings_updated_at before update on public.fin_settings
  for each row execute function public.set_updated_at();

alter table public.fin_accounts enable row level security;
alter table public.fin_balances enable row level security;
alter table public.fin_properties enable row level security;
alter table public.fin_ie enable row level security;
alter table public.fin_history enable row level security;
alter table public.fin_archive enable row level security;
alter table public.fin_settings enable row level security;

create policy "owner only" on public.fin_accounts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.fin_balances for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.fin_properties for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.fin_ie for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.fin_history for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.fin_archive for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.fin_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
