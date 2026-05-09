-- Prerequisite: run 003_shopping.sql first — it creates `recall_shopping_profiles`.
--
-- Shopping profile: set owner from JWT on insert so RLS matches auth.uid()
-- (same pattern as recall_shopping_memories; fixes client/server uid mismatches on upsert insert path).

create or replace function public.recall_shopping_profiles_set_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_owner_recall_shopping_profiles on public.recall_shopping_profiles;
create trigger set_owner_recall_shopping_profiles
  before insert on public.recall_shopping_profiles
  for each row
  execute function public.recall_shopping_profiles_set_owner();
