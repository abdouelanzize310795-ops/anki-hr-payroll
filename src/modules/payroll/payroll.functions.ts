import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createComponentSchema,
  createPayrollRunSchema,
  transitionPayrollSchema,
  updateComponentSchema,
} from "./schemas";
import {
  periodBounds,
  periodLabel,
  type PayrollComponent,
  type PayrollComponentPreset,
  type PayrollRun,
  type PayrollRunStatus,
  type PayrollRunWithMeta,
  type Payslip,
  type PayslipDetail,
  type PayslipLine,
} from "./types";
import { CLASSIC_TEMPLATE_ID, type PayslipLayout, type RenderablePayslip } from "./template.types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

/** Company-wide payroll totals are for employer/HR and the platform admin only. */
async function canSeeCompanyPayroll(): Promise<boolean> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc("current_user_role");
  return data === "employer" || data === "hr" || data === "platform_admin";
}

type PayslipRun = {
  payslip_id: string;
  payroll_run_id: string;
  label: string;
  period_year: number;
  period_month: number;
  period_start: string;
  period_end: string;
  status: PayrollRunStatus;
};

/** Run period/status of payslips the caller may see (no company-wide totals). */
async function payslipRuns(payslipIds: string[]): Promise<Map<string, PayslipRun>> {
  if (payslipIds.length === 0) return new Map();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("payslip_runs", { p_payslip_ids: payslipIds });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as PayslipRun[]).map((r) => [r.payslip_id, r]));
}

function mapComponent(row: PayrollComponent): PayrollComponent {
  return {
    ...row,
    rate_value: Number(row.rate_value),
    subject_to_igr: row.subject_to_igr ?? true,
    subject_to_retirement: row.subject_to_retirement ?? true,
    min_amount: row.min_amount == null ? null : Number(row.min_amount),
    max_amount: row.max_amount == null ? null : Number(row.max_amount),
  };
}

// ---------------------------------------------------------------------------
// Rubric builder (library, drag & drop, rules, preview)
// ---------------------------------------------------------------------------

export const listComponentPresets = createServerFn({ method: "GET" }).handler(
  async (): Promise<PayrollComponentPreset[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("payroll_component_presets")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as PayrollComponentPreset[]).map((p) => ({
      ...p,
      rate_value: Number(p.rate_value),
    }));
  },
);

export const addComponentFromPreset = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      presetCode: z.string().min(2).max(40),
      kind: z.enum(["earning", "deduction", "employer_contribution"]).optional(),
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<PayrollComponent>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: preset } = await supabase
      .from("payroll_component_presets")
      .select("*")
      .eq("code", data.presetCode)
      .maybeSingle();
    if (!preset) return { ok: false, message: "Rubrique inconnue" };
    if (data.kind && data.kind !== preset.kind) {
      return { ok: false, message: "Cette rubrique ne peut pas aller dans cette colonne" };
    }

    // Same code twice → suffix (e.g. two different fixed bonuses).
    const { data: existing } = await supabase
      .from("payroll_components")
      .select("code")
      .eq("company_id", data.companyId)
      .like("code", `${preset.code}%`);
    const taken = new Set((existing ?? []).map((r) => r.code));
    let code = preset.code;
    for (let i = 2; taken.has(code); i++) code = `${preset.code}_${i}`;

    const { data: row, error } = await supabase
      .from("payroll_components")
      .insert({
        company_id: data.companyId,
        code,
        name: code === preset.code ? preset.name : `${preset.name} (${code.split("_").pop()})`,
        description: preset.description,
        kind: preset.kind,
        calc_method: preset.calc_method,
        rate_value: preset.rate_value,
        percent_basis: preset.percent_basis,
        subject_to_igr: preset.subject_to_igr,
        subject_to_retirement: preset.subject_to_retirement,
        reduces_taxable_base: preset.reduces_taxable_base,
        cond_min_seniority_months: preset.cond_min_seniority_months,
        sort_order: preset.sort_order,
      })
      .select("*")
      .single();
    if (error || !row) return { ok: false, message: error?.message ?? "Ajout impossible" };
    return { ok: true, data: mapComponent(row as PayrollComponent) };
  });

const rulesSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(80),
    calcMethod: z.enum([
      "base_salary",
      "fixed",
      "percent_of_base",
      "percent_of_gross",
      "worked_hours",
      "overtime_hours",
      "igr_progressive",
    ]),
    rateValue: z.number().min(0).max(100_000_000),
    percentBasis: z.enum(["auto", "base", "gross", "taxable", "retirement"]),
    minAmount: z.number().min(0).nullable(),
    maxAmount: z.number().min(0).nullable(),
    subjectToIgr: z.boolean(),
    subjectToRetirement: z.boolean(),
    reducesTaxableBase: z.boolean(),
    isActive: z.boolean(),
    showOnPayslip: z.boolean(),
    showBaseRate: z.boolean(),
    condDepartmentIds: z.array(z.string().uuid()).max(100),
    condContractTypes: z.array(z.enum(["cdi", "cdd", "essai", "stage", "consultant"])).max(5),
    condMinSeniorityMonths: z.number().int().min(0).max(600).nullable(),
    condEmployeeIds: z.array(z.string().uuid()).max(500),
  })
  .refine((v) => v.minAmount == null || v.maxAmount == null || v.maxAmount >= v.minAmount, {
    message: "Le plafond doit être supérieur au plancher",
    path: ["maxAmount"],
  });

export const updateComponentRules = createServerFn({ method: "POST" })
  .validator(rulesSchema)
  .handler(async ({ data }): Promise<ActionResult<PayrollComponent>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: existing } = await supabase
      .from("payroll_components")
      .select("is_system, calc_method, company_id, name")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) return { ok: false, message: "Rubrique introuvable" };
    if (existing.is_system && existing.calc_method !== data.calcMethod) {
      return {
        ok: false,
        message: "La méthode de calcul d’une rubrique système ne peut pas changer",
      };
    }

    const { data: row, error } = await supabase
      .from("payroll_components")
      .update({
        name: data.name,
        calc_method: data.calcMethod,
        rate_value: data.rateValue,
        percent_basis: data.percentBasis,
        min_amount: data.minAmount,
        max_amount: data.maxAmount,
        subject_to_igr: data.subjectToIgr,
        subject_to_retirement: data.subjectToRetirement,
        reduces_taxable_base: data.reducesTaxableBase,
        is_active: data.isActive,
        show_on_payslip: data.showOnPayslip,
        show_base_rate: data.showBaseRate,
        cond_department_ids: data.condDepartmentIds.length ? data.condDepartmentIds : null,
        cond_contract_types: data.condContractTypes.length ? data.condContractTypes : null,
        cond_min_seniority_months: data.condMinSeniorityMonths,
        cond_employee_ids: data.condEmployeeIds.length ? data.condEmployeeIds : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };

    await supabase.rpc("write_audit_log", {
      p_company_id: existing.company_id,
      p_action: "payroll_component.rules_updated",
      p_entity_type: "payroll_component",
      p_entity_id: data.id,
      p_summary: `Règles de « ${data.name} » modifiées`,
    });
    return { ok: true, data: mapComponent(row as PayrollComponent) };
  });

export const reorderComponents = createServerFn({ method: "POST" })
  .validator(
    z.object({ companyId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(200) }),
  )
  .handler(async ({ data }): Promise<ActionResult<{ count: number }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("reorder_payroll_components", {
      p_company_id: data.companyId,
      p_ids: data.ids,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { count: data.ids.length } };
  });

export const removeComponent = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: existing } = await supabase
      .from("payroll_components")
      .select("is_system")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) return { ok: false, message: "Rubrique introuvable" };
    if (existing.is_system)
      return { ok: false, message: "Une rubrique système peut être désactivée mais pas supprimée" };
    const { error } = await supabase
      .from("payroll_components")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", data.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export type PayslipPreview = {
  gross: number;
  deductions: number;
  net: number;
  employer: number;
  worked_hours?: number;
  message?: string;
  lines: {
    code: string;
    label: string;
    kind: string;
    basis: number;
    rate: number;
    amount: number;
    hidden: boolean;
  }[];
};

