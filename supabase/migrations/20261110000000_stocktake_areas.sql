-- A stock-take can cover some locations only. Null means every location.
alter table public.stocktakes add column locations text[];
