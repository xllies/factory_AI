-- Prerequisite: run 003_shopping.sql first — it creates `recall_shopping_memories`.
--
-- Shopping memories: set owner from JWT inside Postgres so inserts always match auth.uid()
-- and pass RLS (fixes mismatches when the client used a stale session user id).

create or replace function public.recall_shopping_memories_set_owner()
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

drop trigger if exists set_owner_recall_shopping_memories on public.recall_shopping_memories;
create trigger set_owner_recall_shopping_memories
  before insert on public.recall_shopping_memories
  for each row
  execute function public.recall_shopping_memories_set_owner();
