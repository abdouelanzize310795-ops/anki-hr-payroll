import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/supabase/env";
import { createHelpdeskTicketSchema, transitionHelpdeskSchema } from "./schemas";
import type { HelpdeskTicket, HelpdeskTicketWithRelations } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

const PHOTO_BUCKET = "helpdesk-photos";

const requireUserId = createServerOnlyFn(async (): Promise<string> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
});

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
}

function publicPhotoUrl(path: string): string {
  const { VITE_SUPABASE_URL } = getPublicEnv();
  return `${VITE_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

export const listHelpdeskTickets = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        status: z
          .enum([
            "pending_manager",
            "open",
            "in_progress",
            "resolved",
            "closed",
            "rejected",
            "cancelled",
            "all",
          ])
          .optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<HelpdeskTicketWithRelations[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("helpdesk_tickets")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const tickets = (rows ?? []) as HelpdeskTicket[];
    if (tickets.length === 0) return [];

    const empIds = [
      ...new Set(
        tickets.flatMap((t) =>
          [t.requester_employee_id, t.assignee_employee_id, t.handler_employee_id].filter(
            Boolean,
          ) as string[],
        ),
      ),
    ];
    const deptIds = [
      ...new Set(
        tickets.flatMap((t) =>
          [t.requester_department_id, t.assignee_department_id].filter(Boolean) as string[],
        ),
      ),
    ];

    const [empsRes, deptsRes] = await Promise.all([
      empIds.length
        ? supabase.from("employees").select("id, first_name, last_name").in("id", empIds)
        : Promise.resolve({ data: [] as Array<{ id: string; first_name: string; last_name: string }> }),
      deptIds.length
        ? supabase.from("departments").select("id, name").in("id", deptIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const empMap = new Map(
      (empsRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );
    const deptMap = new Map((deptsRes.data ?? []).map((d) => [d.id, d.name]));

    return tickets.map((t) => ({
      ...t,
      requester_name: t.requester_employee_id
        ? empMap.get(t.requester_employee_id) ?? null
        : null,
      assignee_name: t.assignee_employee_id
        ? empMap.get(t.assignee_employee_id) ?? null
        : null,
      handler_name: t.handler_employee_id
        ? empMap.get(t.handler_employee_id) ?? null
        : null,
      assignee_department_name: t.assignee_department_id
        ? deptMap.get(t.assignee_department_id) ?? null
        : null,
      requester_department_name: t.requester_department_id
        ? deptMap.get(t.requester_department_id) ?? null
        : null,
    }));
  });

export const createHelpdeskTicket = createServerFn({ method: "POST" })
  .validator(createHelpdeskTicketSchema)
  .handler(async ({ data }): Promise<ActionResult<HelpdeskTicket>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase.rpc("create_helpdesk_ticket", {
      p_company_id: data.companyId,
      p_title: data.title,
      p_description: data.description || null,
      p_category: data.category,
      p_priority: data.priority,
      p_assignee_employee_id: data.assigneeEmployeeId || null,
      p_assignee_department_id: data.assigneeDepartmentId || null,
    });

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };
    return { ok: true, data: row as HelpdeskTicket };
  });

export const transitionHelpdeskTicket = createServerFn({ method: "POST" })
  .validator(transitionHelpdeskSchema)
  .handler(async ({ data }): Promise<ActionResult<HelpdeskTicket>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase.rpc("transition_helpdesk_ticket", {
      p_ticket_id: data.id,
      p_action: data.action,
      p_note: data.note || null,
    });

    if (error || !row) return { ok: false, message: error?.message ?? "Action impossible" };
    return { ok: true, data: row as HelpdeskTicket };
  });

export const prepareHelpdeskPhotoUpload = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      ticketId: z.string().uuid(),
      fileName: z.string().min(1).max(200),
      mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
      fileSize: z.number().int().positive().max(5 * 1024 * 1024),
    }),
  )
  .handler(async ({ data }): Promise<
    ActionResult<{ bucket: string; path: string; token: string; publicUrl: string }>
  > => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: ticket, error: ticketError } = await supabase
      .from("helpdesk_tickets")
      .select("id, company_id, created_by, requester_user_id")
      .eq("id", data.ticketId)
      .is("deleted_at", null)
      .maybeSingle();

    if (ticketError || !ticket) {
      return { ok: false, message: "Ticket introuvable" };
    }
    if (ticket.company_id !== data.companyId) {
      return { ok: false, message: "Entreprise incorrecte" };
    }

    const ext =
      data.mimeType === "image/png"
        ? "png"
        : data.mimeType === "image/webp"
          ? "webp"
          : data.mimeType === "image/gif"
            ? "gif"
            : "jpg";
    const safe = sanitizeFileName(data.fileName.replace(/\.[^.]+$/, "")) || "photo";
    const path = `${data.companyId}/${data.ticketId}/${safe}-${Date.now()}.${ext}`;

    const { data: signed, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !signed) {
      return { ok: false, message: error?.message ?? "Impossible de préparer l’upload" };
    }

    return {
      ok: true,
      data: {
        bucket: PHOTO_BUCKET,
        path: signed.path,
        token: signed.token,
        publicUrl: publicPhotoUrl(signed.path),
      },
    };
  });

export const attachHelpdeskTicketPhoto = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticketId: z.string().uuid(),
      photoPath: z.string().min(1),
      photoUrl: z.string().url(),
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<HelpdeskTicket>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: row, error } = await supabase.rpc("attach_helpdesk_ticket_photo", {
      p_ticket_id: data.ticketId,
      p_photo_path: data.photoPath,
      p_photo_url: data.photoUrl,
    });
    if (error || !row) return { ok: false, message: error?.message ?? "Attachement impossible" };
    return { ok: true, data: row as HelpdeskTicket };
  });
