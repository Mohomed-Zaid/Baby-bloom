-- Product master data; deliberately excludes stock balances and movements
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
  unique (company_id, code),
  unique (company_id, id)
);
create unique index units_company_name_uidx on public.units(company_id, lower(name));

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
  discount_percentage numeric(7,4) not null default 0 check (discount_percentage between 0 and 100),
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
  constraint product_variants_price_floor_check check (minimum_price <= greatest(retail_price, wholesale_price, special_price))
);
create unique index product_variants_company_barcode_uidx on public.product_variants(company_id, barcode) where barcode is not null and deleted_at is null;
create unique index product_variants_one_default_uidx on public.product_variants(product_id) where is_default and deleted_at is null;
create index product_variants_product_idx on public.product_variants(company_id, product_id) where deleted_at is null;

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

create function public.enforce_barcode_uniqueness() returns trigger
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
create trigger product_variants_barcode_crosscheck before insert or update of barcode, company_id on public.product_variants for each row execute function public.enforce_barcode_uniqueness();
create trigger product_barcodes_barcode_crosscheck before insert or update of barcode, company_id on public.product_barcodes for each row execute function public.enforce_barcode_uniqueness();

create function public.ensure_product_has_variant() returns trigger
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
create constraint trigger products_require_variant after insert or update on public.products deferrable initially deferred for each row execute function public.ensure_product_has_variant();
create constraint trigger variants_require_variant after delete or update of deleted_at, product_id on public.product_variants deferrable initially deferred for each row execute function public.ensure_product_has_variant();