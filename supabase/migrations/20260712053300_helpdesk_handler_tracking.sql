-- Track who claimed a helpdesk ticket; notify the service manager

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS handler_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handled_at timestamptz;

CREATE INDEX IF NOT EXISTS helpdesk_tickets_handler_idx
  ON public.helpdesk_tickets (handler_employee_id)
  WHERE deleted_at IS NULL AND handler_employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.transition_helpdesk_ticket(
  p_ticket_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS public.helpdesk_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t public.helpdesk_tickets;
  v_req public.employees;
  v_uid uuid := auth.uid();
  v_can_mgr boolean;
  v_can_hr boolean;
  v_is_req boolean;
  v_is_assignee boolean;
  v_req_uid uuid;
  v_handler public.employees;
  v_handler_name text;
  v_service_mgr_uid uuid;
  v_service_dept uuid;
BEGIN
  SELECT * INTO v_t
  FROM public.helpdesk_tickets
  WHERE id = p_ticket_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket introuvable';
  END IF;

  IF v_t.requester_employee_id IS NOT NULL THEN
    SELECT * INTO v_req FROM public.employees WHERE id = v_t.requester_employee_id;
    v_req_uid := COALESCE(v_req.user_id, v_t.requester_user_id, v_t.created_by);
  ELSE
    v_req_uid := COALESCE(v_t.requester_user_id, v_t.created_by);
  END IF;

  v_is_req := v_uid = v_req_uid OR v_uid = v_t.created_by;
  v_can_hr := public.can_manage_company(v_t.company_id) OR public.is_platform_admin();
  v_can_mgr := (
    v_t.requester_employee_id IS NOT NULL
    AND public.manages_employee(v_t.requester_employee_id)
  ) OR v_can_hr;
  v_is_assignee := public.is_helpdesk_assignee(v_t);

  IF p_action = 'approve' THEN
    IF v_t.status <> 'pending_manager' THEN
      RAISE EXCEPTION 'Ce ticket n''attend plus de validation manager';
    END IF;
    IF NOT v_can_mgr THEN
      RAISE EXCEPTION 'Seul le manager du demandeur (ou la RH) peut approuver';
    END IF;
    UPDATE public.helpdesk_tickets SET
      status = 'open',
      manager_reviewed_by = v_uid,
      manager_reviewed_at = now(),
      manager_note = nullif(trim(p_note), ''),
      updated_at = now()
    WHERE id = v_t.id
    RETURNING * INTO v_t;

    PERFORM public.notify_helpdesk_assignees(v_t);
    PERFORM public.notify_user(
      v_req_uid, v_t.company_id, 'helpdesk',
      'Ticket approuvé: ' || v_t.ticket_number,
      v_t.title,
      '/helpdesk'
    );

  ELSIF p_action = 'reject' THEN
    IF v_t.status <> 'pending_manager' THEN
      RAISE EXCEPTION 'Ce ticket n''attend plus de validation manager';
    END IF;
    IF NOT v_can_mgr THEN
      RAISE EXCEPTION 'Seul le manager du demandeur (ou la RH) peut refuser';
    END IF;
    UPDATE public.helpdesk_tickets SET
      status = 'rejected',
      manager_reviewed_by = v_uid,
      manager_reviewed_at = now(),
      manager_note = nullif(trim(p_note), ''),
      updated_at = now()
    WHERE id = v_t.id
    RETURNING * INTO v_t;

    PERFORM public.notify_user(
      v_req_uid, v_t.company_id, 'helpdesk',
      'Ticket refusé: ' || v_t.ticket_number,
      COALESCE(nullif(trim(p_note), ''), v_t.title),
      '/helpdesk'
    );

  ELSIF p_action = 'cancel' THEN
    IF v_t.status NOT IN ('pending_manager', 'open') THEN
      RAISE EXCEPTION 'Annulation impossible à ce stade';
    END IF;
    IF NOT (v_is_req OR v_can_hr) THEN
      RAISE EXCEPTION 'Seul le demandeur (ou la RH) peut annuler';
    END IF;
    UPDATE public.helpdesk_tickets SET
      status = 'cancelled', updated_at = now()
    WHERE id = v_t.id
    RETURNING * INTO v_t;

  ELSIF p_action = 'start' THEN
    IF v_t.status <> 'open' THEN
      RAISE EXCEPTION 'Le ticket doit être ouvert pour démarrer le traitement';
    END IF;
    IF NOT (v_is_assignee OR v_can_hr) THEN
      RAISE EXCEPTION 'Réservé au département / personne assigné(e)';
    END IF;

    SELECT * INTO v_handler
    FROM public.employees
    WHERE user_id = v_uid
      AND company_id = v_t.company_id
      AND deleted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fiche employé requise pour prendre en charge un ticket';
    END IF;

    v_handler_name := trim(v_handler.first_name || ' ' || v_handler.last_name);

    UPDATE public.helpdesk_tickets SET
      status = 'in_progress',
      handler_employee_id = v_handler.id,
      handled_at = now(),
      updated_at = now()
    WHERE id = v_t.id
    RETURNING * INTO v_t;

    PERFORM public.notify_user(
      v_req_uid, v_t.company_id, 'helpdesk',
      'Ticket en cours: ' || v_t.ticket_number,
      v_handler_name || ' a pris en charge — ' || v_t.title,
      '/helpdesk'
    );

    -- Notify manager of the assigned service (department)
    v_service_dept := v_t.assignee_department_id;
    IF v_service_dept IS NULL AND v_t.assignee_employee_id IS NOT NULL THEN
      SELECT e.department_id INTO v_service_dept
      FROM public.employees e
      WHERE e.id = v_t.assignee_employee_id AND e.deleted_at IS NULL;
    END IF;

    IF v_service_dept IS NOT NULL THEN
      SELECT m.user_id INTO v_service_mgr_uid
      FROM public.employees m
      WHERE m.id = public.effective_manager_employee_id(v_service_dept, CURRENT_DATE)
        AND m.deleted_at IS NULL;

      IF v_service_mgr_uid IS NOT NULL AND v_service_mgr_uid <> v_uid THEN
        PERFORM public.notify_user(
          v_service_mgr_uid, v_t.company_id, 'helpdesk',
          'Prise en charge: ' || v_t.ticket_number,
          v_handler_name || ' traite le ticket « ' || v_t.title || ' »',
          '/helpdesk'
        );
      END IF;
    END IF;

  ELSIF p_action = 'resolve' THEN
    IF v_t.status NOT IN ('open', 'in_progress') THEN
      RAISE EXCEPTION 'Résolution impossible à ce stade';
    END IF;
    IF NOT (v_is_assignee OR v_can_hr) THEN
      RAISE EXCEPTION 'Réservé au département / personne assigné(e)';
    END IF;

    -- If resolving from open without prior claim, record handler
    IF v_t.handler_employee_id IS NULL THEN
      SELECT * INTO v_handler
      FROM public.employees
      WHERE user_id = v_uid
        AND company_id = v_t.company_id
        AND deleted_at IS NULL
      LIMIT 1;
    END IF;

    UPDATE public.helpdesk_tickets SET
      status = 'resolved',
      resolved_at = now(),
      handler_employee_id = COALESCE(
        handler_employee_id,
        CASE WHEN v_handler.id IS NOT NULL THEN v_handler.id ELSE NULL END
      ),
      handled_at = COALESCE(handled_at, CASE WHEN v_handler.id IS NOT NULL THEN now() ELSE NULL END),
      updated_at = now()
    WHERE id = v_t.id
    RETURNING * INTO v_t;

    PERFORM public.notify_user(
      v_req_uid, v_t.company_id, 'helpdesk',
      'Ticket résolu: ' || v_t.ticket_number,
      COALESCE(nullif(trim(p_note), ''), v_t.title),
      '/helpdesk'
    );

  ELSIF p_action = 'close' THEN
    IF v_t.status NOT IN ('resolved', 'open', 'in_progress') THEN
      RAISE EXCEPTION 'Clôture impossible à ce stade';
    END IF;
    IF NOT (v_is_req OR v_is_assignee OR v_can_hr) THEN
      RAISE EXCEPTION 'Accès refusé pour clôturer';
    END IF;
    UPDATE public.helpdesk_tickets SET
      status = 'closed',
      closed_at = now(),
      resolved_at = COALESCE(resolved_at, now()),
      updated_at = now()
    WHERE id = v_t.id
    RETURNING * INTO v_t;

  ELSE
    RAISE EXCEPTION 'Action invalide: %', p_action;
  END IF;

  RETURN v_t;
END;
$$;
