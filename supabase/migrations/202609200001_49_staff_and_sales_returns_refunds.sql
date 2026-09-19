-- Migration 49: Staff Management, Sales Returns & Customer Refunds Subledger

-- ============================================================================
-- 1. Staff Management: staff_profiles
-- ============================================================================

create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  staff_code text not null check (btrim(staff_code) <> ''),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text,
  mobile_number text not null check (btrim(mobile_number) <> ''),
  address text,
  designation text not null check (btrim(designation) <> ''),
  role_level text not null check (btrim(role_level) <> ''), -- e.g. 'LEVEL 1', 'Sales Manager', 'Cashier', 'Sales Rep'
  commission_rate numeric(5,2) not null default 0 check (commission_rate >= 0 and commission_rate <= 100),
  branch_id uuid references public.branches(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, staff_code),
  unique (company_id, id)
);

create index if not exists staff_profiles_company_active_idx on public.staff_profiles(company_id, is_active);
create index if not exists staff_profiles_branch_idx on public.staff_profiles(company_id, branch_id);

-- Seed existing profiles into staff_profiles if any exist
insert into public.staff_profiles (id, company_id, user_id, staff_code, first_name, last_name, mobile_number, address, designation, role_level, branch_id)
select 
  p.id,
  p.company_id,
  p.id,
  p.staff_code,
  split_part(p.full_name, ' ', 1),
  nullif(substr(p.full_name, length(split_part(p.full_name, ' ', 1)) + 2), ''),
  coalesce(nullif(p.phone, ''), '0770000000'),
  p.address,
  'Administrator',
  'LEVEL 1',
  p.default_branch_id
from public.profiles p
on conflict (company_id, staff_code) do nothing;

-- Ensure customer_orders has rep_id referencing staff_profiles
alter table public.customer_orders add column if not exists rep_id uuid references public.staff_profiles(id) on delete set null;

-- Ensure sales_invoices has rep_id referencing staff_profiles
do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
  where tc.table_name = 'sales_invoices'
    and kcu.column_name = 'rep_id'
    and tc.constraint_type = 'FOREIGN KEY';
  if fk_name is not null then
    execute 'alter table public.sales_invoices drop constraint ' || quote_ident(fk_name);
  end if;
end $$;

-- Clean up any rep_id pointing to nonexistent staff_profiles
update public.sales_invoices set rep_id = null 
where rep_id is not null and rep_id not in (select id from public.staff_profiles);

alter table public.sales_invoices
  add constraint sales_invoices_rep_fk foreign key (rep_id) references public.staff_profiles(id) on delete set null;

-- RLS on staff_profiles
alter table public.staff_profiles enable row level security;
revoke all on public.staff_profiles from anon;
grant select, insert, update on public.staff_profiles to authenticated;

drop policy if exists staff_profiles_read on public.staff_profiles;
create policy staff_profiles_read on public.staff_profiles
  for select to authenticated
  using (
    company_id = public.current_user_company_id() and
    (
      public.user_has_permission('settings.view') or 
      public.user_has_permission('settings.update') or
      public.user_has_permission('sales.create') or 
      public.user_has_permission('sales.view')
    )
  );

drop policy if exists staff_profiles_manage on public.staff_profiles;
create policy staff_profiles_manage on public.staff_profiles
  for all to authenticated
  using (
    company_id = public.current_user_company_id() and
    public.user_has_permission('settings.update')
  )
  with check (
    company_id = public.current_user_company_id() and
    public.user_has_permission('settings.update')
  );

-- ============================================================================
-- 2. Sales Returns Schema Extensions
-- ============================================================================

-- Drop dependent views before altering column types on sales_returns
drop view if exists public.sales_return_history cascade;
drop view if exists public.sales_return_item_details cascade;
drop view if exists public.customer_refund_history cascade;

-- Add sales_invoice_id alias/column to sales_returns
alter table public.sales_returns 
  add column if not exists sales_invoice_id uuid references public.sales_invoices(id) on delete restrict;

-- Populate sales_invoice_id from invoice_id where missing
update public.sales_returns set sales_invoice_id = invoice_id where sales_invoice_id is null and invoice_id is not null;
update public.sales_returns set invoice_id = sales_invoice_id where invoice_id is null and sales_invoice_id is not null;

-- Add credit_note_amount to sales_returns
alter table public.sales_returns 
  add column if not exists credit_note_amount numeric(18,2) not null default 0 check (credit_note_amount >= 0);

