import { z } from "zod";

export const createCompanySchema = z.object({
  legalName: z.string().trim().min(2, "Raison sociale obligatoire").max(200),
  tradeName: z.string().trim().max(200).optional().or(z.literal("")),
  sector: z.string().trim().max(120).optional().or(z.literal("")),
  taxId: z.string().trim().max(80).optional().or(z.literal("")),
  registrationNumber: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail invalide").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  region: z.string().trim().max(120).optional().or(z.literal("")),
  countryCode: z.string().length(2).default("KM"),
  currencyCode: z.string().length(3).default("KMF"),
  bankName: z.string().trim().max(120).optional().or(z.literal("")),
  bankAccount: z.string().trim().max(80).optional().or(z.literal("")),
  bankRib: z.string().trim().max(80).optional().or(z.literal("")),
});

export const updateCompanySchema = createCompanySchema.extend({
  id: z.string().uuid(),
  payrollPeriodicity: z.enum(["monthly", "biweekly", "weekly"]).optional(),
  workDaysPerWeek: z.number().int().min(1).max(7).optional(),
  standardHoursPerDay: z.number().min(1).max(24).optional(),
  overtimeMultiplier: z.number().min(0).max(10).optional(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().url().optional().nullable().or(z.literal("")),
});

export const prepareLogoUploadSchema = z.object({
  companyId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
  fileSize: z.coerce.number().int().min(1).max(2 * 1024 * 1024),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
