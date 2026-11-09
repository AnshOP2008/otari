import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { calendarSourceUrl, normalizeText } from "./document-text";

const calendarFile = "calendar!@#.txt";
const gmailFile = "gmail!@#.txt";
const calendarApi = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const gmailApi = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const gmailThreadApi = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const gmailLabelApi = "https://gmail.googleapis.com/gmail/v1/users/me/labels";
const excludedGmailLabels = new Set(["DRAFT", "DRAFTS", "SPAM", "TRASH"]);

const syncInput = z.object({
  accessToken: z.string().min(1).max(4096),
  calendarId: z.string().min(1).max(512).default("primary"),
  calendarQuery: z.string().trim().max(160).default(""),
  days: z.number().int().min(1).max(60).default(14),
  maxEmails: z.number().int().min(1).max(20).default(10),
  unreadOnly: z.boolean().default(false),
  gmailLabelId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine((id) => !excludedGmailLabels.has(id.toUpperCase()), "Choose an importable Gmail label.")
    .default("INBOX"),
  gmailQuery: z.string().trim().max(160).default(""),
  includeThreadContext: z.boolean().default(false),
});
type SyncInput = z.infer<typeof syncInput>;
type Db = SupabaseClient<Database>;
const importInput = syncInput.extend({
  selection: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(50)
    .optional(),
});

type ImportEntry = { id: string; title: string; text: string; url?: string | null };

async function fingerprint(entry: ImportEntry) {
  const bytes = new TextEncoder().encode(JSON.stringify([entry.id, entry.text, entry.url]));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function googleFetch(url: string, token: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: { Authorization: "Bearer " + token, Accept: "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
  });
}

function googleFailure(response: Response, service: string) {
  return new Error(
    response.status === 401
      ? `Your Google session expired. Reconnect ${service} in Integrations.`
      : response.status === 403
        ? `${service} refused access. Check its OAuth permission and whether the API is enabled.`
        : `${service} returned HTTP ${response.status}. Please try again.`,
  );
}

const calendarWindow = z.object({
  accessToken: z.string().min(1).max(4096),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
});

async function readFreeWindows(data: z.infer<typeof calendarWindow>) {
  const start = Date.parse(data.start);
  const end = Date.parse(data.end);
  if (!Number.isFinite(end - start) || end - start < 60_000 || end - start > 80 * 3_600_000) {
    throw new Error("Choose a window from 1 minute to 80 hours.");
  }
  const response = await googleFetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    data.accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: data.start,
        timeMax: data.end,
        items: [{ id: "primary" }],
      }),
    },
  );
  if (!response.ok) throw googleFailure(response, "Google Calendar");
  const parsed = z
    .object({
      calendars: z.record(
        z.string(),
        z.object({
          errors: z.array(z.unknown()).optional(),
          busy: z
            .array(
              z.object({
                start: z.string().datetime({ offset: true }),
                end: z.string().datetime({ offset: true }),
              }),
            )
            .optional(),
        }),
      ),
    })
    .safeParse(await response.json());
  // Google may resolve the primary alias to the account's calendar ID.
  const calendars = parsed.success ? Object.values(parsed.data.calendars) : [];
  const calendar = calendars[0];
  if (calendars.length !== 1 || !calendar?.busy || calendar.errors?.length) {
    throw new Error("Google did not return availability for the primary calendar.");
  }
  const ranges = calendar.busy.map((block) => ({
    start: Date.parse(block.start),
    end: Date.parse(block.end),
  }));
  if (
    ranges.some((block) => !Number.isFinite(block.end - block.start) || block.end <= block.start)
  ) {
    throw new Error("Google returned an invalid busy interval.");
  }
  const busy = ranges
    .map((block) => ({
      start: Math.max(start, block.start),
      end: Math.min(end, block.end),
    }))
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start);

  const free: { start: number; end: number }[] = [];
  let cursor = start;
  for (const block of busy) {
    if (block.start > cursor) free.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < end) free.push({ start: cursor, end });
  return { free, isFree: busy.length === 0 };
}

async function readCalendarCapacity(data: z.infer<typeof calendarWindow>) {
  const { free, isFree } = await readFreeWindows(data);
  const minutes = free.map(({ start, end }) => Math.floor((end - start) / 60_000));
  return {
    isFree,
    availableMinutes: minutes.reduce((sum, value) => sum + value, 0),
    longestBlockMinutes: Math.max(0, ...minutes),
    freeBlocks: minutes.filter((value) => value > 0).length,
  };
}

