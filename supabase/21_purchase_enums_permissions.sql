-- Phase 5: purchasing enums, stock movement extensions, and permission catalogue.
create type public.purchase_type as enum ('cash','credit','mixed');
create type public.purchase_document_status as enum ('draft','submitted','approved','posted','cancelled','reversed');
create type public.purchase_discount_type as enum ('none','percentage','fixed');
create type public.purchase_payment_status as enum ('unpaid','partial','paid');
create type public.supplier_payment_method as enum ('cash','bank','card','cheque','online','supplier_advance');
create type public.supplier_payment_record_status as enum ('draft','posted','cancelled','reversed');
create type public.payment_clearing_status as enum ('pending','cleared','returned');
create type public.vendor_ledger_entry_type as enum ('opening_balance','purchase','purchase_return','payment','debit_note','credit_note','cheque_return','supplier_advance','reversal');
create type public.purchase_return_settlement_type as enum ('reduce_payable','supplier_refund','supplier_credit');

alter type public.stock_movement_type add value if not exists 'purchase_in';
alter type public.stock_movement_type add value if not exists 'purchase_return_out';

insert into public.permissions(permission_key,module,name,description) values
 ('purchases.view','purchases','View purchases','View purchase documents and history'),
 ('purchases.create','purchases','Create purchases','Create purchase drafts'),
 ('purchases.update_draft','purchases','Update purchase drafts','Edit draft purchase documents'),
 ('purchases.submit','purchases','Submit purchases','Submit purchases for approval'),
 ('purchases.approve','purchases','Approve purchases','Approve submitted purchases'),
 ('purchases.post','purchases','Post purchases','Post approved purchases atomically'),
 ('purchases.cancel','purchases','Cancel purchases','Cancel unposted purchase documents'),
 ('purchases.reverse','purchases','Reverse purchases','Reverse posted purchases'),
 ('purchases.backdate','purchases','Backdate purchases','Use a prior purchase business date'),
 ('purchases.view_cost','purchases','View purchase costs','View purchase unit costs and totals'),
 ('purchases.print','purchases','Print purchases','Print purchase documents'),
 ('purchases.export','purchases','Export purchases','Export purchase data'),
 ('purchase_returns.view','purchase_returns','View purchase returns','View purchase-return documents'),
 ('purchase_returns.create','purchase_returns','Create purchase returns','Create purchase-return drafts'),
 ('purchase_returns.unlinked','purchase_returns','Create unlinked returns','Authorise returns without an original purchase'),
 ('purchase_returns.approve','purchase_returns','Approve purchase returns','Approve submitted purchase returns'),
 ('purchase_returns.post','purchase_returns','Post purchase returns','Post approved purchase returns'),
 ('purchase_returns.reverse','purchase_returns','Reverse purchase returns','Reverse posted purchase returns'),
 ('supplier_payments.create','supplier_payments','Create supplier payments','Create supplier payment drafts'),
 ('supplier_payments.post','supplier_payments','Post supplier payments','Post supplier payments'),
 ('supplier_payments.reverse','supplier_payments','Reverse supplier payments','Reverse posted supplier payments'),
 ('vendor_statements.view','vendor_statements','View vendor statements','View supplier balances and statements')
on conflict(permission_key) do update set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions(role_id,permission_id,company_id,is_allowed)
select r.id,p.id,r.company_id,true from public.roles r cross join public.permissions p
where r.code in ('OWNER','ADMIN') and (p.permission_key like 'purchases.%' or p.permission_key like 'purchase_returns.%' or p.permission_key like 'supplier_payments.%' or p.permission_key='vendor_statements.view')
on conflict(role_id,permission_id) do update set is_allowed=true;
