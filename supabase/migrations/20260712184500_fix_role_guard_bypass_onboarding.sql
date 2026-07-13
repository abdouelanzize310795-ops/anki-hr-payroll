-- Restore bypass used by create_company_with_owner (promote signup → employer)

CREATE OR REPLACE FUNCTION public.prevent_role_self_elevation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor public.app_role;
BEGIN
  -- Explicit bypass for trusted SECURITY DEFINER RPCs (company onboarding, etc.)
  IF current_setting('ankibapay.bypass_role_guard', true) = '1' THEN
    RETURN NEW;
  END IF;

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
