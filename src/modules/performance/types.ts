export type PerformanceReviewStatus = "draft" | "submitted" | "finalized";

export type PerformanceReview = {
  id: string;
  company_id: string;
  employee_id: string;
  period_label: string;
  score: number;
  goals_pct: number;
  status: PerformanceReviewStatus;
  notes: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PerformanceReviewWithMeta = PerformanceReview & {
  employee_name?: string;
  job_title?: string | null;
};

export const REVIEW_STATUS_LABEL: Record<PerformanceReviewStatus, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  finalized: "Finalisé",
};
