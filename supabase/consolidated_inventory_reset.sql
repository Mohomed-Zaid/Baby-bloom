-- ==============================================================================
-- CONSOLIDATED CURRENT STOCK, INVENTORY PROJECTIONS & STOCK MOVEMENTS RESET
-- ==============================================================================
-- This script safely updates and recreates all stock projection views,
-- RLS policies, and search views so that:
--   1. Current Stock is calculated in real-time from posted stock movements.
--   2. Inbound Purchases increase available stock.
--   3. Outbound POS / Sales Invoices decrease available stock.
--   4. Purchase Entry and POS terminals display live available stock accurately.
-- ==============================================================================

-- 1. DROP EXISTING VIEWS (in dependency order)
drop view if exists public.low_stock_products cascade;
drop view if exists public.branch_stock_summary cascade;
drop view if exists public.company_stock_summary cascade;
drop view if exists public.current_stock cascade;
drop view if exists public.stock_movement_history cascade;

-- 2. ENSURE inventory_stock_state FUNCTION IS OPTIMIZED AND ACCURATE
create or replace function public.inventory_stock_state(p_company uuid, p_location uuid, p_variant uuid)
returns table(quantity numeric, average_cost numeric, available numeric)
language sql stable security definer set search_path = '' as $$
  with m as (
    select 
      coalesce(sum(quantity_in - quantity_out), 0) as q,
      coalesce(sum(case when quantity_in > 0 then total_cost else -total_cost end), 0) as v 
    from public.stock_movements 
    where company_id = p_company 
      and stock_location_id = p_location 
      and product_variant_id = p_variant
  ),
  r as (
    select coalesce(sum(quantity), 0) as q 
    from public.stock_reservations 
    where company_id = p_company 
      and stock_location_id = p_location 
      and product_variant_id = p_variant 
      and status = 'active' 
      and (expires_at is null or expires_at > now())
  )
  select 
    m.q::numeric(18,4),
    case when m.q = 0 then 0 else round(m.v / m.q, 4) end::numeric(18,4),
    (m.q - r.q)::numeric(18,4) 
  from m, r;
$$;

-- 3. RECREATE current_stock VIEW (Central Live Stock Ledger Projection)
create view public.current_stock
with (security_invoker = false, security_barrier = true) as
with movement_totals as (
  select 
    m.company_id,
    m.branch_id,
    m.warehouse_id,
    m.stock_location_id,
    m.product_id,
    m.product_variant_id,
    sum(m.quantity_in)::numeric(18,4) as quantity_in,
    sum(m.quantity_out)::numeric(18,4) as quantity_out,
    sum(m.quantity_in - m.quantity_out)::numeric(18,4) as quantity_on_hand,
    sum(case when m.quantity_in > 0 then m.total_cost else -m.total_cost end)::numeric(18,2) as carrying_value
  from public.stock_movements m 
  group by 1, 2, 3, 4, 5, 6
), reservations as (
  select 
    company_id,
    stock_location_id,
    product_variant_id,
    sum(quantity)::numeric(18,4) as reserved_quantity
  from public.stock_reservations 
  where status = 'active' 
    and (expires_at is null or expires_at > now()) 
  group by 1, 2, 3
)
select 
  x.company_id,
  x.branch_id,
  x.warehouse_id,
  x.stock_location_id,
  x.product_id,
  x.product_variant_id,
  br.name as branch_name,
  w.name as warehouse_name,
  l.name as location_name,
  p.product_code,
  p.name as product_name,
  p.product_status,
  p.category_id,
  c.name as category_name,
  p.brand_id,
  b.name as brand_name,
  p.minimum_stock,
  p.reorder_level,
  p.preferred_vendor_id,
  pv.name as preferred_vendor_name,
  v.variant_name,
  v.sku,
  coalesce(v.barcode, pb.barcode) as barcode,
  v.retail_price,
  v.wholesale_price,
  u.decimal_places,
  x.quantity_in,
  x.quantity_out,
  x.quantity_on_hand,
  coalesce(r.reserved_quantity, 0)::numeric(18,4) as reserved_quantity,
  (x.quantity_on_hand - coalesce(r.reserved_quantity, 0))::numeric(18,4) as available_quantity,
  case 
    when public.user_has_permission('inventory.view_cost') 
      or public.user_has_permission('products.view_cost') 
      or public.user_has_permission('purchases.view_cost') then 
      case when x.quantity_on_hand = 0 then 0 else round(x.carrying_value / x.quantity_on_hand, 4) end 
  end as weighted_average_cost,
  case 
    when public.user_has_permission('inventory.view_cost') 
      or public.user_has_permission('products.view_cost') 
      or public.user_has_permission('purchases.view_cost') then 
      x.carrying_value 
  end as inventory_value,
  case 
    when public.user_has_permission('inventory.view_cost') 
      or public.user_has_permission('products.view_cost') 
      or public.user_has_permission('purchases.view_cost') then 
      lm.unit_cost 
  end as last_inbound_cost,
  ((x.quantity_on_hand - coalesce(r.reserved_quantity, 0)) <= p.reorder_level) as low_stock