export const checkCalendarCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(calendarWindow)
  .handler(({ data }) => readCalendarCapacity(data));

export const checkCalendarFocusSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(calendarWindow.extend({ searchEnd: z.iso.datetime({ offset: true }).optional() }))
  .handler(async ({ data }) => {
    const start = Date.parse(data.start);
    const end = Date.parse(data.end);
    const duration = end - start;
    if (!Number.isFinite(duration) || duration < 60_000 || duration > 86_400_000) {
      throw new Error("Choose a focus block from 1 minute to 24 hours.");
    }
    const horizon = data.searchEnd && Date.parse(data.searchEnd) > end ? data.searchEnd : data.end;
    const { free } = await readFreeWindows({ ...data, end: horizon });
    if (free[0]?.start === start && free[0].end >= end) {
      return { isFree: true, alternative: null };
    }
    for (const window of free) {
      // The device-time field accepts whole minutes. Never round back into a busy interval.
      const next = Math.ceil(window.start / 60_000) * 60_000;
      if (next + duration <= window.end) {
        return {
          isFree: false,
          alternative: {
            start: new Date(next).toISOString(),
            end: new Date(next + duration).toISOString(),
          },
        };
      }
    }
    return { isFree: false, alternative: null };
  });

async function storeSnapshot(
  db: Db,
  filename: string,
  entries: ImportEntry[],
  label: string,
  selection?: string[],
) {
  const chosen = selection ? new Set(selection) : null;
  const included = chosen
    ? (
        await Promise.all(
          entries.map(async (entry) => ({
            entry,
            selected: chosen.has(await fingerprint(entry)),
          })),
        )
      )
        .filter((item) => item.selected)
        .map((item) => item.entry)
    : entries;
  if (chosen && included.length !== chosen.size) {
    throw new Error(
      "Google results changed since your preview. Refresh the preview before importing.",
    );
  }
  const stamp = label + "\nImported at " + new Date().toISOString();
  // Keep each event or conversation together so search can cite it independently.
  const chunks = included.map((entry) => normalizeText(entry.text + "\n\n" + stamp));
  const { error } = await db.rpc("store_document", {
    document_name: filename,
    chunks: chunks.length ? chunks : [stamp],
    replace_existing: true,
    ...(included.length
      ? { chunk_details: included.map(({ title, url }) => ({ title, url: url ?? null })) }
      : {}),
  });
  if (error)
    throw new Error("Could not save the Google import. The previous copy is still available.");
  return included.length;
}

const calendarResponse = z.object({
  nextPageToken: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        htmlLink: z.string().optional(),
        description: z.string().optional(),
        start: z
          .object({ date: z.string().optional(), dateTime: z.string().optional() })
          .optional(),
        end: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
        extendedProperties: z
          .object({
            private: z.record(z.string(), z.string()).optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});

export const listGoogleCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ accessToken: z.string().min(1).max(4096) }))
  .handler(async ({ data }) => {
    const schema = z.object({
      items: z
        .array(
          z.object({
            id: z.string(),
            summary: z.string(),
            summaryOverride: z.string().optional(),
            primary: z.boolean().optional(),
          }),
        )
        .default([]),
      nextPageToken: z.string().optional(),
    });
    const calendars = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ minAccessRole: "reader", maxResults: "250" });
      if (cursor) params.set("pageToken", cursor);
      const response = await googleFetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?" + params,
        data.accessToken,
      );
      if (!response.ok) throw googleFailure(response, "Google Calendar");
      const page = schema.parse(await response.json());
      calendars.push(
        ...page.items
          .filter((item) => !item.primary)
          .map((item) => ({
            id: item.id,
            name: item.summaryOverride || item.summary,
          })),
      );
      cursor = page.nextPageToken;
    } while (cursor);
    return calendars;
  });

