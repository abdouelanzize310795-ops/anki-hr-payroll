-- M'Vola Comores: unique payment reference for subscription activation

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_method text;

CREATE UNIQUE INDEX IF NOT EXISTS companies_payment_reference_uidx
  ON public.companies (payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_mvola_payment_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := 'ANKI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    SELECT EXISTS (
      SELECT 1 FROM public.companies WHERE payment_reference = v_code
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- Choose plan → generate unique M'Vola transfer code → await platform admin activation
CREATE OR REPLACE FUNCTION public.mark_company_subscription_paid(
  p_company_id uuid,
  p_plan text DEFAULT 'pro'
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company public.companies;
  v_plan text := lower(trim(coalesce(p_plan, 'pro')));
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF v_plan NOT IN ('starter', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'Plan invalide';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR (
      public.current_company_id() = p_company_id
      AND public.current_user_role() IN ('employer', 'hr')
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO v_company
  FROM public.companies
  WHERE id = p_company_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entreprise introuvable';
  END IF;

  IF v_company.approval_status = 'rejected' THEN
    RAISE EXCEPTION 'Cette entreprise a été refusée';
  END IF;

  -- Already active: allow plan change without regenerating payment code
  IF v_company.approval_status = 'approved' AND v_company.subscription_status = 'active' THEN
    UPDATE public.companies
    SET
      subscription_plan = v_plan,
      subscription_paid_at = coalesce(subscription_paid_at, now()),
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;
    RETURN v_company;
  END IF;

  v_code := coalesce(v_company.payment_reference, public.generate_mvola_payment_code());

  UPDATE public.companies
  SET
    subscription_plan = v_plan,
    subscription_status = 'pending',
    subscription_paid_at = coalesce(subscription_paid_at, now()),
    payment_reference = v_code,
    payment_method = 'mvola',
    approval_status = CASE
      WHEN approval_status = 'approved' THEN approval_status
      ELSE 'pending_approval'::public.company_approval_status
    END,
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = p_company_id
  RETURNING * INTO v_company;

  RETURN v_company;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_company_subscription_paid(uuid, text) TO authenticated;
