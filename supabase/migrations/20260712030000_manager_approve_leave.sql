-- Allow managers to approve/reject leave in their company (workflow manager)
-- without granting full can_manage_company (payroll, etc.)

CREATE OR REPLACE FUNCTION public.can_review_leave(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_platform_admin()
    OR public.can_manage_company(target)
    OR (
      public.current_company_id() = target
      AND public.current_user_role() = 'manager'
    );
$$;

CREATE OR REPLACE FUNCTION public.transition_leave_request(
  p_request_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS public.leave_requests
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
  v_can_manage boolean;
  v_can_review boolean;
  v_is_owner boolean;
BEGIN
  SELECT * INTO v_req
  FROM public.leave_requests
  WHERE id = p_request_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;

  v_can_manage := public.can_manage_company(v_req.company_id) OR public.is_platform_admin();
  v_can_review := public.can_review_leave(v_req.company_id);
  v_is_owner := EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_req.employee_id AND e.user_id = auth.uid()
  );

  SELECT * INTO v_type FROM public.leave_types WHERE id = v_req.leave_type_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Type de congé introuvable';
  END IF;

  v_year := EXTRACT(YEAR FROM v_req.start_date)::int;

  IF p_action = 'submit' THEN
    IF v_req.status <> 'draft' THEN
      RAISE EXCEPTION 'Seule une demande brouillon peut être soumise';
    END IF;
    IF NOT (v_can_manage OR v_is_owner) THEN
      RAISE EXCEPTION 'Accès refusé';
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

    UPDATE public.leave_requests
    SET status = 'pending', review_note = NULL, reviewed_at = NULL, reviewed_by = NULL
    WHERE id = v_req.id
    RETURNING * INTO v_req;

  ELSIF p_action = 'approve' THEN
    IF NOT v_can_review THEN
      RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF v_req.status <> 'pending' THEN
      RAISE EXCEPTION 'Seule une demande en attente peut être approuvée';
    END IF;

    IF v_type.deducts_balance THEN
      v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
      UPDATE public.leave_balances
      SET
        pending_days = GREATEST(0, pending_days - v_req.days_count),
        used_days = used_days + v_req.days_count
      WHERE id = v_balance.id;
    END IF;

    UPDATE public.leave_requests
    SET
      status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = NULLIF(trim(COALESCE(p_note, '')), '')
    WHERE id = v_req.id
    RETURNING * INTO v_req;

    IF CURRENT_DATE BETWEEN v_req.start_date AND v_req.end_date THEN
      UPDATE public.employees
      SET status = 'on_leave'
      WHERE id = v_req.employee_id
        AND deleted_at IS NULL
        AND status = 'active';
    END IF;

  ELSIF p_action = 'reject' THEN
    IF NOT v_can_review THEN
      RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF v_req.status <> 'pending' THEN
      RAISE EXCEPTION 'Seule une demande en attente peut être refusée';
    END IF;

    IF v_type.deducts_balance THEN
      v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
      UPDATE public.leave_balances
      SET pending_days = GREATEST(0, pending_days - v_req.days_count)
      WHERE id = v_balance.id;
    END IF;

    UPDATE public.leave_requests
    SET
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = NULLIF(trim(COALESCE(p_note, '')), '')
    WHERE id = v_req.id
    RETURNING * INTO v_req;

  ELSIF p_action = 'cancel' THEN
    IF NOT (v_can_review OR (v_is_owner AND v_req.status IN ('draft', 'pending'))) THEN
      RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF v_req.status IN ('cancelled', 'rejected') THEN
      RAISE EXCEPTION 'Demande déjà clôturée';
    END IF;

    IF v_req.status = 'pending' AND v_type.deducts_balance THEN
      v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
      UPDATE public.leave_balances
      SET pending_days = GREATEST(0, pending_days - v_req.days_count)
      WHERE id = v_balance.id;
    ELSIF v_req.status = 'approved' AND v_type.deducts_balance THEN
      IF NOT v_can_review THEN
        RAISE EXCEPTION 'Seul un gestionnaire peut annuler un congé approuvé';
      END IF;
      v_balance := public.ensure_leave_balance(v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_year);
      UPDATE public.leave_balances
      SET used_days = GREATEST(0, used_days - v_req.days_count)
      WHERE id = v_balance.id;
    END IF;

    UPDATE public.leave_requests
    SET
      status = 'cancelled',
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

GRANT EXECUTE ON FUNCTION public.can_review_leave(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_leave_request(uuid, text, text) TO authenticated;
