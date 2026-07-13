-- Platform admin provisions tenants without becoming company owner
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
  v_is_admin boolean := public.is_platform_admin();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT * INTO v_profile FROM public.profiles
  WHERE id = v_uid AND deleted_at IS NULL FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;

  IF v_profile.company_id IS NOT NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Vous appartenez déjà à une entreprise';
  END IF;

  IF length(trim(p_legal_name)) < 2 THEN
    RAISE EXCEPTION 'La raison sociale est obligatoire';
  END IF;

  INSERT INTO public.companies (
    legal_name, trade_name, sector, tax_id, email, phone,
    address_line1, city, region, country_code, currency_code,
    bank_name, bank_account, bank_rib, created_by,
    is_active, approval_status, subscription_status, subscription_plan,
    subscription_paid_at, approved_at, approved_by
  ) VALUES (
    trim(p_legal_name), nullif(trim(p_trade_name), ''), nullif(trim(p_sector), ''),
    nullif(trim(p_tax_id), ''), nullif(trim(p_email), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_address_line1), ''), nullif(trim(p_city), ''), nullif(trim(p_region), ''),
    coalesce(p_country_code, 'KM'), coalesce(p_currency_code, 'KMF'),
    nullif(trim(p_bank_name), ''), nullif(trim(p_bank_account), ''), nullif(trim(p_bank_rib), ''),
    v_uid,
    CASE WHEN v_is_admin THEN true ELSE false END,
    CASE WHEN v_is_admin THEN 'approved'::public.company_approval_status ELSE 'pending_payment'::public.company_approval_status END,
    CASE WHEN v_is_admin THEN 'active'::public.company_subscription_status ELSE 'none'::public.company_subscription_status END,
    CASE WHEN v_is_admin THEN 'pro' ELSE NULL END,
    CASE WHEN v_is_admin THEN now() ELSE NULL END,
    CASE WHEN v_is_admin THEN now() ELSE NULL END,
    CASE WHEN v_is_admin THEN v_uid ELSE NULL END
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

  IF NOT v_is_admin THEN
    PERFORM set_config('ankibapay.bypass_role_guard', '1', true);
    UPDATE public.profiles
    SET
      company_id = v_company.id,
      role = 'employer'::public.app_role,
      full_name = coalesce(v_profile.full_name, split_part(v_profile.email, '@', 1))
    WHERE id = v_uid;
  END IF;

  RETURN v_company;
END;
$$;

UPDATE public.profiles p
SET company_id = NULL
WHERE p.role = 'platform_admin'
  AND p.company_id IS NOT NULL
  AND p.deleted_at IS NULL;
