alter table public.tasks
  add column calendar_exported_at timestamptz,
  add column calendar_event_url text;
