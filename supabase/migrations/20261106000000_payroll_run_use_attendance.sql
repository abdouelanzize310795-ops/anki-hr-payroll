-- L'employeur choisit, à la création du cycle, si le pointage influence les salaires.
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS use_attendance boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.calculate_payroll_run(p_run_id uuid)
 RETURNS payroll_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run public.payroll_runs;
  v_company public.companies;
  v_layout jsonb;
  v_emp RECORD;
  v_comp public.payroll_components;
  v_payslip_id uuid;
  v_base numeric(14,2);
  v_base_pay numeric(14,2);
  v_hourly numeric(14,4);
  v_gross numeric(14,2);
  v_taxable numeric(14,2);
  v_retirement numeric(14,2);
  v_taxable_reduction numeric(14,2);
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
  v_contract_type text;
  v_seniority int;
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

  SELECT t.layout INTO v_layout FROM public.payslip_templates t
  WHERE t.id = coalesce(v_company.payslip_template_id, '00000000-0000-4000-a000-000000000001');

  v_std_hours := coalesce(nullif(v_company.standard_hours_per_day, 0), 8);
  v_work_days := coalesce(nullif(v_company.work_days_per_week, 0), 5);
  v_monthly_hours := round(v_work_days * v_std_hours * (52.0 / 12.0), 2);
  v_ot_mult := coalesce(v_company.overtime_multiplier, 1.5);

  SELECT count(*)::numeric * v_std_hours INTO v_expected_hours
  FROM generate_series(v_run.period_start::timestamp, v_run.period_end::timestamp, interval '1 day') d
  WHERE extract(isodow FROM d) < 6
    AND NOT EXISTS (SELECT 1 FROM public.public_holidays h
                    WHERE h.holiday_date = d::date AND (h.company_id IS NULL OR h.company_id = v_run.company_id));
  IF coalesce(v_expected_hours, 0) <= 0 THEN v_expected_hours := v_monthly_hours; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.attendance_records a
    WHERE a.company_id = v_run.company_id AND a.deleted_at IS NULL
      AND a.work_date BETWEEN v_run.period_start AND v_run.period_end
      AND a.worked_minutes IS NOT NULL
  ) INTO v_company_has_attendance;

  PERFORM public.ensure_default_payroll_components(v_run.company_id);

  DELETE FROM public.payslip_lines WHERE payslip_id IN (SELECT id FROM public.payslips WHERE payroll_run_id = v_run.id);
  DELETE FROM public.payslips WHERE payroll_run_id = v_run.id;

  FOR v_emp IN
    SELECT e.*, d.name AS dept_name
    FROM public.employees e
    LEFT JOIN public.departments d ON d.id = e.department_id
    WHERE e.company_id = v_run.company_id AND e.deleted_at IS NULL
      AND e.status IN ('active', 'on_leave')
      AND coalesce(e.base_salary, 0) > 0
      AND e.hire_date <= v_run.period_end
      AND (e.termination_date IS NULL OR e.termination_date >= v_run.period_start)
    ORDER BY e.last_name, e.first_name
  LOOP
    v_base := coalesce(v_emp.base_salary, 0);
    v_hourly := CASE WHEN v_monthly_hours > 0 THEN v_base / v_monthly_hours ELSE 0 END;
    v_gross := 0; v_taxable := 0; v_retirement := 0; v_taxable_reduction := 0;
    v_deduct := 0; v_employer := 0;
    v_seq := v_seq + 1;

    SELECT c.contract_type INTO v_contract_type FROM public.contracts c
    WHERE c.employee_id = v_emp.id AND c.deleted_at IS NULL AND c.status IN ('active', 'signed')
    ORDER BY (c.status = 'active') DESC, c.start_date DESC LIMIT 1;
    v_seniority := CASE WHEN v_emp.hire_date IS NULL THEN 0
      ELSE (extract(year FROM age(v_run.period_end, v_emp.hire_date)) * 12
            + extract(month FROM age(v_run.period_end, v_emp.hire_date)))::int END;

    -- Paid leave days count as normal working days.
    SELECT coalesce(round(sum(CASE WHEN a.status = 'on_leave' THEN v_std_hours
                                   ELSE least(coalesce(a.worked_minutes, 0)::numeric / 60.0, v_std_hours) END), 2), 0),
           coalesce(round(sum(CASE WHEN a.status = 'on_leave' THEN 0
                                   ELSE greatest(coalesce(a.worked_minutes, 0)::numeric / 60.0 - v_std_hours, 0) END), 2), 0)
    INTO v_regular_hours, v_ot_hours
    FROM public.attendance_records a
    WHERE a.employee_id = v_emp.id AND a.company_id = v_run.company_id AND a.deleted_at IS NULL
      AND a.work_date BETWEEN v_run.period_start AND v_run.period_end
      AND (
        (a.status IN ('present', 'late', 'remote', 'half_day') AND coalesce(a.worked_minutes, 0) > 0)
        OR (a.status = 'on_leave' AND EXISTS (
              SELECT 1 FROM public.leave_requests lr JOIN public.leave_types lt ON lt.id = lr.leave_type_id
              WHERE lr.employee_id = a.employee_id AND lr.status = 'approved' AND lr.deleted_at IS NULL
                AND lt.is_paid AND a.work_date BETWEEN lr.start_date AND lr.end_date))
      );

    -- The employer chose a fixed-salary cycle: attendance changes nothing.
    IF NOT v_run.use_attendance THEN
      v_regular_hours := 0;
      v_ot_hours := 0;
    END IF;

    v_base_pay := CASE WHEN v_run.use_attendance AND v_company_has_attendance AND v_expected_hours > 0
                       THEN round(v_base * least(v_regular_hours / v_expected_hours, 1.25), 2)
                       ELSE v_base END;

    INSERT INTO public.payslips (
      payroll_run_id, company_id, employee_id, payslip_number, employee_number, employee_name, job_title,
      department_name, base_salary, currency_code, status, worked_hours, overtime_hours, expected_hours,
      template_snapshot
    ) VALUES (
      v_run.id, v_run.company_id, v_emp.id,
      'BP-' || v_run.period_year::text || lpad(v_run.period_month::text, 2, '0') || '-' || lpad(v_seq::text, 4, '0'),
      v_emp.employee_number, trim(v_emp.first_name || ' ' || v_emp.last_name), v_emp.job_title, v_emp.dept_name,
      v_base, coalesce(v_emp.currency_code, v_run.currency_code), 'calculated',
      v_regular_hours, v_ot_hours, round(v_expected_hours, 2), v_layout
    )
    RETURNING id INTO v_payslip_id;

    -- Earnings
    FOR v_comp IN
      SELECT * FROM public.payroll_components
      WHERE company_id = v_run.company_id AND deleted_at IS NULL AND is_active AND kind = 'earning'
      ORDER BY sort_order, code
    LOOP
      CONTINUE WHEN NOT public.payroll_component_applies(v_comp, v_emp.id, v_emp.department_id, v_contract_type, v_seniority);

      IF v_comp.calc_method = 'base_salary' THEN
        v_amount := v_base_pay; v_basis := v_base; v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method = 'fixed' THEN
        v_amount := v_comp.rate_value; v_basis := v_comp.rate_value; v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method IN ('percent_of_base', 'percent_of_gross') THEN
        v_basis := CASE WHEN v_comp.calc_method = 'percent_of_gross' THEN v_gross ELSE v_base_pay END;
        v_amount := round(v_basis * v_comp.rate_value / 100.0, 2); v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method = 'worked_hours' THEN
        v_rate := CASE WHEN v_comp.rate_value > 0 THEN v_comp.rate_value ELSE v_hourly END;
        v_basis := v_regular_hours; v_amount := round(v_regular_hours * v_rate, 2);
      ELSIF v_comp.calc_method = 'overtime_hours' THEN
        v_rate := CASE WHEN v_comp.rate_value > 0 THEN v_comp.rate_value ELSE v_ot_mult END;
        v_basis := v_ot_hours; v_amount := round(v_ot_hours * v_hourly * v_rate, 2);
      ELSE
        CONTINUE;
      END IF;

      v_amount := round(public.payroll_clamp(v_amount, v_comp.min_amount, v_comp.max_amount), 0);
      CONTINUE WHEN v_amount = 0 AND v_comp.calc_method <> 'base_salary';

      INSERT INTO public.payslip_lines (payslip_id, company_id, component_id, code, label, kind, calc_method,
                                        rate_applied, basis_amount, amount, sort_order, is_hidden, show_base_rate)
      VALUES (v_payslip_id, v_run.company_id, v_comp.id, v_comp.code, v_comp.name, v_comp.kind, v_comp.calc_method,
              v_rate, v_basis, v_amount, v_comp.sort_order, NOT v_comp.show_on_payslip, v_comp.show_base_rate);

      v_gross := v_gross + v_amount;
      IF v_comp.subject_to_igr THEN v_taxable := v_taxable + v_amount; END IF;
      IF v_comp.subject_to_retirement THEN v_retirement := v_retirement + v_amount; END IF;
    END LOOP;

    -- Deductions and employer contributions (in display order; IGR uses the
    -- taxable base minus the deductions flagged "reduces taxable base" seen before it).
    FOR v_comp IN
      SELECT * FROM public.payroll_components
      WHERE company_id = v_run.company_id AND deleted_at IS NULL AND is_active
        AND kind IN ('deduction', 'employer_contribution')
      ORDER BY (calc_method = 'igr_progressive'), sort_order, code
    LOOP
      CONTINUE WHEN NOT public.payroll_component_applies(v_comp, v_emp.id, v_emp.department_id, v_contract_type, v_seniority);

      IF v_comp.calc_method = 'fixed' THEN
        v_amount := v_comp.rate_value; v_basis := v_comp.rate_value; v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method IN ('percent_of_base', 'percent_of_gross') THEN
        v_basis := CASE v_comp.percent_basis
          WHEN 'base' THEN v_base_pay
          WHEN 'gross' THEN v_gross
          WHEN 'taxable' THEN v_taxable
          WHEN 'retirement' THEN v_retirement
          ELSE CASE WHEN v_comp.calc_method = 'percent_of_base' THEN v_base_pay ELSE v_gross END
        END;
        v_amount := round(v_basis * v_comp.rate_value / 100.0, 2); v_rate := v_comp.rate_value;
      ELSIF v_comp.calc_method = 'igr_progressive' THEN
        v_basis := greatest(0, v_taxable - v_taxable_reduction);
        v_amount := public.calculate_igr_tax(v_run.company_id, v_basis);
        v_rate := CASE WHEN v_basis > 0 THEN round(v_amount * 100.0 / v_basis, 4) ELSE 0 END;
      ELSE
        CONTINUE;
      END IF;

      v_amount := round(public.payroll_clamp(v_amount, v_comp.min_amount, v_comp.max_amount), 0);
      CONTINUE WHEN v_amount = 0;

      INSERT INTO public.payslip_lines (payslip_id, company_id, component_id, code, label, kind, calc_method,
                                        rate_applied, basis_amount, amount, sort_order, is_hidden, show_base_rate)
      VALUES (v_payslip_id, v_run.company_id, v_comp.id, v_comp.code, v_comp.name, v_comp.kind, v_comp.calc_method,
              v_rate, v_basis, v_amount, v_comp.sort_order, NOT v_comp.show_on_payslip, v_comp.show_base_rate);

      IF v_comp.kind = 'deduction' THEN
        v_deduct := v_deduct + v_amount;
        IF v_comp.reduces_taxable_base THEN v_taxable_reduction := v_taxable_reduction + v_amount; END IF;
      ELSE
        v_employer := v_employer + v_amount;
      END IF;
    END LOOP;

    UPDATE public.payslips SET
      gross_amount = v_gross, deduction_amount = v_deduct, net_amount = v_gross - v_deduct,
      employer_contribution_amount = v_employer, status = 'calculated'
    WHERE id = v_payslip_id;

    v_count := v_count + 1;
    v_total_gross := v_total_gross + v_gross;
    v_total_deduct := v_total_deduct + v_deduct;
    v_total_net := v_total_net + (v_gross - v_deduct);
    v_total_employer := v_total_employer + v_employer;
  END LOOP;

  UPDATE public.payroll_runs SET
    status = 'calculated', employee_count = v_count, total_gross = v_total_gross,
    total_deductions = v_total_deduct, total_net = v_total_net,
    total_employer_cost = v_total_gross + v_total_employer, calculated_at = now()
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$function$;
