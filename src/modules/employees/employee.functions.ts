import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDepartmentSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
} from "./schemas";
import type { Employee, EmployeeStatus, EmployeeWithRelations } from "./types";
import type { Department } from "@/modules/companies/types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

export const listEmployees = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        status: z
          .enum(["active", "onboarding", "on_leave", "suspended", "terminated", "all"])
          .optional(),
        search: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<EmployeeWithRelations[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("employees")
      .select("*")
      .is("deleted_at", null)
      .order("last_name")
      .order("first_name");

    if (data?.companyId) {
      query = query.eq("company_id", data.companyId);
    }
    if (data?.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const employees = (rows ?? []) as Employee[];
    if (employees.length === 0) return [];

    const companyIds = [...new Set(employees.map((e) => e.company_id))];
    const deptIds = [...new Set(employees.map((e) => e.department_id).filter(Boolean))] as string[];
    const branchIds = [...new Set(employees.map((e) => e.branch_id).filter(Boolean))] as string[];

    const [companiesRes, deptsRes, branchesRes] = await Promise.all([
      supabase.from("companies").select("id, legal_name").in("id", companyIds),
      deptIds.length
        ? supabase.from("departments").select("id, name").in("id", deptIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      branchIds.length
        ? supabase.from("branches").select("id, name").in("id", branchIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.legal_name]));
    const deptMap = new Map((deptsRes.data ?? []).map((d) => [d.id, d.name]));
    const branchMap = new Map((branchesRes.data ?? []).map((b) => [b.id, b.name]));

    let result: EmployeeWithRelations[] = employees.map((e) => ({
      ...e,
      base_salary: Number(e.base_salary),
      company_name: companyMap.get(e.company_id) ?? null,
      department_name: e.department_id ? deptMap.get(e.department_id) ?? null : null,
      branch_name: e.branch_id ? branchMap.get(e.branch_id) ?? null : null,
    }));

    const search = data?.search?.trim().toLowerCase();
    if (search) {
      result = result.filter((e) =>
        [e.first_name, e.last_name, e.email, e.job_title, e.employee_number, e.department_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search)),
      );
    }

    return result;
  });

export const getEmployee = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<EmployeeWithRelations | null> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: row, error } = await supabase
      .from("employees")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;

    const employee = row as Employee;
    const [{ data: company }, { data: dept }, { data: branch }] = await Promise.all([
      supabase.from("companies").select("legal_name").eq("id", employee.company_id).maybeSingle(),
      employee.department_id
        ? supabase.from("departments").select("name").eq("id", employee.department_id).maybeSingle()
        : Promise.resolve({ data: null }),
      employee.branch_id
        ? supabase.from("branches").select("name").eq("id", employee.branch_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      ...employee,
      base_salary: Number(employee.base_salary),
      company_name: company?.legal_name ?? null,
      department_name: dept?.name ?? null,
      branch_name: branch?.name ?? null,
    };
  });

export const createEmployee = createServerFn({ method: "POST" })
  .validator(createEmployeeSchema)
  .handler(async ({ data }): Promise<ActionResult<Employee>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("employees")
      .insert({
        company_id: data.companyId,
        branch_id: data.branchId || null,
        department_id: data.departmentId || null,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        job_title: data.jobTitle?.trim() || null,
        hire_date: data.hireDate,
        status: data.status,
        base_salary: data.baseSalary,
        currency_code: data.currencyCode,
        bank_name: data.bankName?.trim() || null,
        bank_account: data.bankAccount?.trim() || null,
        bank_rib: data.bankRib?.trim() || null,
        city: data.city?.trim() || null,
        region: data.region?.trim() || null,
        national_id: data.nationalId?.trim() || null,
        notes: data.notes?.trim() || null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { ...(row as Employee), base_salary: Number((row as Employee).base_salary) } };
  });

export const updateEmployee = createServerFn({ method: "POST" })
  .validator(updateEmployeeSchema)
  .handler(async ({ data }): Promise<ActionResult<Employee>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("employees")
      .update({
        company_id: data.companyId,
        branch_id: data.branchId || null,
        department_id: data.departmentId || null,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        job_title: data.jobTitle?.trim() || null,
        hire_date: data.hireDate,
        status: data.status,
        base_salary: data.baseSalary,
        currency_code: data.currencyCode,
        bank_name: data.bankName?.trim() || null,
        bank_account: data.bankAccount?.trim() || null,
        bank_rib: data.bankRib?.trim() || null,
        city: data.city?.trim() || null,
        region: data.region?.trim() || null,
        national_id: data.nationalId?.trim() || null,
        notes: data.notes?.trim() || null,
      })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { ...(row as Employee), base_salary: Number((row as Employee).base_salary) } };
  });

export const softDeleteEmployee = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("employees")
      .update({
        deleted_at: new Date().toISOString(),
        status: "terminated" satisfies EmployeeStatus,
        termination_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", data.id)
      .is("deleted_at", null);

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export const createDepartment = createServerFn({ method: "POST" })
  .validator(createDepartmentSchema)
  .handler(async ({ data }): Promise<ActionResult<Department>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: dept, error } = await supabase.rpc("create_department", {
      p_company_id: data.companyId,
      p_name: data.name,
      p_code: data.code || null,
      p_branch_id: data.branchId || null,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: dept as Department };
  });

export const employeeStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("employees")
      .select("status")
      .is("deleted_at", null);
    if (data?.companyId) query = query.eq("company_id", data.companyId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    return {
      total: list.length,
      active: list.filter((e) => e.status === "active").length,
      onLeave: list.filter((e) => e.status === "on_leave").length,
      onboarding: list.filter((e) => e.status === "onboarding").length,
    };
  });
