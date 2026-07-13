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
  type PayrollRun,
  type PayrollRunStatus,
  type PayrollRunWithMeta,
  type Payslip,
  type PayslipDetail,
  type PayslipLine,
} from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapComponent(row: PayrollComponent): PayrollComponent {
  return {
    ...row,
    rate_value: Number(row.rate_value),
    subject_to_igr: row.subject_to_igr ?? true,
    subject_to_retirement: row.subject_to_retirement ?? true,
  };
}

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
      return { ok: false, message: "Le composant système salaire de base ne peut pas changer de méthode" };
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
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("payroll_runs")
      .select("status, total_gross, total_net, total_employer_cost, employee_count, period_year, period_month")
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
  .handler(async ({ data }): Promise<PayslipDetail | null> => {
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

    const [{ data: lines }, { data: letterhead }, { data: run }] = await Promise.all([
      supabase
        .from("payslip_lines")
        .select("*")
        .eq("payslip_id", slip.id)
        .order("sort_order"),
      supabase.rpc("get_company_letterhead", { p_company_id: slip.company_id }),
      supabase
        .from("payroll_runs")
        .select("label, period_start, period_end, period_year, period_month")
        .eq("id", slip.payroll_run_id)
        .maybeSingle(),
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
      period_label: run
        ? periodLabel(run.period_year, run.period_month)
        : null,
      period_start: run?.period_start ?? null,
      period_end: run?.period_end ?? null,
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
      .select("id, payslip_number, net_amount, gross_amount, currency_code, payroll_run_id, created_at")
      .eq("employee_id", emp.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) throw new Error(error.message);
    if (!slips?.length) return [];

    const runIds = [...new Set(slips.map((s) => s.payroll_run_id))];
    const { data: runs } = await supabase
      .from("payroll_runs")
      .select("id, label, period_month, period_year")
      .in("id", runIds);

    const runMap = new Map((runs ?? []).map((r) => [r.id, r]));

    return slips.map((s) => {
      const run = runMap.get(s.payroll_run_id);
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
