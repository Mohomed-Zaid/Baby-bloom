-- Phase 5: purchase, return, payment, and immutable supplier subledger storage.
create table public.purchases (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, warehouse_id uuid not null, stock_location_id uuid not null,
 purchase_number text, vendor_invoice_number text, vendor_id uuid not null,
 purchase_date date not null, due_date date not null, purchase_type public.purchase_type not null default 'credit',
 status public.purchase_document_status not null default 'draft',
 subtotal numeric(18,2) not null default 0 check(subtotal>=0), item_discount_total numeric(18,2) not null default 0 check(item_discount_total>=0),
 bill_discount_type public.purchase_discount_type not null default 'none', bill_discount_value numeric(18,4) not null default 0 check(bill_discount_value>=0),
 bill_discount_amount numeric(18,2) not null default 0 check(bill_discount_amount>=0), tax_total numeric(18,2) not null default 0 check(tax_total>=0),
 shipping_cost numeric(18,2) not null default 0 check(shipping_cost>=0), other_cost numeric(18,2) not null default 0 check(other_cost>=0),
 grand_total numeric(18,2) not null default 0 check(grand_total>=0), paid_amount numeric(18,2) not null default 0 check(paid_amount>=0),
 balance_amount numeric(18,2) not null default 0 check(balance_amount>=0), payment_status public.purchase_payment_status not null default 'unpaid',
 returned_amount numeric(18,2) not null default 0 check(returned_amount>=0), notes text, internal_reference text, source_order_id uuid,
 reversal_of_id uuid, created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 submitted_at timestamptz, submitted_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz, approved_by uuid references auth.users(id) on delete set null,
 posted_at timestamptz, posted_by uuid references auth.users(id) on delete set null,
 cancelled_at timestamptz, cancelled_by uuid references auth.users(id) on delete set null, cancellation_reason text,
 unique(company_id,id),
 constraint purchases_number_check check(purchase_number is null or btrim(purchase_number)<>''),
 constraint purchases_dates_check check(due_date>=purchase_date),
 constraint purchases_paid_check check(paid_amount<=grand_total),
 constraint purchases_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
 constraint purchases_warehouse_fk foreign key(company_id,branch_id,warehouse_id) references public.warehouses(company_id,branch_id,id) on delete restrict,
 constraint purchases_location_fk foreign key(company_id,stock_location_id) references public.stock_locations(company_id,id) on delete restrict,
 constraint purchases_vendor_fk foreign key(company_id,vendor_id) references public.vendors(company_id,id) on delete restrict,
 constraint purchases_reversal_fk foreign key(company_id,reversal_of_id) references public.purchases(company_id,id) on delete restrict,
 constraint purchases_reversal_shape check((reversal_of_id is null) or status='posted')
);
create unique index purchases_number_uidx on public.purchases(company_id,branch_id,purchase_number) where purchase_number is not null;
create unique index purchases_vendor_invoice_uidx on public.purchases(company_id,vendor_id,lower(vendor_invoice_number)) where vendor_invoice_number is not null and btrim(vendor_invoice_number)<>'' and reversal_of_id is null;
create unique index purchases_one_reversal_uidx on public.purchases(reversal_of_id) where reversal_of_id is not null;
create index purchases_history_idx on public.purchases(company_id,purchase_date desc,created_at desc);
create index purchases_vendor_due_idx on public.purchases(company_id,vendor_id,due_date) where status='posted' and balance_amount>0;

create table public.purchase_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 purchase_id uuid not null, product_variant_id uuid not null, unit_id uuid not null,
 quantity numeric(18,4) not null check(quantity>0), free_quantity numeric(18,4) not null default 0 check(free_quantity>=0),
 unit_cost numeric(18,4) not null check(unit_cost>=0), discount_type public.purchase_discount_type not null default 'none',
 discount_value numeric(18,4) not null default 0 check(discount_value>=0), discount_amount numeric(18,2) not null default 0 check(discount_amount>=0),
 tax_rate numeric(7,4) not null default 0 check(tax_rate between 0 and 100), tax_amount numeric(18,2) not null default 0 check(tax_amount>=0),
 line_subtotal numeric(18,2) not null default 0 check(line_subtotal>=0), line_total numeric(18,2) not null default 0 check(line_total>=0),
 allocated_bill_discount numeric(18,2) not null default 0 check(allocated_bill_discount>=0), allocated_extra_cost numeric(18,2) not null default 0 check(allocated_extra_cost>=0),
 final_unit_cost numeric(18,4) not null default 0 check(final_unit_cost>=0), batch_reference text,
 manufacture_date date, expiry_date date, warranty_days integer check(warranty_days is null or warranty_days>=0), remarks text,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 unique(company_id,id),
 constraint purchase_items_purchase_fk foreign key(company_id,purchase_id) references public.purchases(company_id,id) on delete cascade,
 constraint purchase_items_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict,
 constraint purchase_items_unit_fk foreign key(company_id,unit_id) references public.units(company_id,id) on delete restrict,
 constraint purchase_items_dates_check check(manufacture_date is null or expiry_date is null or expiry_date>=manufacture_date)
);
create unique index purchase_items_line_uidx on public.purchase_items(purchase_id,product_variant_id,unit_id,coalesce(batch_reference,''));
create index purchase_items_purchase_idx on public.purchase_items(purchase_id);

