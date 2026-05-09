insert into profiles (id, full_name, focus_goal)
values
  ('11111111-1111-1111-1111-111111111111', 'Demo User', 'Reduce stress and maintain momentum')
on conflict (id) do nothing;

insert into conversations (id, profile_id, title)
values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Kickoff chat')
on conflict (id) do nothing;

insert into messages (conversation_id, role, content)
values
  ('22222222-2222-2222-2222-222222222222', 'assistant', 'Hi! I am your AI Bestie. What should we focus on today?')
on conflict do nothing;

insert into memory_items (profile_id, category, content)
values
  ('11111111-1111-1111-1111-111111111111', 'goal', 'Sleep before midnight at least four nights this week'),
  ('11111111-1111-1111-1111-111111111111', 'fact', 'Big presentation every Monday morning')
on conflict do nothing;

insert into checkins (profile_id, mood_score, note)
values
  ('11111111-1111-1111-1111-111111111111', 3, 'Feeling okay, a bit overwhelmed by meetings')
on conflict do nothing;
