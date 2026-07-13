-- Employees must not see company-wide attendance via belongs_to_company.
-- Own records only; managers see team via manages_employee; HR/employer via can_manage.

DROP POLICY IF EXISTS attendance_select ON public.attendance_records;
CREATE POLICY attendance_select
  ON public.attendance_records
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR public.manages_employee(employee_id)
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND e.user_id = auth.uid()
          AND e.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS attendance_update ON public.attendance_records;
CREATE POLICY attendance_update
  ON public.attendance_records
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND e.user_id = auth.uid()
          AND e.deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    public.can_manage_company(company_id)
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_records.employee_id
        AND e.user_id = auth.uid()
        AND e.deleted_at IS NULL
    )
  );
