alter table public.document_chunks
  add column source_title text,
  add column source_url text;

drop function public.store_document(text, text[], boolean, uuid);

-- Publish documents and their chunks together. Failed imports leave the prior version visible.
create or replace function public.store_document(
  document_name text,
  chunks text[],
  replace_existing boolean default false,
  progress_id uuid default null,
  chunk_details jsonb default null
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

  if chunk_details is not null and (
    replace_existing is not true
    or jsonb_typeof(chunk_details) <> 'array'
  ) then
    raise exception 'Invalid Google source details.';
  end if;
  if chunk_details is not null and jsonb_array_length(chunk_details) <> cardinality(chunks) then
    raise exception 'Google source details do not match the passages.';
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
  insert into public.document_chunks (document_id, user_id, chunk_index, content, source_title, source_url)
    select document_id, owner_id, (ordinality - 1)::integer, content,
      left(chunk_details -> ((ordinality - 1)::integer) ->> 'title', 300),
      left(chunk_details -> ((ordinality - 1)::integer) ->> 'url', 2048)
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

revoke execute on function public.store_document(text, text[], boolean, uuid, jsonb) from public;
grant execute on function public.store_document(text, text[], boolean, uuid, jsonb) to authenticated;

drop function public.search_documents(text[], text, int, boolean, uuid);

-- A source filter narrows matching passages. Only an explicit overview includes an opening passage.
create or replace function public.search_documents(
  search_terms text[],
  search_phrase text,
  result_limit int default 6,
  overview boolean default false,
  source_id uuid default null
)
returns table (document_id uuid, name text, chunk_index int, content text, source_title text, source_url text)
language sql stable security invoker
set search_path = public
as $$
  with queries as (
    select coalesce(string_agg(quote_literal(term), ' | '), '') as terms
    from (select distinct left(t, 100) as term from unnest(search_terms) as t limit 24) input
  ), matches as (
    select c.document_id, d.name, c.chunk_index, c.content, c.source_title, c.source_url,
      ts_rank_cd(to_tsvector('english', c.content), to_tsquery('english', q.terms), 32)
      + ts_rank_cd(to_tsvector('simple', c.content), to_tsquery('simple', q.terms), 32)
      + case when length(search_phrase) >= 4 and strpos(lower(c.content), lower(search_phrase)) > 0
          then 1.0 else 0 end
      + case when to_tsvector('simple', d.name) @@ to_tsquery('simple', q.terms)
          then 0.15 else 0 end as score
    from public.document_chunks c
    join public.documents d on c.document_id = d.id and c.user_id = d.user_id
    cross join queries q
    where c.user_id = auth.uid() and d.status = 'ready'
      and (source_id is null or c.document_id = source_id)
      and (to_tsvector('english', c.content) @@ to_tsquery('english', q.terms)
        or to_tsvector('simple', c.content) @@ to_tsquery('simple', q.terms)
        or to_tsvector('simple', d.name) @@ to_tsquery('simple', q.terms)
        or (overview and c.chunk_index = 0))
  ), diversified as (
    select *, row_number() over (partition by document_id order by score desc, chunk_index) as within_source
    from matches
  )
  select document_id, name, chunk_index, content, source_title, source_url from diversified
  order by score / sqrt(within_source::double precision) desc, chunk_index, document_id
  limit greatest(1, least(coalesce(result_limit, 6), 12));
$$;

revoke execute on function public.search_documents(text[], text, int, boolean, uuid) from public;
grant execute on function public.search_documents(text[], text, int, boolean, uuid) to authenticated;
