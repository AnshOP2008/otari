import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { listDocuments } from "@/lib/documents.functions";
import { listTasks } from "@/lib/tasks.functions";
import { useGoogleOAuth } from "@/hooks/use-google-oauth";
import {
  downloadCalendarTask,
  exportCalendarTask,
  listGoogleCalendars,
  previewGoogleImport,
  removeIntegrationDoc,
  syncCalendar,
  syncGmail,
} from "@/lib/google.functions";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "Google integrations - TaskBase" }] }),
  component: Integrations,
});

const scopes = {
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  availability: "https://www.googleapis.com/auth/calendar.freebusy",
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  export: "https://www.googleapis.com/auth/calendar.events",
};

function Integrations() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const loadDocs = useServerFn(listDocuments);
  const loadTasks = useServerFn(listTasks);
  const calendar = useServerFn(syncCalendar);
  const gmail = useServerFn(syncGmail);
  const loadPreview = useServerFn(previewGoogleImport);
  const remove = useServerFn(removeIntegrationDoc);
  const exportTask = useServerFn(exportCalendarTask);
  const downloadTask = useServerFn(downloadCalendarTask);
  const loadCalendars = useServerFn(listGoogleCalendars);
  const { data: documents = [] } = useQuery({ queryKey: ["documents"], queryFn: () => loadDocs() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => loadTasks() });
  const eligible = tasks.filter((task) => task.due_date && task.status !== "done");
  const [taskId, setTaskId] = useState("");
  const [calendarFile, setCalendarFile] = useState<{ taskId: string; url: string } | null>(null);
  const [days, setDays] = useState(14);
  const [calendarId, setCalendarId] = useState("primary");
  const [maxEmails, setMaxEmails] = useState(10);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [gmailQuery, setGmailQuery] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const { googleAvailable } = useGoogleOAuth();

  const connect = useMutation({
    mutationFn: async (scope: keyof typeof scopes | "all") => {
      sessionStorage.setItem("taskbase-google-connect", user.id);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth/callback",
          scopes: scope === "all" ? scopes.calendar + " " + scopes.gmail : scopes[scope],
          queryParams: { include_granted_scopes: "true", prompt: "consent" },
        },
      });
      if (error) {
        sessionStorage.removeItem("taskbase-google-connect");
        throw error;
      }
    },
    onError: (error) => toast.error(error.message),
  });

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.provider_token)
      throw new Error("Connect the Google permission for this action first.");
    return data.session.provider_token;
  }

  const calendars = useMutation({
    mutationFn: async () => loadCalendars({ data: { accessToken: await getToken() } }),
    onError: (error) => toast.error(error.message),
  });

  const preview = useMutation({
    mutationFn: async (service: "calendar" | "gmail") => {
      const filters = { calendarId, days, maxEmails, unreadOnly, gmailQuery };
      const entries = await loadPreview({
        data: { ...filters, service, accessToken: await getToken() },
      });
      return { entries, service, filters };
    },
    onMutate: () => setSelection([]),
    onError: (error) => toast.error(error.message),
  });

  const sync = useMutation({
    mutationFn: async () => {
      const reviewed = preview.data;
      if (!reviewed || !selection.length) throw new Error("Choose entries to import.");
      return (reviewed.service === "calendar" ? calendar : gmail)({
        data: { ...reviewed.filters, selection, accessToken: await getToken() },
      });
    },
    onSuccess: ({ imported }) => {
      void qc.invalidateQueries({ queryKey: ["documents"] });
      preview.reset();
      setSelection([]);
      toast.success(`Imported ${imported} reviewed ${imported === 1 ? "item" : "items"}.`);
    },
    onError: (error) => toast.error(error.message),
  });

  const forget = useMutation({
    mutationFn: (filename: "calendar!@#.txt" | "gmail!@#.txt") => remove({ data: { filename } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Removed the imported copy from TaskBase.");
    },
    onError: (error) => toast.error(error.message),
  });

  const publish = useMutation({
    mutationFn: async () => exportTask({ data: { accessToken: await getToken(), taskId } }),
    onSuccess: ({ updated }) =>
      toast.success(updated ? "Updated your Calendar event." : "Created your Calendar event."),
    onError: (error) => toast.error(error.message),
  });

  const download = useMutation({
    mutationFn: async () => {
      const text = await downloadTask({ data: { taskId } });
      const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
      setCalendarFile({ taskId, url });
    },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => {
    return () => {
      if (calendarFile) URL.revokeObjectURL(calendarFile.url);
    };
  }, [calendarFile]);

  const hasTask = eligible.some((task) => task.id === taskId);
  const reviewed = preview.data;
  useEffect(() => {
    if (reviewed) reviewHeading.current?.focus();
  }, [reviewed]);
  const busy =
    calendars.isPending ||
    connect.isPending ||
    preview.isPending ||
    sync.isPending ||
    forget.isPending ||
    publish.isPending ||
    download.isPending;
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="text-3xl font-semibold">Google integrations</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Choose what to import into your knowledge base. Importing does not spend AI credits. Chat
        uses your imported sources only when source search is enabled.
      </p>
      {!googleAvailable && (
        <p className="mt-4 rounded-lg border bg-card p-3 text-sm">
          Google OAuth is unavailable in this local workspace. Upload sample notes to test the same
          search and planning features.
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="card-soft space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-2xl">
            <Calendar size={20} /> Calendar import
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">
              Calendar
              <select
                value={calendarId}
                onChange={(event) => setCalendarId(event.target.value)}
                className="ml-2 max-w-52 rounded border bg-background p-1"
              >
                <option value="primary">Primary calendar</option>
                {calendars.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !googleAvailable}
              onClick={() => calendars.mutate()}
            >
              {calendars.isPending ? "Loading calendars…" : "Load shared calendars"}
            </Button>
          </div>
          <label className="block text-sm">
            Look ahead
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="ml-2 rounded border bg-background p-1"
            >
              {[7, 14, 30, 60].map((value) => (
                <option key={value} value={value}>
                  {value} days
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !googleAvailable}
              onClick={() => connect.mutate("calendar")}
            >
              Allow Calendar read
            </Button>
            <Button
              variant="outline"
              disabled={busy || !googleAvailable}
              onClick={() => connect.mutate("availability")}
            >
              Allow free/busy access
            </Button>
            <Button disabled={busy || !googleAvailable} onClick={() => preview.mutate("calendar")}>
              {preview.isPending && preview.variables === "calendar"
                ? "Loading events…"
                : "Preview events"}
            </Button>
          </div>
          <Snapshot
            name="calendar!@#.txt"
            documents={documents}
            onRemove={() => forget.mutate("calendar!@#.txt")}
            busy={busy}
          />
        </section>

        <section className="card-soft space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-2xl">
            <Mail size={20} /> Gmail import
          </h2>
          <label className="block text-sm">
            Inbox messages
            <select
              value={maxEmails}
              onChange={(event) => setMaxEmails(Number(event.target.value))}
              className="ml-2 rounded border bg-background p-1"
            >
              {[5, 10, 20].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
            />{" "}
            Unread only
          </label>
          <label className="block text-sm">
            Gmail search filter (optional)
            <input
              value={gmailQuery}
              onChange={(event) => setGmailQuery(event.target.value)}
              maxLength={160}
              placeholder="e.g. subject:handoff newer_than:14d"
              className="mt-1 block w-full rounded border bg-background px-2 py-1.5"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Imports sender, subject, date and preview. No attachments or email sending.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !googleAvailable}
              onClick={() => connect.mutate("gmail")}
            >
              Allow Gmail read
            </Button>
            <Button disabled={busy || !googleAvailable} onClick={() => preview.mutate("gmail")}>
              {preview.isPending && preview.variables === "gmail"
                ? "Loading inbox…"
                : "Preview inbox"}
            </Button>
          </div>
          <Snapshot
            name="gmail!@#.txt"
            documents={documents}
            onRemove={() => forget.mutate("gmail!@#.txt")}
            busy={busy}
          />
        </section>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || !googleAvailable}
          onClick={() => connect.mutate("all")}
        >
          Allow both imports
        </Button>
      </div>

      {reviewed && (
        <section className="card-soft mt-6 space-y-4 p-5" aria-labelledby="import-review">
          <h2 id="import-review" className="text-xl" ref={reviewHeading} tabIndex={-1}>
            Review {reviewed.service === "calendar" ? "Calendar events" : "Gmail messages"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose what TaskBase can search. Confirming replaces the saved snapshot for this source.
          </p>
          {reviewed.entries.length === 0 ? (
            <p className="text-sm">No results matched. Your saved snapshot is still available.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {reviewed.entries.map((entry) => (
                <div key={entry.key} className="rounded border border-border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selection.includes(entry.key)}
                      disabled={busy}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelection((current) =>
                          checked
                            ? [...current, entry.key]
                            : current.filter((key) => key !== entry.key),
                        );
                      }}
                    />
                    {entry.title}
                  </label>
                  <details className="mt-1 pl-5 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      See captured text
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap break-words">{entry.text}</p>
                  </details>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !selection.length} onClick={() => sync.mutate()}>
              {sync.isPending ? "Importing…" : `Import selected (${selection.length})`}
            </Button>
            {reviewed.entries.length > 0 && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setSelection(
                    selection.length === reviewed.entries.length
                      ? []
                      : reviewed.entries.map((entry) => entry.key),
                  )
                }
              >
                {selection.length === reviewed.entries.length ? "Clear selection" : "Select all"}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                preview.reset();
                setSelection([]);
              }}
            >
              Close preview
            </Button>
          </div>
        </section>
      )}

      <section className="card-soft mt-6 space-y-4 p-5">
        <h2 className="text-2xl">Send one task to Calendar</h2>
        <p className="text-sm text-muted-foreground">
          Creates an all-day event on the due date. Sending the same task again updates its event.
        </p>
        <label className="block text-sm">
          Task
          <select
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            className="ml-2 max-w-full rounded border bg-background p-1"
          >
            <option value="">Choose a dated open task</option>
            {eligible.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title} · {task.due_date}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !googleAvailable}
            onClick={() => connect.mutate("export")}
          >
            Allow Calendar write
          </Button>
          <Button disabled={busy || !googleAvailable || !hasTask} onClick={() => publish.mutate()}>
            Send selected task
          </Button>
          <Button variant="outline" disabled={busy || !hasTask} onClick={() => download.mutate()}>
            Prepare calendar file
          </Button>
          {hasTask && calendarFile?.taskId === taskId && (
            <Button variant="outline" asChild>
              <a href={calendarFile.url} download="taskbase-task.ics">
                Download calendar file
              </a>
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}

function Snapshot({
  name,
  documents,
  onRemove,
  busy,
}: {
  name: string;
  documents: Awaited<ReturnType<typeof listDocuments>>;
  onRemove: () => void;
  busy: boolean;
}) {
  const doc = documents.find((entry) => entry.name === name && entry.status === "ready");
  if (!doc) return <p className="text-xs text-muted-foreground">No imported snapshot.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Imported {new Date(doc.created_at).toLocaleString()}</span>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
        Remove imported copy
      </Button>
    </div>
  );
}
