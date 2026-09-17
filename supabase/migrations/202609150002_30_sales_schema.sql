-- Phase 6: sales invoices, line items, customer payments, customer subledger, and sales returns.
create table public.sales_invoices (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, warehouse_id uuid not null, stock_location_id uuid not null,
 invoice_number text, customer_id uuid not null,
 invoice_date date not null, due_date date not null, invoice_type public.sales_invoice_type not null default 'cash',
 status public.sales_document_status not null default 'draft',
 subtotal numeric(18,2) not null default 0 check(subtotal>=0), item_discount_total numeric(18,2) not null default 0 check(item_discount_total>=0),
 bill_discount_type public.sales_discount_type not null default 'none', bill_discount_value numeric(18,4) not null default 0 check(bill_discount_value>=0),
 bill_discount_amount numeric(18,2) not null default 0 check(bill_discount_amount>=0), tax_total numeric(18,2) not null default 0 check(tax_total>=0),
 grand_total numeric(18,2) not null default 0 check(grand_total>=0), paid_amount numeric(18,2) not null default 0 check(paid_amount>=0),
 balance_amount numeric(18,2) not null default 0 check(balance_amount>=0), change_amount numeric(18,2) not null default 0 check(change_amount>=0),
 returned_amount numeric(18,2) not null default 0 check(returned_amount>=0),
 payment_status public.sales_payment_status not null default 'unpaid',
 rep_id uuid references auth.users(id) on delete set null, cashier_id uuid references auth.users(id) on delete set null,
 notes text, internal_reference text, source_order_id uuid, reversal_of_id uuid,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 held_at timestamptz, held_by uuid references auth.users(id) on delete set null,
 posted_at timestamptz, posted_by uuid references auth.users(id) on delete set null,
 cancelled_at timestamptz, cancelled_by uuid references auth.users(id) on delete set null, cancellation_reason text,
 reversed_at timestamptz, reversed_by uuid references auth.users(id) on delete set null,
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

create table public.sales_invoice_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 invoice_id uuid not null, product_variant_id uuid not null,
 quantity numeric(18,4) not null check(quantity>0), unit_price numeric(18,4) not null check(unit_price>=0),
 cost_price numeric(18,4) not null default 0 check(cost_price>=0),
 discount_type public.sales_discount_type not null default 'none',
 discount_value numeric(18,4) not null default 0 check(discount_value>=0), discount_amount numeric(18,2) not null default 0 check(discount_amount>=0),
 tax_rate numeric(7,4) not null default 0 check(tax_rate between 0 and 100), tax_amount numeric(18,2) not null default 0 check(tax_amount>=0),
 line_subtotal numeric(18,2) not null default 0 check(line_subtotal>=0), line_total numeric(18,2) not null default 0 check(line_total>=0),
 batch_reference text, warranty_period integer check(warranty_period is null or warranty_period>=0), remarks text,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 unique(company_id,id),
 constraint sales_invoice_items_invoice_fk foreign key(company_id,invoice_id) references public.sales_invoices(company_id,id) on delete cascade,
 constraint sales_invoice_items_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict
);
create unique index sales_invoice_items_line_uidx on public.sales_invoice_items(invoice_id,product_variant_id);
create index sales_invoice_items_invoice_idx on public.sales_invoice_items(invoice_id);

