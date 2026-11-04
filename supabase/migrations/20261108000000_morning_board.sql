-- Morning Board: a personal dashboard that shares this project's sign-in.
-- board_snapshots: one row per morning summary, written by the scheduled Claude task.
-- board_settings: one row per user, edited on the board (focus note, bin day, watchlist).

create table public.board_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  data jsonb not null
);
create index board_snapshots_user_idx on public.board_snapshots (user_id, created_at desc);

create table public.board_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  focus_note text not null default '',
  focus_for date,
  bin_weekday smallint check (bin_weekday between 0 and 6),
  bin_note text not null default '',
  watchlist jsonb not null default '[
    {"symbol":"^HSI","label":"Hang Seng"},
    {"symbol":"^GSPTSE","label":"TSX"},
    {"symbol":"^GSPC","label":"S&P 500"},
    {"symbol":"^IXIC","label":"Nasdaq"},
    {"symbol":"^DJI","label":"Dow"},
    {"symbol":"CAD=X","label":"USD / CAD"},
    {"symbol":"CADHKD=X","label":"CAD / HKD"}
  ]'::jsonb,
  sites jsonb not null default '[
    {"name":"SereneHost","url":"https://serenehost.ca/"},
    {"name":"Stockpile Tracker","url":"https://drfelixtang-png.github.io/Home-Improvement/"}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger board_settings_updated_at before update on public.board_settings
  for each row execute function public.set_updated_at();

alter table public.board_snapshots enable row level security;
alter table public.board_settings enable row level security;

create policy "owner only" on public.board_snapshots for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.board_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
