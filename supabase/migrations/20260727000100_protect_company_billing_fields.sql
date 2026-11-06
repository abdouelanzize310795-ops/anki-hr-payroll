-- The companies update policy lets the employer/HR edit their company, which
-- also allowed them to approve it, reactivate it or extend their subscription
-- with a direct update. Those fields now change only through the platform
-- admin or the SECURITY DEFINER workflows (payment declaration, admin review,
-- subscription sync), which run as the table owner rather than `authenticated`.

create or replace function public.protect_company_billing_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_platform_admin() then
    if new.approval_status is distinct from old.approval_status
       or new.is_active is distinct from old.is_active
       or new.rejection_reason is distinct from old.rejection_reason
       or new.subscription_status is distinct from old.subscription_status
       or new.subscription_plan is distinct from old.subscription_plan
       or new.subscription_starts_at is distinct from old.subscription_starts_at
       or new.subscription_ends_at is distinct from old.subscription_ends_at
       or new.subscription_paid_at is distinct from old.subscription_paid_at
       or new.payment_reference is distinct from old.payment_reference
       or new.payment_method is distinct from old.payment_method
    then
      raise exception 'Seul l’administrateur plateforme peut modifier l’abonnement, l’approbation ou l’activation de l’entreprise';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_company_billing_fields on public.companies;
create trigger protect_company_billing_fields
  before update on public.companies
  for each row execute function public.protect_company_billing_fields();
