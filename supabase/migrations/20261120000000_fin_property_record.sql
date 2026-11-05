-- Finance page: a "record" status for family properties kept for reference only (not owned, not counted).
alter table public.fin_properties drop constraint fin_properties_status_check;
alter table public.fin_properties add constraint fin_properties_status_check check (status in ('held', 'sold', 'operated', 'record'));
