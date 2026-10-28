-- ==============================================================================
-- Baby Bloom Business Suite - Phase 10 Production Database Seed
-- Multi-Branch Data Seeding, Standard Chart of Accounts & Starter Inventory
-- Strictly Idempotent: Can be executed repeatedly without errors or duplicates.
-- ==============================================================================

-- 0. Ensure price permission trigger accommodates admin/seed execution when auth.uid() is null
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

do $$
declare
  v_company_id uuid;
  v_branch_main_id uuid;
  v_branch_ne_id uuid;
  v_wh_main_id uuid;
  v_wh_ne_id uuid;
  v_loc_main_id uuid;
  v_loc_ne_id uuid;
  v_cat_feeding uuid;
  v_cat_care uuid;
  v_cat_toys uuid;
  v_cat_clothing uuid;
  v_brand_avent uuid;
  v_brand_bear uuid;
  v_brand_generic uuid;
  v_unit_pcs uuid;
  v_unit_box uuid;
  v_unit_pack uuid;
  v_prod_avent uuid;
  v_prod_brush uuid;
  v_prod_clay uuid;
  v_prod_carrier uuid;
  v_var_avent uuid;
  v_var_brush uuid;
  v_var_clay uuid;
  v_var_carrier uuid;
  v_bank_comb uuid;
  v_bank_hnb uuid;
  v_bbranch_comb uuid;
  v_bbranch_hnb uuid;
  v_vendor_avent uuid;
  v_vendor_brave uuid;
  v_vendor_kiddies uuid;
  v_cust_cash uuid;
  v_cust_abb uuid;
  v_acc_comb uuid;
  v_acc_hnb uuid;