export const previewPayslip = createServerFn({ method: "POST" })
  .validator(
    z.object({
      employeeId: z.string().uuid(),
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<PayslipPreview>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: res, error } = await supabase.rpc("preview_payslip", {
      p_employee_id: data.employeeId,
      p_year: data.year,
      p_month: data.month,
    });
    if (error || !res) return { ok: false, message: error?.message ?? "Aperçu impossible" };
    return { ok: true, data: res as PayslipPreview };
  });

function mapRun(row: PayrollRun): PayrollRun {
  return {
    ...row,
    total_gross: Number(row.total_gross),
    total_deductions: Number(row.total_deductions),
    total_net: Number(row.total_net),
    total_employer_cost: Number(row.total_employer_cost),
  };
}

function mapPayslip(row: Payslip): Payslip {
  return {
    ...row,
    base_salary: Number(row.base_salary),
    gross_amount: Number(row.gross_amount),
    deduction_amount: Number(row.deduction_amount),
    net_amount: Number(row.net_amount),
    employer_contribution_amount: Number(row.employer_contribution_amount),
    worked_hours: row.worked_hours == null ? null : Number(row.worked_hours),
    overtime_hours: row.overtime_hours == null ? null : Number(row.overtime_hours),
    expected_hours: row.expected_hours == null ? null : Number(row.expected_hours),
  };
}

function mapLine(row: PayslipLine): PayslipLine {
  return {
    ...row,
    rate_applied: Number(row.rate_applied),
    basis_amount: Number(row.basis_amount),
    amount: Number(row.amount),
  };
}

export const listPayrollComponents = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }): Promise<PayrollComponent[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    await supabase.rpc("ensure_default_payroll_components", { p_company_id: data.companyId });

    const { data: rows, error } = await supabase
      .from("payroll_components")
      .select("*")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .order("sort_order");

    if (error) throw new Error(error.message);
    return ((rows ?? []) as PayrollComponent[]).map(mapComponent);
  });

export const updatePayrollComponent = createServerFn({ method: "POST" })
  .validator(updateComponentSchema)
  .handler(async ({ data }): Promise<ActionResult<PayrollComponent>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.rateValue !== undefined) patch.rate_value = data.rateValue;
    if (data.calcMethod !== undefined) patch.calc_method = data.calcMethod;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.subjectToIgr !== undefined) patch.subject_to_igr = data.subjectToIgr;
    if (data.subjectToRetirement !== undefined) {
      patch.subject_to_retirement = data.subjectToRetirement;
    }

    const { data: existing } = await supabase
      .from("payroll_components")
      .select("is_system, calc_method")
      .eq("id", data.id)
      .maybeSingle();

    if (existing?.is_system && data.calcMethod && data.calcMethod !== "base_salary") {
      return {
        ok: false,
        message: "Le composant système salaire de base ne peut pas changer de méthode",
      };
    }

    const { data: row, error } = await supabase
      .from("payroll_components")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    return { ok: true, data: mapComponent(row as PayrollComponent) };
  });

export const createPayrollComponent = createServerFn({ method: "POST" })
  .validator(createComponentSchema)
  .handler(async ({ data }): Promise<ActionResult<PayrollComponent>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("payroll_components")
      .insert({
        company_id: data.companyId,
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        kind: data.kind,
        calc_method: data.calcMethod,
        rate_value: data.rateValue,
        subject_to_igr: data.subjectToIgr ?? true,
        subject_to_retirement: data.subjectToRetirement ?? true,
        sort_order: data.kind === "earning" ? 50 : data.kind === "deduction" ? 150 : 250,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };
    return { ok: true, data: mapComponent(row as PayrollComponent) };
  });

