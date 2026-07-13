-- Monthly subscription expiry: block without deleting data + J-5 employer/HR notifications

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_expiry_notified_at timestamptz;

UPDATE public.companies
SET
  subscription_starts_at = COALESCE(subscription_starts_at, subscription_paid_at, approved_at, created_at, now()),
  subscription_ends_at = now() + interval '1 month',
  subscription_expiry_notified_at = NULL
WHERE deleted_at IS NULL
  AND approval_status = 'approved'
  AND subscription_status = 'active'
  AND (
    subscription_ends_at IS NULL
    OR subscription_ends_at < now() + interval '7 days'
  );

CREATE OR REPLACE FUNCTION public.notify_company_roles(
  p_company_id uuid,
  p_roles public.app_role[],
  p_kind text,
  p_title text,
  p_body text,
  p_href text DEFAULT '/subscriptions'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND is_active = true
      AND role = ANY (p_roles)
  LOOP
    INSERT INTO public.app_notifications (user_id, company_id, kind, title, body, href)
    VALUES (r.id, p_company_id, p_kind, p_title, p_body, p_href);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_company_subscriptions(p_company_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c RECORD;
  v_days int;
  v_end date;
BEGIN
  FOR c IN
    SELECT id, legal_name, subscription_ends_at, subscription_plan
    FROM public.companies
    WHERE deleted_at IS NULL
      AND approval_status = 'approved'
      AND subscription_status = 'active'
      AND subscription_ends_at IS NOT NULL
      AND subscription_ends_at < now()
      AND (p_company_id IS NULL OR id = p_company_id)
  LOOP
    UPDATE public.companies
    SET
      subscription_status = 'expired',
      is_active = false,
      updated_at = now()
    WHERE id = c.id;

    PERFORM public.notify_company_roles(
      c.id,
      ARRAY['employer', 'hr']::public.app_role[],
      'subscription',
      'Abonnement expiré',
      'Votre abonnement AnkibaPay est terminé. Les données sont conservées, mais l’accès est bloqué jusqu’au renouvellement.',
      '/subscriptions'
    );
  END LOOP;

  FOR c IN
    SELECT id, legal_name, subscription_ends_at, subscription_plan, subscription_expiry_notified_at
    FROM public.companies
    WHERE deleted_at IS NULL
      AND approval_status = 'approved'
      AND subscription_status = 'active'
      AND subscription_ends_at IS NOT NULL
      AND subscription_ends_at >= now()
      AND subscription_ends_at <= now() + interval '5 days'
      AND (
        subscription_expiry_notified_at IS NULL
        OR subscription_expiry_notified_at < (subscription_ends_at - interval '5 days')
      )
      AND (p_company_id IS NULL OR id = p_company_id)
  LOOP
    v_end := (c.subscription_ends_at AT TIME ZONE 'UTC')::date;
    v_days := GREATEST(CEIL(EXTRACT(EPOCH FROM (c.subscription_ends_at - now())) / 86400.0)::int, 0);

    PERFORM public.notify_company_roles(
      c.id,
      ARRAY['employer', 'hr']::public.app_role[],
      'subscription',
      'Abonnement bientôt terminé',
      format(
        'Votre abonnement %s expire dans %s jour(s) (le %s). Renouvelez pour éviter le blocage — aucune donnée ne sera supprimée.',
        COALESCE(c.subscription_plan, 'AnkibaPay'),
        v_days,
        to_char(v_end, 'DD/MM/YYYY')
      ),
      '/subscriptions'
    );

    UPDATE public.companies
    SET subscription_expiry_notified_at = now(), updated_at = now()
    WHERE id = c.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_company_subscriptions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_company_roles(uuid, public.app_role[], text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_company(
  p_company_id uuid,
  p_action text,
  p_note text DEFAULT NULL
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
      v_new_end := v_company.subscription_ends_at + interval '1 month';
    ELSE
      v_new_end := now() + interval '1 month';
    END IF;

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

  IF v_company.approval_status = 'approved'
     AND v_company.subscription_status = 'active'
     AND v_company.subscription_ends_at IS NOT NULL
     AND v_company.subscription_ends_at > now() + interval '5 days'
  THEN
    UPDATE public.companies
    SET
      subscription_plan = v_plan,
      payment_method = coalesce(payment_method, v_method),
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;
    RETURN v_company;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.mark_company_subscription_paid(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_company(uuid, text, text) TO authenticated;
