-- ============================================================================
-- CONSOLIDATED PURCHASES & PURCHASE VIEWS SCHEMA RESET
-- ============================================================================
-- Recreates all purchasing views, projections, and permissions so that
-- Purchase Entry, Purchase History, and Supplier Accounts load smoothly.
-- ============================================================================

-- 1. Purchase Product Search View (for Barcode / SKU search in Purchase terminal)
create or replace view public.purchase_product_search
with (security_invoker = false, security_barrier = true) as
select 
  v.company_id,
  v.id as product_variant_id,
  p.id as product_id,
  p.product_code,
  p.name as product_name,
  v.variant_name,
  v.sku,
  coalesce(v.barcode, pb.barcode) as barcode,
  p.base_unit_id,
  u.name as unit_name,
  p.preferred_vendor_id,
  pv.name as preferred_vendor_name,
  p.reorder_level,
  v.retail_price,
  v.wholesale_price,
  coalesce(
    (select m.unit_cost from public.stock_movements m where m.company_id = v.company_id and m.product_variant_id = v.id and m.quantity_in > 0 order by m.movement_date desc, m.created_at desc limit 1),
    v.purchase_price,
    0
  ) as last_purchase_cost,
  coalesce(
    (select sum(sm.quantity_in - sm.quantity_out) from public.stock_movements sm where sm.company_id = v.company_id and sm.product_variant_id = v.id),
    0
  )::numeric(18,4) as available_quantity
from public.product_variants v
join public.products p on p.id = v.product_id and p.company_id = v.company_id
join public.units u on u.id = p.base_unit_id
left join public.vendors pv on pv.id = p.preferred_vendor_id
left join lateral (
  select barcode from public.product_barcodes z 
  where z.product_variant_id = v.id 
  order by z.is_primary desc, z.created_at limit 1
) pb on true
where v.is_active 
  and v.deleted_at is null 
  and p.product_status = 'active' 
  and p.deleted_at is null
  and v.company_id = public.current_user_company_id() 
  and (
    public.user_has_permission('purchases.create') 
    or public.user_has_permission('purchase_returns.create')
    or public.user_has_permission('products.view')
  );

-- 2. Purchase History View
create or replace view public.purchase_history
with (security_invoker = false, security_barrier = true) as
select 
  p.id, p.company_id, p.branch_id, p.warehouse_id, p.stock_location_id, 
  p.purchase_number, p.vendor_invoice_number, p.vendor_id,
  p.purchase_date, p.due_date, p.purchase_type, p.status,
  case when public.user_has_permission('purchases.view_cost') then p.subtotal end as subtotal,
  case when public.user_has_permission('purchases.view_cost') then p.item_discount_total end as item_discount_total,
  p.bill_discount_type,
  case when public.user_has_permission('purchases.view_cost') then p.bill_discount_value end as bill_discount_value,
  case when public.user_has_permission('purchases.view_cost') then p.bill_discount_amount end as bill_discount_amount,
  case when public.user_has_permission('purchases.view_cost') then p.tax_total end as tax_total,
  case when public.user_has_permission('purchases.view_cost') then p.shipping_cost end as shipping_cost,
  case when public.user_has_permission('purchases.view_cost') then p.other_cost end as other_cost,
  case when public.user_has_permission('purchases.view_cost') then p.grand_total end as grand_total,
  case when public.user_has_permission('purchases.view_cost') then p.paid_amount end as paid_amount,
  case when public.user_has_permission('purchases.view_cost') then p.balance_amount end as balance_amount,
  p.payment_status, p.returned_amount, p.notes, p.internal_reference, p.reversal_of_id, 
  p.created_at, p.created_by, p.posted_at, p.posted_by,
  v.vendor_code, v.name as vendor_name, 
  b.name as branch_name, 
  w.name as warehouse_name, 
  l.name as location_name, 
  pr.full_name as created_user
