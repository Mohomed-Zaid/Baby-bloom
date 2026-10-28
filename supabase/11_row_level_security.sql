-- Deny-by-default RLS. Helper functions are SECURITY DEFINER to avoid policy recursion.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'companies','branches','profiles','roles','permissions','user_roles','role_permissions','user_branch_access',
    'business_settings','warehouses','stock_locations','customers','vendors','categories','brands','units',
    'products','product_variants','product_barcodes','product_unit_conversions','banks','bank_branches',
    'bank_accounts','chart_of_accounts','account_mappings','number_sequences','audit_logs'
  ] loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, delete on public.companies from authenticated;

create policy companies_read_own on public.companies for select to authenticated
using (public.user_has_company_access(id));
create policy companies_update_admin on public.companies for update to authenticated
using (public.user_has_company_access(id) and public.current_user_is_admin() and public.user_has_permission('settings.update'))
with check (public.user_has_company_access(id));

create policy branches_read_authorised on public.branches for select to authenticated
using (company_id = public.current_user_company_id() and public.user_has_branch_access(id) and deleted_at is null);
create policy branches_insert_admin on public.branches for insert to authenticated
with check (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_has_permission('settings.create'));
create policy branches_update_admin on public.branches for update to authenticated
using (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_has_permission('settings.update'))
with check (company_id = public.current_user_company_id());

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = auth.uid() or (company_id = public.current_user_company_id() and public.current_user_is_admin()));
create policy profiles_update_admin on public.profiles for update to authenticated
using (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_has_permission('settings.update'))
with check (company_id = public.current_user_company_id());

create policy permissions_read_authenticated on public.permissions for select to authenticated using (true);
create policy roles_read_company on public.roles for select to authenticated using (company_id = public.current_user_company_id());
create policy roles_manage_admin on public.roles for all to authenticated
using (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_has_permission('settings.manage_permissions') and not public.role_is_assigned_to_current_user(id))
with check (company_id = public.current_user_company_id() and public.current_user_is_admin() and not public.role_is_assigned_to_current_user(id));
create policy user_roles_read_own_or_admin on public.user_roles for select to authenticated
using (user_id = auth.uid() or (company_id = public.current_user_company_id() and public.current_user_is_admin()));
create policy user_roles_manage_admin on public.user_roles for all to authenticated
using (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_has_permission('settings.manage_permissions') and user_id <> auth.uid())
with check (company_id = public.current_user_company_id() and public.current_user_is_admin() and user_id <> auth.uid());
create policy role_permissions_read_company on public.role_permissions for select to authenticated
using (company_id = public.current_user_company_id());
create policy role_permissions_manage_admin on public.role_permissions for all to authenticated
using (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_has_permission('settings.manage_permissions') and not public.role_is_assigned_to_current_user(role_id))
with check (company_id = public.current_user_company_id() and public.current_user_is_admin() and not public.role_is_assigned_to_current_user(role_id));
create policy branch_access_read_own_or_admin on public.user_branch_access for select to authenticated
using (user_id = auth.uid() or (company_id = public.current_user_company_id() and public.current_user_is_admin()));
create policy branch_access_manage_admin on public.user_branch_access for all to authenticated
using (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_has_permission('settings.manage_permissions') and user_id <> auth.uid())
with check (company_id = public.current_user_company_id() and public.current_user_is_admin() and user_id <> auth.uid());

create function public.prevent_self_security_assignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid() then
    raise exception 'Users cannot assign their own role or branch access' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger user_roles_prevent_self before insert or update on public.user_roles for each row execute function public.prevent_self_security_assignment();
create trigger branch_access_prevent_self before insert or update on public.user_branch_access for each row execute function public.prevent_self_security_assignment();

create policy settings_read on public.business_settings for select to authenticated
using (company_id = public.current_user_company_id() and public.user_has_permission('settings.view'));
create policy settings_insert on public.business_settings for insert to authenticated
with check (company_id = public.current_user_company_id() and public.user_has_permission('settings.update'));
create policy settings_update on public.business_settings for update to authenticated
using (company_id = public.current_user_company_id() and public.user_has_permission('settings.update'))
with check (company_id = public.current_user_company_id());

-- Branch-owned location/contact tables.
create policy warehouses_read on public.warehouses for select to authenticated
using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id) and deleted_at is null and public.user_has_permission('inventory.view'));
create policy warehouses_insert on public.warehouses for insert to authenticated
with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('inventory.create'));
create policy warehouses_update on public.warehouses for update to authenticated
using (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and (public.user_has_permission('inventory.update') or public.user_has_permission('inventory.delete')))
with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id));

create policy stock_locations_read on public.stock_locations for select to authenticated
using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id) and deleted_at is null and public.user_has_permission('inventory.view'));
create policy stock_locations_insert on public.stock_locations for insert to authenticated
with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('inventory.create'));
create policy stock_locations_update on public.stock_locations for update to authenticated
using (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and (public.user_has_permission('inventory.update') or public.user_has_permission('inventory.delete')))
with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id));

create policy customers_read on public.customers for select to authenticated
using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id) and deleted_at is null and public.user_has_permission('customers.view'));
create policy customers_insert on public.customers for insert to authenticated
with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('customers.create'));
create policy customers_update on public.customers for update to authenticated
using (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and (public.user_has_permission('customers.update') or public.user_has_permission('customers.delete')))
with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id));

create policy vendors_read on public.vendors for select to authenticated
using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id) and deleted_at is null and public.user_has_permission('vendors.view'));
create policy vendors_insert on public.vendors for insert to authenticated
with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('vendors.create'));
create policy vendors_update on public.vendors for update to authenticated
using (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and (public.user_has_permission('vendors.update') or public.user_has_permission('vendors.delete')))
with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id));

