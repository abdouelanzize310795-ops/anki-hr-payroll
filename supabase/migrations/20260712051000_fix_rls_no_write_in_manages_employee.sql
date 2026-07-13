-- RLS helpers must stay read-only: sync_expired_manager_coverages() does UPDATEs
-- and fails with "cannot execute UPDATE in a read-only transaction" when called
-- from manages_employee / is_dept_manager_of_company during SELECT policies.
-- Coverage validity is already enforced by date filters in effective_manager_employee_id.
-- Cleanup/role restore stays in write RPCs (e.g. transition_leave_request).

CREATE OR REPLACE FUNCTION public.manages_employee(p_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dept_id uuid;
  v_eff uuid;
BEGIN
  SELECT e.department_id INTO v_dept_id
  FROM public.employees e
  WHERE e.id = p_employee_id AND e.deleted_at IS NULL;

  IF v_dept_id IS NULL THEN RETURN false; END IF;

  v_eff := public.effective_manager_employee_id(v_dept_id, CURRENT_DATE);
  IF v_eff IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.employees m
    WHERE m.id = v_eff AND m.deleted_at IS NULL AND m.user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_dept_manager_of_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.departments d
    JOIN public.employees m ON m.id = public.effective_manager_employee_id(d.id, CURRENT_DATE)
    WHERE d.company_id = p_company_id
      AND d.deleted_at IS NULL
      AND m.deleted_at IS NULL
      AND m.user_id = auth.uid()
  );
END;
$$;