export const listPayrollRuns = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<PayrollRunWithMeta[]> => {
    await requireUserId();
    if (!(await canSeeCompanyPayroll())) return [];
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("payroll_runs")
      .select("*")
      .is("deleted_at", null)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const runs = ((rows ?? []) as PayrollRun[]).map(mapRun);
    if (runs.length === 0) return [];

    const companyIds = [...new Set(runs.map((r) => r.company_id))];
    const { data: companies } = await supabase
      .from("companies")
      .select("id, legal_name")
      .in("id", companyIds);
    const map = new Map((companies ?? []).map((c) => [c.id, c.legal_name]));

    return runs.map((r) => ({ ...r, company_name: map.get(r.company_id) ?? null }));
  });

export const payrollStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    if (!(await canSeeCompanyPayroll())) {
      return {
        latestGross: 0,
        latestNet: 0,
        latestEmployees: 0,
        latestAvg: 0,
        payslipCount: 0,
        ytdGross: 0,
        currency: "KMF",
      };
    }
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("payroll_runs")
      .select(
        "status, total_gross, total_net, total_employer_cost, employee_count, period_year, period_month",
      )
      .is("deleted_at", null)
      .neq("status", "cancelled");

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const latest = [...list].sort((a, b) => {
      if (a.period_year !== b.period_year) return b.period_year - a.period_year;
      return b.period_month - a.period_month;
    })[0];

    const paid = list.filter((r) => r.status === "paid");
    const ytdGross = paid
      .filter((r) => r.period_year === new Date().getFullYear())
      .reduce((s, r) => s + Number(r.total_gross), 0);

    return {
      latestGross: latest ? Number(latest.total_gross) : 0,
      latestNet: latest ? Number(latest.total_net) : 0,
      latestEmployees: latest ? Number(latest.employee_count) : 0,
      latestAvg:
        latest && latest.employee_count > 0
          ? Math.round(Number(latest.total_net) / Number(latest.employee_count))
          : 0,
      payslipCount: list.reduce((s, r) => s + Number(r.employee_count), 0),
      ytdGross,
      currency: "KMF",
    };
  });

export const payrollTrend = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    if (!(await canSeeCompanyPayroll())) return [];
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("payroll_runs")
      .select("period_year, period_month, total_gross, total_net, status")
      .is("deleted_at", null)
      .in("status", ["calculated", "approved", "paid"])
      .order("period_year")
      .order("period_month");

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? []).slice(-7).map((r) => ({
      m: `${String(r.period_month).padStart(2, "0")}/${String(r.period_year).slice(2)}`,
      brut: Math.round((Number(r.total_gross) / 1_000_000) * 10) / 10,
      net: Math.round((Number(r.total_net) / 1_000_000) * 10) / 10,
      brutRaw: Number(r.total_gross),
      netRaw: Number(r.total_net),
    }));
  });

export const createPayrollRun = createServerFn({ method: "POST" })
  .validator(createPayrollRunSchema)
  .handler(async ({ data }): Promise<ActionResult<PayrollRun>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    await supabase.rpc("ensure_default_payroll_components", { p_company_id: data.companyId });

    const { data: company } = await supabase
      .from("companies")
      .select("currency_code, legal_name")
      .eq("id", data.companyId)
      .maybeSingle();

    const bounds = periodBounds(data.year, data.month);
    const label = `Paie ${periodLabel(data.year, data.month)}`;

    const { data: row, error } = await supabase
      .from("payroll_runs")
      .insert({
        company_id: data.companyId,
        label,
        period_year: data.year,
        period_month: data.month,
        period_start: bounds.start,
        period_end: bounds.end,
        currency_code: company?.currency_code ?? "KMF",
        notes: data.notes?.trim() || null,
        created_by: userId,
        status: "draft",
      })
      .select("*")
      .single();

    if (error || !row) {
      if (error?.code === "23505") {
        return { ok: false, message: "Un cycle existe déjà pour cette période" };
      }
      return { ok: false, message: error?.message ?? "Création impossible" };
    }

    return { ok: true, data: mapRun(row as PayrollRun) };
  });

