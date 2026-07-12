import { z } from "zod";

export const generateTransferSchema = z.object({
  payrollRunId: z.string().uuid("Cycle de paie requis"),
});

export const batchIdSchema = z.object({
  id: z.string().uuid(),
});

export type GenerateTransferInput = z.infer<typeof generateTransferSchema>;
