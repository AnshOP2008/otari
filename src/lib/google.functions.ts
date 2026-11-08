import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chunkText } from "./documents.functions";
import { embedTexts } from "./gemini.server";
import { refineTasksWithAI } from "./ai.functions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function removeDocIfExists(supabase: any, userId: string, filename: string) {
  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("user_id", userId)
    .eq("name", filename)
    .maybeSingle();

  if (doc) {
    console.log(`[Google Sync] Removing old doc "${filename}" (id: ${doc.id})`);
    await supabase.from("document_chunks").delete().eq("document_id", doc.id);
    await supabase.from("documents").delete().eq("id", doc.id);
  }
}

async function saveDocToKB(supabase: any, userId: string, filename: string, content: string) {
  // Always remove the old version first
  await removeDocIfExists(supabase, userId, filename);

  const chunks = chunkText(content);
  if (chunks.length === 0) throw new Error(`Generated content for ${filename} was empty`);

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({ user_id: userId, name: filename, status: "processing", chunk_count: chunks.length })
    .select()
    .single();

  if (docErr || !doc) throw new Error(`Failed to create document record: ${docErr?.message}`);

  console.log(`[Google Sync] Embedding ${chunks.length} chunks for ${filename}`);
  const embeddings = await embedTexts(chunks);

  const rows = chunks.map((chunkContent, idx) => ({
    document_id: doc.id,
    user_id: userId,
    chunk_index: idx,
    content: chunkContent,
    embedding: embeddings[idx] as unknown as string,
  }));

  const { error: chunkErr } = await supabase.from("document_chunks").insert(rows);
  if (chunkErr) throw new Error(`Failed to save chunks: ${chunkErr.message}`);

  await supabase.from("documents").update({ status: "ready" }).eq("id", doc.id);
  console.log(`[Google Sync] Indexed "${filename}" (${chunks.length} chunks)`);
}

function getNextDayStr(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return dateStr;
  }
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().substring(0, 10);
}

/** Push all dated, non-done tasks as Google Calendar events. Returns count pushed. */
async function pushTasksToGoogleCalendar(accessToken: string, tasks: any[]): Promise<number> {
  const datedTasks = tasks.filter((t) => t.due_date && t.status !== "done");
  let pushed = 0;

  for (const task of datedTasks) {
    const dateStr = task.due_date.substring(0, 10); // YYYY-MM-DD
    const endDateStr = getNextDayStr(dateStr);
    const event = {
      summary: task.title,
      description: task.description || "",
      start: { date: dateStr },
      end: { date: endDateStr },
      // Tag so we can identify our events later
      extendedProperties: {
        private: { productivity_companion: "true", task_id: String(task.id ?? "") },
      },
    };

    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });
      if (res.ok) {
        pushed++;
        console.log(`[Google Sync] Pushed event: "${task.title}" (${dateStr} to ${endDateStr})`);
      } else {
        const errText = await res.text();
        console.warn(
          `[Google Sync] Failed to push "${task.title}": status ${res.status} - ${errText}`,
        );
      }
    } catch (e) {
      console.warn(`[Google Sync] Error pushing "${task.title}":`, e);
    }
  }

  return pushed;
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/** Remove an integration KB file (called when user disconnects a service). */
export const removeIntegrationDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ filename: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    console.log(`[Google Sync] Removing integration doc: ${data.filename}`);
    await removeDocIfExists(context.supabase, context.userId, data.filename);
    return { ok: true };
  });

/** Wipe old (possibly fake) calendar & gmail KB entries. */
export const cleanOldIntegrationDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    console.log("[Google Sync] Cleaning old integration docs...");
    await removeDocIfExists(context.supabase, context.userId, "calendar!@#.txt");
    await removeDocIfExists(context.supabase, context.userId, "gmail!@#.txt");
    return { ok: true };
  });

