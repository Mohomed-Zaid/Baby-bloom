-- ==============================================================================
-- CONSOLIDATED SALES INVOICE, POS & CUSTOMER SUBLEDGER RESET SCRIPT
-- ==============================================================================
-- This script safely drops and recreates all sales invoice, POS, payment,
-- customer ledger, and sales return tables, views, triggers, and RPC procedures.
-- Safe to run in Supabase SQL Editor.
-- ==============================================================================

-- 1. DROP EXISTING VIEWS (in dependency order)
drop view if exists public.sales_invoice_item_details cascade;
drop view if exists public.sales_invoice_history cascade;
drop view if exists public.sales_return_eligibility cascade;
drop view if exists public.sales_return_history cascade;
drop view if exists public.customer_balance cascade;
drop view if exists public.customer_statement cascade;
drop view if exists public.invoice_payment_history cascade;
drop view if exists public.pos_product_search cascade;
drop view if exists public.stock_movement_history cascade;

-- 2. DROP EXISTING FUNCTIONS
drop function if exists public.create_sales_draft cascade;
drop function if exists public.hold_sales_invoice cascade;
drop function if exists public.recall_sales_invoice cascade;
drop function if exists public.cancel_sales_invoice cascade;
drop function if exists public.recalculate_sales_invoice cascade;
drop function if exists public.post_sales_invoice cascade;
drop function if exists public.reverse_sales_invoice cascade;
drop function if exists public.sales_audit cascade;

drop function if exists public.create_customer_payment cascade;
drop function if exists public.post_customer_payment cascade;
drop function if exists public.post_invoice_payment_internal cascade;
drop function if exists public.reverse_customer_payment cascade;

drop function if exists public.create_sales_return_draft cascade;
drop function if exists public.recalculate_sales_return cascade;
drop function if exists public.post_sales_return cascade;
drop function if exists public.reverse_sales_return cascade;
drop function if exists public.sales_return_audit cascade;

drop function if exists public.calculate_sales_invoice_item cascade;
drop function if exists public.validate_sales_invoice_document cascade;
drop function if exists public.validate_sales_return_document cascade;
drop function if exists public.calculate_sales_return_item cascade;
drop function if exists public.validate_invoice_payment cascade;
drop function if exists public.prevent_customer_ledger_change cascade;
drop function if exists public.customer_opening_balance_entry cascade;

-- 3. DROP TABLES (in child-to-parent order)
drop table if exists public.sales_return_items cascade;
drop table if exists public.sales_returns cascade;
drop table if exists public.invoice_payments cascade;
drop table if exists public.sales_invoice_items cascade;
drop table if exists public.sales_invoices cascade;
drop table if exists public.customer_ledger_entries cascade;

-- 4. ENSURE TYPES / ENUMS EXIST
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sales_document_status') then
    create type public.sales_document_status as enum ('draft','held','posted','cancelled','reversed');
  end if;
  if not exists (select 1 from pg_type where typname = 'sales_invoice_type') then
    create type public.sales_invoice_type as enum ('cash','credit','mixed');
  end if;
  if not exists (select 1 from pg_type where typname = 'sales_payment_status') then
    create type public.sales_payment_status as enum ('unpaid','partial','paid');
  end if;
  if not exists (select 1 from pg_type where typname = 'sales_discount_type') then
    create type public.sales_discount_type as enum ('none','percentage','fixed');
  end if;
  if not exists (select 1 from pg_type where typname = 'customer_payment_method') then
    create type public.customer_payment_method as enum ('cash','card','cheque','bank_transfer','customer_credit');
  end if;
  if not exists (select 1 from pg_type where typname = 'customer_ledger_entry_type') then
    create type public.customer_ledger_entry_type as enum ('opening_balance','invoice','payment','sales_return','credit_note','cheque_return','reversal');
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_payment_record_status') then
    create type public.invoice_payment_record_status as enum ('draft','posted','cancelled','reversed');
  end if;
  if not exists (select 1 from pg_type where typname = 'sales_return_settlement_type') then
    create type public.sales_return_settlement_type as enum ('reduce_receivable','customer_refund','customer_credit');
  end if;
end $$;

-- Ensure stock movement types exist
alter type public.stock_movement_type add value if not exists 'sale_out';
alter type public.stock_movement_type add value if not exists 'sale_return_in';

-- 5. SEED PERMISSIONS
insert into public.permissions(permission_key,module,name,description) values
  ('sales.view','sales','View sales','View sales invoices and history'),
  ('sales.create','sales','Create sales','Create sales invoice drafts'),
  ('sales.update_draft','sales','Update sales drafts','Edit draft sales invoices'),
  ('sales.post','sales','Post sales','Post sales invoices atomically'),
  ('sales.cancel','sales','Cancel sales','Cancel unposted sales invoices'),
  ('sales.reverse','sales','Reverse sales','Reverse posted sales invoices'),
  ('sales.backdate','sales','Backdate sales','Use a prior sales business date'),
  ('sales.negative_stock_override','sales','Override negative stock on sale','Authorise negative stock on sales'),
  ('sales.view_cost','sales','View sales cost','View sale cost prices and margins'),
  ('sales.print','sales','Print sales','Print sales invoices and receipts'),
  ('sales.export','sales','Export sales','Export sales data'),
  ('sales_returns.view','sales_returns','View sales returns','View sales-return documents'),
  ('sales_returns.create','sales_returns','Create sales returns','Create sales-return drafts'),
  ('sales_returns.post','sales_returns','Post sales returns','Post approved sales returns'),
  ('sales_returns.reverse','sales_returns','Reverse sales returns','Reverse posted sales returns'),
  ('sales_returns.unlinked','sales_returns','Create unlinked returns','Authorise returns without an original invoice'),
  ('customer_payments.create','customer_payments','Create customer payments','Create customer payment records'),
  ('customer_payments.post','customer_payments','Post customer payments','Post customer payments'),
  ('customer_payments.reverse','customer_payments','Reverse customer payments','Reverse posted customer payments'),
  ('customer_statements.view','customer_statements','View customer statements','View customer balances and statements')
on conflict(permission_key) do update set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions(role_id,permission_id,company_id,is_allowed)
select r.id,p.id,r.company_id,true from public.roles r cross join public.permissions p
where r.code in ('OWNER','ADMIN') and (p.permission_key like 'sales.%' or p.permission_key like 'sales_returns.%' or p.permission_key like 'customer_payments.%' or p.permission_key='customer_statements.view')
on conflict(role_id,permission_id) do update set is_allowed=true;

-- 6. RECREATE TABLES

-- Sales Invoices (Header)
create table public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  warehouse_id uuid not null,
  stock_location_id uuid not null,
  invoice_number text,
  customer_id uuid not null,
  invoice_date date not null,
  due_date date not null,
  invoice_type public.sales_invoice_type not null default 'cash',
  status public.sales_document_status not null default 'draft',
  subtotal numeric(18,2) not null default 0 check(subtotal>=0),
  item_discount_total numeric(18,2) not null default 0 check(item_discount_total>=0),
  bill_discount_type public.sales_discount_type not null default 'none',
  bill_discount_value numeric(18,4) not null default 0 check(bill_discount_value>=0),
  bill_discount_amount numeric(18,2) not null default 0 check(bill_discount_amount>=0),
  tax_total numeric(18,2) not null default 0 check(tax_total>=0),
  grand_total numeric(18,2) not null default 0 check(grand_total>=0),
  paid_amount numeric(18,2) not null default 0 check(paid_amount>=0),
  balance_amount numeric(18,2) not null default 0 check(balance_amount>=0),
  change_amount numeric(18,2) not null default 0 check(change_amount>=0),
  returned_amount numeric(18,2) not null default 0 check(returned_amount>=0),
  payment_status public.sales_payment_status not null default 'unpaid',
  rep_id uuid references public.staff_profiles(id) on delete set null,
  cashier_id uuid references auth.users(id) on delete set null,
  notes text,
  internal_reference text,
  source_order_id uuid,
  reversal_of_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  held_at timestamptz,
  held_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  unique(company_id,id),
  constraint sales_invoices_number_check check(invoice_number is null or btrim(invoice_number)<>''),
  constraint sales_invoices_dates_check check(due_date>=invoice_date),
  constraint sales_invoices_paid_check check(paid_amount<=grand_total+change_amount),
  constraint sales_invoices_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
  constraint sales_invoices_warehouse_fk foreign key(company_id,branch_id,warehouse_id) references public.warehouses(company_id,branch_id,id) on delete restrict,
  constraint sales_invoices_location_fk foreign key(company_id,stock_location_id) references public.stock_locations(company_id,id) on delete restrict,
  constraint sales_invoices_customer_fk foreign key(company_id,customer_id) references public.customers(company_id,id) on delete restrict,
  constraint sales_invoices_reversal_fk foreign key(company_id,reversal_of_id) references public.sales_invoices(company_id,id) on delete restrict,
  constraint sales_invoices_reversal_shape check((reversal_of_id is null) or status='posted')
);

create unique index sales_invoices_number_uidx on public.sales_invoices(company_id,branch_id,invoice_number) where invoice_number is not null;
create unique index sales_invoices_one_reversal_uidx on public.sales_invoices(reversal_of_id) where reversal_of_id is not null;
create index sales_invoices_history_idx on public.sales_invoices(company_id,invoice_date desc,created_at desc);
create index sales_invoices_customer_due_idx on public.sales_invoices(company_id,customer_id,due_date) where status='posted' and balance_amount>0;
create index sales_invoices_held_idx on public.sales_invoices(company_id,branch_id) where status='held';

-- Sales Invoice Items (Line Items)
create table public.sales_invoice_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid not null,
  product_variant_id uuid not null,
  quantity numeric(18,4) not null check(quantity>0),
  unit_price numeric(18,4) not null check(unit_price>=0),
  cost_price numeric(18,4) not null default 0 check(cost_price>=0),
  discount_type public.sales_discount_type not null default 'none',
  discount_value numeric(18,4) not null default 0 check(discount_value>=0),
  discount_amount numeric(18,2) not null default 0 check(discount_amount>=0),
  tax_rate numeric(7,4) not null default 0 check(tax_rate between 0 and 100),
  tax_amount numeric(18,2) not null default 0 check(tax_amount>=0),
  line_subtotal numeric(18,2) not null default 0 check(line_subtotal>=0),
  line_total numeric(18,2) not null default 0 check(line_total>=0),
  batch_reference text,
  warranty_period integer check(warranty_period is null or warranty_period>=0),
  remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id,id),
  constraint sales_invoice_items_invoice_fk foreign key(company_id,invoice_id) references public.sales_invoices(company_id,id) on delete cascade,
  constraint sales_invoice_items_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict
);

