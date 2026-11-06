-- Mobile employee API: JWT-friendly RPCs for the native employee app.
-- Auth: Supabase Auth Bearer token (authenticated role). Self-scoped only.

CREATE OR REPLACE FUNCTION public.mobile_require_employee()
RETURNS public.employees
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
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

COMMENT ON FUNCTION public.mobile_require_employee() IS
  'Internal helper: resolves the authenticated user to their employee row.';

-- ---------------------------------------------------------------------------
-- Profile + employee + company (safe self payload)
-- ---------------------------------------------------------------------------
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
BEGIN
  v_emp := public.mobile_require_employee();

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Profil inactif';
  END IF;

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

COMMENT ON FUNCTION public.mobile_get_me() IS
  'Mobile API: authenticated employee profile, HR card and company context.';

-- ---------------------------------------------------------------------------
-- Home hub (punch-first)
-- ---------------------------------------------------------------------------
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
BEGIN
  v_emp := public.mobile_require_employee();

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

  v_can_clock_in := (v_att.id IS NULL OR v_att.check_in IS NULL);
  v_can_clock_out := (v_att.id IS NOT NULL AND v_att.check_in IS NOT NULL AND v_att.check_out IS NULL);

  RETURN jsonb_build_object(
    'work_date', v_today,
    'timezone', 'Indian/Comoro',
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
      'unread_notifications', v_unread_notifs
    ),
    'latest_payslip', v_latest_payslip
  );
END;
$$;

COMMENT ON FUNCTION public.mobile_get_home() IS
  'Mobile API: punch-first home payload for the authenticated employee.';

-- ---------------------------------------------------------------------------
-- Clock in / out (self only — no employeeId required from client)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mobile_clock(
  p_action text,
  p_at timestamptz DEFAULT now(),
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL,
  p_device_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_row public.attendance_records;
  v_meta text;
BEGIN
  IF p_action NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Action invalide: % (attendu: in|out)', p_action;
  END IF;

  v_emp := public.mobile_require_employee();

  v_row := public.clock_attendance(
    v_emp.company_id,
    v_emp.id,
    p_action,
    COALESCE(p_at, now())
  );

  -- Optional device/geo audit trail appended to notes (non-blocking)
  IF p_lat IS NOT NULL OR p_lng IS NOT NULL OR p_device_label IS NOT NULL THEN
    v_meta := jsonb_build_object(
      'action', p_action,
      'at', COALESCE(p_at, now()),
      'lat', p_lat,
      'lng', p_lng,
      'accuracy_m', p_accuracy_m,
      'device', NULLIF(trim(p_device_label), '')
    )::text;

    UPDATE public.attendance_records
    SET notes = CASE
      WHEN notes IS NULL OR btrim(notes) = '' THEN 'mobile:' || v_meta
      ELSE notes || E'\nmobile:' || v_meta
    END
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'company_id', v_row.company_id,
    'employee_id', v_row.employee_id,
    'work_date', v_row.work_date,
    'status', v_row.status,
    'check_in', v_row.check_in,
    'check_out', v_row.check_out,
    'worked_minutes', v_row.worked_minutes,
    'notes', v_row.notes
  );
END;
$$;

COMMENT ON FUNCTION public.mobile_clock(text, timestamptz, double precision, double precision, double precision, text) IS
  'Mobile API: self clock-in/out with optional GPS/device metadata.';

-- ---------------------------------------------------------------------------
-- Attendance history
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mobile_list_attendance(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_from date;
  v_to date;
  v_today date := (now() AT TIME ZONE 'Indian/Comoro')::date;
BEGIN
  v_emp := public.mobile_require_employee();

  v_from := COALESCE(p_from, date_trunc('month', v_today::timestamp)::date);
  v_to := COALESCE(p_to, v_today);

  IF v_to < v_from THEN
    RAISE EXCEPTION 'Plage de dates invalide';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'work_date', a.work_date,
          'status', a.status,
          'check_in', a.check_in,
          'check_out', a.check_out,
          'worked_minutes', a.worked_minutes,
          'notes', a.notes
        )
        ORDER BY a.work_date DESC
      )
      FROM public.attendance_records a
      WHERE a.employee_id = v_emp.id
        AND a.deleted_at IS NULL
        AND a.work_date >= v_from
        AND a.work_date <= v_to
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.mobile_list_attendance(date, date) IS
  'Mobile API: own attendance history for a date range (default: current month).';

