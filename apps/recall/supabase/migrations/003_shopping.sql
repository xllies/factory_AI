-- Recall: shopping assistant integration
-- Adds shopping as a third entry type, shopping profiles, memories, and per-entry metadata.

-- 1. Allow 'shopping' entries.
alter table recall_entries
  drop constraint if exists recall_entries_type_check;
alter table recall_entries
  add constraint recall_entries_type_check check (type in ('memory', 'action', 'shopping'));

-- 2. Per-entry shopping metadata (only rows for shopping entries will exist here).
create table if not exists recall_shopping_metadata (
  entry_id        uuid        primary key references recall_entries(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  garment_class   text,
  size            text,
  color           text,
  budget_amount   numeric,
  budget_currency text        not null default 'EUR',
  retailer        text,
  candidates      jsonb       not null default '[]',
  created_at      timestamptz not null default now()
);

alter table recall_shopping_metadata enable row level security;

create policy "owners can read shopping metadata"
  on recall_shopping_metadata for select to authenticated
  using (auth.uid() = user_id);

create policy "owners can insert shopping metadata"
  on recall_shopping_metadata for insert to authenticated
  with check (auth.uid() = user_id);

create policy "owners can update shopping metadata"
  on recall_shopping_metadata for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owners can delete shopping metadata"
  on recall_shopping_metadata for delete to authenticated
  using (auth.uid() = user_id);

-- 3. Per-user shopping profile: sizes, budget anchors, currency/country.
create table if not exists recall_shopping_profiles (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  country         text        not null default 'LV',
  currency        text        not null default 'EUR',
  size_top        text,
  size_bottom     text,
  size_shoes      text,
  size_dress      text,
  budget_anchors  jsonb       not null default '{}',
  updated_at      timestamptz not null default now()
);

alter table recall_shopping_profiles enable row level security;

create policy "owners can read shopping profile"
  on recall_shopping_profiles for select to authenticated
  using (auth.uid() = user_id);

create policy "owners can manage shopping profile"
  on recall_shopping_profiles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Shopping memories: past purchase outcomes with sentiment.
create table if not exists recall_shopping_memories (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  summary     text        not null,
  sentiment   text        not null check (sentiment in ('positive', 'negative', 'neutral')),
  tags        text[]      not null default '{}',
  retailer    text,
  brand       text,
  product     text,
  color       text,
  pinned      boolean     not null default false,
  created_at  timestamptz not null default now()
);

alter table recall_shopping_memories enable row level security;

create policy "owners can read shopping memories"
  on recall_shopping_memories for select to authenticated
  using (auth.uid() = user_id);

create policy "owners can insert shopping memories"
  on recall_shopping_memories for insert to authenticated
  with check (auth.uid() = user_id);

create policy "owners can update shopping memories"
  on recall_shopping_memories for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owners can delete shopping memories"
  on recall_shopping_memories for delete to authenticated
  using (auth.uid() = user_id);

-- 5. Auto-create a shopping profile when a new auth user signs up.
create or replace function public.handle_new_recall_shopping_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.recall_shopping_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_recall_shopping on auth.users;
create trigger on_auth_user_created_recall_shopping
  after insert on auth.users
  for each row execute function public.handle_new_recall_shopping_user();

-- Index for time-ordered memory listing.
create index if not exists recall_shopping_memories_user_created_idx
  on recall_shopping_memories (user_id, created_at desc);