create unique index sales_invoice_items_line_uidx on public.sales_invoice_items(invoice_id,product_variant_id);
create index sales_invoice_items_invoice_idx on public.sales_invoice_items(invoice_id);

-- Invoice Payments
create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  invoice_id uuid,
  customer_id uuid not null,
  payment_number text not null check(btrim(payment_number)<>''),
  payment_date date not null,
  payment_method public.customer_payment_method not null,
  amount numeric(18,2) not null check(amount>0),
  bank_account_id uuid,
  card_reference text,
  cheque_number text,
  cheque_date date,
  cheque_status text not null default 'pending' check(cheque_status in ('pending','cleared','returned')),
  notes text,
  status public.invoice_payment_record_status not null default 'draft',
  clearing_status text not null default 'cleared' check(clearing_status in ('pending','cleared','returned')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  unique(company_id,id),
  unique(company_id,branch_id,payment_number),
  constraint invoice_payments_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
  constraint invoice_payments_invoice_fk foreign key(company_id,invoice_id) references public.sales_invoices(company_id,id) on delete restrict,
  constraint invoice_payments_customer_fk foreign key(company_id,customer_id) references public.customers(company_id,id) on delete restrict,
  constraint invoice_payments_bank_fk foreign key(company_id,bank_account_id) references public.bank_accounts(company_id,id) on delete restrict,
  constraint invoice_payments_invoice_required check(invoice_id is not null or payment_method='customer_credit'),
  constraint invoice_payments_bank_required check((payment_method in ('card','bank_transfer') and bank_account_id is not null) or payment_method not in ('card','bank_transfer')),
  constraint invoice_payments_cheque_required check((payment_method='cheque' and cheque_number is not null and cheque_date is not null) or payment_method<>'cheque')
);

create index invoice_payments_invoice_idx on public.invoice_payments(invoice_id,status);
create index invoice_payments_customer_idx on public.invoice_payments(company_id,customer_id,payment_date desc);

-- Customer Ledger Entries (Immutable)
create table public.customer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  customer_id uuid not null,
  entry_date date not null,
  entry_type public.customer_ledger_entry_type not null,
  reference_type text not null,
  reference_id uuid not null,
  reference_number text not null,
  debit_amount numeric(18,2) not null default 0 check(debit_amount>=0),
  credit_amount numeric(18,2) not null default 0 check(credit_amount>=0),
  running_order timestamptz not null default clock_timestamp(),
  due_date date,
  notes text,
  reversal_of_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id,id),
  constraint customer_ledger_direction_check check((debit_amount>0 and credit_amount=0) or (credit_amount>0 and debit_amount=0)),
  constraint customer_ledger_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
  constraint customer_ledger_customer_fk foreign key(company_id,customer_id) references public.customers(company_id,id) on delete restrict,
  constraint customer_ledger_reversal_fk foreign key(company_id,reversal_of_id) references public.customer_ledger_entries(company_id,id) on delete restrict
);

create unique index customer_ledger_source_uidx on public.customer_ledger_entries(reference_type,reference_id,entry_type) where reversal_of_id is null;
create unique index customer_ledger_one_reversal_uidx on public.customer_ledger_entries(reversal_of_id) where reversal_of_id is not null;
create index customer_ledger_statement_idx on public.customer_ledger_entries(company_id,customer_id,entry_date,created_at,id);

-- Sales Returns
create table public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null,
  warehouse_id uuid not null,
  stock_location_id uuid not null,
  return_number text,
  invoice_id uuid,
  customer_id uuid not null,
  return_date date not null,
  status public.sales_document_status not null default 'draft',
  subtotal numeric(18,2) not null default 0 check(subtotal>=0),
  discount_total numeric(18,2) not null default 0 check(discount_total>=0),
  tax_total numeric(18,2) not null default 0 check(tax_total>=0),
  grand_total numeric(18,2) not null default 0 check(grand_total>=0),
  settlement_type public.sales_return_settlement_type not null default 'reduce_receivable',
  refund_amount numeric(18,2) not null default 0 check(refund_amount>=0),
  balance_adjustment numeric(18,2) not null default 0 check(balance_adjustment>=0),
  reason text not null check(btrim(reason)<>''),
  notes text,
  reversal_of_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  unique(company_id,id),
  constraint sales_returns_number_check check(return_number is null or btrim(return_number)<>''),
  constraint sales_returns_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
  constraint sales_returns_warehouse_fk foreign key(company_id,branch_id,warehouse_id) references public.warehouses(company_id,branch_id,id) on delete restrict,
  constraint sales_returns_location_fk foreign key(company_id,stock_location_id) references public.stock_locations(company_id,id) on delete restrict,
  constraint sales_returns_invoice_fk foreign key(company_id,invoice_id) references public.sales_invoices(company_id,id) on delete restrict,
  constraint sales_returns_customer_fk foreign key(company_id,customer_id) references public.customers(company_id,id) on delete restrict,
  constraint sales_returns_reversal_fk foreign key(company_id,reversal_of_id) references public.sales_returns(company_id,id) on delete restrict
);

create unique index sales_returns_number_uidx on public.sales_returns(company_id,branch_id,return_number) where return_number is not null;
create unique index sales_returns_one_reversal_uidx on public.sales_returns(reversal_of_id) where reversal_of_id is not null;
create index sales_returns_history_idx on public.sales_returns(company_id,return_date desc,created_at desc);

-- Sales Return Items
create table public.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  sales_return_id uuid not null,
  original_invoice_item_id uuid,
  product_variant_id uuid not null,
  quantity numeric(18,4) not null check(quantity>0),
  unit_price numeric(18,4) not null check(unit_price>=0),
  cost_price numeric(18,4) not null default 0 check(cost_price>=0),
  discount_amount numeric(18,2) not null default 0 check(discount_amount>=0),
  tax_amount numeric(18,2) not null default 0 check(tax_amount>=0),
  line_total numeric(18,2) not null default 0 check(line_total>=0),
  batch_reference text,
  reason text not null check(btrim(reason)<>''),
  condition text not null check(condition in ('unopened','damaged','expired','incorrect','other')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id,id),
  constraint return_items_return_fk foreign key(company_id,sales_return_id) references public.sales_returns(company_id,id) on delete cascade,
  constraint return_items_invoice_item_fk foreign key(company_id,original_invoice_item_id) references public.sales_invoice_items(company_id,id) on delete restrict,
  constraint return_items_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict
);

create unique index sales_return_items_line_uidx on public.sales_return_items(sales_return_id,product_variant_id);

-- 7. TRIGGERS AND VALIDATION FUNCTIONS

-- calculate_sales_invoice_item
create or replace function public.calculate_sales_invoice_item() returns trigger language plpgsql security definer set search_path='' as $$
declare
  d public.sales_invoices%rowtype;
  base numeric(18,2);
  discounted numeric(18,2);
  avg_cost numeric(18,4);
  stock_state record;
begin
  select * into d from public.sales_invoices where id=new.invoice_id;
  if not found or d.company_id<>new.company_id then raise exception 'Invalid sales invoice company'; end if;
  if d.status not in ('draft','held') then raise exception 'Invoice items can only change while the invoice is draft or held'; end if;
  if not exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id and p.company_id=v.company_id where v.id=new.product_variant_id and v.company_id=new.company_id and v.is_active and v.deleted_at is null and p.product_status='active' and p.deleted_at is null and p.track_stock) then
    raise exception 'An active stock product variant is required';
  end if;
  select * into stock_state from public.inventory_stock_state(new.company_id,d.stock_location_id,new.product_variant_id);
  avg_cost := coalesce(stock_state.average_cost,0);
  new.cost_price := avg_cost;
  base := round(new.quantity*new.unit_price,2);
  if new.discount_type='percentage' then
    if new.discount_value>100 then raise exception 'Percentage discount cannot exceed 100'; end if;
    new.discount_amount := round(base*new.discount_value/100,2);
  elsif new.discount_type='fixed' then
    if new.discount_value>base then raise exception 'Fixed discount cannot exceed line subtotal'; end if;
    new.discount_amount := round(new.discount_value,2);
  else
    new.discount_value := 0;
    new.discount_amount := 0;
  end if;
  discounted := base - new.discount_amount;
  new.line_subtotal := base;
  new.tax_amount := round(discounted*new.tax_rate/100,2);
  new.line_total := discounted + new.tax_amount;
  new.created_by := coalesce(new.created_by,auth.uid());
  return new;
end $$;

create trigger sales_invoice_items_calculate
  before insert or update of product_variant_id,quantity,unit_price,discount_type,discount_value,tax_rate
  on public.sales_invoice_items for each row execute function public.calculate_sales_invoice_item();

-- validate_sales_invoice_document
create or replace function public.validate_sales_invoice_document() returns trigger language plpgsql security definer set search_path='' as $$
declare
  business_date date := (now() at time zone 'Asia/Colombo')::date;
