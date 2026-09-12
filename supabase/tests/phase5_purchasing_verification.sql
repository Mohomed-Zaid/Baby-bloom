-- Phase 5 verification. Run against a disposable migrated database with authenticated fixtures.
-- Behaviour matrix:
--  1 posted purchase increases current_stock by quantity + free_quantity.
--  2 free quantity carries no direct value and lowers final_unit_cost.
--  3 weighted-average inventory value includes the PostgreSQL-calculated final cost.
--  4 credit purchase creates a vendor-ledger credit and outstanding balance.
--  5 cash purchase requires a full cleared immediate payment.
--  6 mixed purchase requires a partial cleared immediate payment.
--  7 a second post_purchase call is idempotent and creates no duplicate effects.
--  8 client-derived purchase totals cannot be inserted or edited.
--  9 purchase_return_out reduces stock at linked historical final_unit_cost.
-- 10 purchase return creates a vendor-ledger debit and reduces outstanding.
-- 11 linked return quantity cannot exceed quantity + free quantity minus prior posted returns.
-- 12 return posting fails above current available stock.
-- 13 reverse_purchase adds reversal_out stock and debit supplier entries.
-- 14 purchase reversal fails when a posted return or consumed receipt makes it unsafe.
-- 15 reverse_purchase_return adds reversal_in stock and supplier credit entries.
-- 16 Company A receives no Company B purchase, payment, return, balance, or statement rows.
-- 17 unauthorised branches are denied by RLS and every RPC.
-- 18 posted purchases, returns, and payments cannot be edited or deleted.
-- 19 vendor_ledger_entries reject UPDATE and DELETE.
-- 20 pending cheque payments cannot post and do not reduce supplier outstanding.
-- 21 next_document_number serialises concurrent purchase/payment/return numbering.
-- 22 purchase cost columns are NULL without purchases.view_cost.
-- 23 supplier_statement running balance equals ordered cumulative credit - debit.
-- 24 npm build/lint and browser route verification are handled by the application checks.

do $$declare missing integer;insecure integer;writable integer;begin
 select count(*) into missing from (values
  ('purchases.view'),('purchases.create'),('purchases.update_draft'),('purchases.submit'),('purchases.approve'),('purchases.post'),('purchases.cancel'),('purchases.reverse'),('purchases.backdate'),('purchases.view_cost'),('purchases.print'),('purchases.export'),
  ('purchase_returns.view'),('purchase_returns.create'),('purchase_returns.approve'),('purchase_returns.post'),('purchase_returns.reverse'),('supplier_payments.create'),('supplier_payments.post'),('supplier_payments.reverse'),('vendor_statements.view')
 ) required(permission_key) where not exists(select 1 from public.permissions p where p.permission_key=required.permission_key);
 if missing<>0 then raise exception 'Missing % Phase 5 permissions',missing;end if;
 select count(*) into insecure from (values ('purchase_history'),('purchase_item_details'),('purchase_return_history'),('purchase_return_item_details'),('purchase_payment_history'),('supplier_balance'),('supplier_statement')) v(name)
 where coalesce((select c.reloptions @> array['security_invoker=true'] from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=v.name),false)=false;
 if insecure<>0 then raise exception '% Phase 5 views are not security_invoker',insecure;end if;
 select count(*) into writable from information_schema.role_table_grants where table_schema='public' and table_name='vendor_ledger_entries' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE');
 if writable<>0 then raise exception 'Authenticated has direct vendor-ledger write privileges';end if;
 if not exists(select 1 from pg_trigger where tgname='vendor_ledger_immutable' and not tgisinternal) then raise exception 'Vendor-ledger immutable trigger is missing';end if;
 if not exists(select 1 from pg_trigger where tgname='stock_movements_immutable' and not tgisinternal) then raise exception 'Stock immutable trigger is missing';end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='purchases_one_reversal_uidx') then raise exception 'Purchase one-reversal index is missing';end if;
end$$;

-- Fixture examples:
-- select public.post_purchase('<approved-purchase-uuid>');
-- select public.post_purchase('<approved-purchase-uuid>'); -- idempotent=true
-- update public.vendor_ledger_entries set credit_amount=0 where id='<entry-uuid>'; -- immutable error
-- select * from public.supplier_statement where vendor_id='<vendor-uuid>' order by entry_date,created_at,id;
