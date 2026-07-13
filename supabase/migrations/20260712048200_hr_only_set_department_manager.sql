-- Only HR (or platform admin) may assign department managers
CREATE OR REPLACE FUNCTION public.set_department_manager(
  p_department_id uuid,
  p_manager_employee_id uuid
)
RETURNS departments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dept public.departments;
  v_mgr public.employees;
  v_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;

  SELECT * INTO v_dept FROM public.departments
  WHERE id = p_department_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Departement introuvable'; END IF;

  v_role := public.current_user_role();
  IF NOT (
    public.is_platform_admin()
    OR (
      v_role = 'hr'
      AND public.can_manage_company(v_dept.company_id)
    )
  ) THEN
    RAISE EXCEPTION 'Seul le compte RH peut assigner un manager de departement';
  END IF;

  IF p_manager_employee_id IS NULL THEN
    UPDATE public.departments SET manager_employee_id = NULL, updated_at = now()
    WHERE id = p_department_id RETURNING * INTO v_dept;
    RETURN v_dept;
  END IF;

  SELECT * INTO v_mgr FROM public.employees
  WHERE id = p_manager_employee_id
    AND company_id = v_dept.company_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manager introuvable dans cette entreprise'; END IF;

  UPDATE public.departments
  SET manager_employee_id = p_manager_employee_id, updated_at = now()
  WHERE id = p_department_id
  RETURNING * INTO v_dept;

  UPDATE public.employees
  SET department_id = v_dept.id, updated_at = now()
  WHERE id = p_manager_employee_id
    AND (department_id IS DISTINCT FROM v_dept.id);

  IF v_mgr.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'manager', company_id = v_dept.company_id, updated_at = now()
    WHERE id = v_mgr.user_id
      AND role NOT IN ('employer', 'hr', 'platform_admin');
  END IF;

  RETURN v_dept;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_department_manager(uuid, uuid) TO authenticated;