-- Make settlement_type text to support flexible settlement options ('cash_refund', 'bank_refund', 'customer_credit', 'reduce_receivable', 'customer_refund')
alter table public.sales_returns 
  alter column settlement_type type text using settlement_type::text;

alter table public.sales_returns 
  drop constraint if exists sales_returns_settlement_type_check;

alter table public.sales_returns 
  add constraint sales_returns_settlement_type_check 
  check (settlement_type in ('cash_refund', 'bank_refund', 'customer_credit', 'reduce_receivable', 'customer_refund'));

-- Add restock_condition and remarks to sales_return_items
alter table public.sales_return_items 
  add column if not exists restock_condition text check (restock_condition is null or restock_condition in ('good', 'damaged', 'write_off'));

alter table public.sales_return_items 
  add column if not exists remarks text;

-- Make condition column optional or default 'good'
alter table public.sales_return_items 
  alter column condition drop not null;

update public.sales_return_items 
set restock_condition = case 
  when condition in ('unopened', 'other') then 'good'
  when condition in ('damaged', 'expired') then 'damaged'
  else 'good'
end
where restock_condition is null;

alter table public.sales_return_items 
  alter column restock_condition set default 'good';

-- ============================================================================
-- 3. Customer Refunds Subledger: customer_refunds
-- ============================================================================

create table if not exists public.customer_refunds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  sales_return_id uuid not null references public.sales_returns(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  refund_date date not null default (now() at time zone 'Asia/Colombo')::date,
  payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'card')),
  amount numeric(18,2) not null check (amount > 0),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, id),
  constraint customer_refunds_bank_required check (
    (payment_method in ('bank_transfer', 'card') and bank_account_id is not null) or
    payment_method = 'cash'
  )
);

create index if not exists customer_refunds_return_idx on public.customer_refunds(sales_return_id);
create index if not exists customer_refunds_customer_idx on public.customer_refunds(company_id, customer_id, refund_date desc);

alter table public.customer_refunds enable row level security;
revoke all on public.customer_refunds from anon;
grant select, insert on public.customer_refunds to authenticated;

drop policy if exists customer_refunds_read on public.customer_refunds;
create policy customer_refunds_read on public.customer_refunds
  for select to authenticated
  using (
    company_id = public.current_user_company_id() and
    public.user_has_branch_access(branch_id) and
    (public.user_has_permission('sales_returns.view') or public.user_has_permission('accounting.view'))
  );

drop policy if exists customer_refunds_insert on public.customer_refunds;
create policy customer_refunds_insert on public.customer_refunds
  for insert to authenticated
  with check (
    company_id = public.current_user_company_id() and
    public.user_can_transact_in_branch(branch_id) and
    public.user_has_permission('sales_returns.post')
  );

-- Expand general_ledger_entries.entry_type check constraint
alter table public.general_ledger_entries 
  drop constraint if exists general_ledger_entries_entry_type_check;

alter table public.general_ledger_entries 
  add constraint general_ledger_entries_entry_type_check
  check (entry_type in (
    'customer_payment', 'vendor_payment', 'expense', 'income', 
    'journal', 'bank_transfer', 'reversal', 'petty_cash',
    'sales_return', 'customer_refund'
  ));

-- ============================================================================
-- 4. Recalculate Sales Return Procedure
-- ============================================================================

create or replace function public.recalculate_sales_return(p_return_id uuid) 
returns public.sales_returns 
language plpgsql security definer set search_path='' as $$
declare 
  r public.sales_returns%rowtype;
begin
  select * into r from public.sales_returns where id = p_return_id for update;
  if not found or r.status not in ('draft', 'held') then 
    raise exception 'Sales return cannot be recalculated';
  end if;

  perform set_config('app.sales_return_workflow', 'on', true);

  update public.sales_returns set 
    subtotal = x.subtotal,
    discount_total = x.discount_total,
    tax_total = x.tax_total,
    grand_total = x.grand_total,
    credit_note_amount = case when settlement_type in ('customer_credit', 'reduce_receivable') then x.grand_total else 0 end,
    balance_adjustment = case when settlement_type in ('customer_credit', 'reduce_receivable') then x.grand_total else 0 end,
    refund_amount = case when settlement_type in ('cash_refund', 'bank_refund', 'customer_refund') then x.grand_total else 0 end
  from (
    select 
      coalesce(sum(quantity * unit_price), 0)::numeric(18,2) as subtotal,
      coalesce(sum(discount_amount), 0)::numeric(18,2) as discount_total,
      coalesce(sum(tax_amount), 0)::numeric(18,2) as tax_total,
      coalesce(sum(line_total), 0)::numeric(18,2) as grand_total 
    from public.sales_return_items 
    where sales_return_id = r.id
  ) x
  where id = r.id 
  returning * into r;

  return r;
