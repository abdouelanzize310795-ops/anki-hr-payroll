export type HelpdeskCategory =
  | "incident"
  | "request"
  | "question"
  | "access"
  | "other";

export type HelpdeskPriority = "low" | "medium" | "high" | "urgent";

export type HelpdeskStatus =
  | "pending_manager"
  | "open"
  | "in_progress"
  | "resolved"
  | "closed"
  | "rejected"
  | "cancelled";

export type HelpdeskTicket = {
  id: string;
  company_id: string;
  ticket_number: string;
  title: string;
  description: string | null;
  category: HelpdeskCategory;
  priority: HelpdeskPriority;
  status: HelpdeskStatus;
  requester_employee_id: string | null;
  requester_department_id: string | null;
  requester_user_id?: string | null;
  assignee_employee_id: string | null;
  assignee_department_id: string | null;
  manager_reviewed_by: string | null;
  manager_reviewed_at: string | null;
  manager_note: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  photo_path?: string | null;
  photo_url?: string | null;
  handler_employee_id?: string | null;
  handled_at?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type HelpdeskTicketWithRelations = HelpdeskTicket & {
  requester_name?: string | null;
  assignee_name?: string | null;
  assignee_department_name?: string | null;
  requester_department_name?: string | null;
  handler_name?: string | null;
};

export const helpdeskCategoryLabel: Record<HelpdeskCategory, string> = {
  incident: "Incident",
  request: "Demande",
  question: "Question",
  access: "Accès",
  other: "Autre",
};

export const helpdeskPriorityLabel: Record<HelpdeskPriority, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};

export const helpdeskStatusLabel: Record<HelpdeskStatus, string> = {
  pending_manager: "En attente manager",
  open: "Ouvert",
  in_progress: "En cours",
  resolved: "Résolu",
  closed: "Clôturé",
  rejected: "Refusé",
  cancelled: "Annulé",
};

export function helpdeskStatusToPill(status: HelpdeskStatus): string {
  return helpdeskStatusLabel[status];
}
