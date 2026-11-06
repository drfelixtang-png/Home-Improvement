-- Finance page: recurring expenses (bills, plans, insurance, subscriptions).
-- match is a text pattern found in bank statement descriptions, used to show what was actually paid.
create table public.fin_recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  provider text not null default '',
  category text not null default 'Other',
  place text not null default '',          -- property or person it is for, e.g. "10600 Railway Ave" or "Ruby"
  amount numeric,                          -- usual amount per payment, CAD
  frequency text not null default 'monthly' check (frequency in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly')),
  autopay boolean,
  pay_from text not null default '',       -- account or card it is paid from
  match text not null default '',
  active boolean not null default true,
  note text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index fin_recurring_user_idx on public.fin_recurring (user_id);
alter table public.fin_recurring enable row level security;
create policy "owner only" on public.fin_recurring for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
