-- Migration 47: Phase 12 Customer Orders, Delivery Tracking, Wholesale Tier Pricing, Credit Controls & In-Transit Transfers

-- ============================================================================
-- 1. Customer Credit & Pricing Matrix Extensions
-- ============================================================================

alter table public.customers 
  add column if not exists pricing_tier text not null default 'retail' 
  check (pricing_tier in ('retail', 'wholesale', 'tier_1', 'tier_2', 'special'));

alter table public.customers 
  add column if not exists is_credit_blocked boolean not null default false;

-- Product Tier Pricing Table
create table if not exists public.product_tier_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  tier_name text not null check (tier_name in ('wholesale', 'tier_1', 'tier_2', 'special')),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, product_variant_id, tier_name)
);

create index if not exists product_tier_prices_variant_idx 
  on public.product_tier_prices(company_id, product_variant_id);

-- ============================================================================
-- 2. Customer Orders & Items
-- ============================================================================

create table if not exists public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  warehouse_id uuid not null,
  stock_location_id uuid not null,
  order_number text not null check (btrim(order_number) <> ''),
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_date date not null default (now() at time zone 'Asia/Colombo')::date,
  expected_delivery_date date,
  order_status text not null default 'pending' check (order_status in ('pending', 'confirmed', 'processing', 'dispatched', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid')),
  delivery_type text not null default 'store_pickup' check (delivery_type in ('store_pickup', 'courier', 'internal_delivery')),
  courier_name text,
  tracking_number text,
  delivery_address text,
  contact_phone text,
  pricing_tier text not null default 'retail',
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(18,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(18,2) not null default 0 check (tax_total >= 0),
  grand_total numeric(18,2) not null default 0 check (grand_total >= 0),
  advance_paid numeric(18,2) not null default 0 check (advance_paid >= 0),
  balance_amount numeric(18,2) not null default 0 check (balance_amount >= 0),
  assigned_rep_id uuid references public.profiles(id) on delete set null,
  sales_invoice_id uuid references public.sales_invoices(id) on delete set null,
  notes text,
  dispatched_at timestamptz,
  dispatched_by uuid references auth.users(id) on delete set null,
  delivered_at timestamptz,
  delivered_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, branch_id, order_number),
  constraint customer_orders_location_fk foreign key (company_id, stock_location_id) 
    references public.stock_locations(company_id, id) on delete restrict
);

create index if not exists customer_orders_status_idx 
  on public.customer_orders(company_id, branch_id, order_status);

create index if not exists customer_orders_customer_idx 
  on public.customer_orders(company_id, customer_id, order_date desc);

-- Customer Order Items
create table if not exists public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  ordered_quantity numeric(18,4) not null check (ordered_quantity > 0),
  allocated_quantity numeric(18,4) not null default 0 check (allocated_quantity >= 0),
  delivered_quantity numeric(18,4) not null default 0 check (delivered_quantity >= 0),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(18,2) not null check (line_total >= 0),
  remarks text,
  created_at timestamptz not null default now(),
  unique (order_id, product_variant_id)
);

create index if not exists customer_order_items_order_idx 
  on public.customer_order_items(order_id);

-- ============================================================================
-- 3. In-Transit Inter-Branch Stock Transfers
-- ============================================================================

create table if not exists public.branch_transfer_shipments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source_branch_id uuid not null references public.branches(id) on delete restrict,
  source_warehouse_id uuid not null,
  source_location_id uuid not null,
  destination_branch_id uuid not null references public.branches(id) on delete restrict,
  destination_warehouse_id uuid not null,
  destination_location_id uuid not null,
  transfer_number text not null check (btrim(transfer_number) <> ''),
  status text not null default 'in_transit' check (status in ('in_transit', 'received_fully', 'discrepancy_reported', 'cancelled')),
  dispatched_at timestamptz not null default now(),
  dispatched_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  carrier_name text,
  tracking_number text,
  notes text,
  inventory_document_id uuid references public.inventory_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, transfer_number),
  constraint branch_transfer_source_location_fk foreign key (company_id, source_location_id) 
    references public.stock_locations(company_id, id) on delete restrict,
  constraint branch_transfer_dest_location_fk foreign key (company_id, destination_location_id) 
    references public.stock_locations(company_id, id) on delete restrict
);

create index if not exists branch_transfer_shipments_dest_idx 
  on public.branch_transfer_shipments(company_id, destination_branch_id, status);

create index if not exists branch_transfer_shipments_source_idx 
  on public.branch_transfer_shipments(company_id, source_branch_id, status);

-- Branch Transfer Shipment Items
create table if not exists public.branch_transfer_shipment_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  shipment_id uuid not null references public.branch_transfer_shipments(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  dispatched_quantity numeric(18,4) not null check (dispatched_quantity > 0),
  received_quantity numeric(18,4) not null default 0 check (received_quantity >= 0),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  discrepancy_quantity numeric(18,4) not null default 0,
  discrepancy_reason text,
  created_at timestamptz not null default now(),
  unique (shipment_id, product_variant_id)
);

