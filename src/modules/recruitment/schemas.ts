import { z } from "zod";

export const createJobOpeningSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  title: z.string().trim().min(2, "Titre obligatoire").max(200),
  departmentId: z.string().uuid().optional().nullable(),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  employmentType: z.string().trim().min(1).max(40).default("CDI"),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  status: z.enum(["draft", "open", "on_hold", "closed", "filled"]).default("open"),
  openingsCount: z.coerce.number().int().min(1).max(50).default(1),
  salaryMin: z.coerce.number().nonnegative().optional().nullable(),
  salaryMax: z.coerce.number().nonnegative().optional().nullable(),
});

export const updateJobOpeningSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(200).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  employmentType: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(["draft", "open", "on_hold", "closed", "filled"]).optional(),
  openingsCount: z.coerce.number().int().min(1).max(50).optional(),
  salaryMin: z.coerce.number().nonnegative().optional().nullable(),
  salaryMax: z.coerce.number().nonnegative().optional().nullable(),
});

export const createCandidateSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  jobOpeningId: z.string().uuid("Offre requise"),
  firstName: z.string().trim().min(1, "Prénom obligatoire").max(80),
  lastName: z.string().trim().min(1, "Nom obligatoire").max(80),
  email: z.string().trim().email("Email invalide").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  stage: z
    .enum(["sourced", "screened", "interview", "offer", "hired", "rejected"])
    .default("sourced"),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  expectedSalary: z.coerce.number().nonnegative().optional().nullable(),
});

export const moveCandidateSchema = z.object({
  id: z.string().uuid(),
  stage: z.enum(["sourced", "screened", "interview", "offer", "hired", "rejected"]),
});

export type CreateJobOpeningInput = z.infer<typeof createJobOpeningSchema>;
export type UpdateJobOpeningInput = z.infer<typeof updateJobOpeningSchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
