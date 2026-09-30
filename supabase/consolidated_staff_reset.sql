-- ============================================================================
-- CONSOLIDATED STAFF MANAGEMENT SCHEMA RESET & EXTENSION
-- ============================================================================
-- Aligns public.staff_profiles with eMark POS & ERP Staff Registration specifications:
-- General tab: Staff Code, Staff Name, Nick Name, NIC, DOB, Gender, Address,
--              Area, Mobile No, Telephone No, Email, Active, Sales In, Sales Target, Branches
-- More Info tab: Joined Date, Department Name, Staff Role, Salary Type, Commission Percentage,
--                Vehicle No, Staff Short Key
-- ============================================================================

-- 1. Ensure Table and Base Structure
create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  staff_code text not null check (btrim(staff_code) <> ''),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text,
  mobile_number text not null check (btrim(mobile_number) <> ''),
  address text,
  designation text not null default 'Staff',
  role_level text not null default 'LEVEL 1',
  commission_rate numeric(5,2) not null default 0 check (commission_rate >= 0 and commission_rate <= 100),
  branch_id uuid references public.branches(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, staff_code),
  unique (company_id, id)
);

-- 2. Add eMark Extended Fields
alter table public.staff_profiles
  add column if not exists nick_name text,
  add column if not exists nic text,
  add column if not exists dob date,
  add column if not exists gender text default 'MALE',
  add column if not exists area text,
  add column if not exists telephone_no text,
  add column if not exists email text,
  add column if not exists sales_in boolean not null default true,
  add column if not exists sales_target boolean not null default false,
  add column if not exists branches jsonb not null default '[]'::jsonb,
  add column if not exists joined_date date,
  add column if not exists department_name text,
  add column if not exists salary_type text,
  add column if not exists vehicle_no text,
  add column if not exists staff_short_key text;

-- 3. Indexes for fast lookups and filtering
create index if not exists staff_profiles_company_active_idx on public.staff_profiles(company_id, is_active);
create index if not exists staff_profiles_branch_idx on public.staff_profiles(company_id, branch_id);
create index if not exists staff_profiles_code_idx on public.staff_profiles(company_id, staff_code);
create index if not exists staff_profiles_mobile_idx on public.staff_profiles(company_id, mobile_number);

-- 4. Enable RLS
alter table public.staff_profiles enable row level security;

-- Drop prior policies if recreating
drop policy if exists "staff_profiles_select_policy" on public.staff_profiles;
drop policy if exists "staff_profiles_insert_policy" on public.staff_profiles;
drop policy if exists "staff_profiles_update_policy" on public.staff_profiles;
drop policy if exists "staff_profiles_delete_policy" on public.staff_profiles;
drop policy if exists "Allow authenticated full access to staff_profiles" on public.staff_profiles;

-- Authenticated tenant access policy
create policy "Allow authenticated full access to staff_profiles"
  on public.staff_profiles
  for all
  to authenticated
  using (true)
  with check (true);

-- 5. Seed initial staff records if empty
do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public.companies limit 1;
  
  if v_company_id is not null and not exists (select 1 from public.staff_profiles where company_id = v_company_id) then
    insert into public.staff_profiles (
      company_id, staff_code, first_name, last_name, nick_name, mobile_number, address,
      designation, role_level, is_active, sales_in, area
    ) values
    (v_company_id, '033', 'zahani', null, 'zahani', '0765786886', '18 rajasinghr road col-6', 'LEVEL 1', 'LEVEL 1', true, true, 'Colombo'),
    (v_company_id, '032', 'STORE & OFFICE', null, 'STORE', '0763993003', '451 Galle Rd, Dehiwala-Mount Lavinia', 'LEVEL 1', 'LEVEL 1', true, true, 'Mount Lavinia'),
    (v_company_id, '028', 'D.M.W.HELANI', null, 'HELANI', '0754041976', '122C, GODELLA WATTARD, ANGANGODA, PAYAGALA.', 'LEVEL 1', 'LEVEL 1', true, true, 'Payagala'),
    (v_company_id, '026', 'NIFLAN', null, 'NIFLAN', '0753841599', 'GAMPOLA', 'LEVEL 1', 'LEVEL 1', true, true, 'Gampola'),
    (v_company_id, '023', 'INFAR', null, 'INFAR', '0773993003', '18 RAJASINGHE ROAD COLOMBO-06', 'LEVEL 1', 'LEVEL 1', true, true, 'Colombo'),
    (v_company_id, '019', 'infar', null, 'infar', '0772394578', '18, RAJASINGHR ROAD COL-06', 'LEVEL 1', 'LEVEL 1', true, true, 'Colombo'),
    (v_company_id, '014', 'AFRAZ', null, 'AFRAZ', '0743037265', 'BORELLA', 'Sales Manager', 'Sales Manager', true, true, 'Borella'),
    (v_company_id, '003', 'MUNZIR', null, 'MUNZIR', '0766643003', 'GALLE', 'Other', 'Other', true, true, 'Galle');
  end if;
end $$;
