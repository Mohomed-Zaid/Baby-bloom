-- ============================================================================
-- CONSOLIDATED PRODUCT BARCODES SCHEMA RESET & EXTENSION
-- ============================================================================
-- Manages product variant barcodes with primary/secondary designations,
-- barcode formats (CODE128, EAN13, etc.), pack quantities, and quick lookups.
-- ============================================================================

-- 1. Ensure Table Structure
create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_variant_id uuid not null,
  barcode text not null check (btrim(barcode) <> ''),
  barcode_type text default 'CODE128',
  pack_quantity numeric(18,4) not null default 1 check (pack_quantity > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, barcode)
);

-- 2. Ensure columns exist if the table was created by an older migration
alter table public.product_barcodes
  add column if not exists barcode_type text default 'CODE128',
  add column if not exists pack_quantity numeric(18,4) not null default 1,
  add column if not exists is_primary boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- 3. Foreign key with cascade
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'product_barcodes_variant_company_fk'
  ) then
    alter table public.product_barcodes
      add constraint product_barcodes_variant_company_fk
      foreign key (company_id, product_variant_id)
      references public.product_variants(company_id, id)
      on delete cascade;
  end if;
end $$;

-- 4. Indexes
create index if not exists product_barcodes_variant_idx on public.product_barcodes(company_id, product_variant_id);
create index if not exists product_barcodes_company_barcode_idx on public.product_barcodes(company_id, barcode);
create unique index if not exists product_barcodes_one_primary_uidx on public.product_barcodes(company_id, product_variant_id) where is_primary;

-- 5. Row Level Security
alter table public.product_barcodes enable row level security;

drop policy if exists "barcodes_read" on public.product_barcodes;
drop policy if exists "barcodes_manage" on public.product_barcodes;
drop policy if exists "Allow authenticated full access to product_barcodes" on public.product_barcodes;

create policy "Allow authenticated full access to product_barcodes"
  on public.product_barcodes
  for all
  to authenticated
  using (true)
  with check (true);

-- 6. Sync existing product_variants barcodes into product_barcodes if not present
insert into public.product_barcodes (company_id, product_variant_id, barcode, barcode_type, pack_quantity, is_primary)
select 
  pv.company_id,
  pv.id,
  btrim(pv.barcode),
  'CODE128',
  1,
  true
from public.product_variants pv
where pv.barcode is not null 
  and btrim(pv.barcode) <> ''
  and pv.deleted_at is null
on conflict (company_id, barcode) do nothing;

-- 7. Reload Supabase / PostgREST Schema Cache
notify pgrst, 'reload schema';