create index if not exists branch_transfer_shipment_items_shipment_idx 
  on public.branch_transfer_shipment_items(shipment_id);

-- ============================================================================
-- 4. Permissions Registration
-- ============================================================================

insert into public.permissions (permission_key, module, name, description)
values
  ('orders.view', 'sales', 'View Customer Orders', 'Allows viewing customer orders and delivery dispatch dashboard'),
  ('orders.create', 'sales', 'Create Customer Order', 'Allows creating new customer orders and reserving stock'),
  ('orders.dispatch', 'sales', 'Dispatch Customer Orders', 'Allows marking customer orders as dispatched and setting courier tracking'),
  ('orders.deliver', 'sales', 'Deliver & Invoice Orders', 'Allows confirming order delivery and auto-generating sales invoice'),
  ('orders.cancel', 'sales', 'Cancel Customer Orders', 'Allows cancelling customer orders and releasing reserved inventory'),
  ('orders.credit_override', 'sales', 'Customer Credit Limit Override', 'Allows placing orders when customer exceeds credit limit'),
  ('transfers.in_transit_view', 'inventory', 'View In-Transit Stock Transfers', 'Allows viewing incoming and outgoing branch transfer shipments'),
  ('transfers.receive', 'inventory', 'Receive Branch Transfer Stock', 'Allows destination branch to verify and receive in-transit stock')
on conflict (permission_key) do nothing;

-- ============================================================================
-- 5. Helper & Lookup RPCs
-- ============================================================================

