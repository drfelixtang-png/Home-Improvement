-- Quick +/- step per item, price history per purchase, and product suggestions per store.

alter table public.items
  add column step_qty numeric not null default 1 check (step_qty > 0);

-- One row per purchase (or price seen). Unit price = price / qty.
create table public.price_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  store text not null default '',
  price numeric not null check (price >= 0),
  qty numeric not null check (qty > 0),
  bought_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index price_records_user_idx on public.price_records (user_id);
create index price_records_item_idx on public.price_records (item_id, bought_on desc);

-- Suggested products to buy, per store. pack_qty is how much of the item's unit one package gives.
create table public.product_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  store text not null default '',
  product_name text not null default '',
  size text,
  pack_qty numeric check (pack_qty > 0),
  price numeric check (price >= 0),
  url text,
  checked_on date,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_links_user_idx on public.product_links (user_id);
create index product_links_item_idx on public.product_links (item_id);

alter table public.price_records enable row level security;
alter table public.product_links enable row level security;

create policy "owner only" on public.price_records for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.product_links for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
