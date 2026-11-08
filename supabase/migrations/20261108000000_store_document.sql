-- Publish documents and their chunks together. Failed imports leave the prior version visible.
create or replace function public.store_document(
  document_name text,
  chunks text[],
  replace_existing boolean default false,
  progress_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  document_id uuid;
  progress_status text;
begin
  if owner_id is null then raise exception 'Sign in to save documents.'; end if;
  if coalesce(cardinality(chunks), 0) not between 1 and 100
     or char_length(document_name) not between 1 and 255 then
    raise exception 'Invalid document.';
  end if;
  if replace_existing and document_name not in ('calendar!@#.txt', 'gmail!@#.txt') then
    raise exception 'Only Google sources can be replaced by sync.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if progress_id is not null then
    select status into progress_status from public.upload_progress
      where id = progress_id and user_id = owner_id for update;
    if progress_status = 'cancel_requested' then raise exception 'Upload cancelled.'; end if;
    if progress_status is distinct from 'running' then raise exception 'Upload session expired.'; end if;
  end if;

  if replace_existing then
    delete from public.documents where user_id = owner_id and name = document_name;
  else
    if exists (select 1 from public.documents where user_id = owner_id and name = document_name) then
      raise exception 'A document with that name already exists.';
    end if;
    if (select count(*) from public.documents where user_id = owner_id
        and name not in ('calendar!@#.txt', 'gmail!@#.txt')) >= 10 then
      raise exception 'Document limit reached (10). Delete a document first.';
    end if;
  end if;

  insert into public.documents (user_id, name, status, chunk_count)
    values (owner_id, document_name, 'ready', cardinality(chunks))
    returning id into document_id;
  insert into public.document_chunks (document_id, user_id, chunk_index, content)
    select document_id, owner_id, (ordinality - 1)::integer, content
    from unnest(chunks) with ordinality as parts(content, ordinality);

  if progress_id is not null then
    update public.upload_progress
      set status = 'completed', stage = 'completed', message = 'Upload complete.',
          current = cardinality(chunks), total = cardinality(chunks), updated_at = now()
      where id = progress_id and user_id = owner_id;
  end if;
  return document_id;
end;
$$;

revoke execute on function public.store_document(text, text[], boolean, uuid) from public;
grant execute on function public.store_document(text, text[], boolean, uuid) to authenticated;

grant select, insert, update, delete on public.upload_progress to authenticated;
