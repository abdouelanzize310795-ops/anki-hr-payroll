import { z } from "zod";

export const createAssetSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  name: z.string().trim().min(2, "Nom obligatoire").max(200),
  category: z.enum(["laptop", "phone", "monitor", "vehicle", "other"]).default("other"),
  serialNumber: z.string().trim().max(80).optional().or(z.literal("")),
  status: z.enum(["available", "assigned", "maintenance", "retired"]).default("available"),
  assignedEmployeeId: z.string().uuid().optional().nullable(),
  purchaseDate: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(200).optional(),
  category: z.enum(["laptop", "phone", "monitor", "vehicle", "other"]).optional(),
  serialNumber: z.string().trim().max(80).optional().nullable(),
  status: z.enum(["available", "assigned", "maintenance", "retired"]).optional(),
  assignedEmployeeId: z.string().uuid().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
