alter table public.tasks
  add column estimate_minutes integer
    check (estimate_minutes between 1 and 2400);
