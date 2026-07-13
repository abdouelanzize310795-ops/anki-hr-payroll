-- Helpers + leave workflow manager -> HR + department manager assignment

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_company_id uuid,
  p_kind text,
  p_title text,
  p_body text DEFAULT NULL,
  p_href text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.app_notifications (user_id, company_id, kind, title, body, href)
  VALUES (p_user_id, p_company_id, COALESCE(p_kind, 'leave'), p_title, p_body, p_href);
END;
$$;

CREATE OR REPLACE FUNCTION public.manages_employee(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id AND d.deleted_at IS NULL
    JOIN public.employees m ON m.id = d.manager_employee_id AND m.deleted_at IS NULL
    WHERE e.id = p_employee_id
      AND e.deleted_at IS NULL
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_dept_manager_of_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.departments d
    JOIN public.employees m ON m.id = d.manager_employee_id AND m.deleted_at IS NULL
    WHERE d.company_id = p_company_id
      AND d.deleted_at IS NULL
      AND m.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.notify_user(uuid, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manages_employee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dept_manager_of_company(uuid) TO authenticated;

-- Tighten employee visibility for managers to their department(s)
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
      OR public.manages_employee(id)
    )
  );

CREATE OR REPLACE FUNCTION public.create_department(
  p_company_id uuid,
  p_name text,
  p_code text DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_manager_employee_id uuid DEFAULT NULL
)
RETURNS departments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dept public.departments;
  v_mgr public.employees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;
  IF NOT public.can_manage_company(p_company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour creer un departement';
  END IF;
  IF length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Nom de departement obligatoire';
  END IF;

  IF p_manager_employee_id IS NOT NULL THEN
    SELECT * INTO v_mgr FROM public.employees
    WHERE id = p_manager_employee_id AND company_id = p_company_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Manager introuvable dans cette entreprise';
    END IF;
  END IF;

  INSERT INTO public.departments (company_id, branch_id, name, code, manager_employee_id)
  VALUES (
    p_company_id,
    p_branch_id,
    trim(p_name),
    nullif(trim(p_code), ''),
    p_manager_employee_id
  )
  RETURNING * INTO v_dept;

  IF p_manager_employee_id IS NOT NULL AND v_mgr.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'manager', company_id = p_company_id, updated_at = now()
    WHERE id = v_mgr.user_id
      AND role NOT IN ('employer', 'hr', 'platform_admin');
  END IF;

  RETURN v_dept;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_department_manager(
  p_department_id uuid,
  p_manager_employee_id uuid
)
RETURNS departments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dept public.departments;
  v_mgr public.employees;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;

  SELECT * INTO v_dept FROM public.departments
  WHERE id = p_department_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Departement introuvable'; END IF;

  IF NOT (public.can_manage_company(v_dept.company_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Droit insuffisant';
  END IF;

  IF p_manager_employee_id IS NULL THEN
    UPDATE public.departments SET manager_employee_id = NULL, updated_at = now()
    WHERE id = p_department_id RETURNING * INTO v_dept;
    RETURN v_dept;
  END IF;

  SELECT * INTO v_mgr FROM public.employees
  WHERE id = p_manager_employee_id
    AND company_id = v_dept.company_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manager introuvable dans cette entreprise'; END IF;

  UPDATE public.departments
  SET manager_employee_id = p_manager_employee_id, updated_at = now()
  WHERE id = p_department_id
  RETURNING * INTO v_dept;

  -- Assign manager to the department if not already
  UPDATE public.employees
  SET department_id = v_dept.id, updated_at = now()
  WHERE id = p_manager_employee_id
    AND (department_id IS DISTINCT FROM v_dept.id);

  IF v_mgr.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'manager', company_id = v_dept.company_id, updated_at = now()
    WHERE id = v_mgr.user_id
      AND role NOT IN ('employer', 'hr', 'platform_admin');
  END IF;

  RETURN v_dept;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_department(uuid, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_department_manager(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_leave_request(
  p_request_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req public.leave_requests;
  v_type public.leave_types;
  v_balance public.leave_balances;
  v_year int;
  v_available numeric(6,2);
  v_can_hr boolean;
  v_is_owner boolean;
  v_is_mgr boolean;
  v_has_mgr boolean;
  v_emp public.employees;
  v_owner_user uuid;
  v_status text;
  v_hr RECORD;
BEGIN
  SELECT * INTO v_req
  FROM public.leave_requests
  WHERE id = p_request_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;

  v_can_hr := public.can_manage_company(v_req.company_id) OR public.is_platform_admin();
  v_is_owner := EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_req.employee_id AND e.user_id = auth.uid()
  );
  v_is_mgr := public.manages_employee(v_req.employee_id);

  SELECT * INTO v_emp FROM public.employees WHERE id = v_req.employee_id AND deleted_at IS NULL;
  v_owner_user := v_emp.user_id;

  SELECT * INTO v_type FROM public.leave_types WHERE id = v_req.leave_type_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Type de conge introuvable'; END IF;

  v_year := EXTRACT(YEAR FROM v_req.start_date)::int;
  v_status := v_req.status::text;

  -- Normalize legacy pending -> pending_manager for workflow
  IF v_status = 'pending' THEN
    v_status := 'pending_manager';
  END IF;

  IF p_action = 'submit' THEN
    IF v_req.status::text <> 'draft' THEN
      RAISE EXCEPTION 'Seule une demande brouillon peut etre soumise';
    END IF;
    IF NOT (v_can_hr OR v_is_owner) THEN RAISE EXCEPTION 'Acces refuse'; END IF;

    IF v_type.deducts_balance THEN
      v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
      v_available := v_balance.entitled_days + v_balance.carried_over_days - v_balance.used_days - v_balance.pending_days;
      IF v_req.days_count > v_available THEN
        RAISE EXCEPTION 'Solde insuffisant (% jours disponibles)', v_available;
      END IF;
      UPDATE public.leave_balances
      SET pending_days = pending_days + v_req.days_count
      WHERE id = v_balance.id;
    END IF;

    v_has_mgr := EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.id = v_emp.department_id
        AND d.deleted_at IS NULL
        AND d.manager_employee_id IS NOT NULL
    );

    IF v_has_mgr THEN
      UPDATE public.leave_requests
      SET status = 'pending_manager',
          review_note = NULL, reviewed_at = NULL, reviewed_by = NULL,
          manager_note = NULL, manager_reviewed_at = NULL, manager_reviewed_by = NULL
      WHERE id = v_req.id RETURNING * INTO v_req;

      -- Notify department manager
      FOR v_hr IN
        SELECT m.user_id AS id
        FROM public.departments d
        JOIN public.employees m ON m.id = d.manager_employee_id
        WHERE d.id = v_emp.department_id AND m.user_id IS NOT NULL
      LOOP
        PERFORM public.notify_user(
          v_hr.id, v_req.company_id, 'leave',
          'Demande de conge a valider',
          trim(v_emp.first_name || ' ' || v_emp.last_name) || ' : ' || v_req.start_date || ' -> ' || v_req.end_date,
          '/leave'
        );
      END LOOP;
    ELSE
      -- No manager configured: escalate to HR
      UPDATE public.leave_requests
      SET status = 'pending_hr',
          review_note = NULL, reviewed_at = NULL, reviewed_by = NULL
      WHERE id = v_req.id RETURNING * INTO v_req;

      FOR v_hr IN
        SELECT id FROM public.profiles
        WHERE company_id = v_req.company_id
          AND role IN ('employer', 'hr')
          AND deleted_at IS NULL
          AND is_active = true
      LOOP
        PERFORM public.notify_user(
          v_hr.id, v_req.company_id, 'leave',
          'Demande de conge a valider (RH)',
          trim(v_emp.first_name || ' ' || v_emp.last_name) || ' : ' || v_req.start_date || ' -> ' || v_req.end_date,
          '/leave'
        );
      END LOOP;
    END IF;

  ELSIF p_action = 'approve' THEN
    IF v_status = 'pending_manager' THEN
      IF NOT (v_is_mgr OR v_can_hr) THEN RAISE EXCEPTION 'Acces refuse'; END IF;

      UPDATE public.leave_requests
      SET status = 'pending_hr',
          manager_reviewed_by = auth.uid(),
          manager_reviewed_at = now(),
          manager_note = NULLIF(trim(COALESCE(p_note, '')), '')
      WHERE id = v_req.id
      RETURNING * INTO v_req;

      -- Notify RH / employer
      FOR v_hr IN
        SELECT id FROM public.profiles
        WHERE company_id = v_req.company_id
          AND role IN ('employer', 'hr')
          AND deleted_at IS NULL
          AND is_active = true
      LOOP
        PERFORM public.notify_user(
          v_hr.id, v_req.company_id, 'leave',
          'Congé validé manager — validation RH requise',
          trim(v_emp.first_name || ' ' || v_emp.last_name) || ' : ' || v_req.start_date || ' -> ' || v_req.end_date,
          '/leave'
        );
      END LOOP;

      -- Inform employee that manager approved, waiting HR (optional soft notice)
      PERFORM public.notify_user(
        v_owner_user, v_req.company_id, 'leave',
        'Votre demande est en validation RH',
        'Le manager a approuvé. En attente de la validation RH.',
        '/leave'
      );

    ELSIF v_status = 'pending_hr' THEN
      IF NOT v_can_hr THEN RAISE EXCEPTION 'Seul RH/employeur peut valider définitivement'; END IF;

      IF v_type.deducts_balance THEN
        v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
        UPDATE public.leave_balances
        SET pending_days = GREATEST(0, pending_days - v_req.days_count),
            used_days = used_days + v_req.days_count
        WHERE id = v_balance.id;
      END IF;

      UPDATE public.leave_requests
      SET status = 'approved',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          review_note = NULLIF(trim(COALESCE(p_note, '')), '')
      WHERE id = v_req.id
      RETURNING * INTO v_req;

      IF CURRENT_DATE BETWEEN v_req.start_date AND v_req.end_date THEN
        UPDATE public.employees
        SET status = 'on_leave'
        WHERE id = v_req.employee_id AND deleted_at IS NULL AND status = 'active';
      END IF;

      PERFORM public.notify_user(
        v_owner_user, v_req.company_id, 'leave',
        'Congé approuvé',
        'Votre demande du ' || v_req.start_date || ' au ' || v_req.end_date || ' a été approuvée.',
        '/leave'
      );
    ELSE
      RAISE EXCEPTION 'Cette demande ne peut pas etre approuvee dans son etat actuel';
    END IF;

  ELSIF p_action = 'reject' THEN
    IF v_status = 'pending_manager' THEN
      IF NOT (v_is_mgr OR v_can_hr) THEN RAISE EXCEPTION 'Acces refuse'; END IF;

      IF v_type.deducts_balance THEN
        v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
        UPDATE public.leave_balances
        SET pending_days = GREATEST(0, pending_days - v_req.days_count)
        WHERE id = v_balance.id;
      END IF;

      UPDATE public.leave_requests
      SET status = 'rejected',
          manager_reviewed_by = auth.uid(),
          manager_reviewed_at = now(),
          manager_note = NULLIF(trim(COALESCE(p_note, '')), ''),
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          review_note = NULLIF(trim(COALESCE(p_note, '')), '')
      WHERE id = v_req.id
      RETURNING * INTO v_req;

      -- Immediate employee notification on manager reject
      PERFORM public.notify_user(
        v_owner_user, v_req.company_id, 'leave',
        'Congé refusé',
        COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'Votre demande de congé a été refusée par le manager.'),
        '/leave'
      );

    ELSIF v_status = 'pending_hr' THEN
      IF NOT v_can_hr THEN RAISE EXCEPTION 'Acces refuse'; END IF;

      IF v_type.deducts_balance THEN
        v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
        UPDATE public.leave_balances
        SET pending_days = GREATEST(0, pending_days - v_req.days_count)
        WHERE id = v_balance.id;
      END IF;

      UPDATE public.leave_requests
      SET status = 'rejected',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          review_note = NULLIF(trim(COALESCE(p_note, '')), '')
      WHERE id = v_req.id
      RETURNING * INTO v_req;

      PERFORM public.notify_user(
        v_owner_user, v_req.company_id, 'leave',
        'Congé refusé',
        COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'Votre demande de congé a été refusée par les RH.'),
        '/leave'
      );
    ELSE
      RAISE EXCEPTION 'Cette demande ne peut pas etre refusee dans son etat actuel';
    END IF;

  ELSIF p_action = 'cancel' THEN
    IF NOT (
      v_can_hr
      OR (v_is_owner AND v_req.status::text IN ('draft', 'pending', 'pending_manager', 'pending_hr'))
    ) THEN
      RAISE EXCEPTION 'Acces refuse';
    END IF;
    IF v_req.status::text IN ('cancelled', 'rejected') THEN
      RAISE EXCEPTION 'Demande deja cloturee';
    END IF;

    IF v_req.status::text IN ('pending', 'pending_manager', 'pending_hr') AND v_type.deducts_balance THEN
      v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
      UPDATE public.leave_balances
      SET pending_days = GREATEST(0, pending_days - v_req.days_count)
      WHERE id = v_balance.id;
    ELSIF v_req.status::text = 'approved' AND v_type.deducts_balance THEN
      IF NOT v_can_hr THEN RAISE EXCEPTION 'Seul RH peut annuler un conge approuve'; END IF;
      v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
      UPDATE public.leave_balances
      SET used_days = GREATEST(0, used_days - v_req.days_count)
      WHERE id = v_balance.id;
    END IF;

    UPDATE public.leave_requests
    SET status = 'cancelled',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = NULLIF(trim(COALESCE(p_note, '')), '')
    WHERE id = v_req.id
    RETURNING * INTO v_req;

  ELSE
    RAISE EXCEPTION 'Action invalide: %', p_action;
  END IF;

  RETURN v_req;
END;
$$;

-- Migrate existing pending leaves to pending_manager
UPDATE public.leave_requests
SET status = 'pending_manager'
WHERE status::text = 'pending' AND deleted_at IS NULL;