create table public.purchase_payments (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, purchase_id uuid, vendor_id uuid not null, payment_number text not null check(btrim(payment_number)<>''),
 payment_date date not null, payment_method public.supplier_payment_method not null, amount numeric(18,2) not null check(amount>0),
 bank_account_id uuid, cheque_id uuid, reference_number text, notes text,
 status public.supplier_payment_record_status not null default 'draft', clearing_status public.payment_clearing_status not null default 'pending',
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 posted_at timestamptz, posted_by uuid references auth.users(id) on delete set null,
 reversed_at timestamptz, reversed_by uuid references auth.users(id) on delete set null, reversal_reason text,
 unique(company_id,id), unique(company_id,branch_id,payment_number),
 constraint purchase_payments_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
 constraint purchase_payments_purchase_fk foreign key(company_id,purchase_id) references public.purchases(company_id,id) on delete restrict,
 constraint purchase_payments_vendor_fk foreign key(company_id,vendor_id) references public.vendors(company_id,id) on delete restrict,
 constraint purchase_payments_bank_fk foreign key(company_id,bank_account_id) references public.bank_accounts(company_id,id) on delete restrict,
 constraint purchase_payments_purchase_required check(purchase_id is not null or payment_method='supplier_advance'),
 constraint purchase_payments_bank_required check((payment_method in ('bank','card','online') and bank_account_id is not null) or payment_method not in ('bank','card','online')),
 constraint purchase_payments_cheque_required check((payment_method='cheque' and cheque_id is not null and nullif(btrim(reference_number),'') is not null) or payment_method<>'cheque')
);
create index purchase_payments_purchase_idx on public.purchase_payments(purchase_id,status);
create index purchase_payments_vendor_idx on public.purchase_payments(company_id,vendor_id,payment_date desc);

create table public.vendor_ledger_entries (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, vendor_id uuid not null, entry_date date not null, entry_type public.vendor_ledger_entry_type not null,
 reference_type text not null, reference_id uuid not null, reference_number text not null,
 debit_amount numeric(18,2) not null default 0 check(debit_amount>=0), credit_amount numeric(18,2) not null default 0 check(credit_amount>=0),
 running_order timestamptz not null default clock_timestamp(), due_date date, notes text, reversal_of_id uuid,
 created_at timestamptz not null default clock_timestamp(), created_by uuid references auth.users(id) on delete set null,
 unique(company_id,id),
 constraint vendor_ledger_direction_check check((debit_amount>0 and credit_amount=0) or (credit_amount>0 and debit_amount=0)),
 constraint vendor_ledger_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
 constraint vendor_ledger_vendor_fk foreign key(company_id,vendor_id) references public.vendors(company_id,id) on delete restrict,
 constraint vendor_ledger_reversal_fk foreign key(company_id,reversal_of_id) references public.vendor_ledger_entries(company_id,id) on delete restrict
);
create unique index vendor_ledger_source_uidx on public.vendor_ledger_entries(reference_type,reference_id,entry_type) where reversal_of_id is null;
create unique index vendor_ledger_one_reversal_uidx on public.vendor_ledger_entries(reversal_of_id) where reversal_of_id is not null;
create index vendor_ledger_statement_idx on public.vendor_ledger_entries(company_id,vendor_id,entry_date,created_at,id);

