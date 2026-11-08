import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
function parseAIJson<T = unknown>(raw: string): T {
  // const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();
  // const start = cleaned.indexOf("{");
  // const arrStart = cleaned.indexOf("[");
  // const first = start === -1 ? arrStart : arrStart === -1 ? start : Math.min(start, arrStart);

  // const end = cleaned.lastIndexOf("}");
  // const arrEnd = cleaned.lastIndexOf("]");
  // const last = Math.max(end, arrEnd);

  // const jsonStr = cleaned.slice(first > -1 ? first : 0, last > -1 ? last + 1 : cleaned.length);
  // return JSON.parse(jsonStr) as T;

  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");

  if (s === -1 || e === -1) {
    throw new Error("Invalid output from the AI");
  }

  const json = raw.substring(s, e + 1);

  return JSON.parse(json) as T;
}
import { generateGeminiText } from "./gemini.server";

const RefinedTaskSchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  tags: z.array(z.string()).default([]),
  due_date: z.string().nullable().optional(),
  ai_reason: z.string().default(""),
});

const RefineResponseSchema = z.object({
  summary: z.string().default(""),
  tasks: z.array(RefinedTaskSchema),
});

/** Refine the user's task list using current tasks + recent chat. */
export const refineTasksWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    console.log("[refineTasksWithAI] start user=", context.userId);
    const [{ data: tasks }, { data: recentMsgs }, { data: docs }] = await Promise.all([
      context.supabase.from("tasks").select("*").order("position", { ascending: true }),
      context.supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase.from("documents").select("name, status").eq("status", "ready"),
    ]);
    console.log(
      "[refineTasksWithAI] tasks=",
      tasks?.length,
      "messages=",
      recentMsgs?.length,
      "docs=",
      docs?.length,
    );

    const chatContext = (recentMsgs ?? [])
      .reverse()
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    const taskContext = (tasks ?? []).map((t) => t.title).join("\n");
    // Pull knowledge-base context using the recent conversation as the query.
    const { retrieveContext } = await import("./rag.server");

    const query = [chatContext, taskContext].filter(Boolean).join("\n\n");
    const kbContext = await retrieveContext(context.supabase, query, 6);
    console.log("[refineTasksWithAI] kb chars=", kbContext.length);

    // Fetch calendar and gmail file contents directly if they exist to guarantee ingestion
    let calendarContent = "";
    let gmailContent = "";

    const { data: directDocs } = await context.supabase
      .from("documents")
      .select("id, name")
      .in("name", ["calendar!@#.txt", "gmail!@#.txt"])
      .eq("user_id", context.userId);

    if (directDocs && directDocs.length > 0) {
      const docIds = directDocs.map((d: any) => d.id);
      const { data: chunks } = await context.supabase
        .from("document_chunks")
        .select("document_id, content")
        .in("document_id", docIds);

      if (chunks && chunks.length > 0) {
        const calendarDoc = directDocs.find((d: any) => d.name === "calendar!@#.txt");
        const gmailDoc = directDocs.find((d: any) => d.name === "gmail!@#.txt");

        if (calendarDoc) {
          calendarContent = chunks
            .filter((c: any) => c.document_id === calendarDoc.id)
            .map((c: any) => c.content)
            .join("\n");
        }
        if (gmailDoc) {
          gmailContent = chunks
            .filter((c: any) => c.document_id === gmailDoc.id)
            .map((c: any) => c.content)
            .join("\n");
        }
      }
    }
    console.log(
      "[refineTasksWithAI] calendar content length=",
      calendarContent.length,
      "gmail content length=",
      gmailContent.length,
    );

    const docNames = (docs ?? []).map((d) => d.name).join(", ");
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `You are a productivity assistant. Refine the user's task list.

Today's date: ${today}

USER'S UPLOADED DOCUMENTS: ${docNames || "(none)"}

GOOGLE CALENDAR DATA (re-synced events/reminders — may be empty):
${calendarContent || "(no calendar data synced)"}

GMAIL DATA (latest 20 emails synced — may be empty):
${gmailContent || "(no gmail data synced)"}

CURRENT TASKS (JSON):
${JSON.stringify(tasks ?? [], null, 2)}

KNOWLEDGE BASE (excerpts from the user's other documents — may be empty):
${kbContext || "(no relevant knowledge base content)"}

RECENT CONVERSATION (last 20 messages):
${chatContext || "(no messages yet)"}

Rules:
- Keep user-created tasks unless there is a strong reason to change them.
- You may rewrite titles for clarity, adjust priorities (high|medium|low), add helpful tags (e.g. Important, Immediate, Revision, Assignment, Exam, Optional, Low time left).
- Add new tasks only if clearly implied by the conversation, uploaded documents, Google Calendar events, or recent Gmail emails.
- If Google Calendar data is provided, ensure any tasks that match these events are kept in sync with their dates and details.
- If Gmail data is provided, extract any action items or assignments mentioned in the emails and create corresponding tasks.
- Do NOT invent details you don't have evidence for.
- For each task, include "ai_reason" — 1-2 sentences explaining WHY this task exists, why this priority, and which uploaded document (by name, e.g. calendar!@#.txt or gmail!@#.txt), email, calendar event, or chat message influenced it. Example: "Synced from calendar!@#.txt — Team Sync Meeting on 2026-07-02."
- due_date must be YYYY-MM-DD or null.
- The "summary" must be a short narrated explanation of what changed, written in first person ("I added 3 tasks from syllabus.pdf, raised the priority of Assignment 2 because it is due before the exam, and merged two duplicates"). Be specific.
- Return STRICT JSON only, no prose, no markdown fences.

Output JSON shape:
{
  "summary": "narrated explanation of what you changed and why",
  "tasks": [
    { "title": "...", "description": "...", "priority": "high|medium|low",
      "tags": ["..."], "due_date": "YYYY-MM-DD" | null, "ai_reason": "..." }
  ]
}`;

    const raw = await generateGeminiText(prompt);
    let parsed: z.infer<typeof RefineResponseSchema>;
    try {
      parsed = RefineResponseSchema.parse(parseAIJson(raw));
    } catch (e) {
      console.error("[refineTasksWithAI] parse failed:", (e as Error).message);
      throw new Error(
        "AI returned an invalid task list. Please try again.\n" + (e as Error).message,
      );
    }

    // Compute simple change summary by title
    const beforeTitles = new Set((tasks ?? []).map((t) => t.title.toLowerCase()));
    const afterTitles = new Set(parsed.tasks.map((t) => t.title.toLowerCase()));
    const added = [...afterTitles].filter((t) => !beforeTitles.has(t)).length;
    const removed = [...beforeTitles].filter((t) => !afterTitles.has(t)).length;
    const kept = [...afterTitles].filter((t) => beforeTitles.has(t)).length;
    console.log("[refineTasksWithAI] changes added=", added, "removed=", removed, "kept=", kept);

    // Replace user's task list with the refined one.
    const { error } = await context.supabase.from("tasks").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (parsed.tasks.length > 0) {
      const rows = parsed.tasks.map((t, idx) => ({
        user_id: context.userId,
        title: t.title,
        description: t.description ?? "",
        priority: t.priority,
        tags: t.tags ?? [],
        due_date: t.due_date ?? null,
        ai_reason: t.ai_reason || null,
        created_by: "ai" as const,
        position: idx,
      }));
      const { error } = await context.supabase.from("tasks").insert(rows);
      if (error) throw new Error(error.message);
    }
    console.log("[refineTasksWithAI] done count=", parsed.tasks.length);

    return {
      summary: parsed.summary,
      count: parsed.tasks.length,
      changes: { added, removed, kept },
    };
  });