create table public.invoice_payments (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, invoice_id uuid, customer_id uuid not null, payment_number text not null check(btrim(payment_number)<>''),
 payment_date date not null, payment_method public.customer_payment_method not null, amount numeric(18,2) not null check(amount>0),
 bank_account_id uuid, card_reference text, cheque_number text, cheque_date date,
 cheque_status text not null default 'pending' check(cheque_status in ('pending','cleared','returned')),
 notes text, status public.invoice_payment_record_status not null default 'draft',
 clearing_status text not null default 'cleared' check(clearing_status in ('pending','cleared','returned')),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 posted_at timestamptz, posted_by uuid references auth.users(id) on delete set null,
 reversed_at timestamptz, reversed_by uuid references auth.users(id) on delete set null, reversal_reason text,
 unique(company_id,id), unique(company_id,branch_id,payment_number),
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

create table public.customer_ledger_entries (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, customer_id uuid not null, entry_date date not null, entry_type public.customer_ledger_entry_type not null,
 reference_type text not null, reference_id uuid not null, reference_number text not null,
 debit_amount numeric(18,2) not null default 0 check(debit_amount>=0), credit_amount numeric(18,2) not null default 0 check(credit_amount>=0),
 running_order timestamptz not null default clock_timestamp(), due_date date, notes text, reversal_of_id uuid,
 created_at timestamptz not null default clock_timestamp(), created_by uuid references auth.users(id) on delete set null,
 unique(company_id,id),
 constraint customer_ledger_direction_check check((debit_amount>0 and credit_amount=0) or (credit_amount>0 and debit_amount=0)),
 constraint customer_ledger_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
 constraint customer_ledger_customer_fk foreign key(company_id,customer_id) references public.customers(company_id,id) on delete restrict,
 constraint customer_ledger_reversal_fk foreign key(company_id,reversal_of_id) references public.customer_ledger_entries(company_id,id) on delete restrict
);
create unique index customer_ledger_source_uidx on public.customer_ledger_entries(reference_type,reference_id,entry_type) where reversal_of_id is null;
create unique index customer_ledger_one_reversal_uidx on public.customer_ledger_entries(reversal_of_id) where reversal_of_id is not null;
create index customer_ledger_statement_idx on public.customer_ledger_entries(company_id,customer_id,entry_date,created_at,id);

create table public.sales_returns (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, warehouse_id uuid not null, stock_location_id uuid not null, return_number text,
 invoice_id uuid, customer_id uuid not null, return_date date not null, status public.sales_document_status not null default 'draft',
 subtotal numeric(18,2) not null default 0 check(subtotal>=0), discount_total numeric(18,2) not null default 0 check(discount_total>=0),
 tax_total numeric(18,2) not null default 0 check(tax_total>=0), grand_total numeric(18,2) not null default 0 check(grand_total>=0),
 settlement_type public.sales_return_settlement_type not null default 'reduce_receivable',
 refund_amount numeric(18,2) not null default 0 check(refund_amount>=0), balance_adjustment numeric(18,2) not null default 0 check(balance_adjustment>=0),
 reason text not null check(btrim(reason)<>''), notes text,
 reversal_of_id uuid, created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 posted_at timestamptz, posted_by uuid references auth.users(id) on delete set null,
 cancelled_at timestamptz, cancelled_by uuid references auth.users(id) on delete set null, cancellation_reason text,
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

create table public.sales_return_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 sales_return_id uuid not null, original_invoice_item_id uuid, product_variant_id uuid not null,
 quantity numeric(18,4) not null check(quantity>0), unit_price numeric(18,4) not null check(unit_price>=0),
 cost_price numeric(18,4) not null default 0 check(cost_price>=0),
 discount_amount numeric(18,2) not null default 0 check(discount_amount>=0), tax_amount numeric(18,2) not null default 0 check(tax_amount>=0),
 line_total numeric(18,2) not null default 0 check(line_total>=0), batch_reference text, reason text not null check(btrim(reason)<>''),
 condition text not null check(condition in ('unopened','damaged','expired','incorrect','other')),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 unique(company_id,id),
 constraint return_items_return_fk foreign key(company_id,sales_return_id) references public.sales_returns(company_id,id) on delete cascade,
 constraint return_items_invoice_item_fk foreign key(company_id,original_invoice_item_id) references public.sales_invoice_items(company_id,id) on delete restrict,
 constraint return_items_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict
);
create unique index sales_return_items_line_uidx on public.sales_return_items(sales_return_id,product_variant_id);

-- Extend stock movement reference validator to support sales_invoice and sales_return.
create or replace function public.validate_stock_movement_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.reference_type='inventory_document' then
  if not exists(select 1 from public.inventory_documents d where d.id=new.reference_id and d.company_id=new.company_id) then raise exception 'Invalid inventory movement reference';end if;
 elsif new.reference_type='purchase' then
  if not exists(select 1 from public.purchases p where p.id=new.reference_id and p.company_id=new.company_id) then raise exception 'Invalid purchase movement reference';end if;
 elsif new.reference_type='purchase_return' then
  if not exists(select 1 from public.purchase_returns r where r.id=new.reference_id and r.company_id=new.company_id) then raise exception 'Invalid purchase-return movement reference';end if;
 elsif new.reference_type='sales_invoice' then
  if not exists(select 1 from public.sales_invoices s where s.id=new.reference_id and s.company_id=new.company_id) then raise exception 'Invalid sales invoice movement reference';end if;
 elsif new.reference_type='sales_return' then
  if not exists(select 1 from public.sales_returns sr where sr.id=new.reference_id and sr.company_id=new.company_id) then raise exception 'Invalid sales return movement reference';end if;
 else raise exception 'Unsupported stock movement reference type %',new.reference_type;
 end if;
 return new;
end $$;

comment on table public.customer_ledger_entries is 'Immutable customer subledger. Debit increases customer receivable (invoice); credit reduces receivable (payment or return).';
comment on column public.sales_invoice_items.cost_price is 'Weighted-average cost snapshot at time of posting. Preserved for margin analysis and return costing.';
comment on column public.invoice_payments.clearing_status is 'Cheque payments remain pending until the finance module verifies clearance.';
