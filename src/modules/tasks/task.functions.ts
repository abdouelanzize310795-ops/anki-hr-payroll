import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTaskSchema, updateTaskSchema } from "./schemas";
import type { HrTask } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

export const listTasks = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<HrTask[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("hr_tasks")
      .select("*")
      .is("deleted_at", null)
      .order("priority")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as HrTask[];
  });

export const createTask = createServerFn({ method: "POST" })
  .validator(createTaskSchema)
  .handler(async ({ data }): Promise<ActionResult<HrTask>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    let assigneeName = data.assigneeName?.trim() || null;
    if (data.assigneeEmployeeId) {
      const { data: emp } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id")
        .eq("id", data.assigneeEmployeeId)
        .maybeSingle();
      if (!emp || emp.company_id !== data.companyId) {
        return { ok: false, message: "Assigné introuvable" };
      }
      assigneeName = `${emp.first_name} ${emp.last_name}`;
    }

    const { data: row, error } = await supabase
      .from("hr_tasks")
      .insert({
        company_id: data.companyId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        priority: data.priority,
        status: data.status,
        assignee_employee_id: data.assigneeEmployeeId || null,
        assignee_name: assigneeName,
        due_date: data.dueDate || null,
        created_by: userId,
        completed_at: data.status === "done" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };
    return { ok: true, data: row as HrTask };
  });

export const updateTask = createServerFn({ method: "POST" })
  .validator(updateTaskSchema)
  .handler(async ({ data }): Promise<ActionResult<HrTask>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title.trim();
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.completed_at = data.status === "done" ? new Date().toISOString() : null;
    }
    if (data.assigneeEmployeeId !== undefined) {
      patch.assignee_employee_id = data.assigneeEmployeeId;
      if (data.assigneeEmployeeId) {
        const { data: emp } = await supabase
          .from("employees")
          .select("first_name, last_name")
          .eq("id", data.assigneeEmployeeId)
          .maybeSingle();
        if (emp) patch.assignee_name = `${emp.first_name} ${emp.last_name}`;
      }
    }
    if (data.assigneeName !== undefined && data.assigneeEmployeeId === undefined) {
      patch.assignee_name = data.assigneeName?.trim() || null;
    }
    if (data.dueDate !== undefined) patch.due_date = data.dueDate || null;

    const { data: row, error } = await supabase
      .from("hr_tasks")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    return { ok: true, data: row as HrTask };
  });

export const softDeleteTask = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("hr_tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export const moveTaskStatus = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), status: z.enum(["todo", "in_progress", "review", "done"]) }))
  .handler(async ({ data }): Promise<ActionResult<HrTask>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: row, error } = await supabase
      .from("hr_tasks")
      .update({
        status: data.status,
        completed_at: data.status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    return { ok: true, data: row as HrTask };
  });
