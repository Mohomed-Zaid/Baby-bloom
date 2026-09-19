import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type {
  CustomerOrder,
  CustomerCreditStatus,
  CustomerOrderFilterState,
} from '../types/orders'

type RpcResult<T = unknown> = { data: T; error: { message: string } | null }
const callRpc = <T = unknown>(name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

export async function fetchCustomerOrders(
  filters?: Partial<CustomerOrderFilterState>,
  limit = 100
): Promise<CustomerOrder[]> {
  const companyId = await currentCompanyId()
  let query = getTable('customer_orders')
    .select(`
      *,
      customer:customer_id (id, name, customer_code, phone, email, address, credit_limit, is_credit_blocked),
      branch:branch_id (id, name, code),
      assigned_rep:assigned_rep_id (id, full_name),
      items:customer_order_items (
        id, product_variant_id, ordered_quantity, allocated_quantity, delivered_quantity,
        unit_price, discount_amount, tax_amount, line_total, remarks,
        variant:product_variant_id (
          id, variant_name, sku, barcode, retail_price, wholesale_price, special_price,
          product:product_id (id, name, product_code)
        )
      )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters?.branch_id && filters.branch_id !== 'all') {
    query = query.eq('branch_id', filters.branch_id)
  }

  if (filters?.order_status && filters.order_status !== 'all') {
    query = query.eq('order_status', filters.order_status)
  }

  if (filters?.delivery_type && filters.delivery_type !== 'all') {
    query = query.eq('delivery_type', filters.delivery_type)
  }

  if (filters?.date_from) {
    query = query.gte('order_date', filters.date_from)
  }

  if (filters?.date_to) {
    query = query.lte('order_date', filters.date_to)
  }

  const { data, error } = await query
  throwOnError(error)

  if (!data) return []

  let results = data as unknown as CustomerOrder[]

  if (filters?.search && filters.search.trim() !== '') {
    const s = filters.search.toLowerCase().trim()
    results = results.filter((o) =>
      o.order_number.toLowerCase().includes(s) ||
      o.customer?.name?.toLowerCase().includes(s) ||
      o.customer?.phone?.toLowerCase().includes(s) ||
      o.tracking_number?.toLowerCase().includes(s) ||
      o.courier_name?.toLowerCase().includes(s)
    )
  }

  return results
}

export async function fetchCustomerOrderById(orderId: string): Promise<CustomerOrder | null> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('customer_orders')
    .select(`
      *,
      customer:customer_id (id, name, customer_code, phone, email, address, credit_limit, is_credit_blocked),
      branch:branch_id (id, name, code),
      assigned_rep:assigned_rep_id (id, full_name),
      items:customer_order_items (
        id, product_variant_id, ordered_quantity, allocated_quantity, delivered_quantity,
        unit_price, discount_amount, tax_amount, line_total, remarks,
        variant:product_variant_id (
          id, variant_name, sku, barcode, retail_price, wholesale_price, special_price,
          product:product_id (id, name, product_code)
        )
      )
    `)
    .eq('company_id', companyId)
    .eq('id', orderId)
    .single()

  throwOnError(error)
  return (data as unknown as CustomerOrder) ?? null
}

export async function fetchCustomerCreditStatus(customerId: string): Promise<CustomerCreditStatus> {
  const res = await callRpc<CustomerCreditStatus>('get_customer_credit_status', {
    p_customer_id: customerId,
  })
  throwOnError(res.error)
  return res.data
}

export async function fetchCustomerTierPrice(customerId: string, variantId: string): Promise<number> {
  const res = await callRpc<number>('get_customer_tier_price', {
    p_customer_id: customerId,
    p_product_variant_id: variantId,
  })
  throwOnError(res.error)
  return Number(res.data) || 0
}

export async function createCustomerOrder(orderPayload: Record<string, unknown>): Promise<{
  success: boolean
  order_id: string
  order_number: string
  order_status: string
  grand_total: number
  advance_paid: number
  balance_amount: number
}> {
  const res = await callRpc<{
    success: boolean
    order_id: string
    order_number: string
    order_status: string
    grand_total: number
    advance_paid: number
    balance_amount: number
  }>('create_customer_order', {
    p_order: orderPayload,
  })
  throwOnError(res.error)
  return res.data
}

export async function dispatchCustomerOrder(
  orderId: string,
  trackingData: { courier_name?: string; tracking_number?: string }
): Promise<{ success: boolean; order_id: string; order_status: string }> {
  const res = await callRpc<{ success: boolean; order_id: string; order_status: string }>(
    'dispatch_customer_order',
    {
      p_order_id: orderId,
      p_tracking_data: trackingData,
    }
  )
  throwOnError(res.error)
  return res.data
}

export async function deliverCustomerOrder(
  orderId: string,
  paymentData: { amount: number; payment_method: string; payment_reference?: string }
): Promise<{
  success: boolean
  order_id: string
  order_status: string
  invoice_id: string
  invoice_number: string
  paid_amount: number
  balance_amount: number
}> {
  const res = await callRpc<{
    success: boolean
    order_id: string
    order_status: string
    invoice_id: string
    invoice_number: string
    paid_amount: number
    balance_amount: number
  }>('deliver_customer_order', {
    p_order_id: orderId,
    p_payment_data: paymentData,
  })
  throwOnError(res.error)
  return res.data
}

export async function cancelCustomerOrder(
  orderId: string,
  reason: string
): Promise<{ success: boolean; order_id: string; order_status: string }> {
  const res = await callRpc<{ success: boolean; order_id: string; order_status: string }>(
    'cancel_customer_order',
    {
      p_order_id: orderId,
      p_reason: reason,
    }
  )
  throwOnError(res.error)
  return res.data
}

// ── Lookups ─────────────────────────────────────────────────────────────
export async function fetchCustomersLookup() {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('customers')
    .select('id, name, customer_code, phone, address, credit_limit, pricing_tier, is_credit_blocked')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name')

  throwOnError(error)
  return (data || []) as unknown as Array<{
    id: string
    name: string
    customer_code: string
    phone?: string
    address?: string
    credit_limit: number
    pricing_tier: string
    is_credit_blocked: boolean
  }>
}

export async function fetchBranchesLookup() {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('branches')
    .select('id, name, code')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name')

  throwOnError(error)
  return (data || []) as unknown as Array<{ id: string; name: string; code: string }>
}

export async function fetchWarehousesAndLocations(branchId: string) {
  const companyId = await currentCompanyId()
  const { data: whData, error: whErr } = await getTable('warehouses')
    .select('id, name, code')
    .eq('company_id', companyId)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name')
  throwOnError(whErr)

  const { data: locData, error: locErr } = await getTable('stock_locations')
    .select('id, warehouse_id, name, code')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name')
  throwOnError(locErr)

  return {
    warehouses: (whData || []) as unknown as Array<{ id: string; name: string; code: string }>,
    locations: (locData || []) as unknown as Array<{ id: string; warehouse_id: string; name: string; code: string }>,
  }
}

export async function fetchVariantsLookup(stockLocationId?: string) {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('product_variants')
    .select(`
      id, variant_name, sku, barcode, retail_price, wholesale_price, special_price,
      product:product_id (id, name, product_code)
    `)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('sku')

  throwOnError(error)
  const variants = (data || []) as unknown as Array<{
    id: string
    variant_name: string
    sku: string
    barcode?: string
    retail_price: number
    wholesale_price: number
    special_price: number
    product?: { id: string; name: string; product_code: string }
  }>

  if (stockLocationId) {
    // Optionally enrich with current stock level if available
    const { data: balances } = await getTable('inventory_stock_balance')
      .select('product_variant_id, available_quantity, reserved_quantity')
      .eq('stock_location_id', stockLocationId)
      .limit(500)

    interface StockBal { product_variant_id: string; available_quantity: number; reserved_quantity: number }
    const balMap = new Map((balances || []).map((b) => {
      const item = b as unknown as StockBal
      return [item.product_variant_id, item]
    }))
    return variants.map((v) => {
      const bal = balMap.get(v.id)
      return {
        ...v,
        available_quantity: bal?.available_quantity ?? 100, // fallback sample
        reserved_quantity: bal?.reserved_quantity ?? 0,
      }
    })
  }

  return variants
}
