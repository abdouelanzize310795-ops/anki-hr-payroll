-- Historique des paiements d'abonnement et reçus.
CREATE SEQUENCE IF NOT EXISTS public.subscription_receipt_seq;

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  reference text,
  plan text,
  payment_method text,
  seats int,
  expected_amount numeric(14,2),
  received_amount numeric(14,2),
  period_start timestamptz,
  period_end timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  receipt_number text UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by uuid
);
CREATE INDEX IF NOT EXISTS subscription_payments_company_idx ON public.subscription_payments (company_id, created_at DESC);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
-- Read-only for the app: rows change only through the functions below.
DROP POLICY IF EXISTS subscription_payments_select ON public.subscription_payments;
CREATE POLICY subscription_payments_select ON public.subscription_payments FOR SELECT TO authenticated USING (
  public.is_platform_admin()
  OR (company_id = public.current_company_id() AND public.current_user_role() IN ('employer', 'hr'))
);
GRANT SELECT ON public.subscription_payments TO authenticated;

-- A new code replaces any earlier unpaid one.
CREATE OR REPLACE FUNCTION public.record_subscription_payment(p_company public.companies)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.subscription_payments SET status = 'cancelled'
  WHERE company_id = p_company.id AND status = 'pending';
  INSERT INTO public.subscription_payments (company_id, reference, plan, payment_method, seats, expected_amount)
  VALUES (p_company.id, p_company.payment_reference, p_company.subscription_plan, p_company.payment_method,
          p_company.payment_seats, p_company.payment_amount);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_subscription_payment(public.companies) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.mark_company_subscription_paid(
  p_company_id uuid,
  p_plan text DEFAULT 'pro',
  p_payment_method text DEFAULT 'mvola',
  p_declared_seats int DEFAULT NULL
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
  v_active int;
  v_seats int;
  v_price numeric;
  v_limit int;
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

  IF v_company.approval_status = 'approved'
     AND v_company.subscription_status = 'active'
     AND v_company.subscription_ends_at IS NOT NULL
     AND v_company.subscription_ends_at > now() + interval '5 days'
  THEN
    -- A paid period keeps its plan: otherwise Pro could be had for the Starter price.
    IF v_plan IS DISTINCT FROM lower(v_company.subscription_plan) AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Le changement de formule se fait au renouvellement, à partir de 5 jours avant la fin de votre période (%). Besoin plus tôt ? Contactez le support.', to_char(v_company.subscription_ends_at, 'DD/MM/YYYY');
    END IF;
    UPDATE public.companies
    SET
      subscription_plan = v_plan,
      payment_method = coalesce(payment_method, v_method),
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;
    RETURN v_company;
  END IF;

  -- Billed seats: active employees, or more if the company declares more
  -- (a new company has no employees yet). Never fewer than the active ones.
  SELECT count(*)::int INTO v_active FROM public.employees
  WHERE company_id = p_company_id AND deleted_at IS NULL AND status = 'active';
  v_seats := greatest(v_active, coalesce(p_declared_seats, 0), 1);
  v_limit := public.company_plan_seat_limit(v_plan);
  IF v_seats > v_limit THEN
    RAISE EXCEPTION 'Le plan % est limité à % employés. Choisissez un plan supérieur.', v_plan, v_limit;
  END IF;
  v_price := public.company_plan_price(v_plan);

  v_code := public.generate_mvola_payment_code();

  IF v_company.approval_status = 'approved'
     AND v_company.subscription_status = 'active'
     AND v_company.subscription_ends_at IS NOT NULL
     AND v_company.subscription_ends_at > now()
  THEN
    UPDATE public.companies
    SET
      subscription_plan = v_plan,
      subscription_paid_at = now(),
      payment_reference = v_code,
      payment_method = v_method,
      payment_seats = v_seats,
      payment_amount = v_seats * v_price,
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;
    PERFORM public.record_subscription_payment(v_company);
    RETURN v_company;
  END IF;

  UPDATE public.companies
  SET
    subscription_plan = v_plan,
    subscription_status = 'pending',
    subscription_paid_at = now(),
    payment_reference = v_code,
    payment_method = v_method,
    payment_seats = v_seats,
    payment_amount = v_seats * v_price,
    approval_status = CASE
      WHEN approval_status = 'rejected' THEN approval_status
      ELSE 'pending_approval'::public.company_approval_status
    END,
    is_active = false,
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = p_company_id
  RETURNING * INTO v_company;

  PERFORM public.record_subscription_payment(v_company);

  RETURN v_company;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_review_company(uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_review_company(
  p_company_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_received_amount numeric DEFAULT NULL
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company public.companies;
  v_action text := lower(trim(p_action));
  v_new_end timestamptz;
  v_period_start timestamptz;
  v_payment_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Réservé à l’administrateur plateforme';
  END IF;

  SELECT * INTO v_company
  FROM public.companies
  WHERE id = p_company_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entreprise introuvable';
  END IF;

  IF v_action = 'approve' THEN
    IF v_company.subscription_paid_at IS NULL AND v_company.subscription_status = 'none' THEN
      RAISE EXCEPTION 'L’abonnement n’a pas encore été payé';
    END IF;

    IF v_company.subscription_ends_at IS NOT NULL AND v_company.subscription_ends_at > now() THEN
      v_period_start := v_company.subscription_ends_at;
    ELSE
      v_period_start := now();
    END IF;
    v_new_end := v_period_start + interval '1 month';

    IF p_received_amount IS NOT NULL AND p_received_amount < 0 THEN
      RAISE EXCEPTION 'Montant reçu invalide';
    END IF;

    SELECT id INTO v_payment_id FROM public.subscription_payments
    WHERE company_id = p_company_id AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1;

    -- Codes generated before this table existed have no row yet.
    IF v_payment_id IS NULL THEN
      INSERT INTO public.subscription_payments (company_id, reference, plan, payment_method, seats, expected_amount)
      VALUES (p_company_id, v_company.payment_reference, v_company.subscription_plan, v_company.payment_method,
              v_company.payment_seats, v_company.payment_amount)
      RETURNING id INTO v_payment_id;
    END IF;

    UPDATE public.subscription_payments
    SET status = 'confirmed',
        received_amount = coalesce(p_received_amount, expected_amount),
        period_start = v_period_start,
        period_end = v_new_end,
        receipt_number = 'R-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.subscription_receipt_seq')::text, 6, '0'),
        confirmed_at = now(),
        confirmed_by = auth.uid()
    WHERE id = v_payment_id;

    UPDATE public.companies
    SET
      approval_status = 'approved',
      is_active = true,
      subscription_status = 'active',
      subscription_starts_at = CASE
        WHEN subscription_status = 'active' AND subscription_starts_at IS NOT NULL
          THEN subscription_starts_at
        ELSE now()
      END,
      subscription_ends_at = v_new_end,
      subscription_expiry_notified_at = NULL,
      approved_at = coalesce(approved_at, now()),
      approved_by = auth.uid(),
      rejection_reason = NULL,
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;

    PERFORM public.write_audit_log(
      p_company_id, 'approve', 'company', p_company_id,
      'Activation / renouvellement abonnement (1 mois)',
      jsonb_build_object('ends_at', v_company.subscription_ends_at)
    );

  ELSIF v_action = 'reject' THEN
    UPDATE public.subscription_payments
    SET status = 'rejected', note = nullif(trim(coalesce(p_note, '')), '')
    WHERE company_id = p_company_id AND status = 'pending';

    UPDATE public.companies
    SET
      approval_status = 'rejected',
      is_active = false,
      subscription_status = CASE
        WHEN subscription_status = 'none' THEN 'none'
        ELSE 'cancelled'
      END,
      approved_at = NULL,
      approved_by = auth.uid(),
      rejection_reason = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;

  ELSE
    RAISE EXCEPTION 'Action invalide: %', p_action;
  END IF;

  RETURN v_company;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_company(uuid, text, text, numeric) TO authenticated;
