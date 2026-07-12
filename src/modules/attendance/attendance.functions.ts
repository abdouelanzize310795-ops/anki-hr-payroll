import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clockActionSchema, upsertAttendanceSchema } from "./schemas";
import {
  computeWorkedMinutes,
  type AttendanceRecord,
  type AttendanceStatus,
  type AttendanceWithRelations,
} from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapRecord(row: AttendanceRecord): AttendanceRecord {
  return {
    ...row,
    worked_minutes: row.worked_minutes == null ? null : Number(row.worked_minutes),
  };
}

function normalizeTime(value?: string | null): string | null {
  if (!value || !value.trim()) return null;
  const v = value.trim();
  if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
  return v;
}

export const listAttendance = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        workDate: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        status: z
          .enum(["present", "absent", "late", "half_day", "remote", "on_leave", "all"])
          .optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<AttendanceWithRelations[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const workDate = data?.workDate ?? new Date().toISOString().slice(0, 10);

    let query = supabase
      .from("attendance_records")
      .select("*")
      .is("deleted_at", null)
      .order("work_date", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);
    if (data?.from && data?.to) {
      query = query.gte("work_date", data.from).lte("work_date", data.to);
    } else {
      query = query.eq("work_date", workDate);
    }
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const records = ((rows ?? []) as AttendanceRecord[]).map(mapRecord);
    if (records.length === 0) return [];

    const employeeIds = [...new Set(records.map((r) => r.employee_id))];
    const companyIds = [...new Set(records.map((r) => r.company_id))];

    const [employeesRes, companiesRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, first_name, last_name, job_title")
        .in("id", employeeIds),
      supabase.from("companies").select("id, legal_name").in("id", companyIds),
    ]);

    const empMap = new Map(
      (employeesRes.data ?? []).map((e) => [
        e.id,
        { name: `${e.first_name} ${e.last_name}`, job: e.job_title as string | null },
      ]),
    );
    const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.legal_name]));

    return records.map((r) => ({
      ...r,
      employee_name: empMap.get(r.employee_id)?.name ?? null,
      job_title: empMap.get(r.employee_id)?.job ?? null,
      company_name: companyMap.get(r.company_id) ?? null,
    }));
  });

export const attendanceStats = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        workDate: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const workDate = data?.workDate ?? new Date().toISOString().slice(0, 10);

    let query = supabase
      .from("attendance_records")
      .select("status, worked_minutes")
      .eq("work_date", workDate)
      .is("deleted_at", null);

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const present = list.filter((r) => r.status === "present" || r.status === "remote").length;
    const late = list.filter((r) => r.status === "late").length;
    const absent = list.filter((r) => r.status === "absent").length;
    const overtimeMinutes = list.reduce((acc, r) => {
      const mins = Number(r.worked_minutes ?? 0);
      return acc + Math.max(0, mins - 8 * 60);
    }, 0);

    return {
      present,
      late,
      absent,
      overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
    };
  });

export const attendanceMonthSeries = createServerFn({ method: "GET" })
  .validator(
    z.object({
      companyId: z.string().uuid().optional(),
      year: z.number().int().optional(),
      month: z.number().int().min(1).max(12).optional(),
    }).optional(),
  )
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const now = new Date();
    const year = data?.year ?? now.getFullYear();
    const month = data?.month ?? now.getMonth() + 1;
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    let query = supabase
      .from("attendance_records")
      .select("work_date, worked_minutes")
      .gte("work_date", from)
      .lte("work_date", to)
      .is("deleted_at", null);

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const byDay = new Map<number, { total: number; count: number }>();
    for (const row of rows ?? []) {
      const day = Number(String(row.work_date).slice(8, 10));
      const mins = Number(row.worked_minutes ?? 0);
      const cur = byDay.get(day) ?? { total: 0, count: 0 };
      if (mins > 0) {
        cur.total += mins;
        cur.count += 1;
      }
      byDay.set(day, cur);
    }

    return Array.from({ length: lastDay }, (_, i) => {
      const d = i + 1;
      const cur = byDay.get(d);
      const avgH = cur && cur.count > 0 ? Math.round((cur.total / cur.count / 60) * 10) / 10 : 0;
      return { d, h: avgH };
    });
  });

export const upsertAttendance = createServerFn({ method: "POST" })
  .validator(upsertAttendanceSchema)
  .handler(async ({ data }): Promise<ActionResult<AttendanceRecord>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const checkIn = normalizeTime(data.checkIn);
    const checkOut = normalizeTime(data.checkOut);
    const worked = computeWorkedMinutes(checkIn, checkOut);

    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id, company_id")
      .eq("id", data.employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (empError || !employee) return { ok: false, message: "Employé introuvable" };
    if (employee.company_id !== data.companyId) {
      return { ok: false, message: "L'employé n'appartient pas à cette entreprise" };
    }

    const payload = {
      company_id: data.companyId,
      employee_id: data.employeeId,
      work_date: data.workDate,
      status: data.status as AttendanceStatus,
      check_in: checkIn,
      check_out: checkOut,
      worked_minutes: worked,
      notes: data.notes?.trim() || null,
      created_by: userId,
      deleted_at: null,
    };

    const { data: row, error } = await supabase
      .from("attendance_records")
      .upsert(payload, { onConflict: "employee_id,work_date" })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Enregistrement impossible" };
    return { ok: true, data: mapRecord(row as AttendanceRecord) };
  });

export const clockAttendance = createServerFn({ method: "POST" })
  .validator(clockActionSchema)
  .handler(async ({ data }): Promise<ActionResult<AttendanceRecord>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase.rpc("clock_attendance", {
      p_company_id: data.companyId,
      p_employee_id: data.employeeId,
      p_action: data.action,
      p_at: data.at ? new Date(data.at).toISOString() : new Date().toISOString(),
    });

    if (error || !row) return { ok: false, message: error?.message ?? "Pointage impossible" };
    return { ok: true, data: mapRecord(row as AttendanceRecord) };
  });

export const markAbsentForActive = createServerFn({ method: "POST" })
  .validator(z.object({ companyId: z.string().uuid(), workDate: z.string().optional() }))
  .handler(async ({ data }): Promise<ActionResult<{ created: number }>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();
    const workDate = data.workDate ?? new Date().toISOString().slice(0, 10);

    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id")
      .eq("company_id", data.companyId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (empError) return { ok: false, message: empError.message };

    const { data: existing } = await supabase
      .from("attendance_records")
      .select("employee_id")
      .eq("company_id", data.companyId)
      .eq("work_date", workDate)
      .is("deleted_at", null);

    const have = new Set((existing ?? []).map((r) => r.employee_id));
    const missing = (employees ?? []).filter((e) => !have.has(e.id));

    if (missing.length === 0) return { ok: true, data: { created: 0 } };

    const { error } = await supabase.from("attendance_records").insert(
      missing.map((e) => ({
        company_id: data.companyId,
        employee_id: e.id,
        work_date: workDate,
        status: "absent",
        created_by: userId,
      })),
    );

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { created: missing.length } };
  });
