import { z } from "zod";

export const attendanceStatusSchema = z.enum([
  "present",
  "absent",
  "late",
  "half_day",
  "remote",
  "on_leave",
]);

export const upsertAttendanceSchema = z.object({
  companyId: z.string().uuid("Entreprise requise"),
  employeeId: z.string().uuid("Employé requis"),
  workDate: z.string().min(1, "Date obligatoire"),
  status: attendanceStatusSchema.default("present"),
  checkIn: z.string().optional().or(z.literal("")),
  checkOut: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const clockActionSchema = z.object({
  companyId: z.string().uuid(),
  employeeId: z.string().uuid(),
  action: z.enum(["in", "out"]),
  at: z.string().optional(),
});

export type UpsertAttendanceInput = z.infer<typeof upsertAttendanceSchema>;
export type ClockActionInput = z.infer<typeof clockActionSchema>;
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;
