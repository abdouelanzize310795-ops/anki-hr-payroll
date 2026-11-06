-- Employees could read their colleagues' salaries, payslips, contracts and leave,
-- and edit any leave request of their company: the broad *_tenant_select /
-- *_tenant_all policies of the reconstructed core are OR'ed with the stricter
-- per-table policies, so the stricter ones had no effect.
-- Members now see their own rows; employer/HR (can_manage_company) see the
-- company, managers see their team. Mobile RPCs are SECURITY DEFINER and keep
-- working unchanged.

-- Tables that already have a strict select policy: drop the broad one.
drop policy if exists employees_tenant_select on public.employees;
drop policy if exists contracts_tenant_select on public.contracts;
drop policy if exists payroll_runs_tenant_select on public.payroll_runs;
drop policy if exists payslips_tenant_select on public.payslips;
drop policy if exists hr_documents_tenant_select on public.hr_documents;

-- Employer/HR only (their *_tenant_write "for all" policy already grants select).
drop policy if exists transfer_batches_tenant_select on public.transfer_batches;
drop policy if exists transfer_lines_tenant_select on public.transfer_lines;
drop policy if exists candidates_tenant_select on public.candidates;
drop policy if exists payroll_components_tenant_select on public.payroll_components;

-- Payslip lines: employer/HR, or the employee who owns the payslip.
drop policy if exists payslip_lines_tenant_select on public.payslip_lines;
drop policy if exists payslip_lines_select on public.payslip_lines;
create policy payslip_lines_select on public.payslip_lines for select to authenticated using (
  public.can_manage_company(company_id)
  or exists (
    select 1
      from public.payslips ps
      join public.employees e on e.id = ps.employee_id
     where ps.id = payslip_lines.payslip_id
       and ps.deleted_at is null
       and e.user_id = auth.uid()
  )
);

-- Own rows, the manager's team, or employer/HR.
drop policy if exists leave_balances_tenant_select on public.leave_balances;
drop policy if exists leave_balances_select on public.leave_balances;
create policy leave_balances_select on public.leave_balances for select to authenticated using (
  public.can_manage_company(company_id)
  or public.manages_employee(employee_id)
  or exists (select 1 from public.employees e where e.id = leave_balances.employee_id and e.user_id = auth.uid())
);

drop policy if exists performance_reviews_tenant_select on public.performance_reviews;
drop policy if exists performance_reviews_select on public.performance_reviews;
create policy performance_reviews_select on public.performance_reviews for select to authenticated using (
  public.can_manage_company(company_id)
  or public.manages_employee(employee_id)
  or exists (select 1 from public.employees e where e.id = performance_reviews.employee_id and e.user_id = auth.uid())
);

drop policy if exists training_enrollments_tenant_select on public.training_enrollments;
drop policy if exists training_enrollments_select on public.training_enrollments;
create policy training_enrollments_select on public.training_enrollments for select to authenticated using (
  public.can_manage_company(company_id)
  or public.manages_employee(employee_id)
  or exists (select 1 from public.employees e where e.id = training_enrollments.employee_id and e.user_id = auth.uid())
);

-- Leave requests: read own / team / company; create for oneself or one's team;
-- status changes go through transition_leave_request (SECURITY DEFINER), so
-- direct updates are reserved to employer/HR and leave reviewers.
drop policy if exists leave_requests_tenant_all on public.leave_requests;
drop policy if exists leave_requests_select on public.leave_requests;
drop policy if exists leave_requests_insert on public.leave_requests;
drop policy if exists leave_requests_update on public.leave_requests;
drop policy if exists leave_requests_delete on public.leave_requests;
create policy leave_requests_select on public.leave_requests for select to authenticated using (
  public.can_review_leave(company_id)
  or public.manages_employee(employee_id)
  or exists (select 1 from public.employees e where e.id = leave_requests.employee_id and e.user_id = auth.uid())
);
create policy leave_requests_insert on public.leave_requests for insert to authenticated with check (
  public.belongs_to_company(company_id)
  and (
    public.can_manage_company(company_id)
    or public.manages_employee(employee_id)
    or exists (
      select 1 from public.employees e
       where e.id = leave_requests.employee_id and e.company_id = leave_requests.company_id and e.user_id = auth.uid()
    )
  )
);
create policy leave_requests_update on public.leave_requests for update to authenticated
  using (public.can_review_leave(company_id))
  with check (public.can_review_leave(company_id));
create policy leave_requests_delete on public.leave_requests for delete to authenticated
  using (public.can_manage_company(company_id));

-- Attendance: clocking goes through SECURITY DEFINER functions; only employer/HR
-- create, correct or delete records directly (an employee must not rewrite
-- their own check-in time).
drop policy if exists attendance_records_tenant_all on public.attendance_records;
drop policy if exists attendance_insert on public.attendance_records;
drop policy if exists attendance_delete on public.attendance_records;
create policy attendance_insert on public.attendance_records for insert to authenticated
  with check (public.can_manage_company(company_id) or public.is_platform_admin());
create policy attendance_delete on public.attendance_records for delete to authenticated
  using (public.can_manage_company(company_id) or public.is_platform_admin());
drop policy if exists attendance_update on public.attendance_records;
create policy attendance_update on public.attendance_records for update to authenticated
  using (deleted_at is null and (public.can_manage_company(company_id) or public.is_platform_admin()))
  with check (public.can_manage_company(company_id) or public.is_platform_admin());
