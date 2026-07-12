import { z } from "zod";

export const createTaskSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  title: z.string().trim().min(2, "Titre obligatoire").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["todo", "in_progress", "review", "done"]).default("todo"),
  assigneeEmployeeId: z.string().uuid().optional().nullable(),
  assigneeName: z.string().trim().max(120).optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
});

export const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
  assigneeEmployeeId: z.string().uuid().optional().nullable(),
  assigneeName: z.string().trim().max(120).optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