from movement_totals x 
join public.products p on p.id = x.product_id 
join public.product_variants v on v.id = x.product_variant_id
join public.units u on u.id = p.base_unit_id 
join public.branches br on br.id = x.branch_id 
join public.warehouses w on w.id = x.warehouse_id 
join public.stock_locations l on l.id = x.stock_location_id 
left join public.categories c on c.id = p.category_id 
left join public.brands b on b.id = p.brand_id 
left join public.vendors pv on pv.id = p.preferred_vendor_id
left join lateral (
  select barcode from public.product_barcodes z 
  where z.product_variant_id = v.id 
  order by z.is_primary desc, z.created_at limit 1
) pb on true
left join lateral (
  select unit_cost from public.stock_movements z 
  where z.company_id = x.company_id 
    and z.stock_location_id = x.stock_location_id 
    and z.product_variant_id = x.product_variant_id 
    and z.quantity_in > 0 
  order by z.movement_date desc, z.created_at desc, z.id desc limit 1
) lm on true
left join reservations r on r.company_id = x.company_id 
  and r.stock_location_id = x.stock_location_id 
  and r.product_variant_id = x.product_variant_id
where x.company_id = public.current_user_company_id()
  and public.user_has_branch_access(x.branch_id)
  and (
    public.user_has_permission('inventory.view')
    or public.user_has_permission('products.view')
    or public.user_has_permission('purchases.view')
    or public.user_has_permission('purchases.create')
    or public.user_has_permission('sales.view')
    or public.user_has_permission('sales.create')
  );

-- 4. BRANCH STOCK SUMMARY VIEW
create view public.branch_stock_summary 
with (security_invoker = false, security_barrier = true) as
select 
  company_id, branch_id, product_id, product_variant_id, product_code, product_name, variant_name, sku,
  sum(quantity_on_hand)::numeric(18,4) as quantity_on_hand,
  sum(reserved_quantity)::numeric(18,4) as reserved_quantity,
  sum(available_quantity)::numeric(18,4) as available_quantity,
  case when bool_or(weighted_average_cost is not null) then round(sum(coalesce(inventory_value, 0)) / nullif(sum(quantity_on_hand), 0), 4) end as weighted_average_cost,
  case when bool_or(inventory_value is not null) then sum(inventory_value)::numeric(18,2) end as inventory_value
from public.current_stock 
group by 1, 2, 3, 4, 5, 6, 7, 8;

-- 5. COMPANY STOCK SUMMARY VIEW
create view public.company_stock_summary 
with (security_invoker = false, security_barrier = true) as
select 
  company_id, product_id, product_variant_id, product_code, product_name, variant_name, sku,
  sum(quantity_on_hand)::numeric(18,4) as quantity_on_hand,
  sum(reserved_quantity)::numeric(18,4) as reserved_quantity,
  sum(available_quantity)::numeric(18,4) as available_quantity,
  case when bool_or(weighted_average_cost is not null) then round(sum(coalesce(inventory_value, 0)) / nullif(sum(quantity_on_hand), 0), 4) end as weighted_average_cost,
  case when bool_or(inventory_value is not null) then sum(inventory_value)::numeric(18,2) end as inventory_value
