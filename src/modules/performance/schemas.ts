import { z } from "zod";

export const createReviewSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  employeeId: z.string().uuid("Employé requis"),
  periodLabel: z.string().trim().min(2).max(80).default("T3 2026"),
  score: z.coerce.number().min(1).max(5).default(3),
  goalsPct: z.coerce.number().int().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  reviewerName: z.string().trim().max(120).optional().or(z.literal("")),
  status: z.enum(["draft", "submitted", "finalized"]).default("finalized"),
});

export const updateReviewSchema = z.object({
  id: z.string().uuid(),
  score: z.coerce.number().min(1).max(5).optional(),
  goalsPct: z.coerce.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  reviewerName: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["draft", "submitted", "finalized"]).optional(),
  periodLabel: z.string().trim().min(2).max(80).optional(),
});
