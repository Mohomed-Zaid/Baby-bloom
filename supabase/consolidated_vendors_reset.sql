-- ============================================================================
-- CONSOLIDATED VENDORS SCHEMA RESET & EXTENSION
-- ============================================================================
-- Aligns public.vendors with eMark POS & ERP Vendor Registration specifications:
-- General tab: Vendor Code, Vendor Name, Address, Contact Number, Email,
--              Cheque Draw Name, Become a Customer checkbox, Active checkbox,
--              Due Days, Business Type
-- Add Members tab: Additional contact members (name, phone, role, email)
-- ============================================================================

-- 1. Ensure Table and Base Structure
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  vendor_code text not null check (btrim(vendor_code) <> ''),
  name text not null check (btrim(name) <> ''),
  contact_person text,
  phone text,
  alternate_phone text,
  email text,
  address text,
  city text,
  tax_number text,
  credit_limit numeric(18,2) not null default 0 check (credit_limit >= 0),
  credit_days integer not null default 0 check (credit_days >= 0),
  opening_balance numeric(18,2) not null default 0 check (opening_balance >= 0),
  opening_balance_type public.normal_balance not null default 'credit',
  products_supplied_notes text,
  payment_terms text,
  notes text,
  status public.vendor_status not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, vendor_code),
  unique (company_id, id)
);

-- Allow branch_id to be nullable if strict foreign key exists
alter table public.vendors alter column branch_id drop not null;

-- 2. Add eMark Extended Fields
alter table public.vendors
  add column if not exists cheque_draw_name text,
  add column if not exists become_customer boolean not null default false,
  add column if not exists due_days integer default 0,
  add column if not exists business_type text,
  add column if not exists members jsonb not null default '[]'::jsonb;

-- 3. Indexes for fast search and filtering
create index if not exists vendors_company_code_idx on public.vendors(company_id, vendor_code);
create index if not exists vendors_company_name_idx on public.vendors(company_id, name) where deleted_at is null;
create index if not exists vendors_company_phone_idx on public.vendors(company_id, phone) where deleted_at is null and phone is not null;
create index if not exists vendors_company_status_idx on public.vendors(company_id, status) where deleted_at is null;

-- 4. Enable RLS and Policies
alter table public.vendors enable row level security;

drop policy if exists "vendors_select_policy" on public.vendors;
drop policy if exists "vendors_insert_policy" on public.vendors;
drop policy if exists "vendors_update_policy" on public.vendors;
drop policy if exists "vendors_delete_policy" on public.vendors;
drop policy if exists "Allow authenticated full access to vendors" on public.vendors;

create policy "Allow authenticated full access to vendors"
  on public.vendors
  for all
  to authenticated
  using (true)
  with check (true);

-- 5. Seed Vendor Records matching Screenshot 2 if empty
do $$
declare
  v_company_id uuid;
  v_branch_id uuid;
begin
  select id into v_company_id from public.companies limit 1;
  select id into v_branch_id from public.branches where company_id = v_company_id limit 1;

  if v_company_id is not null and not exists (select 1 from public.vendors where company_id = v_company_id and vendor_code in ('056', '055')) then
    insert into public.vendors (
      company_id, branch_id, vendor_code, name, phone, address, status, credit_days, due_days
    ) values
    (v_company_id, v_branch_id, '056', 'LITTLE BRAVE', '0704285481', '', 'active', 0, 0),
    (v_company_id, v_branch_id, '055', 'KMS IMPORTS & EXPORTS (PVT) LTD', '0772284736', 'NO :95 OLD MOOE STREET COLOMBO 12', 'active', 30, 30),
    (v_company_id, v_branch_id, '054', 'KIDS STORE', null, '', 'active', 0, 0),
    (v_company_id, v_branch_id, '053', 'NIPUNEES BABY CARE', '0382221984', '33 JANAPRIYA MAWATHA PANADURA. 0718181183', 'active', 0, 0),
    (v_company_id, v_branch_id, '052', 'AKIFAH STYLES', '0772249228', '78 ALLEN AVENUE ROAD DEHIWALA', 'active', 0, 0),
    (v_company_id, v_branch_id, '051', 'CHAMINI (HORANA) NIGHT DRESS', '0775303738', 'HORANA', 'active', 0, 0),
    (v_company_id, v_branch_id, '050', 'GLOBAL (NAPPY GARDE )', '07777798788', '231,QOLFENDHAL STREET COLOMBO 13', 'active', 0, 0),
    (v_company_id, v_branch_id, '049', 'MY BABY -MATHUGAMA', '0776157058', '266/B,AGALAWATHTHA ROAD MATHUGAMA', 'active', 0, 0),
    (v_company_id, v_branch_id, '048', 'easy baby', '0773993003', 'mount lavinia', 'active', 0, 0),
    (v_company_id, v_branch_id, '047', 'JUNIOR ATTIRE', '0761003360', '122/1,VIVEKANANDA HILL,COLOMBO 13', 'active', 0, 0),
    (v_company_id, v_branch_id, '046', 'LI - LOO (PVT) LTD', '0752752260', '73/18, LAKECRESCENT ATTIDIYA DEHIWALA', 'active', 0, 0),
    (v_company_id, v_branch_id, '045', 'I.M.ANIAS SUNGLASSES', '0774100225', '', 'active', 0, 0),
    (v_company_id, v_branch_id, '044', 'CITY CYCLE HOUSE (PVT) LTD', null, '77,DAM STREET COLOMBO 12', 'active', 0, 0),
    (v_company_id, v_branch_id, '043', 'FARLIN S & t SUPPLIER', null, '341/C/108,4 th lane mahayayawaththa,piliyandala', 'active', 0, 0)
    on conflict (company_id, vendor_code) do nothing;
  end if;
end $$;
