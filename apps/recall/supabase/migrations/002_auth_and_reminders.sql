-- Recall app: add auth ownership, due dates, and reminders
-- This migration is idempotent and assumes 001_init_recall.sql has run.

-- 1. Add the columns we need for a real personal assistant.
alter table recall_entries
  add column if not exists user_id      uuid        references auth.users(id) on delete cascade,
  add column if not exists due_at       timestamptz,
  add column if not exists remind_at    timestamptz,
  add column if not exists notified_at  timestamptz,
  add column if not exists location     text,
  add column if not exists source       text not null default 'voice'
    check (source in ('voice', 'text', 'upload', 'import'));

-- 2. Helpful indexes for the "what's due now / next" queries.
create index if not exists recall_entries_user_id_idx
  on recall_entries (user_id);
create index if not exists recall_entries_due_at_idx
  on recall_entries (user_id, due_at)
  where due_at is not null;
create index if not exists recall_entries_remind_at_idx
  on recall_entries (user_id, remind_at)
  where remind_at is not null and notified_at is null;

-- 3. Lock down the table with proper Row Level Security.
--    Drop the permissive "service role" policy from migration 001 first.
drop policy if exists "service role full access" on recall_entries;

-- Authenticated users can only see and modify their own entries.
drop policy if exists "owners can read" on recall_entries;
create policy "owners can read"
  on recall_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "owners can insert" on recall_entries;
create policy "owners can insert"
  on recall_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "owners can update" on recall_entries;
create policy "owners can update"
  on recall_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "owners can delete" on recall_entries;
create policy "owners can delete"
  on recall_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- The service role bypasses RLS entirely (it does not need a policy),
-- so server-side jobs (cron reminders, .ics feed) keep working.

-- 4. A per-user calendar feed token so an unauthenticated calendar app
--    (Google/Apple/Outlook) can pull a private .ics URL.
create table if not exists recall_calendar_tokens (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  token      text        not null unique,
  created_at timestamptz not null default now()
);

alter table recall_calendar_tokens enable row level security;

drop policy if exists "owners can read token" on recall_calendar_tokens;
create policy "owners can read token"
  on recall_calendar_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "owners can manage token" on recall_calendar_tokens;
create policy "owners can manage token"
  on recall_calendar_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. A profile row per user so we can store timezone for accurate due_at parsing.
create table if not exists recall_profiles (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  timezone   text        not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recall_profiles enable row level security;

drop policy if exists "owners can read profile" on recall_profiles;
create policy "owners can read profile"
  on recall_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "owners can manage profile" on recall_profiles;
create policy "owners can manage profile"
  on recall_profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_recall_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.recall_profiles (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_recall on auth.users;
create trigger on_auth_user_created_recall
  after insert on auth.users
  for each row execute function public.handle_new_recall_user();