end;
$$;

-- ============================================================================
-- 5. Create Sales Return Draft Procedure
-- ============================================================================

create or replace function public.create_sales_return_draft(p_header jsonb, p_items jsonb) 
returns jsonb 
language plpgsql security definer set search_path='' as $$
declare 
  company_uuid uuid := public.current_user_company_id();
  r public.sales_returns%rowtype;
  item jsonb;
  number text;
  v_inv_id uuid;
  v_orig_item public.sales_invoice_items%rowtype;
  v_unit_price numeric(18,4);
  v_cost_price numeric(18,4);
  v_qty numeric(18,4);
  v_condition text;
begin
  if auth.uid() is null or company_uuid is null or not public.user_has_permission('sales_returns.create') then 
    raise exception 'sales_returns.create permission required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then 
    raise exception 'At least one return item is required';
  end if;

  v_inv_id := nullif(coalesce(p_header->>'sales_invoice_id', p_header->>'invoice_id'), '')::uuid;
  number := public.next_document_number(company_uuid, (p_header->>'branch_id')::uuid, 'sales_return');

  insert into public.sales_returns (
    company_id, branch_id, warehouse_id, stock_location_id, return_number,
    invoice_id, sales_invoice_id, customer_id, return_date,
    settlement_type, reason, notes, created_by
  ) values (
    company_uuid,
    (p_header->>'branch_id')::uuid,
    (p_header->>'warehouse_id')::uuid,
    (p_header->>'stock_location_id')::uuid,
    number,
    v_inv_id,
    v_inv_id,
    (p_header->>'customer_id')::uuid,
    (p_header->>'return_date')::date,
    coalesce(nullif(p_header->>'settlement_type', ''), 'customer_credit'),
    btrim(coalesce(p_header->>'reason', 'Sales return')),
    nullif(p_header->>'notes', ''),
    auth.uid()
  ) returning * into r;

  for item in select value from jsonb_array_elements(p_items) loop
    v_qty := (item->>'quantity')::numeric;
    v_unit_price := coalesce((item->>'unit_price')::numeric, 0);
    v_cost_price := coalesce((item->>'cost_price')::numeric, 0);
    v_condition := coalesce(nullif(item->>'restock_condition', ''), nullif(item->>'condition', ''), 'good');

    -- If linked to invoice item and cost price is 0, pull historical cost price from original invoice item
    if nullif(item->>'original_invoice_item_id', '') is not null then
      select * into v_orig_item from public.sales_invoice_items where id = (item->>'original_invoice_item_id')::uuid;
      if found then
        if v_cost_price <= 0 then
          v_cost_price := v_orig_item.cost_price;
        end if;
        if v_unit_price <= 0 then
          v_unit_price := v_orig_item.unit_price;
        end if;
      end if;
    end if;

    -- If still 0, lookup variant default/last cost
    if v_cost_price <= 0 then
      select coalesce(
        (select unit_cost from public.stock_movements sm where sm.product_variant_id = (item->>'product_variant_id')::uuid and sm.company_id = company_uuid and sm.quantity_in > 0 order by sm.movement_date desc, sm.created_at desc limit 1),
        0
      ) into v_cost_price;
    end if;

    insert into public.sales_return_items (
      company_id, sales_return_id, original_invoice_item_id, product_variant_id,
      quantity, unit_price, cost_price, discount_amount, tax_amount, line_total,
      batch_reference, reason, condition, restock_condition, remarks, created_by
    ) values (
      company_uuid,
      r.id,
      nullif(item->>'original_invoice_item_id', '')::uuid,
      (item->>'product_variant_id')::uuid,
      v_qty,
      v_unit_price,
      v_cost_price,
      coalesce((item->>'discount_amount')::numeric, 0),
      coalesce((item->>'tax_amount')::numeric, 0),
      round(v_qty * v_unit_price, 2),
      nullif(item->>'batch_reference', ''),
      btrim(coalesce(item->>'reason', r.reason)),
      v_condition,
      v_condition,
      nullif(coalesce(item->>'remarks', item->>'reason'), ''),
      auth.uid()
    );
  end loop;

  r := public.recalculate_sales_return(r.id);
  perform public.sales_return_audit(r, 'CREATE', r.reason, jsonb_build_object('grand_total', r.grand_total));

  return jsonb_build_object(
    'id', r.id,
    'document_number', r.return_number,
    'status', r.status,
    'grand_total', r.grand_total,
    'settlement_type', r.settlement_type
  );
