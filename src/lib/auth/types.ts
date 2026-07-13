export type AppRole =
  | "platform_admin"
  | "employer"
  | "hr"
  | "manager"
  | "employee";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  company_id: string | null;
  phone: string | null;
  avatar_url: string | null;
  locale: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CompanyAccess = {
  id: string;
  legal_name: string;
  is_active: boolean;
  approval_status: "pending_payment" | "pending_approval" | "approved" | "rejected";
  subscription_status: "none" | "pending" | "active" | "cancelled" | "expired";
  subscription_plan: string | null;
  subscription_paid_at: string | null;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  payment_reference: string | null;
  payment_method: string | null;
  rejection_reason: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  profile: Profile | null;
  company: CompanyAccess | null;
};
