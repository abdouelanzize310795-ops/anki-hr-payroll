/** Types returned by the mobile_* Postgres RPCs. */

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

export type MobileAttendanceDay = {
  id: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  worked_minutes: number | null;
  notes: string | null;
  work_date?: string;
};

export type MobileHome = {
  work_date: string;
  timezone: string;
  role?: string;
  is_manager?: boolean;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    job_title: string | null;
    employee_number: string | null;
    company_id: string;
  };
  today_attendance: MobileAttendanceDay | null;
  actions: {
    can_clock_in: boolean;
    can_clock_out: boolean;
  };
  counts: {
    pending_leaves: number;
    open_tasks: number;
    unread_notifications: number;
    team_headcount?: number;
    team_present_today?: number;
    team_pending_leaves?: number;
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

export type ClockAction = "in" | "out";

export type MobileClockResult = {
  id: string;
  company_id: string;
  employee_id: string;
  work_date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  worked_minutes: number | null;
  notes: string | null;
};

export type MobileLeave = {
  id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
  reason: string | null;
  created_at: string;
};

export type MobileTeamMemberAttendance = {
  employee_id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  attendance_id: string | null;
  status: string | null;
  check_in: string | null;
  check_out: string | null;
  worked_minutes: number | null;
};

export type MobileTeamPendingLeave = {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
  reason: string | null;
  created_at: string;
};

export type MobilePayslip = {
  id: string;
  payslip_number: string | null;
  net_amount: number;
  gross_amount: number;
  deduction_amount: number;
  currency_code: string;
  status: string;
  worked_hours: number | null;
  overtime_hours: number | null;
  created_at: string;
  period_label: string;
  period_year: number | null;
  period_month: number | null;
};

export type MobileNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export type MobileLeaveType = {
  id: string;
  code: string;
  name: string;
  color: string;
  is_paid: boolean;
  deducts_balance: boolean;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
};

export type MobilePayslipLine = {
  code: string;
  label: string;
  kind: "earning" | "deduction" | "employer_contribution";
  rate_applied: number;
  basis_amount: number;
  amount: number;
};

export type MobilePayslipDetail = {
  id: string;
  payslip_number: string | null;
  employee_name: string;
  employee_number: string | null;
  job_title: string | null;
  department_name: string | null;
  base_salary: number;
  gross_amount: number;
  deduction_amount: number;
  net_amount: number;
  employer_contribution_amount: number;
  currency_code: string;
  status: string;
  worked_hours: number | null;
  overtime_hours: number | null;
  expected_hours: number | null;
  period_label: string;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  company: {
    legal_name: string;
    trade_name: string | null;
    address_line1: string | null;
    city: string | null;
    tax_id: string | null;
  };
  lines: MobilePayslipLine[];
};

export type MobileCompensation = {
  base_salary: number;
  currency_code: string;
  hire_date: string;
  job_title: string | null;
  employee_number: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_rib: string | null;
  contract: {
    contract_number: string | null;
    contract_type: string;
    status: string;
    start_date: string;
    end_date: string | null;
    trial_end_date: string | null;
    hours_per_week: number;
    work_days_per_week: number;
    benefits: string | null;
  } | null;
  year_to_date: { gross: number; net: number; count: number };
};

export type MobileDocument = {
  id: string;
  title: string;
  category: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  created_at: string;
  url: string | null;
};

export type MobileSecureClockResult = {
  ok: boolean;
  code?: string;
  message: string;
  action?: "in" | "out";
  time?: string;
  status?: string;
  late_minutes?: number;
  early_departure_minutes?: number;
  worked_minutes?: number | null;
  branch_name?: string | null;
  distance_m?: number | null;
};

export type MobileSchedule = {
  work_date: string;
  is_working_day: boolean;
  holiday_name: string | null;
  policy_name: string | null;
  start_time: string | null;
  end_time: string | null;
  grace_minutes: number | null;
  checkin_opens: string | null;
  requires_qr: boolean;
  geofence_enabled: boolean;
};

export type MobileCorrection = {
  id: string;
  work_date: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  review_note: string | null;
  created_at: string;
};
