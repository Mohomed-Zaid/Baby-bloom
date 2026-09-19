import { requireSupabase, throwOnError } from './client'
import type {
  CustomerBalance, CustomerStatement, InvoicePaymentRow,
  PosProduct, SalesActionResult, SalesFilters, SalesInvoiceItemRow,
  SalesInvoiceRow, SalesReturnEligibility, SalesReturnRow,
  SalesReturnItemDetail, CustomerRefundRow,
  CreateSalesDraftHeader, CreateSalesDraftItem, CreateSalesDraftPayment
} from '../types/sales'

type Page<T> = { rows: T[]; count: number }
type RpcResult = { data: unknown; error: { message: string } | null }
const db = () => requireSupabase() as any
const rpc = (name: string, args: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<RpcResult>)(name, args)
const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// ─── Product lookup ───────────────────────────────────────────────────────────

export async function listPosProducts(search = '', locationId?: string): Promise<PosProduct[]> {
  const trimmed = search.trim()
  let q = requireSupabase().from('pos_product_search').select('*').order('product_name').limit(200)

  if (trimmed) {
    const s = safe(trimmed)
    // Check if any variant matches in product_barcodes table
    const { data: pbMatches } = await db()
      .from('product_barcodes')
      .select('product_variant_id')
      .ilike('barcode', `%${s}%`)
      .limit(30)

    const extraVariantIds = ((pbMatches ?? []) as unknown as Array<{ product_variant_id: string }>).map(m => m.product_variant_id)

    let orClause = `product_code.ilike.%${s}%,product_name.ilike.%${s}%,variant_name.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`
    if (extraVariantIds.length > 0) {
      orClause += `,product_variant_id.in.(${extraVariantIds.join(',')})`
    }
    q = q.or(orClause)
  }

  const { data, error } = await q
  throwOnError(error)
  const products = (data ?? []) as unknown as PosProduct[]

  if (locationId && products.length > 0) {
    const variantIds = products.map(p => p.product_variant_id)
    const { data: stockData } = await requireSupabase()
      .from('current_stock')
      .select('product_variant_id, available_quantity')
      .eq('stock_location_id', locationId)
      .in('product_variant_id', variantIds)

    const map = new Map(((stockData ?? []) as unknown as Array<{ product_variant_id: string; available_quantity: number }>).map(s => [s.product_variant_id, Number(s.available_quantity ?? 0)]))
    return products.map(p => ({
      ...p,
      company_available_quantity: p.available_quantity,
      available_quantity: map.get(p.product_variant_id) ?? 0,
    }))
  }

  return products.map(p => ({ ...p, company_available_quantity: p.available_quantity }))
}

export async function findPosByBarcode(barcode: string, locationId?: string): Promise<PosProduct | null> {
  const cleanCode = barcode.trim()
  if (!cleanCode) return null

  // 1. Direct exact match on variant barcode in pos_product_search
  const { data: initialData, error: initialErr } = await requireSupabase()
    .from('pos_product_search')
    .select('*')
    .eq('barcode', cleanCode)
    .limit(1)
    .maybeSingle()
  throwOnError(initialErr)
  let data = initialData

  // 2. Check secondary/pack barcodes in product_barcodes table
  if (!data) {
    const { data: pbData, error: pbErr } = await db()
      .from('product_barcodes')
      .select('product_variant_id')
      .eq('barcode', cleanCode)
      .limit(1)
      .maybeSingle()
    throwOnError(pbErr)

    const matchedVariantId = (pbData as { product_variant_id?: string } | null)?.product_variant_id
    if (matchedVariantId) {
      const { data: vData, error: vErr } = await requireSupabase()
        .from('pos_product_search')
        .select('*')
        .eq('product_variant_id', matchedVariantId)
        .limit(1)
        .maybeSingle()
      throwOnError(vErr)
      data = vData
    }
  }

  // 3. Check exact match on SKU or Product Code
  if (!data) {
    const { data: skuData, error: skuErr } = await requireSupabase()
      .from('pos_product_search')
      .select('*')
      .or(`sku.eq.${safe(cleanCode)},product_code.eq.${safe(cleanCode)}`)
      .limit(1)
      .maybeSingle()
    throwOnError(skuErr)
    data = skuData
  }

  // 4. Check case-insensitive match on barcode, SKU, or Product Code
  if (!data) {
    const { data: ciData, error: ciErr } = await requireSupabase()
      .from('pos_product_search')
      .select('*')
      .or(`barcode.ilike.${safe(cleanCode)},sku.ilike.${safe(cleanCode)},product_code.ilike.${safe(cleanCode)}`)
      .limit(1)
      .maybeSingle()
    throwOnError(ciErr)
    data = ciData
  }

  // 5. Fallback: Check if search query matches exactly 1 product by name or variant
  if (!data) {
    const matches = await listPosProducts(cleanCode, locationId)
    if (matches.length === 1) {
      return matches[0]!
    }
  }

  if (!data) return null
  const p = { ...(data as unknown as PosProduct) }
  p.company_available_quantity = p.available_quantity

  if (locationId) {
    const { data: stockData } = await requireSupabase()
      .from('current_stock')
      .select('available_quantity')
      .eq('stock_location_id', locationId)
      .eq('product_variant_id', p.product_variant_id)
      .maybeSingle()
    p.available_quantity = Number((stockData as unknown as { available_quantity: number } | null)?.available_quantity ?? 0)
  }
  return p
}