from public.purchases p 
join public.vendors v on v.id = p.vendor_id 
join public.branches b on b.id = p.branch_id
join public.warehouses w on w.id = p.warehouse_id 
join public.stock_locations l on l.id = p.stock_location_id
left join public.profiles pr on pr.id = p.created_by
where p.company_id = public.current_user_company_id() 
  and public.user_has_branch_access(p.branch_id) 
  and public.user_has_permission('purchases.view');

-- 3. Purchase Item Details View
create or replace view public.purchase_item_details
with (security_invoker = false, security_barrier = true) as
select 
  i.id, i.company_id, i.purchase_id, i.product_variant_id, i.unit_id, 
  i.quantity, i.free_quantity,
  case when public.user_has_permission('purchases.view_cost') then i.unit_cost end as unit_cost,
  i.discount_type,
  case when public.user_has_permission('purchases.view_cost') then i.discount_value end as discount_value,
  case when public.user_has_permission('purchases.view_cost') then i.discount_amount end as discount_amount,
  i.tax_rate,
  case when public.user_has_permission('purchases.view_cost') then i.tax_amount end as tax_amount,
  case when public.user_has_permission('purchases.view_cost') then i.line_subtotal end as line_subtotal,
  case when public.user_has_permission('purchases.view_cost') then i.line_total end as line_total,
  case when public.user_has_permission('purchases.view_cost') then i.allocated_bill_discount end as allocated_bill_discount,
  case when public.user_has_permission('purchases.view_cost') then i.allocated_extra_cost end as allocated_extra_cost,
  case when public.user_has_permission('purchases.view_cost') then i.final_unit_cost end as final_unit_cost,
  i.batch_reference, i.manufacture_date, i.expiry_date, i.warranty_days, i.remarks, i.created_at,
  p.product_code, p.name as product_name, 
  v.variant_name, v.sku, 
  coalesce(v.barcode, pb.barcode) as barcode, 
  u.name as unit_name, u.symbol as unit_symbol
from public.purchase_items i 
join public.purchases pu on pu.id = i.purchase_id
join public.product_variants v on v.id = i.product_variant_id 
join public.products p on p.id = v.product_id
join public.units u on u.id = i.unit_id
left join lateral (
  select barcode from public.product_barcodes z 
  where z.product_variant_id = v.id 
  order by z.is_primary desc, z.created_at limit 1
) pb on true
where i.company_id = public.current_user_company_id() 
  and public.user_has_branch_access(pu.branch_id) 
  and public.user_has_permission('purchases.view');

-- 4. Purchase Payment History View
create or replace view public.purchase_payment_history
with (security_invoker = false, security_barrier = true) as
select 
  p.id, p.company_id, p.branch_id, p.purchase_id, p.vendor_id, 
  p.payment_number, p.payment_date, p.payment_method, p.amount, 
  p.bank_account_id, p.cheque_id, p.reference_number, p.notes, 
  p.status, p.clearing_status, p.created_at, p.created_by, 
  p.posted_at, p.reversed_at, p.reversal_reason,
  v.vendor_code, v.name as vendor_name, 
  b.name as branch_name, 
  pu.purchase_number, 
  ba.account_name as bank_account_name, 
  pr.full_name as created_user
from public.purchase_payments p 
join public.vendors v on v.id = p.vendor_id 
join public.branches b on b.id = p.branch_id
left join public.purchases pu on pu.id = p.purchase_id 
left join public.bank_accounts ba on ba.id = p.bank_account_id 
left join public.profiles pr on pr.id = p.created_by
where p.company_id = public.current_user_company_id() 
  and public.user_has_branch_access(p.branch_id) 
  and (
    public.user_has_permission('purchases.view') 
    or public.user_has_permission('vendor_statements.view')
  );

