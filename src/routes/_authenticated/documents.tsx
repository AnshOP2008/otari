import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteDocument,
  listDocuments,
  searchKnowledge,
  uploadDocument,
} from "@/lib/documents.functions";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents - TaskBase" },
      {
        name: "description",
        content: "Upload notes, PDFs, and text files. TaskBase will use them as context.",
      },
    ],
  }),
  component: DocumentsPage,
});

const ACCEPTED = ".txt,.md,.pdf";
const MAX_SIZE = 8 * 1024 * 1024;

type UploadProgressRow = {
  id: string;
  status: "running" | "cancel_requested" | "cancelled" | "completed" | "failed";
  stage: string;
  message: string;
  current: number;
  total: number;
  error_message: string | null;
  updated_at: string;
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function DocumentsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listDocuments);
  const upload = useServerFn(uploadDocument);
  const del = useServerFn(deleteDocument);
  const search = useServerFn(searchKnowledge);
  const [searchQuery, setSearchQuery] = useState("");
  const searchMut = useMutation({ mutationFn: (query: string) => search({ data: { query } }) });

  const inputRef = useRef<HTMLInputElement>(null);
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressRow | null>(null);

  const docsQuery = useQuery({ queryKey: ["documents"], queryFn: () => list() });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
    onError: (error) => toast.error((error as Error).message),
  });

  const docs = docsQuery.data ?? [];
  useEffect(
    () => () => {
      if (progressPollRef.current) clearInterval(progressPollRef.current);
    },
    [],
  );

  const stopProgressPolling = () => {
    if (progressPollRef.current) {
      clearInterval(progressPollRef.current);
      progressPollRef.current = null;
    }
  };

  const fetchProgress = async (progressId: string) => {
    const { data, error } = await supabase
      .from("upload_progress")
      .select("id, status, stage, message, current, total, error_message, updated_at")
      .eq("id", progressId)
      .maybeSingle();

    if (error) {
      console.error("[documents] progress read failed", error);
      return;
    }

    if (data) {
      setUploadProgress((current) =>
        current?.id === data.id && current.updated_at > data.updated_at ? current : data,
      );
    }
  };

  const startProgressPolling = (progressId: string) => {
    stopProgressPolling();
    void fetchProgress(progressId);
    progressPollRef.current = setInterval(() => {
      void fetchProgress(progressId);
    }, 1000);
  };

  const handleCancelUpload = async () => {
    if (!uploadProgress?.id || !uploading) {
      return;
    }

    setCancelling(true);

    try {
      const { error } = await supabase
        .from("upload_progress")
        .update({
          status: "cancel_requested",
          stage: "cancel_requested",
          message: "Cancel requested...",
          updated_at: new Date().toISOString(),
        })
        .eq("id", uploadProgress.id)
        .eq("status", "running");

      if (error) {
        throw new Error(error.message);
      }

      toast.info("Cancel requested");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} is larger than 8MB.`);
        continue;
      }

      setUploading(true);
      setUploadProgress(null);

      const progressId = crypto.randomUUID();

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("You need to be signed in before uploading documents.");
        }

        const { error: progressInsertError } = await supabase.from("upload_progress").insert({
          id: progressId,
          user_id: user.id,
          status: "running",
          stage: "starting",
          message: "Starting upload...",
          current: 0,
          total: 0,
          error_message: null,
          updated_at: new Date().toISOString(),
        });

        if (progressInsertError) {
          throw new Error(progressInsertError.message);
        }

        startProgressPolling(progressId);

        const base64 = await fileToBase64(file);
        const res = await upload({ data: { name: file.name, base64, progressId } });
        await fetchProgress(progressId);
        toast.success(`Indexed ${res.name} (${res.chunks} chunks).`);
        qc.invalidateQueries({ queryKey: ["documents"] });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        if (message.toLowerCase().includes("cancel")) {
          toast.info("Upload cancelled");
        } else {
          toast.error(`${file.name}: ${message}`);
        }
      } finally {
        stopProgressPolling();
        setUploading(false);
        setCancelling(false);
      }
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const progressPercent =
    uploadProgress && uploadProgress.total > 0
      ? Math.min(100, Math.round((uploadProgress.current / uploadProgress.total) * 100))
      : uploadProgress
        ? 10
        : 0;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Upload Data</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Upload notes, PDFs, and text files. TaskBase will use them as knowledge in chat and task
            refinement.
          </p>
        </div>

        <div className="w-full sm:w-auto">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            {uploading && uploadProgress ? (
              <Button
                variant="outline"
                onClick={handleCancelUpload}
                disabled={cancelling}
                className="w-full sm:w-auto"
              >
                {cancelling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                {cancelling ? "Cancelling" : "Cancel"}
              </Button>
            ) : null}
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <section className="mt-6 card-soft p-4">
        <h2 className="text-xl">Search sources</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Preview the passages chat can retrieve. Searches use no AI credits.
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!searchMut.isPending && searchQuery.trim().length >= 2)
              searchMut.mutate(searchQuery.trim());
          }}
        >
          <input
            aria-label="Search query"
            value={searchQuery}
            maxLength={300}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Try a deadline, project name, or phrase"
            className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={searchMut.isPending || searchQuery.trim().length < 2}>
            Search
          </Button>
        </form>
        {searchMut.error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {searchMut.error.message}
          </p>
        )}
        {searchMut.data && (
          <div className="mt-3 space-y-2" role="status">
            <p className="text-xs text-muted-foreground">
              {searchMut.data.length
                ? `${searchMut.data.length} matching passage${searchMut.data.length === 1 ? "" : "s"}`
                : "No matching passages."}
            </p>
            {searchMut.data.map((source) => (
              <details
                key={source.id + ":" + source.section}
                className="rounded-md border p-2 text-sm"
              >
                <summary className="cursor-pointer">
                  {source.name} · section {source.section}
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{source.excerpt}</p>
              </details>
            ))}
          </div>
        )}
      </section>

      {(uploading || uploadProgress) && (
        <div className="mt-6 card-soft p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium capitalize">
                  {uploadProgress?.stage?.replace(/_/g, " ") ?? "Preparing upload"}
                </h2>
                {uploadProgress?.status === "completed" && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> complete
                  </span>
                )}
                {uploadProgress?.status === "failed" && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-700">
                    <AlertCircle className="h-3.5 w-3.5" /> failed
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {uploadProgress?.message ?? "Preparing your file..."}
              </p>
              <Progress value={progressPercent} className="mt-3 h-2" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{progressPercent}%</span>
                {uploadProgress?.total ? (
                  <span>
                    {uploadProgress.current} / {uploadProgress.total}
                  </span>
                ) : null}
              </div>
              {uploadProgress?.error_message ? (
                <p className="mt-2 whitespace-pre-line text-sm text-red-700">
                  {uploadProgress.error_message}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-border/70 bg-card/60 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-medium">Saved Data</h2>
          <span className="text-sm text-muted-foreground">
            {docs.length} document{docs.length === 1 ? "" : "s"}
          </span>
        </div>

        {docsQuery.isLoading ? (
          <div className="mt-4 text-sm text-muted-foreground">Loading documents...</div>
        ) : docs.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No documents yet. Upload a syllabus, lecture notes, or a PDF to get started.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/70 p-3 sm:flex-row sm:items-center"
              >
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{doc.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{format(parseISO(doc.created_at as string), "MMM d, h:mm a")}</span>
                    {doc.status === "ready" && (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        {doc.chunk_count} chunks indexed
                      </span>
                    )}
                    {doc.status === "processing" && (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        processing
                      </span>
                    )}
                    {doc.status === "failed" && (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <AlertCircle className="h-3 w-3" />
                        {doc.error_message || "failed"}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => delMut.mutate(doc.id as string)}
                  disabled={delMut.isPending}
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
