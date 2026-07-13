import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createContractSchema,
  transitionContractSchema,
  updateContractSchema,
} from "./schemas";
import type { Contract, ContractDetail, ContractStatus, ContractWithRelations } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapContract(row: Contract): Contract {
  return { ...row, base_salary: Number(row.base_salary), hours_per_week: Number(row.hours_per_week) };
}

export const listContracts = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        status: z
          .enum(["draft", "sent", "signed", "active", "expired", "cancelled", "all"])
          .optional(),
        search: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<ContractWithRelations[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("contracts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const contracts = ((rows ?? []) as Contract[]).map(mapContract);
    if (contracts.length === 0) return [];

    const employeeIds = [...new Set(contracts.map((c) => c.employee_id))];
    const companyIds = [...new Set(contracts.map((c) => c.company_id))];
    const deptIds = [...new Set(contracts.map((c) => c.department_id).filter(Boolean))] as string[];

    const [employeesRes, companiesRes, deptsRes] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds),
      supabase.from("companies").select("id, legal_name").in("id", companyIds),
      deptIds.length
        ? supabase.from("departments").select("id, name").in("id", deptIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const empMap = new Map(
      (employeesRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );
    const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.legal_name]));
    const deptMap = new Map((deptsRes.data ?? []).map((d) => [d.id, d.name]));

    let result: ContractWithRelations[] = contracts.map((c) => ({
      ...c,
      employee_name: empMap.get(c.employee_id) ?? null,
      company_name: companyMap.get(c.company_id) ?? null,
      department_name: c.department_id ? deptMap.get(c.department_id) ?? null : null,
    }));

    const search = data?.search?.trim().toLowerCase();
    if (search) {
      result = result.filter((c) =>
        [c.employee_name, c.job_title, c.contract_number, c.company_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search)),
      );
    }

    return result;
  });

export const getContract = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ContractDetail | null> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: row, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;

    const contract = mapContract(row as Contract);
    const [{ data: emp }, { data: letterhead }, { data: dept }] = await Promise.all([
      supabase
        .from("employees")
        .select("first_name, last_name, email, phone, city, national_id")
        .eq("id", contract.employee_id)
        .maybeSingle(),
      supabase.rpc("get_company_letterhead", { p_company_id: contract.company_id }),
      contract.department_id
        ? supabase.from("departments").select("name").eq("id", contract.department_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const company = (letterhead ?? null) as {
      legal_name?: string;
      trade_name?: string | null;
      address_line1?: string | null;
      city?: string | null;
      region?: string | null;
      tax_id?: string | null;
      registration_number?: string | null;
      phone?: string | null;
      email?: string | null;
      logo_url?: string | null;
    } | null;

    return {
      ...contract,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : null,
      company_name: company?.legal_name ?? null,
      department_name: dept?.name ?? null,
      employee_email: emp?.email ?? null,
      employee_phone: emp?.phone ?? null,
      employee_city: emp?.city ?? null,
      employee_national_id: emp?.national_id ?? null,
      company_address: company?.address_line1 ?? null,
      company_city: company?.city ?? null,
      company_region: company?.region ?? null,
      company_tax_id: company?.tax_id ?? null,
      company_trade_name: company?.trade_name ?? null,
      company_registration_number: company?.registration_number ?? null,
      company_phone: company?.phone ?? null,
      company_email: company?.email ?? null,
      company_logo_url: company?.logo_url ?? null,
    };
  });

export const createContract = createServerFn({ method: "POST" })
  .validator(createContractSchema)
  .handler(async ({ data }): Promise<ActionResult<Contract>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    // Ensure employee belongs to company
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id, company_id, job_title, base_salary, currency_code, department_id, branch_id")
      .eq("id", data.employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (empError) return { ok: false, message: empError.message };
    if (!employee) return { ok: false, message: "Employé introuvable" };
    if (employee.company_id !== data.companyId) {
      return { ok: false, message: "L’employé n’appartient pas à cette entreprise" };
    }

    const { data: row, error } = await supabase
      .from("contracts")
      .insert({
        company_id: data.companyId,
        employee_id: data.employeeId,
        contract_type: data.contractType,
        job_title: data.jobTitle.trim(),
        department_id: data.departmentId || employee.department_id || null,
        branch_id: data.branchId || employee.branch_id || null,
        start_date: data.startDate,
        end_date: data.endDate || null,
        trial_end_date: data.trialEndDate || null,
        base_salary: data.baseSalary,
        currency_code: data.currencyCode,
        work_days_per_week: data.workDaysPerWeek,
        hours_per_week: data.hoursPerWeek,
        benefits: data.benefits?.trim() || null,
        clauses: data.clauses?.trim() || null,
        signed_by_employer_name: data.signedByEmployerName?.trim() || null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: mapContract(row as Contract) };
  });

export const updateContract = createServerFn({ method: "POST" })
  .validator(updateContractSchema)
  .handler(async ({ data }): Promise<ActionResult<Contract>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: existing } = await supabase
      .from("contracts")
      .select("status")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { ok: false, message: "Contrat introuvable" };
    if (existing.status === "cancelled" || existing.status === "expired") {
      return { ok: false, message: "Ce contrat ne peut plus être modifié" };
    }
    if (existing.status === "active") {
      return { ok: false, message: "Un contrat actif est immuable — créez un avenant (nouveau contrat)" };
    }

    const { data: row, error } = await supabase
      .from("contracts")
      .update({
        contract_type: data.contractType,
        job_title: data.jobTitle.trim(),
        department_id: data.departmentId || null,
        branch_id: data.branchId || null,
        start_date: data.startDate,
        end_date: data.endDate || null,
        trial_end_date: data.trialEndDate || null,
        base_salary: data.baseSalary,
        currency_code: data.currencyCode,
        work_days_per_week: data.workDaysPerWeek,
        hours_per_week: data.hoursPerWeek,
        benefits: data.benefits?.trim() || null,
        clauses: data.clauses?.trim() || null,
        signed_by_employer_name: data.signedByEmployerName?.trim() || null,
      })
      .eq("id", data.id)
      .select("*")
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: mapContract(row as Contract) };
  });

