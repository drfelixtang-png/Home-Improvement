-- Survival priority, stock-up rule, and a group that keeps emergency supplies apart from food.
alter table public.items
  add column priority text not null default 'important' check (priority in ('essential', 'important', 'nice')),
  add column stock_rule text not null default 'keep' check (stock_rule in ('stock_up', 'keep', 'no_overstock')),
  add column kind text not null default 'food' check (kind in ('food', 'emergency'));
