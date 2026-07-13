-- Step 2: calculate payroll from attendance hours + OT (after enum commit)
CREATE OR REPLACE FUNCTION public.ensure_default_payroll_components(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.belongs_to_company(p_company_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  INSERT INTO public.payroll_components (company_id, code, name, kind, calc_method, rate_value, is_system, sort_order)
  VALUES
    (p_company_id, 'SALAIRE_BASE', 'Salaire de base', 'earning', 'base_salary', 0, true, 10),
    (p_company_id, 'TRANSPORT', 'Indemnité de transport', 'earning', 'fixed', 0, false, 20),
    (p_company_id, 'PRIME', 'Prime / bonus', 'earning', 'fixed', 0, false, 30),
    (p_company_id, 'HEURES_SUP', 'Heures supplémentaires', 'earning', 'overtime_hours', 0, false, 40),
    (p_company_id, 'COTIS_SAL', 'Cotisation salariale (paramétrable)', 'deduction', 'percent_of_gross', 0, false, 110),
    (p_company_id, 'IMPOT', 'Impôt sur le revenu (paramétrable)', 'deduction', 'percent_of_gross', 0, false, 120),
    (p_company_id, 'COTIS_PAT', 'Cotisation patronale (paramétrable)', 'employer_contribution', 'percent_of_gross', 0, false, 210)
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_payroll_run(p_run_id uuid)
RETURNS payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run public.payroll_runs;
  v_company public.companies;
  v_emp RECORD;
  v_comp RECORD;
  v_payslip_id uuid;
  v_base numeric(14,2);
  v_base_pay numeric(14,2);
  v_hourly numeric(14,4);
  v_gross numeric(14,2);
  v_deduct numeric(14,2);
  v_employer numeric(14,2);
  v_amount numeric(14,2);
  v_basis numeric(14,2);
  v_rate numeric(14,4);
  v_total_gross numeric(14,2) := 0;
  v_total_deduct numeric(14,2) := 0;
  v_total_net numeric(14,2) := 0;
  v_total_employer numeric(14,2) := 0;
  v_count int := 0;
  v_seq int := 0;
  v_std_hours numeric(8,2);
  v_work_days numeric(8,2);
  v_monthly_hours numeric(10,2);
  v_ot_mult numeric(6,3);
  v_company_has_attendance boolean;
  v_expected_hours numeric(10,2);
  v_regular_hours numeric(10,2);
  v_ot_hours numeric(10,2);
  v_att RECORD;
BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle de paie introuvable'; END IF;
  IF NOT (public.can_manage_company(v_run.company_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF v_run.status NOT IN ('draft', 'calculated') THEN
    RAISE EXCEPTION 'Ce cycle ne peut plus être recalculé';
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = v_run.company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entreprise introuvable'; END IF;

  v_std_hours := COALESCE(NULLIF(v_company.standard_hours_per_day, 0), 8);
  v_work_days := COALESCE(NULLIF(v_company.work_days_per_week, 0), 5);
  v_monthly_hours := round(v_work_days * v_std_hours * (52.0 / 12.0), 2);
  v_ot_mult := COALESCE(v_company.overtime_multiplier, 1.5);

  SELECT COUNT(*)::numeric * v_std_hours INTO v_expected_hours
  FROM generate_series(v_run.period_start::timestamp, v_run.period_end::timestamp, interval '1 day') d
  WHERE EXTRACT(ISODOW FROM d) < 6;

  IF COALESCE(v_expected_hours, 0) <= 0 THEN
    v_expected_hours := v_monthly_hours;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.attendance_records a
    WHERE a.company_id = v_run.company_id
      AND a.deleted_at IS NULL
      AND a.work_date BETWEEN v_run.period_start AND v_run.period_end
      AND a.worked_minutes IS NOT NULL
  ) INTO v_company_has_attendance;

  PERFORM public.ensure_default_payroll_components(v_run.company_id);

  DELETE FROM public.payslip_lines WHERE payslip_id IN (
    SELECT id FROM public.payslips WHERE payroll_run_id = v_run.id
  );
  DELETE FROM public.payslips WHERE payroll_run_id = v_run.id;

  FOR v_emp IN
    SELECT e.*, d.name AS dept_name
    FROM public.employees e
    LEFT JOIN public.departments d ON d.id = e.department_id
    WHERE e.company_id = v_run.company_id
      AND e.deleted_at IS NULL
      AND e.status IN ('active', 'on_leave')
      AND COALESCE(e.base_salary, 0) > 0
    ORDER BY e.last_name, e.first_name
  LOOP
    v_base := COALESCE(v_emp.base_salary, 0);
    v_hourly := CASE WHEN v_monthly_hours > 0 THEN v_base / v_monthly_hours ELSE 0 END;
    v_gross := 0;
    v_deduct := 0;
    v_employer := 0;
    v_seq := v_seq + 1;
    v_regular_hours := 0;
    v_ot_hours := 0;

    FOR v_att IN
      SELECT a.worked_minutes
      FROM public.attendance_records a
      WHERE a.employee_id = v_emp.id
        AND a.company_id = v_run.company_id
        AND a.deleted_at IS NULL
        AND a.work_date BETWEEN v_run.period_start AND v_run.period_end
        AND a.status IN ('present', 'late', 'remote', 'half_day')
        AND a.worked_minutes IS NOT NULL
        AND a.worked_minutes > 0
    LOOP
      v_regular_hours := v_regular_hours
        + LEAST(v_att.worked_minutes::numeric / 60.0, v_std_hours);
      v_ot_hours := v_ot_hours
        + GREATEST(v_att.worked_minutes::numeric / 60.0 - v_std_hours, 0);
    END LOOP;

    v_regular_hours := round(v_regular_hours, 2);
    v_ot_hours := round(v_ot_hours, 2);

    IF v_company_has_attendance THEN
      IF v_expected_hours > 0 THEN
        v_base_pay := round(v_base * LEAST(v_regular_hours / v_expected_hours, 1.25), 2);
      ELSE
        v_base_pay := v_base;
      END IF;
    ELSE
      v_base_pay := v_base;
    END IF;

    INSERT INTO public.payslips (
      payroll_run_id, company_id, employee_id, payslip_number,
      employee_number, employee_name, job_title, department_name,
      base_salary, currency_code, status,
      worked_hours, overtime_hours, expected_hours
    ) VALUES (
      v_run.id, v_run.company_id, v_emp.id,
      'BP-' || v_run.period_year::text || lpad(v_run.period_month::text, 2, '0') || '-' || lpad(v_seq::text, 4, '0'),
      v_emp.employee_number,
      trim(v_emp.first_name || ' ' || v_emp.last_name),
      v_emp.job_title,
      v_emp.dept_name,
      v_base,
      COALESCE(v_emp.currency_code, v_run.currency_code),
      'calculated',
      v_regular_hours,
      v_ot_hours,
      round(v_expected_hours, 2)
    )
    RETURNING id INTO v_payslip_id;

    FOR v_comp IN
      SELECT * FROM public.payroll_components
      WHERE company_id = v_run.company_id AND deleted_at IS NULL AND is_active = true
        AND kind = 'earning'
      ORDER BY sort_order, code
    LOOP
      IF v_comp.calc_method = 'base_salary' THEN
        v_amount := v_base_pay;
        v_basis := v_base;
        v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method = 'fixed' THEN
        v_amount := v_comp.rate_value;
        v_basis := v_comp.rate_value;
        v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method = 'percent_of_base' THEN
        v_basis := v_base_pay;
        v_amount := round(v_base_pay * v_comp.rate_value / 100.0, 2);
        v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method = 'worked_hours' THEN
        v_rate := CASE WHEN v_comp.rate_value > 0 THEN v_comp.rate_value ELSE v_hourly END;
        v_basis := v_regular_hours;
        v_amount := round(v_regular_hours * v_rate, 2);
      ELSIF v_comp.calc_method = 'overtime_hours' THEN
        v_rate := CASE WHEN v_comp.rate_value > 0 THEN v_comp.rate_value ELSE v_ot_mult END;
        v_basis := v_ot_hours;
        v_amount := round(v_ot_hours * v_hourly * v_rate, 2);
      ELSE
        CONTINUE;
      END IF;

      IF v_amount = 0 AND v_comp.calc_method NOT IN ('base_salary') THEN
        CONTINUE;
      END IF;

      INSERT INTO public.payslip_lines (
        payslip_id, company_id, component_id, code, label, kind, calc_method,
        rate_applied, basis_amount, amount, sort_order
      ) VALUES (
        v_payslip_id, v_run.company_id, v_comp.id, v_comp.code, v_comp.name, v_comp.kind, v_comp.calc_method,
        v_rate, v_basis, v_amount, v_comp.sort_order
      );
      v_gross := v_gross + v_amount;
    END LOOP;

    FOR v_comp IN
      SELECT * FROM public.payroll_components
      WHERE company_id = v_run.company_id AND deleted_at IS NULL AND is_active = true
        AND kind IN ('deduction', 'employer_contribution')
      ORDER BY sort_order, code
    LOOP
      IF v_comp.calc_method = 'fixed' THEN
        v_amount := v_comp.rate_value;
        v_basis := v_comp.rate_value;
        v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method = 'percent_of_base' THEN
        v_basis := v_base_pay;
        v_amount := round(v_base_pay * v_comp.rate_value / 100.0, 2);
        v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method = 'percent_of_gross' THEN
        v_basis := v_gross;
        v_amount := round(v_gross * v_comp.rate_value / 100.0, 2);
        v_rate := v_comp.rate_value;
      ELSE
        CONTINUE;
      END IF;

      IF v_amount = 0 THEN CONTINUE; END IF;

      INSERT INTO public.payslip_lines (
        payslip_id, company_id, component_id, code, label, kind, calc_method,
        rate_applied, basis_amount, amount, sort_order
      ) VALUES (
        v_payslip_id, v_run.company_id, v_comp.id, v_comp.code, v_comp.name, v_comp.kind, v_comp.calc_method,
        v_rate, v_basis, v_amount, v_comp.sort_order
      );

      IF v_comp.kind = 'deduction' THEN
        v_deduct := v_deduct + v_amount;
      ELSE
        v_employer := v_employer + v_amount;
      END IF;
    END LOOP;

    UPDATE public.payslips SET
      gross_amount = v_gross,
      deduction_amount = v_deduct,
      net_amount = v_gross - v_deduct,
      employer_contribution_amount = v_employer,
      status = 'calculated'
    WHERE id = v_payslip_id;

    v_count := v_count + 1;
    v_total_gross := v_total_gross + v_gross;
    v_total_deduct := v_total_deduct + v_deduct;
    v_total_net := v_total_net + (v_gross - v_deduct);
    v_total_employer := v_total_employer + v_employer;
  END LOOP;

  UPDATE public.payroll_runs SET
    status = 'calculated',
    employee_count = v_count,
    total_gross = v_total_gross,
    total_deductions = v_total_deduct,
    total_net = v_total_net,
    total_employer_cost = v_total_gross + v_total_employer,
    calculated_at = now()
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

INSERT INTO public.payroll_components (company_id, code, name, kind, calc_method, rate_value, is_system, sort_order)
SELECT c.id, 'HEURES_SUP', 'Heures supplémentaires', 'earning'::public.payroll_component_kind, 'overtime_hours'::public.payroll_calc_method, 0, false, 40
FROM public.companies c
WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, code) DO NOTHING;
