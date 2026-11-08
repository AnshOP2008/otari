import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { calendarSourceUrl, excerptForQuery, searchTerms, sourceHeading } from "./document-text";

export async function retrieveSources(
  supabase: SupabaseClient<Database>,
  query: string,
  options: { limit?: number; overview?: boolean; sourceId?: string } = {},
) {
  const { data, error } = await supabase.rpc("search_documents", {
    search_terms: searchTerms(query),
    search_phrase: query.trim().slice(0, 200),
    result_limit: options.limit ?? 6,
    overview: options.overview ?? false,
    ...(options.sourceId ? { source_id: options.sourceId } : {}),
  });
  if (error)
    throw new Error("Could not search the knowledge base. Check that the database is up to date.");
  return data.map((row, index) => ({
    number: index + 1,
    id: row.document_id,
    name: row.name,
    section: row.chunk_index + 1,
    title: row.source_title,
    url: calendarSourceUrl(row.source_url),
    excerpt: excerptForQuery(row.content, query),
  }));
}

export type Source = Awaited<ReturnType<typeof retrieveSources>>[number];

export function formatSources(sources: Source[]) {
  return sources
    .map((source) => `[${source.number}] ${sourceHeading(source)}\n${source.excerpt}`)
    .join("\n\n");
}
