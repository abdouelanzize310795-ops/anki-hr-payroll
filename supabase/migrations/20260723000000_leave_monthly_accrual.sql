-- Mshahara: leave accrual configured by the employer.
-- A leave type is either credited for the whole year ("annual") or earned month by
-- month ("monthly", e.g. 2.5 days per completed month = 30 days per year).
-- Unused days are carried over to the next year (optionally capped).

ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS accrual_mode text NOT NULL DEFAULT 'annual'
    CHECK (accrual_mode IN ('annual', 'monthly')),
  ADD COLUMN IF NOT EXISTS monthly_accrual_days numeric(5,2) NOT NULL DEFAULT 0
    CHECK (monthly_accrual_days BETWEEN 0 AND 31),
  ADD COLUMN IF NOT EXISTS max_carryover_days numeric(6,2)
    CHECK (max_carryover_days IS NULL OR max_carryover_days >= 0);

ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS accrued_months integer NOT NULL DEFAULT 0;

-- Paid leave ("CP") earns 2.5 days per month by default.
UPDATE public.leave_types
SET accrual_mode = 'monthly', monthly_accrual_days = 2.5, default_entitlement_days = 30
WHERE code = 'CP' AND accrual_mode = 'annual';

-- Number of months of year p_year that the employee has fully earned as of p_today.
-- A month counts once it is over; the hiring month counts if hired on or before the 15th.
CREATE OR REPLACE FUNCTION public.leave_earned_months(p_hire_date date, p_end_date date, p_year integer, p_today date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT count(*)::int
  FROM generate_series(make_date(p_year, 1, 1), make_date(p_year, 12, 1), interval '1 month') AS m(month_start)
  WHERE (m.month_start + interval '1 month')::date <= p_today              -- month completed
    AND (p_hire_date IS NULL OR p_hire_date <= m.month_start::date + 14)    -- hired by the 15th
    AND (p_end_date IS NULL OR p_end_date >= (m.month_start + interval '1 month - 1 day')::date);
$$;

-- Creates the balance if needed, then (re)computes it:
--   monthly types → entitled = rate × earned months (idempotent, recomputed on every call)
--   annual types  → entitled = default entitlement (set once)
--   new year      → unused days of the previous year are carried over (capped if configured)
CREATE OR REPLACE FUNCTION public.ensure_leave_balance(
  p_company_id uuid,
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year integer
)
RETURNS public.leave_balances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.leave_balances;
  v_type public.leave_types;
  v_emp public.employees;
  v_prev public.leave_balances;
  v_carry numeric := 0;
  v_months integer;
  v_today date := public.company_local_now()::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.belongs_to_company(p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO v_type FROM public.leave_types WHERE id = p_leave_type_id AND company_id = p_company_id;
  IF v_type.id IS NULL THEN RAISE EXCEPTION 'Type de congé introuvable'; END IF;
  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id AND company_id = p_company_id;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Employé introuvable'; END IF;

  SELECT * INTO v_row FROM public.leave_balances
  WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id AND year = p_year;

  IF v_row.id IS NULL THEN
    -- Carry over what is left from the previous year (cumulative leave).
    IF v_type.deducts_balance THEN
      SELECT * INTO v_prev FROM public.leave_balances
      WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id AND year = p_year - 1;
      IF v_prev.id IS NOT NULL THEN
        IF v_type.accrual_mode = 'monthly' THEN
          v_prev.entitled_days := v_type.monthly_accrual_days
            * public.leave_earned_months(v_emp.hire_date, v_emp.termination_date, p_year - 1, v_today);
        END IF;
        v_carry := greatest(0, v_prev.entitled_days + v_prev.carried_over_days - v_prev.used_days - v_prev.pending_days);
        IF v_type.max_carryover_days IS NOT NULL THEN
          v_carry := least(v_carry, v_type.max_carryover_days);
        END IF;
      END IF;
    END IF;

    INSERT INTO public.leave_balances (company_id, employee_id, leave_type_id, year, entitled_days, carried_over_days)
    VALUES (p_company_id, p_employee_id, p_leave_type_id, p_year,
            CASE WHEN v_type.accrual_mode = 'monthly' THEN 0 ELSE v_type.default_entitlement_days END,
            v_carry)
    ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;

    SELECT * INTO v_row FROM public.leave_balances
    WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id AND year = p_year;
  END IF;

  IF v_type.accrual_mode = 'monthly' THEN
    v_months := public.leave_earned_months(v_emp.hire_date, v_emp.termination_date, p_year, v_today);
    IF v_row.accrued_months IS DISTINCT FROM v_months
       OR v_row.entitled_days IS DISTINCT FROM v_type.monthly_accrual_days * v_months THEN
      UPDATE public.leave_balances
      SET entitled_days = v_type.monthly_accrual_days * v_months,
          accrued_months = v_months,
          updated_at = now()
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

-- Recomputes every balance of the current year (called by the periodic job and after
-- the employer changes a leave rule).
CREATE OR REPLACE FUNCTION public.run_leave_accruals(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := extract(year FROM public.company_local_now())::int;
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT e.company_id, e.id AS employee_id, lt.id AS leave_type_id
    FROM public.employees e
    JOIN public.leave_types lt ON lt.company_id = e.company_id AND lt.deleted_at IS NULL AND lt.is_active
    WHERE e.deleted_at IS NULL AND e.status IN ('active', 'on_leave', 'onboarding')
      AND (p_company_id IS NULL OR e.company_id = p_company_id)
      AND (lt.accrual_mode = 'monthly' OR lt.deducts_balance)
  LOOP
    PERFORM public.ensure_leave_balance(r.company_id, r.employee_id, r.leave_type_id, v_year);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Employer sets the accrual rule of a leave type.
CREATE OR REPLACE FUNCTION public.set_leave_type_accrual(
  p_leave_type_id uuid,
  p_accrual_mode text,
  p_monthly_accrual_days numeric,
  p_annual_days numeric,
  p_max_carryover_days numeric DEFAULT NULL
)
RETURNS public.leave_types
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.leave_types;
BEGIN
  SELECT * INTO v_type FROM public.leave_types WHERE id = p_leave_type_id AND deleted_at IS NULL;
  IF v_type.id IS NULL THEN RAISE EXCEPTION 'Type de congé introuvable'; END IF;
  IF NOT public.can_manage_company(v_type.company_id) THEN RAISE EXCEPTION 'Réservé aux RH et à l’employeur'; END IF;
  IF p_accrual_mode NOT IN ('annual', 'monthly') THEN RAISE EXCEPTION 'Mode inconnu'; END IF;

  UPDATE public.leave_types
  SET accrual_mode = p_accrual_mode,
      monthly_accrual_days = CASE WHEN p_accrual_mode = 'monthly' THEN coalesce(p_monthly_accrual_days, 0) ELSE 0 END,
      default_entitlement_days = CASE WHEN p_accrual_mode = 'monthly'
                                      THEN round(coalesce(p_monthly_accrual_days, 0) * 12, 2)
                                      ELSE coalesce(p_annual_days, 0) END,
      max_carryover_days = p_max_carryover_days,
      updated_at = now()
  WHERE id = p_leave_type_id
  RETURNING * INTO v_type;

  -- Annual types: align this year's entitlement with the new rule.
  IF p_accrual_mode = 'annual' THEN
    UPDATE public.leave_balances
    SET entitled_days = v_type.default_entitlement_days, accrued_months = 0, updated_at = now()
    WHERE leave_type_id = v_type.id AND year = extract(year FROM public.company_local_now())::int;
  END IF;
  PERFORM public.run_leave_accruals(v_type.company_id);

  INSERT INTO public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, summary)
  VALUES (v_type.company_id, auth.uid(), 'leave_type.accrual_updated', 'leave_type', v_type.id,
          v_type.name || ' : ' || CASE WHEN p_accrual_mode = 'monthly'
            THEN v_type.monthly_accrual_days || ' j/mois' ELSE v_type.default_entitlement_days || ' j/an' END);
  RETURN v_type;
END;
$$;

-- Mobile: list leave types through ensure_leave_balance (accrual + carry-over).
CREATE OR REPLACE FUNCTION public.mobile_list_leave_types()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees;
  v_year int := extract(year FROM public.company_local_now())::int;
  v_type record;
BEGIN
  v_emp := public.mobile_require_employee();
  PERFORM set_config('ankibapay.bypass_role_guard', '1', true);

  INSERT INTO public.leave_types
    (company_id, code, name, is_paid, requires_approval, deducts_balance, default_entitlement_days,
     color, sort_order, accrual_mode, monthly_accrual_days)
  SELECT v_emp.company_id, d.code, d.name, d.is_paid, true, d.deducts, d.days, d.color, d.sort, d.mode, d.rate
  FROM (VALUES
    ('CP', 'Congés payés', true, true, 30, '#0F766E', 10, 'monthly', 2.5),
    ('MAL', 'Congé maladie', true, false, 0, '#DC2626', 20, 'annual', 0),
    ('MAT', 'Congé maternité / paternité', true, false, 0, '#DB2777', 30, 'annual', 0),
    ('EXC', 'Congé exceptionnel', true, false, 0, '#7C3AED', 40, 'annual', 0),
    ('SS', 'Congé sans solde', false, false, 0, '#64748B', 50, 'annual', 0)
  ) AS d(code, name, is_paid, deducts, days, color, sort, mode, rate)
  WHERE NOT EXISTS (SELECT 1 FROM public.leave_types lt WHERE lt.company_id = v_emp.company_id)
  ON CONFLICT (company_id, code) DO NOTHING;

  FOR v_type IN
    SELECT id FROM public.leave_types
    WHERE company_id = v_emp.company_id AND deleted_at IS NULL AND is_active
  LOOP
    PERFORM public.ensure_leave_balance(v_emp.company_id, v_emp.id, v_type.id, v_year);
  END LOOP;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', lt.id,
      'code', lt.code,
      'name', lt.name,
      'color', lt.color,
      'is_paid', lt.is_paid,
      'deducts_balance', lt.deducts_balance,
      'accrual_mode', lt.accrual_mode,
      'monthly_accrual_days', lt.monthly_accrual_days,
      'accrued_months', coalesce(lb.accrued_months, 0),
      'carried_over_days', coalesce(lb.carried_over_days, 0),
      'entitled_days', coalesce(lb.entitled_days, 0) + coalesce(lb.carried_over_days, 0),
      'used_days', coalesce(lb.used_days, 0),
      'pending_days', coalesce(lb.pending_days, 0),
      'remaining_days',
        coalesce(lb.entitled_days, 0) + coalesce(lb.carried_over_days, 0)
        - coalesce(lb.used_days, 0) - coalesce(lb.pending_days, 0)
    ) ORDER BY lt.sort_order, lt.name)
    FROM public.leave_types lt
    LEFT JOIN public.leave_balances lb
      ON lb.leave_type_id = lt.id AND lb.employee_id = v_emp.id AND lb.year = v_year
    WHERE lt.company_id = v_emp.company_id AND lt.deleted_at IS NULL AND lt.is_active
  ), '[]'::jsonb);