begin
  if tg_op='INSERT' then
    if new.reversal_of_id is null and (new.subtotal<>0 or new.item_discount_total<>0 or new.bill_discount_amount<>0 or new.tax_total<>0 or new.grand_total<>0 or new.paid_amount<>0 or new.balance_amount<>0) then
      raise exception 'Authoritative invoice totals must start at zero';
    end if;
    if auth.uid() is not null and (new.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(new.branch_id) or not public.user_has_permission(case when new.reversal_of_id is null then 'sales.create' else 'sales.reverse' end)) then
      raise exception 'Not authorised to create this sales invoice' using errcode='42501';
    end if;
    if new.invoice_date<business_date and auth.uid() is not null and not public.user_has_permission('sales.backdate') then
      raise exception 'Backdated sales invoices require sales.backdate' using errcode='42501';
    end if;
  elsif coalesce(current_setting('app.sales_workflow',true),'')<>'on' then
    if old.status not in ('draft','held') then raise exception 'Only draft or held invoices can be edited directly'; end if;
    if new.subtotal is distinct from old.subtotal or new.item_discount_total is distinct from old.item_discount_total or new.bill_discount_amount is distinct from old.bill_discount_amount or new.tax_total is distinct from old.tax_total or new.grand_total is distinct from old.grand_total or new.paid_amount is distinct from old.paid_amount or new.balance_amount is distinct from old.balance_amount then
      raise exception 'Invoice totals are calculated by PostgreSQL';
    end if;
    if auth.uid() is not null and not public.user_has_permission('sales.update_draft') then
      raise exception 'sales.update_draft permission required' using errcode='42501';
    end if;
    if new.company_id<>old.company_id or new.branch_id<>old.branch_id or new.invoice_number is distinct from old.invoice_number then
      raise exception 'Invoice identity cannot be changed';
    end if;
  end if;
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.company_id=new.company_id and (new.reversal_of_id is not null or (c.is_active and c.deleted_at is null))) then
    raise exception 'A valid customer from the same company is required';
  end if;
  if not exists(select 1 from public.stock_locations l where l.id=new.stock_location_id and l.company_id=new.company_id and l.branch_id=new.branch_id and l.warehouse_id=new.warehouse_id and (new.reversal_of_id is not null or (l.is_active and l.deleted_at is null))) then
    raise exception 'A valid stock location in the selected warehouse is required';
  end if;
  if new.due_date<new.invoice_date then raise exception 'Due date cannot precede invoice date'; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(),new.updated_by);
  return new;
end $$;

create trigger sales_invoices_validate
  before insert or update on public.sales_invoices for each row execute function public.validate_sales_invoice_document();

-- validate_sales_return_document
create or replace function public.validate_sales_return_document() returns trigger language plpgsql security definer set search_path='' as $$
declare
  original public.sales_invoices%rowtype;
begin
  if tg_op='INSERT' then
    if auth.uid() is not null and (new.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(new.branch_id) or not public.user_has_permission(case when new.reversal_of_id is null then 'sales_returns.create' else 'sales_returns.reverse' end)) then
      raise exception 'Not authorised to create this sales return' using errcode='42501';
    end if;
  elsif coalesce(current_setting('app.sales_return_workflow',true),'')<>'on' then
    if old.status not in ('draft','held') then raise exception 'Only draft or held returns can be edited'; end if;
    if new.company_id<>old.company_id or new.branch_id<>old.branch_id or new.return_number is distinct from old.return_number then
      raise exception 'Sales return identity cannot be changed';
    end if;
  end if;
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.company_id=new.company_id and (new.reversal_of_id is not null or (c.is_active and c.deleted_at is null))) then
    raise exception 'A valid customer from the same company is required';
  end if;
  if not exists(select 1 from public.stock_locations l where l.id=new.stock_location_id and l.company_id=new.company_id and l.branch_id=new.branch_id and l.warehouse_id=new.warehouse_id and (new.reversal_of_id is not null or (l.is_active and l.deleted_at is null))) then
    raise exception 'A valid stock location in the selected warehouse is required';
  end if;
  if new.invoice_id is not null then
    select * into original from public.sales_invoices where id=new.invoice_id and company_id=new.company_id;
    if not found or original.customer_id<>new.customer_id or (new.reversal_of_id is null and original.status<>'posted') then
      raise exception 'Linked invoice must be posted and belong to the selected customer';
    end if;
  elsif auth.uid() is not null and not public.user_has_permission('sales_returns.unlinked') then
    raise exception 'Unlinked returns require sales_returns.unlinked' using errcode='42501';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(),new.updated_by);
  return new;
end $$;

create trigger sales_returns_validate
  before insert or update on public.sales_returns for each row execute function public.validate_sales_return_document();

-- calculate_sales_return_item
create or replace function public.calculate_sales_return_item() returns trigger language plpgsql security definer set search_path='' as $$
declare
  d public.sales_returns%rowtype;
  original public.sales_invoice_items%rowtype;
begin
  select * into d from public.sales_returns where id=new.sales_return_id;
  if not found or d.company_id<>new.company_id or d.status not in ('draft','held') then
    raise exception 'Return items require a draft return in the same company';
  end if;
  if new.original_invoice_item_id is not null then
    select * into original from public.sales_invoice_items where id=new.original_invoice_item_id and company_id=new.company_id;
    if not found or original.invoice_id<>d.invoice_id or original.product_variant_id<>new.product_variant_id then
      raise exception 'Invalid original invoice item';
    end if;
    new.unit_price := original.unit_price;
    new.cost_price := original.cost_price;
  elsif auth.uid() is not null and not public.user_has_permission('sales_returns.unlinked') then
    raise exception 'Unlinked return requires sales_returns.unlinked' using errcode='42501';
  elsif new.unit_price<=0 then
    raise exception 'An unlinked return requires a positive unit price';
  end if;
  new.line_total := round(new.quantity*new.unit_price - new.discount_amount + new.tax_amount, 2);
  if new.line_total<0 then raise exception 'Return line total cannot be negative'; end if;
  new.created_by := coalesce(new.created_by,auth.uid());
  return new;
end $$;

create trigger sales_return_items_calculate
  before insert or update on public.sales_return_items for each row execute function public.calculate_sales_return_item();

-- validate_invoice_payment
create or replace function public.validate_invoice_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare
  d public.sales_invoices%rowtype;
begin
  if tg_op='UPDATE' and old.status in ('posted','reversed','cancelled') and coalesce(current_setting('app.sales_payment_workflow',true),'')<>'on' then
    raise exception 'Posted invoice payments are immutable';
  end if;
  if new.company_id<>public.current_user_company_id() and auth.uid() is not null then
    raise exception 'Invalid payment company' using errcode='42501';
  end if;
  if auth.uid() is not null and not public.user_can_transact_in_branch(new.branch_id) then
    raise exception 'Payment branch denied' using errcode='42501';
  end if;
  if new.invoice_id is not null then
    select * into d from public.sales_invoices where id=new.invoice_id and company_id=new.company_id;
    if not found or d.customer_id<>new.customer_id or d.branch_id<>new.branch_id then
      raise exception 'Payment does not match its invoice';
    end if;
  end if;
  if new.payment_method in ('card','bank_transfer') and (new.bank_account_id is null or not exists(select 1 from public.bank_accounts b where b.id=new.bank_account_id and b.company_id=new.company_id and b.branch_id=new.branch_id and b.is_active)) then
    raise exception 'An active branch bank account is required';
  end if;
  if new.payment_method='cheque' then
    new.clearing_status := 'pending';
  else
    new.clearing_status := 'cleared';
  end if;
  new.created_by := coalesce(new.created_by,auth.uid());
  return new;
end $$;

create trigger invoice_payments_validate
  before insert or update on public.invoice_payments for each row execute function public.validate_invoice_payment();

-- prevent_customer_ledger_change
create or replace function public.prevent_customer_ledger_change() returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Customer ledger entries are immutable; create a reversal entry';
end $$;

create trigger customer_ledger_immutable
  before update or delete on public.customer_ledger_entries for each row execute function public.prevent_customer_ledger_change();

-- customer_opening_balance_entry
create or replace function public.customer_opening_balance_entry() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.opening_balance>0 then
    insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
    values(new.company_id,new.branch_id,new.id,(now() at time zone 'Asia/Colombo')::date,'opening_balance','customer',new.id,new.customer_code,case when new.opening_balance_type='debit' then new.opening_balance else 0 end,case when new.opening_balance_type='credit' then new.opening_balance else 0 end,'Customer opening balance',new.created_by);
  end if;
  return new;
end $$;

drop trigger if exists customers_opening_ledger on public.customers;
create trigger customers_opening_ledger
  after insert on public.customers for each row execute function public.customer_opening_balance_entry();

-- Populate existing customers' opening balances
insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
select c.company_id,c.branch_id,c.id,c.created_at::date,'opening_balance','customer',c.id,c.customer_code,case when c.opening_balance_type='debit' then c.opening_balance else 0 end,case when c.opening_balance_type='credit' then c.opening_balance else 0 end,'Customer opening balance migration',c.created_by
from public.customers c where c.opening_balance>0 and not exists(select 1 from public.customer_ledger_entries e where e.reference_type='customer' and e.reference_id=c.id and e.entry_type='opening_balance');

-- Audit triggers
do $$
declare n text;
begin
  foreach n in array array['sales_invoices','sales_invoice_items','invoice_payments','sales_returns','sales_return_items'] loop
    execute format('drop trigger if exists %I_audit on public.%I',n,n);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()',n,n);
  end loop;
end $$;

-- 8. ROW LEVEL SECURITY
alter table public.sales_invoices enable row level security;
alter table public.sales_invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.customer_ledger_entries enable row level security;
alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;

revoke all on public.sales_invoices,public.sales_invoice_items,public.invoice_payments,public.customer_ledger_entries,public.sales_returns,public.sales_return_items from anon;
grant select,insert,update on public.sales_invoices,public.sales_invoice_items,public.invoice_payments,public.sales_returns,public.sales_return_items to authenticated;
grant select on public.customer_ledger_entries to authenticated;
revoke insert,update,delete on public.customer_ledger_entries from authenticated;
revoke delete on public.sales_invoices,public.sales_invoice_items,public.invoice_payments,public.sales_returns,public.sales_return_items from authenticated;

create policy sales_invoices_read on public.sales_invoices for select to authenticated
  using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('sales.view'));
create policy sales_invoices_insert on public.sales_invoices for insert to authenticated
  with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('sales.create'));
create policy sales_invoices_update_draft on public.sales_invoices for update to authenticated
  using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status in ('draft','held') and public.user_has_permission('sales.update_draft'))
  with check(company_id=public.current_user_company_id());

create policy sales_items_read on public.sales_invoice_items for select to authenticated
  using(company_id=public.current_user_company_id() and public.user_has_permission('sales.view') and exists(select 1 from public.sales_invoices s where s.id=invoice_id and public.user_has_branch_access(s.branch_id)));
