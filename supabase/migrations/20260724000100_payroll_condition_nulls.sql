-- A condition never matches an employee whose attribute is missing (no department,
-- no contract): coalesce NULL comparisons to false.
CREATE OR REPLACE FUNCTION public.payroll_component_applies(
  p_comp public.payroll_components,
  p_employee_id uuid,
  p_department_id uuid,
  p_contract_type text,
  p_seniority_months integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
       (coalesce(cardinality(p_comp.cond_employee_ids), 0) = 0 OR coalesce(p_employee_id = ANY (p_comp.cond_employee_ids), false))
   AND (coalesce(cardinality(p_comp.cond_department_ids), 0) = 0 OR coalesce(p_department_id = ANY (p_comp.cond_department_ids), false))
   AND (coalesce(cardinality(p_comp.cond_contract_types), 0) = 0 OR coalesce(p_contract_type = ANY (p_comp.cond_contract_types), false))
   AND (p_comp.cond_min_seniority_months IS NULL OR coalesce(p_seniority_months, 0) >= p_comp.cond_min_seniority_months),
  false);
$$;
