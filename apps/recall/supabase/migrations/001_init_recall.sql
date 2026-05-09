-- Recall app: entries table
-- Each row is one captured thought, classified as a memory or an action.

create table if not exists recall_entries (
  id          uuid        primary key default gen_random_uuid(),
  type        text        not null check (type in ('memory', 'action')),
  raw         text        not null,
  summary     text        not null,
  tags        text[]      not null default '{}',
  done        boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- Allow the service-role key full access (used by the API routes).
-- RLS can be enabled later once auth is wired.
alter table recall_entries enable row level security;

create policy "service role full access"
  on recall_entries
  using (true)
  with check (true);

-- Index for time-ordered listing
create index if not exists recall_entries_created_at_idx on recall_entries (created_at desc);
