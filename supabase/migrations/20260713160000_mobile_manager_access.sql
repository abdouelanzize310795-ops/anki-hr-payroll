-- Allow managers (and employees) to use the mobile app.
-- Managers keep self punch + get team presence / pending leaves.

CREATE OR REPLACE FUNCTION public.mobile_require_employee()
RETURNS public.employees
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL
    AND p.is_active = true;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profil inactif';
  END IF;

  -- Mobile app audience: collaborateurs + managers (fiche RH liée)
  IF v_role NOT IN ('employee'::public.app_role, 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Cette application est réservée aux employés et managers';
  END IF;

  SELECT e.* INTO v_emp
  FROM public.employees e
  WHERE e.user_id = auth.uid()
    AND e.deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiche employé introuvable pour ce compte';
  END IF;

  IF v_emp.status = 'terminated' THEN
    RAISE EXCEPTION 'Compte employé désactivé';
  END IF;

  RETURN v_emp;
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_get_me()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_profile public.profiles;
  v_company record;
  v_dept_name text;
  v_branch_name text;
  v_is_manager boolean := false;
BEGIN
  v_emp := public.mobile_require_employee();

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Profil inactif';
  END IF;

  v_is_manager :=
    v_profile.role = 'manager'::public.app_role
    OR public.is_dept_manager_of_company(v_emp.company_id);

  SELECT
    c.id,
    c.legal_name,
    c.trade_name,
    c.standard_hours_per_day,
    c.is_active,
    c.approval_status,
    c.subscription_status,
    c.subscription_ends_at
  INTO v_company
  FROM public.companies c
  WHERE c.id = v_emp.company_id;

  SELECT d.name INTO v_dept_name
  FROM public.departments d
  WHERE d.id = v_emp.department_id;

  SELECT b.name INTO v_branch_name
  FROM public.branches b
  WHERE b.id = v_emp.branch_id;

  RETURN jsonb_build_object(
    'user_id', auth.uid(),
    'is_manager', v_is_manager,
    'profile', jsonb_build_object(
      'email', v_profile.email,
      'full_name', v_profile.full_name,
      'role', v_profile.role,
      'phone', v_profile.phone,
      'avatar_url', v_profile.avatar_url,
      'locale', v_profile.locale,
      'must_change_password', COALESCE(v_profile.must_change_password, false)
    ),
    'employee', jsonb_build_object(
      'id', v_emp.id,
      'company_id', v_emp.company_id,
      'employee_number', v_emp.employee_number,
      'first_name', v_emp.first_name,
      'last_name', v_emp.last_name,
      'email', v_emp.email,
      'phone', v_emp.phone,
      'job_title', v_emp.job_title,
      'hire_date', v_emp.hire_date,
      'status', v_emp.status,
      'department_id', v_emp.department_id,
      'department_name', v_dept_name,
      'branch_id', v_emp.branch_id,
      'branch_name', v_branch_name,
      'address_line1', v_emp.address_line1,
      'city', v_emp.city,
      'region', v_emp.region
    ),
    'company', CASE
      WHEN v_company.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_company.id,
        'legal_name', v_company.legal_name,
        'trade_name', v_company.trade_name,
        'standard_hours_per_day', v_company.standard_hours_per_day,
        'is_active', v_company.is_active,
        'approval_status', v_company.approval_status,
        'subscription_status', v_company.subscription_status,
        'subscription_ends_at', v_company.subscription_ends_at
      )
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_get_home()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_today date := (now() AT TIME ZONE 'Indian/Comoro')::date;
  v_att public.attendance_records;
  v_pending_leaves int := 0;
  v_open_tasks int := 0;
  v_unread_notifs int := 0;
  v_latest_payslip jsonb := NULL;
  v_can_clock_in boolean;
  v_can_clock_out boolean;
  v_role public.app_role;
  v_is_manager boolean := false;
  v_team_headcount int := 0;
  v_team_present int := 0;
  v_team_pending_leaves int := 0;
BEGIN
  v_emp := public.mobile_require_employee();

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  v_is_manager :=
    v_role = 'manager'::public.app_role
    OR public.is_dept_manager_of_company(v_emp.company_id);

  SELECT * INTO v_att
  FROM public.attendance_records
  WHERE employee_id = v_emp.id
    AND work_date = v_today
    AND deleted_at IS NULL;

  SELECT count(*)::int INTO v_pending_leaves
  FROM public.leave_requests
  WHERE employee_id = v_emp.id
    AND deleted_at IS NULL
    AND status::text IN ('pending', 'pending_manager', 'pending_hr');

  SELECT count(*)::int INTO v_open_tasks
  FROM public.hr_tasks
  WHERE assignee_employee_id = v_emp.id
    AND deleted_at IS NULL
    AND status::text IN ('todo', 'in_progress');

  SELECT count(*)::int INTO v_unread_notifs
  FROM public.app_notifications
  WHERE user_id = auth.uid()
    AND read_at IS NULL;

  SELECT jsonb_build_object(
    'id', p.id,
    'payslip_number', p.payslip_number,
    'net_amount', p.net_amount,
    'currency_code', p.currency_code,
    'period_label', COALESCE(r.label, (r.period_month::text || '/' || r.period_year::text)),
    'status', p.status
  )
  INTO v_latest_payslip
  FROM public.payslips p
  LEFT JOIN public.payroll_runs r ON r.id = p.payroll_run_id
  WHERE p.employee_id = v_emp.id
    AND p.deleted_at IS NULL
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_is_manager THEN
    SELECT count(*)::int INTO v_team_headcount
    FROM public.employees e
    WHERE e.company_id = v_emp.company_id
      AND e.deleted_at IS NULL
      AND e.status IN ('active', 'on_leave')
      AND e.id <> v_emp.id
      AND public.manages_employee(e.id);

    SELECT count(*)::int INTO v_team_present
    FROM public.attendance_records a
    JOIN public.employees e ON e.id = a.employee_id
    WHERE a.company_id = v_emp.company_id
      AND a.work_date = v_today
      AND a.deleted_at IS NULL
      AND a.check_in IS NOT NULL
      AND e.deleted_at IS NULL
      AND e.id <> v_emp.id
      AND public.manages_employee(e.id);

    SELECT count(*)::int INTO v_team_pending_leaves
    FROM public.leave_requests lr
    WHERE lr.company_id = v_emp.company_id
      AND lr.deleted_at IS NULL
      AND lr.status::text IN ('pending', 'pending_manager')
      AND public.manages_employee(lr.employee_id);
  END IF;

  v_can_clock_in := (v_att.id IS NULL OR v_att.check_in IS NULL);
  v_can_clock_out := (v_att.id IS NOT NULL AND v_att.check_in IS NOT NULL AND v_att.check_out IS NULL);

  RETURN jsonb_build_object(
    'work_date', v_today,
    'timezone', 'Indian/Comoro',
    'role', v_role,
    'is_manager', v_is_manager,
    'employee', jsonb_build_object(
      'id', v_emp.id,
      'first_name', v_emp.first_name,
      'last_name', v_emp.last_name,
      'job_title', v_emp.job_title,
      'employee_number', v_emp.employee_number,
      'company_id', v_emp.company_id
    ),
    'today_attendance', CASE
      WHEN v_att.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_att.id,
        'status', v_att.status,
        'check_in', v_att.check_in,
        'check_out', v_att.check_out,
        'worked_minutes', v_att.worked_minutes,
        'notes', v_att.notes
      )
    END,
    'actions', jsonb_build_object(
      'can_clock_in', v_can_clock_in,
      'can_clock_out', v_can_clock_out
    ),
    'counts', jsonb_build_object(
      'pending_leaves', v_pending_leaves,
      'open_tasks', v_open_tasks,
      'unread_notifications', v_unread_notifs,
      'team_headcount', v_team_headcount,
      'team_present_today', v_team_present,
      'team_pending_leaves', v_team_pending_leaves
    ),
    'latest_payslip', v_latest_payslip
  );