end;
$$;

-- ============================================================================
-- 6. Atomic Post Sales Return Procedure
-- ============================================================================

create or replace function public.post_sales_return(p_return_id uuid) 
returns jsonb 
language plpgsql security definer set search_path='' as $$
declare 
  r public.sales_returns%rowtype;
  i public.sales_return_items%rowtype;
  original public.sales_invoice_items%rowtype;
  product_row public.products%rowtype;
  variant_row public.product_variants%rowtype;
  eligible numeric(18,4);
  already_returned numeric(18,4);
  item_count integer := 0;
  movement_id uuid;
  v_inv_id uuid;
  v_sales_return_acc_id uuid;
  v_cash_acc_id uuid;
  v_bank_acc_id uuid;
  v_ar_acc_id uuid;
  v_refund_id uuid;
  v_pay_method text;
  v_target_bank_id uuid;
  v_cust public.customers%rowtype;
begin
  if auth.uid() is null or not public.user_has_permission('sales_returns.post') then 
    raise exception 'sales_returns.post permission required' using errcode = '42501';
  end if;

  select * into r from public.sales_returns where id = p_return_id for update;
  if not found or r.company_id <> public.current_user_company_id() or not public.user_can_transact_in_branch(r.branch_id) then 
    raise exception 'Sales return not found or branch denied' using errcode = '42501';
  end if;

  if r.status = 'posted' then 
    return jsonb_build_object('id', r.id, 'document_number', r.return_number, 'status', r.status, 'idempotent', true);
  end if;

  if r.status not in ('draft', 'held') then 
    raise exception 'Only draft or held sales returns can be posted';
  end if;

  if exists(select 1 from public.stock_movements where reference_type = 'sales_return' and reference_id = r.id) then 
    raise exception 'Sales return already has stock effects';
  end if;

  -- Ensure calculations and amounts are fully up to date
  r := public.recalculate_sales_return(r.id);
  v_inv_id := coalesce(r.sales_invoice_id, r.invoice_id);

  select * into v_cust from public.customers where id = r.customer_id;

  -- 1. Validate Items & Process Stock Movements
  for i in select * from public.sales_return_items where sales_return_id = r.id order by id for update loop
    item_count := item_count + 1;
    perform pg_advisory_xact_lock(hashtextextended(r.stock_location_id::text || i.product_variant_id::text, 0));

    if i.original_invoice_item_id is not null then
      select * into original from public.sales_invoice_items where id = i.original_invoice_item_id;
      if found then
        select coalesce(sum(ri.quantity), 0) into already_returned 
        from public.sales_return_items ri 
        join public.sales_returns rr on rr.id = ri.sales_return_id 
        where ri.original_invoice_item_id = i.original_invoice_item_id 
          and rr.status = 'posted' 
          and rr.id <> r.id;

        eligible := original.quantity - already_returned;
        if i.quantity > eligible then 
          raise exception 'Return quantity % exceeds eligible quantity % for line', i.quantity, eligible;
        end if;
        if i.unit_price <> original.unit_price then 
          raise exception 'Linked return must use historical unit price';
        end if;
      end if;
    end if;

    select v.* into variant_row from public.product_variants v where v.id = i.product_variant_id and v.company_id = r.company_id;
    select p.* into product_row from public.products p where p.id = variant_row.product_id and p.company_id = r.company_id;

    -- Stock cost must use historical cost snapshotted at sale
    if coalesce(i.cost_price, 0) <= 0 and original.cost_price is not null then
      i.cost_price := original.cost_price;
    end if;

    -- A. Stock Movement: Record sale_return_in
    insert into public.stock_movements (
      company_id, branch_id, warehouse_id, stock_location_id,
      product_id, product_variant_id, movement_date, movement_type,
      quantity_in, quantity_out, unit_cost, total_cost,
      reference_type, reference_id, reference_number,
      product_code, product_name, variant_name, sku, barcode, created_by
    ) values (
      r.company_id, r.branch_id, r.warehouse_id, r.stock_location_id,
      product_row.id, variant_row.id, r.return_date, 'sale_return_in',
      i.quantity, 0, i.cost_price, round(i.quantity * i.cost_price, 2),
      'sales_return', r.id, r.return_number,
      product_row.product_code, product_row.name, variant_row.variant_name, variant_row.sku, variant_row.barcode,
      auth.uid()
    ) returning id into movement_id;

    -- B. Condition handling:
    -- If condition is 'good', restore inventory cost layer so item is available for resale.
    -- If 'damaged' or 'write_off', post automatic offset movement to route away from saleable stock.
    if coalesce(i.restock_condition, i.condition, 'good') in ('good', 'unopened') then
      insert into public.inventory_cost_layers (
        company_id, branch_id, warehouse_id, stock_location_id, product_variant_id,
        source_movement_id, original_quantity, remaining_quantity, unit_cost, received_date
      ) values (
        r.company_id, r.branch_id, r.warehouse_id, r.stock_location_id, i.product_variant_id,
        movement_id, i.quantity, i.quantity, i.cost_price, r.return_date
      );
    else
      -- Automatically adjust out as damaged stock to preserve audit trail
      insert into public.stock_movements (
        company_id, branch_id, warehouse_id, stock_location_id,
        product_id, product_variant_id, movement_date, movement_type,
        quantity_in, quantity_out, unit_cost, total_cost,
        reference_type, reference_id, reference_number, source_movement_id,
        product_code, product_name, variant_name, sku, barcode, created_by
      ) values (
        r.company_id, r.branch_id, r.warehouse_id, r.stock_location_id,
        product_row.id, variant_row.id, r.return_date, 'damaged',
        0, i.quantity, i.cost_price, round(i.quantity * i.cost_price, 2),
        'sales_return', r.id, r.return_number || '-DMG', movement_id,
        product_row.product_code, product_row.name, variant_row.variant_name, variant_row.sku, variant_row.barcode,
        auth.uid()
      );
    end if;
  end loop;

  if item_count = 0 then 
    raise exception 'Sales return has no items';
  end if;

  -- 2. Resolve Chart of Accounts Mappings for GL Postings
  select account_id into v_sales_return_acc_id from public.account_mappings where company_id = r.company_id and mapping_key = 'sales_returns';
  if v_sales_return_acc_id is null then
    select id into v_sales_return_acc_id from public.chart_of_accounts where company_id = r.company_id and account_code = '4100';
  end if;

  select account_id into v_cash_acc_id from public.account_mappings where company_id = r.company_id and mapping_key = 'cash_in_hand';
  if v_cash_acc_id is null then
    select id into v_cash_acc_id from public.chart_of_accounts where company_id = r.company_id and account_code = '1000';
  end if;

  select account_id into v_bank_acc_id from public.account_mappings where company_id = r.company_id and mapping_key = 'bank';
  if v_bank_acc_id is null then
    select id into v_bank_acc_id from public.chart_of_accounts where company_id = r.company_id and account_code = '1300';
  end if;

  select account_id into v_ar_acc_id from public.account_mappings where company_id = r.company_id and mapping_key = 'accounts_receivable';
  if v_ar_acc_id is null then
    select id into v_ar_acc_id from public.chart_of_accounts where company_id = r.company_id and account_code = '1100';
  end if;

  -- 3. Settlement Execution
  if r.settlement_type in ('customer_credit', 'reduce_receivable') then
    -- A. Post Credit Entry in Customer Subledger (reduces customer balance / creates advance)
    insert into public.customer_ledger_entries (
      company_id, branch_id, customer_id, entry_date, entry_type,
      reference_type, reference_id, reference_number,
      debit_amount, credit_amount, notes, created_by
    ) values (
      r.company_id, r.branch_id, r.customer_id, r.return_date, 'credit_note',
      'sales_return', r.id, r.return_number,
      0, r.grand_total, coalesce(r.reason, 'Sales return credit note'), auth.uid()
    );

    -- B. Post Double-Entry General Ledger: Debit Sales Returns, Credit Accounts Receivable
    if v_sales_return_acc_id is not null and v_ar_acc_id is not null then
      insert into public.general_ledger_entries (
        company_id, branch_id, entry_date, entry_type,
        reference_type, reference_id, reference_number,
        account_id, debit_amount, credit_amount, narration, created_by
      ) values (
        r.company_id, r.branch_id, r.return_date, 'sales_return',
        'sales_return', r.id, r.return_number,
        v_sales_return_acc_id, r.grand_total, 0,
        'Sales return credit note ' || r.return_number || ' for ' || coalesce(v_cust.name, 'Customer'), auth.uid()
      );

      insert into public.general_ledger_entries (
        company_id, branch_id, entry_date, entry_type,
        reference_type, reference_id, reference_number,
        account_id, debit_amount, credit_amount, narration, created_by
      ) values (
        r.company_id, r.branch_id, r.return_date, 'sales_return',
        'sales_return', r.id, r.return_number,
        v_ar_acc_id, 0, r.grand_total,
        'Customer credit reduction ' || r.return_number || ' for ' || coalesce(v_cust.name, 'Customer'), auth.uid()
      );
    end if;

  elsif r.settlement_type in ('cash_refund', 'bank_refund', 'customer_refund') then
    v_pay_method := case when r.settlement_type = 'bank_refund' then 'bank_transfer' else 'cash' end;
    
    if v_pay_method = 'bank_transfer' then
      select id into v_target_bank_id from public.bank_accounts where company_id = r.company_id and is_active = true limit 1;
    end if;

    -- A. Subledger: Record in customer_refunds
    insert into public.customer_refunds (
      company_id, branch_id, sales_return_id, customer_id,
      refund_date, payment_method, amount, bank_account_id,
      reference_number, notes, created_by
    ) values (
      r.company_id, r.branch_id, r.id, r.customer_id,
      r.return_date, v_pay_method, r.grand_total, v_target_bank_id,
      r.return_number, 'Refund for sales return ' || r.return_number, auth.uid()
    ) returning id into v_refund_id;

    -- B. Post Double-Entry General Ledger: Debit Sales Returns, Credit Cash/Bank
    if v_sales_return_acc_id is not null then
      insert into public.general_ledger_entries (
        company_id, branch_id, entry_date, entry_type,
        reference_type, reference_id, reference_number,
        account_id, debit_amount, credit_amount, narration, created_by
      ) values (
        r.company_id, r.branch_id, r.return_date, 'customer_refund',
        'sales_return', r.id, r.return_number,
        v_sales_return_acc_id, r.grand_total, 0,
        'Sales return refund ' || r.return_number || ' (' || v_pay_method || ')', auth.uid()
      );

      insert into public.general_ledger_entries (
        company_id, branch_id, entry_date, entry_type,
        reference_type, reference_id, reference_number,
        account_id, debit_amount, credit_amount, narration, created_by
      ) values (
        r.company_id, r.branch_id, r.return_date, 'customer_refund',
        'sales_return', r.id, r.return_number,
        case when v_pay_method = 'bank_transfer' and v_bank_acc_id is not null then v_bank_acc_id else v_cash_acc_id end,
        0, r.grand_total,
        'Refund payout for return ' || r.return_number || ' to ' || coalesce(v_cust.name, 'Customer'), auth.uid()
      );
    end if;
  end if;

  -- 4. Update Original Invoice Return Totals if linked
  if v_inv_id is not null then
    perform set_config('app.sales_workflow', 'on', true);
    update public.sales_invoices set 
      returned_amount = returned_amount + r.grand_total,
      balance_amount = greatest(0, balance_amount - (case when r.settlement_type in ('customer_credit', 'reduce_receivable') then r.grand_total else 0 end)),
      payment_status = case 
        when greatest(0, balance_amount - (case when r.settlement_type in ('customer_credit', 'reduce_receivable') then r.grand_total else 0 end)) <= 0 then 'paid'::public.sales_payment_status 
        else payment_status 
      end 
    where id = v_inv_id;
  end if;

  -- 5. Mark Return as Posted
  perform set_config('app.sales_return_workflow', 'on', true);
  update public.sales_returns set 
    status = 'posted',
    posted_at = now(),
    posted_by = auth.uid() 
  where id = r.id 
  returning * into r;

  perform public.sales_return_audit(r, 'POST', r.reason, jsonb_build_object('grand_total', r.grand_total, 'settlement_type', r.settlement_type));

  return jsonb_build_object(
    'id', r.id,
    'document_number', r.return_number,
    'status', r.status,
    'grand_total', r.grand_total,
    'settlement_type', r.settlement_type,
    'idempotent', false
  );
