-- Mshahara: payslip templates (block layouts), configurable payroll rules
-- (conditions, floor/ceiling, tax bases, display) and a rubric library.

-- ---------------------------------------------------------------------------
-- Payslip templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payslip_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies (id) ON DELETE CASCADE, -- NULL = Mshahara model
  name text NOT NULL,
  description text,
  layout jsonb NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  base_template_id uuid REFERENCES public.payslip_templates (id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (jsonb_typeof(layout -> 'blocks') = 'array')
);

ALTER TABLE public.payslip_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payslip_templates_read ON public.payslip_templates;
CREATE POLICY payslip_templates_read ON public.payslip_templates FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.belongs_to_company(company_id));
DROP POLICY IF EXISTS payslip_templates_write ON public.payslip_templates;
CREATE POLICY payslip_templates_write ON public.payslip_templates FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.can_manage_company(company_id))
  WITH CHECK (company_id IS NOT NULL AND public.can_manage_company(company_id) AND NOT is_system);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslip_templates TO authenticated;

INSERT INTO public.payslip_templates (id, company_id, name, description, is_system, layout) VALUES
('00000000-0000-4000-a000-000000000001', NULL, 'Classique',
 'Sobre et complet : en-tête entreprise, salarié, gains, retenues, charges patronales.', true,
 '{"theme":{"accent":"#0E4C56","font":"serif","density":"comfortable"},"blocks":[
   {"id":"b1","type":"company_header","options":{"showLogo":true,"align":"left"}},
   {"id":"b2","type":"title_period","options":{}},
   {"id":"b3","type":"employee_info","options":{"showBank":false}},
   {"id":"b4","type":"net_highlight","options":{"style":"box"}},
   {"id":"b5","type":"earnings_table","options":{"showBaseRate":true,"hideZero":true}},
   {"id":"b6","type":"deductions_table","options":{"showBaseRate":true,"hideZero":true}},
   {"id":"b7","type":"employer_contributions","options":{"showBaseRate":true}},
   {"id":"b8","type":"legal_footer","options":{"text":"Document généré par Mshahara — les taux appliqués sont ceux paramétrés par l’employeur."}}
 ]}'::jsonb),
('00000000-0000-4000-a000-000000000002', NULL, 'Moderne',
 'Bandeau de couleur, net à payer très visible, mise en page aérée.', true,
 '{"theme":{"accent":"#0E4C56","font":"sans","density":"comfortable"},"blocks":[
   {"id":"b1","type":"company_header","options":{"showLogo":true,"align":"banner"}},
   {"id":"b2","type":"net_highlight","options":{"style":"banner"}},
   {"id":"b3","type":"title_period","options":{}},
   {"id":"b4","type":"employee_info","options":{"showBank":true}},
   {"id":"b5","type":"earnings_table","options":{"showBaseRate":false,"hideZero":true}},
   {"id":"b6","type":"deductions_table","options":{"showBaseRate":false,"hideZero":true}},
   {"id":"b7","type":"totals_summary","options":{}},
   {"id":"b8","type":"legal_footer","options":{"text":"Conservez ce bulletin sans limitation de durée."}}
 ]}'::jsonb),
('00000000-0000-4000-a000-000000000003', NULL, 'Compact',
 'Tient sur une demi-page : l’essentiel, sans charges patronales.', true,
 '{"theme":{"accent":"#16211F","font":"sans","density":"compact"},"blocks":[
   {"id":"b1","type":"company_header","options":{"showLogo":false,"align":"left"}},
   {"id":"b2","type":"employee_info","options":{"showBank":false}},
   {"id":"b3","type":"earnings_table","options":{"showBaseRate":false,"hideZero":true}},
   {"id":"b4","type":"deductions_table","options":{"showBaseRate":false,"hideZero":true}},
   {"id":"b5","type":"net_highlight","options":{"style":"line"}}
 ]}'::jsonb),
