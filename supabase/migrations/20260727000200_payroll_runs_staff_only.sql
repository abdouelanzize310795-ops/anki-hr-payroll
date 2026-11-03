-- Payroll runs carry company-wide totals (total gross/net, employer cost,
-- headcount): an employee could read the whole payroll mass through the runs
-- of their own payslips. Runs are now readable by employer/HR and the platform
-- admin only; employees get the period of their own payslips through
-- payslip_runs() below, without any total.

drop policy if exists payroll_runs_select on public.payroll_runs;
create policy payroll_runs_select on public.payroll_runs for select to authenticated using (
  deleted_at is null and (public.can_manage_company(company_id) or public.is_platform_admin())
);

create or replace function public.payslip_runs(p_payslip_ids uuid[])
returns table (
  payslip_id uuid,
  payroll_run_id uuid,
  label text,
  period_year integer,
  period_month integer,
  period_start date,
  period_end date,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select ps.id, r.id, r.label, r.period_year, r.period_month, r.period_start, r.period_end, r.status
    from public.payslips ps
    join public.payroll_runs r on r.id = ps.payroll_run_id and r.deleted_at is null
    join public.employees e on e.id = ps.employee_id
   where ps.id = any(p_payslip_ids)
     and ps.deleted_at is null
     and (e.user_id = auth.uid() or public.can_manage_company(ps.company_id) or public.is_platform_admin());
$$;

revoke all on function public.payslip_runs(uuid[]) from public, anon;
grant execute on function public.payslip_runs(uuid[]) to authenticated;
