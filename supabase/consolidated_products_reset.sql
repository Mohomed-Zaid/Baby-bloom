-- ==============================================================================
-- CONSOLIDATED PRODUCTS, VARIANTS, BARCODES & CATALOG RESET SCRIPT
-- ==============================================================================
-- This script safely drops and recreates all product catalog tables:
-- categories, brands, units, products, product_variants, product_barcodes,
-- product_unit_conversions, triggers, views, and helper procedures.
-- Safe to run in Supabase SQL Editor.
-- ==============================================================================

-- 1. DROP EXISTING VIEWS THAT DEPEND ON PRODUCTS/VARIANTS
drop view if exists public.pos_product_search cascade;
drop view if exists public.product_variants_secure cascade;
drop view if exists public.sales_invoice_item_details cascade;
drop view if exists public.sales_return_eligibility cascade;

-- 2. DROP EXISTING PRODUCT FUNCTIONS
drop function if exists public.create_product_with_default_variant cascade;
drop function if exists public.resolve_product_barcode cascade;
drop function if exists public.enforce_barcode_uniqueness cascade;
drop function if exists public.ensure_product_has_variant cascade;

-- 3. DROP TABLES (child-to-parent order)
drop table if exists public.product_unit_conversions cascade;
drop table if exists public.product_barcodes cascade;
drop table if exists public.product_variants cascade;
drop table if exists public.products cascade;
drop table if exists public.categories cascade;
drop table if exists public.brands cascade;
drop table if exists public.units cascade;

-- 4. ENSURE TYPES / ENUMS EXIST
do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_status') then
    create type public.product_status as enum ('active', 'inactive', 'discontinued');
  end if;
end $$;

-- 5. SEED PRODUCT PERMISSIONS
insert into public.permissions(permission_key, module, name, description) values
  ('products.view', 'products', 'View Products', 'View products and catalog data'),
  ('products.create', 'products', 'Create Products', 'Create new products and variants'),
  ('products.update', 'products', 'Update Products', 'Edit existing products and variants'),
  ('products.delete', 'products', 'Delete Products', 'Archive or delete products'),
  ('products.view_cost', 'products', 'View Cost', 'View product purchase price and cost margins')
on conflict(permission_key) do update set module=excluded.module, name=excluded.name, description=excluded.description;

insert into public.role_permissions(role_id, permission_id, company_id, is_allowed)
select r.id, p.id, r.company_id, true from public.roles r cross join public.permissions p
where r.code in ('OWNER', 'ADMIN') and p.permission_key like 'products.%'
on conflict(role_id, permission_id) do update set is_allowed=true;

-- 6. RECREATE TABLES

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  parent_id uuid,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code),
  unique (company_id, id),
  constraint categories_parent_company_fk foreign key (company_id, parent_id)
    references public.categories(company_id, id) on delete restrict,
  constraint categories_not_own_parent_check check (parent_id is null or parent_id <> id)
);
create unique index categories_company_name_active_uidx on public.categories(company_id, lower(name)) where deleted_at is null;
create index categories_company_parent_idx on public.categories(company_id, parent_id) where deleted_at is null;

-- Brands
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code),
  unique (company_id, id)
);
create unique index brands_company_name_active_uidx on public.brands(company_id, lower(name)) where deleted_at is null;

-- Units of Measure
create table public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  symbol text not null check (btrim(symbol) <> ''),
  decimal_places smallint not null default 0 check (decimal_places between 0 and 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code),
  unique (company_id, id)
);
create unique index units_company_name_uidx on public.units(company_id, lower(name));

-- Products Master
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_code text not null check (btrim(product_code) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  category_id uuid not null,
  brand_id uuid,
  base_unit_id uuid not null,
  product_status public.product_status not null default 'active',
  has_variants boolean not null default false,
  track_stock boolean not null default true,
  allow_negative_stock boolean not null default false,
  minimum_stock numeric(18,4) not null default 0 check (minimum_stock >= 0),
  reorder_level numeric(18,4) not null default 0 check (reorder_level >= 0),
  default_warranty_days integer not null default 0 check (default_warranty_days >= 0),
  preferred_vendor_id uuid,
  image_url text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, product_code),
  unique (company_id, id),
  constraint products_category_company_fk foreign key (company_id, category_id) references public.categories(company_id, id) on delete restrict,
  constraint products_brand_company_fk foreign key (company_id, brand_id) references public.brands(company_id, id) on delete restrict,
  constraint products_unit_company_fk foreign key (company_id, base_unit_id) references public.units(company_id, id) on delete restrict,
  constraint products_vendor_company_fk foreign key (company_id, preferred_vendor_id) references public.vendors(company_id, id) on delete restrict
);
create index products_company_name_idx on public.products(company_id, name) where deleted_at is null;
create index products_category_idx on public.products(company_id, category_id) where deleted_at is null;