create policy sales_items_manage on public.sales_invoice_items for all to authenticated
  using(company_id=public.current_user_company_id() and exists(select 1 from public.sales_invoices s where s.id=invoice_id and s.status in ('draft','held') and public.user_can_transact_in_branch(s.branch_id)) and public.user_has_permission('sales.update_draft'))
  with check(company_id=public.current_user_company_id());

create policy invoice_payments_read on public.invoice_payments for select to authenticated
  using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and (public.user_has_permission('sales.view') or public.user_has_permission('customer_statements.view')));
create policy invoice_payments_insert on public.invoice_payments for insert to authenticated
  with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('customer_payments.create'));
create policy invoice_payments_update_draft on public.invoice_payments for update to authenticated
  using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status='draft' and public.user_has_permission('customer_payments.create'))
  with check(company_id=public.current_user_company_id());

create policy customer_ledger_read on public.customer_ledger_entries for select to authenticated
  using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('customer_statements.view'));

create policy sales_returns_read on public.sales_returns for select to authenticated
  using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('sales_returns.view'));
create policy sales_returns_insert on public.sales_returns for insert to authenticated
  with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('sales_returns.create'));
create policy sales_returns_update_draft on public.sales_returns for update to authenticated
  using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status in ('draft','held') and public.user_has_permission('sales_returns.create'))
  with check(company_id=public.current_user_company_id());

create policy sales_return_items_read on public.sales_return_items for select to authenticated
  using(company_id=public.current_user_company_id() and public.user_has_permission('sales.view') and exists(select 1 from public.sales_returns r where r.id=sales_return_id and public.user_has_branch_access(r.branch_id)));
create policy sales_return_items_manage on public.sales_return_items for all to authenticated
  using(company_id=public.current_user_company_id() and exists(select 1 from public.sales_returns r where r.id=sales_return_id and r.status in ('draft','held') and public.user_can_transact_in_branch(r.branch_id)) and public.user_has_permission('sales_returns.create'))
  with check(company_id=public.current_user_company_id());

-- 9. PROJECTION VIEWS

-- sales_invoice_history
create view public.sales_invoice_history with (security_invoker=false,security_barrier=true) as
select s.id,s.company_id,s.branch_id,s.warehouse_id,s.stock_location_id,s.invoice_number,s.customer_id,
 s.invoice_date,s.due_date,s.invoice_type,s.status,
 case when public.user_has_permission('sales.view_cost') then s.subtotal end subtotal,
 case when public.user_has_permission('sales.view_cost') then s.item_discount_total end item_discount_total,
 s.bill_discount_type,
 case when public.user_has_permission('sales.view_cost') then s.bill_discount_value end bill_discount_value,
 case when public.user_has_permission('sales.view_cost') then s.bill_discount_amount end bill_discount_amount,
 case when public.user_has_permission('sales.view_cost') then s.tax_total end tax_total,
 s.grand_total,s.paid_amount,s.balance_amount,s.change_amount,s.returned_amount,
 s.payment_status,s.rep_id,s.cashier_id,s.notes,s.internal_reference,s.reversal_of_id,
 s.created_at,s.created_by,s.posted_at,s.posted_by,s.held_at,s.cancelled_at,
 c.customer_code,c.name customer_name,c.phone customer_phone,c.credit_limit,c.customer_type,
 b.name branch_name,w.name warehouse_name,l.name location_name,pr.full_name created_user
from public.sales_invoices s join public.customers c on c.id=s.customer_id
join public.branches b on b.id=s.branch_id
join public.warehouses w on w.id=s.warehouse_id
join public.stock_locations l on l.id=s.stock_location_id
left join public.profiles pr on pr.id=s.created_by
where s.company_id=public.current_user_company_id() and public.user_has_branch_access(s.branch_id) and public.user_has_permission('sales.view');

-- sales_invoice_item_details
create view public.sales_invoice_item_details with (security_invoker=false,security_barrier=true) as
select i.id,i.company_id,i.invoice_id,i.product_variant_id,i.quantity,i.unit_price,
 case when public.user_has_permission('sales.view_cost') then i.cost_price end cost_price,
 i.discount_type,i.discount_value,i.discount_amount,i.tax_rate,i.tax_amount,i.line_subtotal,i.line_total,
 i.batch_reference,i.warranty_period,i.remarks,i.created_at,
 p.product_code,p.name product_name,v.variant_name,v.sku,coalesce(v.barcode,pb.barcode) barcode
from public.sales_invoice_items i join public.sales_invoices s on s.id=i.invoice_id
join public.product_variants v on v.id=i.product_variant_id join public.products p on p.id=v.product_id
left join lateral(select barcode from public.product_barcodes z where z.product_variant_id=v.id order by z.is_primary desc,z.created_at limit 1) pb on true
where i.company_id=public.current_user_company_id() and public.user_has_branch_access(s.branch_id) and public.user_has_permission('sales.view');

-- customer_balance
create view public.customer_balance with (security_invoker=false,security_barrier=true) as
with totals as (
 select e.company_id,e.customer_id,
  sum(case when e.entry_type='opening_balance' then e.debit_amount-e.credit_amount else 0 end)::numeric(18,2) opening_balance,
  sum(case when e.entry_type='invoice' then e.debit_amount-e.credit_amount else 0 end)::numeric(18,2) invoice_balance,
  sum(case when e.entry_type='sales_return' then e.credit_amount-e.debit_amount else 0 end)::numeric(18,2) return_balance,
  sum(case when e.entry_type='payment' then e.credit_amount-e.debit_amount else 0 end)::numeric(18,2) payment_balance,
  sum(case when e.entry_type='cheque_return' then e.debit_amount-e.credit_amount else 0 end)::numeric(18,2) cheque_return_balance,
  sum(e.debit_amount-e.credit_amount)::numeric(18,2) total_outstanding,
  greatest(sum(case when e.due_date<(now() at time zone 'Asia/Colombo')::date then e.debit_amount-e.credit_amount else 0 end),0)::numeric(18,2) overdue_amount,
  min(e.due_date) filter(where e.due_date>=(now() at time zone 'Asia/Colombo')::date and e.debit_amount>0) next_due_date,
  max(e.entry_date) last_transaction_date
 from public.customer_ledger_entries e where e.company_id=public.current_user_company_id() and public.user_has_branch_access(e.branch_id) and public.user_has_permission('customer_statements.view') group by e.company_id,e.customer_id
)
select t.*,c.customer_code,c.name customer_name,c.phone,c.email,c.credit_limit,c.customer_type
from totals t join public.customers c on c.id=t.customer_id;

-- customer_statement
create view public.customer_statement with (security_invoker=false,security_barrier=true) as
select e.id,e.company_id,e.branch_id,e.customer_id,e.entry_date,e.entry_type,e.reference_type,e.reference_id,e.reference_number,
 e.debit_amount,e.credit_amount,e.due_date,e.notes,e.created_at,e.created_by,b.name branch_name,p.full_name created_user,
 sum(e.debit_amount-e.credit_amount) over(partition by e.company_id,e.customer_id order by e.entry_date,e.created_at,e.id rows unbounded preceding)::numeric(18,2) running_balance,
 (e.due_date is not null and e.due_date<(now() at time zone 'Asia/Colombo')::date and e.debit_amount>0) overdue
from public.customer_ledger_entries e join public.branches b on b.id=e.branch_id left join public.profiles p on p.id=e.created_by
where e.company_id=public.current_user_company_id() and public.user_has_branch_access(e.branch_id) and public.user_has_permission('customer_statements.view');

-- invoice_payment_history
create view public.invoice_payment_history with (security_invoker=false,security_barrier=true) as
select p.id,p.company_id,p.branch_id,p.invoice_id,p.customer_id,p.payment_number,p.payment_date,p.payment_method,p.amount,
 p.bank_account_id,p.card_reference,p.cheque_number,p.cheque_date,p.cheque_status,p.notes,p.status,p.clearing_status,
 p.created_at,p.created_by,p.posted_at,p.reversed_at,p.reversal_reason,
 c.customer_code,c.name customer_name,b.name branch_name,si.invoice_number,ba.account_name bank_account_name,pr.full_name created_user
from public.invoice_payments p join public.customers c on c.id=p.customer_id join public.branches b on b.id=p.branch_id
left join public.sales_invoices si on si.id=p.invoice_id left join public.bank_accounts ba on ba.id=p.bank_account_id left join public.profiles pr on pr.id=p.created_by
where p.company_id=public.current_user_company_id() and public.user_has_branch_access(p.branch_id) and (public.user_has_permission('sales.view') or public.user_has_permission('customer_statements.view'));

-- sales_return_history
create view public.sales_return_history with (security_invoker=false,security_barrier=true) as
select r.id,r.company_id,r.branch_id,r.warehouse_id,r.stock_location_id,r.return_number,r.invoice_id,r.customer_id,r.return_date,r.status,
 r.subtotal,r.discount_total,r.tax_total,r.grand_total,r.settlement_type,r.refund_amount,r.balance_adjustment,r.reason,r.notes,r.reversal_of_id,
 r.created_at,r.created_by,r.posted_at,
 c.customer_code,c.name customer_name,b.name branch_name,w.name warehouse_name,l.name location_name,si.invoice_number,pr.full_name created_user
from public.sales_returns r join public.customers c on c.id=r.customer_id join public.branches b on b.id=r.branch_id
join public.warehouses w on w.id=r.warehouse_id join public.stock_locations l on l.id=r.stock_location_id
left join public.sales_invoices si on si.id=r.invoice_id left join public.profiles pr on pr.id=r.created_by
where r.company_id=public.current_user_company_id() and public.user_has_branch_access(r.branch_id) and public.user_has_permission('sales_returns.view');

-- pos_product_search
create view public.pos_product_search with (security_invoker=false,security_barrier=true) as
select v.company_id,v.id product_variant_id,p.id product_id,p.product_code,p.name product_name,
 v.variant_name,v.sku,coalesce(v.barcode,pb.barcode) barcode,p.base_unit_id,u.name unit_name,
 v.retail_price,v.wholesale_price,v.special_price,
 case when public.user_has_permission('sales.view_cost') then
   (select m.unit_cost from public.stock_movements m where m.company_id=v.company_id and m.product_variant_id=v.id and m.quantity_in>0 order by m.movement_date desc,m.created_at desc limit 1)
 end last_cost,
 coalesce((select sum(sm.quantity_in-sm.quantity_out) from public.stock_movements sm where sm.company_id=v.company_id and sm.product_variant_id=v.id),0)::numeric(18,4) available_quantity,
 p.track_stock,p.allow_negative_stock,0::numeric(7,4) as tax_rate
