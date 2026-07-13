-- CDC compliance: legal params, progressive IGR, medical leave, audit, seats, etc.

-- ——— Legal / fiscal parameters (platform defaults, overridable per company) ———
CREATE TABLE IF NOT EXISTS public.igr_tax_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  -- NULL company_id = platform default
  min_amount numeric(14,2) NOT NULL DEFAULT 0,
  max_amount numeric(14,2), -- NULL = no upper bound
  rate_percent numeric(6,3) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS igr_brackets_scope_uidx
  ON public.igr_tax_brackets (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), sort_order, effective_from);

CREATE TABLE IF NOT EXISTS public.legal_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  -- NULL = platform defaults
  smig_amount numeric(14,2) NOT NULL DEFAULT 55000,
  retirement_employee_rate numeric(6,3) NOT NULL DEFAULT 3,
  retirement_employer_rate numeric(6,3) NOT NULL DEFAULT 0,
  annual_leave_days int NOT NULL DEFAULT 24,
  maternity_weeks int NOT NULL DEFAULT 8,
  professional_expense_abatement_pct numeric(6,3) NOT NULL DEFAULT 30,
  social_deduction_cap_pct numeric(6,3) NOT NULL DEFAULT 6,
  housing_benefit_pct numeric(6,3) NOT NULL DEFAULT 10,
  other_benefit_pct numeric(6,3) NOT NULL DEFAULT 7,
  notes text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_parameters_scope_uidx
  ON public.legal_parameters (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);

CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'KM',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS public_holidays_uidx
  ON public.public_holidays (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), holiday_date, country_code);

-- Seed platform IGR brackets (Loi de Finances 2006 — paramétrable)
INSERT INTO public.igr_tax_brackets (company_id, min_amount, max_amount, rate_percent, sort_order)
SELECT NULL, v.min_a, v.max_a, v.rate, v.ord
FROM (VALUES
  (0::numeric, 150000::numeric, 0::numeric, 10),
  (150001, 500000, 5, 20),
  (500001, 1000000, 10, 30),
  (1000001, 1500000, 15, 40),
  (1500001, 2500000, 20, 50),
  (2500001, 3500000, 25, 60),
  (3500001, NULL, 30, 70)
) AS v(min_a, max_a, rate, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.igr_tax_brackets WHERE company_id IS NULL);

INSERT INTO public.legal_parameters (company_id)
SELECT NULL
WHERE NOT EXISTS (SELECT 1 FROM public.legal_parameters WHERE company_id IS NULL);

-- ——— Audit trail ———
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_company_idx ON public.audit_logs (company_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR (company_id IS NOT NULL AND public.can_manage_company(company_id))
);

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_company_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, summary, metadata)
  VALUES (p_company_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, text, jsonb) TO authenticated;

-- ——— Medical leave attachment ———
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS medical_status text;

-- medical_status: null | pending | justified | rejected

-- ——— Tasks estimated duration ———
ALTER TABLE public.hr_tasks
  ADD COLUMN IF NOT EXISTS estimated_minutes int;

-- ——— Training mandatory / certificate expiry ———
ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false;

ALTER TABLE public.training_enrollments
  ADD COLUMN IF NOT EXISTS certificate_expires_on date;

-- ——— Payroll component flags ———
ALTER TABLE public.payroll_components
  ADD COLUMN IF NOT EXISTS subject_to_igr boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS subject_to_retirement boolean NOT NULL DEFAULT true;

-- Extend calc_method via text already used — add igr_progressive usage in engine

-- Update default components: retraite 3%, IGR progressive
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

  INSERT INTO public.payroll_components (
    company_id, code, name, kind, calc_method, rate_value, is_system, sort_order,
    subject_to_igr, subject_to_retirement, is_taxable
  )
  VALUES
    (p_company_id, 'SALAIRE_BASE', 'Salaire de base', 'earning', 'base_salary', 0, true, 10, true, true, true),
    (p_company_id, 'HS_BONUS', 'H.S. / Bonus spéciale', 'earning', 'overtime_hours', 0, false, 20, true, true, true),
    (p_company_id, 'ALLOCATION', 'Allocation', 'earning', 'fixed', 0, false, 30, true, true, true),
    (p_company_id, 'ANCIENNETE', 'Prime d''ancienneté', 'earning', 'fixed', 0, false, 40, true, true, true),
    (p_company_id, 'TRANSPORT', 'Transport', 'earning', 'fixed', 0, false, 50, true, true, true),
    (p_company_id, 'LOGEMENT', 'Prime de logement', 'earning', 'fixed', 0, false, 60, true, true, true),
    (p_company_id, 'RENDEMENT', 'Prime de rendement', 'earning', 'fixed', 0, false, 70, true, true, true),
    (p_company_id, 'EXCEPTIONNELLE', 'Prime exceptionnelle', 'earning', 'fixed', 0, false, 80, true, true, true),
    (p_company_id, 'AVANCE', 'Avance sur salaire', 'deduction', 'fixed', 0, false, 100, false, false, false),
    (p_company_id, 'CAISSE_RETRAITE', 'Caisse de retraite (part salariale)', 'deduction', 'percent_of_gross', 3, true, 110, false, false, false),
    (p_company_id, 'IGR', 'I.G.R. / Taxe sur les salaires', 'deduction', 'igr_progressive', 0, true, 120, false, false, false),
    (p_company_id, 'COTIS_PAT', 'Cotisation patronale (paramétrable)', 'employer_contribution', 'percent_of_gross', 0, false, 210, false, false, false)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- Migrate legacy codes if present
  UPDATE public.payroll_components
  SET name = 'Caisse de retraite (part salariale)', rate_value = CASE WHEN rate_value = 0 THEN 3 ELSE rate_value END, code = 'CAISSE_RETRAITE'
  WHERE company_id = p_company_id AND code = 'COTIS_SAL' AND deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.payroll_components c2
      WHERE c2.company_id = p_company_id AND c2.code = 'CAISSE_RETRAITE' AND c2.deleted_at IS NULL
    );

  UPDATE public.payroll_components
  SET name = 'I.G.R. / Taxe sur les salaires', calc_method = 'igr_progressive', code = 'IGR'
  WHERE company_id = p_company_id AND code = 'IMPOT' AND deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.payroll_components c2
      WHERE c2.company_id = p_company_id AND c2.code = 'IGR' AND c2.deleted_at IS NULL
    );