begin
  -- --------------------------------------------------------------------------
  -- 1. PRIMARY COMPANY: Baby Bloom (Pvt) Ltd
  -- --------------------------------------------------------------------------
  select id into v_company_id from public.companies where code = 'BB-LTD';
  if v_company_id is null then
    -- Check if first default company exists, or insert new
    select id into v_company_id from public.companies order by created_at asc limit 1;
  end if;

  if v_company_id is null then
    insert into public.companies (code, name, is_active)
    values ('BB-LTD', 'Baby Bloom (Pvt) Ltd', true)
    returning id into v_company_id;
  else
    update public.companies
    set name = 'Baby Bloom (Pvt) Ltd', is_active = true
    where id = v_company_id;
  end if;

  -- --------------------------------------------------------------------------
  -- 2. BRANCHES: Main Store - Mount Lavinia & Nuwara Eliya Branch
  -- --------------------------------------------------------------------------
  -- Branch 1: Main Store - Mount Lavinia (Head Office)
  select id into v_branch_main_id from public.branches where company_id = v_company_id and code = '0001';
  if v_branch_main_id is null then
    -- If an existing head office branch exists, update its code
    select id into v_branch_main_id from public.branches where company_id = v_company_id and is_head_office = true limit 1;
    if v_branch_main_id is not null then
      update public.branches
      set code = '0001', name = 'Main Store - Mount Lavinia', invoice_prefix = 'INV-'
      where id = v_branch_main_id;
    else
      insert into public.branches (company_id, code, name, invoice_prefix, is_head_office, is_active)
      values (v_company_id, '0001', 'Main Store - Mount Lavinia', 'INV-', true, true)
      returning id into v_branch_main_id;
    end if;
  else
    update public.branches
    set name = 'Main Store - Mount Lavinia', is_head_office = true, is_active = true
    where id = v_branch_main_id;
  end if;

  -- Branch 2: Nuwara Eliya Branch
  select id into v_branch_ne_id from public.branches where company_id = v_company_id and code = '0002';
  if v_branch_ne_id is null then
    insert into public.branches (company_id, code, name, invoice_prefix, is_head_office, is_active)
    values (v_company_id, '0002', 'Nuwara Eliya Branch', 'NE-', false, true)
    returning id into v_branch_ne_id;
  end if;

  -- --------------------------------------------------------------------------
  -- 3. WAREHOUSES & DEFAULT STOCK LOCATIONS
  -- --------------------------------------------------------------------------
  -- Main Store Warehouse
  select id into v_wh_main_id from public.warehouses where company_id = v_company_id and branch_id = v_branch_main_id and code = 'MAIN';
  if v_wh_main_id is null then
    insert into public.warehouses (company_id, branch_id, code, name, is_default, is_active)
    values (v_company_id, v_branch_main_id, 'MAIN', 'Main Store Warehouse', true, true)
    returning id into v_wh_main_id;
  end if;

  select id into v_loc_main_id from public.stock_locations where company_id = v_company_id and branch_id = v_branch_main_id and warehouse_id = v_wh_main_id and code = 'DEFAULT';
  if v_loc_main_id is null then
    insert into public.stock_locations (company_id, branch_id, warehouse_id, code, name, is_active)
    values (v_company_id, v_branch_main_id, v_wh_main_id, 'DEFAULT', 'Default Mount Lavinia Shelf', true)
    returning id into v_loc_main_id;
  end if;

  -- Nuwara Eliya Warehouse
  select id into v_wh_ne_id from public.warehouses where company_id = v_company_id and branch_id = v_branch_ne_id and code = 'WH-NE';
  if v_wh_ne_id is null then
    insert into public.warehouses (company_id, branch_id, code, name, is_default, is_active)
    values (v_company_id, v_branch_ne_id, 'WH-NE', 'Nuwara Eliya Store Warehouse', true, true)
    returning id into v_wh_ne_id;
  end if;

  select id into v_loc_ne_id from public.stock_locations where company_id = v_company_id and branch_id = v_branch_ne_id and warehouse_id = v_wh_ne_id and code = 'DEFAULT';
  if v_loc_ne_id is null then
    insert into public.stock_locations (company_id, branch_id, warehouse_id, code, name, is_active)
    values (v_company_id, v_branch_ne_id, v_wh_ne_id, 'DEFAULT', 'Default Nuwara Eliya Shelf', true)
    returning id into v_loc_ne_id;
  end if;

  -- --------------------------------------------------------------------------
  -- 4. POS REGISTERS / COUNTERS
  -- --------------------------------------------------------------------------
  if not exists (select 1 from public.pos_registers where company_id = v_company_id and branch_id = v_branch_main_id and register_code = 'REG-01') then
    insert into public.pos_registers (company_id, branch_id, register_code, name, is_active)
    values (v_company_id, v_branch_main_id, 'REG-01', 'Counter 01', true);
  end if;

  if not exists (select 1 from public.pos_registers where company_id = v_company_id and branch_id = v_branch_ne_id and register_code = 'REG-NE01') then
    insert into public.pos_registers (company_id, branch_id, register_code, name, is_active)
    values (v_company_id, v_branch_ne_id, 'REG-NE01', 'Counter NE-01', true);
  end if;

  -- --------------------------------------------------------------------------
  -- 5. STANDARD SRI LANKAN CHART OF ACCOUNTS
  -- --------------------------------------------------------------------------
  insert into public.chart_of_accounts (
    company_id, account_code, account_name, account_type, normal_balance, is_control_account, is_system_account, allow_manual_entries
  ) values
    -- Assets (1000 - 1999)
    (v_company_id, '1000', 'Cash in Hand', 'asset', 'debit', false, true, true),
    (v_company_id, '1010', 'Petty Cash', 'asset', 'debit', false, true, true),
    (v_company_id, '1020', 'Commercial Bank A/C', 'asset', 'debit', true, true, false),
    (v_company_id, '1030', 'Hatton National Bank A/C', 'asset', 'debit', true, true, false),
    (v_company_id, '1050', 'Inward Cheques in Hand', 'asset', 'debit', false, true, true),
    (v_company_id, '1100', 'Accounts Receivable', 'asset', 'debit', true, true, false),
    (v_company_id, '1200', 'Inventory Asset', 'asset', 'debit', true, true, false),
    -- Liabilities (2000 - 2999)
    (v_company_id, '2000', 'Accounts Payable', 'liability', 'credit', true, true, false),
    (v_company_id, '2050', 'Post-Dated Cheques Payable', 'liability', 'credit', false, true, true),
    (v_company_id, '2100', 'Customer Advances', 'liability', 'credit', true, true, false),
    (v_company_id, '2200', 'Supplier Advances', 'asset', 'debit', true, true, false),
    -- Equity (3000 - 3999)
    (v_company_id, '3000', 'Owner''s Capital', 'equity', 'credit', false, false, true),
    (v_company_id, '3100', 'Retained Earnings', 'equity', 'credit', true, true, false),
    -- Revenue (4000 - 4999)
    (v_company_id, '4000', 'Retail Sales', 'income', 'credit', false, true, false),
    (v_company_id, '4010', 'Wholesale Sales', 'income', 'credit', false, false, true),
    (v_company_id, '4020', 'Delivery Income', 'income', 'credit', false, false, true),
    (v_company_id, '4100', 'Sales Returns', 'income', 'debit', false, true, false),
    (v_company_id, '4200', 'Discounts Received', 'income', 'credit', false, true, false),
    -- Cost of Sales (5000 - 5999)
    (v_company_id, '5000', 'Cost of Goods Sold', 'cost_of_sales', 'debit', false, true, false),
    (v_company_id, '5100', 'Purchase Returns', 'cost_of_sales', 'credit', false, true, false),
    -- Expenses (6000 - 6999)
    (v_company_id, '6000', 'Rent Expense', 'expense', 'debit', false, false, true),
    (v_company_id, '6010', 'Staff Salaries', 'expense', 'debit', false, false, true),
    (v_company_id, '6020', 'Electricity & Water', 'expense', 'debit', false, false, true),
    (v_company_id, '6030', 'Card Machine Commission', 'expense', 'debit', false, false, true),
    (v_company_id, '6100', 'Discounts Allowed', 'expense', 'debit', false, true, false)
  on conflict (company_id, account_code) do update set
    account_name = excluded.account_name,
    account_type = excluded.account_type,
    normal_balance = excluded.normal_balance;

  -- --------------------------------------------------------------------------
  -- 6. ACCOUNT MAPPINGS FOR AUTOMATED POSTINGS
  -- --------------------------------------------------------------------------
  delete from public.account_mappings where company_id = v_company_id;

  insert into public.account_mappings (company_id, mapping_key, account_id)
  select v_company_id, m.mapping_key, coa.id
  from (values
    ('cash_in_hand', '1000'),
    ('accounts_receivable', '1100'),
    ('inventory', '1200'),
    ('bank', '1020'),
    ('accounts_payable', '2000'),
    ('customer_advances', '2100'),
    ('supplier_advances', '2200'),
    ('retained_earnings', '3100'),
    ('sales_revenue', '4000'),
    ('sales_returns', '4100'),
    ('discounts_received', '4200'),
    ('cost_of_goods_sold', '5000'),
    ('purchase_returns', '5100'),
    ('expenses', '6000'),
    ('discounts_allowed', '6100')
  ) as m(mapping_key, account_code)
  join public.chart_of_accounts coa on coa.company_id = v_company_id and coa.account_code = m.account_code;

  -- --------------------------------------------------------------------------
  -- 7. BANKS & BANK ACCOUNTS
  -- --------------------------------------------------------------------------
  -- Commercial Bank
  select id into v_bank_comb from public.banks where bank_code = 'COMB' and (company_id = v_company_id or company_id is null) limit 1;
  if v_bank_comb is null then
    insert into public.banks (company_id, bank_code, name, is_active)
    values (v_company_id, 'COMB', 'Commercial Bank of Ceylon', true)
    returning id into v_bank_comb;
  end if;

  select id into v_bbranch_comb from public.bank_branches where bank_id = v_bank_comb and branch_code = 'ML' limit 1;
  if v_bbranch_comb is null then
    insert into public.bank_branches (company_id, bank_id, branch_code, name, is_active)
    values (v_company_id, v_bank_comb, 'ML', 'Mount Lavinia Branch', true)
    returning id into v_bbranch_comb;
  end if;

  select id into v_acc_comb from public.chart_of_accounts where company_id = v_company_id and account_code = '1020';
  if not exists (select 1 from public.bank_accounts where company_id = v_company_id and account_number = '8001234567') then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='bank_accounts' and column_name='account_kind') then
      execute 'insert into public.bank_accounts (company_id, branch_id, bank_id, bank_branch_id, account_name, account_number, account_kind, ledger_account_id, is_default, is_active) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)'
      using v_company_id, v_branch_main_id, v_bank_comb, v_bbranch_comb, 'Commercial Bank Corporate A/C', '8001234567', 'Current', v_acc_comb, true, true;
    else
      execute 'insert into public.bank_accounts (company_id, branch_id, bank_id, bank_branch_id, account_name, account_number, account_type, ledger_account_id, is_default, is_active) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)'
      using v_company_id, v_branch_main_id, v_bank_comb, v_bbranch_comb, 'Commercial Bank Corporate A/C', '8001234567', 'Current', v_acc_comb, true, true;
    end if;
  end if;

  -- Hatton National Bank
  select id into v_bank_hnb from public.banks where bank_code = 'HNB' and (company_id = v_company_id or company_id is null) limit 1;
  if v_bank_hnb is null then
    insert into public.banks (company_id, bank_code, name, is_active)
    values (v_company_id, 'HNB', 'Hatton National Bank', true)
    returning id into v_bank_hnb;
  end if;

  select id into v_bbranch_hnb from public.bank_branches where bank_id = v_bank_hnb and branch_code = 'NE' limit 1;
  if v_bbranch_hnb is null then
    insert into public.bank_branches (company_id, bank_id, branch_code, name, is_active)
    values (v_company_id, v_bank_hnb, 'NE', 'Nuwara Eliya Branch', true)
    returning id into v_bbranch_hnb;
  end if;

  select id into v_acc_hnb from public.chart_of_accounts where company_id = v_company_id and account_code = '1030';
  if not exists (select 1 from public.bank_accounts where company_id = v_company_id and account_number = '0030104567') then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='bank_accounts' and column_name='account_kind') then
      execute 'insert into public.bank_accounts (company_id, branch_id, bank_id, bank_branch_id, account_name, account_number, account_kind, ledger_account_id, is_default, is_active) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)'
      using v_company_id, v_branch_ne_id, v_bank_hnb, v_bbranch_hnb, 'HNB Branch Operating A/C', '0030104567', 'Savings', v_acc_hnb, true, true;
    else
      execute 'insert into public.bank_accounts (company_id, branch_id, bank_id, bank_branch_id, account_name, account_number, account_type, ledger_account_id, is_default, is_active) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)'
      using v_company_id, v_branch_ne_id, v_bank_hnb, v_bbranch_hnb, 'HNB Branch Operating A/C', '0030104567', 'Savings', v_acc_hnb, true, true;
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- 8. PRODUCT CATEGORIES, BRANDS & UNITS
  -- --------------------------------------------------------------------------
  -- Categories
  insert into public.categories (company_id, code, name, is_active)
  values
    (v_company_id, 'FEED-NURSE', 'Feeding & Nursing', true),
    (v_company_id, 'BABY-CARE', 'Baby Care', true),
    (v_company_id, 'TOYS-ACC', 'Toys & Accessories', true),
    (v_company_id, 'CLOTHING', 'Clothing', true)
  on conflict (company_id, code) do update set name = excluded.name;

  select id into v_cat_feeding from public.categories where company_id = v_company_id and code = 'FEED-NURSE';
  select id into v_cat_care from public.categories where company_id = v_company_id and code = 'BABY-CARE';
  select id into v_cat_toys from public.categories where company_id = v_company_id and code = 'TOYS-ACC';
  select id into v_cat_clothing from public.categories where company_id = v_company_id and code = 'CLOTHING';

  -- Brands
  insert into public.brands (company_id, code, name, is_active)
  values
    (v_company_id, 'AVENT', 'Avent', true),
    (v_company_id, 'BB-BEAR', 'Baby Bear', true),
    (v_company_id, 'GENERIC', 'Generic', true)
  on conflict (company_id, code) do update set name = excluded.name;

  select id into v_brand_avent from public.brands where company_id = v_company_id and code = 'AVENT';
  select id into v_brand_bear from public.brands where company_id = v_company_id and code = 'BB-BEAR';
  select id into v_brand_generic from public.brands where company_id = v_company_id and code = 'GENERIC';

  -- Units
  insert into public.units (company_id, code, name, symbol, decimal_places, is_active)
  values
    (v_company_id, 'PCS', 'Piece', 'pcs', 0, true),
    (v_company_id, 'BOX', 'Box', 'box', 0, true),
    (v_company_id, 'PACK', 'Pack', 'pack', 0, true)
  on conflict (company_id, code) do update set name = excluded.name;

  select id into v_unit_pcs from public.units where company_id = v_company_id and code = 'PCS';
  select id into v_unit_box from public.units where company_id = v_company_id and code = 'BOX';
  select id into v_unit_pack from public.units where company_id = v_company_id and code = 'PACK';

  -- --------------------------------------------------------------------------
  -- 9. VENDORS & SUPPLIERS
  -- --------------------------------------------------------------------------
  insert into public.vendors (
    company_id, branch_id, vendor_code, name, contact_person, phone, email, credit_limit, credit_days, status
  ) values
    (v_company_id, v_branch_main_id, 'V-001', 'Avent Sri Lanka', 'Mr. Perera', '0112345678', 'orders@aventsrilanka.lk', 500000, 30, 'active'),
    (v_company_id, v_branch_main_id, 'V-002', 'Little Brave', 'Mrs. Fernando', '0119876543', 'contact@littlebrave.lk', 250000, 14, 'active'),
    (v_company_id, v_branch_main_id, 'V-003', 'Kiddies Store', 'Sales Desk', '0114567890', 'wholesale@kiddies.lk', 300000, 21, 'active')
  on conflict (company_id, vendor_code) do update set name = excluded.name;

  select id into v_vendor_avent from public.vendors where company_id = v_company_id and vendor_code = 'V-001';
  select id into v_vendor_brave from public.vendors where company_id = v_company_id and vendor_code = 'V-002';
  select id into v_vendor_kiddies from public.vendors where company_id = v_company_id and vendor_code = 'V-003';

  -- --------------------------------------------------------------------------
  -- 10. CUSTOMERS: Cash Customer & Account Credit Customer
  -- --------------------------------------------------------------------------
  insert into public.customers (
    company_id, branch_id, customer_code, customer_type, name, credit_limit, credit_days, price_level, is_active
  ) values
    (v_company_id, v_branch_main_id, 'C-001', 'cash', 'C-001 CASH CUSTOMER', 0, 0, 'retail', true),
    (v_company_id, v_branch_ne_id, 'C-002', 'retail', 'Abbarrna Nuwara Eliya', 50000, 30, 'retail', true)
  on conflict (company_id, customer_code) do update set name = excluded.name;

  select id into v_cust_cash from public.customers where company_id = v_company_id and customer_code = 'C-001';
  select id into v_cust_abb from public.customers where company_id = v_company_id and customer_code = 'C-002';

  -- --------------------------------------------------------------------------
  -- 11. STARTER PRODUCTS WITH VARIANTS & BARCODES
  -- --------------------------------------------------------------------------
  execute 'alter table public.product_variants disable trigger product_variants_protect_prices';

  -- Product 1: Avent Teat Anti-Colic 6+
  select id into v_prod_avent from public.products where company_id = v_company_id and product_code = 'P-0001';
  if v_prod_avent is null then
    insert into public.products (
      company_id, product_code, name, category_id, brand_id, base_unit_id, preferred_vendor_id, minimum_stock, reorder_level, default_warranty_days
    ) values (
      v_company_id, 'P-0001', 'Avent Teat Anti-Colic 6+', v_cat_feeding, v_brand_avent, v_unit_pcs, v_vendor_avent, 5, 10, 0
    ) returning id into v_prod_avent;
  end if;

  select id into v_var_avent from public.product_variants where company_id = v_company_id and sku = 'AV-TEAT-06';
  if v_var_avent is null then
    insert into public.product_variants (
      company_id, product_id, sku, barcode, variant_name, purchase_price, average_cost, retail_price, wholesale_price, minimum_price, is_default, is_active
    ) values (
      v_company_id, v_prod_avent, 'AV-TEAT-06', '4969248', 'Standard 6+ Pack', 1450.00, 1450.00, 1990.00, 1750.00, 1600.00, true, true
    ) returning id into v_var_avent;
  end if;

  if not exists (select 1 from public.product_barcodes where company_id = v_company_id and barcode = '5012909014120') then
    insert into public.product_barcodes (company_id, product_variant_id, barcode, barcode_type, pack_quantity, is_primary)
    values (v_company_id, v_var_avent, '5012909014120', 'EAN13', 1, true);
  end if;

  -- Product 2: Baby Bear Bottle Brush
  select id into v_prod_brush from public.products where company_id = v_company_id and product_code = 'P-0002';
  if v_prod_brush is null then
    insert into public.products (
      company_id, product_code, name, category_id, brand_id, base_unit_id, preferred_vendor_id, minimum_stock, reorder_level
    ) values (
      v_company_id, 'P-0002', 'Baby Bear Bottle Brush', v_cat_feeding, v_brand_bear, v_unit_pcs, v_vendor_brave, 10, 20
    ) returning id into v_prod_brush;
  end if;

  select id into v_var_brush from public.product_variants where company_id = v_company_id and sku = 'BB-BRUSH-01';
  if v_var_brush is null then
    insert into public.product_variants (
      company_id, product_id, sku, barcode, variant_name, purchase_price, average_cost, retail_price, wholesale_price, minimum_price, is_default, is_active
    ) values (
      v_company_id, v_prod_brush, 'BB-BRUSH-01', '4966622', 'Rotary Soft Bristle', 275.00, 275.00, 380.00, 320.00, 300.00, true, true
    ) returning id into v_var_brush;
  end if;

  if not exists (select 1 from public.product_barcodes where company_id = v_company_id and barcode = '4792100001015') then
    insert into public.product_barcodes (company_id, product_variant_id, barcode, barcode_type, pack_quantity, is_primary)
    values (v_company_id, v_var_brush, '4792100001015', 'EAN13', 1, true);
  end if;

  -- Product 3: Air Dry Clay 501
  select id into v_prod_clay from public.products where company_id = v_company_id and product_code = 'P-0003';
  if v_prod_clay is null then
    insert into public.products (
      company_id, product_code, name, category_id, brand_id, base_unit_id, preferred_vendor_id, minimum_stock, reorder_level
    ) values (
      v_company_id, 'P-0003', 'Air Dry Clay 501', v_cat_toys, v_brand_generic, v_unit_pcs, v_vendor_kiddies, 15, 30
    ) returning id into v_prod_clay;
  end if;

  select id into v_var_clay from public.product_variants where company_id = v_company_id and sku = 'ADC-501';
  if v_var_clay is null then
    insert into public.product_variants (
      company_id, product_id, sku, barcode, variant_name, purchase_price, average_cost, retail_price, wholesale_price, minimum_price, is_default, is_active
    ) values (
      v_company_id, v_prod_clay, 'ADC-501', '4967466', 'Non-Toxic White 500g', 225.00, 225.00, 350.00, 290.00, 260.00, true, true
    ) returning id into v_var_clay;
  end if;

  if not exists (select 1 from public.product_barcodes where company_id = v_company_id and barcode = '4792100002050') then
    insert into public.product_barcodes (company_id, product_variant_id, barcode, barcode_type, pack_quantity, is_primary)
    values (v_company_id, v_var_clay, '4792100002050', 'EAN13', 1, true);
  end if;

  -- Product 4: Baby Carrier with Box
  select id into v_prod_carrier from public.products where company_id = v_company_id and product_code = 'P-0004';
  if v_prod_carrier is null then
    insert into public.products (
      company_id, product_code, name, category_id, brand_id, base_unit_id, preferred_vendor_id, minimum_stock, reorder_level, default_warranty_days
    ) values (
      v_company_id, 'P-0004', 'Baby Carrier with Box', v_cat_care, v_brand_bear, v_unit_pcs, v_vendor_avent, 3, 6, 180
    ) returning id into v_prod_carrier;
  end if;

  select id into v_var_carrier from public.product_variants where company_id = v_company_id and sku = 'BC-BOX-01';
  if v_var_carrier is null then
    insert into public.product_variants (
      company_id, product_id, sku, barcode, variant_name, purchase_price, average_cost, retail_price, wholesale_price, minimum_price, is_default, is_active
    ) values (
      v_company_id, v_prod_carrier, 'BC-BOX-01', '5094162', 'Ergonomic 3-in-1', 3450.00, 3450.00, 4950.00, 4200.00, 3900.00, true, true
    ) returning id into v_var_carrier;
  end if;

  if not exists (select 1 from public.product_barcodes where company_id = v_company_id and barcode = '4792100003095') then
    insert into public.product_barcodes (company_id, product_variant_id, barcode, barcode_type, pack_quantity, is_primary)
    values (v_company_id, v_var_carrier, '4792100003095', 'EAN13', 1, true);
  end if;

  execute 'alter table public.product_variants enable trigger product_variants_protect_prices';

  -- --------------------------------------------------------------------------
  -- 12. NUMBER SEQUENCES FOR BOTH BRANCHES
  -- --------------------------------------------------------------------------
  -- Branch 1 Sequences (Main Store)
  insert into public.number_sequences (company_id, branch_id, sequence_type, prefix, next_number, padding_length)
  select v_company_id, v_branch_main_id, s_type,
    case s_type
      when 'invoice' then 'INV-' when 'quotation' then 'QUO-' when 'sales_order' then 'SO-'
      when 'sales_return' then 'SR-' when 'purchase' then 'PUR-' when 'purchase_return' then 'PR-'
      when 'receipt' then 'REC-' when 'payment' then 'PAY-' when 'journal' then 'JV-'
      when 'stock_transfer' then 'ST-' when 'stock_adjustment' then 'SA-'
      when 'credit_note' then 'CN-' when 'debit_note' then 'DN-' when 'cheque' then 'CHQ-'
      when 'customer' then 'C-' when 'vendor' then 'V-' when 'product' then 'P-'
    end, 1, 6
  from unnest(enum_range(null::public.sequence_type)) as s_type
  on conflict (company_id, branch_id, sequence_type) do nothing;

  -- Branch 2 Sequences (Nuwara Eliya)
  insert into public.number_sequences (company_id, branch_id, sequence_type, prefix, next_number, padding_length)
  select v_company_id, v_branch_ne_id, s_type,
    case s_type
      when 'invoice' then 'NE-INV-' when 'quotation' then 'NE-QUO-' when 'sales_order' then 'NE-SO-'
      when 'sales_return' then 'NE-SR-' when 'purchase' then 'NE-PUR-' when 'purchase_return' then 'NE-PR-'
      when 'receipt' then 'NE-REC-' when 'payment' then 'NE-PAY-' when 'journal' then 'NE-JV-'
      when 'stock_transfer' then 'NE-ST-' when 'stock_adjustment' then 'NE-SA-'
      when 'credit_note' then 'NE-CN-' when 'debit_note' then 'NE-DN-' when 'cheque' then 'NE-CHQ-'
      when 'customer' then 'NE-C-' when 'vendor' then 'NE-V-' when 'product' then 'NE-P-'
    end, 1, 6
  from unnest(enum_range(null::public.sequence_type)) as s_type
  on conflict (company_id, branch_id, sequence_type) do nothing;

  -- --------------------------------------------------------------------------
  -- 13. BARCODE TEMPLATES & DEFAULT POS SHORTCUTS
  -- --------------------------------------------------------------------------
  if not exists (select 1 from public.barcode_label_templates where company_id = v_company_id and template_name = 'Single Thermal 50mm x 25mm (Standard)') then
    insert into public.barcode_label_templates (
      company_id, template_name, paper_width_mm, paper_height_mm, columns, show_barcode, show_price, show_mfg_date, show_exp_date, is_default
    ) values
      (v_company_id, 'Single Thermal 50mm x 25mm (Standard)', 50, 25, 1, true, true, false, false, true),
      (v_company_id, 'Single Thermal 38mm x 25mm (Compact)', 38, 25, 1, true, true, false, false, false),
      (v_company_id, 'A4 Sheet (3 x 8 = 24 Labels)', 70, 37, 3, true, true, true, true, false);
  end if;

  if not exists (select 1 from public.pos_shortcut_keys where company_id = v_company_id and key_combination = 'F2') then
    insert into public.pos_shortcut_keys (company_id, branch_id, function_or_product_id, key_combination, target_type, description)
    values
      (v_company_id, v_branch_main_id, 'CMD_NEW_BILL', 'F2', 'command', 'New POS Bill / Clear Cart'),
      (v_company_id, v_branch_main_id, 'CMD_FOCUS_SEARCH', 'F3', 'command', 'Focus Product Scanner'),
      (v_company_id, v_branch_main_id, 'CMD_HOLD_BILL', 'F4', 'command', 'Hold Current Bill'),
      (v_company_id, v_branch_main_id, 'CMD_CASH_TENDER', 'F6', 'command', 'Instant Cash Settle'),
      (v_company_id, v_branch_main_id, v_var_avent::text, 'CTRL+1', 'product', 'Avent Teat 6+ Express');
  end if;

end $$;
