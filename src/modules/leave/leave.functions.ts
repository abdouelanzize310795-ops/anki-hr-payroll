import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createLeaveRequestSchema, transitionLeaveSchema } from "./schemas";
import {
  countBusinessDays,
  type LeaveBalanceWithType,
  type LeaveRequest,
  type LeaveRequestStatus,
  type LeaveRequestWithRelations,
  type LeaveType,
} from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapRequest(row: LeaveRequest): LeaveRequest {
  return { ...row, days_count: Number(row.days_count) };
}

function mapType(row: LeaveType): LeaveType {
  return { ...row, default_entitlement_days: Number(row.default_entitlement_days) };
}

export const ensureLeaveTypes = createServerFn({ method: "POST" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<LeaveType[]>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { error: rpcError } = await supabase.rpc("ensure_default_leave_types", {
      p_company_id: data.companyId,
    });
    if (rpcError) return { ok: false, message: rpcError.message };

    const { data: rows, error } = await supabase
      .from("leave_types")
      .select("*")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("sort_order");

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: ((rows ?? []) as LeaveType[]).map(mapType) };
  });

export const listLeaveTypes = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }): Promise<LeaveType[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    await supabase.rpc("ensure_default_leave_types", { p_company_id: data.companyId });

    const { data: rows, error } = await supabase
      .from("leave_types")
      .select("*")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw new Error(error.message);
    return ((rows ?? []) as LeaveType[]).map(mapType);
  });

export const listLeaveRequests = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        status: z
          .enum(["draft", "pending", "approved", "rejected", "cancelled", "all"])
          .optional(),
        search: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<LeaveRequestWithRelations[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("leave_requests")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const requests = ((rows ?? []) as LeaveRequest[]).map(mapRequest);
    if (requests.length === 0) return [];

    const employeeIds = [...new Set(requests.map((r) => r.employee_id))];
    const companyIds = [...new Set(requests.map((r) => r.company_id))];
    const typeIds = [...new Set(requests.map((r) => r.leave_type_id))];

    const [employeesRes, companiesRes, typesRes] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds),
      supabase.from("companies").select("id, legal_name").in("id", companyIds),
      supabase.from("leave_types").select("id, name, color").in("id", typeIds),
    ]);

    const empMap = new Map(
      (employeesRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );
    const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.legal_name]));
    const typeMap = new Map(
      (typesRes.data ?? []).map((t) => [t.id, { name: t.name, color: t.color }]),
    );

    let result: LeaveRequestWithRelations[] = requests.map((r) => ({
      ...r,
      employee_name: empMap.get(r.employee_id) ?? null,
      company_name: companyMap.get(r.company_id) ?? null,
      leave_type_name: typeMap.get(r.leave_type_id)?.name ?? null,
      leave_type_color: typeMap.get(r.leave_type_id)?.color ?? null,
    }));

    const search = data?.search?.trim().toLowerCase();
    if (search) {
      result = result.filter((r) =>
        [r.employee_name, r.leave_type_name, r.reason, r.company_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search)),
      );
    }

    return result;
  });

export const leaveStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const today = new Date().toISOString().slice(0, 10);

    let query = supabase
      .from("leave_requests")
      .select("id, status, start_date, end_date, leave_type_id")
      .is("deleted_at", null);

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const pending = list.filter((r) => r.status === "pending").length;
    const onLeaveToday = list.filter(
      (r) => r.status === "approved" && r.start_date <= today && r.end_date >= today,
    ).length;

    const typeIds = [...new Set(list.map((r) => r.leave_type_id))];
    const { data: types } = typeIds.length
      ? await supabase.from("leave_types").select("id, code").in("id", typeIds)
      : { data: [] as Array<{ id: string; code: string }> };

    const codeById = new Map((types ?? []).map((t) => [t.id, t.code]));
    const sick = list.filter(
      (r) =>
        r.status === "approved" &&
        r.start_date <= today &&
        r.end_date >= today &&
        codeById.get(r.leave_type_id) === "SICK",
    ).length;
    const parental = list.filter(
      (r) =>
        r.status === "approved" &&
        r.start_date <= today &&
        r.end_date >= today &&
        codeById.get(r.leave_type_id) === "MATERNITY",
    ).length;

    return { onLeaveToday, sick, parental, pending };
  });

