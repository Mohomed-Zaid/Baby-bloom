-- Phase 5: supporting projections and final ledger hardening.
drop index public.purchase_items_line_uidx;
create unique index purchase_items_line_uidx on public.purchase_items(purchase_id,product_variant_id);
drop index public.purchase_return_items_line_uidx;
create unique index purchase_return_items_line_uidx on public.purchase_return_items(purchase_return_id,product_variant_id);

create view public.purchase_payment_history with (security_invoker=false,security_barrier=true) as
select p.id,p.company_id,p.branch_id,p.purchase_id,p.vendor_id,p.payment_number,p.payment_date,p.payment_method,p.amount,p.bank_account_id,p.cheque_id,p.reference_number,p.notes,p.status,p.clearing_status,p.created_at,p.created_by,p.posted_at,p.reversed_at,p.reversal_reason,
 v.vendor_code,v.name vendor_name,b.name branch_name,pu.purchase_number,ba.account_name bank_account_name,pr.full_name created_user
from public.purchase_payments p join public.vendors v on v.id=p.vendor_id join public.branches b on b.id=p.branch_id
left join public.purchases pu on pu.id=p.purchase_id left join public.bank_accounts ba on ba.id=p.bank_account_id left join public.profiles pr on pr.id=p.created_by
where p.company_id=public.current_user_company_id() and public.user_has_branch_access(p.branch_id) and (public.user_has_permission('purchases.view') or public.user_has_permission('vendor_statements.view'));

create view public.purchase_return_eligibility with (security_invoker=false,security_barrier=true) as
select i.id original_purchase_item_id,i.company_id,i.purchase_id,i.product_variant_id,i.quantity+i.free_quantity purchased_quantity,
 coalesce(sum(ri.quantity) filter(where r.status='posted'),0)::numeric(18,4) returned_quantity,
 (i.quantity+i.free_quantity-coalesce(sum(ri.quantity) filter(where r.status='posted'),0))::numeric(18,4) eligible_quantity,
 case when public.user_has_permission('purchases.view_cost') then i.final_unit_cost end historical_unit_cost,
 i.batch_reference,p.product_code,p.name product_name,v.variant_name,v.sku,coalesce(v.barcode,pb.barcode) barcode
from public.purchase_items i join public.purchases pu on pu.id=i.purchase_id join public.product_variants v on v.id=i.product_variant_id join public.products p on p.id=v.product_id
left join public.purchase_return_items ri on ri.original_purchase_item_id=i.id left join public.purchase_returns r on r.id=ri.purchase_return_id
left join lateral(select barcode from public.product_barcodes z where z.product_variant_id=v.id order by z.is_primary desc,z.created_at limit 1) pb on true
where i.company_id=public.current_user_company_id() and pu.status='posted' and public.user_has_branch_access(pu.branch_id) and public.user_has_permission('purchase_returns.create')
group by i.id,i.company_id,i.purchase_id,i.product_variant_id,i.quantity,i.free_quantity,i.final_unit_cost,i.batch_reference,p.product_code,p.name,v.variant_name,v.sku,v.barcode,pb.barcode;

grant select on public.purchase_payment_history,public.purchase_return_eligibility to authenticated;
revoke all on public.purchase_payment_history,public.purchase_return_eligibility from anon;

comment on view public.supplier_balance is 'Derived only from immutable vendor ledger entries; credit minus debit is supplier outstanding.';
comment on view public.supplier_statement is 'Deterministic running balance ordered by entry_date, created_at, and id.';
comment on function public.post_purchase(uuid) is 'Atomic and idempotent: stock receipt, weighted-average input cost, supplier liability, immediate cleared payments, totals, status, and audit.';
comment on function public.post_purchase_return(uuid) is 'Atomic and idempotent: eligibility/availability checks, stock issue at historical cost, supplier debit, linked purchase update, and audit.';
comment on column public.purchase_payments.cheque_id is 'Safe UUID placeholder for the future cheque module; no foreign key is added until that module exists.';
comment on index public.purchase_items_line_uidx is 'One line per variant per purchase prevents duplicate movements; batch splitting is deferred until batch-level stock dimensions exist.';

create or replace view public.purchase_product_search
with (security_invoker=false,security_barrier=true) as
select v.company_id,v.id product_variant_id,p.id product_id,p.product_code,p.name product_name,
 v.variant_name,v.sku,v.barcode,p.base_unit_id,u.name unit_name,p.preferred_vendor_id,pv.name preferred_vendor_name,p.reorder_level,
 v.retail_price,v.wholesale_price,
 case when public.user_has_permission('purchases.view_cost') then
   (select m.unit_cost from public.stock_movements m where m.company_id=v.company_id and m.product_variant_id=v.id and m.movement_type='purchase_in' order by m.movement_date desc,m.created_at desc limit 1)
 end last_purchase_cost
from public.product_variants v
join public.products p on p.id=v.product_id and p.company_id=v.company_id
join public.units u on u.id=p.base_unit_id
left join public.vendors pv on pv.id=p.preferred_vendor_id
where v.is_active and v.deleted_at is null and p.product_status='active' and p.deleted_at is null
 and v.company_id=public.current_user_company_id() and (public.user_has_permission('purchases.create') or public.user_has_permission('purchase_returns.create'));

grant select on public.purchase_product_search to authenticated;
comment on view public.purchase_product_search is 'Active base-unit purchase catalogue with optional last purchase cost masking.';

revoke select on public.purchases,public.purchase_items,public.purchase_returns,public.purchase_return_items,public.vendor_ledger_entries from authenticated;
comment on view public.purchase_history is 'Security-definer projection with explicit tenant and branch predicates; direct cost-bearing table reads are revoked.';