create table public.purchase_returns (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, warehouse_id uuid not null, stock_location_id uuid not null, return_number text,
 purchase_id uuid, vendor_id uuid not null, return_date date not null, status public.purchase_document_status not null default 'draft',
 subtotal numeric(18,2) not null default 0 check(subtotal>=0), discount_total numeric(18,2) not null default 0 check(discount_total>=0),
 tax_total numeric(18,2) not null default 0 check(tax_total>=0), grand_total numeric(18,2) not null default 0 check(grand_total>=0),
 settlement_type public.purchase_return_settlement_type not null default 'reduce_payable', refund_amount numeric(18,2) not null default 0 check(refund_amount>=0),
 balance_adjustment numeric(18,2) not null default 0 check(balance_adjustment>=0), reason text not null check(btrim(reason)<>''), notes text,
 reversal_of_id uuid, created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 submitted_at timestamptz, submitted_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz, approved_by uuid references auth.users(id) on delete set null,
 posted_at timestamptz, posted_by uuid references auth.users(id) on delete set null,
 cancelled_at timestamptz, cancelled_by uuid references auth.users(id) on delete set null, cancellation_reason text,
 unique(company_id,id),
 constraint purchase_returns_number_check check(return_number is null or btrim(return_number)<>''),
 constraint purchase_returns_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
 constraint purchase_returns_warehouse_fk foreign key(company_id,branch_id,warehouse_id) references public.warehouses(company_id,branch_id,id) on delete restrict,
 constraint purchase_returns_location_fk foreign key(company_id,stock_location_id) references public.stock_locations(company_id,id) on delete restrict,
 constraint purchase_returns_purchase_fk foreign key(company_id,purchase_id) references public.purchases(company_id,id) on delete restrict,
 constraint purchase_returns_vendor_fk foreign key(company_id,vendor_id) references public.vendors(company_id,id) on delete restrict,
 constraint purchase_returns_reversal_fk foreign key(company_id,reversal_of_id) references public.purchase_returns(company_id,id) on delete restrict
);
create unique index purchase_returns_number_uidx on public.purchase_returns(company_id,branch_id,return_number) where return_number is not null;
create unique index purchase_returns_one_reversal_uidx on public.purchase_returns(reversal_of_id) where reversal_of_id is not null;
create index purchase_returns_history_idx on public.purchase_returns(company_id,return_date desc,created_at desc);

create table public.purchase_return_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 purchase_return_id uuid not null, original_purchase_item_id uuid, product_variant_id uuid not null,
 quantity numeric(18,4) not null check(quantity>0), unit_cost numeric(18,4) not null check(unit_cost>=0),
 discount_amount numeric(18,2) not null default 0 check(discount_amount>=0), tax_amount numeric(18,2) not null default 0 check(tax_amount>=0),
 line_total numeric(18,2) not null default 0 check(line_total>=0), batch_reference text, reason text not null check(btrim(reason)<>''),
 condition text not null check(condition in ('unopened','damaged','expired','incorrect','other')),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 unique(company_id,id),
 constraint return_items_return_fk foreign key(company_id,purchase_return_id) references public.purchase_returns(company_id,id) on delete cascade,
 constraint return_items_purchase_item_fk foreign key(company_id,original_purchase_item_id) references public.purchase_items(company_id,id) on delete restrict,
 constraint return_items_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict
);
create unique index purchase_return_items_line_uidx on public.purchase_return_items(purchase_return_id,product_variant_id,coalesce(batch_reference,''));

-- Phase 4 initially limited movement references to inventory documents. Replace that
-- constraint with an insert validator that securely supports all ledger sources.
alter table public.stock_movements drop constraint if exists stock_movements_reference_document_fk;
alter table public.stock_movements drop constraint if exists stock_movements_reference_type_check;

create function public.validate_stock_movement_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.reference_type='inventory_document' then
  if not exists(select 1 from public.inventory_documents d where d.id=new.reference_id and d.company_id=new.company_id) then raise exception 'Invalid inventory movement reference';end if;
 elsif new.reference_type='purchase' then
  if not exists(select 1 from public.purchases p where p.id=new.reference_id and p.company_id=new.company_id) then raise exception 'Invalid purchase movement reference';end if;
 elsif new.reference_type='purchase_return' then
  if not exists(select 1 from public.purchase_returns r where r.id=new.reference_id and r.company_id=new.company_id) then raise exception 'Invalid purchase-return movement reference';end if;
 else raise exception 'Unsupported stock movement reference type %',new.reference_type;
 end if;
 return new;
end $$;
create trigger stock_movements_validate_reference before insert on public.stock_movements for each row execute function public.validate_stock_movement_reference();

comment on table public.vendor_ledger_entries is 'Immutable supplier subledger. Credit increases supplier payable; debit reduces payable or creates a supplier advance.';
comment on column public.purchase_items.final_unit_cost is '((line_total - allocated_bill_discount) + allocated_extra_cost) / (quantity + free_quantity).';
comment on column public.purchase_payments.clearing_status is 'Cheque payments remain pending until the future finance module verifies clearance.';
