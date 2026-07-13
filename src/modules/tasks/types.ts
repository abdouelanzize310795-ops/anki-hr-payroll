export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type HrTask = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_employee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  estimated_minutes: number | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  review: "Revue",
  done: "Terminé",
};

export const taskPriorityLabel: Record<TaskPriority, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
};

export const TASK_COLUMNS: TaskStatus[] = ["todo", "in_progress", "review", "done"];
