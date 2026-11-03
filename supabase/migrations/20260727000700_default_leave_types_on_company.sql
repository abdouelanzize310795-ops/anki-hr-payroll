-- Leave types were created on the first visit of the web Leave page: until
-- then a new company's employees had no leave type in the mobile app. Create
-- them with the company, like the default work policy, and backfill.

create or replace function public.companies_default_leave_types()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_leave_types(new.id);
  return new;
end;
$$;

drop trigger if exists companies_default_leave_types on public.companies;
create trigger companies_default_leave_types
  after insert on public.companies
  for each row execute function public.companies_default_leave_types();

do $$
declare
  c record;
begin
  for c in
    select id from public.companies co
     where co.deleted_at is null
       and not exists (select 1 from public.leave_types lt where lt.company_id = co.id and lt.deleted_at is null)
  loop
    perform public.ensure_default_leave_types(c.id);
  end loop;
end
$$;
