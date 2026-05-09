create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key,
  full_name text,
  focus_goal text,
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists memory_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('goal', 'feeling', 'fact', 'todo')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists memory_summaries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  mood_score int not null check (mood_score between 1 and 5),
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists calendar_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null,
  external_account_id text not null,
  connected_at timestamptz not null default now(),
  unique(profile_id, provider)
);

create table if not exists safety_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  source text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  content_excerpt text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_memory_profile_created on memory_items(profile_id, created_at desc);
create index if not exists idx_checkins_profile_created on checkins(profile_id, created_at desc);
create index if not exists idx_messages_conversation_created on messages(conversation_id, created_at asc);

alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table memory_items enable row level security;
alter table memory_summaries enable row level security;
alter table checkins enable row level security;
alter table calendar_links enable row level security;
alter table safety_events enable row level security;

create policy "profiles owner read/write"
on profiles
for all
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "conversations owner read/write"
on conversations
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "messages owner read/write"
on messages
for all
to authenticated
using (
  exists (
    select 1
    from conversations c
    where c.id = messages.conversation_id
      and c.profile_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from conversations c
    where c.id = messages.conversation_id
      and c.profile_id = auth.uid()
  )
);

create policy "memory owner read/write"
on memory_items
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "memory summary owner read/write"
on memory_summaries
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "checkins owner read/write"
on checkins
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "calendar links owner read/write"
on calendar_links
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "safety events owner read"
on safety_events
for select
to authenticated
using (profile_id = auth.uid());