from public.product_variants v
join public.products p on p.id=v.product_id and p.company_id=v.company_id
join public.units u on u.id=p.base_unit_id
left join lateral(select barcode from public.product_barcodes z where z.product_variant_id=v.id order by z.is_primary desc,z.created_at limit 1) pb on true
where v.is_active and v.deleted_at is null and p.product_status='active' and p.deleted_at is null
 and v.company_id=public.current_user_company_id() and public.user_has_permission('sales.create');

-- sales_return_eligibility
create view public.sales_return_eligibility with (security_invoker=false,security_barrier=true) as
select i.id original_invoice_item_id,i.company_id,i.invoice_id,i.product_variant_id,i.quantity sold_quantity,
 coalesce(sum(ri.quantity) filter(where r.status='posted'),0)::numeric(18,4) returned_quantity,
 (i.quantity-coalesce(sum(ri.quantity) filter(where r.status='posted'),0))::numeric(18,4) eligible_quantity,
 i.unit_price historical_unit_price,i.cost_price historical_cost_price,
 i.batch_reference,p.product_code,p.name product_name,v.variant_name,v.sku,coalesce(v.barcode,pb.barcode) barcode
from public.sales_invoice_items i join public.sales_invoices si on si.id=i.invoice_id
join public.product_variants v on v.id=i.product_variant_id join public.products p on p.id=v.product_id
left join public.sales_return_items ri on ri.original_invoice_item_id=i.id left join public.sales_returns r on r.id=ri.sales_return_id
left join lateral(select barcode from public.product_barcodes z where z.product_variant_id=v.id order by z.is_primary desc,z.created_at limit 1) pb on true
where i.company_id=public.current_user_company_id() and si.status='posted' and public.user_has_branch_access(si.branch_id) and public.user_has_permission('sales_returns.create')
group by i.id,i.company_id,i.invoice_id,i.product_variant_id,i.quantity,i.unit_price,i.cost_price,i.batch_reference,p.product_code,p.name,v.variant_name,v.sku,v.barcode,pb.barcode;

-- stock_movement_history (Sales integrated)
create or replace view public.stock_movement_history with (security_invoker=true) as
select m.id,m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,
 m.movement_date,m.movement_type,m.quantity_in,m.quantity_out,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') or public.user_has_permission('purchases.view_cost') or public.user_has_permission('sales.view_cost') then m.unit_cost end unit_cost,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') or public.user_has_permission('purchases.view_cost') or public.user_has_permission('sales.view_cost') then m.total_cost end total_cost,
 m.reference_type,m.reference_id,m.reference_number,m.source_movement_id,m.reversal_movement_id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,
 m.created_at,m.created_by,
 coalesce(d.document_type::text,case when m.reference_type='purchase' then 'purchase' when m.reference_type='purchase_return' then 'purchase_return' when m.reference_type='sales_invoice' then 'sale' when m.reference_type='sales_return' then 'sales_return' end) document_type,
 coalesce(d.status::text,pu.status::text,rt.status::text,si.status::text,sr.status::text) document_status,
 br.name branch_name,w.name warehouse_name,l.name location_name,pr.full_name created_user,
 sum(m.quantity_in-m.quantity_out) over(partition by m.company_id,m.stock_location_id,m.product_variant_id order by m.movement_date,m.created_at,m.id rows unbounded preceding)::numeric(18,4) running_quantity
from public.stock_movements m left join public.inventory_documents d on d.id=m.reference_id and m.reference_type='inventory_document'
left join public.purchases pu on pu.id=m.reference_id and m.reference_type='purchase'
left join public.purchase_returns rt on rt.id=m.reference_id and m.reference_type='purchase_return'
left join public.sales_invoices si on si.id=m.reference_id and m.reference_type='sales_invoice'
left join public.sales_returns sr on sr.id=m.reference_id and m.reference_type='sales_return'
join public.branches br on br.id=m.branch_id join public.warehouses w on w.id=m.warehouse_id join public.stock_locations l on l.id=m.stock_location_id
left join public.profiles pr on pr.id=m.created_by;

grant select on public.sales_invoice_history,public.sales_invoice_item_details,public.customer_balance,public.customer_statement,public.invoice_payment_history,public.sales_return_history,public.pos_product_search,public.sales_return_eligibility,public.stock_movement_history to authenticated;
revoke all on public.sales_invoice_history,public.sales_invoice_item_details,public.customer_balance,public.customer_statement,public.invoice_payment_history,public.sales_return_history,public.pos_product_search,public.sales_return_eligibility,public.stock_movement_history from anon;


-- 10. RPC STORED PROCEDURES & ATOMIC WORKFLOWS

