import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const MAX_DOCS = 10;
const MAX_TEXT_CHARS = 200_000;
const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 150;
const EMBEDDING_BATCH_SIZE = 100;
const MAX_UPLOAD_MS = 10 * 60 * 1000;

type UploadProgressStatus = "running" | "cancel_requested" | "cancelled" | "completed" | "failed";

type UploadProgressPatch = {
  status?: UploadProgressStatus;
  stage?: string;
  message?: string;
  current?: number;
  total?: number;
  error_message?: string | null;
};

export function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(text: string): string[] {
  const clean = normalizeText(text);
  if (!clean) return [];

  const chunks: string[] = [];
  let index = 0;

  while (index < clean.length) {
    const end = Math.min(index + CHUNK_SIZE, clean.length);
    const slice = clean.slice(index, end);

    // if (end < clean.length) {
    //   const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "));
    //   if (lastBreak > CHUNK_SIZE * 0.5) {
    //     slice = slice.slice(0, lastBreak + 1);
    //   }
    // }

    const trimmed = slice.trim();
    if (trimmed.length > 20) {
      chunks.push(trimmed);
    }

    if (end >= clean.length) {
      break;
    }

    index += Math.max(slice.length + 1 - CHUNK_OVERLAP, 1);
  }

  return chunks;
}

async function extractText(name: string, base64: string): Promise<string> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  if (ext === "txt" || ext === "md") {
    return new TextDecoder().decode(bytes);
  }

  if (ext === "pdf") {
    const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await pdfExtract(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }

  throw new Error(`Unsupported file type: .${ext}. Use .txt, .md, or .pdf.`);
}

async function updateUploadProgress(
  supabase: {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  progressId: string,
  patch: UploadProgressPatch,
) {
  const { error } = await supabase
    .from("upload_progress")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", progressId);

  if (error) {
    console.error("[uploadDocument] progress update failed", error);
  } else {
    console.log("[uploadDocument][progress]", patch);
  }
}

async function readUploadProgressStatus(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<{
            data: { status: UploadProgressStatus } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  },
  progressId: string,
) {
  const { data, error } = await supabase
    .from("upload_progress")
    .select("status")
    .eq("id", progressId)
    .maybeSingle();

  if (error) {
    console.error("[uploadDocument] progress read failed", error);
    return null;
  }

  return data?.status ?? null;
}

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  });

