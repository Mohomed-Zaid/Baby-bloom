import { requireSupabase, throwOnError } from './client'
import type {
  CustomerBalance, CustomerStatement, InvoicePaymentRow,
  PosProduct, SalesActionResult, SalesFilters, SalesInvoiceItemRow,
  SalesInvoiceRow, SalesReturnEligibility, SalesReturnRow,
  CreateSalesDraftHeader, CreateSalesDraftItem, CreateSalesDraftPayment
} from '../types/sales'

type Page<T> = { rows: T[]; count: number }
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = (name: string, args: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<RpcResult>)(name, args)
const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// ─── Product lookup ───────────────────────────────────────────────────────────

export async function listPosProducts(search = ''): Promise<PosProduct[]> {
  let q = requireSupabase().from('pos_product_search').select('*').order('product_name').limit(200)
  if (search) q = q.or(`product_code.ilike.%${safe(search)}%,product_name.ilike.%${safe(search)}%,sku.ilike.%${safe(search)}%,barcode.eq.${safe(search)}`)
  const { data, error } = await q
  throwOnError(error)
  return (data ?? []) as unknown as PosProduct[]
}

export async function findPosByBarcode(barcode: string): Promise<PosProduct | null> {
  const { data, error } = await requireSupabase().from('pos_product_search').select('*').eq('barcode', barcode).limit(1).maybeSingle()
  throwOnError(error)
  return data as unknown as PosProduct | null
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

export async function listSalesReturns(page = 1, pageSize = 20): Promise<Page<SalesReturnRow>> {
  const { data, error, count } = await requireSupabase().from('sales_return_history').select('*', { count: 'exact' })
    .order('return_date', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  throwOnError(error)
  return { rows: (data ?? []) as unknown as SalesReturnRow[], count: count ?? 0 }
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
