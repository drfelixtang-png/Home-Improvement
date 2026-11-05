-- Morning Board, "Home" page: the household profile (people, home, cars) and the plan.
-- Private by Row Level Security like every other board table. Personal details live
-- only in the database, never in this repository.

create table public.household (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger household_updated_at before update on public.household
  for each row execute function public.set_updated_at();

alter table public.household enable row level security;
create policy "owner only" on public.household for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
