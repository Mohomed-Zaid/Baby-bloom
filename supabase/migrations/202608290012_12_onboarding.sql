-- Controlled bootstrap. Never grant this function to anon/authenticated clients.
create function public.provision_first_company_owner(
  p_owner_user_id uuid,
  p_company_code text,
  p_company_name text,
  p_owner_full_name text,
  p_owner_username text,
  p_owner_staff_code text default 'OWN-001',
  p_branch_code text default 'HO',
  p_branch_name text default 'Head Office'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  company_uuid uuid;
  branch_uuid uuid;
  warehouse_uuid uuid;
  owner_role_uuid uuid;
begin
  if not exists (select 1 from auth.users u where u.id = p_owner_user_id) then
    raise exception 'Owner auth user does not exist';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_owner_user_id) then
    raise exception 'Owner profile is already provisioned';
  end if;

  insert into public.companies (code, name) values (upper(btrim(p_company_code)), btrim(p_company_name)) returning id into company_uuid;
  insert into public.branches (company_id, code, name, invoice_prefix, is_head_office, is_active)
  values (company_uuid, upper(btrim(p_branch_code)), btrim(p_branch_name), 'INV-', true, true) returning id into branch_uuid;
  insert into public.warehouses (company_id, branch_id, code, name, is_default, is_active)
  values (company_uuid, branch_uuid, 'MAIN', 'Main Warehouse', true, true) returning id into warehouse_uuid;
  insert into public.stock_locations (company_id, branch_id, warehouse_id, code, name, is_active)
  values (company_uuid, branch_uuid, warehouse_uuid, 'DEFAULT', 'Default Location', true);
  insert into public.profiles (id, company_id, staff_code, full_name, username, status, default_branch_id)
  values (p_owner_user_id, company_uuid, upper(btrim(p_owner_staff_code)), btrim(p_owner_full_name), lower(btrim(p_owner_username)), 'active', branch_uuid);

  insert into public.roles (company_id, code, name, description, is_system_role)
  values
    (company_uuid, 'OWNER', 'Owner', 'Full company owner access', true),
    (company_uuid, 'ADMIN', 'Administrator', 'Company administration', true),
    (company_uuid, 'MANAGER', 'Manager', 'Operational management', true),
    (company_uuid, 'CASHIER', 'Cashier', 'Point-of-sale operations', true),
    (company_uuid, 'STOCK_KEEPER', 'Stock Keeper', 'Inventory operations', true),
    (company_uuid, 'ACCOUNTANT', 'Accountant', 'Finance and accounting operations', true);
  select id into owner_role_uuid from public.roles where company_id = company_uuid and code = 'OWNER';
  insert into public.user_roles (user_id, role_id, company_id, assigned_by)
  values (p_owner_user_id, owner_role_uuid, company_uuid, null);
  insert into public.role_permissions (role_id, permission_id, company_id, is_allowed)
  select owner_role_uuid, permission.id, company_uuid, true from public.permissions permission;
  insert into public.user_branch_access (user_id, branch_id, company_id, can_view, can_transact, assigned_by)
  values (p_owner_user_id, branch_uuid, company_uuid, true, true, null);

  insert into public.customers (
    company_id, branch_id, customer_code, customer_type, name, credit_limit, credit_days,
    opening_balance, opening_balance_type, price_level, sms_enabled, is_active, created_by
  ) values (company_uuid, branch_uuid, 'C-001', 'cash', 'Cash Customer', 0, 0, 0, 'debit', 'retail', false, true, p_owner_user_id);

  insert into public.chart_of_accounts (
    company_id, account_code, account_name, account_type, normal_balance,
    is_control_account, is_system_account, allow_manual_entries
  ) values
    (company_uuid, '1000', 'Cash in Hand', 'asset', 'debit', false, true, true),
    (company_uuid, '1100', 'Accounts Receivable', 'asset', 'debit', true, true, false),
    (company_uuid, '1200', 'Inventory', 'asset', 'debit', true, true, false),
    (company_uuid, '1300', 'Bank', 'asset', 'debit', true, true, false),
    (company_uuid, '2000', 'Accounts Payable', 'liability', 'credit', true, true, false),
    (company_uuid, '2100', 'Customer Advances', 'liability', 'credit', true, true, false),
    (company_uuid, '2200', 'Supplier Advances', 'asset', 'debit', true, true, false),
    (company_uuid, '3000', 'Retained Earnings', 'equity', 'credit', true, true, false),
    (company_uuid, '4000', 'Sales Revenue', 'income', 'credit', false, true, false),
    (company_uuid, '4100', 'Sales Returns', 'income', 'debit', false, true, false),
    (company_uuid, '4200', 'Discounts Received', 'income', 'credit', false, true, false),
    (company_uuid, '5000', 'Cost of Goods Sold', 'cost_of_sales', 'debit', false, true, false),
    (company_uuid, '5100', 'Purchase Returns', 'cost_of_sales', 'credit', false, true, false),
    (company_uuid, '6000', 'Expenses', 'expense', 'debit', false, true, true),
    (company_uuid, '6100', 'Discounts Allowed', 'expense', 'debit', false, true, false);

  insert into public.account_mappings (company_id, mapping_key, account_id)
  select company_uuid, mapping.mapping_key, account.id
  from (values
    ('cash_in_hand','1000'), ('accounts_receivable','1100'), ('inventory','1200'), ('bank','1300'),
    ('accounts_payable','2000'), ('customer_advances','2100'), ('supplier_advances','2200'),
    ('retained_earnings','3000'), ('sales_revenue','4000'), ('sales_returns','4100'),
    ('discounts_received','4200'), ('cost_of_goods_sold','5000'), ('purchase_returns','5100'),
    ('expenses','6000'), ('discounts_allowed','6100')
  ) as mapping(mapping_key, account_code)
  join public.chart_of_accounts account on account.company_id = company_uuid and account.account_code = mapping.account_code;

  insert into public.number_sequences (company_id, branch_id, sequence_type, prefix, next_number, padding_length)
  select company_uuid, branch_uuid, sequence_kind, case sequence_kind
    when 'invoice' then 'INV-' when 'quotation' then 'QUO-' when 'sales_order' then 'SO-'
    when 'sales_return' then 'SR-' when 'purchase' then 'PUR-' when 'purchase_return' then 'PR-'
    when 'receipt' then 'REC-' when 'payment' then 'PAY-' when 'journal' then 'JV-'
    when 'stock_transfer' then 'ST-' when 'stock_adjustment' then 'SA-'
    when 'credit_note' then 'CN-' when 'debit_note' then 'DN-' when 'cheque' then 'CHQ-'
    when 'customer' then 'C-' when 'vendor' then 'V-' when 'product' then 'P-' end,
    1, 6
  from unnest(enum_range(null::public.sequence_type)) as sequence_kind;

  return company_uuid;
end;
$$;

revoke all on function public.provision_first_company_owner(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_first_company_owner(uuid, text, text, text, text, text, text, text) to service_role;
comment on function public.provision_first_company_owner(uuid, text, text, text, text, text, text, text)
is 'Server/CLI-only first-owner provisioning. Never expose the service-role key to a browser.';