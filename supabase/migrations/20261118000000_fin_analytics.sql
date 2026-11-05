-- Finance analytics: sector, asset type and risk level per holding; the previous assessed value per property.
-- risk: 1 very low, 2 low, 3 medium, 4 high, 5 very high (owner's own rating, editable on the page).
alter table public.fin_holdings
  add column sector text not null default '',
  add column asset_type text not null default 'stock' check (asset_type in ('stock', 'reit', 'fund', 'crypto', 'stablecoin', 'bond', 'other')),
  add column risk smallint check (risk between 1 and 5);
alter table public.fin_properties
  add column prev_value numeric,
  add column prev_value_as_of date;
