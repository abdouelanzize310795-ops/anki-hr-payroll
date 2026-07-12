export type TrainingCourseStatus = "draft" | "active" | "archived";
export type TrainingEnrollmentStatus =
  | "enrolled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TrainingCourse = {
  id: string;
  company_id: string;
  title: string;
  category: string;
  description: string | null;
  duration_hours: number;
  status: TrainingCourseStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TrainingCourseWithMeta = TrainingCourse & {
  enrolled_count?: number;
  completed_count?: number;
  avg_progress?: number;
};

export type TrainingEnrollment = {
  id: string;
  company_id: string;
  course_id: string;
  employee_id: string;
  status: TrainingEnrollmentStatus;
  progress_pct: number;
  completed_at: string | null;
  certificate_issued: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TrainingEnrollmentWithMeta = TrainingEnrollment & {
  employee_name?: string;
  course_title?: string;
};

export const COURSE_STATUS_LABEL: Record<TrainingCourseStatus, string> = {
  draft: "Brouillon",
  active: "Actif",
  archived: "Archivé",
};

export const ENROLLMENT_STATUS_LABEL: Record<TrainingEnrollmentStatus, string> = {
  enrolled: "Inscrit",
  in_progress: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
};

export const TRAINING_CATEGORIES = [
  "Management",
  "Conformité",
  "Commercial",
  "Technique",
  "Sécurité",
  "Général",
] as const;
