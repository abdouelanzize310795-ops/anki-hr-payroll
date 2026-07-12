-- AnkibaPay auth foundation: profiles + RBAC helpers
-- Applied remotely via MCP apply_migration (auth_profiles_rbac)

create extension if not exists "pgcrypto";

create type public.app_role as enum (
  'platform_admin',
  'employer',
  'hr',
  'manager',
  'employee'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'employee',
  company_id uuid,
  phone text,
  avatar_url text,
  locale text not null default 'fr-KM',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index profiles_company_id_idx on public.profiles (company_id) where deleted_at is null;
create index profiles_role_idx on public.profiles (role) where deleted_at is null;
create index profiles_email_idx on public.profiles (email);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data->>'role')::public.app_role, 'employee')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid()
    and deleted_at is null
    and is_active = true;
$$;

create or replace function public.has_role(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and deleted_at is null
      and is_active = true
      and role = required
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('platform_admin');
$$;

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or (
      company_id is not null
      and company_id = (
        select p.company_id from public.profiles p
        where p.id = auth.uid() and p.deleted_at is null
      )
      and public.current_user_role() in ('employer', 'hr', 'manager')
    )
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

create or replace function public.prevent_role_self_elevation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_platform_admin() then
    raise exception 'Seul un administrateur plateforme peut modifier le rôle';
  end if;
  if new.company_id is distinct from old.company_id and not public.is_platform_admin() then
    raise exception 'Seul un administrateur plateforme peut réaffecter l''entreprise';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_self_elevation
before update on public.profiles
for each row
execute function public.prevent_role_self_elevation();

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant usage on type public.app_role to authenticated;

revoke execute on function public.current_user_id() from public, anon;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.has_role(public.app_role) from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_role_self_elevation() from public, anon, authenticated;

grant execute on function public.current_user_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
