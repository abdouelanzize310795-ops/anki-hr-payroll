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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  profile: Profile | null;
};
