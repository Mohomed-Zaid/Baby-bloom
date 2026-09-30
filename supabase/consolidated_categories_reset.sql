-- ============================================================================
-- CONSOLIDATED CATEGORIES SCHEMA RESET & EXTENSION
-- ============================================================================
-- Manages product categories with hierarchy (parent category), codes,
-- descriptions, and active status.
-- ============================================================================

-- 1. Ensure Table Structure
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  parent_id uuid,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, code),
  unique (company_id, id)
);

-- 2. Ensure columns exist if the table was created by older migrations
alter table public.categories
  add column if not exists parent_id uuid,
  add column if not exists description text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz;

-- 3. Self-referencing constraint
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'categories_parent_company_fk'
  ) then
    alter table public.categories
      add constraint categories_parent_company_fk
      foreign key (company_id, parent_id)
      references public.categories(company_id, id)
      on delete restrict;
  end if;
end $$;

-- 4. Indexes
create index if not exists categories_company_code_idx on public.categories(company_id, code);
create index if not exists categories_company_name_idx on public.categories(company_id, name) where deleted_at is null;
create index if not exists categories_company_parent_idx on public.categories(company_id, parent_id) where deleted_at is null;

-- 5. Row Level Security
alter table public.categories enable row level security;

drop policy if exists "categories_read" on public.categories;
drop policy if exists "categories_manage" on public.categories;
drop policy if exists "Allow authenticated full access to categories" on public.categories;

create policy "Allow authenticated full access to categories"
  on public.categories
  for all
  to authenticated
  using (true)
  with check (true);

-- 6. Seed default categories if none exist
do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public.companies limit 1;

  if v_company_id is not null and not exists (select 1 from public.categories where company_id = v_company_id and deleted_at is null) then
    insert into public.categories (company_id, code, name, description, is_active) values
    (v_company_id, '001', 'Baby Clothing & Apparel', 'Rompers, onesies, sleepwear, frocks and mittens', true),
    (v_company_id, '002', 'Diapers & Hygiene', 'Disposable diapers, cloth nappies, wet wipes and rash creams', true),
    (v_company_id, '003', 'Feeding & Nursing', 'Bottles, breast pumps, sterilizers, bibs and high chairs', true),
    (v_company_id, '004', 'Baby Gear & Travel', 'Strollers, prams, car seats, carriers and baby cots', true),
    (v_company_id, '005', 'Bath & Skin Care', 'Baby body wash, shampoo, lotion, oils and bath tubs', true),
    (v_company_id, '006', 'Toys & Early Learning', 'Rattles, soft toys, activity gyms, teether toys and books', true),
    (v_company_id, '007', 'Maternity Essentials', 'Maternity wear, nursing pillows, belly bands and postpartum care', true)
    on conflict (company_id, code) do nothing;
  end if;
end $$;

-- 7. Reload Supabase Schema Cache
notify pgrst, 'reload schema';
