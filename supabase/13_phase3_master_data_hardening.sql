-- Phase 3 master-data hardening; additive so deployed Phase 1/2 migrations remain immutable.

alter table public.warehouses add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.warehouses add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.stock_locations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.stock_locations add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.categories add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.categories add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.brands add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.brands add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.units add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.units add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.units add column if not exists deleted_at timestamptz;
alter table public.banks add column if not exists updated_at timestamptz not null default now();
alter table public.banks add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.banks add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.banks add column if not exists deleted_at timestamptz;
alter table public.bank_branches add column if not exists updated_at timestamptz not null default now();
alter table public.bank_branches add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.bank_branches add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.bank_branches add column if not exists deleted_at timestamptz;
alter table public.bank_accounts add column if not exists deleted_at timestamptz;
alter table public.chart_of_accounts add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.chart_of_accounts add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.chart_of_accounts add column if not exists deleted_at timestamptz;
alter table public.account_mappings add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.account_mappings add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.number_sequences add column if not exists created_at timestamptz not null default now();
alter table public.number_sequences add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.number_sequences add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.product_barcodes add column if not exists updated_at timestamptz not null default now();
alter table public.product_barcodes add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.product_barcodes add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.product_unit_conversions add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.product_unit_conversions add column if not exists updated_at timestamptz not null default now();
alter table public.product_unit_conversions add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.product_unit_conversions add column if not exists deleted_at timestamptz;
alter table public.chart_of_accounts add constraint chart_control_manual_entries_check check (not is_control_account or not allow_manual_entries) not valid;

-- Match the requested vocabulary without throwing away existing records.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='discount_percentage')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='default_discount_percentage') then
    alter table public.product_variants rename column discount_percentage to default_discount_percentage;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='bank_accounts' and column_name='account_type')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='bank_accounts' and column_name='account_kind') then
    alter table public.bank_accounts rename column account_type to account_kind;
  end if;
end $$;

create or replace function public.validate_active_product_references() returns trigger
language plpgsql set search_path='' as $$
begin
  if not exists (select 1 from public.categories c where c.id=new.category_id and c.company_id=new.company_id and c.is_active and c.deleted_at is null) then raise exception 'An active category from the same company is required'; end if;
  if new.brand_id is not null and not exists (select 1 from public.brands b where b.id=new.brand_id and b.company_id=new.company_id and b.is_active and b.deleted_at is null) then raise exception 'An active brand from the same company is required'; end if;
  if not exists (select 1 from public.units u where u.id=new.base_unit_id and u.company_id=new.company_id and u.is_active and u.deleted_at is null) then raise exception 'An active base unit from the same company is required'; end if;
  if new.preferred_vendor_id is not null and not exists (select 1 from public.vendors v where v.id=new.preferred_vendor_id and v.company_id=new.company_id and v.status='active' and v.deleted_at is null) then raise exception 'An active vendor from the same company is required'; end if;
  return new;
end; $$;
create trigger products_validate_active_references before insert or update of category_id,brand_id,base_unit_id,preferred_vendor_id on public.products for each row execute function public.validate_active_product_references();

create or replace function public.prevent_category_cycle() returns trigger
language plpgsql set search_path='' as $$
declare found_cycle boolean;
begin
  if new.parent_id is null then return new; end if;
  with recursive ancestors(id,parent_id) as (
    select c.id,c.parent_id from public.categories c where c.id=new.parent_id and c.company_id=new.company_id
    union all select c.id,c.parent_id from public.categories c join ancestors a on c.id=a.parent_id where c.company_id=new.company_id
  ) select exists(select 1 from ancestors where id=new.id) into found_cycle;
  if found_cycle then raise exception 'Circular category hierarchy is not allowed'; end if;
  return new;
end; $$;
create trigger categories_prevent_cycle before insert or update of parent_id on public.categories for each row execute function public.prevent_category_cycle();

