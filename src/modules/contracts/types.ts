export type ContractType = "cdi" | "cdd" | "essai" | "stage" | "consultant";
export type ContractStatus = "draft" | "sent" | "signed" | "active" | "expired" | "cancelled";

export type Contract = {
  id: string;
  company_id: string;
  employee_id: string;
  contract_number: string | null;
  contract_type: ContractType;
  status: ContractStatus;
  job_title: string;
  department_id: string | null;
  branch_id: string | null;
  start_date: string;
  end_date: string | null;
  trial_end_date: string | null;
  base_salary: number;
  currency_code: string;
  work_days_per_week: number;
  hours_per_week: number;
  benefits: string | null;
  clauses: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  signed_by_employee_name: string | null;
  signed_by_employer_name: string | null;
  signature_otp_hint: string | null;
  activated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ContractWithRelations = Contract & {
  employee_name?: string | null;
  company_name?: string | null;
  department_name?: string | null;
};

export type ContractDetail = ContractWithRelations & {
  employee_email?: string | null;
  employee_phone?: string | null;
  employee_city?: string | null;
  employee_national_id?: string | null;
  company_address?: string | null;
  company_city?: string | null;
  company_region?: string | null;
  company_tax_id?: string | null;
};

export const contractTypeLabel: Record<ContractType, string> = {
  cdi: "CDI",
  cdd: "CDD",
  essai: "Période d'essai",
  stage: "Stage",
  consultant: "Consultant",
};

export const contractStatusLabel: Record<ContractStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  signed: "Signé",
  active: "Actif",
  expired: "Expiré",
  cancelled: "Annulé",
};
