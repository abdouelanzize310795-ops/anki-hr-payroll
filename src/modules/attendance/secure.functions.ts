import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { displayKey } from "@/lib/db/http-api";
import type { AppRole } from "@/lib/auth/types";
import type {
  AttendanceCorrection,
  AttendanceRejection,
  EmployeeDevice,
  LiveBoard,
  SiteSettings,
  WorkPolicy,
} from "./secure.types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

type Actor = { userId: string; role: AppRole; companyId: string | null; canManage: boolean };

const MANAGER_ROLES: AppRole[] = ["employer", "hr", "platform_admin"];

const requireActor = createServerOnlyFn(async (): Promise<Actor> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", data.user.id)
    .maybeSingle();
  const role = (profile?.role ?? "employee") as AppRole;
  return {
    userId: data.user.id,
    role,
    companyId: profile?.company_id ?? null,
    canManage: MANAGER_ROLES.includes(role),
  };
});

function resolveCompany(actor: Actor, companyId?: string | null): string {
  const id = companyId ?? actor.companyId;
  if (!id) throw new Error("Entreprise introuvable");
  return id;
}

const companyInput = z.object({ companyId: z.string().uuid().optional() }).optional();

// ---------------------------------------------------------------------------
// Live board
// ---------------------------------------------------------------------------

export const getLiveBoard = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<ActionResult<LiveBoard>> => {
    const actor = await requireActor();
    const supabase = createSupabaseServerClient();
    const { data: board, error } = await supabase.rpc("attendance_live_board", {
      p_company_id: resolveCompany(actor, data?.companyId),
      p_date: data?.date ?? null,
    });
    if (error || !board) return { ok: false, message: error?.message ?? "Tableau indisponible" };
    return { ok: true, data: board as LiveBoard };
  });

// ---------------------------------------------------------------------------
// Sites (geofence + QR)
// ---------------------------------------------------------------------------

const SITE_COLUMNS =
  "id, company_id, name, code, city, is_headquarters, is_active, latitude, longitude, radius_m, max_accuracy_m, require_qr, qr_rotation_seconds, pinned_at";

export const listSites = createServerFn({ method: "GET" })
  .validator(companyInput)
  .handler(async ({ data }): Promise<SiteSettings[]> => {
    const actor = await requireActor();
    const supabase = createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("branches")
      .select(SITE_COLUMNS)
      .eq("company_id", resolveCompany(actor, data?.companyId))
      .is("deleted_at", null)
      .order("is_headquarters", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as SiteSettings[];
  });

const siteSchema = z.object({
  id: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Nom du site trop court").max(120),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  radiusM: z.number().int().min(5).max(2000),
  maxAccuracyM: z.number().int().min(5).max(500),
  requireQr: z.boolean(),
  qrRotationSeconds: z.number().int().min(10).max(60),
});

export const saveSite = createServerFn({ method: "POST" })
  .validator(siteSchema)
  .handler(async ({ data }): Promise<ActionResult<SiteSettings>> => {
    const actor = await requireActor();
    if (!actor.canManage) return { ok: false, message: "Réservé aux RH et à l’employeur" };
    const supabase = createSupabaseServerClient();
    const companyId = resolveCompany(actor, data.companyId);
    if ((data.latitude == null) !== (data.longitude == null)) {
      return { ok: false, message: "Indiquez la latitude et la longitude" };
    }

    const payload = {
      name: data.name,
      city: data.city || null,
      latitude: data.latitude,
      longitude: data.longitude,
      radius_m: data.radiusM,
      max_accuracy_m: data.maxAccuracyM,
      require_qr: data.requireQr,
      qr_rotation_seconds: data.qrRotationSeconds,
      ...(data.latitude != null ? { pinned_at: new Date().toISOString(), pinned_by: actor.userId } : {}),
    };

    const query = data.id
      ? supabase.from("branches").update(payload).eq("id", data.id).eq("company_id", companyId)
      : supabase.from("branches").insert({ ...payload, company_id: companyId });
    const { data: row, error } = await query.select(SITE_COLUMNS).single();
    if (error || !row) return { ok: false, message: error?.message ?? "Enregistrement impossible" };

    await supabase.rpc("write_audit_log", {
      p_company_id: companyId,
      p_action: data.id ? "site.updated" : "site.created",
      p_entity_type: "branch",
      p_entity_id: row.id,
      p_summary: `${row.name} — rayon ${row.radius_m} m${row.require_qr ? ", QR obligatoire" : ""}`,
    });
    return { ok: true, data: row as SiteSettings };
  });

export const rotateSiteQr = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireActor();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("rotate_branch_qr_secret", { p_branch_id: data.id });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

/** Link to open on the site's screen (contains a pairing key). */
export const getDisplayLink = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ path: string }>> => {
    const actor = await requireActor();
    if (!actor.canManage) return { ok: false, message: "Réservé aux RH et à l’employeur" };
    const supabase = createSupabaseServerClient();
    const { data: site } = await supabase.from("branches").select("id").eq("id", data.id).maybeSingle();
    if (!site) return { ok: false, message: "Site introuvable" };
    return { ok: true, data: { path: `/display/${data.id}?key=${displayKey(data.id)}` } };
  });