create or replace function public.protect_default_cash_customer() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.customer_code='C-001' and old.customer_type='cash' and (tg_op='DELETE' or new.deleted_at is not null or not new.is_active or new.customer_code<>old.customer_code) then
    raise exception 'The default Cash Customer cannot be deleted, deactivated, or recoded';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger customers_protect_default before update or delete on public.customers for each row execute function public.protect_default_cash_customer();

create or replace function public.protect_system_account() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.is_system_account and (tg_op='DELETE' or new.deleted_at is not null) then raise exception 'System accounts cannot be deleted'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger chart_protect_system_account before update or delete on public.chart_of_accounts for each row execute function public.protect_system_account();

create or replace function public.assign_generated_barcode() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.barcode is null or btrim(new.barcode)='' then new.barcode:='BB-'||upper(replace(gen_random_uuid()::text,'-','')); end if;
  return new;
end; $$;
create trigger product_barcodes_generate before insert on public.product_barcodes for each row execute function public.assign_generated_barcode();

create or replace function public.enforce_variant_price_permissions() returns trigger
language plpgsql set search_path='' as $$
begin
  if auth.uid() is not null and not public.user_has_permission('products.view_cost') and (
    (tg_op='INSERT' and (new.purchase_price<>0 or new.average_cost<>0 or new.minimum_price<>0)) or
    (tg_op='UPDATE' and (new.purchase_price is distinct from old.purchase_price or new.average_cost is distinct from old.average_cost or new.minimum_price is distinct from old.minimum_price))
  ) then raise exception 'products.view_cost is required to set cost fields' using errcode='42501'; end if;
  if auth.uid() is not null and tg_op='UPDATE' and not public.user_has_permission('products.change_price') and (
    new.retail_price is distinct from old.retail_price or new.wholesale_price is distinct from old.wholesale_price or
    new.special_price is distinct from old.special_price or new.default_discount_percentage is distinct from old.default_discount_percentage
  ) then raise exception 'products.change_price is required to change selling prices' using errcode='42501'; end if;
  return new;
end; $$;
create trigger product_variants_protect_prices before insert or update of purchase_price,average_cost,minimum_price,retail_price,wholesale_price,special_price,default_discount_percentage on public.product_variants for each row execute function public.enforce_variant_price_permissions();

-- Audit actions use business language while preserving complete old/new snapshots.
create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 company_uuid uuid:=nullif(payload->>'company_id','')::uuid; branch_uuid uuid:=nullif(payload->>'branch_id','')::uuid;
 record_uuid uuid:=nullif(payload->>'id','')::uuid; audit_action text;
