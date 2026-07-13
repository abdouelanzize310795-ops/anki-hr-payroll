import { z } from "zod";

export const helpdeskCategorySchema = z.enum([
  "incident",
  "request",
  "question",
  "access",
  "other",
]);

export const helpdeskPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "urgent",
]);

export const helpdeskStatusSchema = z.enum([
  "pending_manager",
  "open",
  "in_progress",
  "resolved",
  "closed",
  "rejected",
  "cancelled",
]);

export const createHelpdeskTicketSchema = z
  .object({
    companyId: z.string().uuid(),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(4000).optional().or(z.literal("")),
    category: helpdeskCategorySchema.default("request"),
    priority: helpdeskPrioritySchema.default("medium"),
    assigneeEmployeeId: z.string().uuid().optional().nullable(),
    assigneeDepartmentId: z.string().uuid().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    const hasEmp = Boolean(v.assigneeEmployeeId);
    const hasDept = Boolean(v.assigneeDepartmentId);
    if (hasEmp === hasDept) {
      ctx.addIssue({
        code: "custom",
        message: "Choisissez une personne ou un département",
        path: ["assigneeEmployeeId"],
      });
    }
  });

export const transitionHelpdeskSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "cancel", "start", "resolve", "close"]),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type CreateHelpdeskTicketInput = z.infer<typeof createHelpdeskTicketSchema>;
export type TransitionHelpdeskInput = z.infer<typeof transitionHelpdeskSchema>;