// ---------------------------------------------------------------------------
// Work policies
// ---------------------------------------------------------------------------

function hhmm(value: string | null | undefined): string {
  return (value ?? "").slice(0, 5);
}

export const listWorkPolicies = createServerFn({ method: "GET" })
  .validator(companyInput)
  .handler(async ({ data }): Promise<WorkPolicy[]> => {
    const actor = await requireActor();
    const supabase = createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("work_policies")
      .select("*")
      .eq("company_id", resolveCompany(actor, data?.companyId))
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ ...r, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) })) as WorkPolicy[];
  });

const policySchema = z
  .object({
    id: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(80),
    workDays: z.array(z.number().int().min(1).max(7)).min(1, "Choisissez au moins un jour"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    graceMinutes: z.number().int().min(0).max(1440),
    earlyCheckinMinutes: z.number().int().min(0).max(600),
    checkoutExtensionMinutes: z.number().int().min(0).max(720),
  })
  .refine((v) => v.endTime > v.startTime, { message: "L’heure de fin doit suivre l’heure de début", path: ["endTime"] });

export const saveWorkPolicy = createServerFn({ method: "POST" })
  .validator(policySchema)
  .handler(async ({ data }): Promise<ActionResult<WorkPolicy>> => {
    const actor = await requireActor();
    if (!actor.canManage) return { ok: false, message: "Réservé aux RH et à l’employeur" };
    const supabase = createSupabaseServerClient();
    const companyId = resolveCompany(actor, data.companyId);
    const payload = {
      name: data.name,
      work_days: [...new Set(data.workDays)].sort(),
      start_time: data.startTime,
      end_time: data.endTime,
      grace_minutes: data.graceMinutes,
      early_checkin_minutes: data.earlyCheckinMinutes,
      checkout_extension_minutes: data.checkoutExtensionMinutes,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? supabase.from("work_policies").update(payload).eq("id", data.id).eq("company_id", companyId)
      : supabase.from("work_policies").insert({ ...payload, company_id: companyId });
    const { data: row, error } = await query.select("*").single();
    if (error || !row) return { ok: false, message: error?.message ?? "Enregistrement impossible" };
    await supabase.rpc("write_audit_log", {
      p_company_id: companyId,
      p_action: data.id ? "work_policy.updated" : "work_policy.created",
      p_entity_type: "work_policy",
      p_entity_id: row.id,
      p_summary: `${row.name} : ${hhmm(row.start_time)}–${hhmm(row.end_time)}, tolérance ${row.grace_minutes} min`,
    });
    return { ok: true, data: { ...row, start_time: hhmm(row.start_time), end_time: hhmm(row.end_time) } as WorkPolicy };
  });

export const assignWorkPolicy = createServerFn({ method: "POST" })
  .validator(
    z.object({
      target: z.enum(["department", "employee"]),
      targetId: z.string().uuid(),
      policyId: z.string().uuid().nullable(),
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    const actor = await requireActor();
    if (!actor.canManage) return { ok: false, message: "Réservé aux RH et à l’employeur" };
    const supabase = createSupabaseServerClient();
    const table = data.target === "department" ? "departments" : "employees";
    const { error } = await supabase.from(table).update({ work_policy_id: data.policyId }).eq("id", data.targetId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.targetId } };
  });

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

export const listCorrections = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        status: z.enum(["pending", "approved", "rejected", "all"]).optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<AttendanceCorrection[]> => {
    const actor = await requireActor();
    const supabase = createSupabaseServerClient();
    let q = supabase
      .from("attendance_corrections")
      .select("*")
      .eq("company_id", resolveCompany(actor, data?.companyId))
      .order("created_at", { ascending: false })
      .limit(200);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return attachEmployeeNames(supabase, rows ?? []) as Promise<AttendanceCorrection[]>;
  });

export const reviewCorrection = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      action: z.enum(["approve", "reject"]),
      note: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireActor();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("review_attendance_correction", {
      p_id: data.id,
      p_action: data.action,
      p_note: data.note || null,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export const listDevices = createServerFn({ method: "GET" })
  .validator(companyInput)
  .handler(async ({ data }): Promise<EmployeeDevice[]> => {
    const actor = await requireActor();
    const supabase = createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("employee_devices")
      .select("*")
      .eq("company_id", resolveCompany(actor, data?.companyId))
      .order("registered_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return attachEmployeeNames(supabase, rows ?? []) as Promise<EmployeeDevice[]>;
  });

export const reviewDevice = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), action: z.enum(["approve", "revoke"]) }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireActor();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("review_employee_device", { p_id: data.id, p_action: data.action });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

// ---------------------------------------------------------------------------
// Rejection log
// ---------------------------------------------------------------------------

export const listRejections = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        branchId: z.string().uuid().optional(),
        reason: z.string().max(40).optional(),
        days: z.number().int().min(1).max(365).optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<AttendanceRejection[]> => {
    const actor = await requireActor();
    const supabase = createSupabaseServerClient();
    const since = new Date(Date.now() - (data?.days ?? 30) * 86_400_000).toISOString();
    let q = supabase
      .from("attendance_rejections")
      .select("*")
      .eq("company_id", resolveCompany(actor, data?.companyId))
      .gte("attempted_at", since)
      .order("attempted_at", { ascending: false })
      .limit(500);
    if (data?.branchId) q = q.eq("branch_id", data.branchId);
    if (data?.reason) q = q.eq("reason_code", data.reason);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return attachEmployeeNames(supabase, rows ?? []) as Promise<AttendanceRejection[]>;
  });

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const STATUS_FR: Record<string, string> = {
  present: "Présent",
  late: "En retard",
  absent: "Absent",
  half_day: "Demi-journée",
  remote: "Télétravail",
  on_leave: "En congé",
};

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const exportAttendanceCsv = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid().optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<{ filename: string; csv: string }>> => {
    const actor = await requireActor();
    if (actor.role === "employee") return { ok: false, message: "Export réservé aux RH et managers" };
    const supabase = createSupabaseServerClient();
    const companyId = resolveCompany(actor, data.companyId);
    const { data: rows, error } = await supabase
      .from("attendance_records")
      .select(
        "employee_id, work_date, status, check_in, check_out, worked_minutes, late_minutes, early_departure_minutes, missing_checkout, source, branch_id, check_in_distance_m",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("work_date", data.from)
      .lte("work_date", data.to)
      .order("work_date", { ascending: true });
    if (error) return { ok: false, message: error.message };

    const withNames = await attachEmployeeNames(supabase, rows ?? []);
    const { data: sites } = await supabase.from("branches").select("id, name").eq("company_id", companyId);
    const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));

    const header = [
      "Date", "Employé", "Statut", "Entrée", "Sortie", "Heures travaillées", "Retard (min)",
      "Départ anticipé (min)", "Sortie manquante", "Source", "Site", "Distance (m)",
    ];
    const lines = withNames.map((r) =>
      [
        r.work_date,
        r.employee_name,
        STATUS_FR[r.status] ?? r.status,
        (r.check_in ?? "").slice(0, 5),
        (r.check_out ?? "").slice(0, 5),
        r.worked_minutes != null ? (Number(r.worked_minutes) / 60).toFixed(2).replace(".", ",") : "",
        r.late_minutes ?? 0,
        r.early_departure_minutes ?? 0,
        r.missing_checkout ? "Oui" : "Non",
        r.source,
        r.branch_id ? siteName.get(r.branch_id) ?? "" : "",
        r.check_in_distance_m ?? "",
      ]
        .map(csvCell)
        .join(";"),
    );
    // BOM so Excel opens accents correctly; ";" separator for French Excel.
    const csv = `﻿${header.join(";")}\n${lines.join("\n")}\n`;
    return { ok: true, data: { filename: `presences_${data.from}_${data.to}.csv`, csv } };
  });

// ---------------------------------------------------------------------------

async function attachEmployeeNames<T extends { employee_id: string | null }>(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  rows: T[],
): Promise<(T & { employee_name: string })[]> {
  const ids = [...new Set(rows.map((r) => r.employee_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return rows.map((r) => ({ ...r, employee_name: "—" }));
  const { data: emps } = await supabase.from("employees").select("id, first_name, last_name").in("id", ids);
  const names = new Map((emps ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  return rows.map((r) => ({ ...r, employee_name: (r.employee_id && names.get(r.employee_id)) || "—" }));
}