begin
 if company_uuid is null then return case when tg_op='DELETE' then old else new end; end if;
 audit_action:=case when tg_op='INSERT' then 'CREATE' when tg_op='DELETE' then 'DELETE'
  when to_jsonb(old)?'deleted_at' and (to_jsonb(old)->>'deleted_at') is null and (to_jsonb(new)->>'deleted_at') is not null then 'DELETE'
  when to_jsonb(old)?'is_active' and (to_jsonb(old)->>'is_active')::boolean and not (to_jsonb(new)->>'is_active')::boolean then 'DEACTIVATE'
  when to_jsonb(old)?'status' and to_jsonb(old)->>'status'='active' and to_jsonb(new)->>'status'='inactive' then 'DEACTIVATE'
  when to_jsonb(old)?'product_status' and to_jsonb(old)->>'product_status'='active' and to_jsonb(new)->>'product_status'<>'active' then 'DEACTIVATE'
  else 'UPDATE' end;
 insert into public.audit_logs(company_id,branch_id,user_id,action,module,table_name,record_id,old_values,new_values)
 values(company_uuid,branch_uuid,auth.uid(),audit_action,tg_table_schema,tg_table_name,record_uuid,case when tg_op in('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in('INSERT','UPDATE') then to_jsonb(new) end);
 return case when tg_op='DELETE' then old else new end;
end; $$;

-- Product plus mandatory first variant must commit in one transaction.
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

  if exists(select 1 from public.products p where p.id = target_product and p.deleted_at is null)
     and not exists(select 1 from public.product_variants v where v.product_id = target_product and v.deleted_at is null and v.is_active)
  then
    raise exception 'Every product must retain at least one active sellable variant';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.create_product_with_default_variant(p_product jsonb,p_variant jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare company_uuid uuid:=public.current_user_company_id(); product_uuid uuid;
begin
  if company_uuid is null or not public.user_has_permission('products.create') then raise exception 'Not authorised to create products' using errcode='42501'; end if;
  insert into public.products(company_id,product_code,name,description,category_id,brand_id,base_unit_id,product_status,has_variants,track_stock,allow_negative_stock,minimum_stock,reorder_level,default_warranty_days,preferred_vendor_id,image_url,notes)
  values(company_uuid,btrim(p_product->>'product_code'),btrim(p_product->>'name'),nullif(p_product->>'description',''),(p_product->>'category_id')::uuid,nullif(p_product->>'brand_id','')::uuid,(p_product->>'base_unit_id')::uuid,coalesce((p_product->>'product_status')::public.product_status,'active'),coalesce((p_product->>'has_variants')::boolean,false),coalesce((p_product->>'track_stock')::boolean,true),coalesce((p_product->>'allow_negative_stock')::boolean,false),coalesce((p_product->>'minimum_stock')::numeric,0),coalesce((p_product->>'reorder_level')::numeric,0),coalesce((p_product->>'default_warranty_days')::integer,0),nullif(p_product->>'preferred_vendor_id','')::uuid,nullif(p_product->>'image_url',''),nullif(p_product->>'notes','')) returning id into product_uuid;
  insert into public.product_variants(company_id,product_id,sku,barcode,variant_name,size,colour,attributes,purchase_price,average_cost,retail_price,wholesale_price,special_price,minimum_price,commission_percentage,default_discount_percentage,is_default,is_active)
  values(company_uuid,product_uuid,btrim(p_variant->>'sku'),nullif(btrim(p_variant->>'barcode'),''),coalesce(nullif(btrim(p_variant->>'variant_name'),''),'Default'),nullif(p_variant->>'size',''),nullif(p_variant->>'colour',''),coalesce(p_variant->'attributes','{}'::jsonb),coalesce((p_variant->>'purchase_price')::numeric,0),coalesce((p_variant->>'average_cost')::numeric,0),coalesce((p_variant->>'retail_price')::numeric,0),coalesce((p_variant->>'wholesale_price')::numeric,0),coalesce((p_variant->>'special_price')::numeric,0),coalesce((p_variant->>'minimum_price')::numeric,0),coalesce((p_variant->>'commission_percentage')::numeric,0),coalesce((p_variant->>'default_discount_percentage')::numeric,0),true,true);
  return product_uuid;
end; $$;

revoke all on function public.create_product_with_default_variant(jsonb,jsonb) from public,anon;
grant execute on function public.create_product_with_default_variant(jsonb,jsonb) to authenticated,service_role;
revoke all on function public.validate_active_product_references() from public,anon,authenticated;
revoke all on function public.prevent_category_cycle() from public,anon,authenticated;
revoke all on function public.protect_default_cash_customer() from public,anon,authenticated;
revoke all on function public.protect_system_account() from public,anon,authenticated;
revoke all on function public.assign_generated_barcode() from public,anon,authenticated;
revoke all on function public.enforce_variant_price_permissions() from public,anon,authenticated;

drop view if exists public.product_variants_secure;
create view public.product_variants_secure with (security_barrier=true) as
select id,company_id,product_id,sku,barcode,variant_name,size,colour,attributes,
 case when public.user_has_permission('products.view_cost') then purchase_price end purchase_price,
 case when public.user_has_permission('products.view_cost') then average_cost end average_cost,
 retail_price,wholesale_price,special_price,
 case when public.user_has_permission('products.view_cost') then minimum_price end minimum_price,
 commission_percentage,default_discount_percentage,is_default,is_active,created_at,created_by,updated_at,updated_by,deleted_at
from public.product_variants where company_id=public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view');
revoke all on public.product_variants_secure from public,anon;
grant select on public.product_variants_secure to authenticated;

create or replace function public.resolve_product_barcode(p_barcode text)
returns table(product_variant_id uuid,product_id uuid,sku text,variant_name text,pack_quantity numeric)
language sql stable security invoker set search_path='' as $$
  select v.id,v.product_id,v.sku,v.variant_name,1::numeric from public.product_variants_secure v where v.barcode=btrim(p_barcode)
  union all
  select v.id,v.product_id,v.sku,v.variant_name,b.pack_quantity from public.product_barcodes b join public.product_variants_secure v on v.id=b.product_variant_id where b.barcode=btrim(p_barcode)
  limit 1
$$;
revoke all on function public.resolve_product_barcode(text) from public,anon;
grant execute on function public.resolve_product_barcode(text) to authenticated,service_role;

drop policy if exists units_read on public.units;
create policy units_read on public.units for select to authenticated using(company_id=public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
drop policy if exists banks_read on public.banks;
create policy banks_read on public.banks for select to authenticated using((company_id is null or company_id=public.current_user_company_id()) and deleted_at is null and public.user_has_permission('banking.view'));
drop policy if exists bank_branches_read on public.bank_branches;
create policy bank_branches_read on public.bank_branches for select to authenticated using((company_id is null or company_id=public.current_user_company_id()) and deleted_at is null and public.user_has_permission('banking.view'));
drop policy if exists bank_accounts_read on public.bank_accounts;
create policy bank_accounts_read on public.bank_accounts for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and deleted_at is null and public.user_has_permission('banking.view'));
drop policy if exists chart_read on public.chart_of_accounts;
create policy chart_read on public.chart_of_accounts for select to authenticated using(company_id=public.current_user_company_id() and deleted_at is null and public.user_has_permission('accounting.view'));
drop policy if exists conversions_read on public.product_unit_conversions;
create policy conversions_read on public.product_unit_conversions for select to authenticated using(company_id=public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));

revoke delete on public.customers,public.vendors,public.categories,public.brands,public.units,public.products,public.product_variants,public.warehouses,public.stock_locations,public.banks,public.bank_branches,public.bank_accounts,public.chart_of_accounts from authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array['warehouses','stock_locations','categories','brands','units','banks','bank_branches','chart_of_accounts','account_mappings','number_sequences','product_barcodes','product_unit_conversions'] loop
    execute format('drop trigger if exists %I_set_created_by on public.%I',table_name,table_name);
    execute format('create trigger %I_set_created_by before insert on public.%I for each row execute function public.set_created_by()',table_name,table_name);
  end loop;
  foreach table_name in array array['banks','bank_branches','product_barcodes','product_unit_conversions'] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I',table_name,table_name);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',table_name,table_name);
  end loop;
  foreach table_name in array array['banks','bank_branches'] loop
    execute format('drop trigger if exists %I_audit on public.%I',table_name,table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()',table_name,table_name);
  end loop;
end $$;

create index if not exists products_company_code_search_idx on public.products(company_id,lower(product_code)) where deleted_at is null;
create index if not exists product_variants_barcode_search_idx on public.product_variants(company_id,barcode) where barcode is not null and deleted_at is null;
create index if not exists product_barcodes_company_barcode_idx on public.product_barcodes(company_id,barcode);
create index if not exists customers_company_code_search_idx on public.customers(company_id,lower(customer_code)) where deleted_at is null;
create index if not exists vendors_company_code_search_idx on public.vendors(company_id,lower(vendor_code)) where deleted_at is null;