async function readCalendar({
  accessToken,
  days,
  calendarId,
  calendarQuery,
}: SyncInput): Promise<ImportEntry[]> {
  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + days * 86400_000).toISOString(),
    maxResults: "50",
    singleEvents: "true",
    orderBy: "startTime",
    fields: "nextPageToken,items(id,summary,htmlLink,description,start,end,extendedProperties/private)",
  });
  if (calendarQuery) params.set("q", calendarQuery);
  const endpoint =
    "https://www.googleapis.com/calendar/v3/calendars/" +
    encodeURIComponent(calendarId) +
    "/events";
  const entries = new Map<string, ImportEntry>();
  for (let page = 0; page < 3 && entries.size < 50; page++) {
    const response = await googleFetch(endpoint + "?" + params, accessToken);
    if (!response.ok) throw googleFailure(response, "Google Calendar");
    const { items, nextPageToken } = calendarResponse.parse(await response.json());
    for (const event of items) {
      if (event.extendedProperties?.private?.productivity_companion || entries.has(event.id)) {
        continue;
      }
      const title = (event.summary || "Untitled event").slice(0, 300);
      const text = [
        title,
        `Starts: ${event.start?.dateTime || event.start?.date || "Unknown"}`,
        `Ends: ${event.end?.dateTime || event.end?.date || "Unknown"}`,
        event.description?.slice(0, 600),
      ]
        .filter(Boolean)
        .join("\n");
      entries.set(event.id, { id: event.id, title, text, url: calendarSourceUrl(event.htmlLink) });
      if (entries.size === 50) break;
    }
    if (!nextPageToken) break;
    params.set("pageToken", nextPageToken);
  }
  return Array.from(entries.values());
}

const gmailList = z.object({
  messages: z.array(z.object({ id: z.string(), threadId: z.string().optional() })).default([]),
});
const gmailMessage = z.object({
  snippet: z.string().default(""),
  internalDate: z.string().optional(),
  labelIds: z.array(z.string()).default([]),
  payload: z
    .object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).default([]) })
    .optional(),
});

export const listGmailLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ accessToken: z.string().min(1).max(4096) }))
  .handler(async ({ data }) => {
    const response = await googleFetch(
      gmailLabelApi + "?fields=labels(id,name,type)",
      data.accessToken,
    );
    if (!response.ok) throw googleFailure(response, "Gmail");
    const schema = z.object({
      labels: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })).default([]),
    });
    return schema
      .parse(await response.json())
      .labels
      .filter(({ id, type }) => type === "user" && !excludedGmailLabels.has(id.toUpperCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name }));
  });

function describeGmailMessage(message: z.infer<typeof gmailMessage>) {
  const headers = new Map(
    message.payload?.headers.map(({ name, value }) => [name.toLowerCase(), value.slice(0, 300)]),
  );
  const title = headers.get("subject") || "No subject";
  const text = `Subject: ${title}\nFrom: ${headers.get("from") || "Unknown"}\nDate: ${headers.get("date") || "Unknown"}\n${message.snippet.slice(0, 700)}`;
  return { title, text };
}

async function readGmail({
  accessToken,
  maxEmails,
  unreadOnly,
  gmailLabelId,
  gmailQuery,
  includeThreadContext,
}: SyncInput): Promise<ImportEntry[]> {
  const params = new URLSearchParams({ maxResults: String(maxEmails) });
  params.append("labelIds", gmailLabelId);
  if (unreadOnly && gmailLabelId !== "UNREAD") params.append("labelIds", "UNREAD");
  if (gmailQuery) params.set("q", gmailQuery);
  const response = await googleFetch(gmailApi + "?" + params, accessToken);
  if (!response.ok) throw googleFailure(response, "Gmail");
  const { messages } = gmailList.parse(await response.json());
  const entries: ImportEntry[] = [];
  const seenThreads = new Set<string>();
  for (const { id, threadId } of messages) {
    if (includeThreadContext && threadId) {
      if (seenThreads.has(threadId)) continue;
      seenThreads.add(threadId);
      // Request snippets and headers only. The projection excludes message bodies and attachments.
      const query = new URLSearchParams({
        format: "full",
        fields: "messages(internalDate,labelIds,snippet,payload(headers))",
      });
      const response = await googleFetch(gmailThreadApi + "/" + encodeURIComponent(threadId) + "?" + query, accessToken);
      if (response.status === 404) continue;
      if (!response.ok) throw googleFailure(response, "Gmail");
      const { messages: replies } = z.object({ messages: z.array(gmailMessage).default([]) }).parse(await response.json());
      const recent = replies
        .filter((message) => !message.labelIds.some((label) => excludedGmailLabels.has(label)))
        .sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0))
        .slice(-3)
        .map(describeGmailMessage);
      const latest = recent.at(-1);
      if (latest) entries.push({
        id: "thread:" + threadId,
        title: latest.title,
        text: "Gmail conversation · oldest to newest\n\n" + recent.map((reply) => reply.text).join("\n\n"),
      });
      continue;
    }
    const message = await googleFetch(
      gmailApi +
        "/" +
        encodeURIComponent(id) +
        "?format=full&fields=labelIds,snippet,payload(headers)",
      accessToken,
    );
    if (message.status === 404) continue;
    if (!message.ok) throw googleFailure(message, "Gmail");
    const parsed = gmailMessage.parse(await message.json());
    if (parsed.labelIds.some((label) => excludedGmailLabels.has(label))) continue;
    entries.push({ id, ...describeGmailMessage(parsed) });
  }
  return entries;
}

