import { z } from "zod";

export const createCourseSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  title: z.string().trim().min(2, "Titre obligatoire").max(200),
  category: z.string().trim().min(1).max(80).default("Général"),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  durationHours: z.coerce.number().positive().max(500).default(2),
  status: z.enum(["draft", "active", "archived"]).default("active"),
});

export const updateCourseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(200).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  durationHours: z.coerce.number().positive().max(500).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export const enrollSchema = z.object({
  companyId: z.string().uuid(),
  courseId: z.string().uuid(),
  employeeId: z.string().uuid(),
});

export const updateEnrollmentSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["enrolled", "in_progress", "completed", "cancelled"]).optional(),
  progressPct: z.coerce.number().int().min(0).max(100).optional(),
  certificateIssued: z.boolean().optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type EnrollInput = z.infer<typeof enrollSchema>;