-- Product Variants
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_id uuid not null,
  sku text not null check (btrim(sku) <> ''),
  barcode text,
  variant_name text not null default 'Default' check (btrim(variant_name) <> ''),
  size text,
  colour text,
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  purchase_price numeric(18,2) not null default 0 check (purchase_price >= 0),
  average_cost numeric(18,2) not null default 0 check (average_cost >= 0),
  retail_price numeric(18,2) not null default 0 check (retail_price >= 0),
  wholesale_price numeric(18,2) not null default 0 check (wholesale_price >= 0),
  special_price numeric(18,2) not null default 0 check (special_price >= 0),
  minimum_price numeric(18,2) not null default 0 check (minimum_price >= 0),
  commission_percentage numeric(7,4) not null default 0 check (commission_percentage between 0 and 100),
  default_discount_percentage numeric(7,4) not null default 0 check (default_discount_percentage between 0 and 100),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, sku),
  unique (company_id, id),
  constraint product_variants_product_company_fk foreign key (company_id, product_id) references public.products(company_id, id) on delete cascade,
  constraint product_variants_price_floor_check check (minimum_price <= greatest(retail_price, wholesale_price, special_price, 0))
);
create unique index product_variants_company_barcode_uidx on public.product_variants(company_id, barcode) where barcode is not null and deleted_at is null;
create unique index product_variants_one_default_uidx on public.product_variants(product_id) where is_default and deleted_at is null;
create index product_variants_product_idx on public.product_variants(company_id, product_id) where deleted_at is null;

-- Product Barcodes (Multiple barcodes per variant)
create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_variant_id uuid not null,
  barcode text not null check (btrim(barcode) <> ''),
  barcode_type text,
  pack_quantity numeric(18,4) not null default 1 check (pack_quantity > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, barcode),
  constraint product_barcodes_variant_company_fk foreign key (company_id, product_variant_id) references public.product_variants(company_id, id) on delete cascade
);
create unique index product_barcodes_one_primary_uidx on public.product_barcodes(product_variant_id) where is_primary;
create index product_barcodes_variant_idx on public.product_barcodes(product_variant_id);

-- Product Unit Conversions
create table public.product_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_id uuid not null,
  from_unit_id uuid not null,
  to_unit_id uuid not null,
  conversion_factor numeric(18,4) not null check (conversion_factor > 0),
  created_at timestamptz not null default now(),
  unique (product_id, from_unit_id, to_unit_id),
  constraint product_unit_conversions_different_units_check check (from_unit_id <> to_unit_id),
  constraint conversions_product_company_fk foreign key (company_id, product_id) references public.products(company_id, id) on delete cascade,
  constraint conversions_from_unit_company_fk foreign key (company_id, from_unit_id) references public.units(company_id, id) on delete restrict,
  constraint conversions_to_unit_company_fk foreign key (company_id, to_unit_id) references public.units(company_id, id) on delete restrict
);

-- 7. BUSINESS LOGIC & VALIDATION FUNCTIONS

-- Enforce barcode crosscheck uniqueness
create or replace function public.enforce_barcode_uniqueness() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'product_variants' and new.barcode is not null and exists (
    select 1 from public.product_barcodes b where b.company_id = new.company_id and b.barcode = new.barcode
  ) then raise exception 'Barcode already exists for this company';
  elsif tg_table_name = 'product_barcodes' and exists (
    select 1 from public.product_variants v where v.company_id = new.company_id and v.barcode = new.barcode and v.deleted_at is null
  ) then raise exception 'Barcode already exists for this company';
  end if;
  return new;
end;
$$;

create trigger product_variants_barcode_crosscheck
  before insert or update of barcode, company_id on public.product_variants
  for each row execute function public.enforce_barcode_uniqueness();

create trigger product_barcodes_barcode_crosscheck
  before insert or update of barcode, company_id on public.product_barcodes
  for each row execute function public.enforce_barcode_uniqueness();

-- Ensure product retains at least one active variant
create or replace function public.ensure_product_has_variant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_product uuid;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'products' then
      target_product := old.id;
    else
      target_product := old.product_id;
    end if;
  else
    if tg_table_name = 'products' then
      target_product := new.id;
    else
      target_product := new.product_id;
    end if;
  end if;

  if exists (select 1 from public.products p where p.id = target_product and p.deleted_at is null)
     and not exists (select 1 from public.product_variants v where v.product_id = target_product and v.deleted_at is null) then
    raise exception 'Every product must retain at least one variant';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create constraint trigger products_require_variant
  after insert or update on public.products deferrable initially deferred
  for each row execute function public.ensure_product_has_variant();

