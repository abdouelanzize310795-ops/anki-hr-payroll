-- Montant exact de l'abonnement, figé au moment où le code de paiement est généré.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_seats int,
  ADD COLUMN IF NOT EXISTS payment_amount numeric(14,2);

-- Monthly price per employee in KMF; NULL means quoted individually.
CREATE OR REPLACE FUNCTION public.company_plan_price(p_plan text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_plan, ''))
    WHEN 'starter' THEN 2500
    WHEN 'pro' THEN 4500
    ELSE NULL
  END::numeric;
$$;

create or replace function public.protect_company_billing_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_platform_admin() then
    if new.approval_status is distinct from old.approval_status
       or new.is_active is distinct from old.is_active
       or new.rejection_reason is distinct from old.rejection_reason
       or new.subscription_status is distinct from old.subscription_status
       or new.subscription_plan is distinct from old.subscription_plan
       or new.subscription_starts_at is distinct from old.subscription_starts_at
       or new.subscription_ends_at is distinct from old.subscription_ends_at
       or new.subscription_paid_at is distinct from old.subscription_paid_at
       or new.payment_reference is distinct from old.payment_reference
       or new.payment_method is distinct from old.payment_method
       or new.payment_seats is distinct from old.payment_seats
       or new.payment_amount is distinct from old.payment_amount
    then
      raise exception 'Seul l’administrateur plateforme peut modifier l’abonnement, l’approbation ou l’activation de l’entreprise';
    end if;
  end if;
  return new;
end;
$$;

DROP FUNCTION IF EXISTS public.mark_company_subscription_paid(uuid, text, text);

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

  RETURN v_company;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_company_subscription_paid(uuid, text, text, int) TO authenticated;