-- sales_audit
create or replace function public.sales_audit(p public.sales_invoices,p_action text,p_reason text default null,p_values jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(company_id,branch_id,user_id,action,module,table_name,record_id,new_values,reason)
 values(p.company_id,p.branch_id,auth.uid(),p_action,'sales','sales_invoices',p.id,p_values,p_reason);
end $$;

-- sales_return_audit
create or replace function public.sales_return_audit(r public.sales_returns,p_action text,p_reason text default null,p_values jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(company_id,branch_id,user_id,action,module,table_name,record_id,new_values,reason)
 values(r.company_id,r.branch_id,auth.uid(),p_action,'sales_returns','sales_returns',r.id,p_values,p_reason);
end $$;

-- recalculate_sales_invoice
create or replace function public.recalculate_sales_invoice(p_invoice_id uuid) returns public.sales_invoices
language plpgsql security definer set search_path='' as $$
declare
  d public.sales_invoices%rowtype;
  line_base numeric(18,2);
  bill_amount numeric(18,2);
  result public.sales_invoices%rowtype;
begin
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.status not in ('draft','held') then raise exception 'Invoice cannot be recalculated'; end if;
 select coalesce(sum(line_subtotal),0),coalesce(sum(discount_amount),0),coalesce(sum(tax_amount),0),coalesce(sum(line_total),0)
 into result.subtotal,result.item_discount_total,result.tax_total,line_base from public.sales_invoice_items where invoice_id=d.id;
 if d.bill_discount_type='percentage' then
  if d.bill_discount_value>100 then raise exception 'Bill discount percentage cannot exceed 100'; end if;
  bill_amount:=round(line_base*d.bill_discount_value/100,2);
 elsif d.bill_discount_type='fixed' then
  if d.bill_discount_value>line_base then raise exception 'Fixed bill discount cannot exceed item total'; end if;
  bill_amount:=round(d.bill_discount_value,2);
 else
  bill_amount:=0;
 end if;
 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set
  subtotal=result.subtotal,
  item_discount_total=result.item_discount_total,
  bill_discount_amount=bill_amount,
  tax_total=result.tax_total,
  grand_total=round(line_base-bill_amount,2),
  balance_amount=greatest(round(line_base-bill_amount,2)-paid_amount,0),
  payment_status=case when paid_amount<=0 then 'unpaid'::public.sales_payment_status when paid_amount>=round(line_base-bill_amount,2) then 'paid'::public.sales_payment_status else 'partial'::public.sales_payment_status end
 where id=d.id returning * into result;
 return result;
end $$;

-- create_sales_draft
create or replace function public.create_sales_draft(p_header jsonb,p_items jsonb,p_payments jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  company_uuid uuid := public.current_user_company_id();
  d public.sales_invoices%rowtype;
  item jsonb;
  pay jsonb;
  number text;
  payment_number text;
  item_count integer := 0;
begin
 if auth.uid() is null or company_uuid is null or not public.user_has_permission('sales.create') then
   raise exception 'sales.create permission required' using errcode='42501';
 end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
   raise exception 'At least one invoice item is required';
 end if;
 number := public.next_document_number(company_uuid,(p_header->>'branch_id')::uuid,'invoice');
 insert into public.sales_invoices(
   company_id,branch_id,warehouse_id,stock_location_id,invoice_number,customer_id,
   invoice_date,due_date,invoice_type,bill_discount_type,bill_discount_value,notes,
   internal_reference,rep_id,cashier_id,created_by
 )
 values(
   company_uuid,(p_header->>'branch_id')::uuid,(p_header->>'warehouse_id')::uuid,(p_header->>'stock_location_id')::uuid,
   number,(p_header->>'customer_id')::uuid,(p_header->>'invoice_date')::date,(p_header->>'due_date')::date,
   coalesce((p_header->>'invoice_type')::public.sales_invoice_type,'cash'),
   coalesce((p_header->>'bill_discount_type')::public.sales_discount_type,'none'),
   coalesce((p_header->>'bill_discount_value')::numeric,0),
   nullif(p_header->>'notes',''),
   nullif(p_header->>'internal_reference',''),
   nullif(p_header->>'rep_id','')::uuid,
   nullif(p_header->>'cashier_id','')::uuid,
   auth.uid()
 ) returning * into d;

 for item in select value from jsonb_array_elements(p_items) loop
  item_count := item_count + 1;
  insert into public.sales_invoice_items(
    company_id,invoice_id,product_variant_id,quantity,unit_price,discount_type,discount_value,tax_rate,batch_reference,warranty_period,remarks,created_by
  )
  values(
    company_uuid,d.id,(item->>'product_variant_id')::uuid,(item->>'quantity')::numeric,(item->>'unit_price')::numeric,
    coalesce((item->>'discount_type')::public.sales_discount_type,'none'),coalesce((item->>'discount_value')::numeric,0),
    coalesce((item->>'tax_rate')::numeric,0),nullif(item->>'batch_reference',''),nullif(item->>'warranty_period','')::integer,
    nullif(item->>'remarks',''),auth.uid()
  );
 end loop;

 if jsonb_typeof(p_payments)='array' then
  for pay in select value from jsonb_array_elements(p_payments) loop
   if coalesce((pay->>'amount')::numeric,0)>0 then
    if not public.user_has_permission('customer_payments.create') then raise exception 'customer_payments.create permission required' using errcode='42501'; end if;
    payment_number := public.next_document_number(company_uuid,d.branch_id,'receipt');
    insert into public.invoice_payments(
      company_id,branch_id,invoice_id,customer_id,payment_number,payment_date,payment_method,amount,bank_account_id,card_reference,cheque_number,cheque_date,notes,created_by
    )
    values(
      company_uuid,d.branch_id,d.id,d.customer_id,payment_number,d.invoice_date,
      (pay->>'payment_method')::public.customer_payment_method,(pay->>'amount')::numeric,
      nullif(pay->>'bank_account_id','')::uuid,nullif(pay->>'card_reference',''),nullif(pay->>'cheque_number',''),nullif(pay->>'cheque_date','')::date,
      nullif(pay->>'notes',''),auth.uid()
    );
   end if;
  end loop;
 end if;

 d := public.recalculate_sales_invoice(d.id);
 perform public.sales_audit(d,'CREATE',null,jsonb_build_object('items',item_count,'grand_total',d.grand_total));
 return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status,'grand_total',d.grand_total);
end $$;

-- hold_sales_invoice
create or replace function public.hold_sales_invoice(p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('sales.create') then raise exception 'sales.create permission required' using errcode='42501'; end if;
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501'; end if;
 if d.status<>'draft' then raise exception 'Only draft invoices can be held'; end if;
 if not exists(select 1 from public.sales_invoice_items where invoice_id=d.id) then raise exception 'At least one invoice item is required to hold'; end if;
 d := public.recalculate_sales_invoice(d.id);
 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set status='held',held_at=now(),held_by=auth.uid() where id=d.id returning * into d;
 perform public.sales_audit(d,'HOLD');
 return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status);
end $$;

-- recall_sales_invoice
create or replace function public.recall_sales_invoice(p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('sales.create') then raise exception 'sales.create permission required' using errcode='42501'; end if;
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501'; end if;
 if d.status<>'held' then raise exception 'Only held invoices can be recalled'; end if;
 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set status='draft',held_at=null,held_by=null where id=d.id returning * into d;
 perform public.sales_audit(d,'RECALL');
 return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status);
end $$;

-- cancel_sales_invoice
create or replace function public.cancel_sales_invoice(p_invoice_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('sales.cancel') then raise exception 'sales.cancel permission required' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Cancellation reason is required'; end if;
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501'; end if;
 if d.status not in ('draft','held') then raise exception 'Posted, cancelled or reversed invoices cannot be cancelled'; end if;
 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=p_reason where id=d.id returning * into d;
 perform public.sales_audit(d,'CANCEL',p_reason);
 return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status);
end $$;

-- post_invoice_payment_internal
create or replace function public.post_invoice_payment_internal(p_payment_id uuid) returns public.invoice_payments
language plpgsql security definer set search_path='' as $$
declare pay public.invoice_payments%rowtype;
begin
 select * into pay from public.invoice_payments where id=p_payment_id for update;
 if not found then raise exception 'Invoice payment not found'; end if;
 if pay.status='posted' then return pay; end if;
 if pay.status<>'draft' then raise exception 'Only draft invoice payments can be posted'; end if;
 if pay.payment_method='cheque' and pay.clearing_status<>'cleared' then raise exception 'Cheque payment remains pending until verified by the finance module'; end if;
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
 values(pay.company_id,pay.branch_id,pay.customer_id,pay.payment_date,'payment','invoice_payment',pay.id,pay.payment_number,0,pay.amount,pay.notes,auth.uid());
 perform set_config('app.sales_payment_workflow','on',true);
 update public.invoice_payments set status='posted',posted_at=now(),posted_by=auth.uid() where id=pay.id returning * into pay;
 return pay;
end $$;

-- post_sales_invoice
create or replace function public.post_sales_invoice(p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  d public.sales_invoices%rowtype;
  i public.sales_invoice_items%rowtype;
  pay public.invoice_payments%rowtype;
  product_row public.products%rowtype;
  variant_row public.product_variants%rowtype;
  state record;
  payment_total numeric(18,2) := 0;
  item_count integer := 0;
  business_date date := (now() at time zone 'Asia/Colombo')::date;
  allow_company_negative boolean := false;
  product_negative boolean;
  avg_cost numeric(18,4);
begin
 if auth.uid() is null or not public.user_has_permission('sales.post') then raise exception 'sales.post permission required' using errcode='42501'; end if;
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501'; end if;
 if d.status='posted' then return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status,'idempotent',true); end if;
 if d.status not in ('draft','held') then raise exception 'Only draft or held invoices can be posted'; end if;
 if exists(select 1 from public.stock_movements where reference_type='sales_invoice' and reference_id=d.id) or exists(select 1 from public.customer_ledger_entries where reference_type='sales_invoice' and reference_id=d.id) then
   raise exception 'Invoice already has posted effects';
 end if;
 if d.invoice_date<business_date and not public.user_has_permission('sales.backdate') then raise exception 'Backdated posting requires sales.backdate' using errcode='42501'; end if;
 d := public.recalculate_sales_invoice(d.id);
 select coalesce((setting_value->>'allow_negative_stock')::boolean,false) into allow_company_negative from public.business_settings where company_id=d.company_id and setting_key='inventory_policy';

 for i in select * from public.sales_invoice_items where invoice_id=d.id order by id for update loop
  item_count := item_count + 1;
  perform pg_advisory_xact_lock(hashtextextended(d.stock_location_id::text||i.product_variant_id::text,0));
  select * into state from public.inventory_stock_state(d.company_id,d.stock_location_id,i.product_variant_id);
  avg_cost := coalesce(state.average_cost,0);
  select v.* into variant_row from public.product_variants v where v.id=i.product_variant_id and v.company_id=d.company_id and v.is_active and v.deleted_at is null;
  select p.* into product_row from public.products p where p.id=variant_row.product_id and p.company_id=d.company_id and p.product_status='active' and p.deleted_at is null and p.track_stock;
  if variant_row.id is null or product_row.id is null then raise exception 'Invalid active stock product on invoice line'; end if;
  select p.allow_negative_stock into product_negative from public.product_variants v join public.products p on p.id=v.product_id where v.id=i.product_variant_id;
  if i.quantity>state.available and not (allow_company_negative and product_negative and public.user_has_permission('sales.negative_stock_override')) then
    raise exception 'Insufficient available stock for variant %: available %, requested %',i.product_variant_id,state.available,i.quantity;
  end if;
  perform set_config('app.sales_workflow','on',true);
  update public.sales_invoice_items set cost_price=avg_cost where id=i.id;
  insert into public.stock_movements(
    company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,
    quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,
    product_code,product_name,variant_name,sku,barcode,created_by
  )
  values(
    d.company_id,d.branch_id,d.warehouse_id,d.stock_location_id,product_row.id,variant_row.id,d.invoice_date,'sale_out',
    0,i.quantity,avg_cost,round(i.quantity*avg_cost,2),'sales_invoice',d.id,d.invoice_number,
    product_row.product_code,product_row.name,variant_row.variant_name,variant_row.sku,variant_row.barcode,auth.uid()
  );
 end loop;

 if item_count=0 then raise exception 'Invoice has no items'; end if;

 -- Post customer ledger debit for credit or mixed invoice
 if d.grand_total>0 then
  insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,due_date,notes,created_by)
  values(d.company_id,d.branch_id,d.customer_id,d.invoice_date,'invoice','sales_invoice',d.id,d.invoice_number,d.grand_total,0,d.due_date,d.notes,auth.uid());
 end if;

 -- Post any draft payments
 for pay in select * from public.invoice_payments where invoice_id=d.id and status='draft' order by created_at,id for update loop
  if pay.payment_method<>'cheque' or pay.clearing_status='cleared' then
    pay := public.post_invoice_payment_internal(pay.id);
    payment_total := payment_total + pay.amount;
  end if;
 end loop;

 if payment_total>d.grand_total+0.005 then raise exception 'Immediate payments cannot exceed invoice total'; end if;
 if d.invoice_type='cash' and payment_total<d.grand_total then raise exception 'Cash invoice requires full cleared immediate payment'; end if;
 if d.invoice_type='mixed' and (payment_total<=0 or payment_total>=d.grand_total) then raise exception 'Mixed invoice requires a partial cleared immediate payment'; end if;

 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set
  status='posted',
  posted_at=now(),
  posted_by=auth.uid(),
  paid_amount=payment_total,
  change_amount=greatest(payment_total-grand_total,0),
  balance_amount=greatest(grand_total-payment_total,0),
  payment_status=case when payment_total=0 then 'unpaid'::public.sales_payment_status when payment_total>=grand_total then 'paid'::public.sales_payment_status else 'partial'::public.sales_payment_status end
 where id=d.id returning * into d;

 if d.invoice_date<business_date then
   perform public.sales_audit(d,'BACKDATE',null,jsonb_build_object('invoice_date',d.invoice_date,'posted_date',business_date));
 end if;
 perform public.sales_audit(d,'POST',null,jsonb_build_object('grand_total',d.grand_total,'paid_amount',d.paid_amount,'balance_amount',d.balance_amount,'change_amount',d.change_amount));
 return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status,'grand_total',d.grand_total,'paid_amount',d.paid_amount,'balance_amount',d.balance_amount,'change_amount',d.change_amount,'idempotent',false);
end $$;

-- create_customer_payment
create or replace function public.create_customer_payment(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  company_uuid uuid := public.current_user_company_id();
  pay public.invoice_payments%rowtype;
  number text;
begin
 if auth.uid() is null or company_uuid is null or not public.user_has_permission('customer_payments.create') then
   raise exception 'customer_payments.create permission required' using errcode='42501';
 end if;
 number := public.next_document_number(company_uuid,(p_input->>'branch_id')::uuid,'receipt');
 insert into public.invoice_payments(
   company_id,branch_id,invoice_id,customer_id,payment_number,payment_date,payment_method,amount,
   bank_account_id,card_reference,cheque_number,cheque_date,notes,created_by
 )
 values(
   company_uuid,(p_input->>'branch_id')::uuid,nullif(p_input->>'invoice_id','')::uuid,(p_input->>'customer_id')::uuid,
   number,(p_input->>'payment_date')::date,(p_input->>'payment_method')::public.customer_payment_method,
   (p_input->>'amount')::numeric,nullif(p_input->>'bank_account_id','')::uuid,nullif(p_input->>'card_reference',''),
   nullif(p_input->>'cheque_number',''),nullif(p_input->>'cheque_date','')::date,nullif(p_input->>'notes',''),auth.uid()
 ) returning * into pay;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'clearing_status',pay.clearing_status);
