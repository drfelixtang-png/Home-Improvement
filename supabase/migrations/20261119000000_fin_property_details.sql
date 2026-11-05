-- Finance page: BC Assessment details per property (roll number, land and building values, house facts).
alter table public.fin_properties add column details jsonb not null default '{}'::jsonb;