create constraint trigger variants_require_variant
  after delete or update of deleted_at, product_id on public.product_variants deferrable initially deferred
  for each row execute function public.ensure_product_has_variant();

-- Audit logging triggers
do $$
declare n text;
begin
  foreach n in array array['categories','brands','units','products','product_variants','product_barcodes'] loop
    execute format('drop trigger if exists %I_audit on public.%I', n, n);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()', n, n);
  end loop;
end $$;

-- 8. ROW LEVEL SECURITY (RLS)
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.units enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.product_unit_conversions enable row level security;

revoke all on public.categories, public.brands, public.units, public.products, public.product_variants, public.product_barcodes, public.product_unit_conversions from anon;
grant select, insert, update, delete on public.categories, public.brands, public.units, public.products, public.product_variants, public.product_barcodes, public.product_unit_conversions to authenticated;

create policy categories_read on public.categories for select to authenticated
  using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy categories_write on public.categories for all to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('products.create'))
  with check (company_id = public.current_user_company_id());

create policy brands_read on public.brands for select to authenticated
  using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy brands_write on public.brands for all to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('products.create'))
  with check (company_id = public.current_user_company_id());

create policy units_read on public.units for select to authenticated
  using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy units_write on public.units for all to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('products.create'))
  with check (company_id = public.current_user_company_id());

create policy products_read on public.products for select to authenticated
  using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy products_insert on public.products for insert to authenticated
  with check (company_id = public.current_user_company_id() and public.user_has_permission('products.create'));
create policy products_update on public.products for update to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('products.update'))
  with check (company_id = public.current_user_company_id());
create policy products_delete on public.products for delete to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('products.delete'));

create policy product_variants_read on public.product_variants for select to authenticated
  using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy product_variants_insert on public.product_variants for insert to authenticated
  with check (company_id = public.current_user_company_id() and public.user_has_permission('products.create'));
create policy product_variants_update on public.product_variants for update to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('products.update'))
  with check (company_id = public.current_user_company_id());
create policy product_variants_delete on public.product_variants for delete to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('products.delete'));

create policy product_barcodes_read on public.product_barcodes for select to authenticated
  using (company_id = public.current_user_company_id());
create policy product_barcodes_write on public.product_barcodes for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

create policy product_unit_conversions_read on public.product_unit_conversions for select to authenticated
  using (company_id = public.current_user_company_id());
create policy product_unit_conversions_write on public.product_unit_conversions for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

-- 9. SECURE PROJECTION VIEWS

-- product_variants_secure
create view public.product_variants_secure with (security_barrier=true) as
select id, company_id, product_id, sku, barcode, variant_name, size, colour, attributes,
 case when public.user_has_permission('products.view_cost') then purchase_price end purchase_price,
 case when public.user_has_permission('products.view_cost') then average_cost end average_cost,
 retail_price, wholesale_price, special_price,
 case when public.user_has_permission('products.view_cost') then minimum_price end minimum_price,
 commission_percentage, default_discount_percentage, is_default, is_active, created_at, created_by, updated_at, updated_by, deleted_at
from public.product_variants where company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view');

revoke all on public.product_variants_secure from public, anon;
grant select on public.product_variants_secure to authenticated;

-- pos_product_search (For POS scanner lookup)
create view public.pos_product_search with (security_invoker=false, security_barrier=true) as
select v.company_id, v.id as product_variant_id, p.id as product_id, p.product_code, p.name as product_name,
 v.variant_name, v.sku, coalesce(v.barcode, pb.barcode) as barcode, p.base_unit_id, u.name as unit_name,
 v.retail_price, v.wholesale_price, v.special_price,
 case when public.user_has_permission('sales.view_cost') then
   (select m.unit_cost from public.stock_movements m where m.company_id = v.company_id and m.product_variant_id = v.id and m.quantity_in > 0 order by m.movement_date desc, m.created_at desc limit 1)
 end as last_cost,
 coalesce((select sum(sm.quantity_in - sm.quantity_out) from public.stock_movements sm where sm.company_id = v.company_id and sm.product_variant_id = v.id), 0)::numeric(18,4) as available_quantity,
 p.track_stock, p.allow_negative_stock, 0::numeric(7,4) as tax_rate
from public.product_variants v
join public.products p on p.id = v.product_id and p.company_id = v.company_id
join public.units u on u.id = p.base_unit_id
left join lateral (select barcode from public.product_barcodes z where z.product_variant_id = v.id order by z.is_primary desc, z.created_at limit 1) pb on true
where v.is_active and v.deleted_at is null and p.product_status = 'active' and p.deleted_at is null
 and v.company_id = public.current_user_company_id() and public.user_has_permission('sales.create');

grant select on public.pos_product_search to authenticated;
revoke all on public.pos_product_search from anon;

-- 10. RPC STORED PROCEDURES