-- 5. Purchase Return History View
create or replace view public.purchase_return_history
with (security_invoker = false, security_barrier = true) as
select 
  r.id, r.company_id, r.branch_id, r.warehouse_id, r.stock_location_id, 
  r.return_number, r.purchase_id, r.vendor_id, r.return_date, r.status,
  case when public.user_has_permission('purchases.view_cost') then r.subtotal end as subtotal,
  case when public.user_has_permission('purchases.view_cost') then r.discount_total end as discount_total,
  case when public.user_has_permission('purchases.view_cost') then r.tax_total end as tax_total,
  case when public.user_has_permission('purchases.view_cost') then r.grand_total end as grand_total,
  r.settlement_type,
  case when public.user_has_permission('purchases.view_cost') then r.refund_amount end as refund_amount,
  case when public.user_has_permission('purchases.view_cost') then r.balance_adjustment end as balance_adjustment,
  r.reason, r.notes, r.reversal_of_id, r.created_at, r.created_by, r.posted_at,
  v.vendor_code, v.name as vendor_name, 
  b.name as branch_name, 
  w.name as warehouse_name, 
  l.name as location_name, 
  p.purchase_number, 
  pr.full_name as created_user
from public.purchase_returns r 
join public.vendors v on v.id = r.vendor_id 
join public.branches b on b.id = r.branch_id
join public.warehouses w on w.id = r.warehouse_id 
join public.stock_locations l on l.id = r.stock_location_id
left join public.purchases p on p.id = r.purchase_id 
left join public.profiles pr on pr.id = r.created_by
where r.company_id = public.current_user_company_id() 
  and public.user_has_branch_access(r.branch_id) 
  and public.user_has_permission('purchase_returns.view');

-- 6. Purchase Return Item Details View
create or replace view public.purchase_return_item_details
with (security_invoker = false, security_barrier = true) as
select 
  i.id, i.company_id, i.purchase_return_id, i.original_purchase_item_id, 
  i.product_variant_id, i.quantity,
  case when public.user_has_permission('purchases.view_cost') then i.unit_cost end as unit_cost,
  case when public.user_has_permission('purchases.view_cost') then i.discount_amount end as discount_amount,
  case when public.user_has_permission('purchases.view_cost') then i.tax_amount end as tax_amount,
  case when public.user_has_permission('purchases.view_cost') then i.line_total end as line_total,
  i.batch_reference, i.reason, i.condition, i.created_at, 
  p.product_code, p.name as product_name, 
  v.variant_name, v.sku, 
  coalesce(v.barcode, pb.barcode) as barcode
from public.purchase_return_items i 
join public.purchase_returns r on r.id = i.purchase_return_id
join public.product_variants v on v.id = i.product_variant_id 
join public.products p on p.id = v.product_id
left join lateral (
  select barcode from public.product_barcodes z 
  where z.product_variant_id = v.id 
  order by z.is_primary desc, z.created_at limit 1
) pb on true
where i.company_id = public.current_user_company_id() 
  and public.user_has_branch_access(r.branch_id) 
  and public.user_has_permission('purchase_returns.view');

-- 7. Purchase Return Eligibility View
create or replace view public.purchase_return_eligibility
with (security_invoker = false, security_barrier = true) as
select 
  i.id as original_purchase_item_id, 
  i.company_id, i.purchase_id, i.product_variant_id, 
  i.quantity + i.free_quantity as purchased_quantity,
  coalesce(sum(ri.quantity) filter (where r.status = 'posted'), 0)::numeric(18,4) as returned_quantity,
  (i.quantity + i.free_quantity - coalesce(sum(ri.quantity) filter (where r.status = 'posted'), 0))::numeric(18,4) as eligible_quantity,
  case when public.user_has_permission('purchases.view_cost') then i.final_unit_cost end as historical_unit_cost,
  i.batch_reference, 
  p.product_code, p.name as product_name, 
  v.variant_name, v.sku, 
  coalesce(v.barcode, pb.barcode) as barcode
