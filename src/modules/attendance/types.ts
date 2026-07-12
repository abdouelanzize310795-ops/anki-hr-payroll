export type AttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "half_day"
  | "remote"
  | "on_leave";

export type AttendanceRecord = {
  id: string;
  company_id: string;
  employee_id: string;
  work_date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  worked_minutes: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AttendanceWithRelations = AttendanceRecord & {
  employee_name?: string | null;
  company_name?: string | null;
  job_title?: string | null;
};

export const attendanceStatusLabel: Record<AttendanceStatus, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
  half_day: "Demi-journée",
  remote: "Télétravail",
  on_leave: "En congé",
};

export function attendanceStatusToPill(status: AttendanceStatus): string {
  return attendanceStatusLabel[status];
}

/** Parse HH:MM or HH:MM:SS to minutes from midnight. */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = value.split(":").map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts[0]! * 60 + parts[1]!;
}

export function computeWorkedMinutes(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
): number | null {
  const a = timeToMinutes(checkIn);
  const b = timeToMinutes(checkOut);
  if (a == null || b == null || b < a) return null;
  return b - a;
}

export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || mins < 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}