export const transitionPayrollRun = createServerFn({ method: "POST" })
  .validator(transitionPayrollSchema)
  .handler(async ({ data }): Promise<ActionResult<PayrollRun>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    if (data.action === "calculate") {
      const { data: row, error } = await supabase.rpc("calculate_payroll_run", {
        p_run_id: data.id,
      });
      if (error || !row) return { ok: false, message: error?.message ?? "Calcul impossible" };
      return { ok: true, data: mapRun(row as PayrollRun) };
    }

    const { data: row, error } = await supabase.rpc("transition_payroll_run", {
      p_run_id: data.id,
      p_action: data.action,
    });
    if (error || !row) return { ok: false, message: error?.message ?? "Transition impossible" };
    return { ok: true, data: mapRun(row as PayrollRun) };
  });

export const getPayrollRun = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<(PayrollRunWithMeta & { payslips: Payslip[] }) | null> => {
    await requireUserId();
    if (!(await canSeeCompanyPayroll())) return null;
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;

    const run = mapRun(row as PayrollRun);
    const [{ data: company }, { data: slips }] = await Promise.all([
      supabase.from("companies").select("legal_name").eq("id", run.company_id).maybeSingle(),
      supabase
        .from("payslips")
        .select("*")
        .eq("payroll_run_id", run.id)
        .is("deleted_at", null)
        .order("employee_name"),
    ]);

    return {
      ...run,
      company_name: company?.legal_name ?? null,
      payslips: ((slips ?? []) as Payslip[]).map(mapPayslip),
    };
  });