from public.purchase_items i 
join public.purchases pu on pu.id = i.purchase_id 
join public.product_variants v on v.id = i.product_variant_id 
join public.products p on p.id = v.product_id
left join public.purchase_return_items ri on ri.original_purchase_item_id = i.id 
left join public.purchase_returns r on r.id = ri.purchase_return_id
left join lateral (
  select barcode from public.product_barcodes z 
  where z.product_variant_id = v.id 
  order by z.is_primary desc, z.created_at limit 1
) pb on true
where i.company_id = public.current_user_company_id() 
  and pu.status = 'posted' 
  and public.user_has_branch_access(pu.branch_id) 
  and public.user_has_permission('purchase_returns.create')
group by 
  i.id, i.company_id, i.purchase_id, i.product_variant_id, 
  i.quantity, i.free_quantity, i.final_unit_cost, i.batch_reference, 
  p.product_code, p.name, v.variant_name, v.sku, v.barcode, pb.barcode;

-- 8. Supplier Balance View
create or replace view public.supplier_balance
with (security_invoker = false, security_barrier = true) as
with totals as (
  select 
    e.company_id, e.vendor_id,
    sum(case when e.entry_type = 'opening_balance' then e.credit_amount - e.debit_amount else 0 end)::numeric(18,2) as opening_balance,
    sum(case when e.entry_type = 'purchase' then e.credit_amount - e.debit_amount else 0 end)::numeric(18,2) as purchase_balance,
    sum(case when e.entry_type = 'purchase_return' then e.debit_amount - e.credit_amount else 0 end)::numeric(18,2) as purchase_return_balance,
    sum(case when e.entry_type = 'payment' then e.debit_amount - e.credit_amount else 0 end)::numeric(18,2) as payment_balance,
    sum(case when e.entry_type = 'cheque_return' then e.credit_amount - e.debit_amount else 0 end)::numeric(18,2) as cheque_return_balance,
    sum(case when e.entry_type = 'supplier_advance' then e.debit_amount - e.credit_amount else 0 end)::numeric(18,2) as supplier_advance,
    sum(e.credit_amount - e.debit_amount)::numeric(18,2) as total_outstanding,
    greatest(sum(case when e.due_date < (now() at time zone 'Asia/Colombo')::date then e.credit_amount - e.debit_amount else 0 end), 0)::numeric(18,2) as overdue_amount,
    min(e.due_date) filter (where e.due_date >= (now() at time zone 'Asia/Colombo')::date and e.credit_amount > 0) as next_due_date,
    max(e.entry_date) as last_transaction_date
  from public.vendor_ledger_entries e 
  where e.company_id = public.current_user_company_id() 
    and public.user_has_branch_access(e.branch_id) 
    and public.user_has_permission('vendor_statements.view') 
  group by e.company_id, e.vendor_id
)
select t.*, v.vendor_code, v.name as vendor_name, v.phone, v.email
from totals t 
join public.vendors v on v.id = t.vendor_id;

-- 9. Supplier Statement View
create or replace view public.supplier_statement
with (security_invoker = false, security_barrier = true) as
select 
  e.id, e.company_id, e.branch_id, e.vendor_id, e.entry_date, e.entry_type, 
  e.reference_type, e.reference_id, e.reference_number,
  e.debit_amount, e.credit_amount, e.due_date, e.notes, 
  e.created_at, e.created_by, 
  b.name as branch_name, 
  p.full_name as created_user,
  sum(e.credit_amount - e.debit_amount) over (
    partition by e.company_id, e.vendor_id 
    order by e.entry_date, e.created_at, e.id 
    rows unbounded preceding
  )::numeric(18,2) as running_balance,
  (e.due_date is not null and e.due_date < (now() at time zone 'Asia/Colombo')::date and e.credit_amount > 0) as overdue
from public.vendor_ledger_entries e 
join public.branches b on b.id = e.branch_id 
left join public.profiles p on p.id = e.created_by
where e.company_id = public.current_user_company_id() 
  and public.user_has_branch_access(e.branch_id) 
  and public.user_has_permission('vendor_statements.view');

