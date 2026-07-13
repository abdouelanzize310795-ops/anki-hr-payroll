export type LeaveRequestStatus =
  | "draft"
  | "pending"
  | "pending_manager"
  | "pending_hr"
  | "approved"
  | "rejected"
  | "cancelled";

export type LeaveType = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  is_paid: boolean;
  requires_approval: boolean;
  deducts_balance: boolean;
  default_entitlement_days: number;
  color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LeaveBalance = {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  carried_over_days: number;
  created_at: string;
  updated_at: string;
};

export type LeaveBalanceWithType = LeaveBalance & {
  leave_type_name?: string | null;
  leave_type_code?: string | null;
  leave_type_color?: string | null;
  available_days?: number;
};

export type MedicalLeaveStatus = "pending" | "justified" | "rejected";

export type LeaveRequest = {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  attachment_url: string | null;
  medical_status: MedicalLeaveStatus | null;
  status: LeaveRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  manager_reviewed_by: string | null;
  manager_reviewed_at: string | null;
  manager_note: string | null;
  acting_manager_employee_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LeaveRequestWithRelations = LeaveRequest & {
  employee_name?: string | null;
  company_name?: string | null;
  leave_type_name?: string | null;
  leave_type_code?: string | null;
  leave_type_color?: string | null;
  acting_manager_name?: string | null;
};

export const leaveStatusLabel: Record<LeaveRequestStatus, string> = {
  draft: "Brouillon",
  pending: "En attente manager",
  pending_manager: "En attente manager",
  pending_hr: "En attente RH",
  approved: "Approuvé",
  rejected: "Refusé",
  cancelled: "Annulé",
};

export function leaveStatusToPill(status: LeaveRequestStatus): string {
  return leaveStatusLabel[status];
}

/** Business days (Mon–Fri) inclusive. */
export function countBusinessDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
