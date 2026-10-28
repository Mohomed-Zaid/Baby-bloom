-- Warehouses and physical stock locations (no stock balances or movements)
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code),
  unique (company_id, id),
  unique (company_id, branch_id, id),
  constraint warehouses_branch_company_fk foreign key (company_id, branch_id)
    references public.branches(company_id, id) on delete restrict
);
create unique index warehouses_one_default_per_branch_idx on public.warehouses(branch_id) where is_default and deleted_at is null;
create index warehouses_company_branch_idx on public.warehouses(company_id, branch_id) where deleted_at is null;

create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  warehouse_id uuid not null,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (warehouse_id, code),
  unique (company_id, id),
  constraint stock_locations_branch_company_fk foreign key (company_id, branch_id)
    references public.branches(company_id, id) on delete restrict,
  constraint stock_locations_warehouse_company_branch_fk foreign key (company_id, branch_id, warehouse_id)
    references public.warehouses(company_id, branch_id, id) on delete restrict
);
create index stock_locations_warehouse_idx on public.stock_locations(warehouse_id) where deleted_at is null;
create index stock_locations_company_branch_idx on public.stock_locations(company_id, branch_id) where deleted_at is null;