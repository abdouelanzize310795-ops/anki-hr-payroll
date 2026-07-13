import { z } from "zod";

export const createLeaveRequestSchema = z
  .object({
    companyId: z.string().uuid("Entreprise requise"),
    employeeId: z.string().uuid("Employé requis"),
    leaveTypeId: z.string().uuid("Type de congé requis"),
    startDate: z.string().min(1, "Date de début obligatoire"),
    endDate: z.string().min(1, "Date de fin obligatoire"),
    reason: z.string().trim().max(2000).optional().or(z.literal("")),
    attachmentUrl: z.string().trim().max(2000).optional().or(z.literal("")),
    isMedical: z.boolean().optional(),
    actingManagerEmployeeId: z.string().uuid().optional().nullable(),
    submitNow: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La date de fin doit être postérieure ou égale au début",
        path: ["endDate"],
      });
    }
  });

export const transitionLeaveSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["submit", "approve", "reject", "cancel"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const reviewMedicalLeaveSchema = z.object({
  id: z.string().uuid(),
  medicalStatus: z.enum(["justified", "rejected"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type TransitionLeaveInput = z.infer<typeof transitionLeaveSchema>;
export type ReviewMedicalLeaveInput = z.infer<typeof reviewMedicalLeaveSchema>;
