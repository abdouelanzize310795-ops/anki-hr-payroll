/**
 * Contract for the employee mobile app APIs (Supabase RPCs).
 * Implementation: supabase/migrations/20260713150000_mobile_employee_api.sql
 * Client: apps/employee-mobile/src/lib/api/mobile.ts
 */

export type MobileMe = {
  user_id: string;
  is_manager?: boolean;
  profile: {
    email: string;
    full_name: string | null;
    role: string;
    phone: string | null;
    avatar_url: string | null;
    locale: string;
    must_change_password: boolean;
  };
  employee: {
    id: string;
    company_id: string;
    employee_number: string | null;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    job_title: string | null;
    hire_date: string;
    status: string;
    department_id: string | null;
    department_name: string | null;
    branch_id: string | null;
    branch_name: string | null;
    address_line1: string | null;
    city: string | null;
    region: string | null;
  };
  company: {
    id: string;
    legal_name: string;
    trade_name: string | null;
    standard_hours_per_day: number;
    is_active: boolean;
    approval_status: string;
    subscription_status: string;
    subscription_ends_at: string | null;
  } | null;
};

export type MobileHome = {
  work_date: string;
  timezone: string;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    job_title: string | null;
    employee_number: string | null;
    company_id: string;
  };
  today_attendance: {
    id: string;
    status: string;
    check_in: string | null;
    check_out: string | null;
    worked_minutes: number | null;
    notes: string | null;
  } | null;
  actions: {
    can_clock_in: boolean;
    can_clock_out: boolean;
  };
  counts: {
    pending_leaves: number;
    open_tasks: number;
    unread_notifications: number;
  };
  latest_payslip: {
    id: string;
    payslip_number: string | null;
    net_amount: number;
    currency_code: string;
    period_label: string;
    status: string;
  } | null;
};

/** RPC names exposed to the mobile client (authenticated only). */
export const MOBILE_RPC = {
  getMe: "mobile_get_me",
  getHome: "mobile_get_home",
  clock: "mobile_clock",
  listAttendance: "mobile_list_attendance",
  listLeaves: "mobile_list_leaves",
  listLeaveBalances: "mobile_list_leave_balances",
  listPayslips: "mobile_list_payslips",
  listNotifications: "mobile_list_notifications",
  markNotificationRead: "mobile_mark_notification_read",
  listTeamAttendance: "mobile_list_team_attendance",
  listTeamPendingLeaves: "mobile_list_team_pending_leaves",
  reviewLeave: "mobile_review_leave",
} as const;
