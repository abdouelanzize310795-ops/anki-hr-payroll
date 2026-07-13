-- Allow employers/HR to attach employee profiles during account provisioning.
CREATE OR REPLACE FUNCTION public.prevent_role_self_elevation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Platform admin can change anything
  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Employer/HR may provision or re-link an employee account for their company
  IF NEW.role = 'employee'
     AND (OLD.role IS NULL OR OLD.role = 'employee')
     AND NEW.company_id IS NOT NULL
     AND public.can_manage_company(NEW.company_id)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Seul un administrateur plateforme peut modifier le rôle';
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Seul un administrateur plateforme peut réaffecter l''entreprise';
  END IF;

  RETURN NEW;
END;
$$;
