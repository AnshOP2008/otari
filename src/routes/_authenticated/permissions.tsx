import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { CalendarSourceLink } from "@/components/calendar-source-link";
import { supabase } from "@/integrations/supabase/client";
import { listDocuments } from "@/lib/documents.functions";
import { listTasks } from "@/lib/tasks.functions";
import { useGoogleOAuth } from "@/hooks/use-google-oauth";
import {
  checkCalendarFocusSlot,
  downloadCalendarTask,
  exportCalendarTask,
  listGmailLabels,
  listGoogleCalendars,
  previewGoogleImport,
  removeIntegrationDoc,
  syncCalendar,
  syncGmail,
} from "@/lib/google.functions";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "Google integrations - TaskBase" }] }),
  validateSearch: z.object({ focusTask: z.string().uuid().optional().catch(undefined) }),
  component: Integrations,
});

const scopes = {
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  availability: "https://www.googleapis.com/auth/calendar.freebusy",
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  export: "https://www.googleapis.com/auth/calendar.events",
};
const gmailSystemLabels = [
  { id: "INBOX", name: "Inbox" },
  { id: "STARRED", name: "Starred" },
];
const calendarDraftSchema = z.object({
  userId: z.string().uuid(),
  taskId: z.string().uuid(),
  timed: z.boolean(),
  blockStart: z.string(),
  blockDurationOverride: z.number().int().min(1).max(1440).nullable(),
  includeDescription: z.boolean(),
});