end;
$$;

-- ============================================================================
-- 7. Update Sales Return Views
-- ============================================================================

drop view if exists public.sales_return_history cascade;

create view public.sales_return_history with (security_invoker=false, security_barrier=true) as
select 
  r.id,
  r.company_id,
  r.branch_id,
  r.warehouse_id,
  r.stock_location_id,
  r.return_number,
  coalesce(r.sales_invoice_id, r.invoice_id) as invoice_id,
  coalesce(r.sales_invoice_id, r.invoice_id) as sales_invoice_id,
  r.customer_id,
  r.return_date,
  r.status,
  r.subtotal,
  r.discount_total,
  r.tax_total,
  r.grand_total,
  r.settlement_type,
  r.refund_amount,
  r.credit_note_amount,
  r.balance_adjustment,
  r.reason,
  r.notes,
  r.reversal_of_id,
  r.created_at,
  r.created_by,
  r.posted_at,
  c.customer_code,
  c.name as customer_name,
  b.name as branch_name,
  w.name as warehouse_name,
  l.name as location_name,
  si.invoice_number,
  pr.full_name as created_user
from public.sales_returns r
join public.customers c on c.id = r.customer_id
join public.branches b on b.id = r.branch_id
join public.warehouses w on w.id = r.warehouse_id
join public.stock_locations l on l.id = r.stock_location_id
left join public.sales_invoices si on si.id = coalesce(r.sales_invoice_id, r.invoice_id)
left join public.profiles pr on pr.id = r.created_by
where r.company_id = public.current_user_company_id() 
  and public.user_has_branch_access(r.branch_id) 
  and public.user_has_permission('sales_returns.view');

