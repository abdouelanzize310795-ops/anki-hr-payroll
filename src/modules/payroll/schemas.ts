import { z } from "zod";

export const createPayrollRunSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateComponentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  rateValue: z.coerce.number().min(0).optional(),
  calcMethod: z.enum(["base_salary", "fixed", "percent_of_base", "percent_of_gross"]).optional(),
  isActive: z.boolean().optional(),
});

export const createComponentSchema = z.object({
  companyId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Code en MAJUSCULES, chiffres et _"),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["earning", "deduction", "employer_contribution"]),
  calcMethod: z.enum(["fixed", "percent_of_base", "percent_of_gross"]),
  rateValue: z.coerce.number().min(0).default(0),
});

export const transitionPayrollSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "pay", "cancel", "reopen", "calculate"]),
});

export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;
export type CreateComponentInput = z.infer<typeof createComponentSchema>;
export type TransitionPayrollInput = z.infer<typeof transitionPayrollSchema>;
