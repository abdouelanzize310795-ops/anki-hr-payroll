export type PayrollPeriodicity = "monthly" | "biweekly" | "weekly";

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
  logo_url: string | null;
  is_active: boolean;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CompanyWithMeta = Company & {
  country?: Country | null;
  currency?: Currency | null;
  branches_count?: number;
  departments_count?: number;
};
