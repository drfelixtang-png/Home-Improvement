-- Stockpile Tracker: initial schema
-- Every table is owner only through Row Level Security (auth.uid() = user_id).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- items -------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sort_order integer not null default 0,
  name_en text not null default '',
  name_zh text not null default '',
  category text not null default '',
  unit text not null default 'each',
  target_qty numeric not null default 0 check (target_qty >= 0),
  location text not null default 'Kitchen',
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_user_sort_idx on public.items (user_id, sort_order);
create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

-- batches -----------------------------------------------------------------
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  qty numeric not null default 0 check (qty >= 0),
  expiry_date date,
  purchased_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index batches_user_idx on public.batches (user_id);
create index batches_item_idx on public.batches (item_id);
create trigger batches_updated_at before update on public.batches
  for each row execute function public.set_updated_at();

-- stocktakes --------------------------------------------------------------
-- status 'in_progress' lets a stock-take be paused and continued on another device.
create table public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  taken_on date not null default current_date,
  notes text,
  status text not null default 'in_progress' check (status in ('in_progress', 'done')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index stocktakes_user_idx on public.stocktakes (user_id, taken_on desc);
-- Only one stock-take in progress per user.
create unique index stocktakes_one_open_idx on public.stocktakes (user_id) where status = 'in_progress';

-- stocktake_lines ---------------------------------------------------------
-- A line is written as each item is confirmed (save as you go) and refreshed on finish.
create table public.stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stocktake_id uuid not null references public.stocktakes (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  counted_qty numeric not null default 0,
  target_qty numeric not null default 0,
  earliest_expiry date,
  unique (stocktake_id, item_id)
);
create index stocktake_lines_user_idx on public.stocktake_lines (user_id);
create index stocktake_lines_item_idx on public.stocktake_lines (item_id);

-- settings ----------------------------------------------------------------
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  language text not null default 'en' check (language in ('en', 'zh-Hant')),
  stocktake_interval_months integer not null default 3 check (stocktake_interval_months between 1 and 24),
  expiry_warning_days integer not null default 180 check (expiry_warning_days between 1 and 3650),
  seeded boolean not null default false
);

-- Row Level Security --------------------------------------------------------
alter table public.items enable row level security;
alter table public.batches enable row level security;
alter table public.stocktakes enable row level security;
alter table public.stocktake_lines enable row level security;
alter table public.settings enable row level security;

create policy "owner only" on public.items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.batches for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.stocktakes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.stocktake_lines for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
