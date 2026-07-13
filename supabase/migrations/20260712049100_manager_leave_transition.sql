-- Update leave workflow: manager leave requires acting manager; coverage on RH approve

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
  v_is_dept_mgr boolean;
  v_emp public.employees;
  v_acting public.employees;
  v_owner_user uuid;
  v_status text;
  v_hr RECORD;
  v_eff_mgr uuid;
  v_eff_user uuid;
BEGIN
  PERFORM public.sync_expired_manager_coverages();

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
  v_is_dept_mgr := public.employee_is_department_manager(v_emp.id);

  SELECT * INTO v_type FROM public.leave_types WHERE id = v_req.leave_type_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Type de conge introuvable'; END IF;

  v_year := EXTRACT(YEAR FROM v_req.start_date)::int;
  v_status := v_req.status::text;
  IF v_status = 'pending' THEN v_status := 'pending_manager'; END IF;

  IF p_action = 'submit' THEN
    IF v_req.status::text <> 'draft' THEN
      RAISE EXCEPTION 'Seule une demande brouillon peut etre soumise';
    END IF;
    IF NOT (v_can_hr OR v_is_owner) THEN RAISE EXCEPTION 'Acces refuse'; END IF;

    IF v_is_dept_mgr THEN
      IF v_req.acting_manager_employee_id IS NULL THEN
        RAISE EXCEPTION 'En tant que manager, designez un remplacant pour la duree du conge';
      END IF;
      SELECT * INTO v_acting FROM public.employees
      WHERE id = v_req.acting_manager_employee_id
        AND company_id = v_req.company_id
        AND deleted_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'Remplacant introuvable'; END IF;
      IF v_acting.id = v_emp.id THEN
        RAISE EXCEPTION 'Choisissez un autre collaborateur comme remplacant';
      END IF;
    END IF;

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

    -- Manager leave → RH directly (cannot self-approve)
    IF v_is_dept_mgr THEN
      UPDATE public.leave_requests
      SET status = 'pending_hr',
          review_note = NULL, reviewed_at = NULL, reviewed_by = NULL
      WHERE id = v_req.id RETURNING * INTO v_req;

      FOR v_hr IN
        SELECT id FROM public.profiles
        WHERE company_id = v_req.company_id
          AND role IN ('employer', 'hr')
          AND deleted_at IS NULL AND is_active = true
      LOOP
        PERFORM public.notify_user(
          v_hr.id, v_req.company_id, 'leave',
          'Congé manager — validation RH + remplacant',
          trim(v_emp.first_name || ' ' || v_emp.last_name) || ' : ' || v_req.start_date || ' -> ' || v_req.end_date,
          '/leave'
        );
      END LOOP;
    ELSE
      v_has_mgr := v_emp.department_id IS NOT NULL
        AND public.effective_manager_employee_id(v_emp.department_id, CURRENT_DATE) IS NOT NULL
        AND public.effective_manager_employee_id(v_emp.department_id, CURRENT_DATE) <> v_emp.id;

      IF v_has_mgr THEN
        UPDATE public.leave_requests
        SET status = 'pending_manager',
            review_note = NULL, reviewed_at = NULL, reviewed_by = NULL,
            manager_note = NULL, manager_reviewed_at = NULL, manager_reviewed_by = NULL
        WHERE id = v_req.id RETURNING * INTO v_req;

        v_eff_mgr := public.effective_manager_employee_id(v_emp.department_id, CURRENT_DATE);
        SELECT user_id INTO v_eff_user FROM public.employees WHERE id = v_eff_mgr;
        PERFORM public.notify_user(
          v_eff_user, v_req.company_id, 'leave',
          'Demande de conge a valider',
          trim(v_emp.first_name || ' ' || v_emp.last_name) || ' : ' || v_req.start_date || ' -> ' || v_req.end_date,
          '/leave'
        );
      ELSE
        UPDATE public.leave_requests
        SET status = 'pending_hr',
            review_note = NULL, reviewed_at = NULL, reviewed_by = NULL
        WHERE id = v_req.id RETURNING * INTO v_req;

        FOR v_hr IN
          SELECT id FROM public.profiles
          WHERE company_id = v_req.company_id
            AND role IN ('employer', 'hr')
            AND deleted_at IS NULL AND is_active = true
        LOOP
          PERFORM public.notify_user(
            v_hr.id, v_req.company_id, 'leave',
            'Demande de conge a valider (RH)',
            trim(v_emp.first_name || ' ' || v_emp.last_name) || ' : ' || v_req.start_date || ' -> ' || v_req.end_date,
            '/leave'
          );
        END LOOP;
      END IF;
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

      FOR v_hr IN
        SELECT id FROM public.profiles
        WHERE company_id = v_req.company_id
          AND role IN ('employer', 'hr')
          AND deleted_at IS NULL AND is_active = true
      LOOP
        PERFORM public.notify_user(
          v_hr.id, v_req.company_id, 'leave',
          'Congé validé manager — validation RH requise',
          trim(v_emp.first_name || ' ' || v_emp.last_name) || ' : ' || v_req.start_date || ' -> ' || v_req.end_date,
          '/leave'
        );
      END LOOP;

      PERFORM public.notify_user(
        v_owner_user, v_req.company_id, 'leave',
        'Votre demande est en validation RH',
        'Le manager a approuvé. En attente de la validation RH.',
        '/leave'
      );

    ELSIF v_status = 'pending_hr' THEN
      IF NOT v_can_hr THEN RAISE EXCEPTION 'Seul RH/employeur peut valider définitivement'; END IF;

      IF v_is_dept_mgr AND v_req.acting_manager_employee_id IS NULL THEN
        RAISE EXCEPTION 'Le manager doit avoir designe un remplacant avant validation';
      END IF;

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

      -- Activate acting manager for the leave window (auto by dates)
      PERFORM public.activate_manager_leave_coverage(v_req.id);

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

      PERFORM public.deactivate_manager_leave_coverage(v_req.id);

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

    PERFORM public.deactivate_manager_leave_coverage(v_req.id);

    IF v_emp.status = 'on_leave' THEN
      UPDATE public.employees SET status = 'active', updated_at = now()
      WHERE id = v_emp.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Action invalide: %', p_action;
  END IF;

  RETURN v_req;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_leave_request(uuid, text, text) TO authenticated;
