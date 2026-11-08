import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { chunkText } from "./document-text";

const calendarFile = "calendar!@#.txt";
const gmailFile = "gmail!@#.txt";
const calendarApi = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const gmailApi = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

const syncInput = z.object({
  accessToken: z.string().min(1).max(4096),
  days: z.number().int().min(1).max(60).default(14),
  maxEmails: z.number().int().min(1).max(20).default(10),
  unreadOnly: z.boolean().default(false),
});
type SyncInput = z.infer<typeof syncInput>;
type Db = SupabaseClient<Database>;

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

async function storeSnapshot(db: Db, filename: string, entries: string[], label: string) {
  const content = [label, "Imported at " + new Date().toISOString(), ...entries].join("\n\n");
  const { error } = await db.rpc("store_document", {
    document_name: filename,
    chunks: chunkText(content),
    replace_existing: true,
  });
  if (error)
    throw new Error("Could not save the Google import. The previous copy is still available.");
  return entries.length;
}

const calendarResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        description: z.string().optional(),
        start: z
          .object({ date: z.string().optional(), dateTime: z.string().optional() })
          .optional(),
        end: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
        extendedProperties: z
          .object({
            private: z.record(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});

async function importCalendar(db: Db, { accessToken, days }: SyncInput) {
  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + days * 86400_000).toISOString(),
    maxResults: "50",
    singleEvents: "true",
    orderBy: "startTime",
  });
  const response = await googleFetch(calendarApi + "?" + params, accessToken);
  if (!response.ok) throw googleFailure(response, "Google Calendar");
  const { items } = calendarResponse.parse(await response.json());
  const entries = items
    .filter((event) => !event.extendedProperties?.private?.productivity_companion)
    .map((event) =>
      [
        (event.summary || "Untitled event").slice(0, 300),
        `Starts: ${event.start?.dateTime || event.start?.date || "Unknown"}`,
        `Ends: ${event.end?.dateTime || event.end?.date || "Unknown"}`,
        event.description?.slice(0, 600),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  return storeSnapshot(db, calendarFile, entries, `Google Calendar · Next ${days} days`);
}

const gmailList = z.object({ messages: z.array(z.object({ id: z.string() })).default([]) });
const gmailMessage = z.object({
  snippet: z.string().default(""),
  payload: z
    .object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).default([]) })
    .optional(),
});

async function importGmail(db: Db, { accessToken, maxEmails, unreadOnly }: SyncInput) {
  const params = new URLSearchParams({ maxResults: String(maxEmails) });
  params.append("labelIds", "INBOX");
  if (unreadOnly) params.append("labelIds", "UNREAD");
  const response = await googleFetch(gmailApi + "?" + params, accessToken);
  if (!response.ok) throw googleFailure(response, "Gmail");
  const { messages } = gmailList.parse(await response.json());
  const entries: string[] = [];
  for (const { id } of messages) {
    const message = await googleFetch(
      gmailApi +
        "/" +
        encodeURIComponent(id) +
        "?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date",
      accessToken,
    );
    if (message.status === 404) continue;
    if (!message.ok) throw googleFailure(message, "Gmail");
    const { payload, snippet } = gmailMessage.parse(await message.json());
    const headers = new Map(
      payload?.headers.map(({ name, value }) => [name.toLowerCase(), value.slice(0, 300)]),
    );
    entries.push(
      `Subject: ${headers.get("subject") || "No subject"}\nFrom: ${headers.get("from") || "Unknown"}\nDate: ${headers.get("date") || "Unknown"}\n${snippet.slice(0, 700)}`,
    );
  }
  return storeSnapshot(
    db,
    gmailFile,
    entries,
    unreadOnly ? "Gmail · Unread inbox" : "Gmail · Inbox",
  );
}

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
  .validator(syncInput)
  .handler(async ({ context, data }) => ({
    imported: await importCalendar(context.supabase, data),
  }));

export const syncGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(syncInput)
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

export const downloadCalendarTask = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ taskId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { data: task, error } = await context.supabase
      .from("tasks")
      .select("id,title,description,due_date,status")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task?.due_date || task.status === "done") {
      throw new Error("Choose an open task with a due date.");
    }
    const compact = (date: string) => date.replaceAll("-", "");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TaskBase//Calendar Export//EN",
      "BEGIN:VEVENT",
      "UID:" + task.id + "@taskbase",
      "DTSTAMP:" +
        compact(new Date().toISOString())
          .replaceAll(":", "")
          .replace(/\.\d{3}/, ""),
      "DTSTART;VALUE=DATE:" + compact(task.due_date),
      "DTEND;VALUE=DATE:" + compact(nextCalendarDate(task.due_date)),
      "SUMMARY:" + calendarText(task.title),
      "DESCRIPTION:" + calendarText(task.description),
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]
      .map(foldCalendarLine)
      .join("\r\n");
  });

export const exportCalendarTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ accessToken: z.string().min(1).max(4096), taskId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { data: task, error } = await context.supabase
      .from("tasks")
      .select("id,title,description,due_date,status")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task?.due_date || task.status === "done")
      throw new Error("Choose an open task with a due date.");
    const id = "tb" + task.id.replaceAll("-", "");
    const event = {
      summary: task.title,
      description: task.description,
      start: { date: task.due_date },
      end: { date: nextCalendarDate(task.due_date) },
      extendedProperties: { private: { productivity_companion: "true", task_id: task.id } },
    };
    const headers = { "Content-Type": "application/json" };
    const update = await googleFetch(calendarApi + "/" + id, data.accessToken, {
      method: "PATCH",
      headers,
      body: JSON.stringify(event),
    });
    if (update.ok) return { updated: true };
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
          body: JSON.stringify(event),
        },
      );
      if (!replace.ok) throw googleFailure(replace, "Google Calendar");
      return { updated: true };
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
        body: JSON.stringify(event),
      });
      if (!retry.ok) throw googleFailure(retry, "Google Calendar");
      return { updated: true };
    }
    if (!insert.ok) throw googleFailure(insert, "Google Calendar");
    return { updated: false };
  });