from public.current_stock 
group by 1, 2, 3, 4, 5, 6, 7;

-- 6. LOW STOCK PRODUCTS VIEW
create view public.low_stock_products 
with (security_invoker = false, security_barrier = true) as
select *, greatest(reorder_level - available_quantity, 0)::numeric(18,4) as shortage_quantity
from public.current_stock 
where product_status = 'active' and available_quantity <= reorder_level;

-- 7. STOCK MOVEMENT HISTORY VIEW
create view public.stock_movement_history 
with (security_invoker = false, security_barrier = true) as
select 
  m.id, m.company_id, m.branch_id, m.warehouse_id, m.stock_location_id, m.product_id, m.product_variant_id,
  m.movement_date, m.movement_type, m.quantity_in, m.quantity_out,
  case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') or public.user_has_permission('purchases.view_cost') or public.user_has_permission('sales.view_cost') then m.unit_cost end as unit_cost,
  case when public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost') or public.user_has_permission('purchases.view_cost') or public.user_has_permission('sales.view_cost') then m.total_cost end as total_cost,
  m.reference_type, m.reference_id, m.reference_number, m.source_movement_id, m.reversal_movement_id,
  m.product_code, m.product_name, m.variant_name, m.sku, m.barcode,
  m.created_at, m.created_by,
  coalesce(
    d.document_type::text,
    case 
      when m.reference_type = 'purchase' then 'purchase' 
      when m.reference_type = 'purchase_return' then 'purchase_return' 
      when m.reference_type = 'sales_invoice' then 'sale' 
      when m.reference_type = 'sales_return' then 'sales_return' 
      else m.reference_type
    end
  ) as document_type,
  coalesce(d.status::text, 'posted') as document_status,
  br.name as branch_name,
  w.name as warehouse_name,
  l.name as location_name,
  pr.full_name as created_user,
  sum(m.quantity_in - m.quantity_out) over(
    partition by m.company_id, m.stock_location_id, m.product_variant_id 
    order by m.movement_date, m.created_at, m.id 
    rows unbounded preceding
  )::numeric(18,4) as running_quantity
from public.stock_movements m
left join public.inventory_documents d on d.id = m.reference_id and m.reference_type = 'inventory_document'
join public.branches br on br.id = m.branch_id 
join public.warehouses w on w.id = m.warehouse_id 
join public.stock_locations l on l.id = m.stock_location_id
left join public.profiles pr on pr.id = m.created_by
where m.company_id = public.current_user_company_id()
  and public.user_has_branch_access(m.branch_id)
  and (
    public.user_has_permission('inventory.view')
    or public.user_has_permission('products.view')
    or public.user_has_permission('purchases.view')
    or public.user_has_permission('sales.view')
  );

-- 8. UPDATE purchase_product_search TO INCLUDE REAL-TIME AVAILABLE STOCK
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

-- 9. UPDATE RLS POLICY ON stock_movements (Allow authenticated users with access to read)
drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements for select to authenticated using(
  company_id = public.current_user_company_id() 
  and public.user_has_branch_access(branch_id) 
  and (
    public.user_has_permission('inventory.view')
    or public.user_has_permission('products.view')
    or public.user_has_permission('purchases.view')
    or public.user_has_permission('purchases.create')
    or public.user_has_permission('sales.view')
    or public.user_has_permission('sales.create')
  )
);

-- 10. GRANTS
grant select on public.current_stock, public.branch_stock_summary, public.company_stock_summary, public.low_stock_products, public.stock_movement_history, public.purchase_product_search to authenticated;
revoke all on public.current_stock, public.branch_stock_summary, public.company_stock_summary, public.low_stock_products, public.stock_movement_history, public.purchase_product_search from anon;
grant execute on function public.inventory_stock_state(uuid, uuid, uuid) to authenticated;

-- 11. NOTIFY POSTGREST SCHEMA CACHE RELOAD
notify pgrst, 'reload schema';