grant select on public.sales_return_history to authenticated;
revoke all on public.sales_return_history from anon;

-- Return Items Details View
create or replace view public.sales_return_item_details with (security_invoker=false, security_barrier=true) as
select 
  ri.id,
  ri.company_id,
  ri.sales_return_id,
  ri.original_invoice_item_id,
  ri.product_variant_id,
  ri.quantity,
  ri.unit_price,
  ri.cost_price,
  ri.discount_amount,
  ri.tax_amount,
  ri.line_total,
  ri.batch_reference,
  ri.reason,
  ri.condition,
  ri.restock_condition,
  ri.remarks,
  ri.created_at,
  p.product_code,
  p.name as product_name,
  v.variant_name,
  v.sku,
  coalesce(v.barcode, pb.barcode) as barcode
from public.sales_return_items ri
join public.sales_returns r on r.id = ri.sales_return_id
join public.product_variants v on v.id = ri.product_variant_id
join public.products p on p.id = v.product_id
left join lateral (
  select barcode from public.product_barcodes z 
  where z.product_variant_id = v.id 
  order by z.is_primary desc, z.created_at limit 1
) pb on true
where ri.company_id = public.current_user_company_id()
  and public.user_has_branch_access(r.branch_id)
  and public.user_has_permission('sales_returns.view');

