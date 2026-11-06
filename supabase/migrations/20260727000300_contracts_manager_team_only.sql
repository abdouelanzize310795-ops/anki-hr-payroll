-- Managers could read every contract of the company (salaries included);
-- they now see the contracts of the employees they manage only.

drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts for select to authenticated using (
  deleted_at is null
  and (
    public.can_manage_company(company_id)
    or public.is_platform_admin()
    or public.manages_employee(employee_id)
    or exists (select 1 from public.employees e where e.id = contracts.employee_id and e.user_id = auth.uid())
  )
);