async function importCalendar(db: Db, data: z.infer<typeof importInput>) {
  return storeSnapshot(
    db,
    calendarFile,
    await readCalendar(data),
    `Google Calendar · Next ${data.days} days`,
    data.selection,
  );
}

async function importGmail(db: Db, data: z.infer<typeof importInput>) {
  const label =
    data.gmailLabelId === "INBOX" ? "Inbox" : data.gmailLabelId === "STARRED" ? "Starred" : "Selected label";
  return storeSnapshot(
    db,
    gmailFile,
    await readGmail(data),
    "Gmail · " + label + (data.unreadOnly ? " · Unread only" : ""),
    data.selection,
  );
}

export const previewGoogleImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(syncInput.extend({ service: z.enum(["calendar", "gmail"]) }))
  .handler(async ({ data }) => {
    const entries = await (data.service === "calendar" ? readCalendar(data) : readGmail(data));
    return Promise.all(
      entries.map(async (entry) => ({
        key: await fingerprint(entry),
        title: entry.title,
        text: entry.text,
        url: entry.url ?? null,
      })),
    );
  });

export const removeIntegrationDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ filename: z.enum([calendarFile, gmailFile]) }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("documents")
      .delete()
      .eq("name", data.filename)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not remove the imported source.");
    return { ok: true };
  });

export const syncCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(importInput)
  .handler(async ({ context, data }) => ({
    imported: await importCalendar(context.supabase, data),
  }));

export const syncGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(importInput)
  .handler(async ({ context, data }) => ({ imported: await importGmail(context.supabase, data) }));

export const syncAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(syncInput)
  .handler(async ({ context, data }) => {
    const results = await Promise.allSettled([
      importCalendar(context.supabase, data),
      importGmail(context.supabase, data),
    ]);
    return results.map((result, index) => ({
      service: index === 0 ? "Calendar" : "Gmail",
      imported: result.status === "fulfilled" ? result.value : null,
      error:
        result.status === "rejected"
          ? result.reason instanceof Error
            ? result.reason.message
            : "Import failed."
          : null,
    }));
  });

function nextCalendarDate(date: string) {
  const day = new Date(date + "T00:00:00Z");
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

function calendarText(text: string) {
  return text
    .replaceAll("\\", "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/[;,]/g, (character) => "\\" + character);
}

function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let part = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      folded.push(part);
      part = " ";
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  return [...folded, part].join("\r\n");
}

const calendarTaskInput = z.object({
  taskId: z.string().uuid(),
  includeDescription: z.boolean().default(true),
  slot: z
    .object({
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
    })
    .refine(({ start, end }) => {
      const duration = Date.parse(end) - Date.parse(start);
      return duration >= 60_000 && duration <= 86_400_000;
    }, "Choose a timed block from 1 minute to 24 hours.")
    .optional(),
});

async function readCalendarTask(db: Db, data: z.infer<typeof calendarTaskInput>) {
  const { data: task, error } = await db
    .from("tasks")
    .select("id,title,description,due_date,status")
    .eq("id", data.taskId)
    .maybeSingle();
  if (error) throw new Error("Could not read the selected task.");
  if (!task || task.status === "done") throw new Error("Choose an open task.");
  const description = data.includeDescription ? task.description : "";
  if (data.slot) {
    return {
      task,
      description,
      timed: true,
      start: new Date(data.slot.start).toISOString(),
      end: new Date(data.slot.end).toISOString(),
    };
  }
  if (!task.due_date) throw new Error("Choose a due date or add a timed block.");
  return {
    task,
    description,
    timed: false,
    start: task.due_date,
    end: nextCalendarDate(task.due_date),
  };
}

export const downloadCalendarTask = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(calendarTaskInput)
  .handler(async ({ context, data }) => {
    const { task, description, timed, start, end } = await readCalendarTask(context.supabase, data);
    const compact = (date: string) => date.replace(/[-:]|\.\d{3}/g, "");
    const dateParameter = timed ? ":" : ";VALUE=DATE:";
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TaskBase//Calendar Export//EN",
      "BEGIN:VEVENT",
      "UID:" + task.id + "@taskbase",
      "DTSTAMP:" + compact(new Date().toISOString()),
      "DTSTART" + dateParameter + compact(start),
      "DTEND" + dateParameter + compact(end),
      "SUMMARY:" + calendarText(task.title),
      "DESCRIPTION:" + calendarText(description),
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]
      .map(foldCalendarLine)
      .join("\r\n");
  });

