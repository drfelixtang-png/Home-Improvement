-- Morning Board, round 2.
-- board_item_state: items Felix marks done or snoozes on the board. The morning task
--   reads this too, so done items are not repeated the next day.
-- board_extra: blocks written by other tasks, one row per kind (for example 'whatsapp',
--   written by the Claude desktop task on Felix's Windows computer).

create table public.board_item_state (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key text not null,
  status text not null check (status in ('done', 'snoozed')),
  until date,
  title text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
create trigger board_item_state_updated_at before update on public.board_item_state
  for each row execute function public.set_updated_at();

create table public.board_extra (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
create trigger board_extra_updated_at before update on public.board_extra
  for each row execute function public.set_updated_at();

alter table public.board_item_state enable row level security;
alter table public.board_extra enable row level security;

create policy "owner only" on public.board_item_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.board_extra for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
