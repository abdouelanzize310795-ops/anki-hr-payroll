-- Company onboarding: payment then platform-admin approval

CREATE TYPE public.company_approval_status AS ENUM (
  'pending_payment',
  'pending_approval',
  'approved',
  'rejected'
);

CREATE TYPE public.company_subscription_status AS ENUM (
  'none',
  'pending',
  'active',
  'cancelled'
);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS approval_status public.company_approval_status NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN IF NOT EXISTS subscription_status public.company_subscription_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_plan text,
  ADD COLUMN IF NOT EXISTS subscription_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Existing demo tenants stay fully usable
UPDATE public.companies
SET
  approval_status = 'approved',
  subscription_status = 'active',
  subscription_plan = COALESCE(subscription_plan, 'pro'),
  subscription_paid_at = COALESCE(subscription_paid_at, created_at),
  approved_at = COALESCE(approved_at, created_at),
  is_active = true
WHERE deleted_at IS NULL
  AND approval_status = 'pending_payment';

-- New companies start inactive until paid + approved
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_legal_name text,
  p_trade_name text DEFAULT NULL,
  p_sector text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address_line1 text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_country_code character DEFAULT 'KM',
  p_currency_code character DEFAULT 'KMF',
  p_bank_name text DEFAULT NULL,
  p_bank_account text DEFAULT NULL,
  p_bank_rib text DEFAULT NULL
)
RETURNS companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company public.companies;
  v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT * INTO v_profile FROM public.profiles
  WHERE id = v_uid AND deleted_at IS NULL FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;

  IF v_profile.company_id IS NOT NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Vous appartenez déjà à une entreprise';
  END IF;

  IF length(trim(p_legal_name)) < 2 THEN
    RAISE EXCEPTION 'La raison sociale est obligatoire';
  END IF;

  INSERT INTO public.companies (
    legal_name, trade_name, sector, tax_id, email, phone,
    address_line1, city, region, country_code, currency_code,
    bank_name, bank_account, bank_rib, created_by,
    is_active, approval_status, subscription_status
  ) VALUES (
    trim(p_legal_name), nullif(trim(p_trade_name), ''), nullif(trim(p_sector), ''),
    nullif(trim(p_tax_id), ''), nullif(trim(p_email), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_address_line1), ''), nullif(trim(p_city), ''), nullif(trim(p_region), ''),
    coalesce(p_country_code, 'KM'), coalesce(p_currency_code, 'KMF'),
    nullif(trim(p_bank_name), ''), nullif(trim(p_bank_account), ''), nullif(trim(p_bank_rib), ''),
    v_uid,
    false,
    'pending_payment',
    'none'
  )
  RETURNING * INTO v_company;

  INSERT INTO public.branches (company_id, name, city, region, is_headquarters)
  VALUES (
    v_company.id,
    'Siège',
    v_company.city,
    v_company.region,
    true
  );

  PERFORM set_config('ankibapay.bypass_role_guard', '1', true);

  UPDATE public.profiles
  SET
    company_id = v_company.id,
    role = CASE
      WHEN v_profile.role = 'platform_admin' THEN v_profile.role
      ELSE 'employer'::public.app_role
    END,
    full_name = coalesce(v_profile.full_name, split_part(v_profile.email, '@', 1))
  WHERE id = v_uid;

  RETURN v_company;
END;
$$;

-- Employer (or admin) marks subscription paid (demo checkout)
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

  UPDATE public.companies
  SET
    subscription_plan = v_plan,
    subscription_status = 'pending',
    subscription_paid_at = now(),
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

-- Platform admin approve / reject
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

    UPDATE public.companies
    SET
      approval_status = 'approved',
      is_active = true,
      subscription_status = 'active',
      approved_at = now(),
      approved_by = auth.uid(),
      rejection_reason = NULL,
      updated_at = now()
    WHERE id = p_company_id
    RETURNING * INTO v_company;

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

GRANT EXECUTE ON FUNCTION public.mark_company_subscription_paid(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_company(uuid, text, text) TO authenticated;
