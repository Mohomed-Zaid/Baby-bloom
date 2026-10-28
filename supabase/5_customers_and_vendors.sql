-- Customer and vendor masters only; no receivable/payable transactions
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  customer_code text not null check (btrim(customer_code) <> ''),
  customer_type public.customer_type not null default 'retail',
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
  opening_balance_type public.normal_balance not null default 'debit',
  price_level public.price_level not null default 'retail',
  sms_enabled boolean not null default false,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, customer_code),
  unique (company_id, id),
  constraint customers_branch_company_fk foreign key (company_id, branch_id)
    references public.branches(company_id, id) on delete restrict
);
create index customers_company_branch_name_idx on public.customers(company_id, branch_id, name) where deleted_at is null;
create index customers_company_phone_idx on public.customers(company_id, phone) where deleted_at is null and phone is not null;

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
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
  unique (company_id, id),
  constraint vendors_branch_company_fk foreign key (company_id, branch_id)
    references public.branches(company_id, id) on delete restrict
);
create index vendors_company_branch_name_idx on public.vendors(company_id, branch_id, name) where deleted_at is null;
create index vendors_company_phone_idx on public.vendors(company_id, phone) where deleted_at is null and phone is not null;