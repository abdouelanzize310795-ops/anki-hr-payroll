-- Mshahara: reconstructed core schema.
-- The original module migrations (companies, contracts, leave, attendance, payroll,
-- transfers, tasks, documents, recruitment, training, performance, assets) were only
-- applied on the former hosted project and committed as placeholders. This file
-- rebuilds those tables, helpers and RPCs from the application code so that the
-- following migrations can run on a fresh database.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table if not exists public.countries (
  code text primary key,
  name text not null,
  name_fr text not null,
  phone_code text,
  is_active boolean not null default true
);

create table if not exists public.currencies (
  code text primary key,
  name text not null,
  symbol text not null,
  decimal_places integer not null default 2,
  is_active boolean not null default true
);

insert into public.countries (code, name, name_fr, phone_code) values
  ('KM', 'Comoros', 'Comores', '+269'),
  ('MG', 'Madagascar', 'Madagascar', '+261'),
  ('YT', 'Mayotte', 'Mayotte', '+262'),
  ('FR', 'France', 'France', '+33'),
  ('TZ', 'Tanzania', 'Tanzanie', '+255'),
  ('KE', 'Kenya', 'Kenya', '+254')
on conflict (code) do nothing;

insert into public.currencies (code, name, symbol, decimal_places) values
  ('KMF', 'Franc comorien', 'KMF', 0),
  ('MGA', 'Ariary', 'Ar', 0),
  ('EUR', 'Euro', '€', 2),
  ('USD', 'Dollar US', '$', 2),
  ('TZS', 'Shilling tanzanien', 'TSh', 0),
  ('KES', 'Shilling kényan', 'KSh', 2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Companies, branches, departments
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  sector text,
  tax_id text,
  registration_number text,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country_code text not null default 'KM' references public.countries (code),
  currency_code text not null default 'KMF' references public.currencies (code),
  bank_name text,
  bank_account text,
  bank_rib text,
  payroll_periodicity text not null default 'monthly'
    check (payroll_periodicity in ('monthly', 'biweekly', 'weekly')),
  work_days_per_week numeric(4,1) not null default 5,
  standard_hours_per_day numeric(5,2) not null default 8,
  logo_url text,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  code text,
  address_line1 text,
  city text,
  region text,
  is_headquarters boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  name text not null,
  code text,
  manager_employee_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_company_id_fkey') then
    alter table public.profiles
      add constraint profiles_company_id_fkey
      foreign key (company_id) references public.companies (id) on delete set null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Tenant helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select company_id from public.profiles
  where id = auth.uid() and deleted_at is null;
$$;

create or replace function public.belongs_to_company(target uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or (target is not null and target = public.current_company_id());
$$;

create or replace function public.can_manage_company(target uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or (
      target is not null
      and target = public.current_company_id()
      and public.current_user_role() in ('employer', 'hr')
    );
$$;

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  employee_number text,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  date_of_birth date,
  gender text not null default 'undisclosed'
    check (gender in ('female', 'male', 'other', 'undisclosed')),
  national_id text,
  job_title text,
  hire_date date not null default current_date,
  termination_date date,
  status text not null default 'active'
    check (status in ('active', 'onboarding', 'on_leave', 'suspended', 'terminated')),
  base_salary numeric(14,2) not null default 0,
  currency_code text not null default 'KMF' references public.currencies (code),
  bank_name text,
  bank_account text,
  bank_rib text,
  address_line1 text,
  city text,
  region text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists employees_company_idx on public.employees (company_id) where deleted_at is null;
create index if not exists employees_user_idx on public.employees (user_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'departments_manager_employee_id_fkey') then
    alter table public.departments
      add constraint departments_manager_employee_id_fkey
      foreign key (manager_employee_id) references public.employees (id) on delete set null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  contract_number text,
  contract_type text not null default 'cdi'
    check (contract_type in ('cdi', 'cdd', 'essai', 'stage', 'consultant')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'active', 'expired', 'cancelled')),
  job_title text not null,
  department_id uuid references public.departments (id) on delete set null,
  branch_id uuid references public.branches (id) on delete set null,
  start_date date not null,
  end_date date,
  trial_end_date date,
  base_salary numeric(14,2) not null default 0,
  currency_code text not null default 'KMF' references public.currencies (code),
  work_days_per_week numeric(4,1) not null default 5,
  hours_per_week numeric(5,2) not null default 40,
  benefits text,
  clauses text,
  cancellation_reason text,
  cancelled_at timestamptz,
  sent_at timestamptz,
  signed_at timestamptz,
  signed_by_employee_name text,
  signed_by_employer_name text,
  signature_otp_hint text,
  activated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'leave_request_status') then
    create type public.leave_request_status as enum
      ('draft', 'pending', 'approved', 'rejected', 'cancelled');
  end if;
end
$$;

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  is_paid boolean not null default true,
  requires_approval boolean not null default true,
  deducts_balance boolean not null default true,
  default_entitlement_days numeric(6,2) not null default 0,
  color text not null default '#0F766E',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete cascade,
  year integer not null,
  entitled_days numeric(6,2) not null default 0,
  used_days numeric(6,2) not null default 0,
  pending_days numeric(6,2) not null default 0,
  carried_over_days numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null,
  days_count numeric(6,2) not null default 0,
  reason text,
  attachment_url text,
  medical_status text check (medical_status in ('pending', 'justified', 'rejected')),
  status public.leave_request_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date >= start_date)
);

