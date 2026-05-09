-- Per-user Google Calendar OAuth credentials (offline refresh token).

create table if not exists recall_google_calendar (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text        not null,
  email         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table recall_google_calendar enable row level security;

drop policy if exists "owners read google calendar" on recall_google_calendar;
create policy "owners read google calendar"
  on recall_google_calendar
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "owners delete google calendar" on recall_google_calendar;
create policy "owners delete google calendar"
  on recall_google_calendar
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Upserts happen from the OAuth callback route using the service role (trusted server).
-- Owners cannot insert/update directly via the anon key client.
