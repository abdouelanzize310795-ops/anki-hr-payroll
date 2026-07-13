import { z } from "zod";

export const provisionStaffAccountSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  email: z.string().trim().email("E-mail invalide").max(200),
  fullName: z.string().trim().min(2, "Nom obligatoire").max(120),
  role: z.enum(["hr", "manager"]).default("hr"),
});

export type ProvisionStaffAccountInput = z.infer<typeof provisionStaffAccountSchema>;
