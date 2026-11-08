import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ListTodo, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AgentTimeline, REFINE_STEPS } from "@/components/ai/agent-timeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { chat, clearChat, listChatMessages, refineTasksWithAI } from "@/lib/ai.functions";
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

function ChatPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listChatMessages);
  const send = useServerFn(chat);
  const wipe = useServerFn(clearChat);
  const refine = useServerFn(refineTasksWithAI);

  const messagesQuery = useQuery({ queryKey: ["chat"], queryFn: () => list() });
  const [input, setInput] = useState("");
  const [stage, setStage] = useState(INITIAL_STAGE);
  const [refining, setRefining] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    requestAnimationFrame(() => {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length, stage, refining]);

  const sendMut = useMutation({
    mutationFn: async (message: string) => {
      setStage("Searching uploaded documents...");
      const result = await send({ data: { message } });
      setStage("Validating AI response...");
      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["chat"] });

      if (!result.updateTasks) {
        setStage(INITIAL_STAGE);
        return;
      }

      setRefining(true);
      setStage("Updating tasks from chat and documents...");
      toast.message("Updating tasks from chat and documents...", {
        icon: <Sparkles className="h-4 w-4" />,
      });

      try {
        const refined = await refine();
        await queryClient.invalidateQueries({ queryKey: ["tasks"] });
        await queryClient.invalidateQueries({ queryKey: ["task-summary"] });

        const parts: string[] = [];
        if (refined.changes.added) parts.push(`${refined.changes.added} added`);
        if (refined.changes.removed) parts.push(`${refined.changes.removed} removed`);
        parts.push(`${refined.count} total`);

        toast.success(`Tasks updated: ${parts.join(", ")}`, {
          description: refined.summary,
          duration: 6000,
        });
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setRefining(false);
        setStage(INITIAL_STAGE);
      }
    },
    onError: (error) => {
      setStage(INITIAL_STAGE);
      toast.error((error as Error).message);
    },
  });

  const clearMut = useMutation({
    mutationFn: () => wipe(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat"] }),
    onError: (error) => toast.error((error as Error).message),
  });

  const submit = (text?: string) => {
    const message = (text ?? input).trim();
    // if (!message || sendMut.isPending || refining || isBusy) {
    if (!message || sendMut.isPending || refining) {
      return;
    }

    setInput("");
    setStage("Generating AI response...");
    sendMut.mutate(message);
  };

  const busy = sendMut.isPending || refining;

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask for tasks, planning, or answers from your uploaded documents.
          </p>
        </div>
        {messages.length > 0 && (
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
        {(messages.length === 0 || 1) && (
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
        {messages.map((message) => (
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
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm sm:max-w-[80%]">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{stage}</span>
              </div>
              {refining && <AgentTimeline steps={REFINE_STEPS} active={true} />}
            </div>
          </div>
        )}
      </div>

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
          placeholder="Ask anything..."
          rows={2}
          className="resize-none"
        />
        <Button type="submit" disabled={busy || !input.trim()} className="w-full sm:w-auto">
          <Send className="mr-2 h-4 w-4 sm:mr-0" />
          <span className="sm:hidden">Send</span>
        </Button>
      </form>
    </main>
  );
}