create or replace function public.ensure_default_leave_types(p_company_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.belongs_to_company(p_company_id) then
    raise exception 'Accès refusé';
  end if;
  insert into public.leave_types
    (company_id, code, name, is_paid, requires_approval, deducts_balance, default_entitlement_days, color, sort_order)
  values
    (p_company_id, 'CP', 'Congés payés', true, true, true, 30, '#0F766E', 10),
    (p_company_id, 'MAL', 'Congé maladie', true, true, false, 0, '#DC2626', 20),
    (p_company_id, 'MAT', 'Congé maternité / paternité', true, true, false, 0, '#DB2777', 30),
    (p_company_id, 'EXC', 'Congé exceptionnel', true, true, false, 0, '#7C3AED', 40),
    (p_company_id, 'SS', 'Congé sans solde', false, true, false, 0, '#64748B', 50)
  on conflict (company_id, code) do nothing;
end;
$$;

create or replace function public.ensure_leave_balance(
  p_company_id uuid,
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year integer
)
returns public.leave_balances
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.leave_balances;
begin
  if not public.belongs_to_company(p_company_id) then
    raise exception 'Accès refusé';
  end if;
  insert into public.leave_balances (company_id, employee_id, leave_type_id, year, entitled_days)
  select p_company_id, p_employee_id, p_leave_type_id, p_year, lt.default_entitlement_days
  from public.leave_types lt
  where lt.id = p_leave_type_id and lt.company_id = p_company_id
  on conflict (employee_id, leave_type_id, year) do nothing;

  select * into v_row from public.leave_balances
  where employee_id = p_employee_id and leave_type_id = p_leave_type_id and year = p_year;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  status text not null default 'present'
    check (status in ('present', 'absent', 'late', 'half_day', 'remote', 'on_leave')),
  check_in time,
  check_out time,
  worked_minutes integer,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists attendance_records_emp_day_uidx
  on public.attendance_records (employee_id, work_date) where deleted_at is null;

create or replace function public.clock_attendance(
  p_company_id uuid,
  p_employee_id uuid,
  p_action text,
  p_at timestamptz default now()
)
returns public.attendance_records
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.attendance_records;
  v_local timestamp := p_at at time zone 'Indian/Comoro';
  v_day date := v_local::date;
  v_time time := date_trunc('minute', v_local)::time;
begin
  if not public.belongs_to_company(p_company_id) then
    raise exception 'Accès refusé';
  end if;
  if not exists (
    select 1 from public.employees
    where id = p_employee_id and company_id = p_company_id and deleted_at is null
  ) then
    raise exception 'Employé introuvable';
  end if;

  select * into v_row from public.attendance_records
  where employee_id = p_employee_id and work_date = v_day and deleted_at is null;

  if p_action = 'in' then
    if v_row.id is not null and v_row.check_in is not null then
      raise exception 'Entrée déjà enregistrée aujourd''hui';
    end if;
    if v_row.id is null then
      insert into public.attendance_records (company_id, employee_id, work_date, status, check_in, created_by)
      values (p_company_id, p_employee_id, v_day, 'present', v_time, auth.uid())
      returning * into v_row;
    else
      update public.attendance_records set check_in = v_time, status = 'present', updated_at = now()
      where id = v_row.id returning * into v_row;
    end if;
  elsif p_action = 'out' then
    if v_row.id is null or v_row.check_in is null then
      raise exception 'Aucune entrée enregistrée aujourd''hui';
    end if;
    if v_row.check_out is not null then
      raise exception 'Sortie déjà enregistrée aujourd''hui';
    end if;
    update public.attendance_records
    set check_out = v_time,
        worked_minutes = greatest(0, (extract(epoch from (v_time - check_in)) / 60)::integer),
        updated_at = now()
    where id = v_row.id
    returning * into v_row;
  else
    raise exception 'Action inconnue: %', p_action;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payroll_component_kind') then
    create type public.payroll_component_kind as enum ('earning', 'deduction', 'employer_contribution');
  end if;
  if not exists (select 1 from pg_type where typname = 'payroll_calc_method') then
    create type public.payroll_calc_method as enum
      ('base_salary', 'fixed', 'percent_of_base', 'percent_of_gross', 'igr_progressive');
  end if;
end
$$;

create table if not exists public.payroll_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  kind public.payroll_component_kind not null,
  calc_method public.payroll_calc_method not null default 'fixed',
  rate_value numeric(14,4) not null default 0,
  is_taxable boolean not null default true,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  label text not null,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  period_start date not null,
  period_end date not null,
  currency_code text not null default 'KMF' references public.currencies (code),
  status text not null default 'draft'
    check (status in ('draft', 'calculated', 'approved', 'paid', 'cancelled')),
  employee_count integer not null default 0,
  total_gross numeric(16,2) not null default 0,
  total_deductions numeric(16,2) not null default 0,
  total_net numeric(16,2) not null default 0,
  total_employer_cost numeric(16,2) not null default 0,
  notes text,
  calculated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  payslip_number text,
  employee_number text,
  employee_name text not null,
  job_title text,
  department_name text,
  base_salary numeric(14,2) not null default 0,
  currency_code text not null default 'KMF',
  gross_amount numeric(14,2) not null default 0,
  deduction_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  employer_contribution_amount numeric(14,2) not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.payslip_lines (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  component_id uuid references public.payroll_components (id) on delete set null,
  code text not null,
  label text not null,
  kind public.payroll_component_kind not null,
  calc_method public.payroll_calc_method not null,
  rate_applied numeric(14,4) not null default 0,
  basis_amount numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------
create table if not exists public.transfer_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  label text not null,
  currency_code text not null default 'KMF',
  status text not null default 'ready'
    check (status in ('draft', 'ready', 'exported', 'cancelled')),
  line_count integer not null default 0,
  total_amount numeric(16,2) not null default 0,
  total_in_words text,
  missing_account_count integer not null default 0,
  exported_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.transfer_batches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  payslip_id uuid references public.payslips (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  order_number integer not null,
  beneficiary_name text not null,
  job_title text,
  bank_name text,
  bank_account text,
  bank_rib text,
  amount numeric(14,2) not null default 0,
  currency_code text not null default 'KMF',
  has_account boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.transition_payroll_run(p_run_id uuid, p_action text)
returns public.payroll_runs
language plpgsql security definer
set search_path = public
as $$
declare
  v_run public.payroll_runs;
begin
  select * into v_run from public.payroll_runs where id = p_run_id and deleted_at is null;
  if v_run.id is null then
    raise exception 'Cycle de paie introuvable';
  end if;
  if not public.can_manage_company(v_run.company_id) then
    raise exception 'Accès refusé';
  end if;

  if p_action = 'calculate' then
    perform public.calculate_payroll_run(p_run_id);
  elsif p_action = 'approve' then
    if v_run.status <> 'calculated' then
      raise exception 'Seul un cycle calculé peut être approuvé';
    end if;
    update public.payroll_runs
    set status = 'approved', approved_at = now(), approved_by = auth.uid(), updated_at = now()
    where id = p_run_id;
    update public.payslips set status = 'approved', updated_at = now() where payroll_run_id = p_run_id;
  elsif p_action = 'pay' then
    if v_run.status <> 'approved' then
      raise exception 'Seul un cycle approuvé peut être payé';
    end if;
    update public.payroll_runs set status = 'paid', paid_at = now(), updated_at = now() where id = p_run_id;
    update public.payslips set status = 'paid', updated_at = now() where payroll_run_id = p_run_id;
  elsif p_action = 'cancel' then
    if v_run.status = 'paid' then
      raise exception 'Un cycle payé ne peut pas être annulé';
    end if;
    update public.payroll_runs set status = 'cancelled', updated_at = now() where id = p_run_id;
  elsif p_action = 'reopen' then
    if v_run.status not in ('calculated', 'approved', 'cancelled') then
      raise exception 'Ce cycle ne peut pas être rouvert';
    end if;
    update public.payroll_runs
    set status = 'draft', approved_at = null, approved_by = null, updated_at = now()
    where id = p_run_id;
  else
    raise exception 'Action inconnue: %', p_action;
  end if;

  select * into v_run from public.payroll_runs where id = p_run_id;
  return v_run;
end;
$$;

create or replace function public.generate_transfer_batch(p_payroll_run_id uuid, p_total_in_words text default null)
returns public.transfer_batches
language plpgsql security definer
set search_path = public
as $$
declare
  v_run public.payroll_runs;
  v_batch public.transfer_batches;
begin
  select * into v_run from public.payroll_runs where id = p_payroll_run_id and deleted_at is null;
  if v_run.id is null then
    raise exception 'Cycle de paie introuvable';
  end if;
  if not public.can_manage_company(v_run.company_id) then
    raise exception 'Accès refusé';
  end if;
  if v_run.status not in ('approved', 'paid') then
    raise exception 'Le cycle doit être approuvé avant de générer les virements';
  end if;

  update public.transfer_batches
  set status = 'cancelled', deleted_at = now(), updated_at = now()
  where payroll_run_id = p_payroll_run_id and status in ('draft', 'ready') and deleted_at is null;

  insert into public.transfer_batches (company_id, payroll_run_id, label, currency_code, status, total_in_words, created_by)
  values (v_run.company_id, v_run.id, 'Virements — ' || v_run.label, v_run.currency_code, 'ready', p_total_in_words, auth.uid())
  returning * into v_batch;

  insert into public.transfer_lines (
    batch_id, company_id, payslip_id, employee_id, order_number, beneficiary_name,
    job_title, bank_name, bank_account, bank_rib, amount, currency_code, has_account
  )
  select v_batch.id, v_run.company_id, ps.id, ps.employee_id,
         row_number() over (order by ps.employee_name),
         ps.employee_name, ps.job_title, e.bank_name, e.bank_account, e.bank_rib,
         ps.net_amount, ps.currency_code,
         coalesce(nullif(trim(e.bank_account), ''), nullif(trim(e.bank_rib), '')) is not null
  from public.payslips ps
  left join public.employees e on e.id = ps.employee_id
  where ps.payroll_run_id = v_run.id and ps.deleted_at is null and ps.net_amount > 0;

  update public.transfer_batches b
  set line_count = s.cnt, total_amount = s.total, missing_account_count = s.missing, updated_at = now()
  from (
    select count(*)::int as cnt,
           coalesce(sum(amount), 0) as total,
           count(*) filter (where not has_account)::int as missing
    from public.transfer_lines where batch_id = v_batch.id
  ) s
  where b.id = v_batch.id
  returning b.* into v_batch;

  return v_batch;
end;
$$;

create or replace function public.mark_transfer_batch_exported(p_batch_id uuid)
returns public.transfer_batches
language plpgsql security definer
set search_path = public
as $$
declare
  v_batch public.transfer_batches;
begin
  select * into v_batch from public.transfer_batches where id = p_batch_id and deleted_at is null;
  if v_batch.id is null then
    raise exception 'Lot de virements introuvable';
  end if;
  if not public.can_manage_company(v_batch.company_id) then
    raise exception 'Accès refusé';
  end if;
  update public.transfer_batches
  set status = 'exported', exported_at = now(), updated_at = now()
  where id = p_batch_id
  returning * into v_batch;
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contract workflow
-- ---------------------------------------------------------------------------
create or replace function public.transition_contract(
  p_contract_id uuid,
  p_action text,
  p_signer_name text default null,
  p_reason text default null
)
returns public.contracts
language plpgsql security definer
set search_path = public
as $$
declare
  v_c public.contracts;
begin
  select * into v_c from public.contracts where id = p_contract_id and deleted_at is null;
  if v_c.id is null then
    raise exception 'Contrat introuvable';
  end if;
  if not public.can_manage_company(v_c.company_id) then
    raise exception 'Accès refusé';
  end if;

  if p_action = 'send' then
    if v_c.status <> 'draft' then
      raise exception 'Seul un brouillon peut être envoyé';
    end if;
    update public.contracts
    set status = 'sent', sent_at = now(),
        signature_otp_hint = coalesce(signature_otp_hint, upper(substr(md5(random()::text), 1, 6))),
        updated_at = now()
    where id = p_contract_id;
  elsif p_action = 'sign' then
    if v_c.status not in ('draft', 'sent') then
      raise exception 'Ce contrat ne peut pas être signé';
    end if;
    update public.contracts
    set status = 'signed', signed_at = now(),
        signed_by_employee_name = coalesce(p_signer_name, signed_by_employee_name),
        updated_at = now()
    where id = p_contract_id;
  elsif p_action = 'activate' then
    if v_c.status <> 'signed' then
      raise exception 'Le contrat doit être signé avant activation';
    end if;
    update public.contracts set status = 'active', activated_at = now(), updated_at = now()
    where id = p_contract_id;
    update public.employees
    set job_title = v_c.job_title,
        base_salary = v_c.base_salary,
        department_id = coalesce(v_c.department_id, department_id),
        branch_id = coalesce(v_c.branch_id, branch_id),
        status = case when status = 'onboarding' then 'active' else status end,
        updated_at = now()
    where id = v_c.employee_id;
  elsif p_action = 'cancel' then
    if v_c.status in ('cancelled', 'expired') then
      raise exception 'Contrat déjà clôturé';
    end if;
    update public.contracts
    set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason, updated_at = now()
    where id = p_contract_id;
  else
    raise exception 'Action inconnue: %', p_action;
  end if;

  select * into v_c from public.contracts where id = p_contract_id;
  return v_c;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tasks, documents, recruitment, training, performance, assets
-- ---------------------------------------------------------------------------
create table if not exists public.hr_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee_employee_id uuid references public.employees (id) on delete set null,
  assignee_name text,
  due_date date,
  estimated_minutes integer,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  category text not null default 'other'
    check (category in ('contract', 'payslip', 'identity', 'policy', 'medical', 'other')),
  title text not null,
  description text,
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0,
  storage_path text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

insert into storage.buckets (id, name, public) values ('hr-documents', 'hr-documents', false)
on conflict (id) do nothing;

create table if not exists public.job_openings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  department_id uuid references public.departments (id) on delete set null,
  location text,
  employment_type text not null default 'cdi',
  description text,
  status text not null default 'draft' check (status in ('draft', 'open', 'on_hold', 'closed', 'filled')),
  openings_count integer not null default 1,
  salary_min numeric(14,2),
  salary_max numeric(14,2),
  currency_code text not null default 'KMF',
  published_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_opening_id uuid not null references public.job_openings (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  stage text not null default 'sourced'
    check (stage in ('sourced', 'screened', 'interview', 'offer', 'hired', 'rejected')),
  source text,
  notes text,
  expected_salary numeric(14,2),
  hired_employee_id uuid references public.employees (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  category text not null default 'general',
  description text,
  duration_hours numeric(6,2) not null default 0,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  course_id uuid not null references public.training_courses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  status text not null default 'enrolled'
    check (status in ('enrolled', 'in_progress', 'completed', 'cancelled')),
  progress_pct integer not null default 0 check (progress_pct between 0 and 100),
  completed_at timestamptz,
  certificate_issued boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  period_label text not null,
  score numeric(4,2) not null default 0,
  goals_pct integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'finalized')),
  notes text,
  reviewer_name text,
  reviewed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.company_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  category text not null default 'other'
    check (category in ('laptop', 'phone', 'monitor', 'vehicle', 'other')),
  serial_number text,
  status text not null default 'available'
    check (status in ('available', 'assigned', 'maintenance', 'retired')),
  assigned_employee_id uuid references public.employees (id) on delete set null,
  assigned_at timestamptz,
  purchase_date date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- updated_at triggers + row level security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'branches', 'departments', 'employees', 'contracts',
    'leave_types', 'leave_balances', 'leave_requests', 'attendance_records',
    'payroll_components', 'payroll_runs', 'payslips', 'transfer_batches',
    'hr_tasks', 'hr_documents', 'job_openings', 'candidates',
    'training_courses', 'training_enrollments', 'performance_reviews', 'company_assets'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;

  -- Tenant tables: members read, employer/HR write.
  foreach t in array array[
    'branches', 'departments', 'employees', 'contracts', 'leave_types', 'leave_balances',
    'payroll_components', 'payroll_runs', 'payslips', 'payslip_lines',
    'transfer_batches', 'transfer_lines', 'hr_tasks', 'hr_documents', 'job_openings',
    'candidates', 'training_courses', 'training_enrollments', 'performance_reviews', 'company_assets'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.belongs_to_company(company_id))',
      t || '_tenant_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id))',
      t || '_tenant_write', t);
  end loop;

  -- Self-service tables: any member of the company may create/update (server functions
  -- and later migrations narrow this to the employee's own rows).
  foreach t in array array['leave_requests', 'attendance_records'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.belongs_to_company(company_id)) with check (public.belongs_to_company(company_id))',
      t || '_tenant_all', t);
  end loop;
end
$$;

alter table public.companies enable row level security;
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (public.belongs_to_company(id) or created_by = auth.uid());
drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (created_by = auth.uid() or public.is_platform_admin());
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (public.can_manage_company(id)) with check (public.can_manage_company(id));

alter table public.countries enable row level security;
drop policy if exists countries_read on public.countries;
create policy countries_read on public.countries for select using (true);
alter table public.currencies enable row level security;
drop policy if exists currencies_read on public.currencies;
create policy currencies_read on public.currencies for select using (true);

grant select on public.countries, public.currencies to anon, authenticated;
grant all on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