/** Sync Google Calendar → KB, then push dated tasks back to Google Calendar. */
export const syncCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ accessToken: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    console.log("[Google Sync] Starting calendar sync...");
    const accessToken = data.accessToken;

    // 1. Fetch upcoming calendar events
    const timeMin = new Date().toISOString();
    const calUrl =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${encodeURIComponent(timeMin)}&maxResults=50&singleEvents=true&orderBy=startTime`;

    const calResponse = await fetch(calUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (!calResponse.ok) {
      const errText = await calResponse.text();
      throw new Error(`Google Calendar API error: ${calResponse.status} - ${errText}`);
    }

    const calApiData = await calResponse.json();
    const items: any[] = calApiData.items || [];
    console.log(`[Google Sync] Fetched ${items.length} calendar events`);

    // 2. Build KB text from real events
    let calendarContent = `Google Calendar Event Log\nLast Synced: ${new Date().toISOString()}\n\n`;
    if (items.length === 0) {
      calendarContent += "No upcoming events found.\n";
    } else {
      items.forEach((event, idx) => {
        const start = event.start?.dateTime || event.start?.date || "Unknown";
        const end = event.end?.dateTime || event.end?.date || "Unknown";
        calendarContent += `Event ${idx + 1}: ${event.summary || "No Title"}\n`;
        calendarContent += `Start: ${start}\n`;
        calendarContent += `End: ${end}\n`;
        if (event.description) calendarContent += `Description: ${event.description}\n`;
        calendarContent += "\n";
      });
    }

    // 3. Save to KB (replaces any old/fake version)
    await saveDocToKB(context.supabase, context.userId, "calendar!@#.txt", calendarContent);

    // 4. Run AI refinement with fresh calendar context
    const refinementResult = await refineTasksWithAI();

    // 5. Push dated tasks back to Google Calendar
    const { data: allTasks } = await context.supabase
      .from("tasks")
      .select("*")
      .eq("user_id", context.userId);

    const pushedCount = await pushTasksToGoogleCalendar(accessToken, allTasks ?? []);
    console.log(`[Google Sync] Pushed ${pushedCount} tasks to Google Calendar`);

    return { success: true, refinement: refinementResult, pushedCount };
  });

/** Sync Gmail → KB, then run refinement. */
export const syncGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ accessToken: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    console.log("[Google Sync] Starting Gmail sync (20 emails)...");
    const accessToken = data.accessToken;

    // 1. List latest 20 messages
    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20",
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );

    if (!listResponse.ok) {
      const errText = await listResponse.text();
      throw new Error(`Gmail list error: ${listResponse.status} - ${errText}`);
    }

    const gmailListData = await listResponse.json();
    const messages: any[] = gmailListData.messages || [];
    console.log(`[Google Sync] Fetched ${messages.length} Gmail message IDs`);

    // 2. Fetch metadata for each message
    const emails: string[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msgId = messages[i].id;
      const msgUrl =
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}` +
        `?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
      const msgRes = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        const hdrs: any[] = msgData.payload?.headers || [];
        const subject = hdrs.find((h) => h.name === "Subject")?.value || "No Subject";
        const from = hdrs.find((h) => h.name === "From")?.value || "Unknown Sender";
        const date = hdrs.find((h) => h.name === "Date")?.value || "Unknown Date";
        emails.push(
          `Email ${i + 1}\nFrom: ${from}\nSubject: ${subject}\nDate: ${date}\n` +
            `Snippet: ${msgData.snippet || "No preview"}\n` +
            `--------------------------------`,
        );
      }
    }

    // 3. Save to KB (replaces any old/fake version)
    const gmailContent =
      `Gmail Inbox Log\nLast Synced: ${new Date().toISOString()}\n\n` +
      (emails.length ? emails.join("\n\n") : "No emails found.");
    await saveDocToKB(context.supabase, context.userId, "gmail!@#.txt", gmailContent);

    // 4. Run AI refinement
    const refinementResult = await refineTasksWithAI();

    return { success: true, refinement: refinementResult };
  });

/** Sync both Calendar & Gmail → KB, then push dated tasks back to Google Calendar. */
export const syncAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ accessToken: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    console.log("[Google Sync] Starting combined sync...");
    const accessToken = data.accessToken;

    // --- Calendar ---
    const timeMin = new Date().toISOString();
    const calUrl =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${encodeURIComponent(timeMin)}&maxResults=50&singleEvents=true&orderBy=startTime`;
    const calResponse = await fetch(calUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    let calendarContent = `Google Calendar Event Log\nLast Synced: ${new Date().toISOString()}\n\n`;
    if (calResponse.ok) {
      const calApiData = await calResponse.json();
      const items: any[] = calApiData.items || [];
      if (items.length === 0) {
        calendarContent += "No upcoming events found.\n";
      } else {
        items.forEach((event, idx) => {
          const start = event.start?.dateTime || event.start?.date || "Unknown";
          const end = event.end?.dateTime || event.end?.date || "Unknown";
          calendarContent += `Event ${idx + 1}: ${event.summary || "No Title"}\nStart: ${start}\nEnd: ${end}\n`;
          if (event.description) calendarContent += `Description: ${event.description}\n`;
          calendarContent += "\n";
        });
      }
    }

    // --- Gmail ---
    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20",
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );

    let gmailContent = `Gmail Inbox Log\nLast Synced: ${new Date().toISOString()}\n\n`;
    if (listResponse.ok) {
      const gmailListData = await listResponse.json();
      const messages: any[] = gmailListData.messages || [];
      const emails: string[] = [];

      for (let i = 0; i < messages.length; i++) {
        const msgId = messages[i].id;
        const msgUrl =
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}` +
          `?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
        const msgRes = await fetch(msgUrl, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const hdrs: any[] = msgData.payload?.headers || [];
          const subject = hdrs.find((h) => h.name === "Subject")?.value || "No Subject";
          const from = hdrs.find((h) => h.name === "From")?.value || "Unknown Sender";
          const date = hdrs.find((h) => h.name === "Date")?.value || "Unknown Date";
          emails.push(
            `Email ${i + 1}\nFrom: ${from}\nSubject: ${subject}\nDate: ${date}\n` +
              `Snippet: ${msgData.snippet || "No preview"}\n` +
              `--------------------------------`,
          );
        }
      }
      gmailContent += emails.length ? emails.join("\n\n") : "No emails found.";
    }

    // --- Save both to KB (replaces any old/fake versions) ---
    await saveDocToKB(context.supabase, context.userId, "calendar!@#.txt", calendarContent);
    await saveDocToKB(context.supabase, context.userId, "gmail!@#.txt", gmailContent);

    // --- Refinement (once, with both sources) ---
    const refinementResult = await refineTasksWithAI();

    // --- Push dated tasks back to Google Calendar ---
    const { data: allTasks } = await context.supabase
      .from("tasks")
      .select("*")
      .eq("user_id", context.userId);

    const pushedCount = await pushTasksToGoogleCalendar(accessToken, allTasks ?? []);
    console.log(`[Google Sync] Pushed ${pushedCount} tasks to Google Calendar`);

    return { success: true, refinement: refinementResult, pushedCount };
  });
