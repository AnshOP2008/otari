import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PriorityEnum = z.enum(["high", "medium", "low"]);
const StatusEnum = z.enum(["todo", "done"]);

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tasks")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CreateTaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  priority: PriorityEnum.default("medium"),
  tags: z.array(z.string()).default([]),
  due_date: z.string().nullable().optional(),
});

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateTaskInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: maxRow } = await context.supabase
      .from("tasks")
      .select("position")
      .eq("user_id", context.userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? -1) + 1;
    const { data: row, error } = await context.supabase
      .from("tasks")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description ?? "",
        priority: data.priority,
        tags: data.tags,
        due_date: data.due_date ?? null,
        position: nextPos,
        created_by: "user",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UpdateTaskInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priority: PriorityEnum.optional(),
  tags: z.array(z.string()).optional(),
  status: StatusEnum.optional(),
  due_date: z.string().nullable().optional(),
});

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateTaskInput.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("tasks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderedIds: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ context, data }) => {
    // Update each in sequence; small lists so this is fine.
    await Promise.all(
      data.orderedIds.map((id, idx) =>
        context.supabase
          .from("tasks")
          .update({ position: idx })
          .eq("id", id)
          .eq("user_id", context.userId),
      ),
    );
    return { ok: true };
  });
