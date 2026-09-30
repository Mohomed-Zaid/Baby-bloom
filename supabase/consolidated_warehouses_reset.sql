-- ============================================================================
-- CONSOLIDATED WAREHOUSES SCHEMA RESET & EXTENSION
-- ============================================================================
-- Manages warehouses linked to company branches with codes, names,
-- addresses, default designations, and active status.
-- ============================================================================

-- 1. Ensure Table Structure
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, code),
  unique (company_id, id),
  unique (company_id, branch_id, id)
);

-- 2. Ensure columns exist if the table was created by older migrations
alter table public.warehouses
  add column if not exists address text,
  add column if not exists is_default boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz;

-- 3. Indexes
create index if not exists warehouses_company_code_idx on public.warehouses(company_id, code);
create index if not exists warehouses_company_branch_idx on public.warehouses(company_id, branch_id) where deleted_at is null;
create index if not exists warehouses_company_name_idx on public.warehouses(company_id, name) where deleted_at is null;
create unique index if not exists warehouses_one_default_per_branch_idx on public.warehouses(company_id, branch_id) where is_default and deleted_at is null;

-- 4. Row Level Security
alter table public.warehouses enable row level security;

drop policy if exists "warehouses_read" on public.warehouses;
drop policy if exists "warehouses_manage" on public.warehouses;
drop policy if exists "Allow authenticated full access to warehouses" on public.warehouses;

create policy "Allow authenticated full access to warehouses"
  on public.warehouses
  for all
  to authenticated
  using (true)
  with check (true);

-- 5. Seed default warehouses for branches if none exist
do $$
declare
  v_company_id uuid;
  v_branch_rec record;
  v_count integer := 1;
begin
  select id into v_company_id from public.companies limit 1;

  if v_company_id is not null and not exists (select 1 from public.warehouses where company_id = v_company_id and deleted_at is null) then
    for v_branch_rec in select id, name, code from public.branches where company_id = v_company_id loop
      insert into public.warehouses (
        company_id, branch_id, code, name, address, is_default, is_active
      ) values (
        v_company_id,
        v_branch_rec.id,
        lpad(v_count::text, 3, '0'),
        v_branch_rec.name || ' Main Warehouse',
        'Main storage facility for ' || v_branch_rec.name,
        true,
        true
      ) on conflict (company_id, code) do nothing;
      v_count := v_count + 1;
    end loop;
  end if;
end $$;

-- 6. Reload Supabase Schema Cache
notify pgrst, 'reload schema';