END;
$$;

-- Progressive IGR (Loi finances style brackets)
CREATE OR REPLACE FUNCTION public.calculate_igr_tax(
  p_company_id uuid,
  p_taxable_base numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tax numeric := 0;
  v_bracket RECORD;
  v_slice numeric;
  v_lower numeric;
  v_use_company boolean;
BEGIN
  IF COALESCE(p_taxable_base, 0) <= 0 THEN RETURN 0; END IF;

  v_use_company := EXISTS (SELECT 1 FROM public.igr_tax_brackets WHERE company_id = p_company_id);

  FOR v_bracket IN
    SELECT * FROM public.igr_tax_brackets
    WHERE (v_use_company AND company_id = p_company_id)
       OR ((NOT v_use_company) AND company_id IS NULL)
    ORDER BY sort_order, min_amount
  LOOP
    v_lower := CASE WHEN v_bracket.min_amount <= 0 THEN 0 ELSE v_bracket.min_amount - 1 END;
    v_slice := GREATEST(
      LEAST(p_taxable_base, COALESCE(v_bracket.max_amount, p_taxable_base)) - v_lower,
      0
    );
    v_tax := v_tax + round(v_slice * v_bracket.rate_percent / 100.0, 2);
  END LOOP;

  RETURN COALESCE(v_tax, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_igr_tax(uuid, numeric) TO authenticated;

-- Seat limit helper
CREATE OR REPLACE FUNCTION public.company_plan_seat_limit(p_plan text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_plan, 'pro'))
    WHEN 'starter' THEN 25
    WHEN 'pro' THEN 500
    WHEN 'enterprise' THEN 1000000
    ELSE 100
  END;
$$;

CREATE OR REPLACE FUNCTION public.assert_company_can_add_employee(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan text;
  v_limit int;
  v_count int;
BEGIN
  SELECT subscription_plan INTO v_plan
  FROM public.companies WHERE id = p_company_id AND deleted_at IS NULL;

  v_limit := public.company_plan_seat_limit(v_plan);

  SELECT COUNT(*) INTO v_count
  FROM public.employees
  WHERE company_id = p_company_id
    AND deleted_at IS NULL
    AND status IN ('active', 'onboarding', 'on_leave');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite d''abonnement atteinte (% employés pour le plan %). Passez à une offre supérieure.', v_limit, COALESCE(v_plan, 'aucun');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_company_can_add_employee(uuid) TO authenticated;

-- RLS for legal tables
ALTER TABLE public.igr_tax_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS igr_brackets_select ON public.igr_tax_brackets;
CREATE POLICY igr_brackets_select ON public.igr_tax_brackets FOR SELECT TO authenticated
USING (company_id IS NULL OR public.belongs_to_company(company_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS igr_brackets_write ON public.igr_tax_brackets;
CREATE POLICY igr_brackets_write ON public.igr_tax_brackets FOR ALL TO authenticated
USING (public.is_platform_admin() OR (company_id IS NOT NULL AND public.can_manage_company(company_id)))
WITH CHECK (public.is_platform_admin() OR (company_id IS NOT NULL AND public.can_manage_company(company_id)));

DROP POLICY IF EXISTS legal_params_select ON public.legal_parameters;
CREATE POLICY legal_params_select ON public.legal_parameters FOR SELECT TO authenticated
USING (company_id IS NULL OR public.belongs_to_company(company_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS legal_params_write ON public.legal_parameters;
CREATE POLICY legal_params_write ON public.legal_parameters FOR ALL TO authenticated
USING (public.is_platform_admin() OR (company_id IS NOT NULL AND public.can_manage_company(company_id)))
WITH CHECK (public.is_platform_admin() OR (company_id IS NOT NULL AND public.can_manage_company(company_id)));

DROP POLICY IF EXISTS holidays_select ON public.public_holidays;
CREATE POLICY holidays_select ON public.public_holidays FOR SELECT TO authenticated
USING (company_id IS NULL OR public.belongs_to_company(company_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS holidays_write ON public.public_holidays;
CREATE POLICY holidays_write ON public.public_holidays FOR ALL TO authenticated
USING (public.is_platform_admin() OR (company_id IS NOT NULL AND public.can_manage_company(company_id)))
WITH CHECK (public.is_platform_admin() OR (company_id IS NOT NULL AND public.can_manage_company(company_id)));
