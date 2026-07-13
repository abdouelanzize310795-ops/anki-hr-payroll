-- Provision employee login when contract becomes active.
-- Creates auth.users + links employees.user_id + profiles (role employee).

CREATE OR REPLACE FUNCTION public.provision_employee_account(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $$
DECLARE
  v_emp public.employees;
  v_user_id uuid;
  v_email text;
  v_password text;
  v_full_name text;
  v_created boolean := false;
  v_existing_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT * INTO v_emp
  FROM public.employees
  WHERE id = p_employee_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employé introuvable';
  END IF;

  IF NOT (
    public.can_manage_company(v_emp.company_id)
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Droit insuffisant pour créer le compte employé';
  END IF;

  v_email := lower(trim(coalesce(v_emp.email, '')));
  IF v_email = '' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Un e-mail valide est requis sur la fiche employé pour créer le compte';
  END IF;

  v_full_name := trim(both from (coalesce(v_emp.first_name, '') || ' ' || coalesce(v_emp.last_name, '')));

  -- Already linked
  IF v_emp.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      company_id = coalesce(company_id, v_emp.company_id),
      full_name = coalesce(nullif(full_name, ''), nullif(v_full_name, ''), full_name),
      role = CASE WHEN role = 'platform_admin' THEN role ELSE 'employee' END,
      is_active = true,
      updated_at = now()
    WHERE id = v_emp.user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'linked', true,
      'user_id', v_emp.user_id,
      'email', v_email,
      'temporary_password', null
    );
  END IF;

  -- Existing auth user with same email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_existing_role
    FROM public.profiles
    WHERE id = v_user_id AND deleted_at IS NULL;

    IF v_existing_role IN ('employer', 'hr', 'platform_admin', 'manager') THEN
      RAISE EXCEPTION 'Cet e-mail est déjà utilisé par un compte gestionnaire';
    END IF;

    -- Ensure no other employee already owns this user
    IF EXISTS (
      SELECT 1 FROM public.employees
      WHERE user_id = v_user_id AND id <> p_employee_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cet e-mail est déjà lié à un autre employé';
    END IF;

    UPDATE public.employees
    SET user_id = v_user_id, updated_at = now()
    WHERE id = p_employee_id;

    INSERT INTO public.profiles (id, email, full_name, role, company_id, is_active)
    VALUES (v_user_id, v_email, nullif(v_full_name, ''), 'employee', v_emp.company_id, true)
    ON CONFLICT (id) DO UPDATE
    SET
      email = excluded.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      role = 'employee',
      company_id = excluded.company_id,
      is_active = true,
      updated_at = now(),
      deleted_at = NULL;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'linked', true,
      'user_id', v_user_id,
      'email', v_email,
      'temporary_password', null
    );
  END IF;

  -- Create new auth user
  v_user_id := gen_random_uuid();
  v_password := 'Ap-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    is_sso_user,
    is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'role', 'employee'
    ),
    jsonb_build_object('full_name', nullif(v_full_name, '')),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  UPDATE public.employees
  SET user_id = v_user_id, updated_at = now()
  WHERE id = p_employee_id;

  -- handle_new_user trigger may have inserted profile; upsert to be safe
  INSERT INTO public.profiles (id, email, full_name, role, company_id, is_active)
  VALUES (v_user_id, v_email, nullif(v_full_name, ''), 'employee', v_emp.company_id, true)
  ON CONFLICT (id) DO UPDATE
  SET
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    role = 'employee',
    company_id = excluded.company_id,
    is_active = true,
    updated_at = now(),
    deleted_at = NULL;

  v_created := true;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'linked', true,
    'user_id', v_user_id,
    'email', v_email,
    'temporary_password', v_password
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_employee_account(uuid) TO authenticated;

-- Restrict full company row to managers; employees use letterhead helper instead.
DROP POLICY IF EXISTS companies_select ON public.companies;
CREATE POLICY companies_select
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.can_manage_company(id)
      OR public.is_platform_admin()
      OR (
        -- Managers need company context for team screens
        public.current_company_id() = id
        AND public.current_user_role() = 'manager'
      )
    )
  );

-- Public letterhead fields for contracts / payslips (no bank / billing secrets)
CREATE OR REPLACE FUNCTION public.get_company_letterhead(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_company_id IS NULL THEN NULL
    WHEN NOT (
      public.belongs_to_company(p_company_id)
      OR public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.company_id = p_company_id
          AND e.user_id = auth.uid()
          AND e.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.contracts c
        JOIN public.employees e ON e.id = c.employee_id
        WHERE c.company_id = p_company_id
          AND e.user_id = auth.uid()
          AND c.deleted_at IS NULL
      )
    ) THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'legal_name', c.legal_name,
        'trade_name', c.trade_name,
        'logo_url', c.logo_url,
        'address_line1', c.address_line1,
        'city', c.city,
        'region', c.region,
        'phone', c.phone,
        'email', c.email,
        'tax_id', c.tax_id,
        'registration_number', c.registration_number,
        'currency_code', c.currency_code
      )
      FROM public.companies c
      WHERE c.id = p_company_id AND c.deleted_at IS NULL
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_letterhead(uuid) TO authenticated;