const UploadInput = z.object({
  name: z.string().min(1).max(255),
  base64: z.string().min(1),
  progressId: z.string().uuid(),
});

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ context, data }) => {
    const startedAt = Date.now();
    const progressId = data.progressId;
    const supabase = context.supabase;

    const ensureNotCancelled = async () => {
      if (Date.now() - startedAt > MAX_UPLOAD_MS) {
        await updateUploadProgress(supabase, progressId, {
          status: "failed",
          stage: "failed",
          message: "Upload timed out.",
          error_message: "Upload timed out.",
        });
        throw new Error("Upload timed out.");
      }

      const status = await readUploadProgressStatus(supabase, progressId);
      if (status === "cancel_requested") {
        await updateUploadProgress(supabase, progressId, {
          status: "cancelled",
          stage: "cancelled",
          message: "Upload cancelled.",
          error_message: "Upload cancelled.",
        });
        throw new Error("Upload cancelled.");
      }
    };

    const updateStage = async (stage: string, message: string, patch: UploadProgressPatch = {}) => {
      await updateUploadProgress(supabase, progressId, {
        stage,
        message,
        ...patch,
      });
    };

    const finalizeFailure = async (message: string) => {
      await updateUploadProgress(supabase, progressId, {
        status: message.toLowerCase().includes("cancel") ? "cancelled" : "failed",
        stage: message.toLowerCase().includes("cancel") ? "cancelled" : "failed",
        message,
        error_message: message,
      });
    };

    await updateUploadProgress(supabase, progressId, {
      status: "running",
      stage: "starting",
      message: "Starting upload...",
      current: 0,
      total: 0,
      error_message: null,
    });

    try {
      await ensureNotCancelled();

      const { count } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true });
      if ((count ?? 0) >= MAX_DOCS) {
        throw new Error(`Document limit reached (${MAX_DOCS}). Delete some first.`);
      }

      const { data: dup } = await supabase
        .from("documents")
        .select("id")
        .eq("name", data.name)
        .maybeSingle();

      if (dup) {
        throw new Error("A document with that name already exists.");
      }

      await updateStage("extracting_text", "Extracting document text...");
      const extractedText = normalizeText(await extractText(data.name, data.base64));
      console.log("[uploadDocument] extracted text", {
        name: data.name,
        length: extractedText.length,
      });

      if (extractedText.length > MAX_TEXT_CHARS) {
        throw new Error(
          `Document text too large (${extractedText.length} chars, max ${MAX_TEXT_CHARS}).`,
        );
      }

      await updateStage("cleaning_content", "Cleaning content and preparing document chunks...");

      const chunks = chunkText(extractedText);
      console.log("[uploadDocument] chunks prepared", {
        name: data.name,
        chunkCount: chunks.length,
      });

      if (chunks.length === 0) {
        throw new Error("No readable text found in document.");
      }

      const { data: doc, error: insErr } = await supabase
        .from("documents")
        .insert({
          user_id: context.userId,
          name: data.name,
          status: "processing",
          error_message: null,
          chunk_count: 0,
        })
        .select()
        .single();

      if (insErr) {
        throw new Error(insErr.message);
      }

      await updateStage(
        "splitting_into_chunks",
        `Splitting document into ${chunks.length} chunks...`,
        {
          current: 0,
          total: chunks.length,
        },
      );

      await updateStage(
        "generating_embeddings",
        `Generating embeddings (0 / ${chunks.length})...`,
        {
          current: 0,
          total: chunks.length,
        },
      );

      const embeddings: number[][] = [];
      const { embedTexts } = await import("./gemini.server");
      for (let index = 0; index < chunks.length; index += EMBEDDING_BATCH_SIZE) {
        await ensureNotCancelled();
        const batch = chunks.slice(index, index + EMBEDDING_BATCH_SIZE);
        const batchStart = index + 1;
        const batchEnd = index + batch.length;

        await updateStage(
          "generating_embeddings",
          `Generating embeddings (${batchStart} - ${batchEnd} of ${chunks.length})...`,
          {
            current: batchEnd,
            total: chunks.length,
          },
        );

        console.log("[uploadDocument] embedding batch", {
          documentId: doc.id,
          start: batchStart,
          end: batchEnd,
          total: chunks.length,
        });

        const batchEmbeddings = await embedTexts(batch);

        embeddings.push(...batchEmbeddings);
      }

      await updateStage("storing_embeddings", "Storing embeddings in the database...", {
        current: chunks.length,
        total: chunks.length,
      });

      const rows = chunks.map((content, index) => ({
        document_id: doc.id,
        user_id: context.userId,
        chunk_index: index,
        content,
        embedding: embeddings[index] as unknown as string,
      }));

      const { error: cErr } = await supabase.from("document_chunks").insert(rows);
      if (cErr) {
        throw new Error(cErr.message);
      }

      await supabase
        .from("documents")
        .update({
          status: "ready",
          chunk_count: chunks.length,
          error_message: null,
        })
        .eq("id", doc.id);

      await updateUploadProgress(supabase, progressId, {
        status: "completed",
        stage: "completed",
        message: "Upload complete.",
        current: chunks.length,
        total: chunks.length,
        error_message: null,
      });

      console.log("[uploadDocument] completed", {
        documentId: doc.id,
        name: doc.name,
        chunkCount: chunks.length,
      });

      return { id: doc.id, name: doc.name, chunks: chunks.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      console.error("[uploadDocument] failed", error);

      await finalizeFailure(message);

      throw new Error(message);
    }
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) {
      throw new Error(error.message);
    }
    return { ok: true };
  });
