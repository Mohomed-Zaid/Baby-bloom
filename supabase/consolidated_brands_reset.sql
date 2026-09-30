-- ============================================================================
-- CONSOLIDATED BRANDS SCHEMA RESET & EXTENSION
-- ============================================================================
-- Manages product brands with codes, names, descriptions, and active status.
-- ============================================================================

-- 1. Ensure Table Structure
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
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
alter table public.brands
  add column if not exists description text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz;

-- 3. Indexes
create index if not exists brands_company_code_idx on public.brands(company_id, code);
create index if not exists brands_company_name_idx on public.brands(company_id, name) where deleted_at is null;

-- 4. Row Level Security
alter table public.brands enable row level security;

drop policy if exists "brands_read" on public.brands;
drop policy if exists "brands_manage" on public.brands;
drop policy if exists "Allow authenticated full access to brands" on public.brands;

create policy "Allow authenticated full access to brands"
  on public.brands
  for all
  to authenticated
  using (true)
  with check (true);

-- 5. Seed default brands if none exist
do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public.companies limit 1;

  if v_company_id is not null and not exists (select 1 from public.brands where company_id = v_company_id and deleted_at is null) then
    insert into public.brands (company_id, code, name, description, is_active) values
    (v_company_id, '001', 'Pampers', 'Diapers and baby wipes', true),
    (v_company_id, '002', 'Huggies', 'Diapers, pull-ups and wipes', true),
    (v_company_id, '003', 'Philips Avent', 'Bottles, breast pumps and pacifiers', true),
    (v_company_id, '004', 'Chicco', 'Baby gear, nursing and toys', true),
    (v_company_id, '005', 'Fisher-Price', 'Infant toys, playmats and bouncers', true),
    (v_company_id, '006', 'Johnson & Johnson', 'Baby bath and skin care products', true),
    (v_company_id, '007', 'Pigeon', 'Feeding accessories, teats and sterilizers', true),
    (v_company_id, '008', 'Farlin', 'Baby accessories, feeding and safety products', true),
    (v_company_id, '009', 'Baby Cheramy', 'Baby wash, shampoo and care essentials', true)
    on conflict (company_id, code) do nothing;
  end if;
end $$;

-- 6. Reload Supabase Schema Cache
notify pgrst, 'reload schema';
