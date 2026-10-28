-- Banking reference and account masters; no cheques or payment transactions
create table public.banks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  bank_code text not null check (btrim(bank_code) <> ''),
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index banks_scope_code_uidx on public.banks(coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), bank_code);
create index banks_company_idx on public.banks(company_id) where is_active;

create table public.bank_branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  bank_id uuid not null references public.banks(id) on delete cascade,
  branch_code text not null check (btrim(branch_code) <> ''),
  name text not null check (btrim(name) <> ''),
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (bank_id, branch_code),
  unique (company_id, id)
);
create index bank_branches_bank_idx on public.bank_branches(bank_id) where is_active;

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  bank_id uuid not null references public.banks(id) on delete restrict,
  bank_branch_id uuid references public.bank_branches(id) on delete restrict,
  account_name text not null check (btrim(account_name) <> ''),
  account_number text not null check (btrim(account_number) <> ''),
  account_type text not null,
  opening_balance numeric(18,2) not null default 0,
  ledger_account_id uuid,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, bank_id, account_number),
  unique (company_id, id),
  constraint bank_accounts_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict
);
create unique index bank_accounts_one_default_per_branch_uidx on public.bank_accounts(branch_id) where is_default and is_active;
create index bank_accounts_company_branch_idx on public.bank_accounts(company_id, branch_id) where is_active;