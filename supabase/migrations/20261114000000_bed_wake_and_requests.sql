-- Morning check-in asks for bed time and wake-up time; sleep_hours is worked out from them.
alter table public.checkins
  add column bed_time time,
  add column wake_time time;

-- One-time requests for the WhatsApp desktop task are stored in board_extra
-- (kind 'wa_requests'); no schema change is needed for them.