-- ---------------------------------------------------------------------------
-- Leaves
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mobile_list_leaves(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  v_emp := public.mobile_require_employee();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb)
      FROM (
        SELECT
          lr.id,
          lr.start_date,
          lr.end_date,
          lr.days_count,
          lr.status,
          lr.reason,
          lr.created_at
        FROM public.leave_requests lr
        WHERE lr.employee_id = v_emp.id
          AND lr.deleted_at IS NULL
        ORDER BY lr.created_at DESC
        LIMIT v_limit
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_list_leave_balances(p_year int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_year int := COALESCE(p_year, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Indian/Comoro'))::int);
BEGIN
  v_emp := public.mobile_require_employee();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', lb.id,
          'leave_type_id', lb.leave_type_id,
          'year', lb.year,
          'entitled_days', lb.entitled_days,
          'used_days', lb.used_days,
          'pending_days', lb.pending_days,
          'carried_over_days', lb.carried_over_days,
          'remaining_days',
            COALESCE(lb.entitled_days, 0)
            + COALESCE(lb.carried_over_days, 0)
            - COALESCE(lb.used_days, 0)
            - COALESCE(lb.pending_days, 0)
        )
      )
      FROM public.leave_balances lb
      WHERE lb.employee_id = v_emp.id
        AND lb.year = v_year
    ),
    '[]'::jsonb
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Payslips
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mobile_list_payslips(p_limit int DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 12), 48));
BEGIN
  v_emp := public.mobile_require_employee();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb)
      FROM (
        SELECT
          p.id,
          p.payslip_number,
          p.net_amount,
          p.gross_amount,
          p.deduction_amount,
          p.currency_code,
          p.status,
          p.worked_hours,
          p.overtime_hours,
          p.created_at,
          COALESCE(r.label, (r.period_month::text || '/' || r.period_year::text)) AS period_label,
          r.period_year,
          r.period_month
        FROM public.payslips p
        LEFT JOIN public.payroll_runs r ON r.id = p.payroll_run_id
        WHERE p.employee_id = v_emp.id
          AND p.deleted_at IS NULL
        ORDER BY p.created_at DESC
        LIMIT v_limit
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mobile_list_notifications(p_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  -- Ensure caller is a linked employee (mobile app audience)
  PERFORM public.mobile_require_employee();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb)
      FROM (
        SELECT
          n.id,
          n.kind,
          n.title,
          n.body,
          n.href,
          n.read_at,
          n.created_at
        FROM public.app_notifications n
        WHERE n.user_id = auth.uid()
        ORDER BY n.created_at DESC
        LIMIT v_limit
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_mark_notification_read(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.app_notifications;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  PERFORM public.mobile_require_employee();

  UPDATE public.app_notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_id
    AND user_id = auth.uid()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification introuvable';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'read_at', v_row.read_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated only (never anon)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mobile_require_employee() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mobile_get_me() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_get_home() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_clock(text, timestamptz, double precision, double precision, double precision, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_list_attendance(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_list_leaves(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_list_leave_balances(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_list_payslips(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_list_notifications(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_mark_notification_read(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mobile_get_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_get_home() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_clock(text, timestamptz, double precision, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_list_attendance(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_list_leaves(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_list_leave_balances(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_list_payslips(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_list_notifications(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_mark_notification_read(uuid) TO authenticated;
-- mobile_require_employee stays non-executable by clients (SECURITY DEFINER callee only)
