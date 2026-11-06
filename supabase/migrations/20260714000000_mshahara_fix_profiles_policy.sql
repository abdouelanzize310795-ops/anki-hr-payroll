-- Mshahara: the original profiles SELECT policy queried profiles from inside its own
-- policy, which PostgreSQL rejects as infinite recursion. Use the security definer
-- helper current_company_id() instead.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_platform_admin()
  or (
    company_id is not null
    and company_id = public.current_company_id()
    and public.current_user_role() in ('employer', 'hr', 'manager')
  )
);