/* Short AI summary of the current task situation. */
export const getTaskSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tasks } = await context.supabase
      .from("tasks")
      .select("title, priority, status, due_date, tags");
    if (!tasks || tasks.length === 0) {
      return { summary: "No tasks yet. Add one to get started, or click Refine with AI." };
    }
    const prompt = `Summarize the following task list in 2-3 sentences for a productivity dashboard. Be concise and helpful.

TASKS: ${JSON.stringify(tasks)}`;
    const text = await generateGeminiText(prompt);
    return { summary: text.trim() };
  });

/** Chat with the assistant. Also signals whether tasks should be refined. */
const ChatInput = z.object({ message: z.string() });

const ChatReplySchema = z.object({
  answer: z.string(),
  updateTasks: z.boolean().default(false),
});

function asksForTaskUpdate(message: string) {
  return /\b(create|generate|make|add|update|refine|organize|reorganize|plan|build)\b[\s\S]{0,80}\b(task|tasks|todo|to-do|list|schedule|plan)\b/i.test(
    message,
  );
}

export const chat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ context, data }) => {
    console.log("[chat] start user=", context.userId);
    // Store user message
    await context.supabase.from("chat_messages").insert({
      user_id: context.userId,
      role: "user",
      content: data.message,
    });

    const [{ data: tasks }, { data: recentMsgs }] = await Promise.all([
      context.supabase.from("tasks").select("title, priority, status, due_date, tags"),
      context.supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const history = (recentMsgs ?? [])
      .reverse()
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const { retrieveContext } = await import("./rag.server");
    console.log("[chat] performing similarity search");
    const kbContext = await retrieveContext(context.supabase, data.message, 5);
    console.log("[chat] context chars=", kbContext.length);

    const prompt = `You are a helpful productivity assistant.

CURRENT TASKS: ${JSON.stringify(tasks ?? [])}

KNOWLEDGE BASE (excerpts from the user's uploaded documents — may be empty):
${kbContext || "(no relevant knowledge base content)"}

CONVERSATION (most recent last):
${history}

The user's newest message is already at the end of CONVERSATION. Reply helpfully.

If the user asks you to create, generate, update, refine, organize, or plan tasks, set "updateTasks": true.
If the user's newest message implies the task list should change based on chat or uploaded documents, set "updateTasks": true.
Otherwise false.

Return STRICT JSON ONLY (no markdown fences, no extra prose) matching:
{ "answer": "your reply to the user (markdown ok inside the string)",
  "updateTasks": true | false }`;

    console.log("[chat] generating response");
    const raw = await generateGeminiText(prompt);
    let parsed: z.infer<typeof ChatReplySchema>;
    try {
      parsed = ChatReplySchema.parse(parseAIJson(raw));
    } catch (err) {
      let str = "Failed to parse AI output";
      if (err instanceof Error) {
        str = str + " , " + err.message;
      }
      throw new Error(str);
    }

    // const forcedUpdate = asksForTaskUpdate(data.message);
    // if (forcedUpdate && !parsed.updateTasks) {
    //   console.log("[chat] forcing task update from user intent");
    //   parsed.updateTasks = true;
    // }

    await context.supabase.from("chat_messages").insert({
      user_id: context.userId,
      role: "assistant",
      content: parsed.answer,
    });

    console.log("[chat] done updateTasks=", parsed.updateTasks);
    return parsed;
  });

export const listChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const clearChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
