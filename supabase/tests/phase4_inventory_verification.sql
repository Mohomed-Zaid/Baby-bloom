-- Phase 4 verification. Run against a disposable database after migrations and onboarding.
-- Replace fixture UUIDs, SET ROLE authenticated, and set request.jwt.claim.sub as in phase2_security_verification.sql.
-- Behaviour matrix:
--  1 post_opening_stock increases current_stock.quantity_on_hand.
--  2 calling post_opening_stock twice returns idempotent=true and creates no extra movement.
--  3 post_stock_transfer creates equal transfer_out/transfer_in rows.
--  4 company_stock_summary quantity and inventory_value are unchanged by a transfer.
--  5 transfer/adjustment-out/damage/write-off fail above available stock.
--  6 adjustment-in increases quantity; adjustment-out decreases it.
--  7 damaged stock and write-off decrease available stock.
--  8 reverse_inventory_document creates opposite movements and restores quantity/value.
--  9 Company A and unauthorised branches return zero rows through tables and all five views.
-- 10 users lacking inventory.view_cost/products.view_cost receive NULL cost/value fields.
-- 11 draft/submitted/approved documents never affect current_stock until posting.
-- 12 direct UPDATE/DELETE of stock_movements fails, including for authenticated users.
-- 13 weighted average: 10 @ 100 plus 10 @ 200 = 20 @ 150 and value 3000.
-- 14 a later outgoing movement retains its posted unit_cost after later receipts.
-- 15 two concurrent post calls serialize; only one set of movements exists.
-- 16 duplicate variant/location document lines and duplicate barcodes are rejected.
-- 17 negative stock requires company setting + product flag + document flag/reason + override permission.
-- 18 soft-deleted products remain readable in stock_movement_history via movement snapshots.
-- 19 opening/adjustment-in require positive unit cost; all item quantities are positive.
-- 20 backdating requires inventory.backdate in both creation and posting paths.
-- 21 submission, approval, rejection, posting, cancellation and reversal create audit rows.
-- 22 reversing an inbound document fails if its stock has already been consumed.

-- Automated catalogue/security smoke assertions (safe to run in any migrated database).
do $$
declare missing_count integer; insecure_count integer; writable_count integer;
begin
 select count(*) into missing_count from (values
  ('inventory.view'),('inventory.create_opening_stock'),('inventory.create_transfer'),('inventory.create_adjustment'),('inventory.record_damage'),('inventory.write_off'),
  ('inventory.submit'),('inventory.approve'),('inventory.post'),('inventory.reverse'),('inventory.backdate'),('inventory.negative_stock_override'),('inventory.view_cost'),('inventory.export'),('inventory.print')
 ) required(permission_key) where not exists(select 1 from public.permissions p where p.permission_key=required.permission_key);
 if missing_count<>0 then raise exception 'Missing % Phase 4 permissions',missing_count;end if;

 select count(*) into insecure_count from (values ('current_stock'),('branch_stock_summary'),('company_stock_summary'),('stock_movement_history'),('low_stock_products')) v(view_name)
 where coalesce((select (c.reloptions @> array['security_invoker=true']) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=v.view_name),false)=false;
 if insecure_count<>0 then raise exception '% inventory views are not security_invoker',insecure_count;end if;

 select count(*) into writable_count from information_schema.role_table_grants
 where table_schema='public' and table_name in ('stock_movements','inventory_cost_layers','stock_reservations') and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE');
 if writable_count<>0 then raise exception 'Authenticated retains % direct ledger write grants',writable_count;end if;
 if not exists(select 1 from pg_trigger where tgname='stock_movements_immutable' and not tgisinternal) then raise exception 'Immutable stock movement trigger is missing';end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='inventory_documents_one_reversal_idx') then raise exception 'One-reversal idempotency index is missing';end if;
end $$;

-- Example authenticated fixture checks:
-- select set_config('request.jwt.claim.sub','<authorised-user-uuid>',true); set role authenticated;
-- select public.post_opening_stock('<approved-opening-document-uuid>');
-- select quantity_on_hand=10 and weighted_average_cost=100 from public.current_stock where product_variant_id='<variant-uuid>' and stock_location_id='<location-uuid>';
-- select public.post_opening_stock('<approved-opening-document-uuid>'); -- expected idempotent=true
-- update public.stock_movements set quantity_in=999 where id='<movement-uuid>'; -- expected immutable error
-- delete from public.stock_movements where id='<movement-uuid>'; -- expected immutable error
-- select count(*)=0 from public.current_stock where company_id='<company-b-uuid>'; -- expected true for Company A user