end $$;

-- post_customer_payment
create or replace function public.post_customer_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  pay public.invoice_payments%rowtype;
  d public.sales_invoices%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('customer_payments.post') then raise exception 'customer_payments.post permission required' using errcode='42501'; end if;
 select * into pay from public.invoice_payments where id=p_payment_id for update;
 if not found or pay.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(pay.branch_id) then raise exception 'Customer payment not found or branch denied' using errcode='42501'; end if;
 if pay.status='posted' then return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',true); end if;
 if pay.invoice_id is not null then
  select * into d from public.sales_invoices where id=pay.invoice_id for update;
  if d.status<>'posted' then raise exception 'Later payment requires a posted invoice'; end if;
  if pay.amount>d.balance_amount then raise exception 'Payment exceeds remaining invoice balance'; end if;
 end if;
 pay := public.post_invoice_payment_internal(pay.id);
 if pay.invoice_id is not null then
  perform set_config('app.sales_workflow','on',true);
  update public.sales_invoices set
   paid_amount=paid_amount+pay.amount,
   balance_amount=balance_amount-pay.amount,
   payment_status=case when balance_amount-pay.amount<=0 then 'paid'::public.sales_payment_status else 'partial'::public.sales_payment_status end
  where id=pay.invoice_id;
 end if;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',false);
end $$;

-- reverse_customer_payment
create or replace function public.reverse_customer_payment(p_payment_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  pay public.invoice_payments%rowtype;
  e public.customer_ledger_entries%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('customer_payments.reverse') then raise exception 'customer_payments.reverse permission required' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required'; end if;
 select * into pay from public.invoice_payments where id=p_payment_id for update;
 if not found or pay.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(pay.branch_id) then raise exception 'Customer payment not found or branch denied' using errcode='42501'; end if;
 if pay.status='reversed' then return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',true); end if;
 if pay.status<>'posted' then raise exception 'Only posted payments can be reversed'; end if;
 select * into e from public.customer_ledger_entries where reference_type='invoice_payment' and reference_id=pay.id and reversal_of_id is null for update;
 if not found then raise exception 'Posted payment ledger entry is missing'; end if;
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.customer_id,(now() at time zone 'Asia/Colombo')::date,'reversal','payment_reversal',pay.id,pay.payment_number||'-REV',e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());
 perform set_config('app.sales_payment_workflow','on',true);
 update public.invoice_payments set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason where id=pay.id returning * into pay;
 if pay.invoice_id is not null then
  perform set_config('app.sales_workflow','on',true);
  update public.sales_invoices set
   paid_amount=greatest(paid_amount-pay.amount,0),
   balance_amount=least(grand_total,balance_amount+pay.amount),
   payment_status=case when greatest(paid_amount-pay.amount,0)<=0 then 'unpaid'::public.sales_payment_status else 'partial'::public.sales_payment_status end
  where id=pay.invoice_id;
 end if;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',false);
end $$;

-- reverse_sales_invoice
create or replace function public.reverse_sales_invoice(p_invoice_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  original public.sales_invoices%rowtype;
  rev public.sales_invoices%rowtype;
  m public.stock_movements%rowtype;
  e public.customer_ledger_entries%rowtype;
  pe public.customer_ledger_entries%rowtype;
  pay public.invoice_payments%rowtype;
  number text;
  closed_through date;
  movement_id uuid;
begin
 if auth.uid() is null or not public.user_has_permission('sales.reverse') then raise exception 'sales.reverse permission required' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required'; end if;
 select * into original from public.sales_invoices where id=p_invoice_id for update;
 if not found or original.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(original.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501'; end if;
 if original.status='reversed' then select * into rev from public.sales_invoices where reversal_of_id=original.id; return jsonb_build_object('id',rev.id,'document_number',rev.invoice_number,'status',rev.status,'idempotent',true); end if;
 if original.status<>'posted' then raise exception 'Only posted invoices can be reversed'; end if;
 if exists(select 1 from public.sales_returns r where r.invoice_id=original.id and r.status='posted') then raise exception 'Invoice has posted returns and cannot be reversed safely'; end if;
 select nullif(setting_value->>'closed_through_date','')::date into closed_through from public.business_settings where company_id=original.company_id and setting_key='accounting_policy';
 if closed_through is not null and original.invoice_date<=closed_through and not public.current_user_is_admin() then raise exception 'Closed-period reversal requires an administrator' using errcode='42501'; end if;

 for m in select * from public.stock_movements where reference_type='sales_invoice' and reference_id=original.id order by id for update loop
  perform pg_advisory_xact_lock(hashtextextended(m.stock_location_id::text||m.product_variant_id::text,0));
 end loop;

 number := public.next_document_number(original.company_id,original.branch_id,'invoice');
 insert into public.sales_invoices(
   company_id,branch_id,warehouse_id,stock_location_id,invoice_number,customer_id,
   invoice_date,due_date,invoice_type,status,subtotal,item_discount_total,bill_discount_type,
   bill_discount_value,bill_discount_amount,tax_total,grand_total,paid_amount,balance_amount,
   payment_status,notes,reversal_of_id,posted_at,posted_by,created_by
 )
 values(
   original.company_id,original.branch_id,original.warehouse_id,original.stock_location_id,
   number,original.customer_id,(now() at time zone 'Asia/Colombo')::date,(now() at time zone 'Asia/Colombo')::date,
   original.invoice_type,'posted',original.subtotal,original.item_discount_total,original.bill_discount_type,
   original.bill_discount_value,original.bill_discount_amount,original.tax_total,original.grand_total,0,0,
   'paid','Reversal of '||original.invoice_number||': '||p_reason,original.id,now(),auth.uid(),auth.uid()
 ) returning * into rev;

 for m in select * from public.stock_movements where reference_type='sales_invoice' and reference_id=original.id order by id loop
  insert into public.stock_movements(
    company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,
    quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,source_movement_id,
    product_code,product_name,variant_name,sku,barcode,created_by
  )
  values(
    m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,rev.invoice_date,'sale_return_in',
    m.quantity_out,0,m.unit_cost,m.total_cost,'sales_invoice',rev.id,rev.invoice_number,m.id,
    m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,auth.uid()
  ) returning id into movement_id;
  insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_variant_id,movement_id,m.quantity_out,m.quantity_out,m.unit_cost,rev.invoice_date);
 end loop;

 select * into e from public.customer_ledger_entries where reference_type='sales_invoice' and reference_id=original.id and entry_type='invoice' for update;
 if not found then raise exception 'Invoice customer-ledger entry is missing'; end if;
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.customer_id,rev.invoice_date,'reversal','sales_invoice',rev.id,rev.invoice_number,e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());

 for pay in select * from public.invoice_payments where invoice_id=original.id and status='posted' order by id for update loop
  select * into pe from public.customer_ledger_entries where reference_type='invoice_payment' and reference_id=pay.id and reversal_of_id is null for update;
  insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
  values(pe.company_id,pe.branch_id,pe.customer_id,rev.invoice_date,'reversal','payment_reversal',pay.id,pay.payment_number||'-REV',pe.credit_amount,pe.debit_amount,p_reason,pe.id,auth.uid());
  perform set_config('app.sales_payment_workflow','on',true);
  update public.invoice_payments set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason where id=pay.id;
 end loop;

 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set status='reversed',reversed_at=now(),reversed_by=auth.uid() where id=original.id returning * into original;
 perform public.sales_audit(original,'REVERSE',p_reason,jsonb_build_object('reversal_id',rev.id));
 return jsonb_build_object('id',rev.id,'document_number',rev.invoice_number,'status',rev.status,'idempotent',false);
end $$;

-- recalculate_sales_return
create or replace function public.recalculate_sales_return(p_return_id uuid) returns public.sales_returns
language plpgsql security definer set search_path='' as $$
declare r public.sales_returns%rowtype;
begin
 select * into r from public.sales_returns where id=p_return_id for update;
 if not found or r.status not in ('draft','held') then raise exception 'Sales return cannot be recalculated'; end if;
 perform set_config('app.sales_return_workflow','on',true);
 update public.sales_returns set
  subtotal=x.subtotal,
  discount_total=x.discount_total,
  tax_total=x.tax_total,
  grand_total=x.grand_total,
  balance_adjustment=case when settlement_type in ('reduce_receivable','customer_credit') then x.grand_total else 0 end,
  refund_amount=case when settlement_type='customer_refund' then x.grand_total else 0 end
 from (select coalesce(sum(quantity*unit_price),0)::numeric(18,2) subtotal,coalesce(sum(discount_amount),0)::numeric(18,2) discount_total,coalesce(sum(tax_amount),0)::numeric(18,2) tax_total,coalesce(sum(line_total),0)::numeric(18,2) grand_total from public.sales_return_items where sales_return_id=r.id) x
 where id=r.id returning * into r;
 return r;
end $$;