('00000000-0000-4000-a000-000000000004', NULL, 'Détaillé',
 'Tout en un : heures, cumuls de l’année, solde de congés, paiement, signatures.', true,
 '{"theme":{"accent":"#0E4C56","font":"serif","density":"comfortable"},"blocks":[
   {"id":"b1","type":"company_header","options":{"showLogo":true,"align":"left"}},
   {"id":"b2","type":"title_period","options":{}},
   {"id":"b3","type":"employee_info","options":{"showBank":false}},
   {"id":"b4","type":"hours_summary","options":{}},
   {"id":"b5","type":"earnings_table","options":{"showBaseRate":true,"hideZero":false}},
   {"id":"b6","type":"deductions_table","options":{"showBaseRate":true,"hideZero":false}},
   {"id":"b7","type":"employer_contributions","options":{"showBaseRate":true}},
   {"id":"b8","type":"net_highlight","options":{"style":"box"}},
   {"id":"b9","type":"ytd_totals","options":{}},
   {"id":"b10","type":"leave_balance","options":{}},
   {"id":"b11","type":"payment_info","options":{}},
   {"id":"b12","type":"signatures","options":{"left":"L’employeur","right":"Le salarié"}},
   {"id":"b13","type":"legal_footer","options":{"text":"Bulletin à conserver sans limitation de durée. Les taux sont ceux paramétrés par l’employeur."}}
 ]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payslip_template_id uuid REFERENCES public.payslip_templates (id) ON DELETE SET NULL;
UPDATE public.companies SET payslip_template_id = '00000000-0000-4000-a000-000000000001'
WHERE payslip_template_id IS NULL;
ALTER TABLE public.companies
  ALTER COLUMN payslip_template_id SET DEFAULT '00000000-0000-4000-a000-000000000001';

ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS template_snapshot jsonb;

-- ---------------------------------------------------------------------------
-- Rubric rules
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_components
  ADD COLUMN IF NOT EXISTS min_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS max_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS percent_basis text NOT NULL DEFAULT 'auto'
    CHECK (percent_basis IN ('auto', 'base', 'gross', 'taxable', 'retirement')),
  ADD COLUMN IF NOT EXISTS reduces_taxable_base boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_payslip boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_base_rate boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS cond_department_ids uuid[],
  ADD COLUMN IF NOT EXISTS cond_contract_types text[],
  ADD COLUMN IF NOT EXISTS cond_min_seniority_months integer CHECK (cond_min_seniority_months IS NULL OR cond_min_seniority_months >= 0),
  ADD COLUMN IF NOT EXISTS cond_employee_ids uuid[];

ALTER TABLE public.payslip_lines
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_base_rate boolean NOT NULL DEFAULT true;

-- Pension contribution is computed on the pension base and lowers the IGR base.
UPDATE public.payroll_components
SET percent_basis = 'retirement', reduces_taxable_base = true
WHERE code = 'CAISSE_RETRAITE' AND percent_basis = 'auto';

-- ---------------------------------------------------------------------------
-- Rubric library (drag & drop source)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_component_presets (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  kind public.payroll_component_kind NOT NULL,
  calc_method public.payroll_calc_method NOT NULL,
  rate_value numeric(14,4) NOT NULL DEFAULT 0,
  percent_basis text NOT NULL DEFAULT 'auto',
  subject_to_igr boolean NOT NULL DEFAULT true,
  subject_to_retirement boolean NOT NULL DEFAULT true,
  reduces_taxable_base boolean NOT NULL DEFAULT false,
  cond_min_seniority_months integer,
  sort_order integer NOT NULL DEFAULT 100
);
GRANT SELECT ON public.payroll_component_presets TO authenticated;

INSERT INTO public.payroll_component_presets
  (code, name, description, category, kind, calc_method, rate_value, percent_basis, subject_to_igr, subject_to_retirement, reduces_taxable_base, cond_min_seniority_months, sort_order)
