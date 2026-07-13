-- Allow any company member to open a helpdesk ticket (not only linked employees)

ALTER TABLE public.helpdesk_tickets
  ALTER COLUMN requester_employee_id DROP NOT NULL;

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS requester_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.helpdesk_tickets t
SET requester_user_id = e.user_id
FROM public.employees e
WHERE e.id = t.requester_employee_id
  AND t.requester_user_id IS NULL;

DROP POLICY IF EXISTS helpdesk_tickets_select ON public.helpdesk_tickets;
CREATE POLICY helpdesk_tickets_select
  ON public.helpdesk_tickets FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(company_id)
      OR public.is_platform_admin()
      OR created_by = auth.uid()
      OR requester_user_id = auth.uid()
      OR (
        requester_employee_id IS NOT NULL
        AND public.manages_employee(requester_employee_id)
      )
      OR (
        requester_employee_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = requester_employee_id
            AND e.user_id = auth.uid()
            AND e.deleted_at IS NULL
        )
      )
      OR (
        status <> 'pending_manager'
        AND public.is_helpdesk_assignee(helpdesk_tickets)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.create_helpdesk_ticket(
  p_company_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_category public.helpdesk_category DEFAULT 'request',
  p_priority public.helpdesk_priority DEFAULT 'medium',
  p_assignee_employee_id uuid DEFAULT NULL,
  p_assignee_department_id uuid DEFAULT NULL
)
RETURNS public.helpdesk_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req public.employees;
  v_ticket public.helpdesk_tickets;
  v_num text;
  v_seq int;
  v_mgr_uid uuid;
  v_status public.helpdesk_status := 'pending_manager';
  v_auto boolean := false;
  v_has_emp boolean := false;
BEGIN
  IF NOT (public.belongs_to_company(p_company_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF (p_assignee_employee_id IS NULL) = (p_assignee_department_id IS NULL) THEN
    RAISE EXCEPTION 'Assignez une personne OU un département';
  END IF;

  IF char_length(trim(p_title)) < 3 THEN
    RAISE EXCEPTION 'Titre trop court';
  END IF;

  SELECT * INTO v_req
  FROM public.employees
  WHERE user_id = auth.uid()
    AND company_id = p_company_id
    AND deleted_at IS NULL
  LIMIT 1;
  v_has_emp := FOUND;

  IF p_assignee_employee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = p_assignee_employee_id
        AND e.company_id = p_company_id
        AND e.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Assigné introuvable';
    END IF;
  END IF;

  IF p_assignee_department_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.id = p_assignee_department_id
        AND d.company_id = p_company_id
        AND d.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Département cible introuvable';
    END IF;
  END IF;

  IF v_has_emp AND v_req.department_id IS NOT NULL THEN
    SELECT m.user_id INTO v_mgr_uid
    FROM public.departments d
    JOIN public.employees m ON m.id = public.effective_manager_employee_id(d.id, CURRENT_DATE)
    WHERE d.id = v_req.department_id AND d.deleted_at IS NULL AND m.deleted_at IS NULL;

    IF v_mgr_uid IS NULL OR v_mgr_uid = auth.uid() THEN
      v_auto := true;
      v_status := 'open';
    END IF;
  ELSE
    -- Pas de fiche / pas de département : ouverture directe (RH, employeur, etc.)
    v_auto := true;
    v_status := 'open';
  END IF;

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(ticket_number, '[^0-9]', '', 'g'), '')::int
  ), 0) + 1
  INTO v_seq
  FROM public.helpdesk_tickets
  WHERE company_id = p_company_id;

  v_num := 'HD-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.helpdesk_tickets (
    company_id, ticket_number, title, description, category, priority, status,
    requester_employee_id, requester_department_id, requester_user_id,
    assignee_employee_id, assignee_department_id,
    manager_reviewed_by, manager_reviewed_at, manager_note,
    created_by
  ) VALUES (
    p_company_id, v_num, trim(p_title), nullif(trim(p_description), ''),
    p_category, p_priority, v_status,
    CASE WHEN v_has_emp THEN v_req.id ELSE NULL END,
    CASE WHEN v_has_emp THEN v_req.department_id ELSE NULL END,
    auth.uid(),
    p_assignee_employee_id, p_assignee_department_id,
    CASE WHEN v_auto THEN auth.uid() ELSE NULL END,
    CASE WHEN v_auto THEN now() ELSE NULL END,
    CASE WHEN v_auto THEN 'Approbation automatique' ELSE NULL END,
    auth.uid()
  )
  RETURNING * INTO v_ticket;

  IF v_auto THEN
    PERFORM public.notify_helpdesk_assignees(v_ticket);
  ELSIF v_mgr_uid IS NOT NULL THEN
    PERFORM public.notify_user(
      v_mgr_uid, p_company_id, 'helpdesk',
      'Ticket à valider: ' || v_num,
      trim(p_title),
      '/helpdesk'
    );
  END IF;

  PERFORM public.notify_user(
    auth.uid(), p_company_id, 'helpdesk',
    CASE WHEN v_auto THEN 'Ticket ouvert: ' ELSE 'Ticket soumis: ' END || v_num,
    trim(p_title),
    '/helpdesk'
  );

  RETURN v_ticket;
END;
$$;

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
    UPDATE public.helpdesk_tickets SET
      status = 'in_progress', updated_at = now()
    WHERE id = v_t.id
    RETURNING * INTO v_t;
    PERFORM public.notify_user(
      v_req_uid, v_t.company_id, 'helpdesk',
      'Ticket en cours: ' || v_t.ticket_number,
      v_t.title,
      '/helpdesk'
    );

  ELSIF p_action = 'resolve' THEN
    IF v_t.status NOT IN ('open', 'in_progress') THEN
      RAISE EXCEPTION 'Résolution impossible à ce stade';
    END IF;
    IF NOT (v_is_assignee OR v_can_hr) THEN
      RAISE EXCEPTION 'Réservé au département / personne assigné(e)';
    END IF;
    UPDATE public.helpdesk_tickets SET
      status = 'resolved',
      resolved_at = now(),
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