// ─── Draft / hold / recall ───────────────────────────────────────────────────

export async function createSalesDraft(
  header: CreateSalesDraftHeader,
  items: CreateSalesDraftItem[],
  payments: CreateSalesDraftPayment[] = []
): Promise<SalesActionResult> {
  const { data, error } = await rpc('create_sales_draft', { p_header: header, p_items: items, p_payments: payments })
  throwOnError(error)
  return data as SalesActionResult
}

export async function holdInvoice(id: string): Promise<SalesActionResult> {
  const { data, error } = await rpc('hold_sales_invoice', { p_invoice_id: id })
  throwOnError(error)
  return data as SalesActionResult
}

export async function recallInvoice(id: string): Promise<SalesActionResult> {
  const { data, error } = await rpc('recall_sales_invoice', { p_invoice_id: id })
  throwOnError(error)
  return data as SalesActionResult
}

// ─── Invoice history ─────────────────────────────────────────────────────────

export async function listInvoices(filters: SalesFilters = {}): Promise<Page<SalesInvoiceRow>> {
  const page = filters.page ?? 1, size = filters.pageSize ?? 20
  let q = requireSupabase().from('sales_invoice_history').select('*', { count: 'exact' })
    .order('invoice_date', { ascending: false }).order('created_at', { ascending: false })
    .range((page - 1) * size, page * size - 1)
  if (filters.search) q = q.or(`invoice_number.ilike.%${safe(filters.search)}%,customer_name.ilike.%${safe(filters.search)}%,customer_code.ilike.%${safe(filters.search)}%`)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.paymentStatus) q = q.eq('payment_status', filters.paymentStatus)
  if (filters.customerId) q = q.eq('customer_id', filters.customerId)
  if (filters.branchId) q = q.eq('branch_id', filters.branchId)
  if (filters.invoiceType) q = q.eq('invoice_type', filters.invoiceType)
  if (filters.dateFrom) q = q.gte('invoice_date', filters.dateFrom)
  if (filters.dateTo) q = q.lte('invoice_date', filters.dateTo)
  const { data, error, count } = await q
  throwOnError(error)
  return { rows: (data ?? []) as unknown as SalesInvoiceRow[], count: count ?? 0 }
}

export async function listHeldInvoices(branchId?: string): Promise<SalesInvoiceRow[]> {
  let q = requireSupabase().from('sales_invoice_history').select('*').eq('status', 'held').order('held_at', { ascending: false })
  if (branchId) q = q.eq('branch_id', branchId)
  const { data, error } = await q
  throwOnError(error)
  return (data ?? []) as unknown as SalesInvoiceRow[]
}

export async function getInvoice(id: string) {
  const client = requireSupabase()
  const [header, items, payments] = await Promise.all([
    client.from('sales_invoice_history').select('*').eq('id', id).single(),
    client.from('sales_invoice_item_details').select('*').eq('invoice_id', id).order('created_at'),
    client.from('invoice_payment_history').select('*').eq('invoice_id', id).order('payment_date'),
  ])
  throwOnError(header.error); throwOnError(items.error); throwOnError(payments.error)
  return {
    header: header.data as unknown as SalesInvoiceRow,
    items: (items.data ?? []) as unknown as SalesInvoiceItemRow[],
    payments: (payments.data ?? []) as unknown as InvoicePaymentRow[],
  }
}

// ─── Invoice actions ──────────────────────────────────────────────────────────

export async function invoiceAction(
  action: 'post' | 'cancel' | 'reverse',
  id: string,
  reason = ''
): Promise<SalesActionResult> {
  const names = { post: 'post_sales_invoice', cancel: 'cancel_sales_invoice', reverse: 'reverse_sales_invoice' }
  const args = action === 'cancel' ? { p_invoice_id: id, p_reason: reason }
    : action === 'reverse' ? { p_invoice_id: id, p_reason: reason }
    : { p_invoice_id: id }
  const { data, error } = await rpc(names[action], args)
  throwOnError(error)
  return data as SalesActionResult
}

// ─── Sales returns ────────────────────────────────────────────────────────────

export interface SalesReturnFilters {
  page?: number
  pageSize?: number
  search?: string
  settlementType?: string
  status?: string
  branchId?: string
  dateFrom?: string
  dateTo?: string
}

