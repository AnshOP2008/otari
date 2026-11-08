create extension if not exists vector;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'processing',
  error_message text,
  chunk_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy documents_select_own on public.documents for select to authenticated using (auth.uid() = user_id);
create policy documents_insert_own on public.documents for insert to authenticated with check (auth.uid() = user_id);
create policy documents_update_own on public.documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy documents_delete_own on public.documents for delete to authenticated using (auth.uid() = user_id);
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();
create index documents_user_idx on public.documents(user_id, created_at desc);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.document_chunks to authenticated;
grant all on public.document_chunks to service_role;
alter table public.document_chunks enable row level security;
create policy chunks_select_own on public.document_chunks for select to authenticated using (auth.uid() = user_id);
create policy chunks_insert_own on public.document_chunks for insert to authenticated with check (auth.uid() = user_id);
create policy chunks_delete_own on public.document_chunks for delete to authenticated using (auth.uid() = user_id);
create index document_chunks_doc_idx on public.document_chunks(document_id);
create index document_chunks_embedding_idx on public.document_chunks using hnsw (embedding vector_cosine_ops);

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  owner uuid default auth.uid()
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql stable security definer set search_path = public as $$
  select c.id, c.document_id, c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where c.user_id = owner and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_document_chunks(vector, int, uuid) to authenticated;