export const listLeaveBalances = createServerFn({ method: "GET" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      employeeId: z.string().uuid().optional(),
      year: z.number().int().optional(),
    }),
  )
  .handler(async ({ data }): Promise<LeaveBalanceWithType[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const year = data.year ?? new Date().getFullYear();

    await supabase.rpc("ensure_default_leave_types", { p_company_id: data.companyId });

    const { data: typeRows, error: typeError } = await supabase
      .from("leave_types")
      .select("*")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("sort_order");

    if (typeError) throw new Error(typeError.message);
    const types = ((typeRows ?? []) as LeaveType[]).map(mapType);

    let employeeId = data.employeeId;
    if (!employeeId) {
      const { data: employees } = await supabase
        .from("employees")
        .select("id")
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .eq("status", "active")
        .limit(1);
      employeeId = employees?.[0]?.id;
    }

    if (!employeeId) return [];

    for (const t of types) {
      await supabase.rpc("ensure_leave_balance", {
        p_company_id: data.companyId,
        p_employee_id: employeeId,
        p_leave_type_id: t.id,
        p_year: year,
      });
    }

    const { data: rows, error } = await supabase
      .from("leave_balances")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("year", year);

    if (error) throw new Error(error.message);

    const typeMap = new Map(types.map((t) => [t.id, t]));

    return (rows ?? []).map((row) => {
      const t = typeMap.get(row.leave_type_id);
      const entitled = Number(row.entitled_days);
      const used = Number(row.used_days);
      const pending = Number(row.pending_days);
      const carried = Number(row.carried_over_days);
      return {
        ...row,
        entitled_days: entitled,
        used_days: used,
        pending_days: pending,
        carried_over_days: carried,
        leave_type_name: t?.name ?? null,
        leave_type_code: t?.code ?? null,
        leave_type_color: t?.color ?? null,
        available_days: entitled + carried - used - pending,
      } satisfies LeaveBalanceWithType;
    });
  });

export const createLeaveRequest = createServerFn({ method: "POST" })
  .validator(createLeaveRequestSchema)
  .handler(async ({ data }): Promise<ActionResult<LeaveRequest>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const days = countBusinessDays(data.startDate, data.endDate);
    if (days <= 0) {
      return { ok: false, message: "Aucune journée ouvrable sur la période sélectionnée" };
    }

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

    const { data: leaveType, error: typeError } = await supabase
      .from("leave_types")
      .select("id, company_id")
      .eq("id", data.leaveTypeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (typeError || !leaveType || leaveType.company_id !== data.companyId) {
      return { ok: false, message: "Type de congé introuvable" };
    }

    const { data: row, error } = await supabase
      .from("leave_requests")
      .insert({
        company_id: data.companyId,
        employee_id: data.employeeId,
        leave_type_id: data.leaveTypeId,
        start_date: data.startDate,
        end_date: data.endDate,
        days_count: days,
        reason: data.reason?.trim() || null,
        status: "draft",
        created_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };

    let request = mapRequest(row as LeaveRequest);

    if (data.submitNow) {
      const { data: transitioned, error: transitionError } = await supabase.rpc(
        "transition_leave_request",
        { p_request_id: request.id, p_action: "submit", p_note: null },
      );
      if (transitionError) {
        return { ok: false, message: transitionError.message };
      }
      request = mapRequest(transitioned as LeaveRequest);
    }

    return { ok: true, data: request };
  });

export const transitionLeaveRequest = createServerFn({ method: "POST" })
  .validator(transitionLeaveSchema)
  .handler(async ({ data }): Promise<ActionResult<LeaveRequest>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase.rpc("transition_leave_request", {
      p_request_id: data.id,
      p_action: data.action,
      p_note: data.note?.trim() || null,
    });

    if (error || !row) return { ok: false, message: error?.message ?? "Transition impossible" };
    return { ok: true, data: mapRequest(row as LeaveRequest) };
  });

export type LeaveStats = {
  onLeaveToday: number;
  sick: number;
  parental: number;
  pending: number;
};

export type { LeaveRequestStatus };
