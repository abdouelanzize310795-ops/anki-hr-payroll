import { z } from "zod";

export const prepareUploadSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  title: z.string().trim().min(2, "Titre obligatoire").max(200),
  category: z.enum(["contract", "payslip", "identity", "policy", "medical", "other"]),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(120).optional().or(z.literal("")),
  fileSize: z.coerce.number().int().min(0).max(10 * 1024 * 1024),
  employeeId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const documentIdSchema = z.object({
  id: z.string().uuid(),
});

export type PrepareUploadInput = z.infer<typeof prepareUploadSchema>;