-- Check customer credit standing
create or replace function public.get_customer_credit_status(p_customer_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cust record;
  v_outstanding numeric(18,2) := 0;
  v_overdue numeric(18,2) := 0;
  v_available_credit numeric(18,2) := 0;
  v_company_id uuid := public.current_user_company_id();
begin
  select * into v_cust from public.customers where id = p_customer_id and company_id = v_company_id;
  if not found then
    return jsonb_build_object('error', 'Customer not found');
  end if;

  select 
    coalesce(sum(debit_amount - credit_amount), 0),
    coalesce(sum(case when due_date < (now() at time zone 'Asia/Colombo')::date then debit_amount - credit_amount else 0 end), 0)
  into v_outstanding, v_overdue
  from public.customer_ledger_entries
  where company_id = v_company_id and customer_id = p_customer_id;

  if v_cust.credit_limit > 0 then
    v_available_credit := greatest(0, v_cust.credit_limit - v_outstanding);
  else
    v_available_credit := 0;
  end if;

  return jsonb_build_object(
    'customer_id', v_cust.id,
    'customer_code', v_cust.customer_code,
    'name', v_cust.name,
    'credit_limit', v_cust.credit_limit,
    'credit_days', v_cust.credit_days,
    'pricing_tier', v_cust.pricing_tier,
    'is_credit_blocked', v_cust.is_credit_blocked,
    'total_outstanding', v_outstanding,
    'overdue_amount', greatest(0, v_overdue),
    'available_credit', v_available_credit,
    'is_over_limit', (v_cust.credit_limit > 0 and v_outstanding > v_cust.credit_limit)
  );
end;
$$;

grant execute on function public.get_customer_credit_status(uuid) to authenticated;

-- Resolve customer dynamic tier price
create or replace function public.get_customer_tier_price(p_customer_id uuid, p_product_variant_id uuid)
returns numeric(18,4)
language plpgsql security definer set search_path = '' as $$
declare
  v_tier text := 'retail';
  v_tier_price numeric(18,4);
  v_variant record;
  v_company_id uuid := public.current_user_company_id();
begin
  select pricing_tier into v_tier from public.customers where id = p_customer_id and company_id = v_company_id;
  if v_tier is null then v_tier := 'retail'; end if;

  select * into v_variant from public.product_variants where id = p_product_variant_id and company_id = v_company_id;
  if not found then return 0; end if;

  -- 1. Check custom product_tier_prices table
  select unit_price into v_tier_price 
  from public.product_tier_prices 
  where company_id = v_company_id and product_variant_id = p_product_variant_id and tier_name = v_tier;

  if v_tier_price is not null and v_tier_price > 0 then
    return v_tier_price;
  end if;

  -- 2. Fall back to standard variant columns
  if v_tier = 'wholesale' then
    return coalesce(nullif(v_variant.wholesale_price, 0), v_variant.retail_price);
  elsif v_tier in ('tier_1', 'tier_2', 'special') then
    return coalesce(nullif(v_variant.special_price, 0), nullif(v_variant.wholesale_price, 0), v_variant.retail_price);
  else
    return v_variant.retail_price;
  end if;
end;
$$;

grant execute on function public.get_customer_tier_price(uuid, uuid) to authenticated;

-- ============================================================================
-- 6. Transactional RPC: Create Customer Order & Reserve Stock
-- ============================================================================

create or replace function public.create_customer_order(p_order jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_user_company_id();
  v_branch_id uuid := (p_order->>'branch_id')::uuid;
  v_warehouse_id uuid := (p_order->>'warehouse_id')::uuid;
  v_location_id uuid := (p_order->>'stock_location_id')::uuid;
  v_customer_id uuid := (p_order->>'customer_id')::uuid;
  v_order_date date := coalesce((p_order->>'order_date')::date, (now() at time zone 'Asia/Colombo')::date);
  v_expected_delivery date := (p_order->>'expected_delivery_date')::date;
  v_delivery_type text := coalesce(p_order->>'delivery_type', 'store_pickup');
  v_courier_name text := p_order->>'courier_name';
  v_tracking_number text := p_order->>'tracking_number';
  v_delivery_address text := p_order->>'delivery_address';
  v_contact_phone text := p_order->>'contact_phone';
  v_pricing_tier text := coalesce(p_order->>'pricing_tier', 'retail');
  v_subtotal numeric(18,2) := coalesce((p_order->>'subtotal')::numeric, 0);
  v_discount_total numeric(18,2) := coalesce((p_order->>'discount_total')::numeric, 0);
  v_tax_total numeric(18,2) := coalesce((p_order->>'tax_total')::numeric, 0);
  v_grand_total numeric(18,2) := coalesce((p_order->>'grand_total')::numeric, 0);
  v_advance_paid numeric(18,2) := coalesce((p_order->>'advance_paid')::numeric, 0);
  v_balance_amount numeric(18,2) := greatest(0, v_grand_total - v_advance_paid);
  v_notes text := p_order->>'notes';
  v_items jsonb := p_order->'items';
  
  v_order_id uuid;
  v_order_number text;
  v_seq_record record;
  v_cust record;
  v_credit_status jsonb;
  v_outstanding numeric(18,2);
  v_item record;
  v_variant record;
  v_stock_state record;
  v_qty numeric(18,4);
  v_price numeric(18,4);
  v_item_total numeric(18,2);
  v_has_override boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('orders.create') then
    raise exception 'Permission orders.create required' using errcode = '42501';
  end if;

  -- 1. Validate customer & Credit standing
  select * into v_cust from public.customers where id = v_customer_id and company_id = v_company_id;
  if not found then raise exception 'Customer not found'; end if;

  if v_cust.is_credit_blocked then
    raise exception 'Customer account is credit blocked by administration';
  end if;

  -- Calculate current balance
  select coalesce(sum(debit_amount - credit_amount), 0) into v_outstanding
  from public.customer_ledger_entries
  where company_id = v_company_id and customer_id = v_customer_id;

  v_has_override := public.user_has_permission('orders.credit_override');

  if v_cust.credit_limit > 0 and (v_outstanding + v_balance_amount) > v_cust.credit_limit then
    if not v_has_override then
      raise exception 'Order exceeds customer credit limit! Outstanding: Rs. %, New Balance: Rs. %, Credit Limit: Rs. %',
        v_outstanding, v_balance_amount, v_cust.credit_limit;
    end if;
  end if;

  -- 2. Generate Order Number
  begin
    v_order_number := public.generate_number_sequence(v_company_id, v_branch_id, 'quotation');
    v_order_number := 'ORD-' || replace(v_order_number, 'QUO-', '');
  exception when others then
    select 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_order_number
    from public.customer_orders
    where company_id = v_company_id and branch_id = v_branch_id;
  end;

  -- 3. Insert Order Header
  insert into public.customer_orders (
    company_id, branch_id, warehouse_id, stock_location_id,
    order_number, customer_id, order_date, expected_delivery_date,
    order_status, payment_status, delivery_type, courier_name, tracking_number,
    delivery_address, contact_phone, pricing_tier, subtotal, discount_total,
    tax_total, grand_total, advance_paid, balance_amount, notes,
    created_by, updated_by
  ) values (
    v_company_id, v_branch_id, v_warehouse_id, v_location_id,
    v_order_number, v_customer_id, v_order_date, v_expected_delivery,
    'confirmed', case when v_advance_paid >= v_grand_total and v_grand_total > 0 then 'paid' when v_advance_paid > 0 then 'partially_paid' else 'unpaid' end,
    v_delivery_type, v_courier_name, v_tracking_number,
    coalesce(v_delivery_address, v_cust.address), coalesce(v_contact_phone, v_cust.phone),
    v_pricing_tier, v_subtotal, v_discount_total, v_tax_total, v_grand_total,
    v_advance_paid, v_balance_amount, v_notes,
    auth.uid(), auth.uid()
  ) returning id into v_order_id;

  -- 4. Process line items & create stock reservations
  for v_item in select * from jsonb_to_recordset(v_items) as x(
    product_variant_id uuid,
    ordered_quantity numeric,
    unit_price numeric,
    discount_amount numeric,
    tax_amount numeric,
    line_total numeric,
    remarks text
  ) loop
    v_qty := v_item.ordered_quantity;
    v_price := v_item.unit_price;
    v_item_total := v_item.line_total;

    -- Validate variant
    select * into v_variant from public.product_variants 
    where id = v_item.product_variant_id and company_id = v_company_id and is_active;
    if not found then raise exception 'Variant % not active or not found', v_item.product_variant_id; end if;

    -- Check available stock
    select * into v_stock_state from public.inventory_stock_state(v_company_id, v_location_id, v_variant.id);
    if v_qty > v_stock_state.available and not v_has_override then
      raise exception 'Insufficient stock for % (%). Available: %, Requested: %',
        v_variant.variant_name, v_variant.sku, v_stock_state.available, v_qty;
    end if;

    -- Insert order item
    insert into public.customer_order_items (
      company_id, order_id, product_variant_id,
      ordered_quantity, allocated_quantity, delivered_quantity,
      unit_price, discount_amount, tax_amount, line_total, remarks
    ) values (
      v_company_id, v_order_id, v_variant.id,
      v_qty, v_qty, 0,
      v_price, coalesce(v_item.discount_amount, 0), coalesce(v_item.tax_amount, 0),
      v_item_total, v_item.remarks
    );

    -- Insert active reservation in stock_reservations
    insert into public.stock_reservations (
      company_id, branch_id, warehouse_id, stock_location_id,
      product_variant_id, source_type, source_id, quantity,
      status, expires_at, created_by
    ) values (
      v_company_id, v_branch_id, v_warehouse_id, v_location_id,
      v_variant.id, 'customer_order', v_order_id, v_qty,
      'active', now() + interval '14 days', auth.uid()
    );
  end loop;

  -- 5. Audit Log
  perform public.log_system_audit_event(
    v_branch_id, 'order_create', 'info',
    'customer_orders', v_order_id,
    null,
    jsonb_build_object(
      'order_number', v_order_number,
      'customer_id', v_customer_id,
      'grand_total', v_grand_total,
      'advance_paid', v_advance_paid,
      'delivery_type', v_delivery_type
    ),
    jsonb_build_object('customer_name', v_cust.name)
  );

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'order_status', 'confirmed',
    'grand_total', v_grand_total,
    'advance_paid', v_advance_paid,
    'balance_amount', v_balance_amount
  );
end;
$$;

grant execute on function public.create_customer_order(jsonb) to authenticated;

-- ============================================================================
-- 7. Transactional RPC: Dispatch Customer Order
-- ============================================================================

create or replace function public.dispatch_customer_order(
  p_order_id uuid,
  p_tracking_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order record;
  v_courier text := p_tracking_data->>'courier_name';
  v_tracking text := p_tracking_data->>'tracking_number';
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('orders.dispatch') then
    raise exception 'Permission orders.dispatch required' using errcode = '42501';
  end if;

  select * into v_order from public.customer_orders 
  where id = p_order_id and company_id = public.current_user_company_id() for update;
  if not found then raise exception 'Customer order not found'; end if;

  if v_order.order_status not in ('pending', 'confirmed', 'processing') then
    raise exception 'Cannot dispatch order in % status', v_order.order_status;
  end if;

  update public.customer_orders set
    order_status = 'dispatched',
    courier_name = coalesce(v_courier, courier_name),
    tracking_number = coalesce(v_tracking, tracking_number),
    dispatched_at = now(),
    dispatched_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_order_id;

  perform public.log_system_audit_event(
    v_order.branch_id, 'order_dispatch', 'info',
    'customer_orders', v_order.id,
    jsonb_build_object('order_status', v_order.order_status),
    jsonb_build_object('order_status', 'dispatched', 'courier_name', v_courier, 'tracking_number', v_tracking),
    jsonb_build_object('order_number', v_order.order_number)
  );

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'order_status', 'dispatched');
end;
$$;

grant execute on function public.dispatch_customer_order(uuid, jsonb) to authenticated;

-- ============================================================================
-- 8. Transactional RPC: Deliver Customer Order & Auto-Post Sales Invoice
-- ============================================================================

create or replace function public.deliver_customer_order(
  p_order_id uuid,
  p_payment_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_user_company_id();
  v_order record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item record;
  v_variant record;
  v_product record;
  v_stock_state record;
  v_avg_cost numeric(18,4);
  v_paid_amount numeric(18,2) := coalesce((p_payment_data->>'amount')::numeric, 0);
  v_payment_method text := coalesce(p_payment_data->>'payment_method', 'cash');
  v_payment_ref text := p_payment_data->>'payment_reference';
  v_pay_num text;
  v_total_paid numeric(18,2) := 0;
  v_inv_balance numeric(18,2);
  v_payment_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('orders.deliver') then
    raise exception 'Permission orders.deliver required' using errcode = '42501';
  end if;

  select * into v_order from public.customer_orders 
  where id = p_order_id and company_id = v_company_id for update;
  if not found then raise exception 'Customer order not found'; end if;

  if v_order.order_status in ('delivered', 'cancelled') then
    raise exception 'Cannot deliver order in % status', v_order.order_status;
  end if;

  -- 1. Generate Sales Invoice Number
  v_invoice_number := public.generate_number_sequence(v_company_id, v_order.branch_id, 'invoice');

  v_total_paid := v_order.advance_paid + v_paid_amount;
  v_inv_balance := greatest(0, v_order.grand_total - v_total_paid);

  if v_total_paid >= v_order.grand_total and v_order.grand_total > 0 then
    v_payment_status := 'paid';
  elsif v_total_paid > 0 then
    v_payment_status := 'partial';
  else
    v_payment_status := 'unpaid';
  end if;

  -- 2. Insert Posted Sales Invoice
  perform set_config('app.sales_workflow', 'on', true);

  insert into public.sales_invoices (
    company_id, branch_id, warehouse_id, stock_location_id,
    invoice_number, customer_id, invoice_date, due_date,
    invoice_type, status, subtotal, grand_total,
    paid_amount, balance_amount, payment_status,
    source_order_id, posted_at, posted_by, notes,
    created_by, updated_by
  ) values (
    v_company_id, v_order.branch_id, v_order.warehouse_id, v_order.stock_location_id,
    v_invoice_number, v_order.customer_id, (now() at time zone 'Asia/Colombo')::date,
    (now() at time zone 'Asia/Colombo')::date + interval '30 days',
    case when v_inv_balance = 0 then 'cash'::public.sales_invoice_type else 'credit'::public.sales_invoice_type end,
    'posted'::public.sales_document_status, v_order.subtotal, v_order.grand_total,
    v_total_paid, v_inv_balance, v_payment_status::public.sales_payment_status,
    v_order.id, now(), auth.uid(), 'Delivered Customer Order ' || v_order.order_number,
    auth.uid(), auth.uid()
  ) returning id into v_invoice_id;

  -- 3. Insert Invoice Items, Stock Movements & Release Reservations
  for v_item in select * from public.customer_order_items where order_id = v_order.id loop
    select * into v_variant from public.product_variants where id = v_item.product_variant_id;
    select * into v_product from public.products where id = v_variant.product_id;
    select * into v_stock_state from public.inventory_stock_state(v_company_id, v_order.stock_location_id, v_variant.id);
    v_avg_cost := coalesce(v_stock_state.average_cost, v_variant.average_cost, 0);

    -- Insert invoice item
    insert into public.sales_invoice_items (
      company_id, invoice_id, product_variant_id,
      quantity, unit_price, cost_price, discount_amount, line_total
    ) values (
      v_company_id, v_invoice_id, v_variant.id,
      v_item.ordered_quantity, v_item.unit_price, v_avg_cost, v_item.discount_amount, v_item.line_total
    );

    -- Insert sale_out stock movement
    insert into public.stock_movements (
      company_id, branch_id, warehouse_id, stock_location_id,
      product_id, product_variant_id, movement_date, movement_type,
      quantity_in, quantity_out, unit_cost, total_cost,
      reference_type, reference_id, reference_number,
      product_code, product_name, variant_name, sku, barcode, created_by
    ) values (
      v_company_id, v_order.branch_id, v_order.warehouse_id, v_order.stock_location_id,
      v_product.id, v_variant.id, (now() at time zone 'Asia/Colombo')::date, 'sale_out',
      0, v_item.ordered_quantity, v_avg_cost, round(v_item.ordered_quantity * v_avg_cost, 2),
      'sales_invoice', v_invoice_id, v_invoice_number,
      v_product.product_code, v_product.name, v_variant.variant_name, v_variant.sku, v_variant.barcode, auth.uid()
    );

    -- Update delivered quantity in order items
    update public.customer_order_items 
    set delivered_quantity = ordered_quantity 
    where id = v_item.id;
  end loop;

  -- 4. Mark stock reservations fulfilled
  update public.stock_reservations set
    status = 'fulfilled',
    released_at = now(),
    released_by = auth.uid()
  where company_id = v_company_id and source_type = 'customer_order' and source_id = v_order.id and status = 'active';

  -- 5. Post Customer Ledger Debit (for Grand Total)
  if v_order.grand_total > 0 then
    insert into public.customer_ledger_entries (
      company_id, branch_id, customer_id, entry_date, entry_type,
      reference_type, reference_id, reference_number,
      debit_amount, credit_amount, due_date, notes, created_by
    ) values (
      v_company_id, v_order.branch_id, v_order.customer_id, (now() at time zone 'Asia/Colombo')::date,
      'invoice'::public.customer_ledger_entry_type, 'sales_invoice', v_invoice_id, v_invoice_number,
      v_order.grand_total, 0, (now() at time zone 'Asia/Colombo')::date + interval '30 days',
      'Invoice for delivered order ' || v_order.order_number, auth.uid()
    );
  end if;

  -- 6. Post Payments to Customer Ledger (Advance + Delivery Payment)
  if v_total_paid > 0 then
    v_pay_num := public.generate_number_sequence(v_company_id, v_order.branch_id, 'payment');
    insert into public.customer_ledger_entries (
      company_id, branch_id, customer_id, entry_date, entry_type,
      reference_type, reference_id, reference_number,
      debit_amount, credit_amount, notes, created_by
    ) values (
      v_company_id, v_order.branch_id, v_order.customer_id, (now() at time zone 'Asia/Colombo')::date,
      'payment'::public.customer_ledger_entry_type, 'invoice_payment', v_invoice_id, v_pay_num,
      0, v_total_paid, 'Payment for delivered order ' || v_order.order_number || ' (' || v_payment_method || ')', auth.uid()
    );
  end if;

  -- 7. Update Customer Order Status
  update public.customer_orders set
    order_status = 'delivered',
    payment_status = v_payment_status,
    sales_invoice_id = v_invoice_id,
    advance_paid = v_total_paid,
    balance_amount = v_inv_balance,
    delivered_at = now(),
    delivered_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_order.id;

  -- 8. Audit Log
  perform public.log_system_audit_event(
    v_order.branch_id, 'order_delivered', 'info',
    'customer_orders', v_order.id,
    jsonb_build_object('order_status', v_order.order_status),
    jsonb_build_object(
      'order_status', 'delivered',
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_number,
      'paid_amount', v_total_paid,
      'balance_amount', v_inv_balance
    ),
    jsonb_build_object('order_number', v_order.order_number)
  );

  return jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_status', 'delivered',
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'paid_amount', v_total_paid,
    'balance_amount', v_inv_balance
  );
end;
$$;

grant execute on function public.deliver_customer_order(uuid, jsonb) to authenticated;

-- ============================================================================
-- 9. Transactional RPC: Cancel Customer Order & Release Reservations
-- ============================================================================

create or replace function public.cancel_customer_order(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('orders.cancel') then
    raise exception 'Permission orders.cancel required' using errcode = '42501';
  end if;

  select * into v_order from public.customer_orders 
  where id = p_order_id and company_id = public.current_user_company_id() for update;
  if not found then raise exception 'Customer order not found'; end if;

  if v_order.order_status = 'delivered' then
    raise exception 'Cannot cancel an order that is already delivered. Perform a sales return instead.';
  end if;

  -- Release stock reservations
  update public.stock_reservations set
    status = 'cancelled',
    released_at = now(),
    released_by = auth.uid()
  where company_id = public.current_user_company_id() 
    and source_type = 'customer_order' 
    and source_id = v_order.id 
    and status = 'active';

  -- Update order status
  update public.customer_orders set
    order_status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancellation_reason = p_reason,
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_order.id;

  perform public.log_system_audit_event(
    v_order.branch_id, 'order_cancelled', 'warning',
    'customer_orders', v_order.id,
    jsonb_build_object('order_status', v_order.order_status),
    jsonb_build_object('order_status', 'cancelled', 'reason', p_reason),
    jsonb_build_object('order_number', v_order.order_number)
  );

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'order_status', 'cancelled');
end;
$$;

grant execute on function public.cancel_customer_order(uuid, text) to authenticated;

-- ============================================================================
-- 10. In-Transit Inter-Branch Transfer Dispatch & Receipt Confirmation
-- ============================================================================

-- Create and dispatch inter-branch transfer shipment
create or replace function public.create_branch_transfer_shipment(p_shipment jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_user_company_id();
  v_src_branch uuid := (p_shipment->>'source_branch_id')::uuid;
  v_src_warehouse uuid := (p_shipment->>'source_warehouse_id')::uuid;
  v_src_location uuid := (p_shipment->>'source_location_id')::uuid;
  v_dest_branch uuid := (p_shipment->>'destination_branch_id')::uuid;
  v_dest_warehouse uuid := (p_shipment->>'destination_warehouse_id')::uuid;
  v_dest_location uuid := (p_shipment->>'destination_location_id')::uuid;
  v_carrier text := p_shipment->>'carrier_name';
  v_tracking text := p_shipment->>'tracking_number';
  v_notes text := p_shipment->>'notes';
  v_items jsonb := p_shipment->'items';
  
  v_shipment_id uuid;
  v_transfer_number text;
  v_item record;
  v_variant record;
  v_product record;
  v_stock_state record;
  v_cost numeric(18,4);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('inventory.create_transfer') then
    raise exception 'Permission inventory.create_transfer required' using errcode = '42501';
  end if;

  if v_src_branch = v_dest_branch then
    raise exception 'Source and destination branches must be different for inter-branch transit';
  end if;

  -- Transfer sequence number
  begin
    v_transfer_number := public.generate_number_sequence(v_company_id, v_src_branch, 'stock_transfer');
  exception when others then
    select 'TRN-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_transfer_number
    from public.branch_transfer_shipments
    where company_id = v_company_id;
  end;

  -- Insert shipment header
  insert into public.branch_transfer_shipments (
    company_id, source_branch_id, source_warehouse_id, source_location_id,
    destination_branch_id, destination_warehouse_id, destination_location_id,
    transfer_number, status, dispatched_at, dispatched_by,
    carrier_name, tracking_number, notes, created_by, updated_by
  ) values (
    v_company_id, v_src_branch, v_src_warehouse, v_src_location,
    v_dest_branch, v_dest_warehouse, v_dest_location,
    v_transfer_number, 'in_transit', now(), auth.uid(),
    v_carrier, v_tracking, v_notes, auth.uid(), auth.uid()
  ) returning id into v_shipment_id;

  -- Process line items & deduct from source location
  for v_item in select * from jsonb_to_recordset(v_items) as x(
    product_variant_id uuid,
    quantity numeric
  ) loop
    select * into v_variant from public.product_variants where id = v_item.product_variant_id and company_id = v_company_id;
    if not found then raise exception 'Variant not found'; end if;
    select * into v_product from public.products where id = v_variant.product_id;

    select * into v_stock_state from public.inventory_stock_state(v_company_id, v_src_location, v_variant.id);
    if v_item.quantity > v_stock_state.available then
      raise exception 'Insufficient stock for % in source location. Available: %, Requested: %',
        v_variant.variant_name, v_stock_state.available, v_item.quantity;
    end if;

    v_cost := coalesce(v_stock_state.average_cost, v_variant.average_cost, 0);

    -- Insert shipment item
    insert into public.branch_transfer_shipment_items (
      company_id, shipment_id, product_variant_id,
      dispatched_quantity, received_quantity, unit_cost
    ) values (
      v_company_id, v_shipment_id, v_variant.id,
      v_item.quantity, 0, v_cost
    );

    -- Post transfer_out from source location (places into in-transit state)
    insert into public.stock_movements (
      company_id, branch_id, warehouse_id, stock_location_id,
      product_id, product_variant_id, movement_date, movement_type,
      quantity_in, quantity_out, unit_cost, total_cost,
      reference_type, reference_id, reference_number,
      product_code, product_name, variant_name, sku, barcode, created_by
    ) values (
      v_company_id, v_src_branch, v_src_warehouse, v_src_location,
      v_product.id, v_variant.id, (now() at time zone 'Asia/Colombo')::date, 'transfer_out',
      0, v_item.quantity, v_cost, round(v_item.quantity * v_cost, 2),
      'branch_transfer_shipment', v_shipment_id, v_transfer_number,
      v_product.product_code, v_product.name, v_variant.variant_name, v_variant.sku, v_variant.barcode, auth.uid()
    );
  end loop;

  -- Audit Log
  perform public.log_system_audit_event(
    v_src_branch, 'branch_transfer_dispatch', 'info',
    'branch_transfer_shipments', v_shipment_id,
    null,
    jsonb_build_object(
      'transfer_number', v_transfer_number,
      'destination_branch_id', v_dest_branch,
      'carrier_name', v_carrier,
      'tracking_number', v_tracking
    ),
    jsonb_build_object('source_branch_id', v_src_branch)
  );

  return jsonb_build_object(
    'success', true,
    'shipment_id', v_shipment_id,
    'transfer_number', v_transfer_number,
    'status', 'in_transit'
  );
end;
$$;

grant execute on function public.create_branch_transfer_shipment(jsonb) to authenticated;

-- Confirm receipt at destination warehouse with discrepancy checking
create or replace function public.confirm_branch_transfer_receipt(
  p_shipment_id uuid,
  p_received_items jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_user_company_id();
  v_shipment record;
  v_item record;
  v_rec_item record;
  v_variant record;
  v_product record;
  v_has_discrepancy boolean := false;
  v_diff numeric(18,4);
  v_received_qty numeric(18,4);
  v_discrepancy_reason text;
  v_final_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('transfers.receive') then
    raise exception 'Permission transfers.receive required' using errcode = '42501';
  end if;

  select * into v_shipment from public.branch_transfer_shipments 
  where id = p_shipment_id and company_id = v_company_id for update;
  if not found then raise exception 'Transfer shipment not found'; end if;

  if v_shipment.status <> 'in_transit' then
    raise exception 'Shipment is not in transit (current status: %)', v_shipment.status;
  end if;

  -- Process received lines
  for v_rec_item in select * from jsonb_to_recordset(p_received_items) as x(
    product_variant_id uuid,
    received_quantity numeric,
    discrepancy_reason text
  ) loop
    select * into v_item from public.branch_transfer_shipment_items
    where shipment_id = v_shipment.id and product_variant_id = v_rec_item.product_variant_id for update;
    if not found then raise exception 'Item % not in transfer shipment', v_rec_item.product_variant_id; end if;

    select * into v_variant from public.product_variants where id = v_rec_item.product_variant_id;
    select * into v_product from public.products where id = v_variant.product_id;

    v_received_qty := coalesce(v_rec_item.received_quantity, 0);
    v_diff := v_item.dispatched_quantity - v_received_qty;
    v_discrepancy_reason := v_rec_item.discrepancy_reason;

    if v_diff <> 0 then
      v_has_discrepancy := true;
    end if;

    -- Update shipment line
    update public.branch_transfer_shipment_items set
      received_quantity = v_received_qty,
      discrepancy_quantity = v_diff,
      discrepancy_reason = v_discrepancy_reason
    where id = v_item.id;

    -- Post transfer_in into destination location for actual received quantity
    if v_received_qty > 0 then
      insert into public.stock_movements (
        company_id, branch_id, warehouse_id, stock_location_id,
        product_id, product_variant_id, movement_date, movement_type,
        quantity_in, quantity_out, unit_cost, total_cost,
        reference_type, reference_id, reference_number,
        product_code, product_name, variant_name, sku, barcode, created_by
      ) values (
        v_company_id, v_shipment.destination_branch_id, v_shipment.destination_warehouse_id, v_shipment.destination_location_id,
        v_product.id, v_variant.id, (now() at time zone 'Asia/Colombo')::date, 'transfer_in',
        v_received_qty, 0, v_item.unit_cost, round(v_received_qty * v_item.unit_cost, 2),
        'branch_transfer_shipment', v_shipment.id, v_shipment.transfer_number,
        v_product.product_code, v_product.name, v_variant.variant_name, v_variant.sku, v_variant.barcode, auth.uid()
      );
    end if;
  end loop;

  v_final_status := case when v_has_discrepancy then 'discrepancy_reported' else 'received_fully' end;

  update public.branch_transfer_shipments set
    status = v_final_status,
    received_at = now(),
    received_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_shipment.id;

  -- Audit Log
  perform public.log_system_audit_event(
    v_shipment.destination_branch_id,
    case when v_has_discrepancy then 'branch_transfer_discrepancy' else 'branch_transfer_received' end,
    case when v_has_discrepancy then 'warning' else 'info' end,
    'branch_transfer_shipments', v_shipment.id,
    jsonb_build_object('status', 'in_transit'),
    jsonb_build_object('status', v_final_status, 'has_discrepancy', v_has_discrepancy),
    jsonb_build_object('transfer_number', v_shipment.transfer_number)
  );

  return jsonb_build_object(
    'success', true,
    'shipment_id', v_shipment.id,
    'status', v_final_status,
    'has_discrepancy', v_has_discrepancy
  );
end;
$$;

grant execute on function public.confirm_branch_transfer_receipt(uuid, jsonb) to authenticated;

-- ============================================================================
-- 11. Row Level Security Policies
-- ============================================================================

alter table public.product_tier_prices enable row level security;
alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;
alter table public.branch_transfer_shipments enable row level security;
alter table public.branch_transfer_shipment_items enable row level security;

-- Tier prices read policy
create policy product_tier_prices_read on public.product_tier_prices
  for select to authenticated
  using (company_id = public.current_user_company_id());

create policy product_tier_prices_write on public.product_tier_prices
  for all to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('products.manage'))
  with check (company_id = public.current_user_company_id() and public.user_has_permission('products.manage'));

-- Customer orders read/write policy
create policy customer_orders_read on public.customer_orders
  for select to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id));

create policy customer_orders_write on public.customer_orders
  for all to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id))
  with check (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id));

-- Customer order items policy
create policy customer_order_items_read on public.customer_order_items
  for select to authenticated
  using (company_id = public.current_user_company_id());

create policy customer_order_items_write on public.customer_order_items
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

-- Branch transfer shipments policy
create policy branch_transfer_shipments_read on public.branch_transfer_shipments
  for select to authenticated
  using (company_id = public.current_user_company_id() and (public.user_has_branch_access(source_branch_id) or public.user_has_branch_access(destination_branch_id)));

create policy branch_transfer_shipments_write on public.branch_transfer_shipments
  for all to authenticated
  using (company_id = public.current_user_company_id() and (public.user_has_branch_access(source_branch_id) or public.user_has_branch_access(destination_branch_id)))
  with check (company_id = public.current_user_company_id());

-- Branch transfer items policy
create policy branch_transfer_items_read on public.branch_transfer_shipment_items
  for select to authenticated
  using (company_id = public.current_user_company_id());

create policy branch_transfer_items_write on public.branch_transfer_shipment_items
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