-- Company-owned product masters. Soft-deleted rows are absent from normal SELECT policies.
create policy categories_read on public.categories for select to authenticated using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy categories_insert on public.categories for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_has_permission('products.create'));
create policy categories_update on public.categories for update to authenticated using (company_id = public.current_user_company_id() and (public.user_has_permission('products.update') or public.user_has_permission('products.delete'))) with check (company_id = public.current_user_company_id());
create policy brands_read on public.brands for select to authenticated using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy brands_insert on public.brands for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_has_permission('products.create'));
create policy brands_update on public.brands for update to authenticated using (company_id = public.current_user_company_id() and (public.user_has_permission('products.update') or public.user_has_permission('products.delete'))) with check (company_id = public.current_user_company_id());
create policy units_read on public.units for select to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('products.view'));
create policy units_insert on public.units for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_has_permission('products.create'));
create policy units_update on public.units for update to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('products.update')) with check (company_id = public.current_user_company_id());
create policy products_read on public.products for select to authenticated using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy products_insert on public.products for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_has_permission('products.create'));
create policy products_update on public.products for update to authenticated using (company_id = public.current_user_company_id() and (public.user_has_permission('products.update') or public.user_has_permission('products.delete'))) with check (company_id = public.current_user_company_id());
create policy variants_read on public.product_variants for select to authenticated using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view'));
create policy variants_insert on public.product_variants for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_has_permission('products.create'));
create policy variants_update on public.product_variants for update to authenticated using (company_id = public.current_user_company_id() and (public.user_has_permission('products.update') or public.user_has_permission('products.delete'))) with check (company_id = public.current_user_company_id());
create policy barcodes_read on public.product_barcodes for select to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('products.view'));
create policy barcodes_manage on public.product_barcodes for all to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('products.update')) with check (company_id = public.current_user_company_id() and public.user_has_permission('products.update'));
create policy conversions_read on public.product_unit_conversions for select to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('products.view'));
create policy conversions_manage on public.product_unit_conversions for all to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('products.update')) with check (company_id = public.current_user_company_id() and public.user_has_permission('products.update'));

-- Cost-masking view: direct table SELECT never exposes purchase_price/average_cost/minimum_price.
revoke select on public.product_variants from authenticated;
grant select (id, company_id, product_id, sku, barcode, variant_name, size, colour, attributes,
  retail_price, wholesale_price, special_price, commission_percentage, discount_percentage,
  is_default, is_active, created_at, created_by, updated_at, updated_by, deleted_at)
on public.product_variants to authenticated;
create view public.product_variants_secure with (security_barrier = true) as
select id, company_id, product_id, sku, barcode, variant_name, size, colour, attributes,
  case when public.user_has_permission('products.view_cost') then purchase_price end as purchase_price,
  case when public.user_has_permission('products.view_cost') then average_cost end as average_cost,
  retail_price, wholesale_price, special_price,
  case when public.user_has_permission('products.view_cost') then minimum_price end as minimum_price,
  commission_percentage, discount_percentage, is_default, is_active, created_at, created_by, updated_at, updated_by
from public.product_variants
where company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('products.view');
revoke all on public.product_variants_secure from public, anon;
grant select on public.product_variants_secure to authenticated;

-- Global bank references are readable; company-owned records stay isolated.
create policy banks_read on public.banks for select to authenticated using (company_id is null or company_id = public.current_user_company_id());
create policy banks_insert on public.banks for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_has_permission('banking.create'));
create policy banks_update on public.banks for update to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('banking.update')) with check (company_id = public.current_user_company_id());
create policy bank_branches_read on public.bank_branches for select to authenticated using (company_id is null or company_id = public.current_user_company_id());
create policy bank_branches_insert on public.bank_branches for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_has_permission('banking.create'));
create policy bank_branches_update on public.bank_branches for update to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('banking.update')) with check (company_id = public.current_user_company_id());
create policy bank_accounts_read on public.bank_accounts for select to authenticated using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('banking.view'));
create policy bank_accounts_insert on public.bank_accounts for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('banking.create'));
create policy bank_accounts_update on public.bank_accounts for update to authenticated using (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('banking.update')) with check (company_id = public.current_user_company_id() and public.user_can_transact_in_branch(branch_id));

create policy chart_read on public.chart_of_accounts for select to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('accounting.view'));
create policy chart_insert on public.chart_of_accounts for insert to authenticated with check (company_id = public.current_user_company_id() and public.user_has_permission('accounting.create'));
create policy chart_update on public.chart_of_accounts for update to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('accounting.update')) with check (company_id = public.current_user_company_id());
create policy mappings_read on public.account_mappings for select to authenticated using (company_id = public.current_user_company_id() and public.user_has_permission('accounting.view'));
create policy mappings_manage on public.account_mappings for all to authenticated using (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_has_permission('accounting.update')) with check (company_id = public.current_user_company_id());

create policy sequences_read on public.number_sequences for select to authenticated using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('settings.view'));
create policy sequences_insert on public.number_sequences for insert to authenticated with check (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('settings.update'));
create policy sequences_update on public.number_sequences for update to authenticated using (company_id = public.current_user_company_id() and public.current_user_is_admin() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('settings.update')) with check (company_id = public.current_user_company_id());

create policy audit_read_authorised on public.audit_logs for select to authenticated
using (company_id = public.current_user_company_id() and (branch_id is null or public.user_has_branch_access(branch_id)) and public.user_has_permission('audit.view'));

-- Sequences are owned by tables, not serials; explicit grants are sufficient.