grant select on public.sales_return_item_details to authenticated;
revoke all on public.sales_return_item_details from anon;

-- Customer Refunds View
create or replace view public.customer_refund_history with (security_invoker=false, security_barrier=true) as
select 
  rf.id,
  rf.company_id,
  rf.branch_id,
  rf.sales_return_id,
  rf.customer_id,
  rf.refund_date,
  rf.payment_method,
  rf.amount,
  rf.bank_account_id,
  rf.reference_number,
  rf.notes,
  rf.created_at,
  c.customer_code,
  c.name as customer_name,
  b.name as branch_name,
  sr.return_number,
  ba.account_name as bank_account_name,
  pr.full_name as created_user
from public.customer_refunds rf
join public.customers c on c.id = rf.customer_id
join public.branches b on b.id = rf.branch_id
join public.sales_returns sr on sr.id = rf.sales_return_id
left join public.bank_accounts ba on ba.id = rf.bank_account_id
left join public.profiles pr on pr.id = rf.created_by
where rf.company_id = public.current_user_company_id()
  and public.user_has_branch_access(rf.branch_id)
  and (public.user_has_permission('sales_returns.view') or public.user_has_permission('accounting.view'));

grant select on public.customer_refund_history to authenticated;
revoke all on public.customer_refund_history from anon;

grant execute on function public.recalculate_sales_return(uuid), public.create_sales_return_draft(jsonb, jsonb), public.post_sales_return(uuid) to authenticated;
