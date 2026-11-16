-- Me page: a ledger of time use, recorded automatically from the owner's Google Calendar.
-- Only one-off (not repeating) timed events are recorded; repeating events are plans.
-- category is the life area key from board_settings.areas; it can be changed on the board.
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,                       -- Vancouver date the activity started
  start_at timestamptz not null,
  end_at timestamptz not null,
  minutes integer not null check (minutes >= 0),
  title text not null default '',
  category text not null default 'other',
  source text not null default 'calendar',
  source_id text,                          -- calendar event id, so each event is recorded once
  reviewed boolean not null default true,  -- false: best guess, or planned ahead and may not have happened
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, source_id)
);
create index time_entries_user_day_idx on public.time_entries (user_id, day);
alter table public.time_entries enable row level security;
create policy "owner only" on public.time_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