VALUES
  ('PRIME_TRANSPORT', 'Prime de transport', 'Montant fixe chaque mois.', 'Primes', 'earning', 'fixed', 10000, 'auto', false, false, false, NULL, 50),
  ('PRIME_LOGEMENT', 'Prime de logement', 'Montant fixe chaque mois.', 'Primes', 'earning', 'fixed', 20000, 'auto', true, true, false, NULL, 60),
  ('PRIME_ANCIENNETE', 'Prime d’ancienneté', '% du salaire de base, à partir de 2 ans d’ancienneté.', 'Primes', 'earning', 'percent_of_base', 3, 'base', true, true, false, 24, 40),
  ('PRIME_RENDEMENT', 'Prime de rendement', 'Montant fixe, à ajuster selon les objectifs.', 'Primes', 'earning', 'fixed', 0, 'auto', true, true, false, NULL, 70),
  ('PRIME_RESPONSABILITE', 'Prime de responsabilité', '% du salaire de base (managers, chefs de service).', 'Primes', 'earning', 'percent_of_base', 10, 'base', true, true, false, NULL, 45),
  ('INDEMNITE_REPAS', 'Indemnité de repas', 'Montant fixe, non imposable.', 'Indemnités', 'earning', 'fixed', 15000, 'auto', false, false, false, NULL, 55),
  ('HEURES_SUP', 'Heures supplémentaires', 'Heures au-delà de la journée normale × majoration.', 'Temps', 'earning', 'overtime_hours', 0, 'auto', true, true, false, NULL, 30),
  ('AVANCE', 'Avance sur salaire', 'Montant fixe retenu.', 'Retenues', 'deduction', 'fixed', 0, 'auto', false, false, false, NULL, 100),
  ('CAISSE_RETRAITE', 'Caisse de retraite (salarié)', '% de la base retraite ; déduit de la base IGR.', 'Cotisations', 'deduction', 'percent_of_gross', 3, 'retirement', false, false, true, NULL, 110),
  ('MUTUELLE', 'Mutuelle santé', 'Montant fixe retenu chaque mois.', 'Cotisations', 'deduction', 'fixed', 5000, 'auto', false, false, false, NULL, 115),
  ('IGR', 'I.G.R. / Impôt sur le salaire', 'Barème progressif de l’entreprise sur la base imposable.', 'Impôts', 'deduction', 'igr_progressive', 0, 'auto', false, false, false, NULL, 120),
  ('COTIS_PAT', 'Cotisation patronale retraite', '% de la base retraite, payé par l’employeur.', 'Charges patronales', 'employer_contribution', 'percent_of_gross', 6, 'retirement', false, false, false, NULL, 210),
  ('ACCIDENT_TRAVAIL', 'Accidents du travail (employeur)', '% du brut, payé par l’employeur.', 'Charges patronales', 'employer_contribution', 'percent_of_gross', 1, 'gross', false, false, false, NULL, 220)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Rule helpers
