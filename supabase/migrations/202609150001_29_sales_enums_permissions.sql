-- Phase 6: sales invoicing enums, stock movement extensions, and permission catalogue.
create type public.sales_document_status as enum ('draft','held','posted','cancelled','reversed');
create type public.sales_invoice_type as enum ('cash','credit','mixed');
create type public.sales_payment_status as enum ('unpaid','partial','paid');
create type public.sales_discount_type as enum ('none','percentage','fixed');
create type public.customer_payment_method as enum ('cash','card','cheque','bank_transfer','customer_credit');
create type public.customer_ledger_entry_type as enum ('opening_balance','invoice','payment','sales_return','credit_note','cheque_return','reversal');
create type public.invoice_payment_record_status as enum ('draft','posted','cancelled','reversed');
create type public.sales_return_settlement_type as enum ('reduce_receivable','customer_refund','customer_credit');

alter type public.stock_movement_type add value if not exists 'sale_out';
alter type public.stock_movement_type add value if not exists 'sale_return_in';

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