function Integrations() {
  const { user } = Route.useRouteContext();
  const { focusTask } = Route.useSearch();
  const qc = useQueryClient();
  const loadDocs = useServerFn(listDocuments);
  const loadTasks = useServerFn(listTasks);
  const calendar = useServerFn(syncCalendar);
  const gmail = useServerFn(syncGmail);
  const loadPreview = useServerFn(previewGoogleImport);
  const remove = useServerFn(removeIntegrationDoc);
  const exportTask = useServerFn(exportCalendarTask);
  const checkAvailability = useServerFn(checkCalendarFocusSlot);
  const downloadTask = useServerFn(downloadCalendarTask);
  const loadCalendars = useServerFn(listGoogleCalendars);
  const loadLabels = useServerFn(listGmailLabels);
  const { data: documents = [] } = useQuery({ queryKey: ["documents"], queryFn: () => loadDocs() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => loadTasks() });
  const [taskId, setTaskId] = useState(focusTask ?? "");
  const [timed, setTimed] = useState(Boolean(focusTask));
  const [blockStart, setBlockStart] = useState("");
  const [blockDurationOverride, setBlockDurationOverride] = useState<number | null>(null);
  const [includeDescription, setIncludeDescription] = useState(false);
  const [calendarFile, setCalendarFile] = useState<{ key: string; url: string } | null>(null);
  const eligible = tasks.filter((task) => task.status !== "done" && (timed || task.due_date));
  const selectedTask = eligible.find((task) => task.id === taskId);
  const estimate = selectedTask?.estimate_minutes;
  const blockMinutes = blockDurationOverride ?? (estimate && estimate <= 1440 ? estimate : 45);
  const start = new Date(blockStart);
  const slot =
    timed &&
    Number.isFinite(start.getTime()) &&
    Number.isInteger(blockMinutes) &&
    blockMinutes >= 1 &&
    blockMinutes <= 1440
      ? {
          start: start.toISOString(),
          end: new Date(start.getTime() + blockMinutes * 60_000).toISOString(),
        }
      : undefined;
  const calendarInput = { taskId, includeDescription, slot };
  const canExport = Boolean(selectedTask && (!timed || slot));
  const calendarKey = JSON.stringify([calendarInput, selectedTask?.updated_at]);
  const slotKey = slot ? slot.start + "/" + slot.end : null;
  const [days, setDays] = useState(14);
  const [calendarId, setCalendarId] = useState("primary");
  const [maxEmails, setMaxEmails] = useState(10);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [gmailQuery, setGmailQuery] = useState("");
  const [gmailLabelId, setGmailLabelId] = useState("INBOX");
  const [includeThreadContext, setIncludeThreadContext] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const { googleAvailable } = useGoogleOAuth();

  useEffect(() => {
    const rawDraft = sessionStorage.getItem("taskbase-google-calendar-draft");
    sessionStorage.removeItem("taskbase-google-calendar-draft");
    if (!rawDraft) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDraft);
    } catch {
      return;
    }
    const draft = calendarDraftSchema.safeParse(parsed);
    if (!draft.success || draft.data.userId !== user.id || draft.data.taskId !== focusTask) return;
    setTaskId(draft.data.taskId);
    setTimed(draft.data.timed);
    setBlockStart(draft.data.blockStart);
    setBlockDurationOverride(draft.data.blockDurationOverride);
    setIncludeDescription(draft.data.includeDescription);
  }, [focusTask, user.id]);

  const connect = useMutation({
    mutationFn: async (scope: keyof typeof scopes | "all") => {
      sessionStorage.setItem("taskbase-google-connect", user.id);
      if (selectedTask && (scope === "export" || scope === "availability")) {
        sessionStorage.setItem("taskbase-google-focus-task", selectedTask.id);
        sessionStorage.setItem(
          "taskbase-google-calendar-draft",
          JSON.stringify({
            userId: user.id,
            taskId: selectedTask.id,
            timed,
            blockStart,
            blockDurationOverride: slot ? blockDurationOverride : null,
            includeDescription,
          }),
        );
      } else {
        sessionStorage.removeItem("taskbase-google-focus-task");
        sessionStorage.removeItem("taskbase-google-calendar-draft");
      }
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
        sessionStorage.removeItem("taskbase-google-focus-task");
        sessionStorage.removeItem("taskbase-google-calendar-draft");
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

  const labels = useMutation({
    mutationFn: async () => loadLabels({ data: { accessToken: await getToken() } }),
    onSuccess: (customLabels) => {
      setGmailLabelId((id) =>
        [...gmailSystemLabels, ...customLabels].some((label) => label.id === id) ? id : "INBOX",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const gmailLabels = [...gmailSystemLabels, ...(labels.data ?? [])];

  const preview = useMutation({
    mutationFn: async (service: "calendar" | "gmail") => {
      const filters = {
        calendarId,
        days,
        maxEmails,
        unreadOnly,
        gmailLabelId,
        gmailQuery,
        includeThreadContext,
      };
      const gmailLabelName = gmailLabels.find((label) => label.id === gmailLabelId)?.name;
      const entries = await loadPreview({
        data: { ...filters, service, accessToken: await getToken() },
      });
      return { entries, service, filters, gmailLabelName };
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

  const availability = useMutation({
    mutationFn: async (window: NonNullable<typeof slot>) => {
      const endOfDay = new Date(window.start);
      endOfDay.setHours(24, 0, 0, 0);
      return checkAvailability({
        data: { ...window, searchEnd: endOfDay.toISOString(), accessToken: await getToken() },
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const checkedWindow = availability.variables;
  const checkedSlotKey = checkedWindow ? checkedWindow.start + "/" + checkedWindow.end : null;
  const alternative = availability.data?.alternative;
  const alternativeKey = alternative ? alternative.start + "/" + alternative.end : null;
  const slotAvailability = slotKey && slotKey === checkedSlotKey ? availability.data : undefined;
  const checkedFree =
    slotAvailability?.isFree === true || Boolean(slotKey && slotKey === alternativeKey);
  const checkedBusy = slotAvailability?.isFree === false;
  const alternativeStart = alternative ? new Date(alternative.start) : null;
  const localAlternative = alternativeStart
    ? new Date(alternativeStart.getTime() - alternativeStart.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
    : null;
  const usableAlternative =
    localAlternative && new Date(localAlternative).getTime() === alternativeStart?.getTime()
      ? localAlternative
      : null;

  const publish = useMutation({
    mutationFn: async (input: typeof calendarInput & { requireFreeSlot: boolean }) =>
      exportTask({ data: { ...input, accessToken: await getToken() } }),
    onSuccess: ({ updated, receiptSaved }) => {
      if (receiptSaved) void qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(updated ? "Updated your Calendar event." : "Created your Calendar event.");
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => availability.reset(),
  });
  const latestReceipt = publish.variables?.taskId === selectedTask?.id ? publish.data : undefined;
  const lastSent = latestReceipt?.exportedAt ?? selectedTask?.calendar_exported_at;
  const eventUrl = latestReceipt ? latestReceipt.url : selectedTask?.calendar_event_url;

  const download = useMutation({
    mutationFn: async ({ input, key }: { input: typeof calendarInput; key: string }) => {
      const text = await downloadTask({ data: input });
      const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
      setCalendarFile({ key, url });
    },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => {
    return () => {
      if (calendarFile) URL.revokeObjectURL(calendarFile.url);
    };
  }, [calendarFile]);

  const reviewed = preview.data;
  useEffect(() => {
    if (reviewed) reviewHeading.current?.focus();
  }, [reviewed]);
  const busy =
    calendars.isPending ||
    labels.isPending ||
    connect.isPending ||
    preview.isPending ||
    sync.isPending ||
    forget.isPending ||
    availability.isPending ||
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">
              Gmail label
              <select
                value={gmailLabelId}
                onChange={(event) => setGmailLabelId(event.target.value)}
                disabled={busy}
                className="ml-2 max-w-52 rounded border bg-background p-1"
              >
                {gmailLabels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !googleAvailable}
              onClick={() => labels.mutate()}
            >
              {labels.isPending ? "Loading labels…" : "Load custom labels"}
            </Button>
          </div>
          {labels.data?.length === 0 && (
            <p className="text-xs text-muted-foreground" role="status">
              No custom labels found.
            </p>
          )}
          <label className="block text-sm">
            Maximum matches
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeThreadContext} disabled={busy}
              onChange={(event) => setIncludeThreadContext(event.target.checked)} />
            Include recent replies
          </label>
          {includeThreadContext && (
            <p className="text-xs text-muted-foreground">
              Preview up to three recent messages per matching conversation, including sent or archived replies.
            </p>
          )}
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
                ? "Loading messages…"
                : "Preview Gmail"}
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
            Review {reviewed.service === "calendar" ? "Calendar events"
              : reviewed.filters.includeThreadContext ? "Gmail conversations" : "Gmail messages"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose what TaskBase can search. Confirming replaces the saved snapshot for this source.
          </p>
          {reviewed.service === "gmail" && reviewed.gmailLabelName && (
            <p className="text-sm text-muted-foreground">
              Gmail label · {reviewed.gmailLabelName}
            </p>
          )}
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
                    <CalendarSourceLink url={entry.url} />
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

      <section id="calendar-export" className="card-soft mt-6 space-y-4 p-5">
        <h2 className="text-2xl">Send one task to Calendar</h2>
        <p className="text-sm text-muted-foreground">
          Choose an all-day due date or schedule time to work. Sending the same task again updates
          its event on your primary Calendar.
        </p>
        <label className="block text-sm">
          Event type
          <select
            value={timed ? "timed" : "all-day"}
            onChange={(event) => {
              setTimed(event.target.value === "timed");
              availability.reset();
            }}
            disabled={busy}
            className="ml-2 rounded border bg-background p-1"
          >
            <option value="all-day">All-day due date</option>
            <option value="timed">Timed focus block</option>
          </select>
        </label>
        <label className="block text-sm">
          Task
          <select
            value={selectedTask?.id ?? ""}
            onChange={(event) => {
              setTaskId(event.target.value);
              setBlockDurationOverride(null);
            }}
            disabled={busy}
            className="ml-2 max-w-full rounded border bg-background p-1"
          >
            <option value="">{timed ? "Choose an open task" : "Choose a dated open task"}</option>
            {eligible.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
                {task.due_date ? " · " + task.due_date : ""}
              </option>
            ))}
          </select>
        </label>
        {timed && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Start (device time)
              <input
                type="datetime-local"
                value={blockStart}
                onInput={(event) => {
                  setBlockStart(event.currentTarget.value);
                  availability.reset();
                }}
                disabled={busy}
                className="mt-1 block w-full rounded border bg-background p-2"
              />
            </label>
            <div className="text-sm">
              <label htmlFor="focus-block-duration">Duration in minutes</label>
              <input
                id="focus-block-duration"
                aria-describedby={estimate != null ? "focus-block-estimate" : undefined}
                type="number"
                min={1}
                max={1440}
                step={1}
                value={Number.isNaN(blockMinutes) ? "" : blockMinutes}
                onChange={(event) => {
                  setBlockDurationOverride(event.target.valueAsNumber);
                  availability.reset();
                }}
                disabled={busy}
                className="mt-1 block w-full rounded border bg-background p-2"
              />
              {estimate != null && (
                <span id="focus-block-estimate" className="mt-1 block text-xs text-muted-foreground">
                  {estimate > 1440
                    ? `Estimated at ${estimate} minutes. Schedule one portion at a time.`
                    : `Task estimate is ${estimate} minutes. You can set a different duration.`}
                </span>
              )}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeDescription}
            disabled={busy}
            onChange={(event) => setIncludeDescription(event.target.checked)}
          />
          Include task notes
        </label>
        {canExport && selectedTask && (
          <div
            className="rounded-lg border border-border p-3 text-sm"
            aria-label="Calendar event preview"
          >
            <p className="font-medium">{selectedTask.title}</p>
            <p className="mt-1 text-muted-foreground">
              {slot
                ? `${new Date(slot.start).toLocaleString()} to ${new Date(slot.end).toLocaleString()} (device time)`
                : `All day on ${selectedTask.due_date}`}
            </p>
            {includeDescription && selectedTask.description && (
              <p className="mt-2 whitespace-pre-wrap break-words">{selectedTask.description}</p>
            )}
          </div>
        )}
        {slot && canExport && (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !googleAvailable}
              onClick={() => availability.mutate(slot)}
            >
              {availability.isPending ? "Checking Calendar…" : "Check this time"}
            </Button>
            {(checkedFree || checkedBusy) && (
              <p role="status" className="text-sm text-muted-foreground">
                {checkedFree
                  ? "This time was free when checked. TaskBase will check again before sending."
                  : usableAlternative
                    ? "This time overlaps an event on your primary Calendar. A later opening fits this block."
                    : "This time overlaps an event on your primary Calendar. No later opening on that date fits this block."}
              </p>
            )}
            {checkedBusy && usableAlternative && alternativeStart && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setBlockStart(usableAlternative)}
              >
                Use {alternativeStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </Button>
            )}
          </div>
        )}
        {lastSent && (
          <div className="rounded-lg border border-border p-3 text-sm" role="status">
            <p>
              Last sent to Calendar{" "}
              <time dateTime={lastSent}>{new Date(lastSent).toLocaleString()}</time>
            </p>
            <CalendarSourceLink url={eventUrl} />
            {latestReceipt && !latestReceipt.receiptSaved && (
              <p className="mt-1 text-xs text-muted-foreground">
                Google saved the event. TaskBase could not keep this receipt on the board.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !googleAvailable}
            onClick={() => connect.mutate("export")}
          >
            Allow Calendar write
          </Button>
          <Button
            disabled={busy || !googleAvailable || !canExport}
            onClick={() =>
              publish.mutate({
                ...calendarInput,
                requireFreeSlot: checkedFree,
              })
            }
          >
            {checkedBusy ? "Send despite conflict" : "Send selected task"}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !canExport}
            onClick={() => download.mutate({ input: calendarInput, key: calendarKey })}
          >
            Prepare calendar file
          </Button>
          {canExport && calendarFile?.key === calendarKey && (
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
