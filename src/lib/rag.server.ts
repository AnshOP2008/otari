import { embedTexts } from "./gemini.server";

export async function retrieveContext(
  supabase: unknown,
  query: string,
  matchCount = 5,
): Promise<string> {
  if (!query.trim()) {
    return "";
  }

  try {
    console.log("[rag] generating query embedding");
    const vectorArray = await embedTexts([query]);
    const vector = vectorArray.length > 0 ? vectorArray[0] : [];
    const sb = supabase as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    };

    console.log("[rag] performing similarity search");
    const { data, error } = await sb.rpc("match_document_chunks", {
      query_embedding: vector as unknown as string,
      match_count: matchCount,
    });

    if (error || !data) {
      if (error) {
        console.warn("[rag] similarity search failed", error);
      }
      return "";
    }

    return (data as { content: string }[])
      .map((row, index) => `[${index + 1}] ${row.content}`)
      .join("\n\n");
  } catch (error) {
    console.warn("[rag] retrieveContext failed:", (error as Error).message);
    return "";
  }
}
