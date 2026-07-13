-- Provision staff accounts (HR / manager) for a company + allow employer to assign HR role

CREATE OR REPLACE FUNCTION public.prevent_role_self_elevation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor public.app_role;
BEGIN
  -- No JWT (migrations / service role): allow
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  v_actor := public.current_user_role();

  -- Employer may provision employee / manager / hr for their company
  IF v_actor = 'employer'
     AND NEW.company_id IS NOT NULL
     AND public.can_manage_company(NEW.company_id)
     AND NEW.role IN ('employee', 'manager', 'hr')
     AND (OLD.role IS NULL OR OLD.role IN ('employee', 'manager', 'hr'))
  THEN
    RETURN NEW;
  END IF;

  -- HR may provision employee / manager for their company (not other HR)
  IF v_actor = 'hr'
     AND NEW.company_id IS NOT NULL
     AND public.can_manage_company(NEW.company_id)
     AND NEW.role IN ('employee', 'manager')
     AND (OLD.role IS NULL OR OLD.role IN ('employee', 'manager'))
  THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Seul un administrateur plateforme peut modifier le role';
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Seul un administrateur plateforme peut reaffecter l entreprise';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_staff_account(
  p_company_id uuid,
  p_email text,
  p_full_name text,
  p_role public.app_role DEFAULT 'hr'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_password text;
  v_full_name text;
  v_created boolean := false;
  v_actor public.app_role;
  v_existing_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF p_role NOT IN ('hr', 'manager') THEN
    RAISE EXCEPTION 'Role staff invalide (hr ou manager)';
  END IF;

  IF NOT (public.is_platform_admin() OR public.can_manage_company(p_company_id)) THEN
    RAISE EXCEPTION 'Droit insuffisant';
  END IF;

  v_actor := public.current_user_role();
  IF p_role = 'hr' AND v_actor NOT IN ('employer', 'platform_admin') THEN
    RAISE EXCEPTION 'Seul l employeur peut creer un compte RH';
  END IF;

  v_email := lower(trim(coalesce(p_email, '')));
  IF v_email = '' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'E-mail invalide';
  END IF;

  v_full_name := nullif(trim(coalesce(p_full_name, '')), '');

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_existing_role
    FROM public.profiles
    WHERE id = v_user_id AND deleted_at IS NULL;

    IF v_existing_role = 'platform_admin' THEN
      RAISE EXCEPTION 'Cet e-mail appartient a un administrateur plateforme';
    END IF;

    IF v_existing_role = 'employer'
       AND EXISTS (
         SELECT 1 FROM public.profiles
         WHERE id = v_user_id AND company_id IS DISTINCT FROM p_company_id
       )
    THEN
      RAISE EXCEPTION 'Cet e-mail est deja utilise par un employeur';
    END IF;

    UPDATE public.profiles
    SET
      email = v_email,
      full_name = coalesce(v_full_name, full_name),
      role = p_role,
      company_id = p_company_id,
      is_active = true,
      updated_at = now(),
      deleted_at = NULL
    WHERE id = v_user_id;

    IF NOT FOUND THEN
      INSERT INTO public.profiles (id, email, full_name, role, company_id, is_active)
      VALUES (v_user_id, v_email, v_full_name, p_role, p_company_id, true);
    END IF;

    UPDATE auth.users
    SET
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', p_role::text),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'linked', true,
      'user_id', v_user_id,
      'email', v_email,
      'role', p_role,
      'temporary_password', null
    );
  END IF;

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
      'role', p_role::text
    ),
    jsonb_build_object('full_name', v_full_name),
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

  INSERT INTO public.profiles (id, email, full_name, role, company_id, is_active)
  VALUES (v_user_id, v_email, v_full_name, p_role, p_company_id, true)
  ON CONFLICT (id) DO UPDATE
  SET
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    role = excluded.role,
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
    'role', p_role,
    'temporary_password', v_password
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_staff_account(uuid, text, text, public.app_role) TO authenticated;
