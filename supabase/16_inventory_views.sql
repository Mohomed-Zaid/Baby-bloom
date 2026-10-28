-- Phase 4: RLS-preserving stock projections. Costs are masked in PostgreSQL.
create view public.current_stock with (security_invoker=true) as
with movement_totals as (
 select m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,
  sum(m.quantity_in)::numeric(18,4) quantity_in,sum(m.quantity_out)::numeric(18,4) quantity_out,
  sum(m.quantity_in-m.quantity_out)::numeric(18,4) quantity_on_hand,
  sum(case when m.quantity_in>0 then m.total_cost else -m.total_cost end)::numeric(18,2) carrying_value
 from public.stock_movements m group by 1,2,3,4,5,6
), reservations as (
 select company_id,stock_location_id,product_variant_id,sum(quantity)::numeric(18,4) reserved_quantity
 from public.stock_reservations where status='active' and (expires_at is null or expires_at>now()) group by 1,2,3
)
select x.company_id,x.branch_id,x.warehouse_id,x.stock_location_id,x.product_id,x.product_variant_id,
 br.name branch_name,w.name warehouse_name,l.name location_name,
 p.product_code,p.name product_name,p.product_status,p.category_id,c.name category_name,p.brand_id,b.name brand_name,
 p.minimum_stock,p.reorder_level,p.preferred_vendor_id,pv.name preferred_vendor_name,v.variant_name,v.sku,coalesce(v.barcode,pb.barcode) barcode,
 v.retail_price,v.wholesale_price,u.decimal_places,x.quantity_in,x.quantity_out,x.quantity_on_hand,
 coalesce(r.reserved_quantity,0)::numeric(18,4) reserved_quantity,
 (x.quantity_on_hand-coalesce(r.reserved_quantity,0))::numeric(18,4) available_quantity,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') then case when x.quantity_on_hand=0 then 0 else round(x.carrying_value/x.quantity_on_hand,4) end end weighted_average_cost,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') then x.carrying_value end inventory_value,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') then lm.unit_cost end last_inbound_cost,
 ((x.quantity_on_hand-coalesce(r.reserved_quantity,0))<=p.reorder_level) low_stock
from movement_totals x join public.products p on p.id=x.product_id join public.product_variants v on v.id=x.product_variant_id
join public.units u on u.id=p.base_unit_id join public.branches br on br.id=x.branch_id join public.warehouses w on w.id=x.warehouse_id join public.stock_locations l on l.id=x.stock_location_id left join public.categories c on c.id=p.category_id left join public.brands b on b.id=p.brand_id left join public.vendors pv on pv.id=p.preferred_vendor_id
left join lateral(select barcode from public.product_barcodes z where z.product_variant_id=v.id order by z.is_primary desc,z.created_at limit 1) pb on true
left join lateral(select unit_cost from public.stock_movements z where z.company_id=x.company_id and z.stock_location_id=x.stock_location_id and z.product_variant_id=x.product_variant_id and z.quantity_in>0 order by z.movement_date desc,z.created_at desc,z.id desc limit 1) lm on true
left join reservations r on r.company_id=x.company_id and r.stock_location_id=x.stock_location_id and r.product_variant_id=x.product_variant_id;

create view public.branch_stock_summary with (security_invoker=true) as
select company_id,branch_id,product_id,product_variant_id,product_code,product_name,variant_name,sku,
 sum(quantity_on_hand)::numeric(18,4) quantity_on_hand,sum(reserved_quantity)::numeric(18,4) reserved_quantity,sum(available_quantity)::numeric(18,4) available_quantity,
 case when bool_or(weighted_average_cost is not null) then round(sum(coalesce(inventory_value,0))/nullif(sum(quantity_on_hand),0),4) end weighted_average_cost,
 case when bool_or(inventory_value is not null) then sum(inventory_value)::numeric(18,2) end inventory_value
from public.current_stock group by 1,2,3,4,5,6,7,8;

create view public.company_stock_summary with (security_invoker=true) as
select company_id,product_id,product_variant_id,product_code,product_name,variant_name,sku,
 sum(quantity_on_hand)::numeric(18,4) quantity_on_hand,sum(reserved_quantity)::numeric(18,4) reserved_quantity,sum(available_quantity)::numeric(18,4) available_quantity,
 case when bool_or(weighted_average_cost is not null) then round(sum(coalesce(inventory_value,0))/nullif(sum(quantity_on_hand),0),4) end weighted_average_cost,
 case when bool_or(inventory_value is not null) then sum(inventory_value)::numeric(18,2) end inventory_value
from public.current_stock group by 1,2,3,4,5,6,7;

create view public.stock_movement_history with (security_invoker=true) as
select m.id,m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,
 m.movement_date,m.movement_type,m.quantity_in,m.quantity_out,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') then m.unit_cost end unit_cost,
 case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') then m.total_cost end total_cost,
 m.reference_type,m.reference_id,m.reference_number,m.source_movement_id,m.reversal_movement_id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,
 m.created_at,m.created_by,d.document_type,d.status document_status,br.name branch_name,w.name warehouse_name,l.name location_name,pr.full_name created_user,
 sum(m.quantity_in-m.quantity_out) over(partition by m.company_id,m.stock_location_id,m.product_variant_id order by m.movement_date,m.created_at,m.id rows unbounded preceding)::numeric(18,4) running_quantity
from public.stock_movements m join public.inventory_documents d on d.id=m.reference_id
join public.branches br on br.id=m.branch_id join public.warehouses w on w.id=m.warehouse_id join public.stock_locations l on l.id=m.stock_location_id
left join public.profiles pr on pr.id=m.created_by;

create view public.low_stock_products with (security_invoker=true) as
select *,greatest(reorder_level-available_quantity,0)::numeric(18,4) shortage_quantity
from public.current_stock where product_status='active' and available_quantity<=reorder_level;

grant select on public.current_stock,public.branch_stock_summary,public.company_stock_summary,public.stock_movement_history,public.low_stock_products to authenticated;
revoke all on public.current_stock,public.branch_stock_summary,public.company_stock_summary,public.stock_movement_history,public.low_stock_products from anon;
