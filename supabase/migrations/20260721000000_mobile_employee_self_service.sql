-- Mshahara mobile: employee self-service (leave requests, pay, documents).

-- Leave types available to the employee, with this year's balance.
CREATE OR REPLACE FUNCTION public.mobile_list_leave_types()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Indian/Comoro'))::int;
  v_type record;
BEGIN
  v_emp := public.mobile_require_employee();
  PERFORM set_config('ankibapay.bypass_role_guard', '1', true);

  INSERT INTO public.leave_types
    (company_id, code, name, is_paid, requires_approval, deducts_balance, default_entitlement_days, color, sort_order)
  SELECT v_emp.company_id, d.code, d.name, d.is_paid, true, d.deducts, d.days, d.color, d.sort
  FROM (VALUES
    ('CP', 'Congés payés', true, true, 30, '#0F766E', 10),
    ('MAL', 'Congé maladie', true, false, 0, '#DC2626', 20),
    ('MAT', 'Congé maternité / paternité', true, false, 0, '#DB2777', 30),
    ('EXC', 'Congé exceptionnel', true, false, 0, '#7C3AED', 40),
    ('SS', 'Congé sans solde', false, false, 0, '#64748B', 50)
  ) AS d(code, name, is_paid, deducts, days, color, sort)
  WHERE NOT EXISTS (SELECT 1 FROM public.leave_types lt WHERE lt.company_id = v_emp.company_id)
  ON CONFLICT (company_id, code) DO NOTHING;

  FOR v_type IN
    SELECT id, default_entitlement_days FROM public.leave_types
    WHERE company_id = v_emp.company_id AND deleted_at IS NULL AND is_active
  LOOP
    INSERT INTO public.leave_balances (company_id, employee_id, leave_type_id, year, entitled_days)
    VALUES (v_emp.company_id, v_emp.id, v_type.id, v_year, v_type.default_entitlement_days)
    ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
  END LOOP;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', lt.id,
      'code', lt.code,
      'name', lt.name,
      'color', lt.color,
      'is_paid', lt.is_paid,
      'deducts_balance', lt.deducts_balance,
      'entitled_days', COALESCE(lb.entitled_days, 0) + COALESCE(lb.carried_over_days, 0),
      'used_days', COALESCE(lb.used_days, 0),
      'pending_days', COALESCE(lb.pending_days, 0),
      'remaining_days',
        COALESCE(lb.entitled_days, 0) + COALESCE(lb.carried_over_days, 0)
        - COALESCE(lb.used_days, 0) - COALESCE(lb.pending_days, 0)
    ) ORDER BY lt.sort_order, lt.name)
    FROM public.leave_types lt
    LEFT JOIN public.leave_balances lb
      ON lb.leave_type_id = lt.id AND lb.employee_id = v_emp.id AND lb.year = v_year
    WHERE lt.company_id = v_emp.company_id AND lt.deleted_at IS NULL AND lt.is_active
  ), '[]'::jsonb);
END;
$$;

