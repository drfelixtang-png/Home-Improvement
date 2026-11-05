-- Morning Board, "Home" page: everything that becomes due, in one table.
-- category: document, maintenance, health, car, bill, emergency
-- subject: who or what it belongs to (a person key, a car key, or 'house')
-- every_months: how often it repeats (null = one-off); marking it done moves next_due on.

create table public.home_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('document', 'maintenance', 'health', 'car', 'bill', 'emergency')),
  subject text not null default 'house',
  title text not null,
  title_zh text not null default '',
  every_months numeric check (every_months > 0),
  last_done date,
  next_due date,
  note text not null default '',
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index home_items_user_due_idx on public.home_items (user_id, next_due);
create trigger home_items_updated_at before update on public.home_items
  for each row execute function public.set_updated_at();

alter table public.home_items enable row level security;
create policy "owner only" on public.home_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
