export type JobOpeningStatus = "draft" | "open" | "on_hold" | "closed" | "filled";
export type CandidateStage =
  | "sourced"
  | "screened"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";

export type JobOpening = {
  id: string;
  company_id: string;
  title: string;
  department_id: string | null;
  location: string | null;
  employment_type: string;
  description: string | null;
  status: JobOpeningStatus;
  openings_count: number;
  salary_min: number | null;
  salary_max: number | null;
  currency_code: string;
  published_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type JobOpeningWithMeta = JobOpening & {
  candidate_count?: number;
  department_name?: string | null;
};

export type Candidate = {
  id: string;
  company_id: string;
  job_opening_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  stage: CandidateStage;
  source: string | null;
  notes: string | null;
  expected_salary: number | null;
  hired_employee_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CandidateWithMeta = Candidate & {
  job_title?: string | null;
};

export const JOB_STATUS_LABEL: Record<JobOpeningStatus, string> = {
  draft: "Brouillon",
  open: "Ouvert",
  on_hold: "En pause",
  closed: "Fermé",
  filled: "Pourvu",
};

export const CANDIDATE_STAGES: CandidateStage[] = [
  "sourced",
  "screened",
  "interview",
  "offer",
  "hired",
];

export const CANDIDATE_STAGE_LABEL: Record<CandidateStage, string> = {
  sourced: "Sourcé",
  screened: "Présélection",
  interview: "Entretien",
  offer: "Offre",
  hired: "Embauché",
  rejected: "Refusé",
};

export const EMPLOYMENT_TYPES = ["CDI", "CDD", "Stage", "Intérim", "Freelance"] as const;
