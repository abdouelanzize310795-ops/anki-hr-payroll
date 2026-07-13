import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createLeaveRequestSchema,
  reviewMedicalLeaveSchema,
  transitionLeaveSchema,
} from "./schemas";
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
          .enum([
            "draft",
            "pending",
            "pending_manager",
            "pending_hr",
            "approved",
            "rejected",
            "cancelled",
            "all",
          ])
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
    if (data?.status && data.status !== "all") {
      if (data.status === "pending" || data.status === "pending_manager") {
        query = query.in("status", ["pending", "pending_manager"]);
      } else {
        query = query.eq("status", data.status);
      }
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const requests = ((rows ?? []) as LeaveRequest[]).map(mapRequest);
    if (requests.length === 0) return [];

    const employeeIds = [
      ...new Set([
        ...requests.map((r) => r.employee_id),
        ...requests.map((r) => r.acting_manager_employee_id).filter(Boolean) as string[],
      ]),
    ];
    const companyIds = [...new Set(requests.map((r) => r.company_id))];
    const typeIds = [...new Set(requests.map((r) => r.leave_type_id))];

    const [employeesRes, companiesRes, typesRes] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds),
      supabase.from("companies").select("id, legal_name").in("id", companyIds),
      supabase.from("leave_types").select("id, name, color, code").in("id", typeIds),
    ]);

    const empMap = new Map(
      (employeesRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );
    const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.legal_name]));
    const typeMap = new Map(
      (typesRes.data ?? []).map((t) => [t.id, { name: t.name, color: t.color, code: t.code }]),
    );

    let result: LeaveRequestWithRelations[] = requests.map((r) => ({
      ...r,
      employee_name: empMap.get(r.employee_id) ?? null,
      company_name: companyMap.get(r.company_id) ?? null,
      leave_type_name: typeMap.get(r.leave_type_id)?.name ?? null,
      leave_type_code: typeMap.get(r.leave_type_id)?.code ?? null,
      leave_type_color: typeMap.get(r.leave_type_id)?.color ?? null,
      acting_manager_name: r.acting_manager_employee_id
        ? empMap.get(r.acting_manager_employee_id) ?? null
        : null,
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
    const pending = list.filter((r) =>
      ["pending", "pending_manager", "pending_hr"].includes(r.status),
    ).length;
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
      .select("id, company_id, code")
      .eq("id", data.leaveTypeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (typeError || !leaveType || leaveType.company_id !== data.companyId) {
      return { ok: false, message: "Type de congé introuvable" };
    }

    const isMedical =
      data.isMedical === true ||
      String(leaveType.code ?? "").toUpperCase() === "SICK";

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
        attachment_url: data.attachmentUrl?.trim() || null,
        medical_status: isMedical ? "pending" : null,
        acting_manager_employee_id: data.actingManagerEmployeeId || null,
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

export const reviewMedicalLeave = createServerFn({ method: "POST" })
  .validator(reviewMedicalLeaveSchema)
  .handler(async ({ data }): Promise<ActionResult<LeaveRequest>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: existing, error: findError } = await supabase
      .from("leave_requests")
      .select("id, company_id, medical_status")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (findError || !existing) {
      return { ok: false, message: "Demande introuvable" };
    }
    if (!existing.medical_status) {
      return { ok: false, message: "Cette demande n’est pas un congé médical" };
    }

    const patch: Record<string, unknown> = {
      medical_status: data.medicalStatus,
    };
    if (data.note?.trim()) {
      patch.review_note = data.note.trim();
    }

    const { data: row, error } = await supabase
      .from("leave_requests")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) {
      return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    }

    await supabase.rpc("write_audit_log", {
      p_company_id: existing.company_id,
      p_action: "leave.medical_review",
      p_entity_type: "leave_request",
      p_entity_id: data.id,
      p_summary: `Certificat médical ${data.medicalStatus}`,
      p_metadata: { medical_status: data.medicalStatus },
    });

    return { ok: true, data: mapRequest(row as LeaveRequest) };
  });

export type LeaveStats = {
  onLeaveToday: number;
  sick: number;
  parental: number;
  pending: number;
};

type EmployeeLite = { id: string; first_name: string; last_name: string };

export const getLeaveActingOptions = createServerFn({ method: "GET" })
  .validator(z.object({ employeeId: z.string().uuid(), companyId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: isMgr } = await supabase.rpc("employee_is_department_manager", {
      p_employee_id: data.employeeId,
    });

    if (!isMgr) {
      return { isDepartmentManager: false as const, replacements: [] as EmployeeLite[] };
    }

    const { data: depts } = await supabase
      .from("departments")
      .select("id")
      .eq("manager_employee_id", data.employeeId)
      .is("deleted_at", null);

    const deptIds = (depts ?? []).map((d) => d.id);
    let query = supabase
      .from("employees")
      .select("id, first_name, last_name, department_id")
      .eq("company_id", data.companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .neq("id", data.employeeId)
      .order("last_name");

    if (deptIds.length) {
      query = query.or(
        `department_id.in.(${deptIds.join(",")}),department_id.is.null`,
      );
    }

    const { data: emps, error } = await query;
    if (error) throw new Error(error.message);

    return {
      isDepartmentManager: true as const,
      replacements: (emps ?? []).map((e) => ({
        id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
      })),
    };
  });

export type { LeaveRequestStatus };