-- ---------------------------------------------------------------------------
-- Does a rubric apply to this employee for this pay period?
CREATE OR REPLACE FUNCTION public.payroll_component_applies(
  p_comp public.payroll_components,
  p_employee_id uuid,
  p_department_id uuid,
  p_contract_type text,
  p_seniority_months integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (coalesce(cardinality(p_comp.cond_employee_ids), 0) = 0 OR p_employee_id = ANY (p_comp.cond_employee_ids))
     AND (coalesce(cardinality(p_comp.cond_department_ids), 0) = 0 OR p_department_id = ANY (p_comp.cond_department_ids))
     AND (coalesce(cardinality(p_comp.cond_contract_types), 0) = 0 OR p_contract_type = ANY (p_comp.cond_contract_types))
     AND (p_comp.cond_min_seniority_months IS NULL OR coalesce(p_seniority_months, 0) >= p_comp.cond_min_seniority_months);
$$;

CREATE OR REPLACE FUNCTION public.payroll_clamp(p_amount numeric, p_min numeric, p_max numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_amount, 0) = 0 THEN 0
    ELSE least(coalesce(p_max, p_amount), greatest(coalesce(p_min, p_amount), p_amount))
  END;
$$;

-- Defaults: pension lowers the IGR base.
CREATE OR REPLACE FUNCTION public.ensure_default_payroll_components(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payroll_components (
    company_id, code, name, kind, calc_method, rate_value, is_system, sort_order,
    subject_to_igr, subject_to_retirement, is_taxable, percent_basis, reduces_taxable_base
  )
  VALUES
    (p_company_id, 'SALAIRE_BASE', 'Salaire de base', 'earning', 'base_salary', 0, true, 10, true, true, true, 'auto', false),
    (p_company_id, 'HS_BONUS', 'H.S. / Bonus spéciale', 'earning', 'overtime_hours', 0, false, 20, true, true, true, 'auto', false),
    (p_company_id, 'TRANSPORT', 'Transport', 'earning', 'fixed', 0, false, 50, false, false, false, 'auto', false),
    (p_company_id, 'AVANCE', 'Avance sur salaire', 'deduction', 'fixed', 0, false, 100, false, false, false, 'auto', false),
    (p_company_id, 'CAISSE_RETRAITE', 'Caisse de retraite (part salariale)', 'deduction', 'percent_of_gross', 3, true, 110, false, false, false, 'retirement', true),
    (p_company_id, 'IGR', 'I.G.R. / Taxe sur les salaires', 'deduction', 'igr_progressive', 0, true, 120, false, false, false, 'auto', false),
    (p_company_id, 'COTIS_PAT', 'Cotisation patronale (paramétrable)', 'employer_contribution', 'percent_of_gross', 0, false, 210, false, false, false, 'retirement', false)
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- Payroll engine with conditions, floors/ceilings, tax bases and templates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  WHERE extract(isodow FROM d) < 6;
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

    SELECT coalesce(round(sum(least(a.worked_minutes::numeric / 60.0, v_std_hours)), 2), 0),
           coalesce(round(sum(greatest(a.worked_minutes::numeric / 60.0 - v_std_hours, 0)), 2), 0)
    INTO v_regular_hours, v_ot_hours
    FROM public.attendance_records a
    WHERE a.employee_id = v_emp.id AND a.company_id = v_run.company_id AND a.deleted_at IS NULL
      AND a.work_date BETWEEN v_run.period_start AND v_run.period_end
      AND a.status IN ('present', 'late', 'remote', 'half_day')
      AND coalesce(a.worked_minutes, 0) > 0;

    v_base_pay := CASE WHEN v_company_has_attendance AND v_expected_hours > 0
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

      v_amount := public.payroll_clamp(v_amount, v_comp.min_amount, v_comp.max_amount);
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

      v_amount := public.payroll_clamp(v_amount, v_comp.min_amount, v_comp.max_amount);
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
$$;

-- Trial payslip for one employee, without saving anything (rubric tester).
CREATE OR REPLACE FUNCTION public.preview_payslip(p_employee_id uuid, p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_run public.payroll_runs;
  v_result jsonb;
  v_start date := make_date(p_year, p_month, 1);
BEGIN
  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id AND deleted_at IS NULL;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Employé introuvable'; END IF;
  IF NOT public.can_manage_company(v_emp.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;

  BEGIN
    INSERT INTO public.payroll_runs (company_id, label, period_year, period_month, period_start, period_end, notes)
    VALUES (v_emp.company_id, 'Aperçu', p_year, p_month, v_start, (v_start + interval '1 month - 1 day')::date, 'preview')
    RETURNING * INTO v_run;
    PERFORM public.calculate_payroll_run(v_run.id);

    SELECT jsonb_build_object(
      'gross', p.gross_amount, 'deductions', p.deduction_amount, 'net', p.net_amount,
      'employer', p.employer_contribution_amount, 'worked_hours', p.worked_hours,
      'lines', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'code', l.code, 'label', l.label, 'kind', l.kind, 'basis', l.basis_amount,
          'rate', l.rate_applied, 'amount', l.amount, 'hidden', l.is_hidden) ORDER BY l.kind, l.sort_order)
        FROM public.payslip_lines l WHERE l.payslip_id = p.id), '[]'::jsonb)
    ) INTO v_result
    FROM public.payslips p WHERE p.payroll_run_id = v_run.id AND p.employee_id = p_employee_id;

    -- Undo everything done for the preview.
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'mshahara_preview_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'mshahara_preview_rollback' THEN RAISE; END IF;
  END;

  RETURN coalesce(v_result, jsonb_build_object('lines', '[]'::jsonb, 'net', 0, 'gross', 0, 'deductions', 0,
    'message', 'Aucun bulletin : salaire de base nul ou employé inactif.'));
END;
$$;

-- Persist rubric order from the drag & drop builder.
CREATE OR REPLACE FUNCTION public.reorder_payroll_components(p_company_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_company(p_company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.payroll_components c
  SET sort_order = x.ord * 10, updated_at = now()
  FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
  WHERE c.id = x.id AND c.company_id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_payslip(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_payroll_components(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_payslip(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_payroll_components(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_component_applies(public.payroll_components, uuid, uuid, text, integer) TO authenticated;