export async function listSalesReturns(filters: SalesReturnFilters = {}): Promise<Page<SalesReturnRow>> {
  const page = filters.page ?? 1, size = filters.pageSize ?? 20
  let q = requireSupabase().from('sales_return_history').select('*', { count: 'exact' })
    .order('return_date', { ascending: false }).range((page - 1) * size, page * size - 1)

  if (filters.search) {
    const term = safe(filters.search)
    q = q.or(`return_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_code.ilike.%${term}%,invoice_number.ilike.%${term}%`)
  }
  if (filters.settlementType && filters.settlementType !== 'all') {
    q = q.eq('settlement_type', filters.settlementType)
  }
  if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status)
  }
  if (filters.branchId) {
    q = q.eq('branch_id', filters.branchId)
  }
  if (filters.dateFrom) {
    q = q.gte('return_date', filters.dateFrom)
  }
  if (filters.dateTo) {
    q = q.lte('return_date', filters.dateTo)
  }

  const { data, error, count } = await q
  throwOnError(error)
  return { rows: (data ?? []) as unknown as SalesReturnRow[], count: count ?? 0 }
}

export async function getSalesReturn(id: string): Promise<{
  header: SalesReturnRow
  items: SalesReturnItemDetail[]
  refunds: CustomerRefundRow[]
}> {
  const client = requireSupabase()
  const [headerRes, itemsRes, refundsRes] = await Promise.all([
    client.from('sales_return_history').select('*').eq('id', id).single(),
    client.from('sales_return_item_details').select('*').eq('sales_return_id', id).order('created_at'),
    client.from('customer_refund_history').select('*').eq('sales_return_id', id).order('created_at'),
  ])
  throwOnError(headerRes.error)
  throwOnError(itemsRes.error)

  return {
    header: headerRes.data as unknown as SalesReturnRow,
    items: (itemsRes.data ?? []) as unknown as SalesReturnItemDetail[],
    refunds: (refundsRes.data ?? []) as unknown as CustomerRefundRow[],
  }
}

export async function listCustomerRefunds(returnId?: string, customerId?: string): Promise<CustomerRefundRow[]> {
  let q = requireSupabase().from('customer_refund_history').select('*').order('refund_date', { ascending: false })
  if (returnId) q = q.eq('sales_return_id', returnId)
  if (customerId) q = q.eq('customer_id', customerId)
  const { data, error } = await q
  throwOnError(error)
  return (data ?? []) as unknown as CustomerRefundRow[]
}

export async function returnEligibility(invoiceId: string): Promise<SalesReturnEligibility[]> {
  const { data, error } = await requireSupabase().from('sales_return_eligibility').select('*')
    .eq('invoice_id', invoiceId).gt('eligible_quantity', 0).order('product_name')
  throwOnError(error)
  return (data ?? []) as unknown as SalesReturnEligibility[]
}

export async function createSalesReturnDraft(header: Record<string, unknown>, items: Record<string, unknown>[]): Promise<SalesActionResult> {
  const { data, error } = await rpc('create_sales_return_draft', { p_header: header, p_items: items })
  throwOnError(error)
  return data as SalesActionResult
}

export async function salesReturnAction(action: 'post' | 'reverse', id: string, reason = ''): Promise<SalesActionResult> {
  const { data, error } = await rpc(action === 'post' ? 'post_sales_return' : 'reverse_sales_return',
    action === 'reverse' ? { p_return_id: id, p_reason: reason } : { p_return_id: id })
  throwOnError(error)
  return data as SalesActionResult
}

// ─── Customer payments ────────────────────────────────────────────────────────

export async function createCustomerPayment(input: Record<string, unknown>): Promise<SalesActionResult> {
  const { data, error } = await rpc('create_customer_payment', { p_input: input })
  throwOnError(error)
  return data as SalesActionResult
}

export async function customerPaymentAction(action: 'post' | 'reverse', id: string, reason = ''): Promise<SalesActionResult> {
  const { data, error } = await rpc(
    action === 'post' ? 'post_customer_payment' : 'reverse_customer_payment',
    action === 'post' ? { p_payment_id: id } : { p_payment_id: id, p_reason: reason }
  )
  throwOnError(error)
  return data as SalesActionResult
}

// ─── Customer ledger ─────────────────────────────────────────────────────────

export async function listCustomerBalances(search = ''): Promise<CustomerBalance[]> {
  let q = requireSupabase().from('customer_balance').select('*').order('customer_name')
  if (search) q = q.or(`customer_code.ilike.%${safe(search)}%,customer_name.ilike.%${safe(search)}%`)
  const { data, error } = await q
  throwOnError(error)
  return (data ?? []) as unknown as CustomerBalance[]
}

export async function listCustomerStatement(
  customerId: string,
  dateFrom?: string, dateTo?: string,
  branchId?: string, entryType?: string,
  outstandingOnly = false
): Promise<CustomerStatement[]> {
  let q = requireSupabase().from('customer_statement').select('*').eq('customer_id', customerId)
    .order('entry_date').order('created_at').order('id')
  if (dateFrom) q = q.gte('entry_date', dateFrom)
  if (dateTo) q = q.lte('entry_date', dateTo)
  if (branchId) q = q.eq('branch_id', branchId)
  if (entryType) q = q.eq('entry_type', entryType)
  if (outstandingOnly) q = q.gt('running_balance', 0)
  const { data, error } = await q
  throwOnError(error)
  return (data ?? []) as unknown as CustomerStatement[]
}