-- 10. Grants and Permissions
grant select on 
  public.purchase_product_search,
  public.purchase_history,
  public.purchase_item_details,
  public.purchase_payment_history,
  public.purchase_return_history,
  public.purchase_return_item_details,
  public.purchase_return_eligibility,
  public.supplier_balance,
  public.supplier_statement
to authenticated;

revoke all on 
  public.purchase_product_search,
  public.purchase_history,
  public.purchase_item_details,
  public.purchase_payment_history,
  public.purchase_return_history,
  public.purchase_return_item_details,
  public.purchase_return_eligibility,
  public.supplier_balance,
  public.supplier_statement
from anon;

-- 11. Hardened post_purchase_payment_internal (Guards against 0-amount vendor ledger entries)
create or replace function public.post_purchase_payment_internal(p_payment_id uuid) returns public.purchase_payments 
language plpgsql security definer set search_path='' as $$
declare pay public.purchase_payments%rowtype;
begin
 select * into pay from public.purchase_payments where id=p_payment_id for update;
 if not found then raise exception 'Supplier payment not found';end if;
 if pay.status='posted' then return pay;end if;
 if pay.status<>'draft' then raise exception 'Only draft supplier payments can be posted';end if;
 if pay.payment_method='cheque' and pay.clearing_status<>'cleared' then raise exception 'Cheque payment remains pending until verified by the finance module';end if;
 if coalesce(pay.amount, 0) > 0 then
   insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
   values(pay.company_id,pay.branch_id,pay.vendor_id,pay.payment_date,case when pay.purchase_id is null then 'supplier_advance'::public.vendor_ledger_entry_type else 'payment'::public.vendor_ledger_entry_type end,'purchase_payment',pay.id,pay.payment_number,pay.amount,0,pay.notes,auth.uid());
 end if;
 perform set_config('app.purchase_payment_workflow','on',true);
 update public.purchase_payments set status='posted',posted_at=now(),posted_by=auth.uid() where id=pay.id returning * into pay;
 return pay;
end$$;

-- 12. Hardened post_purchase (Guards against 0 grand_total vendor ledger entries)
create or replace function public.post_purchase(p_purchase_id uuid) returns jsonb 
language plpgsql security definer set search_path='' as $$
declare 
  d public.purchases%rowtype;
  i public.purchase_items%rowtype;
  pay public.purchase_payments%rowtype;
  product_row public.products%rowtype;
  variant_row public.product_variants%rowtype;
  received numeric(18,4);
  payment_total numeric(18,2):=0;
  movement_id uuid;
  item_count integer:=0;
  business_date date:=(now() at time zone 'Asia/Colombo')::date;
