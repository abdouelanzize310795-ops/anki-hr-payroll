import { z } from "zod";

export const employeeStatusSchema = z.enum([
  "active",
  "onboarding",
  "on_leave",
  "suspended",
  "terminated",
]);

export const createEmployeeSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  branchId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  firstName: z.string().trim().min(1, "Prénom obligatoire").max(100),
  lastName: z.string().trim().min(1, "Nom obligatoire").max(100),
  email: z.string().trim().email("E-mail invalide").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
  hireDate: z.string().min(1, "Date d’embauche obligatoire"),
  status: employeeStatusSchema.default("active"),
  baseSalary: z.coerce.number().min(0, "Salaire invalide").default(0),
  currencyCode: z.string().length(3).default("KMF"),
  bankName: z.string().trim().max(120).optional().or(z.literal("")),
  bankAccount: z.string().trim().max(80).optional().or(z.literal("")),
  bankRib: z.string().trim().max(80).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  region: z.string().trim().max(120).optional().or(z.literal("")),
  nationalId: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateEmployeeSchema = createEmployeeSchema.extend({
  id: z.string().uuid(),
});

export const createDepartmentSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(2, "Nom obligatoire").max(120),
  code: z.string().trim().max(40).optional().or(z.literal("")),
  branchId: z.string().uuid().optional().nullable(),
  managerEmployeeId: z.string().uuid().optional().nullable(),
});

export const setDepartmentManagerSchema = z.object({
  departmentId: z.string().uuid(),
  managerEmployeeId: z.string().uuid().nullable(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type SetDepartmentManagerInput = z.infer<typeof setDepartmentManagerSchema>;
