-- Allow a grace period up to a full day (e.g. "open 24/7" policies with no lateness).
ALTER TABLE public.work_policies DROP CONSTRAINT IF EXISTS work_policies_grace_minutes_check;
ALTER TABLE public.work_policies ADD CONSTRAINT work_policies_grace_minutes_check CHECK (grace_minutes BETWEEN 0 AND 1440);