-- create_product_with_default_variant
create or replace function public.create_product_with_default_variant(p_product jsonb, p_variant jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  company_uuid uuid := public.current_user_company_id();
  product_uuid uuid;
begin
  if company_uuid is null or not public.user_has_permission('products.create') then
    raise exception 'Not authorised to create products' using errcode = '42501';
  end if;

  insert into public.products(
    company_id, product_code, name, description, category_id, brand_id, base_unit_id,
    product_status, has_variants, track_stock, allow_negative_stock, minimum_stock,
    reorder_level, default_warranty_days, preferred_vendor_id, image_url, notes
  )
  values(
    company_uuid,
    btrim(p_product->>'product_code'),
    btrim(p_product->>'name'),
    nullif(p_product->>'description', ''),
    (p_product->>'category_id')::uuid,
    nullif(p_product->>'brand_id', '')::uuid,
    (p_product->>'base_unit_id')::uuid,
    coalesce((p_product->>'product_status')::public.product_status, 'active'),
    coalesce((p_product->>'has_variants')::boolean, false),
    coalesce((p_product->>'track_stock')::boolean, true),
    coalesce((p_product->>'allow_negative_stock')::boolean, false),
    coalesce((p_product->>'minimum_stock')::numeric, 0),
    coalesce((p_product->>'reorder_level')::numeric, 0),
    coalesce((p_product->>'default_warranty_days')::integer, 0),
    nullif(p_product->>'preferred_vendor_id', '')::uuid,
    nullif(p_product->>'image_url', ''),
    nullif(p_product->>'notes', '')
  ) returning id into product_uuid;

  insert into public.product_variants(
    company_id, product_id, sku, barcode, variant_name, size, colour, attributes,
    purchase_price, average_cost, retail_price, wholesale_price, special_price,
    minimum_price, commission_percentage, default_discount_percentage, is_default, is_active
  )
  values(
    company_uuid,
    product_uuid,
    btrim(p_variant->>'sku'),
    nullif(btrim(p_variant->>'barcode'), ''),
    coalesce(nullif(btrim(p_variant->>'variant_name'), ''), 'Default'),
    nullif(p_variant->>'size', ''),
    nullif(p_variant->>'colour', ''),
    coalesce(p_variant->'attributes', '{}'::jsonb),
    coalesce((p_variant->>'purchase_price')::numeric, 0),
    coalesce((p_variant->>'average_cost')::numeric, 0),
    coalesce((p_variant->>'retail_price')::numeric, 0),
    coalesce((p_variant->>'wholesale_price')::numeric, 0),
    coalesce((p_variant->>'special_price')::numeric, 0),
    coalesce((p_variant->>'minimum_price')::numeric, 0),
    coalesce((p_variant->>'commission_percentage')::numeric, 0),
    coalesce((p_variant->>'default_discount_percentage')::numeric, 0),
    true,
    true
  );

  return product_uuid;
end;
$$;

-- resolve_product_barcode
create or replace function public.resolve_product_barcode(p_barcode text)
returns table(product_variant_id uuid, product_id uuid, sku text, variant_name text, pack_quantity numeric)
language sql stable security invoker set search_path = '' as $$
  select v.id, v.product_id, v.sku, v.variant_name, 1::numeric
  from public.product_variants_secure v where v.barcode = btrim(p_barcode)
  union all
  select v.id, v.product_id, v.sku, v.variant_name, b.pack_quantity
  from public.product_barcodes b
  join public.product_variants_secure v on v.id = b.product_variant_id
  where b.barcode = btrim(p_barcode)
  limit 1;
$$;

-- 11. GRANT EXECUTION PERMISSIONS
revoke all on function public.create_product_with_default_variant(jsonb, jsonb) from public, anon;
grant execute on function public.create_product_with_default_variant(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.resolve_product_barcode(text) from public, anon;
grant execute on function public.resolve_product_barcode(text) to authenticated, service_role;

-- 12. SEED DEFAULT MASTER CATALOG DATA (If none exist for company)
insert into public.categories (company_id, code, name, description, is_active)
select c.id, 'GEN', 'General', 'Default product category', true
from public.companies c
where not exists (select 1 from public.categories cat where cat.company_id = c.id)
on conflict do nothing;

insert into public.brands (company_id, code, name, description, is_active)
select c.id, 'GEN', 'General', 'Default brand', true
from public.companies c
where not exists (select 1 from public.brands b where b.company_id = c.id)
on conflict do nothing;

insert into public.units (company_id, code, name, symbol, decimal_places, is_active)
select c.id, 'PCS', 'Pieces', 'pcs', 0, true
from public.companies c
where not exists (select 1 from public.units u where u.company_id = c.id)
on conflict do nothing;

-- Bypass for service_role
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;
