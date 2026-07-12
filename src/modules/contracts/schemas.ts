import { z } from "zod";

export const contractTypeSchema = z.enum(["cdi", "cdd", "essai", "stage", "consultant"]);

const contractFieldsSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  employeeId: z.string().uuid("Employé requis"),
  contractType: contractTypeSchema.default("cdi"),
  jobTitle: z.string().trim().min(2, "Intitulé du poste obligatoire").max(120),
  departmentId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  startDate: z.string().min(1, "Date de début obligatoire"),
  endDate: z.string().optional().or(z.literal("")),
  trialEndDate: z.string().optional().or(z.literal("")),
  baseSalary: z.coerce.number().min(0, "Salaire invalide"),
  currencyCode: z.string().length(3).default("KMF"),
  workDaysPerWeek: z.coerce.number().int().min(1).max(7).default(5),
  hoursPerWeek: z.coerce.number().min(1).max(84).default(40),
  benefits: z.string().trim().max(4000).optional().or(z.literal("")),
  clauses: z.string().trim().max(8000).optional().or(z.literal("")),
  signedByEmployerName: z.string().trim().max(120).optional().or(z.literal("")),
});

function refineContractDates(
  val: { contractType: string; endDate?: string },
  ctx: z.RefinementCtx,
) {
  if ((val.contractType === "cdd" || val.contractType === "stage") && !val.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Une date de fin est obligatoire pour un CDD ou un stage",
      path: ["endDate"],
    });
  }
}

export const createContractSchema = contractFieldsSchema.superRefine(refineContractDates);

export const updateContractSchema = contractFieldsSchema
  .extend({ id: z.string().uuid() })
  .superRefine(refineContractDates);

export const transitionContractSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["send", "sign", "activate", "cancel"]),
  signerName: z.string().trim().max(120).optional().or(z.literal("")),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type TransitionContractInput = z.infer<typeof transitionContractSchema>;