-- Business days (Mon–Fri) between two dates, excluding public holidays.
CREATE OR REPLACE FUNCTION public.mobile_business_days(p_company_id uuid, p_start date, p_end date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::numeric
  FROM generate_series(p_start, p_end, interval '1 day') AS d(day)
  WHERE EXTRACT(ISODOW FROM d.day) < 6
    AND NOT EXISTS (
      SELECT 1 FROM public.public_holidays h
      WHERE h.holiday_date = d.day::date
        AND (h.company_id IS NULL OR h.company_id = p_company_id)
    );
$$;

-- Create and submit a leave request for the signed-in employee.
CREATE OR REPLACE FUNCTION public.mobile_request_leave(
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_days numeric;
  v_id uuid;
BEGIN
  v_emp := public.mobile_require_employee();

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Indiquez les dates de début et de fin';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La date de fin doit être après la date de début';
  END IF;
  IF p_start_date < (now() AT TIME ZONE 'Indian/Comoro')::date - 30 THEN
    RAISE EXCEPTION 'La date de début est trop ancienne';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leave_types
    WHERE id = p_leave_type_id AND company_id = v_emp.company_id AND deleted_at IS NULL AND is_active
  ) THEN
    RAISE EXCEPTION 'Type de congé introuvable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.leave_requests
    WHERE employee_id = v_emp.id AND deleted_at IS NULL
      AND status::text NOT IN ('rejected', 'cancelled')
      AND start_date <= p_end_date AND end_date >= p_start_date
  ) THEN
    RAISE EXCEPTION 'Vous avez déjà une demande sur ces dates';
  END IF;

  v_days := public.mobile_business_days(v_emp.company_id, p_start_date, p_end_date);
  IF v_days <= 0 THEN
    RAISE EXCEPTION 'Aucun jour ouvré sur cette période';
  END IF;

  INSERT INTO public.leave_requests
    (company_id, employee_id, leave_type_id, start_date, end_date, days_count, reason, status, created_by)
  VALUES
    (v_emp.company_id, v_emp.id, p_leave_type_id, p_start_date, p_end_date, v_days,
     NULLIF(trim(p_reason), ''), 'draft', auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.transition_leave_request(v_id, 'submit', NULL);

  RETURN (
    SELECT jsonb_build_object(
      'id', r.id, 'start_date', r.start_date, 'end_date', r.end_date,
      'days_count', r.days_count, 'status', r.status, 'reason', r.reason, 'created_at', r.created_at
    )
    FROM public.leave_requests r WHERE r.id = v_id
  );
END;
$$;

-- Cancel one of the employee's own pending requests.
CREATE OR REPLACE FUNCTION public.mobile_cancel_leave(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
BEGIN
  v_emp := public.mobile_require_employee();
  IF NOT EXISTS (
    SELECT 1 FROM public.leave_requests
    WHERE id = p_id AND employee_id = v_emp.id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;
  PERFORM public.transition_leave_request(p_id, 'cancel', NULL);
  RETURN jsonb_build_object('id', p_id, 'status', 'cancelled');
END;
$$;

-- Full payslip (header, lines, company) for the employee's own payslip.
CREATE OR REPLACE FUNCTION public.mobile_get_payslip(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_result jsonb;
BEGIN
  v_emp := public.mobile_require_employee();

  SELECT jsonb_build_object(
    'id', p.id,
    'payslip_number', p.payslip_number,
    'employee_name', p.employee_name,
    'employee_number', p.employee_number,
    'job_title', p.job_title,
    'department_name', p.department_name,
    'base_salary', p.base_salary,
    'gross_amount', p.gross_amount,
    'deduction_amount', p.deduction_amount,
    'net_amount', p.net_amount,
    'employer_contribution_amount', p.employer_contribution_amount,
    'currency_code', p.currency_code,
    'status', p.status,
    'worked_hours', p.worked_hours,
    'overtime_hours', p.overtime_hours,
    'expected_hours', p.expected_hours,
    'period_label', COALESCE(r.label, r.period_month::text || '/' || r.period_year::text),
    'period_start', r.period_start,
    'period_end', r.period_end,
    'paid_at', r.paid_at,
    'company', jsonb_build_object(
      'legal_name', c.legal_name,
      'trade_name', c.trade_name,
      'address_line1', c.address_line1,
      'city', c.city,
      'tax_id', c.tax_id
    ),
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', l.code, 'label', l.label, 'kind', l.kind,
        'rate_applied', l.rate_applied, 'basis_amount', l.basis_amount, 'amount', l.amount
      ) ORDER BY l.sort_order, l.label)
      FROM public.payslip_lines l WHERE l.payslip_id = p.id AND l.amount <> 0
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.payslips p
  JOIN public.payroll_runs r ON r.id = p.payroll_run_id
  JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = p_id AND p.employee_id = v_emp.id AND p.deleted_at IS NULL
    AND r.status IN ('approved', 'paid');

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Bulletin introuvable ou pas encore validé';
  END IF;
  RETURN v_result;
END;
$$;

-- Employee's pay situation: salary, bank details, current contract.
CREATE OR REPLACE FUNCTION public.mobile_get_compensation()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
BEGIN
  v_emp := public.mobile_require_employee();
  RETURN jsonb_build_object(
    'base_salary', v_emp.base_salary,
    'currency_code', v_emp.currency_code,
    'hire_date', v_emp.hire_date,
    'job_title', v_emp.job_title,
    'employee_number', v_emp.employee_number,
    'bank_name', v_emp.bank_name,
    'bank_account', v_emp.bank_account,
    'bank_rib', v_emp.bank_rib,
    'contract', (
      SELECT jsonb_build_object(
        'contract_number', ct.contract_number,
        'contract_type', ct.contract_type,
        'status', ct.status,
        'start_date', ct.start_date,
        'end_date', ct.end_date,
        'trial_end_date', ct.trial_end_date,
        'hours_per_week', ct.hours_per_week,
        'work_days_per_week', ct.work_days_per_week,
        'benefits', ct.benefits
      )
      FROM public.contracts ct
      WHERE ct.employee_id = v_emp.id AND ct.deleted_at IS NULL
        AND ct.status IN ('active', 'signed', 'sent')
      ORDER BY (ct.status = 'active') DESC, ct.start_date DESC
      LIMIT 1
    ),
    'year_to_date', (
      SELECT jsonb_build_object(
        'gross', COALESCE(sum(p.gross_amount), 0),
        'net', COALESCE(sum(p.net_amount), 0),
        'count', count(*)
      )
      FROM public.payslips p
      JOIN public.payroll_runs r ON r.id = p.payroll_run_id
      WHERE p.employee_id = v_emp.id AND p.deleted_at IS NULL
        AND r.status IN ('approved', 'paid')
        AND r.period_year = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Indian/Comoro'))::int
    )
  );
END;
$$;

-- Employee's own HR documents (download links are signed by the API layer).
CREATE OR REPLACE FUNCTION public.mobile_list_documents()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
BEGIN
  v_emp := public.mobile_require_employee();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id, 'title', d.title, 'category', d.category, 'file_name', d.file_name,
      'mime_type', d.mime_type, 'file_size', d.file_size, 'storage_path', d.storage_path,
      'created_at', d.created_at
    ) ORDER BY d.created_at DESC)
    FROM public.hr_documents d
    WHERE d.employee_id = v_emp.id AND d.deleted_at IS NULL
  ), '[]'::jsonb);
END;
$$;

-- Only payslips from approved or paid runs are visible to employees.
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
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb)
    FROM (
      SELECT p.id, p.payslip_number, p.net_amount, p.gross_amount, p.deduction_amount,
             p.currency_code, p.status, p.worked_hours, p.overtime_hours, p.created_at,
             COALESCE(r.label, r.period_month::text || '/' || r.period_year::text) AS period_label,
             r.period_year, r.period_month
      FROM public.payslips p
      JOIN public.payroll_runs r ON r.id = p.payroll_run_id
      WHERE p.employee_id = v_emp.id AND p.deleted_at IS NULL
        AND r.status IN ('approved', 'paid')
      ORDER BY r.period_year DESC, r.period_month DESC
      LIMIT v_limit
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_list_leave_types() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_business_days(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_request_leave(uuid, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_cancel_leave(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_get_payslip(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_get_compensation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mobile_list_documents() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mobile_list_leave_types() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_request_leave(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_cancel_leave(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_get_payslip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_get_compensation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_list_documents() TO authenticated;
