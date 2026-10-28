-- Migration 47: Staff Profiles table
create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  staff_code text not null check (btrim(staff_code) <> ''),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text,
  mobile_number text not null,
  telephone_no text,
  email text,
  address text,
  area text,
  designation text not null default 'Staff',
  role_level text not null default 'LEVEL 1',
  department_name text,
  salary_type text default 'Monthly',
  commission_rate numeric(8,2) not null default 0,
  branch_id uuid references public.branches(id) on delete set null,
  branches text[] default array[]::text[],
  joined_date date,
  dob date,
  gender text default 'MALE',
  nick_name text,
  nic text,
  vehicle_no text,
  staff_short_key text,
  sales_in boolean not null default true,
  sales_target boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, staff_code)
);

alter table public.staff_profiles enable row level security;

create policy staff_profiles_select on public.staff_profiles
  for select to authenticated using (company_id = public.current_user_company_id());

create policy staff_profiles_all on public.staff_profiles
  for all to authenticated using (company_id = public.current_user_company_id());

grant select, insert, update, delete on public.staff_profiles to authenticated;
