-- Force password change on first login for provisioned accounts
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'When true, user must set a new password before using the app (provisioned accounts).';

-- Note: provision_employee_account / provision_staff_account set must_change_password = true
-- when creating a new auth user with a temporary password (applied on remote).
