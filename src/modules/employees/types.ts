export type EmployeeStatus =
  | "active"
  | "onboarding"
  | "on_leave"
  | "suspended"
  | "terminated";

export type Gender = "female" | "male" | "other" | "undisclosed";

export type Employee = {
  id: string;
  company_id: string;
  branch_id: string | null;
  department_id: string | null;
  user_id: string | null;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: Gender;
  national_id: string | null;
  job_title: string | null;
  hire_date: string;
  termination_date: string | null;
  status: EmployeeStatus;
  base_salary: number;
  currency_code: string;
  bank_name: string | null;
  bank_account: string | null;
  bank_rib: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EmployeeWithRelations = Employee & {
  department_name?: string | null;
  branch_name?: string | null;
  company_name?: string | null;
};

export const employeeStatusLabel: Record<EmployeeStatus, string> = {
  active: "Actif",
  onboarding: "Onboarding",
  on_leave: "En congé",
  suspended: "Suspendu",
  terminated: "Sorti",
};
