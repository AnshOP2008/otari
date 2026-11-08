import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chunkText, normalizeText } from "./document-text";
import { retrieveSources } from "./rag.server";

const MAX_TEXT_CHARS = 200_000;
const MAX_BASE64_CHARS = 4 * Math.ceil((8 * 1024 * 1024) / 3);

async function extractText(name: string, base64: string): Promise<string> {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (extension === "txt" || extension === "md") return new TextDecoder().decode(bytes);
  if (extension !== "pdf") throw new Error("Choose a .txt, .md, or .pdf document.");

  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

const UploadInput = z.object({
  name: z.string().trim().min(1).max(255),
  base64: z.string().min(1).max(MAX_BASE64_CHARS),
  progressId: z.string().uuid(),
});

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(UploadInput)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { name, base64, progressId } = data;
    try {
      if (["calendar!@#.txt", "gmail!@#.txt"].includes(name)) {
        throw new Error("That file name is reserved for Google imports.");
      }
      const { error: progressError } = await supabase
        .from("upload_progress")
        .update({ stage: "extracting_text", message: "Extracting document text..." })
        .eq("id", progressId)
        .eq("status", "running");
      if (progressError) throw new Error(progressError.message);

      const content = normalizeText(await extractText(name, base64));
      if (!content) throw new Error("No readable text found. Scanned PDFs need a text layer.");
      if (content.length > MAX_TEXT_CHARS) {
        throw new Error("The document exceeds 200,000 characters after extraction.");
      }

      const chunks = chunkText(content);
      const { data: id, error } = await supabase.rpc("store_document", {
        document_name: name,
        chunks,
        progress_id: progressId,
      });
      if (error) throw new Error(error.message);
      return { id, name, chunks: chunks.length };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Upload failed.";
      const status = message === "Upload cancelled." ? "cancelled" : "failed";
      await supabase
        .from("upload_progress")
        .update({ status, stage: status, message, error_message: message })
        .eq("id", progressId)
        .in("status", ["running", "cancel_requested"]);
      throw new Error(message);
    }
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({ query: z.string().trim().min(2).max(300), sourceId: z.string().uuid().optional() }),
  )
  .handler(({ context, data }) =>
    retrieveSources(context.supabase, data.query, { sourceId: data.sourceId, limit: 8 }),
  );

export const loadSourceBrief = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("id, name")
      .eq("id", data.id)
      .eq("status", "ready")
      .maybeSingle();
    if (error || !doc) throw new Error("That source is no longer available.");
    const { data: chunks, error: chunkError } = await context.supabase
      .from("document_chunks")
      .select("content")
      .eq("document_id", doc.id)
      .order("chunk_index")
      .limit(doc.name === "gmail!@#.txt" || doc.name === "calendar!@#.txt" ? 50 : 4);
    if (chunkError || !chunks.length) throw new Error("Could not open text from that source.");
    return {
      name: doc.name,
      text: chunks
        .map((chunk) => chunk.content)
        .join("\n\n")
        .slice(0, 8000),
    };
  });
