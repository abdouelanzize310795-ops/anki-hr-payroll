export type PayrollPeriodicity = "monthly" | "biweekly" | "weekly";

export type CompanyApprovalStatus =
  | "pending_payment"
  | "pending_approval"
  | "approved"
  | "rejected";

export type CompanySubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "cancelled"
  | "expired";

export type Country = {
  code: string;
  name: string;
  name_fr: string;
  phone_code: string | null;
  is_active: boolean;
};

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
  is_active: boolean;
};

export type Company = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  sector: string | null;
  tax_id: string | null;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string;
  currency_code: string;
  bank_name: string | null;
  bank_account: string | null;
  bank_rib: string | null;
  payroll_periodicity: PayrollPeriodicity;
  work_days_per_week: number;
  standard_hours_per_day: number;
  overtime_multiplier: number;
  logo_url: string | null;
  is_active: boolean;
  approval_status: CompanyApprovalStatus;
  subscription_status: CompanySubscriptionStatus;
  subscription_plan: string | null;
  subscription_paid_at: string | null;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  /** Unique code to put in the M'Vola transfer description */
  payment_reference: string | null;
  payment_method: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Branch = {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  is_headquarters: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Department = {
  id: string;
  company_id: string;
  branch_id: string | null;
  name: string;
  code: string | null;
  manager_employee_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  manager_name?: string | null;
  /** Effective manager today (acting if coverage active). */
  effective_manager_employee_id?: string | null;
  effective_manager_name?: string | null;
  acting_manager_employee_id?: string | null;
  acting_manager_name?: string | null;
  coverage_start?: string | null;
  coverage_end?: string | null;
};

export type CompanyWithMeta = Company & {
  country?: Country | null;
  currency?: Currency | null;
  branches_count?: number;
  departments_count?: number;
};

export const companyApprovalLabel: Record<CompanyApprovalStatus, string> = {
  pending_payment: "Paiement requis",
  pending_approval: "En attente validation",
  approved: "Validée",
  rejected: "Refusée",
};

export const companySubscriptionLabel: Record<CompanySubscriptionStatus, string> = {
  none: "Aucun",
  pending: "Paiement — en attente",
  active: "Actif",
  cancelled: "Annulé",
  expired: "Expiré",
};
