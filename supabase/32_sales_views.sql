-- Phase 6: RLS-preserving sales and customer-subledger projections.
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

create view public.customer_statement with (security_invoker=false,security_barrier=true) as
select e.id,e.company_id,e.branch_id,e.customer_id,e.entry_date,e.entry_type,e.reference_type,e.reference_id,e.reference_number,
 e.debit_amount,e.credit_amount,e.due_date,e.notes,e.created_at,e.created_by,b.name branch_name,p.full_name created_user,
 sum(e.debit_amount-e.credit_amount) over(partition by e.company_id,e.customer_id order by e.entry_date,e.created_at,e.id rows unbounded preceding)::numeric(18,2) running_balance,
 (e.due_date is not null and e.due_date<(now() at time zone 'Asia/Colombo')::date and e.debit_amount>0) overdue
from public.customer_ledger_entries e join public.branches b on b.id=e.branch_id left join public.profiles p on p.id=e.created_by
where e.company_id=public.current_user_company_id() and public.user_has_branch_access(e.branch_id) and public.user_has_permission('customer_statements.view');

create view public.invoice_payment_history with (security_invoker=false,security_barrier=true) as
select p.id,p.company_id,p.branch_id,p.invoice_id,p.customer_id,p.payment_number,p.payment_date,p.payment_method,p.amount,
 p.bank_account_id,p.card_reference,p.cheque_number,p.cheque_date,p.cheque_status,p.notes,p.status,p.clearing_status,
 p.created_at,p.created_by,p.posted_at,p.reversed_at,p.reversal_reason,
 c.customer_code,c.name customer_name,b.name branch_name,si.invoice_number,ba.account_name bank_account_name,pr.full_name created_user
from public.invoice_payments p join public.customers c on c.id=p.customer_id join public.branches b on b.id=p.branch_id
left join public.sales_invoices si on si.id=p.invoice_id left join public.bank_accounts ba on ba.id=p.bank_account_id left join public.profiles pr on pr.id=p.created_by
where p.company_id=public.current_user_company_id() and public.user_has_branch_access(p.branch_id) and (public.user_has_permission('sales.view') or public.user_has_permission('customer_statements.view'));

create view public.sales_return_history with (security_invoker=false,security_barrier=true) as
select r.id,r.company_id,r.branch_id,r.warehouse_id,r.stock_location_id,r.return_number,r.invoice_id,r.customer_id,r.return_date,r.status,
 r.subtotal,r.discount_total,r.tax_total,r.grand_total,r.settlement_type,r.refund_amount,r.balance_adjustment,r.reason,r.notes,r.reversal_of_id,
 r.created_at,r.created_by,r.posted_at,
 c.customer_code,c.name customer_name,b.name branch_name,w.name warehouse_name,l.name location_name,si.invoice_number,pr.full_name created_user
from public.sales_returns r join public.customers c on c.id=r.customer_id join public.branches b on b.id=r.branch_id
join public.warehouses w on w.id=r.warehouse_id join public.stock_locations l on l.id=r.stock_location_id
left join public.sales_invoices si on si.id=r.invoice_id left join public.profiles pr on pr.id=r.created_by
where r.company_id=public.current_user_company_id() and public.user_has_branch_access(r.branch_id) and public.user_has_permission('sales_returns.view');

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

-- Update stock_movement_history to include sales references.
drop view if exists public.stock_movement_history;
create view public.stock_movement_history with (security_invoker=true) as
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

comment on view public.customer_balance is 'Derived only from immutable customer ledger entries; debit minus credit is customer outstanding.';
comment on view public.customer_statement is 'Deterministic running balance ordered by entry_date, created_at, and id.';
comment on view public.pos_product_search is 'Active product catalogue for POS barcode and SKU lookup with real-time available quantity.';
