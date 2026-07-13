-- Department managers + two-step leave approval + persisted notifications

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS manager_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS departments_manager_employee_id_idx
  ON public.departments (manager_employee_id)
  WHERE deleted_at IS NULL AND manager_employee_id IS NOT NULL;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS manager_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS manager_note text;

DO $$ BEGIN
  ALTER TYPE public.leave_request_status ADD VALUE IF NOT EXISTS 'pending_manager';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.leave_request_status ADD VALUE IF NOT EXISTS 'pending_hr';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'leave',
  title text NOT NULL,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_notifications_user_created_idx
  ON public.app_notifications (user_id, created_at DESC);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_notifications_select_own ON public.app_notifications;
CREATE POLICY app_notifications_select_own
  ON public.app_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS app_notifications_update_own ON public.app_notifications;
CREATE POLICY app_notifications_update_own
  ON public.app_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON public.app_notifications TO authenticated;