async function calendarWriteReceipt(db: Db, taskId: string, response: Response, updated: boolean) {
  const exportedAt = new Date().toISOString();
  const event = z
    .object({ htmlLink: z.string().optional() })
    .safeParse(await response.json().catch(() => null));
  const url = event.success ? calendarSourceUrl(event.data.htmlLink) : null;
  const { data, error } = await db
    .from("tasks")
    .update({ calendar_exported_at: exportedAt, calendar_event_url: url })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();
  return { updated, url, exportedAt, receiptSaved: Boolean(data && !error) };
}

export const exportCalendarTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    calendarTaskInput.extend({
      accessToken: z.string().min(1).max(4096),
      requireFreeSlot: z.boolean().default(false),
    }),
  )
  .handler(async ({ context, data }) => {
    const { task, description, timed, start, end } = await readCalendarTask(context.supabase, data);
    if (timed && data.requireFreeSlot) {
      const capacity = await readCalendarCapacity({ start, end, accessToken: data.accessToken });
      if (!capacity.isFree)
        throw new Error(
          "This time overlaps a Calendar event. Check availability again or choose a different time.",
        );
    }
    const id = "tb" + task.id.replaceAll("-", "");
    const event = {
      summary: task.title,
      description,
      start: timed ? { dateTime: start } : { date: start },
      end: timed ? { dateTime: end } : { date: end },
      extendedProperties: { private: { productivity_companion: "true", task_id: task.id } },
    };
    const headers = { "Content-Type": "application/json" };
    // Calendar patches merge nested fields, so clear the alternate form when switching modes.
    const cleared = timed ? { date: null } : { dateTime: null, timeZone: null };
    const patch = JSON.stringify({
      ...event,
      start: { ...event.start, ...cleared },
      end: { ...event.end, ...cleared },
    });
    const update = await googleFetch(calendarApi + "/" + id, data.accessToken, {
      method: "PATCH",
      headers,
      body: patch,
    });
    if (update.ok) return calendarWriteReceipt(context.supabase, task.id, update, true);
    if (update.status !== 404) throw googleFailure(update, "Google Calendar");
    // Older TaskBase versions let Google assign the event ID. Reuse that event if present.
    const legacyParams = new URLSearchParams({
      privateExtendedProperty: "task_id=" + task.id,
      maxResults: "1",
    });
    const legacy = await googleFetch(calendarApi + "?" + legacyParams, data.accessToken);
    if (!legacy.ok) throw googleFailure(legacy, "Google Calendar");
    const existing = calendarResponse.parse(await legacy.json()).items[0];
    if (existing) {
      const replace = await googleFetch(
        calendarApi + "/" + encodeURIComponent(existing.id),
        data.accessToken,
        {
          method: "PATCH",
          headers,
          body: patch,
        },
      );
      if (!replace.ok) throw googleFailure(replace, "Google Calendar");
      return calendarWriteReceipt(context.supabase, task.id, replace, true);
    }
    const insert = await googleFetch(calendarApi, data.accessToken, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...event, id }),
    });
    if (insert.status === 409) {
      const retry = await googleFetch(calendarApi + "/" + id, data.accessToken, {
        method: "PATCH",
        headers,
        body: patch,
      });
      if (!retry.ok) throw googleFailure(retry, "Google Calendar");
      return calendarWriteReceipt(context.supabase, task.id, retry, true);
    }
    if (!insert.ok) throw googleFailure(insert, "Google Calendar");
    return calendarWriteReceipt(context.supabase, task.id, insert, false);
  });
