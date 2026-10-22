export type SiteSettings = {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  city: string | null;
  is_headquarters: boolean;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
  max_accuracy_m: number;
  require_qr: boolean;
  qr_rotation_seconds: number;
  pinned_at: string | null;
};

export type WorkPolicy = {
  id: string;
  company_id: string;
  name: string;
  work_days: number[];
  start_time: string;
  end_time: string;
  grace_minutes: number;
  early_checkin_minutes: number;
  checkout_extension_minutes: number;
  is_default: boolean;
};

export type LiveBoardPerson = {
  employee_id: string;
  name: string;
  job_title: string | null;
  status: "present" | "late" | "absent" | "on_leave" | "not_yet" | string;
  check_in: string | null;
  check_out: string | null;
  late_minutes: number | null;
  missing_checkout: boolean | null;
  source: string | null;
  distance_m: number | null;
};

export type LiveBoard = {
  date: string;
  totals: {
    expected: number;
    present: number;
    late: number;
    absent: number;
    on_leave: number;
    not_yet: number;
    missing_checkout: number;
  };
  by_branch: {
    branch_id: string | null;
    branch_name: string;
    expected: number;
    present: number;
    late: number;
    absent: number;
    not_yet: number;
  }[];
  people: LiveBoardPerson[];
};

export type AttendanceCorrection = {
  id: string;
  employee_id: string;
  employee_name: string;
  work_date: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type EmployeeDevice = {
  id: string;
  employee_id: string;
  employee_name: string;
  device_id: string;
  platform: string | null;
  model: string | null;
  status: "pending" | "approved" | "revoked";
  registered_at: string;
  last_seen_at: string | null;
};

export type AttendanceRejection = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  branch_id: string | null;
  attempted_at: string;
  action: string | null;
  accuracy_m: number | null;
  distance_m: number | null;
  is_mock: boolean;
  reason_code: string;
  message: string;
};

export const REJECTION_LABEL: Record<string, string> = {
  too_far: "Trop loin du site",
  low_accuracy: "GPS imprécis",
  mock_location: "Fausse position",
  qr_invalid: "QR invalide / expiré",
  qr_other_company: "QR d’une autre entreprise",
  qr_required: "QR obligatoire",
  device_pending: "Téléphone non approuvé",
  device_revoked: "Téléphone retiré",
  not_working_day: "Jour non travaillé",
  outside_window: "Hors horaires",
  no_location: "Position absente",
};

export const WEEKDAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