END;
$$;

-- Team attendance for today (managers only)
CREATE OR REPLACE FUNCTION public.mobile_list_team_attendance(
  p_work_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_role public.app_role;
  v_is_manager boolean;
  v_date date := COALESCE(p_work_date, (now() AT TIME ZONE 'Indian/Comoro')::date);
BEGIN
  v_emp := public.mobile_require_employee();

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  v_is_manager :=
    v_role = 'manager'::public.app_role
    OR public.is_dept_manager_of_company(v_emp.company_id);

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Réservé aux managers';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.last_name, x.first_name)
      FROM (
        SELECT
          e.id AS employee_id,
          e.first_name,
          e.last_name,
          e.job_title,
          a.id AS attendance_id,
          a.status,
          a.check_in,
          a.check_out,
          a.worked_minutes
        FROM public.employees e
        LEFT JOIN public.attendance_records a
          ON a.employee_id = e.id
         AND a.work_date = v_date
         AND a.deleted_at IS NULL
        WHERE e.company_id = v_emp.company_id
          AND e.deleted_at IS NULL
          AND e.status IN ('active', 'on_leave')
          AND e.id <> v_emp.id
          AND public.manages_employee(e.id)
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

-- Team pending leave requests (managers only)
CREATE OR REPLACE FUNCTION public.mobile_list_team_pending_leaves(p_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_role public.app_role;
  v_is_manager boolean;
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
BEGIN
  v_emp := public.mobile_require_employee();

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  v_is_manager :=
    v_role = 'manager'::public.app_role
    OR public.is_dept_manager_of_company(v_emp.company_id);

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Réservé aux managers';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb)
      FROM (
        SELECT
          lr.id,
          lr.employee_id,
          e.first_name,
          e.last_name,
          lr.start_date,
          lr.end_date,
          lr.days_count,
          lr.status,
          lr.reason,
          lr.created_at
        FROM public.leave_requests lr
        JOIN public.employees e ON e.id = lr.employee_id
        WHERE lr.company_id = v_emp.company_id
          AND lr.deleted_at IS NULL
          AND lr.status::text IN ('pending', 'pending_manager')
          AND public.manages_employee(lr.employee_id)
        ORDER BY lr.created_at DESC
        LIMIT v_limit
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

-- Approve / reject team leave from mobile
CREATE OR REPLACE FUNCTION public.mobile_review_leave(
  p_request_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_role public.app_role;
  v_is_manager boolean;
  v_row public.leave_requests;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Action invalide (approve|reject)';
  END IF;

  v_emp := public.mobile_require_employee();
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  v_is_manager :=
    v_role = 'manager'::public.app_role
    OR public.is_dept_manager_of_company(v_emp.company_id);

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Réservé aux managers';
  END IF;

  IF NOT public.manages_employee(
    (SELECT employee_id FROM public.leave_requests WHERE id = p_request_id AND deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cette demande ne concerne pas votre équipe';
  END IF;

  v_row := public.transition_leave_request(p_request_id, p_action, p_note);

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'employee_id', v_row.employee_id,
    'start_date', v_row.start_date,
    'end_date', v_row.end_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_list_team_attendance(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_list_team_pending_leaves(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_review_leave(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mobile_list_team_attendance(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_list_team_pending_leaves(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_review_leave(uuid, text, text) TO authenticated;
