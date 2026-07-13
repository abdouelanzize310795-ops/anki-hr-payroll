import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDepartmentSchema,
  createEmployeeSchema,
  setDepartmentManagerSchema,
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

    const { error: seatError } = await supabase.rpc("assert_company_can_add_employee", {
      p_company_id: data.companyId,
    });
    if (seatError) return { ok: false, message: seatError.message };

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

    const employee = {
      ...(row as Employee),
      base_salary: Number((row as Employee).base_salary),
    };

    await supabase.rpc("write_audit_log", {
      p_company_id: data.companyId,
      p_action: "employee.create",
      p_entity_type: "employee",
      p_entity_id: employee.id,
      p_summary: `Création employé ${employee.first_name} ${employee.last_name}`,
      p_metadata: { employee_number: employee.employee_number },
    });

    return { ok: true, data: employee };
  });

const importEmployeeRowSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().optional().or(z.literal("")),
  jobTitle: z.string().trim().optional().or(z.literal("")),
  baseSalary: z.coerce.number().min(0).optional(),
  hireDate: z.string().optional().or(z.literal("")),
  departmentName: z.string().trim().optional().or(z.literal("")),
});

export const importEmployeesCsv = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      rows: z.array(importEmployeeRowSchema).min(1).max(500),
    }),
  )
  .handler(async ({ data }): Promise<{ imported: number; errors: string[] }> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();
    const today = new Date().toISOString().slice(0, 10);
    const errors: string[] = [];
    let imported = 0;

    const { data: departments } = await supabase
      .from("departments")
      .select("id, name")
      .eq("company_id", data.companyId)
      .is("deleted_at", null);
    const deptByName = new Map(
      (departments ?? []).map((d) => [d.name.trim().toLowerCase(), d.id]),
    );

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const label = `Ligne ${i + 1} (${row.firstName} ${row.lastName})`;

      const { error: seatError } = await supabase.rpc("assert_company_can_add_employee", {
        p_company_id: data.companyId,
      });
      if (seatError) {
        errors.push(`${label}: ${seatError.message}`);
        break;
      }

      let departmentId: string | null = null;
      if (row.departmentName?.trim()) {
        departmentId = deptByName.get(row.departmentName.trim().toLowerCase()) ?? null;
        if (!departmentId) {
          errors.push(`${label}: département « ${row.departmentName} » introuvable`);
          continue;
        }
      }

      const hireDate = row.hireDate?.trim() || today;
      const { data: inserted, error } = await supabase
        .from("employees")
        .insert({
          company_id: data.companyId,
          department_id: departmentId,
          first_name: row.firstName.trim(),
          last_name: row.lastName.trim(),
          email: row.email?.trim() || null,
          job_title: row.jobTitle?.trim() || null,
          hire_date: hireDate,
          status: "active",
          base_salary: row.baseSalary ?? 0,
          currency_code: "KMF",
          created_by: userId,
        })
        .select("id, first_name, last_name, employee_number")
        .single();

      if (error || !inserted) {
        errors.push(`${label}: ${error?.message ?? "création impossible"}`);
        continue;
      }

      await supabase.rpc("write_audit_log", {
        p_company_id: data.companyId,
        p_action: "employee.import",
        p_entity_type: "employee",
        p_entity_id: inserted.id,
        p_summary: `Import CSV employé ${inserted.first_name} ${inserted.last_name}`,
        p_metadata: { employee_number: inserted.employee_number },
      });

      imported += 1;
    }

    return { imported, errors };
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
      p_manager_employee_id: data.managerEmployeeId || null,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: dept as Department };
  });

export const setDepartmentManager = createServerFn({ method: "POST" })
  .validator(setDepartmentManagerSchema)
  .handler(async ({ data }): Promise<ActionResult<Department>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: dept, error } = await supabase.rpc("set_department_manager", {
      p_department_id: data.departmentId,
      p_manager_employee_id: data.managerEmployeeId,
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

export type EmployeeAccountProvision = {
  created: boolean;
  linked: boolean;
  email: string;
  temporaryPassword: string | null;
  userId: string;
};

export const provisionEmployeeAccount = createServerFn({ method: "POST" })
  .validator(z.object({ employeeId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; data: EmployeeAccountProvision } | { ok: false; message: string }
    > => {
      await requireUserId();
      const supabase = createSupabaseServerClient();
      const { data: provision, error } = await supabase.rpc("provision_employee_account", {
        p_employee_id: data.employeeId,
      });
      if (error) return { ok: false, message: error.message };
      const p = provision as {
        created?: boolean;
        linked?: boolean;
        email?: string;
        temporary_password?: string | null;
        user_id?: string;
      };
      if (!p?.user_id || !p.email) {
        return { ok: false, message: "Création du compte impossible" };
      }
      return {
        ok: true,
        data: {
          created: Boolean(p.created),
          linked: Boolean(p.linked),
          email: p.email,
          temporaryPassword: p.temporary_password ?? null,
          userId: p.user_id,
        },
      };
    },
  );
