-- Accept M'Vola or Poketra as subscription payment method

DROP FUNCTION IF EXISTS public.mark_company_subscription_paid(uuid, text);

CREATE OR REPLACE FUNCTION public.mark_company_subscription_paid(
  p_company_id uuid,
  p_plan text DEFAULT 'pro',
  p_payment_method text DEFAULT 'mvola'
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company public.companies;
  v_plan text := lower(trim(coalesce(p_plan, 'pro')));
  v_method text := lower(trim(coalesce(p_payment_method, 'mvola')));
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF v_plan NOT IN ('starter', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'Plan invalide';
  END IF;

  IF v_method NOT IN ('mvola', 'poketra') THEN
    RAISE EXCEPTION 'Mode de paiement invalide (mvola ou poketra)';
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

  IF v_company.approval_status = 'approved' AND v_company.subscription_status = 'active' THEN
    UPDATE public.companies
    SET
      subscription_plan = v_plan,
      subscription_paid_at = coalesce(subscription_paid_at, now()),
      payment_method = coalesce(payment_method, v_method),
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
    payment_method = v_method,
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

GRANT EXECUTE ON FUNCTION public.mark_company_subscription_paid(uuid, text, text) TO authenticated;