export const getPayslip = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<RenderablePayslip | null> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("payslips")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;

    const slip = mapPayslip(row as Payslip);

    const run = (await payslipRuns([slip.id])).get(slip.id) ?? null;

    // Employees and managers only see their own payslips, once the run is approved.
    const { data: auth } = await supabase.auth.getUser();
    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", auth.user?.id ?? "")
      .maybeSingle();
    if (!me || !["employer", "hr", "platform_admin"].includes(me.role)) {
      const { data: owner } = await supabase
        .from("employees")
        .select("user_id")
        .eq("id", slip.employee_id)
        .maybeSingle();
      if (owner?.user_id !== auth.user?.id || !["approved", "paid"].includes(run?.status ?? "")) {
        return null;
      }
    }

    const [{ data: lines }, { data: letterhead }, { data: employee }, { data: companyRow }] =
      await Promise.all([
        supabase.from("payslip_lines").select("*").eq("payslip_id", slip.id).order("sort_order"),
        supabase.rpc("get_company_letterhead", { p_company_id: slip.company_id }),
        supabase
          .from("employees")
          .select("bank_name, bank_account, bank_rib")
          .eq("id", slip.employee_id)
          .maybeSingle(),
        supabase
          .from("companies")
          .select("payslip_template_id")
          .eq("id", slip.company_id)
          .maybeSingle(),
      ]);

    // Layout frozen at calculation time, else the company's current template.
    let layout = (row as { template_snapshot?: PayslipLayout | null }).template_snapshot ?? null;
    if (!layout) {
      const { data: tpl } = await supabase
        .from("payslip_templates")
        .select("layout")
        .eq("id", companyRow?.payslip_template_id ?? CLASSIC_TEMPLATE_ID)
        .maybeSingle();
      layout = (tpl?.layout as PayslipLayout | undefined) ?? null;
    }

    // Year-to-date totals (approved/paid runs of the same year up to this period).
    let ytd: RenderablePayslip["ytd"] = null;
    if (run) {
      const { data: employeeSlips } = await supabase
        .from("payslips")
        .select("id, gross_amount, net_amount")
        .eq("employee_id", slip.employee_id)
        .is("deleted_at", null);
      const periods = await payslipRuns((employeeSlips ?? []).map((s) => s.id));
      const slips = (employeeSlips ?? []).filter((s) => {
        const p = periods.get(s.id);
        return (
          p &&
          p.period_year === run.period_year &&
          p.period_month <= run.period_month &&
          ["calculated", "approved", "paid"].includes(p.status)
        );
      });
      if (slips.length) {
        const slipIds = slips.map((s) => s.id);
        const { data: igrLines } = slipIds.length
          ? await supabase
              .from("payslip_lines")
              .select("amount")
              .in("payslip_id", slipIds)
              .eq("calc_method", "igr_progressive")
          : { data: [] as { amount: number }[] };
        ytd = {
          gross: slips.reduce((s, x) => s + Number(x.gross_amount), 0),
          net: slips.reduce((s, x) => s + Number(x.net_amount), 0),
          igr: (igrLines ?? []).reduce((s, x) => s + Number(x.amount), 0),
          months: slips.length,
        };
      }
    }

    // Leave balances of the year.
    let leave: RenderablePayslip["leave"] = null;
    if (run) {
      const { data: balances } = await supabase
        .from("leave_balances")
        .select("leave_type_id, entitled_days, carried_over_days, used_days, pending_days")
        .eq("employee_id", slip.employee_id)
        .eq("year", run.period_year);
      const typeIds = (balances ?? []).map((b) => b.leave_type_id);
      const { data: types } = typeIds.length
        ? await supabase.from("leave_types").select("id, name, deducts_balance").in("id", typeIds)
        : { data: [] as { id: string; name: string; deducts_balance: boolean }[] };
      const typeById = new Map((types ?? []).map((t) => [t.id, t]));
      leave = (balances ?? [])
        .filter((b) => typeById.get(b.leave_type_id)?.deducts_balance)
        .map((b) => {
          const entitled = Number(b.entitled_days) + Number(b.carried_over_days);
          return {
            name: typeById.get(b.leave_type_id)?.name ?? "Congés",
            entitled,
            used: Number(b.used_days),
            pending: Number(b.pending_days),
            remaining: entitled - Number(b.used_days) - Number(b.pending_days),
          };
        });
    }

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
      ...slip,
      lines: ((lines ?? []) as PayslipLine[]).map(mapLine),
      company_name: company?.legal_name ?? null,
      company_address: company?.address_line1 ?? null,
      company_city: company?.city ?? null,
      company_region: company?.region ?? null,
      company_tax_id: company?.tax_id ?? null,
      company_trade_name: company?.trade_name ?? null,
      company_registration_number: company?.registration_number ?? null,
      company_phone: company?.phone ?? null,
      company_email: company?.email ?? null,
      company_logo_url: company?.logo_url ?? null,
      period_label: run ? periodLabel(run.period_year, run.period_month) : null,
      period_start: run?.period_start ?? null,
      period_end: run?.period_end ?? null,
      layout,
      ytd,
      leave,
      bank: employee ?? null,
    };
  });

export type { PayrollRunStatus };

export const listMyPayslips = createServerFn({ method: "GET" }).handler(
  async (): Promise<
    Array<{
      id: string;
      payslip_number: string | null;
      net_amount: number;
      gross_amount: number;
      currency_code: string;
      period_label: string;
      created_at: string;
    }>
  > => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", (await supabase.auth.getUser()).data.user!.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!emp) return [];

    const { data: slips, error } = await supabase
      .from("payslips")
      .select(
        "id, payslip_number, net_amount, gross_amount, currency_code, payroll_run_id, created_at",
      )
      .eq("employee_id", emp.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) throw new Error(error.message);
    if (!slips?.length) return [];

    // Only payslips of approved or paid runs (same rule as the mobile app).
    const runs = await payslipRuns(slips.map((s) => s.id));

    return slips
      .filter((s) => ["approved", "paid"].includes(runs.get(s.id)?.status ?? ""))
      .map((s) => {
        const run = runs.get(s.id);
        return {
          id: s.id,
          payslip_number: s.payslip_number,
          net_amount: Number(s.net_amount),
          gross_amount: Number(s.gross_amount),
          currency_code: s.currency_code,
          period_label: run?.label ?? `${run?.period_month}/${run?.period_year}`,
          created_at: s.created_at,
        };
      });
  },
);
