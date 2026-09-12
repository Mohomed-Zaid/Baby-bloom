-- Company boundary and identity/security masters
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  legal_name text,
  registration_number text,
  tax_number text,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  country text not null default 'Sri Lanka',
  currency_code text not null default 'LKR' check (currency_code ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Colombo',
  logo_url text,
  subscription_plan text,
  subscription_starts_on date,
  subscription_expires_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_subscription_dates_check check (
    subscription_starts_on is null or subscription_expires_on is null or subscription_expires_on >= subscription_starts_on
  )
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  phone text,
  email text,
  address text,
  city text,
  invoice_prefix text,
  is_head_office boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, code),
  unique (company_id, id)
);
create unique index branches_one_head_office_per_company_idx on public.branches(company_id) where is_head_office and deleted_at is null;
create index branches_company_active_idx on public.branches(company_id, is_active) where deleted_at is null;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  staff_code text not null,
  full_name text not null check (btrim(full_name) <> ''),
  username text not null,
  phone text,
  address text,
  avatar_url text,
  status public.user_status not null default 'active',
  default_branch_id uuid,
  requires_two_factor boolean not null default false,
  authentication_period integer not null default 0 check (authentication_period >= 0),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, username),
  unique (company_id, staff_code),
  unique (company_id, id),
  constraint profiles_default_branch_company_fk foreign key (company_id, default_branch_id)
    references public.branches(company_id, id) on delete restrict
);
create index profiles_company_status_idx on public.profiles(company_id, status);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system_role boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, id)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  module text not null,
  name text not null,
  description text
);
create index permissions_module_idx on public.permissions(module);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role_id),
  constraint user_roles_user_company_fk foreign key (company_id, user_id) references public.profiles(company_id, id) on delete cascade,
  constraint user_roles_role_company_fk foreign key (company_id, role_id) references public.roles(company_id, id) on delete cascade
);
create index user_roles_company_user_idx on public.user_roles(company_id, user_id);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  is_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id),
  constraint role_permissions_role_company_fk foreign key (company_id, role_id) references public.roles(company_id, id) on delete cascade
);
create index role_permissions_company_role_idx on public.role_permissions(company_id, role_id) where is_allowed;

create table public.user_branch_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  can_view boolean not null default true,
  can_transact boolean not null default false,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  primary key (user_id, branch_id),
  constraint user_branch_access_user_company_fk foreign key (company_id, user_id) references public.profiles(company_id, id) on delete cascade,
  constraint user_branch_access_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete cascade
);
create index user_branch_access_company_user_idx on public.user_branch_access(company_id, user_id) where can_view;

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  setting_key text not null check (btrim(setting_key) <> ''),
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, setting_key)
);
comment on table public.business_settings is 'Non-secret business configuration. Credentials must use a secrets service.';