END;
$$;

-- Default leave types created by the web app also earn paid leave monthly.
CREATE OR REPLACE FUNCTION public.ensure_default_leave_types(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.belongs_to_company(p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  INSERT INTO public.leave_types
    (company_id, code, name, is_paid, requires_approval, deducts_balance, default_entitlement_days,
     color, sort_order, accrual_mode, monthly_accrual_days)
  VALUES
    (p_company_id, 'CP', 'Congés payés', true, true, true, 30, '#0F766E', 10, 'monthly', 2.5),
    (p_company_id, 'MAL', 'Congé maladie', true, true, false, 0, '#DC2626', 20, 'annual', 0),
    (p_company_id, 'MAT', 'Congé maternité / paternité', true, true, false, 0, '#DB2777', 30, 'annual', 0),
    (p_company_id, 'EXC', 'Congé exceptionnel', true, true, false, 0, '#7C3AED', 40, 'annual', 0),
    (p_company_id, 'SS', 'Congé sans solde', false, true, false, 0, '#64748B', 50, 'annual', 0)
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.run_leave_accruals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_leave_type_accrual(uuid, text, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_leave_type_accrual(uuid, text, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_earned_months(date, date, integer, date) TO authenticated;

-- Bring existing balances in line with the new rules.
SELECT public.run_leave_accruals();
