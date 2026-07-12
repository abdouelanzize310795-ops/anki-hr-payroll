export type TransferBatchStatus = "draft" | "ready" | "exported" | "cancelled";

export type TransferBatch = {
  id: string;
  company_id: string;
  payroll_run_id: string;
  label: string;
  currency_code: string;
  status: TransferBatchStatus;
  line_count: number;
  total_amount: number;
  total_in_words: string | null;
  missing_account_count: number;
  exported_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TransferLine = {
  id: string;
  batch_id: string;
  company_id: string;
  payslip_id: string | null;
  employee_id: string | null;
  order_number: number;
  beneficiary_name: string;
  job_title: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_rib: string | null;
  amount: number;
  currency_code: string;
  has_account: boolean;
  created_at: string;
};

export type TransferBatchDetail = TransferBatch & {
  company_name?: string | null;
  payroll_label?: string | null;
  lines: TransferLine[];
};

export const transferStatusLabel: Record<TransferBatchStatus, string> = {
  draft: "Brouillon",
  ready: "Prêt",
  exported: "Exporté",
  cancelled: "Annulé",
};

export const transferStatusPill: Record<TransferBatchStatus, string> = {
  draft: "Brouillon",
  ready: "Approuvé",
  exported: "Payé",
  cancelled: "Annulé",
};