-- create_sales_return_draft
create or replace function public.create_sales_return_draft(p_header jsonb,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  company_uuid uuid := public.current_user_company_id();
  r public.sales_returns%rowtype;
  item jsonb;
  number text;
begin
 if auth.uid() is null or company_uuid is null or not public.user_has_permission('sales_returns.create') then raise exception 'sales_returns.create permission required' using errcode='42501'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one return item is required'; end if;
 number := public.next_document_number(company_uuid,(p_header->>'branch_id')::uuid,'sales_return');
 insert into public.sales_returns(company_id,branch_id,warehouse_id,stock_location_id,return_number,invoice_id,customer_id,return_date,settlement_type,reason,notes,created_by)
 values(company_uuid,(p_header->>'branch_id')::uuid,(p_header->>'warehouse_id')::uuid,(p_header->>'stock_location_id')::uuid,number,nullif(p_header->>'invoice_id','')::uuid,(p_header->>'customer_id')::uuid,(p_header->>'return_date')::date,coalesce((p_header->>'settlement_type')::public.sales_return_settlement_type,'reduce_receivable'),btrim(p_header->>'reason'),nullif(p_header->>'notes',''),auth.uid()) returning * into r;

 for item in select value from jsonb_array_elements(p_items) loop
  insert into public.sales_return_items(company_id,sales_return_id,original_invoice_item_id,product_variant_id,quantity,unit_price,discount_amount,tax_amount,batch_reference,reason,condition,created_by)
  values(company_uuid,r.id,nullif(item->>'original_invoice_item_id','')::uuid,(item->>'product_variant_id')::uuid,(item->>'quantity')::numeric,coalesce((item->>'unit_price')::numeric,0),coalesce((item->>'discount_amount')::numeric,0),coalesce((item->>'tax_amount')::numeric,0),nullif(item->>'batch_reference',''),btrim(item->>'reason'),coalesce(nullif(item->>'condition',''),'other'),auth.uid());
 end loop;

 r := public.recalculate_sales_return(r.id);
 perform public.sales_return_audit(r,'CREATE',r.reason,jsonb_build_object('grand_total',r.grand_total));
 return jsonb_build_object('id',r.id,'document_number',r.return_number,'status',r.status,'grand_total',r.grand_total);
end $$;

-- post_sales_return
create or replace function public.post_sales_return(p_return_id uuid) returns jsonb
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
begin
 if auth.uid() is null or not public.user_has_permission('sales_returns.post') then raise exception 'sales_returns.post permission required' using errcode='42501'; end if;
 select * into r from public.sales_returns where id=p_return_id for update;
 if not found or r.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(r.branch_id) then raise exception 'Sales return not found or branch denied' using errcode='42501'; end if;
 if r.status='posted' then return jsonb_build_object('id',r.id,'document_number',r.return_number,'status',r.status,'idempotent',true); end if;
 if r.status not in ('draft','held') then raise exception 'Only draft or held sales returns can be posted'; end if;
 if exists(select 1 from public.stock_movements where reference_type='sales_return' and reference_id=r.id) then raise exception 'Sales return already has stock effects'; end if;
 r := public.recalculate_sales_return(r.id);

 for i in select * from public.sales_return_items where sales_return_id=r.id order by id for update loop
  item_count := item_count + 1;
  perform pg_advisory_xact_lock(hashtextextended(r.stock_location_id::text||i.product_variant_id::text,0));
  if i.original_invoice_item_id is not null then
   select * into original from public.sales_invoice_items where id=i.original_invoice_item_id;
   select coalesce(sum(ri.quantity),0) into already_returned from public.sales_return_items ri join public.sales_returns rr on rr.id=ri.sales_return_id where ri.original_invoice_item_id=i.original_invoice_item_id and rr.status='posted' and rr.id<>r.id;
   eligible := original.quantity - already_returned;
   if i.quantity>eligible then raise exception 'Return quantity exceeds eligible quantity %',eligible; end if;
   if i.unit_price<>original.unit_price then raise exception 'Linked return must use historical unit price'; end if;
  end if;
  select v.* into variant_row from public.product_variants v where v.id=i.product_variant_id and v.company_id=r.company_id;
  select p.* into product_row from public.products p where p.id=variant_row.product_id and p.company_id=r.company_id;
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,product_code,product_name,variant_name,sku,barcode,created_by)
  values(r.company_id,r.branch_id,r.warehouse_id,r.stock_location_id,product_row.id,variant_row.id,r.return_date,'sale_return_in',i.quantity,0,i.cost_price,round(i.quantity*i.cost_price,2),'sales_return',r.id,r.return_number,product_row.product_code,product_row.name,variant_row.variant_name,variant_row.sku,variant_row.barcode,auth.uid()) returning id into movement_id;
  insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date)
  values(r.company_id,r.branch_id,r.warehouse_id,r.stock_location_id,i.product_variant_id,movement_id,i.quantity,i.quantity,i.cost_price,r.return_date);
 end loop;

 if item_count=0 then raise exception 'Sales return has no items'; end if;

 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
 values(r.company_id,r.branch_id,r.customer_id,r.return_date,'sales_return','sales_return',r.id,r.return_number,0,r.grand_total,r.reason,auth.uid());

 if r.invoice_id is not null then
  perform set_config('app.sales_workflow','on',true);
  update public.sales_invoices set
   returned_amount=returned_amount+r.grand_total,
   balance_amount=greatest(balance_amount-r.grand_total,0),
   payment_status=case when greatest(balance_amount-r.grand_total,0)<=0 then 'paid'::public.sales_payment_status else payment_status end
  where id=r.invoice_id;
 end if;

 perform set_config('app.sales_return_workflow','on',true);
 update public.sales_returns set status='posted',posted_at=now(),posted_by=auth.uid() where id=r.id returning * into r;
 perform public.sales_return_audit(r,'POST',r.reason,jsonb_build_object('grand_total',r.grand_total,'settlement_type',r.settlement_type));
 return jsonb_build_object('id',r.id,'document_number',r.return_number,'status',r.status,'grand_total',r.grand_total,'idempotent',false);
end $$;

-- reverse_sales_return
create or replace function public.reverse_sales_return(p_return_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  original public.sales_returns%rowtype;
  rev public.sales_returns%rowtype;
  m public.stock_movements%rowtype;
  e public.customer_ledger_entries%rowtype;
  number text;
begin
 if auth.uid() is null or not public.user_has_permission('sales_returns.reverse') then raise exception 'sales_returns.reverse permission required' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required'; end if;
 select * into original from public.sales_returns where id=p_return_id for update;
 if not found or original.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(original.branch_id) then raise exception 'Sales return not found or branch denied' using errcode='42501'; end if;
 if original.status='reversed' then select * into rev from public.sales_returns where reversal_of_id=original.id; return jsonb_build_object('id',rev.id,'document_number',rev.return_number,'status',rev.status,'idempotent',true); end if;
 if original.status<>'posted' then raise exception 'Only posted returns can be reversed'; end if;

 number := public.next_document_number(original.company_id,original.branch_id,'sales_return');
 insert into public.sales_returns(company_id,branch_id,warehouse_id,stock_location_id,return_number,invoice_id,customer_id,return_date,status,subtotal,discount_total,tax_total,grand_total,settlement_type,refund_amount,balance_adjustment,reason,notes,reversal_of_id,posted_at,posted_by,created_by)
 values(original.company_id,original.branch_id,original.warehouse_id,original.stock_location_id,number,original.invoice_id,original.customer_id,(now() at time zone 'Asia/Colombo')::date,'posted',original.subtotal,original.discount_total,original.tax_total,original.grand_total,original.settlement_type,original.refund_amount,original.balance_adjustment,p_reason,'Reversal of '||original.return_number,original.id,now(),auth.uid(),auth.uid()) returning * into rev;

 for m in select * from public.stock_movements where reference_type='sales_return' and reference_id=original.id order by id for update loop
  perform pg_advisory_xact_lock(hashtextextended(m.stock_location_id::text||m.product_variant_id::text,0));
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,source_movement_id,product_code,product_name,variant_name,sku,barcode,created_by)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,rev.return_date,'sale_out',0,m.quantity_in,m.unit_cost,m.total_cost,'sales_return',rev.id,rev.return_number,m.id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,auth.uid());
  update public.inventory_cost_layers set remaining_quantity=0 where source_movement_id=m.id;
 end loop;

 select * into e from public.customer_ledger_entries where reference_type='sales_return' and reference_id=original.id and entry_type='sales_return' for update;
 if not found then raise exception 'Sales-return customer-ledger entry is missing'; end if;
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.customer_id,rev.return_date,'reversal','sales_return',rev.id,rev.return_number,e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());

 if original.invoice_id is not null then
  perform set_config('app.sales_workflow','on',true);
  update public.sales_invoices set
   returned_amount=greatest(returned_amount-original.grand_total,0),
   balance_amount=least(grand_total-paid_amount,balance_amount+original.grand_total),
   payment_status=case when least(grand_total-paid_amount,balance_amount+original.grand_total)>0 then case when paid_amount>0 then 'partial'::public.sales_payment_status else 'unpaid'::public.sales_payment_status end else 'paid'::public.sales_payment_status end
  where id=original.invoice_id;
 end if;

 perform set_config('app.sales_return_workflow','on',true);
 update public.sales_returns set status='reversed' where id=original.id returning * into original;
 perform public.sales_return_audit(original,'REVERSE',p_reason,jsonb_build_object('reversal_id',rev.id));
 return jsonb_build_object('id',rev.id,'document_number',rev.return_number,'status',rev.status,'idempotent',false);
end $$;

-- 11. GRANT EXECUTION PERMISSIONS TO AUTHENTICATED USERS
revoke all on function public.sales_audit(public.sales_invoices,text,text,jsonb),public.recalculate_sales_invoice(uuid),public.post_invoice_payment_internal(uuid) from public,anon,authenticated;
revoke all on function public.create_sales_draft(jsonb,jsonb,jsonb),public.hold_sales_invoice(uuid),public.recall_sales_invoice(uuid),public.cancel_sales_invoice(uuid,text),public.post_sales_invoice(uuid),public.create_customer_payment(jsonb),public.post_customer_payment(uuid) from public,anon;
grant execute on function public.create_sales_draft(jsonb,jsonb,jsonb),public.hold_sales_invoice(uuid),public.recall_sales_invoice(uuid),public.cancel_sales_invoice(uuid,text),public.post_sales_invoice(uuid),public.create_customer_payment(jsonb),public.post_customer_payment(uuid) to authenticated;

revoke all on function public.sales_return_audit(public.sales_returns,text,text,jsonb),public.recalculate_sales_return(uuid) from public,anon,authenticated;
revoke all on function public.create_sales_return_draft(jsonb,jsonb),public.post_sales_return(uuid),public.reverse_sales_return(uuid,text),public.reverse_sales_invoice(uuid,text),public.reverse_customer_payment(uuid,text) from public,anon;
grant execute on function public.create_sales_return_draft(jsonb,jsonb),public.post_sales_return(uuid),public.reverse_sales_return(uuid,text),public.reverse_sales_invoice(uuid,text),public.reverse_customer_payment(uuid,text) to authenticated;

-- Service role bypass privileges
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;