export type EmployeeAccountProvision = {
  created: boolean;
  linked: boolean;
  email: string;
  temporaryPassword: string | null;
  userId: string;
};

export const transitionContract = createServerFn({ method: "POST" })
  .validator(transitionContractSchema)
  .handler(
    async ({
      data,
    }): Promise<
      | {
          ok: true;
          data: Contract;
          account?: EmployeeAccountProvision;
          accountError?: string;
        }
      | { ok: false; message: string }
    > => {
      await requireUserId();
      const supabase = createSupabaseServerClient();
      const { data: row, error } = await supabase.rpc("transition_contract", {
        p_contract_id: data.id,
        p_action: data.action,
        p_signer_name: data.signerName || null,
        p_reason: data.reason || null,
      });
      if (error) return { ok: false, message: error.message };

      const contract = mapContract(row as Contract);
      let account: EmployeeAccountProvision | undefined;

      if (data.action === "activate") {
        const { data: provision, error: provError } = await supabase.rpc(
          "provision_employee_account",
          { p_employee_id: contract.employee_id },
        );
        if (provError) {
          return {
            ok: true,
            data: contract,
            accountError: provError.message,
          };
        }
        const p = provision as {
          created?: boolean;
          linked?: boolean;
          email?: string;
          temporary_password?: string | null;
          user_id?: string;
        };
        if (p?.user_id && p.email) {
          account = {
            created: Boolean(p.created),
            linked: Boolean(p.linked),
            email: p.email,
            temporaryPassword: p.temporary_password ?? null,
            userId: p.user_id,
          };
        }
      }

      return { ok: true, data: contract, account };
    },
  );

export const contractStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    let query = supabase.from("contracts").select("status, end_date").is("deleted_at", null);
    if (data?.companyId) query = query.eq("company_id", data.companyId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    return {
      active: list.filter((c) => c.status === "active").length,
      draft: list.filter((c) => c.status === "draft").length,
      expired: list.filter((c) => c.status === "expired" || c.status === "cancelled").length,
      expiring30d: list.filter((c) => {
        if (c.status !== "active" || !c.end_date) return false;
        const end = new Date(c.end_date);
        return end >= new Date() && end <= in30;
      }).length,
    };
  });

export type { ContractStatus };
