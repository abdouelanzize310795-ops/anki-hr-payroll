-- Harden RLS so employees only see their own HR data,
-- not company-wide confidential records.

DROP POLICY IF EXISTS employees_select ON public.employees;
CREATE POLICY employees_select
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR user_id = auth.uid()
      OR (
        public.current_company_id() = company_id
        AND public.current_user_role() = 'manager'
      )
    )
  );

DROP POLICY IF EXISTS payroll_runs_select ON public.payroll_runs;
CREATE POLICY payroll_runs_select
  ON public.payroll_runs
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR (
        public.current_company_id() = company_id
        AND public.current_user_role() = 'manager'
      )
      -- Employee may see the run metadata of their own payslip only via getPayslip
      OR EXISTS (
        SELECT 1
        FROM public.payslips ps
        JOIN public.employees e ON e.id = ps.employee_id
        WHERE ps.payroll_run_id = payroll_runs.id
          AND e.user_id = auth.uid()
          AND ps.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS payslips_select ON public.payslips;
CREATE POLICY payslips_select
  ON public.payslips
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = payslips.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS hr_documents_select ON public.hr_documents;
CREATE POLICY hr_documents_select
  ON public.hr_documents
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = hr_documents.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select
  ON public.contracts
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR (
        public.current_company_id() = company_id
        AND public.current_user_role() = 'manager'
      )
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = contracts.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );
