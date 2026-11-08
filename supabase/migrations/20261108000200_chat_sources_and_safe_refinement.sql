alter table public.chat_messages
  add column if not exists source_refs jsonb not null default '[]'::jsonb;

create or replace function public.append_suggested_tasks(suggestions jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  added int;
begin
  if owner_id is null then raise exception 'Sign in to add tasks.'; end if;
  if jsonb_array_length(suggestions) > 8 then raise exception 'Too many suggestions.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));

  with normalized as (
    select item, ordinality,
      lower(regexp_replace(trim(item->>'title'), '\s+', ' ', 'g')) as task_key
    from jsonb_array_elements(suggestions) with ordinality as input(item, ordinality)
  ), unique_suggestions as (
    select distinct on (task_key) item, ordinality
    from normalized n
    where task_key <> '' and not exists (
      select 1 from public.tasks t where t.user_id = owner_id
      and lower(regexp_replace(trim(t.title), '\s+', ' ', 'g')) = n.task_key
    )
    order by task_key, ordinality
  )
  insert into public.tasks (user_id, title, description, priority, due_date, ai_reason, created_by, position)
  select owner_id, left(item->>'title', 200), left(item->>'description', 1200),
    (item->>'priority')::public.task_priority, (item->>'due_date')::date,
    left(item->>'ai_reason', 600), 'ai',
    (select coalesce(max(position), -1) from public.tasks where user_id = owner_id)
      + row_number() over (order by ordinality)
  from unique_suggestions;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke execute on function public.append_suggested_tasks(jsonb) from public;
grant execute on function public.append_suggested_tasks(jsonb) to authenticated;
