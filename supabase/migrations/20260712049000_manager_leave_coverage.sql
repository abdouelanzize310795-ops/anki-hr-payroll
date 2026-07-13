-- Manager leave coverage: acting manager for leave date range (auto by dates)

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS acting_manager_employee_id uuid
    REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.manager_leave_coverages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  manager_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  acting_manager_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_request_id uuid NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  acting_previous_role public.app_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT manager_leave_coverages_dates CHECK (end_date >= start_date),
  CONSTRAINT manager_leave_coverages_not_self CHECK (manager_employee_id <> acting_manager_employee_id)
);

CREATE INDEX IF NOT EXISTS manager_leave_coverages_dept_dates_idx
  ON public.manager_leave_coverages (department_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS manager_leave_coverages_leave_idx
  ON public.manager_leave_coverages (leave_request_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.manager_leave_coverages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manager_leave_coverages_select ON public.manager_leave_coverages;
CREATE POLICY manager_leave_coverages_select
  ON public.manager_leave_coverages FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid()
          AND e.deleted_at IS NULL
          AND e.id IN (manager_employee_id, acting_manager_employee_id)
      )
    )
  );

GRANT SELECT ON public.manager_leave_coverages TO authenticated;

CREATE OR REPLACE FUNCTION public.employee_is_department_manager(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.departments d
    WHERE d.manager_employee_id = p_employee_id
      AND d.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.effective_manager_employee_id(
  p_department_id uuid,
  p_on date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT c.acting_manager_employee_id
      FROM public.manager_leave_coverages c
      JOIN public.leave_requests lr ON lr.id = c.leave_request_id AND lr.deleted_at IS NULL
      WHERE c.department_id = p_department_id
        AND c.deleted_at IS NULL
        AND lr.status = 'approved'
        AND p_on BETWEEN c.start_date AND c.end_date
      ORDER BY c.created_at DESC
      LIMIT 1
    ),
    (
      SELECT d.manager_employee_id
      FROM public.departments d
      WHERE d.id = p_department_id AND d.deleted_at IS NULL
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_expired_manager_coverages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cov RECORD;
BEGIN
  FOR v_cov IN
    SELECT c.*
    FROM public.manager_leave_coverages c
    WHERE c.deleted_at IS NULL
      AND c.end_date < CURRENT_DATE
  LOOP
    IF v_cov.acting_previous_role IS NOT NULL THEN
      UPDATE public.profiles p
      SET role = v_cov.acting_previous_role, updated_at = now()
      FROM public.employees e
      WHERE e.id = v_cov.acting_manager_employee_id
        AND e.user_id = p.id
        AND p.role = 'manager'
        AND v_cov.acting_previous_role <> 'manager'
        AND NOT EXISTS (
          SELECT 1 FROM public.departments d
          WHERE d.manager_employee_id = e.id AND d.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.manager_leave_coverages c2
          JOIN public.leave_requests lr2 ON lr2.id = c2.leave_request_id
          WHERE c2.acting_manager_employee_id = v_cov.acting_manager_employee_id
            AND c2.id <> v_cov.id
            AND c2.deleted_at IS NULL
            AND lr2.status = 'approved'
            AND lr2.deleted_at IS NULL
            AND CURRENT_DATE BETWEEN c2.start_date AND c2.end_date
        );
    END IF;

    UPDATE public.manager_leave_coverages
    SET deleted_at = now(), updated_at = now()
    WHERE id = v_cov.id;
  END LOOP;

  -- Restore managers who finished leave
  UPDATE public.employees e
  SET status = 'active', updated_at = now()
  WHERE e.status = 'on_leave'
    AND e.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.employee_id = e.id
        AND lr.status = 'approved'
        AND lr.deleted_at IS NULL
        AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_manager_leave_coverage(p_leave_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req public.leave_requests;
  v_dept RECORD;
  v_acting public.employees;
  v_prev_role public.app_role;
BEGIN
  SELECT * INTO v_req FROM public.leave_requests WHERE id = p_leave_request_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_req.acting_manager_employee_id IS NULL THEN RETURN; END IF;
  IF NOT public.employee_is_department_manager(v_req.employee_id) THEN RETURN; END IF;

  SELECT * INTO v_acting
  FROM public.employees
  WHERE id = v_req.acting_manager_employee_id AND deleted_at IS NULL;

  IF NOT FOUND OR v_acting.company_id <> v_req.company_id THEN
    RAISE EXCEPTION 'Remplacant introuvable dans l entreprise';
  END IF;

  IF v_acting.id = v_req.employee_id THEN
    RAISE EXCEPTION 'Le manager ne peut pas se designer lui-meme comme remplacant';
  END IF;

  -- Soft-delete previous coverages for this leave
  UPDATE public.manager_leave_coverages
  SET deleted_at = now(), updated_at = now()
  WHERE leave_request_id = p_leave_request_id AND deleted_at IS NULL;

  FOR v_dept IN
    SELECT d.* FROM public.departments d
    WHERE d.manager_employee_id = v_req.employee_id
      AND d.company_id = v_req.company_id
      AND d.deleted_at IS NULL
  LOOP
    SELECT p.role INTO v_prev_role
    FROM public.profiles p
    WHERE p.id = v_acting.user_id AND p.deleted_at IS NULL;

    INSERT INTO public.manager_leave_coverages (
      company_id, department_id, manager_employee_id, acting_manager_employee_id,
      leave_request_id, start_date, end_date, acting_previous_role
    ) VALUES (
      v_req.company_id, v_dept.id, v_req.employee_id, v_req.acting_manager_employee_id,
      v_req.id, v_req.start_date, v_req.end_date, v_prev_role
    );

    IF v_acting.user_id IS NOT NULL AND v_prev_role = 'employee' THEN
      UPDATE public.profiles
      SET role = 'manager', company_id = v_req.company_id, updated_at = now()
      WHERE id = v_acting.user_id
        AND role = 'employee';
    END IF;
  END LOOP;

  IF v_acting.user_id IS NOT NULL THEN
    PERFORM public.notify_user(
      v_acting.user_id, v_req.company_id, 'leave',
      'Vous etes manager remplacant',
      'Du ' || v_req.start_date || ' au ' || v_req.end_date || ' vous validez les conges de l equipe.',
      '/leave'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_manager_leave_coverage(p_leave_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cov RECORD;
BEGIN
  FOR v_cov IN
    SELECT * FROM public.manager_leave_coverages
    WHERE leave_request_id = p_leave_request_id AND deleted_at IS NULL
  LOOP
    IF v_cov.acting_previous_role IS NOT NULL THEN
      UPDATE public.profiles p
      SET role = v_cov.acting_previous_role, updated_at = now()
      FROM public.employees e
      WHERE e.id = v_cov.acting_manager_employee_id
        AND e.user_id = p.id
        AND p.role = 'manager'
        AND v_cov.acting_previous_role <> 'manager'
        AND NOT EXISTS (
          SELECT 1 FROM public.departments d
          WHERE d.manager_employee_id = e.id AND d.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.manager_leave_coverages c2
          JOIN public.leave_requests lr2 ON lr2.id = c2.leave_request_id
          WHERE c2.acting_manager_employee_id = v_cov.acting_manager_employee_id
            AND c2.id <> v_cov.id
            AND c2.deleted_at IS NULL
            AND lr2.status = 'approved'
            AND lr2.deleted_at IS NULL
            AND CURRENT_DATE BETWEEN c2.start_date AND c2.end_date
        );
    END IF;

    UPDATE public.manager_leave_coverages
    SET deleted_at = now(), updated_at = now()
    WHERE id = v_cov.id;
  END LOOP;
END;
$$;

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
  PERFORM public.sync_expired_manager_coverages();

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
  PERFORM public.sync_expired_manager_coverages();

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

GRANT EXECUTE ON FUNCTION public.employee_is_department_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_manager_employee_id(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_expired_manager_coverages() TO authenticated;
