import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ListTodo, Loader2, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AgentTimeline, REFINE_STEPS } from "@/components/ai/agent-timeline";
import { Button } from "@/components/ui/button";
import { CalendarSourceLink } from "@/components/calendar-source-link";
import { sourceHeading, sourceLabel } from "@/lib/document-text";
import { Textarea } from "@/components/ui/textarea";
import { chat, clearChat, listChatMessages, refineTasksWithAI } from "@/lib/ai.functions";
import { z } from "zod";
import { listDocuments, searchKnowledge } from "@/lib/documents.functions";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat - TaskBase" },
      { name: "description", content: "Talk with your AI productivity assistant." },
    ],
  }),
  component: ChatPage,
});

// const SUGGESTIONS = [
//   "Generate tasks from my uploaded documents",
//   "Update my task list based on our last messages",
//   "Plan my week and create the tasks for it",
// ];
const SUGGESTIONS: string[] = [
  "I'm bored generate me different tasks to do for fun",
  "Tell me something to work on and break it down into smaller tasks and put them on my Task board",
  "Add a task for finishing my Math homework",
  "Generate a summary for current tasks",
  "Summarise tasks from the uploaded docs",
];
const INITIAL_STAGE = "Ready";
const sourceRefs = z.array(
  z.object({
    number: z.number(),
    name: z.string(),
    section: z.number(),
    excerpt: z.string(),
    title: z.string().nullish(),
    url: z.string().nullish(),
  }),
);

function ChatPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listChatMessages);
  const send = useServerFn(chat);
  const search = useServerFn(searchKnowledge);
  const wipe = useServerFn(clearChat);
  const refine = useServerFn(refineTasksWithAI);
  const listDocs = useServerFn(listDocuments);
  const { data: documents = [] } = useQuery({ queryKey: ["documents"], queryFn: () => listDocs() });
  const [useSources, setUseSources] = useState(true);
  const [includeBoard, setIncludeBoard] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [searchOnly, setSearchOnly] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [suggestTasks, setSuggestTasks] = useState(false);

  const messagesQuery = useQuery({ queryKey: ["chat"], queryFn: () => list() });
  const [input, setInput] = useState("");
  const [stage, setStage] = useState(INITIAL_STAGE);
  const [refining, setRefining] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = messagesQuery.data ?? [];
  const selectedSource = documents.find((doc) => doc.id === sourceId && doc.status === "ready")?.id;
  const searchMut = useMutation({
    mutationFn: (query: string) => search({ data: { query, sourceId: selectedSource } }),
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    requestAnimationFrame(() => {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length, stage, refining, searchMut.data]);

  const sendMut = useMutation({
    mutationFn: (message: string) =>
      send({
        data: {
          message,
          useSources,
          includeBoard,
          includeHistory,
          sourceId: useSources ? selectedSource : undefined,
        },
      }),
    onSuccess: async (result) => {
      setInput("");
      setSuggestTasks(result.updateTasks);
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setStage(INITIAL_STAGE),
  });

  async function addSuggestedTasks() {
    setRefining(true);
    setStage("Finding tasks supported by sources and chat…");
    try {
      const result = await refine();
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["task-summary"] });
      toast.success(result.summary);
      setSuggestTasks(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add tasks.");
    } finally {
      setRefining(false);
      setStage(INITIAL_STAGE);
    }
  }

  const clearMut = useMutation({
    mutationFn: () => wipe(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat"] }),
    onError: (error) => toast.error((error as Error).message),
  });

  const submit = (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    if (searchOnly) {
      if (message.length >= 2 && message.length <= 300) searchMut.mutate(message);
      return;
    }

    setInput(message);
    setStage("Searching sources and drafting a reply…");
    sendMut.mutate(message);
  };

  const busy = sendMut.isPending || refining || searchMut.isPending;
  const validInput = searchOnly
    ? input.trim().length >= 2 && input.trim().length <= 300
    : !!input.trim();
  const submitLabel = searchOnly ? "Search" : "Send";

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask for tasks, planning, or answers from your uploaded documents.
          </p>
        </div>
        {!searchOnly && messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearMut.mutate()}
            className="w-full sm:w-auto"
            disabled={busy}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scroll-smooth"
      >
        {!searchOnly && messages.length === 0 && (
          <div className="rounded-lg border border-border p-5 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-primary" />
            <h3 className="mt-2 font-medium">What should we work on?</h3>
            <div className="mt-4 grid gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => submit(suggestion)}
                  className="rounded-md border border-border px-3 py-2 text-left text-sm transition hover:bg-secondary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              <button
                onClick={() => navigate({ to: "/documents" })}
                className="inline-flex items-center gap-1 underline"
              >
                <FileText className="h-3 w-3" />
                Documents
              </button>
              <button
                onClick={() => navigate({ to: "/home" })}
                className="inline-flex items-center gap-1 underline"
              >
                <ListTodo className="h-3 w-3" />
                Tasks
              </button>
            </div>
          </div>
        )}
        {/* className="prose prose-sm max-w-none dark:prose-invert" */}
        {!searchOnly &&
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap wrap-break-words prose prose-sm max-w-none dark:prose-invert sm:max-w-[80%] ${
                  message.role === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm border border-border bg-card"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="h-3 w-3" />
                    assistant
                  </div>
                )}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                <SourceNotes value={message.source_refs} />
              </div>
            </div>
          ))}

        {searchOnly && (
          <section
            className="rounded-lg border border-border p-4 text-sm"
            aria-label="Passage search results"
          >
            <p>
              Find matching text in saved sources. This search uses no model and stays out of chat
              history.
            </p>
            {searchMut.error && (
              <p role="alert" className="mt-2 text-destructive">
                {searchMut.error.message}
              </p>
            )}
            {searchMut.data?.length === 0 && (
              <p className="mt-2" role="status">
                No matching passages.
              </p>
            )}
            <SourceNotes value={searchMut.data} heading="Matching passages" expanded />
          </section>
        )}

        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm sm:max-w-[80%]">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{searchOnly ? "Searching saved sources…" : stage}</span>
              </div>
              {refining && <AgentTimeline steps={REFINE_STEPS} active={true} />}
            </div>
          </div>
        )}
      </div>

      {!searchOnly && suggestTasks && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>Run a separate Otari request to find tasks in saved sources and recent chat?</span>
          <Button size="sm" onClick={addSuggestedTasks} disabled={busy}>
            Add supported tasks
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSuggestTasks(false)} disabled={busy}>
            Dismiss
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={searchOnly}
            onChange={(event) => {
              setSearchOnly(event.target.checked);
              searchMut.reset();
            }}
            disabled={busy}
          />
          Search only
        </label>
        {!searchOnly && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useSources}
              onChange={(event) => setUseSources(event.target.checked)}
              disabled={busy}
            />
            Search knowledge base
          </label>
        )}
        {(searchOnly || useSources) && (
          <label>
            Source
            <select
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                searchMut.reset();
              }}
              disabled={busy}
              className="ml-2 max-w-[13rem] rounded border bg-background p-1"
            >
              <option value="">All ready sources</option>
              {documents
                .filter((doc) => doc.status === "ready")
                .map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {sourceLabel(doc.name)}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {!searchOnly && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-medium">Additional context sent to Otari</summary>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeBoard}
                onChange={(event) => setIncludeBoard(event.target.checked)}
                disabled={busy}
              />
              Include task board
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeHistory}
                onChange={(event) => setIncludeHistory(event.target.checked)}
                disabled={busy}
              />
              Include recent chat
            </label>
          </div>
          <p className="mt-1 text-muted-foreground">
            Earlier replies may contain quotes from saved sources.
          </p>
        </details>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={
            searchOnly
              ? "Search by topic or phrase (2–300 characters)"
              : "Ask about your work or sources..."
          }
          aria-label={searchOnly ? "Search query" : "Chat message"}
          maxLength={searchOnly ? 300 : 2500}
          disabled={busy}
          rows={2}
          className="resize-none"
        />
        <Button
          type="submit"
          aria-label={submitLabel}
          disabled={busy || !validInput}
          className="w-full sm:w-auto"
        >
          {searchOnly ? (
            <Search className="mr-2 h-4 w-4 sm:mr-0" />
          ) : (
            <Send className="mr-2 h-4 w-4 sm:mr-0" />
          )}
          <span className="sm:hidden">{submitLabel}</span>
        </Button>
      </form>
    </main>
  );
}

function SourceNotes({
  value,
  heading = "Sources cited",
  expanded = false,
}: {
  value: unknown;
  heading?: string;
  expanded?: boolean;
}) {
  const parsed = sourceRefs.safeParse(value);
  if (!parsed.success || !parsed.data.length) return null;
  return (
    <details open={expanded || undefined} className="mt-2 border-t pt-2 text-xs">
      <summary className="cursor-pointer font-medium">
        {heading} ({parsed.data.length})
      </summary>
      {parsed.data.map((source) => (
        <div key={source.number} className="mt-3">
          <strong>
            [{source.number}] {sourceHeading(source)}
          </strong>
          <blockquote className="my-1 max-h-40 overflow-auto whitespace-pre-wrap">
            {source.excerpt}
          </blockquote>
          <CalendarSourceLink url={source.url} />
        </div>
      ))}
    </details>
  );
}
