-- Phase 5: RLS-preserving purchasing and supplier-subledger projections.
create view public.purchase_history with (security_invoker=false,security_barrier=true) as
select p.id,p.company_id,p.branch_id,p.warehouse_id,p.stock_location_id,p.purchase_number,p.vendor_invoice_number,p.vendor_id,
 p.purchase_date,p.due_date,p.purchase_type,p.status,
 case when public.user_has_permission('purchases.view_cost') then p.subtotal end subtotal,
 case when public.user_has_permission('purchases.view_cost') then p.item_discount_total end item_discount_total,
 p.bill_discount_type,case when public.user_has_permission('purchases.view_cost') then p.bill_discount_value end bill_discount_value,
 case when public.user_has_permission('purchases.view_cost') then p.bill_discount_amount end bill_discount_amount,
 case when public.user_has_permission('purchases.view_cost') then p.tax_total end tax_total,
 case when public.user_has_permission('purchases.view_cost') then p.shipping_cost end shipping_cost,
 case when public.user_has_permission('purchases.view_cost') then p.other_cost end other_cost,
 case when public.user_has_permission('purchases.view_cost') then p.grand_total end grand_total,
 case when public.user_has_permission('purchases.view_cost') then p.paid_amount end paid_amount,
 case when public.user_has_permission('purchases.view_cost') then p.balance_amount end balance_amount,
 p.payment_status,p.returned_amount,p.notes,p.internal_reference,p.reversal_of_id,p.created_at,p.created_by,p.posted_at,p.posted_by,
 v.vendor_code,v.name vendor_name,b.name branch_name,w.name warehouse_name,l.name location_name,pr.full_name created_user
from public.purchases p join public.vendors v on v.id=p.vendor_id join public.branches b on b.id=p.branch_id
join public.warehouses w on w.id=p.warehouse_id join public.stock_locations l on l.id=p.stock_location_id
left join public.profiles pr on pr.id=p.created_by
where p.company_id=public.current_user_company_id() and public.user_has_branch_access(p.branch_id) and public.user_has_permission('purchases.view');

create view public.purchase_item_details with (security_invoker=false,security_barrier=true) as
select i.id,i.company_id,i.purchase_id,i.product_variant_id,i.unit_id,i.quantity,i.free_quantity,
 case when public.user_has_permission('purchases.view_cost') then i.unit_cost end unit_cost,i.discount_type,
 case when public.user_has_permission('purchases.view_cost') then i.discount_value end discount_value,
 case when public.user_has_permission('purchases.view_cost') then i.discount_amount end discount_amount,i.tax_rate,
 case when public.user_has_permission('purchases.view_cost') then i.tax_amount end tax_amount,
 case when public.user_has_permission('purchases.view_cost') then i.line_subtotal end line_subtotal,
 case when public.user_has_permission('purchases.view_cost') then i.line_total end line_total,
 case when public.user_has_permission('purchases.view_cost') then i.allocated_bill_discount end allocated_bill_discount,
 case when public.user_has_permission('purchases.view_cost') then i.allocated_extra_cost end allocated_extra_cost,
 case when public.user_has_permission('purchases.view_cost') then i.final_unit_cost end final_unit_cost,
 i.batch_reference,i.manufacture_date,i.expiry_date,i.warranty_days,i.remarks,i.created_at,
 p.product_code,p.name product_name,v.variant_name,v.sku,coalesce(v.barcode,pb.barcode) barcode,u.name unit_name,u.symbol unit_symbol
from public.purchase_items i join public.purchases pu on pu.id=i.purchase_id
join public.product_variants v on v.id=i.product_variant_id join public.products p on p.id=v.product_id
join public.units u on u.id=i.unit_id
left join lateral(select barcode from public.product_barcodes z where z.product_variant_id=v.id order by z.is_primary desc,z.created_at limit 1) pb on true
where i.company_id=public.current_user_company_id() and public.user_has_branch_access(pu.branch_id) and public.user_has_permission('purchases.view');

create view public.purchase_return_history with (security_invoker=false,security_barrier=true) as
select r.id,r.company_id,r.branch_id,r.warehouse_id,r.stock_location_id,r.return_number,r.purchase_id,r.vendor_id,r.return_date,r.status,
 case when public.user_has_permission('purchases.view_cost') then r.subtotal end subtotal,
 case when public.user_has_permission('purchases.view_cost') then r.discount_total end discount_total,
 case when public.user_has_permission('purchases.view_cost') then r.tax_total end tax_total,
 case when public.user_has_permission('purchases.view_cost') then r.grand_total end grand_total,
 r.settlement_type,case when public.user_has_permission('purchases.view_cost') then r.refund_amount end refund_amount,
 case when public.user_has_permission('purchases.view_cost') then r.balance_adjustment end balance_adjustment,r.reason,r.notes,r.reversal_of_id,r.created_at,r.created_by,r.posted_at,
 v.vendor_code,v.name vendor_name,b.name branch_name,w.name warehouse_name,l.name location_name,p.purchase_number,pr.full_name created_user
from public.purchase_returns r join public.vendors v on v.id=r.vendor_id join public.branches b on b.id=r.branch_id
join public.warehouses w on w.id=r.warehouse_id join public.stock_locations l on l.id=r.stock_location_id
left join public.purchases p on p.id=r.purchase_id left join public.profiles pr on pr.id=r.created_by
where r.company_id=public.current_user_company_id() and public.user_has_branch_access(r.branch_id) and public.user_has_permission('purchase_returns.view');

