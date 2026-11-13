-- Me page: record of red wine and wind-down time each night, the current focus habit,
-- and two-week experiments.
alter table public.checkins
  add column if not exists wine_glasses numeric(4,1),
  add column if not exists wind_down time;

alter table public.board_settings
  add column if not exists focus jsonb,
  add column if not exists experiments jsonb not null default '[]'::jsonb;
