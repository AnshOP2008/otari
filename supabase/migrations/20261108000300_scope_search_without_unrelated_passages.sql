-- A source filter narrows matching passages. Only an explicit overview includes an opening passage.
create or replace function public.search_documents(
  search_terms text[],
  search_phrase text,
  result_limit int default 6,
  overview boolean default false,
  source_id uuid default null
)
returns table (document_id uuid, name text, chunk_index int, content text)
language sql stable security invoker
set search_path = public
as $$
  with queries as (
    select coalesce(string_agg(quote_literal(term), ' | '), '') as terms
    from (select distinct left(t, 100) as term from unnest(search_terms) as t limit 24) input
  ), matches as (
    select c.document_id, d.name, c.chunk_index, c.content,
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
  select document_id, name, chunk_index, content from diversified
  order by score / sqrt(within_source::double precision) desc, chunk_index, document_id
  limit greatest(1, least(coalesce(result_limit, 6), 12));
$$;