create view public.purchase_return_item_details with (security_invoker=false,security_barrier=true) as
select i.id,i.company_id,i.purchase_return_id,i.original_purchase_item_id,i.product_variant_id,i.quantity,
 case when public.user_has_permission('purchases.view_cost') then i.unit_cost end unit_cost,
 case when public.user_has_permission('purchases.view_cost') then i.discount_amount end discount_amount,
 case when public.user_has_permission('purchases.view_cost') then i.tax_amount end tax_amount,
 case when public.user_has_permission('purchases.view_cost') then i.line_total end line_total,
 i.batch_reference,i.reason,i.condition,i.created_at,p.product_code,p.name product_name,v.variant_name,v.sku,coalesce(v.barcode,pb.barcode) barcode
from public.purchase_return_items i join public.purchase_returns r on r.id=i.purchase_return_id
join public.product_variants v on v.id=i.product_variant_id join public.products p on p.id=v.product_id
left join lateral(select barcode from public.product_barcodes z where z.product_variant_id=v.id order by z.is_primary desc,z.created_at limit 1) pb on true
where i.company_id=public.current_user_company_id() and public.user_has_branch_access(r.branch_id) and public.user_has_permission('purchase_returns.view');

create view public.supplier_balance with (security_invoker=false,security_barrier=true) as
with totals as (
 select e.company_id,e.vendor_id,
  sum(case when e.entry_type='opening_balance' then e.credit_amount-e.debit_amount else 0 end)::numeric(18,2) opening_balance,
  sum(case when e.entry_type='purchase' then e.credit_amount-e.debit_amount else 0 end)::numeric(18,2) purchase_balance,
  sum(case when e.entry_type='purchase_return' then e.debit_amount-e.credit_amount else 0 end)::numeric(18,2) purchase_return_balance,
  sum(case when e.entry_type='payment' then e.debit_amount-e.credit_amount else 0 end)::numeric(18,2) payment_balance,
  sum(case when e.entry_type='cheque_return' then e.credit_amount-e.debit_amount else 0 end)::numeric(18,2) cheque_return_balance,
  sum(case when e.entry_type='supplier_advance' then e.debit_amount-e.credit_amount else 0 end)::numeric(18,2) supplier_advance,
  sum(e.credit_amount-e.debit_amount)::numeric(18,2) total_outstanding,
  greatest(sum(case when e.due_date<(now() at time zone 'Asia/Colombo')::date then e.credit_amount-e.debit_amount else 0 end),0)::numeric(18,2) overdue_amount,
  min(e.due_date) filter(where e.due_date>=(now() at time zone 'Asia/Colombo')::date and e.credit_amount>0) next_due_date,
  max(e.entry_date) last_transaction_date
 from public.vendor_ledger_entries e where e.company_id=public.current_user_company_id() and public.user_has_branch_access(e.branch_id) and public.user_has_permission('vendor_statements.view') group by e.company_id,e.vendor_id
)
select t.*,v.vendor_code,v.name vendor_name,v.phone,v.email
from totals t join public.vendors v on v.id=t.vendor_id;

create view public.supplier_statement with (security_invoker=false,security_barrier=true) as
select e.id,e.company_id,e.branch_id,e.vendor_id,e.entry_date,e.entry_type,e.reference_type,e.reference_id,e.reference_number,
 e.debit_amount,e.credit_amount,e.due_date,e.notes,e.created_at,e.created_by,b.name branch_name,p.full_name created_user,
 sum(e.credit_amount-e.debit_amount) over(partition by e.company_id,e.vendor_id order by e.entry_date,e.created_at,e.id rows unbounded preceding)::numeric(18,2) running_balance,
 (e.due_date is not null and e.due_date<(now() at time zone 'Asia/Colombo')::date and e.credit_amount>0) overdue
from public.vendor_ledger_entries e join public.branches b on b.id=e.branch_id left join public.profiles p on p.id=e.created_by
where e.company_id=public.current_user_company_id() and public.user_has_branch_access(e.branch_id) and public.user_has_permission('vendor_statements.view');

drop view if exists public.stock_movement_history;
create view public.stock_movement_history with (security_invoker=true) as
select m.id,m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,
 m.movement_date,m.movement_type,m.quantity_in,m.quantity_out,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') or public.user_has_permission('purchases.view_cost') then m.unit_cost end unit_cost,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') or public.user_has_permission('purchases.view_cost') then m.total_cost end total_cost,
 m.reference_type,m.reference_id,m.reference_number,m.source_movement_id,m.reversal_movement_id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,
 m.created_at,m.created_by,
 coalesce(d.document_type::text,case when m.reference_type='purchase' then 'purchase' when m.reference_type='purchase_return' then 'purchase_return' end) document_type,
 coalesce(d.status::text,pu.status::text,rt.status::text) document_status,
 br.name branch_name,w.name warehouse_name,l.name location_name,pr.full_name created_user,
 sum(m.quantity_in-m.quantity_out) over(partition by m.company_id,m.stock_location_id,m.product_variant_id order by m.movement_date,m.created_at,m.id rows unbounded preceding)::numeric(18,4) running_quantity
from public.stock_movements m left join public.inventory_documents d on d.id=m.reference_id and m.reference_type='inventory_document'
left join public.purchases pu on pu.id=m.reference_id and m.reference_type='purchase'
left join public.purchase_returns rt on rt.id=m.reference_id and m.reference_type='purchase_return'
join public.branches br on br.id=m.branch_id join public.warehouses w on w.id=m.warehouse_id join public.stock_locations l on l.id=m.stock_location_id
left join public.profiles pr on pr.id=m.created_by;

grant select on public.purchase_history,public.purchase_item_details,public.purchase_return_history,public.purchase_return_item_details,public.supplier_balance,public.supplier_statement,public.stock_movement_history to authenticated;
revoke all on public.purchase_history,public.purchase_item_details,public.purchase_return_history,public.purchase_return_item_details,public.supplier_balance,public.supplier_statement,public.stock_movement_history from anon;
