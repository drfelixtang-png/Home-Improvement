-- Finance page: lottery tracker. lotto_plays holds the owner's regular plays (numbers, cost per draw,
-- dates); lotto_draws holds published winning numbers, so prizes can be worked out for each draw.
-- my_prize is set only for shared prizes or other wins that cannot be worked out from the numbers.
create table public.lotto_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game text not null check (game in ('lotto649', 'dailygrand')),
  numbers integer[] not null,
  grand integer,                          -- Daily Grand: the Grand Number
  cost numeric not null default 3,        -- per draw
  start_on date not null,
  end_on date,                            -- null while still playing
  note text not null default '',
  created_at timestamptz not null default now()
);
create index lotto_plays_user_idx on public.lotto_plays (user_id);
alter table public.lotto_plays enable row level security;
create policy "owner only" on public.lotto_plays for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table public.lotto_draws (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game text not null check (game in ('lotto649', 'dailygrand')),
  draw_on date not null,
  numbers integer[] not null,
  bonus integer,                          -- Lotto 6/49: bonus number
  grand integer,                          -- Daily Grand: Grand Number
  my_prize numeric,                       -- set by hand for shared prizes or other wins
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, game, draw_on)
);
create index lotto_draws_user_idx on public.lotto_draws (user_id, draw_on);
alter table public.lotto_draws enable row level security;
create policy "owner only" on public.lotto_draws for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
