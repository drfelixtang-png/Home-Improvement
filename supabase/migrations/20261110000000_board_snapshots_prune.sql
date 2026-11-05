-- Remove Morning Board snapshots older than 30 days whenever a new one is saved.
-- This replaces the delete that the scheduled summary task used to run itself:
-- the Supabase connector holds deletes for approval, which made the save time out.
create or replace function public.prune_old_board_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.board_snapshots
  where created_at < now() - interval '30 days';
  return null;
end;
$$;

revoke all on function public.prune_old_board_snapshots() from public, anon, authenticated;

drop trigger if exists board_snapshots_prune on public.board_snapshots;
create trigger board_snapshots_prune
after insert on public.board_snapshots
for each statement
execute function public.prune_old_board_snapshots();