begin
 if auth.uid() is null or not public.user_has_permission('purchases.post') then raise exception 'purchases.post permission required' using errcode='42501';end if;
 select * into d from public.purchases where id=p_purchase_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Purchase not found or branch denied' using errcode='42501';end if;
 if d.status='posted' then return jsonb_build_object('id',d.id,'document_number',d.purchase_number,'status',d.status,'idempotent',true);end if;
 if d.status<>'approved' then raise exception 'Only approved purchases can be posted';end if;
 if exists(select 1 from public.stock_movements where reference_type='purchase' and reference_id=d.id) or exists(select 1 from public.vendor_ledger_entries where reference_type='purchase' and reference_id=d.id) then raise exception 'Purchase already has posted effects';end if;
 if d.purchase_date<business_date and not public.user_has_permission('purchases.backdate') then raise exception 'Backdated posting requires purchases.backdate' using errcode='42501';end if;
 d:=public.recalculate_purchase(d.id);
 for i in select * from public.purchase_items where purchase_id=d.id order by id for update loop
  item_count:=item_count+1;
  received:=i.quantity+i.free_quantity;
  perform pg_advisory_xact_lock(hashtextextended(d.stock_location_id::text||i.product_variant_id::text,0));
  select v.* into variant_row from public.product_variants v where v.id=i.product_variant_id and v.company_id=d.company_id and v.is_active and v.deleted_at is null;
  select p.* into product_row from public.products p where p.id=variant_row.product_id and p.company_id=d.company_id and p.product_status='active' and p.deleted_at is null and p.track_stock;
  if variant_row.id is null or product_row.id is null then raise exception 'Invalid active stock product on purchase line';end if;
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,product_code,product_name,variant_name,sku,barcode,created_by)
  values(d.company_id,d.branch_id,d.warehouse_id,d.stock_location_id,product_row.id,variant_row.id,d.purchase_date,'purchase_in',received,0,i.final_unit_cost,round(received*i.final_unit_cost,2),'purchase',d.id,d.purchase_number,product_row.product_code,product_row.name,variant_row.variant_name,variant_row.sku,variant_row.barcode,auth.uid()) returning id into movement_id;
  insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date)
  values(d.company_id,d.branch_id,d.warehouse_id,d.stock_location_id,i.product_variant_id,movement_id,received,received,i.final_unit_cost,d.purchase_date);
 end loop;
 if item_count=0 then raise exception 'Purchase has no items';end if;
 if coalesce(d.grand_total, 0) > 0 then
  insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,due_date,notes,created_by)
  values(d.company_id,d.branch_id,d.vendor_id,d.purchase_date,'purchase','purchase',d.id,d.purchase_number,0,d.grand_total,d.due_date,d.notes,auth.uid());
 end if;
 for pay in select * from public.purchase_payments where purchase_id=d.id and status='draft' order by created_at,id for update loop
  if (pay.payment_method<>'cheque' or pay.clearing_status='cleared') and coalesce(pay.amount, 0) > 0 then 
    pay:=public.post_purchase_payment_internal(pay.id);
    payment_total:=payment_total+pay.amount;
  end if;
 end loop;
 if payment_total>d.grand_total then raise exception 'Immediate payments cannot exceed purchase total';end if;
 if d.purchase_type='cash' and payment_total<>d.grand_total and d.grand_total>0 then raise exception 'Cash purchase requires full cleared immediate payment';end if;
 if d.purchase_type='mixed' and (payment_total<=0 or payment_total>=d.grand_total) then raise exception 'Mixed purchase requires a partial cleared immediate payment';end if;
 if d.purchase_type='credit' and payment_total>=d.grand_total and d.grand_total>0 then raise exception 'Use cash or mixed type when fully paid immediately';end if;
 perform set_config('app.purchase_workflow','on',true);
 update public.purchases set status='posted',posted_at=now(),posted_by=auth.uid(),paid_amount=payment_total,balance_amount=grand_total-payment_total,payment_status=case when payment_total=0 then 'unpaid'::public.purchase_payment_status when payment_total=grand_total then 'paid'::public.purchase_payment_status else 'partial'::public.purchase_payment_status end where id=d.id returning * into d;
 if d.purchase_date<business_date then perform public.purchase_audit(d,'BACKDATE',null,jsonb_build_object('purchase_date',d.purchase_date,'posted_date',business_date));end if;
 perform public.purchase_audit(d,'POST',null,jsonb_build_object('grand_total',d.grand_total,'paid_amount',d.paid_amount,'balance_amount',d.balance_amount));
 return jsonb_build_object('id',d.id,'document_number',d.purchase_number,'status',d.status,'grand_total',d.grand_total,'paid_amount',d.paid_amount,'balance_amount',d.balance_amount,'idempotent',false);
end$$;

grant execute on function public.post_purchase(uuid), public.create_purchase_draft(jsonb,jsonb,jsonb), public.submit_purchase(uuid), public.approve_purchase(uuid), public.cancel_purchase(uuid,text) to authenticated;

-- 13. Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';

