-- One attendance row per employee and day (soft-deleted rows included), so that
-- upsert(onConflict: "employee_id,work_date") from the HR screen works.
DROP INDEX IF EXISTS public.attendance_records_emp_day_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_emp_day_key
  ON public.attendance_records (employee_id, work_date);
