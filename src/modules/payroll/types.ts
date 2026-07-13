export type PayrollComponentKind = "earning" | "deduction" | "employer_contribution";
export type PayrollCalcMethod =
  | "base_salary"
  | "fixed"
  | "percent_of_base"
  | "percent_of_gross"
  | "worked_hours"
  | "overtime_hours"
  | "igr_progressive";
export type PayrollRunStatus = "draft" | "calculated" | "approved" | "paid" | "cancelled";

export type PayrollComponent = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  kind: PayrollComponentKind;
  calc_method: PayrollCalcMethod;
  rate_value: number;
  is_taxable: boolean;
  subject_to_igr: boolean;
  subject_to_retirement: boolean;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PayrollRun = {
  id: string;
  company_id: string;
  label: string;
  period_year: number;
  period_month: number;
  period_start: string;
  period_end: string;
  currency_code: string;
  status: PayrollRunStatus;
  employee_count: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_employer_cost: number;
  notes: string | null;
  calculated_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PayrollRunWithMeta = PayrollRun & {
  company_name?: string | null;
};

export type Payslip = {
  id: string;
  payroll_run_id: string;
  company_id: string;
  employee_id: string;
  payslip_number: string | null;
  employee_number: string | null;
  employee_name: string;
  job_title: string | null;
  department_name: string | null;
  base_salary: number;
  currency_code: string;
  gross_amount: number;
  deduction_amount: number;
  net_amount: number;
  employer_contribution_amount: number;
  status: string;
  worked_hours?: number | null;
  overtime_hours?: number | null;
  expected_hours?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PayslipLine = {
  id: string;
  payslip_id: string;
  company_id: string;
  component_id: string | null;
  code: string;
  label: string;
  kind: PayrollComponentKind;
  calc_method: PayrollCalcMethod;
  rate_applied: number;
  basis_amount: number;
  amount: number;
  sort_order: number;
  created_at: string;
};

export type PayslipDetail = Payslip & {
  lines: PayslipLine[];
  company_name?: string | null;
  company_address?: string | null;
  company_city?: string | null;
  company_region?: string | null;
  company_tax_id?: string | null;
  company_trade_name?: string | null;
  company_registration_number?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  company_logo_url?: string | null;
  period_label?: string | null;
  period_start?: string | null;
  period_end?: string | null;
};

export const payrollRunStatusLabel: Record<PayrollRunStatus, string> = {
  draft: "Brouillon",
  calculated: "Calculé",
  approved: "Approuvé",
  paid: "Payé",
  cancelled: "Annulé",
};

export const payrollRunStatusPill: Record<PayrollRunStatus, string> = {
  draft: "Brouillon",
  calculated: "En attente",
  approved: "Approuvé",
  paid: "Payé",
  cancelled: "Annulé",
};

export const componentKindLabel: Record<PayrollComponentKind, string> = {
  earning: "Gain",
  deduction: "Retenue",
  employer_contribution: "Charge patronale",
};

export const calcMethodLabel: Record<PayrollCalcMethod, string> = {
  base_salary: "Salaire de base (proratisé pointage)",
  fixed: "Montant fixe",
  percent_of_base: "% du salaire de base",
  percent_of_gross: "% du brut",
  worked_hours: "Heures travaillées × tarif",
  overtime_hours: "Heures supp. × tarif × multiplicateur",
  igr_progressive: "I.G.R. progressif (barème)",
};

export const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function periodLabel(year: number, month: number): string {
  return `${MONTHS_FR[month - 1] ?? month} ${year}`;
}

export function periodBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}
