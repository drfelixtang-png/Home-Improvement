-- Morning Board, "Me" and "Review" pages.
-- checkins: one row per day, morning and evening answers. This is the record of what
--   actually happened (the calendar is only a plan).
-- board_reviews: the weekly review written by Claude every Sunday evening.
-- board_settings gains the life areas (with weekly hour targets), the habits, and the
--   start of the 1000-day journey.

create table public.checkins (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  -- morning
  sleep_hours numeric check (sleep_hours between 0 and 24),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  energy_am smallint check (energy_am between 1 and 5),
  mood_am smallint check (mood_am between 1 and 5),
  priorities text[] not null default '{}',
  morning_note text not null default '',
  morning_at timestamptz,
  -- evening
  energy_pm smallint check (energy_pm between 1 and 5),
  mood_pm smallint check (mood_pm between 1 and 5),
  priorities_done boolean[] not null default '{}',
  habits jsonb not null default '{}'::jsonb, -- { "baduanjin": true, ... }
  hours jsonb not null default '{}'::jsonb,  -- { "serenehost": 3.5, ... }
  win text not null default '',
  slipped text not null default '',
  better_tomorrow text not null default '',  -- the 0.1% improvement for tomorrow
  evening_note text not null default '',
  evening_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create trigger checkins_updated_at before update on public.checkins
  for each row execute function public.set_updated_at();

create table public.board_reviews (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null, -- Monday
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.board_settings
  add column journey_start date not null default current_date,
  add column areas jsonb not null default '[
    {"key":"health","label":"Health and exercise","label_zh":"健康運動","target":5},
    {"key":"family","label":"Family and people","label_zh":"家人朋友","target":8},
    {"key":"serenehost","label":"SereneHost","label_zh":"悠居","target":15},
    {"key":"teaching","label":"HKU SPACE and teaching","label_zh":"教學","target":6},
    {"key":"journal","label":"Journal editing","label_zh":"期刊編輯","target":4},
    {"key":"crealogic","label":"Crealogic","label_zh":"Crealogic","target":4},
    {"key":"learning","label":"Learning and reading","label_zh":"學習閱讀","target":3},
    {"key":"rest","label":"Rest and fun","label_zh":"休息娛樂","target":8}
  ]'::jsonb,
  add column habits jsonb not null default '[
    {"key":"baduanjin","label":"Baduanjin practice","label_zh":"八段錦","per_week":7},
    {"key":"exercise","label":"Exercise 30 minutes","label_zh":"運動三十分鐘","per_week":3},
    {"key":"bed","label":"In bed by 11:30 pm","label_zh":"十一時半前上床","per_week":7},
    {"key":"family_call","label":"Call or message family","label_zh":"聯絡家人","per_week":3},
    {"key":"read","label":"Read 20 minutes","label_zh":"閱讀二十分鐘","per_week":5}
  ]'::jsonb;

alter table public.checkins enable row level security;
alter table public.board_reviews enable row level security;

create policy "owner only" on public.checkins for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner only" on public.board_reviews for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
