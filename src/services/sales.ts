import { requireSupabase, throwOnError } from './client'
import { recordActiveShiftTransactionIfCash } from './shiftService'
import { isBackendOffline } from '../lib/supabase'
import { getStoredProductsList } from './products'
import { MOCK_PRODUCTS, MOCK_CUSTOMERS, MOCK_INVOICES, MOCK_BRANCHES, type MockProductVariant } from './mockData'
import type {
  CustomerBalance, CustomerStatement, InvoicePaymentRow,
  PosProduct, SalesActionResult, SalesFilters, SalesInvoiceItemRow,
  SalesInvoiceRow, SalesReturnEligibility, SalesReturnRow,
  SalesReturnItemDetail, CustomerRefundRow,
  CreateSalesDraftHeader, CreateSalesDraftItem, CreateSalesDraftPayment,
  SalesDocumentStatus
} from '../types/sales'

type Page<T> = { rows: T[]; count: number }
type RpcResult = { data: unknown; error: { message: string } | null }
const db = () => requireSupabase() as unknown as ReturnType<typeof requireSupabase>
const rpc = (name: string, args: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<RpcResult>)(name, args)
const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

const mapMockToPos = (p: MockProductVariant): PosProduct => ({
  product_variant_id: p.id,
  product_id: p.product_id,
  product_code: p.sku.split('-')[0] || 'PROD',
  product_name: p.product_name,
  variant_name: p.variant_name,
  sku: p.sku,
  barcode: p.barcode,
  base_unit_id: 'unit-pcs',
  unit_name: 'Pcs',
  retail_price: p.retail_price,
  wholesale_price: Math.round(p.retail_price * 0.85),
  special_price: p.retail_price,
  last_cost: p.cost_price,
  available_quantity: p.available_quantity,
  company_available_quantity: p.available_quantity,
  track_stock: true,
  allow_negative_stock: true,
  tax_rate: 0,
})

const mapMockInvoiceToRow = (inv: typeof MOCK_INVOICES[0]): SalesInvoiceRow => ({
  id: inv.id,
  company_id: 'company-babybloom',
  branch_id: inv.branch_id,
  warehouse_id: 'wh-colombo-main',
  stock_location_id: 'loc-floor-col',
  invoice_number: inv.invoice_number,
  customer_id: inv.customer_id,
  invoice_date: inv.invoice_date.split('T')[0] ?? inv.invoice_date,
  due_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().split('T')[0] ?? '',
  invoice_type: inv.payment_method === 'credit' ? 'credit' : 'cash',
  status: inv.status,
  subtotal: inv.total_amount,
  item_discount_total: 0,
  bill_discount_type: 'none',
  bill_discount_value: 0,
  bill_discount_amount: 0,
  tax_total: 0,
  grand_total: inv.total_amount,
  paid_amount: inv.paid_amount,
  balance_amount: inv.balance_amount,
  change_amount: 0,
  returned_amount: 0,
  payment_status: inv.balance_amount === 0 ? 'paid' : inv.paid_amount > 0 ? 'partial' : 'unpaid',
  rep_id: null,
  cashier_id: 'user-admin',
  notes: 'POS transaction',
  internal_reference: null,
  reversal_of_id: null,
  created_at: inv.invoice_date,
  created_by: 'user-admin',
  posted_at: inv.invoice_date,
  held_at: null,
  cancelled_at: null,
  customer_code: inv.customer_id === 'cust-walkin' ? 'WALK-IN' : 'CUST-001',
  customer_name: inv.customer_name,
  customer_phone: '+94 77 123 4567',
  customer_type: 'retail',
  credit_limit: 50000,
  branch_name: inv.branch_name,
  warehouse_name: 'Colombo Central Warehouse',
  location_name: 'Ground Floor Racks A & B',
  created_user: 'Zaid (System Administrator)',
})

export interface StoredSalesInvoice {
  header: SalesInvoiceRow
  items: SalesInvoiceItemRow[]
  payments: InvoicePaymentRow[]
}

export const STORAGE_KEY_INVOICES = 'bb_sales_invoices'

export function getStoredInvoices(): StoredSalesInvoice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INVOICES)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as StoredSalesInvoice[]
    }
  } catch {}
  return MOCK_INVOICES.map((inv) => ({
    header: mapMockInvoiceToRow(inv),
    items: [
      {
        id: `item-${inv.id}-1`,
        company_id: 'company-babybloom',
        invoice_id: inv.id,
        product_variant_id: 'pv-001',
        product_id: 'prod-001',
        product_code: 'APP-ROM-01',
        product_name: 'Organic Cotton Newborn Romper',
        variant_name: 'Newborn / Mint Green',
        sku: 'ROM-NB-MNT',
        barcode: '88510001',
        quantity: Math.max(1, Math.floor(inv.total_amount / 2450)),
        unit_price: 2450,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: inv.total_amount,
        line_total: inv.total_amount,
        cost_price: 1600,
        batch_reference: null,
        warranty_period: null,
        remarks: null,
        created_at: inv.invoice_date,
      },
    ],
    payments: [
      {
        id: `pay-${inv.id}`,
        company_id: 'company-babybloom',
        branch_id: inv.branch_id,
        invoice_id: inv.id,
        customer_id: inv.customer_id,
        payment_number: `PAY-${inv.id}`,
        payment_date: inv.invoice_date,
        payment_method: (inv.payment_method || 'cash') as any,
        amount: inv.paid_amount,
        bank_account_id: null,
        card_reference: null,
        cheque_number: null,
        cheque_date: null,
        cheque_status: 'cleared',
        notes: null,
        status: 'posted',
        clearing_status: 'cleared',
        created_at: inv.invoice_date,
        created_by: 'user-admin',
        posted_at: inv.invoice_date,
        reversed_at: null,
        reversal_reason: null,
        customer_code: inv.customer_id === 'cust-walkin' ? 'WALK-IN' : 'CUST-001',
        customer_name: inv.customer_name,
        branch_name: inv.branch_name,
        invoice_number: inv.invoice_number,
        bank_account_name: null,
        created_user: 'Admin',
      },
    ],
  }))
}

export function saveStoredInvoices(list: StoredSalesInvoice[]) {
  try {
    localStorage.setItem(STORAGE_KEY_INVOICES, JSON.stringify(list))
  } catch {}
}

// ─── Product lookup ───────────────────────────────────────────────────────────

export async function listPosProducts(search = '', locationId?: string): Promise<PosProduct[]> {
  if (!isBackendOffline()) {
    try {
      const trimmed = search.trim()
      let q = requireSupabase().from('pos_product_search').select('*').order('product_name').limit(200)

      if (trimmed) {
        const s = safe(trimmed)
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
      if (!error && data && data.length > 0) {
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
    } catch {}
  }

  // Merge stored products with MOCK_PRODUCTS
  const storedProdRows = getStoredProductsList()
  const allPos: PosProduct[] = []

  for (const p of storedProdRows) {
    for (const v of p.variants || []) {
      allPos.push({
        product_variant_id: v.id,
        product_id: p.id,
        product_code: p.product_code,
        product_name: p.name,
        variant_name: v.colour || 'Default',
        sku: v.sku,
        barcode: v.barcode,
        base_unit_id: 'unit-pcs',
        unit_name: 'Pcs',
        retail_price: v.retail_price,
        wholesale_price: v.wholesale_price || Math.round(v.retail_price * 0.85),
        special_price: v.special_price || v.retail_price,
        last_cost: v.purchase_price,
        available_quantity: 50,
        company_available_quantity: 50,
        track_stock: true,
        allow_negative_stock: true,
        tax_rate: 0,
      })
    }
  }

  if (allPos.length === 0) {
    allPos.push(...MOCK_PRODUCTS.map(mapMockToPos))
  }

  if (search.trim()) {
    const s = search.toLowerCase().trim()
    return allPos.filter(
      p =>
        p.product_name.toLowerCase().includes(s) ||
        p.sku.toLowerCase().includes(s) ||
        (p.barcode && p.barcode.includes(s)) ||
        p.product_code.toLowerCase().includes(s)
    )
  }
  return allPos
}

export async function findPosByBarcode(barcode: string, _locationId?: string): Promise<PosProduct | null> {
  const cleanCode = barcode.trim()
  if (!cleanCode) return null

  if (!isBackendOffline()) {
    try {
      // 1. Direct exact match on variant barcode in pos_product_search
      const { data: initialData, error: initialErr } = await requireSupabase()
        .from('pos_product_search')
        .select('*')
        .eq('barcode', cleanCode)
        .limit(1)
        .maybeSingle()

      let data = initialData

      // 2. Check secondary/pack barcodes in product_barcodes table
      if (!data && !initialErr) {
        const { data: pbData } = await db()
          .from('product_barcodes')
          .select('product_variant_id')
          .eq('barcode', cleanCode)
          .limit(1)
          .maybeSingle()

        const matchedVariantId = (pbData as { product_variant_id?: string } | null)?.product_variant_id
        if (matchedVariantId) {
          const { data: vData } = await requireSupabase()
            .from('pos_product_search')
            .select('*')
            .eq('product_variant_id', matchedVariantId)
            .limit(1)
            .maybeSingle()
          data = vData
        }
      }

      if (data) {
        const p = { ...(data as unknown as PosProduct) }
        p.company_available_quantity = p.available_quantity
        return p
      }
    } catch {}
  }

  const all = await listPosProducts()
  const match = all.find(p => p.barcode === cleanCode || p.sku.toLowerCase() === cleanCode.toLowerCase())
  return match || null
}

// ─── Draft / hold / recall ───────────────────────────────────────────────────

export async function createSalesDraft(
  header: CreateSalesDraftHeader,
  items: CreateSalesDraftItem[],
  payments: CreateSalesDraftPayment[] = []
): Promise<SalesActionResult> {
  if (!isBackendOffline()) {
    try {
      const { data, error } = await rpc('create_sales_draft', { p_header: header, p_items: items, p_payments: payments })
      if (!error && data) {
        return data as SalesActionResult
      }
    } catch {}
  }

  const docId = `inv-${Date.now()}`
  const docNum = `INV-2026-${Math.floor(10000 + Math.random() * 90000)}`
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

  const discVal = header.bill_discount_value ?? 0
  let billDiscAmount = 0
  if (header.bill_discount_type === 'percentage') {
    billDiscAmount = subtotal * (discVal / 100)
  } else if (header.bill_discount_type === 'fixed') {
    billDiscAmount = Math.min(discVal, subtotal)
  }
  const grandTotal = Math.max(0, subtotal - billDiscAmount)
  const paid = payments.reduce((sum, p) => sum + p.amount, 0)
  const balance = Math.max(0, grandTotal - paid)
  const change = Math.max(0, paid - grandTotal)

  const customer = MOCK_CUSTOMERS.find((c) => c.id === header.customer_id)
  const custName = customer?.name || (header.customer_id === 'cust-walkin' ? 'Walk-in Cash Customer' : 'Cash Customer')
  const custCode = customer?.customer_code || 'CUST'
  const branch = MOCK_BRANCHES.find((b) => b.id === header.branch_id)
  const branchName = branch?.name || 'Main Flagship Store - Colombo 03'

  const allProducts = getStoredProductsList()

  const invoiceRow: SalesInvoiceRow = {
    id: docId,
    company_id: 'company-babybloom',
    branch_id: header.branch_id,
    warehouse_id: header.warehouse_id,
    stock_location_id: header.stock_location_id,
    invoice_number: docNum,
    customer_id: header.customer_id,
    invoice_date: header.invoice_date || new Date().toISOString().split('T')[0]!,
    due_date: header.due_date || header.invoice_date || new Date().toISOString().split('T')[0]!,
    invoice_type: header.invoice_type || 'cash',
    status: 'draft',
    subtotal,
    item_discount_total: 0,
    bill_discount_type: header.bill_discount_type || 'none',
    bill_discount_value: discVal,
    bill_discount_amount: billDiscAmount,
    tax_total: 0,
    grand_total: grandTotal,
    paid_amount: Math.min(paid, grandTotal),
    balance_amount: balance,
    change_amount: change,
    returned_amount: 0,
    payment_status: balance === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    rep_id: header.rep_id || null,
    cashier_id: 'user-admin',
    notes: header.notes || null,
    internal_reference: header.internal_reference || null,
    reversal_of_id: null,
    created_at: new Date().toISOString(),
    created_by: 'user-admin',
    posted_at: null,
    held_at: null,
    cancelled_at: null,
    customer_code: custCode,
    customer_name: custName,
    customer_phone: customer?.phone || '+94 77 123 4567',
    customer_type: 'retail',
    credit_limit: customer?.credit_limit || 50000,
    branch_name: branchName,
    warehouse_name: 'Colombo Central Warehouse',
    location_name: 'Ground Floor Racks A & B',
    created_user: 'Zaid Mohomed (Admin)',
  }

  const invoiceItems: SalesInvoiceItemRow[] = items.map((it, idx) => {
    let pName = 'Product'
    let pCode = 'PRD'
    let vName = 'Standard'
    let sku = 'SKU'
    let barcode: string | null = null

    for (const p of allProducts) {
      const v = (p.variants || []).find((vr) => vr.id === it.product_variant_id)
      if (v) {
        pName = p.name
        pCode = p.product_code
        vName = v.colour || 'Default'
        sku = v.sku
        barcode = v.barcode
        break
      }
    }

    const itemDiscVal = it.discount_value ?? 0
    const lineBase = it.quantity * it.unit_price
    const da =
      it.discount_type === 'percentage'
        ? lineBase * (itemDiscVal / 100)
        : it.discount_type === 'fixed'
        ? Math.min(itemDiscVal, lineBase)
        : 0

    return {
      id: `item-${docId}-${idx + 1}`,
      company_id: 'company-babybloom',
      invoice_id: docId,
      product_variant_id: it.product_variant_id,
      product_id: 'prod-001',
      product_code: pCode,
      product_name: pName,
      variant_name: vName,
      sku,
      barcode,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_type: it.discount_type ?? 'none',
      discount_value: itemDiscVal,
      discount_amount: da,
      tax_rate: it.tax_rate ?? 0,
      tax_amount: 0,
      line_subtotal: lineBase,
      line_total: lineBase - da,
      cost_price: it.unit_price * 0.7,
      batch_reference: null,
      warranty_period: null,
      created_at: new Date().toISOString(),
      remarks: it.remarks || null,
    }
  })

  const invoicePayments: InvoicePaymentRow[] = payments.map((pm, idx) => ({
    id: `pay-${docId}-${idx + 1}`,
    company_id: 'company-babybloom',
    branch_id: header.branch_id,
    invoice_id: docId,
    customer_id: header.customer_id,
    payment_number: `PAY-${docId}-${idx + 1}`,
    payment_date: invoiceRow.invoice_date,
    payment_method: pm.payment_method,
    amount: pm.amount,
    bank_account_id: pm.bank_account_id || null,
    card_reference: pm.card_reference || null,
    cheque_number: pm.cheque_number || null,
    cheque_date: pm.cheque_date || null,
    cheque_status: 'cleared',
    notes: pm.notes || null,
    status: 'posted',
    clearing_status: 'cleared',
    created_at: new Date().toISOString(),
    created_by: 'user-admin',
    posted_at: new Date().toISOString(),
    reversed_at: null,
    reversal_reason: null,
    customer_code: custCode,
    customer_name: custName,
    branch_name: branchName,
    invoice_number: docNum,
    bank_account_name: null,
    created_user: 'Admin',
  }))

  const storedInvoices = getStoredInvoices()
  saveStoredInvoices([{ header: invoiceRow, items: invoiceItems, payments: invoicePayments }, ...storedInvoices])

  return {
    id: docId,
    document_number: docNum,
    status: 'draft',
    grand_total: grandTotal,
    paid_amount: paid,
    balance_amount: balance,
    change_amount: change,
  }
}

export async function holdInvoice(id: string): Promise<SalesActionResult> {
  const stored = getStoredInvoices()
  const found = stored.find((s) => s.header.id === id)
  if (found) {
    found.header.status = 'held'
    found.header.held_at = new Date().toISOString()
    saveStoredInvoices(stored)
  }

  if (!isBackendOffline()) {
    try {
      const { data, error } = await rpc('hold_sales_invoice', { p_invoice_id: id })
      if (!error && data) return data as SalesActionResult
    } catch {}
  }

  return {
    id,
    document_number: found?.header.invoice_number || `INV-HOLD-${Date.now()}`,
    status: 'held',
  }
}

export async function recallInvoice(id: string): Promise<SalesActionResult> {
  const stored = getStoredInvoices()
  const found = stored.find((s) => s.header.id === id)
  if (found) {
    found.header.status = 'draft'
    found.header.held_at = null
    saveStoredInvoices(stored)
  }

  if (!isBackendOffline()) {
    try {
      const { data, error } = await rpc('recall_sales_invoice', { p_invoice_id: id })
      if (!error && data) return data as SalesActionResult
    } catch {}
  }

  return {
    id,
    document_number: found?.header.invoice_number || `INV-RECALL-${Date.now()}`,
    status: 'draft',
  }
}

// ─── Invoice history ─────────────────────────────────────────────────────────

export async function listInvoices(filters: SalesFilters = {}): Promise<Page<SalesInvoiceRow>> {
  const client = requireSupabase()
  if (!isBackendOffline()) {
    try {
      let q = client
        .from('sales_invoice_history')
        .select('*', { count: 'exact' })
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (filters.search)
        q = q.or(
          `invoice_number.ilike.%${safe(filters.search)}%,customer_name.ilike.%${safe(
            filters.search
          )}%,customer_code.ilike.%${safe(filters.search)}%`
        )
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
      if (filters.paymentStatus && filters.paymentStatus !== 'all') q = q.eq('payment_status', filters.paymentStatus)
      if (filters.customerId) q = q.eq('customer_id', filters.customerId)
      if (filters.branchId) q = q.eq('branch_id', filters.branchId)
      if (filters.invoiceType) q = q.eq('invoice_type', filters.invoiceType)
      if (filters.dateFrom) q = q.gte('invoice_date', filters.dateFrom)
      if (filters.dateTo) q = q.lte('invoice_date', filters.dateTo)
      const { data, error, count } = await q
      if (!error && data && data.length > 0) {
        return { rows: (data ?? []) as unknown as SalesInvoiceRow[], count: count ?? 0 }
      }
    } catch {}
  }

  const stored = getStoredInvoices()
  let list = stored.map((s) => s.header)

  if (filters.search) {
    const s = filters.search.toLowerCase()
    list = list.filter(
      (i) => (i.invoice_number || '').toLowerCase().includes(s) || (i.customer_name || '').toLowerCase().includes(s)
    )
  }
  if (filters.status && filters.status !== 'all') {
    list = list.filter((i) => i.status === filters.status)
  }
  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    list = list.filter((i) => i.payment_status === filters.paymentStatus)
  }
  if (filters.customerId) {
    list = list.filter((i) => i.customer_id === filters.customerId)
  }
  if (filters.branchId) {
    list = list.filter((i) => i.branch_id === filters.branchId)
  }
  if (filters.invoiceType) {
    list = list.filter((i) => i.invoice_type === filters.invoiceType)
  }
  if (filters.dateFrom) {
    list = list.filter((i) => i.invoice_date >= filters.dateFrom!)
  }
  if (filters.dateTo) {
    list = list.filter((i) => i.invoice_date <= filters.dateTo!)
  }

  const page = filters.page ?? 1,
    size = filters.pageSize ?? 20
  const paged = list.slice((page - 1) * size, page * size)
  return { rows: paged, count: list.length }
}

export async function listHeldInvoices(branchId?: string): Promise<SalesInvoiceRow[]> {
  const client = requireSupabase()
  if (!isBackendOffline()) {
    try {
      let q = client.from('sales_invoice_history').select('*').eq('status', 'held').order('held_at', { ascending: false })
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (!error && data && data.length > 0) {
        return data as unknown as SalesInvoiceRow[]
      }
    } catch {}
  }

  const stored = getStoredInvoices()
  const held = stored.filter((s) => s.header.status === 'held').map((s) => s.header)
  return branchId ? held.filter((h) => h.branch_id === branchId) : held
}

export async function getInvoice(id: string) {
  const client = requireSupabase()
  if (!isBackendOffline()) {
    try {
      const headerRes = await client.from('sales_invoice_history').select('*').eq('id', id).maybeSingle()
      if (headerRes.data) {
        const itemsRes = await client.from('sales_invoice_item_details').select('*').eq('invoice_id', id).order('created_at')
        const paymentsRes = await client.from('invoice_payment_history').select('*').eq('invoice_id', id).order('payment_date')
        return {
          header: headerRes.data as unknown as SalesInvoiceRow,
          items: (itemsRes.data ?? []) as unknown as SalesInvoiceItemRow[],
          payments: (paymentsRes.data ?? []) as unknown as InvoicePaymentRow[],
        }
      }
    } catch {}
  }

  const stored = getStoredInvoices()
  const found = stored.find((s) => s.header.id === id)
  if (found) {
    return {
      header: found.header,
      items: found.items,
      payments: found.payments,
    }
  }

  throw new Error(`Invoice #${id} not found`)
}

// ─── Invoice actions ──────────────────────────────────────────────────────────

export async function invoiceAction(
  action: 'post' | 'cancel' | 'reverse',
  id: string,
  reason = ''
): Promise<SalesActionResult> {
  const statusMap = { post: 'posted', cancel: 'cancelled', reverse: 'reversed' } as const

  // 1. Update local storage
  const stored = getStoredInvoices()
  const found = stored.find((s) => s.header.id === id)
  if (found) {
    found.header.status = statusMap[action]
    if (action === 'post') {
      found.header.posted_at = new Date().toISOString()
    } else if (action === 'cancel') {
      found.header.cancelled_at = new Date().toISOString()
      found.header.notes = reason ? `Cancelled: ${reason}` : 'Cancelled'
    } else if (action === 'reverse') {
      found.header.notes = reason ? `Reversed: ${reason}` : 'Reversed'
    }
    saveStoredInvoices(stored)
  }

  // 2. Try remote RPC if online
  const names = { post: 'post_sales_invoice', cancel: 'cancel_sales_invoice', reverse: 'reverse_sales_invoice' }
  const args =
    action === 'cancel'
      ? { p_invoice_id: id, p_reason: reason }
      : action === 'reverse'
      ? { p_invoice_id: id, p_reason: reason }
      : { p_invoice_id: id }

  if (!isBackendOffline()) {
    try {
      const { data, error } = await rpc(names[action], args)
      if (!error && data) {
        return data as SalesActionResult
      }
    } catch {}
  }

  return {
    id,
    document_number: found?.header.invoice_number || `INV-2026-${id.slice(-4)}`,
    status: statusMap[action] as SalesDocumentStatus,
  }
}


// ─── Sales returns ────────────────────────────────────────────────────────────

export const STORAGE_KEY_RETURNS = 'bb_sales_returns'

export interface StoredSalesReturn {
  header: SalesReturnRow
  items: SalesReturnItemDetail[]
  refunds: CustomerRefundRow[]
}

export function getStoredReturns(): StoredSalesReturn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RETURNS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as StoredSalesReturn[]
    }
  } catch {}
  return []
}

export function saveStoredReturns(list: StoredSalesReturn[]) {
  try {
    localStorage.setItem(STORAGE_KEY_RETURNS, JSON.stringify(list))
  } catch {}
}

export interface SalesReturnFilters {
  page?: number
  pageSize?: number
  search?: string
  settlementType?: string
  status?: string
  branchId?: string
  customerId?: string
  dateFrom?: string
  dateTo?: string
}

export async function listSalesReturns(filters: SalesReturnFilters = {}): Promise<Page<SalesReturnRow>> {
  const page = filters.page ?? 1, size = filters.pageSize ?? 20
  const client = requireSupabase()
  if (!isBackendOffline()) {
    try {
      let q = client.from('sales_return_history').select('*', { count: 'exact' })
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
      if (filters.customerId) {
        q = q.eq('customer_id', filters.customerId)
      }
      if (filters.dateFrom) {
        q = q.gte('return_date', filters.dateFrom)
      }
      if (filters.dateTo) {
        q = q.lte('return_date', filters.dateTo)
      }

      const { data, error, count } = await q
      if (!error && data && data.length > 0) {
        return { rows: (data ?? []) as unknown as SalesReturnRow[], count: count ?? 0 }
      }
    } catch {
      // fallback
    }

    // Resilient fallback to sales_returns base table
    try {
      let fallbackQ = client.from('sales_returns').select('*', { count: 'exact' })
        .order('return_date', { ascending: false }).range((page - 1) * size, page * size - 1)

      if (filters.search) {
        fallbackQ = fallbackQ.ilike('return_number', `%${safe(filters.search)}%`)
      }
      if (filters.settlementType && filters.settlementType !== 'all') {
        fallbackQ = fallbackQ.eq('settlement_type', filters.settlementType)
      }
      if (filters.status && filters.status !== 'all') {
        fallbackQ = fallbackQ.eq('status', filters.status)
      }
      if (filters.branchId) {
        fallbackQ = fallbackQ.eq('branch_id', filters.branchId)
      }
      if (filters.customerId) {
        fallbackQ = fallbackQ.eq('customer_id', filters.customerId)
      }
      if (filters.dateFrom) {
        fallbackQ = fallbackQ.gte('return_date', filters.dateFrom)
      }
      if (filters.dateTo) {
        fallbackQ = fallbackQ.lte('return_date', filters.dateTo)
      }

      const { data: retData, error: retErr, count } = await fallbackQ
      if (!retErr && retData && retData.length > 0) {
        const rawRows = retData as any[]
        const custIds = [...new Set(rawRows.map(r => r.customer_id).filter(Boolean))]
        const branchIds = [...new Set(rawRows.map(r => r.branch_id).filter(Boolean))]
        const invIds = [...new Set(rawRows.map(r => r.sales_invoice_id).filter(Boolean))]

        const [custRes, branchRes, invRes] = await Promise.all([
          custIds.length > 0 ? (client.from('customers').select('id, name, customer_code').in('id', custIds) as unknown as Promise<{ data: any[] }>) : Promise.resolve({ data: [] }),
          branchIds.length > 0 ? (client.from('branches').select('id, name').in('id', branchIds) as unknown as Promise<{ data: any[] }>) : Promise.resolve({ data: [] }),
          invIds.length > 0 ? (client.from('sales_invoices').select('id, invoice_number').in('id', invIds) as unknown as Promise<{ data: any[] }>) : Promise.resolve({ data: [] }),
        ])

        const custMap = new Map((custRes.data || []).map((c: any) => [c.id, c]))
        const branchMap = new Map((branchRes.data || []).map((b: any) => [b.id, b]))
        const invMap = new Map((invRes.data || []).map((i: any) => [i.id, i]))

        const rows = rawRows.map(r => ({
          ...r,
          customer_name: custMap.get(r.customer_id)?.name || 'Walk-in Customer',
          customer_code: custMap.get(r.customer_id)?.customer_code || 'CUST',
          branch_name: branchMap.get(r.branch_id)?.name || 'Main Branch',
          invoice_number: invMap.get(r.sales_invoice_id)?.invoice_number || null,
          warehouse_name: '',
          location_name: '',
          created_user: null,
        })) as SalesReturnRow[]

        return { rows, count: count ?? 0 }
      }
    } catch {
      // fallback to stored returns
    }
  }

  // Local storage fallback
  const stored = getStoredReturns()
  let filtered = stored.map(s => s.header)
  if (filters.search) {
    const t = filters.search.toLowerCase()
    filtered = filtered.filter(f =>
      f.return_number.toLowerCase().includes(t) ||
      (f.customer_name && f.customer_name.toLowerCase().includes(t)) ||
      (f.invoice_number && f.invoice_number.toLowerCase().includes(t)) ||
      (f.reason && f.reason.toLowerCase().includes(t))
    )
  }
  if (filters.settlementType && filters.settlementType !== 'all') {
    filtered = filtered.filter(f => f.settlement_type === filters.settlementType)
  }
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter(f => f.status === filters.status)
  }
  if (filters.branchId) {
    filtered = filtered.filter(f => f.branch_id === filters.branchId)
  }
  if (filters.customerId) {
    filtered = filtered.filter(f => f.customer_id === filters.customerId)
  }
  if (filters.dateFrom) {
    filtered = filtered.filter(f => f.return_date >= filters.dateFrom!)
  }
  if (filters.dateTo) {
    filtered = filtered.filter(f => f.return_date <= filters.dateTo!)
  }
  return {
    rows: filtered.slice((page - 1) * size, page * size),
    count: filtered.length,
  }
}

export async function getSalesReturn(id: string): Promise<{
  header: SalesReturnRow
  items: SalesReturnItemDetail[]
  refunds: CustomerRefundRow[]
}> {
  const client = requireSupabase()
  let headerData: SalesReturnRow | null = null
  let itemsData: SalesReturnItemDetail[] = []
  let refundsData: CustomerRefundRow[] = []

  if (!isBackendOffline()) {
    try {
      const [headerRes, itemsRes, refundsRes] = await Promise.all([
        (client.from('sales_return_history').select('*').eq('id', id).single() as unknown as Promise<{ data: any; error: any }>),
        (client.from('sales_return_item_details').select('*').eq('sales_return_id', id).order('created_at') as unknown as Promise<{ data: any[]; error: any }>),
        (client.from('customer_refund_history').select('*').eq('sales_return_id', id).order('created_at') as unknown as Promise<{ data: any[]; error: any }>),
      ])
      if (!headerRes.error && headerRes.data) {
        headerData = headerRes.data as unknown as SalesReturnRow
        itemsData = (itemsRes.data ?? []) as unknown as SalesReturnItemDetail[]
        refundsData = (refundsRes.data ?? []) as unknown as CustomerRefundRow[]
      }
    } catch {
      // fallback
    }

    if (!headerData) {
      try {
        const { data: rawHeader, error: hErr } = await client.from('sales_returns').select('*').eq('id', id).single()
        if (!hErr && rawHeader) {
          const raw = rawHeader as any
          const [custRes, branchRes, invRes] = await Promise.all([
            raw.customer_id ? (client.from('customers').select('name, customer_code').eq('id', raw.customer_id).maybeSingle() as unknown as Promise<{ data: any }>) : Promise.resolve({ data: null }),
            raw.branch_id ? (client.from('branches').select('name').eq('id', raw.branch_id).maybeSingle() as unknown as Promise<{ data: any }>) : Promise.resolve({ data: null }),
            raw.sales_invoice_id ? (client.from('sales_invoices').select('invoice_number').eq('id', raw.sales_invoice_id).maybeSingle() as unknown as Promise<{ data: any }>) : Promise.resolve({ data: null }),
          ])

          headerData = {
            ...raw,
            customer_name: custRes.data?.name || 'Walk-in Customer',
            customer_code: custRes.data?.customer_code || 'CUST',
            branch_name: branchRes.data?.name || 'Main Branch',
            invoice_number: invRes.data?.invoice_number || null,
            warehouse_name: '',
            location_name: '',
            created_user: null,
          } as SalesReturnRow

          const { data: rawItems } = await client.from('sales_return_items').select('*').eq('sales_return_id', id)
          if (rawItems && rawItems.length > 0) {
            const variantIds = (rawItems as any[]).map(i => i.product_variant_id).filter(Boolean)
            const { data: variants } = variantIds.length > 0
              ? await (client.from('pos_product_search').select('product_variant_id, product_name, variant_name, sku, barcode, product_code').in('product_variant_id', variantIds) as unknown as Promise<{ data: any[] }>)
              : { data: [] }
            const varMap = new Map(((variants as any[]) || []).map(v => [v.product_variant_id, v]))
            itemsData = (rawItems as any[]).map(r => {
              const v = varMap.get(r.product_variant_id)
              return {
                ...r,
                product_name: v?.product_name || 'Product',
                variant_name: v?.variant_name || '',
                sku: v?.sku || '',
                barcode: v?.barcode || null,
                product_code: v?.product_code || '',
              }
            }) as SalesReturnItemDetail[]
          }
        }
      } catch {
        // fallback
      }
    }
  }

  if (!headerData) {
    const stored = getStoredReturns().find(s => s.header.id === id)
    if (stored) {
      return {
        header: stored.header,
        items: stored.items,
        refunds: stored.refunds || [],
      }
    }
    throw new Error(`Sales return #${id} not found`)
  }

  return {
    header: headerData,
    items: itemsData,
    refunds: refundsData,
  }
}

export interface CustomerRefundFilters {
  page?: number
  pageSize?: number
  search?: string
  paymentMethod?: string
  branchId?: string
  customerId?: string
  salesReturnId?: string
  dateFrom?: string
  dateTo?: string
}

export async function listCustomerRefunds(
  filtersOrReturnId?: string | CustomerRefundFilters,
  optionalCustomerId?: string
): Promise<{ rows: CustomerRefundRow[]; count: number }> {
  const client = requireSupabase()
  let filters: CustomerRefundFilters = {}

  if (typeof filtersOrReturnId === 'string') {
    filters = {
      salesReturnId: filtersOrReturnId,
      customerId: optionalCustomerId,
    }
  } else if (filtersOrReturnId) {
    filters = filtersOrReturnId
  }

  const page = filters.page ?? 1, size = filters.pageSize ?? 20

  try {
    let q = client.from('customer_refund_history').select('*', { count: 'exact' })
      .order('refund_date', { ascending: false }).order('created_at', { ascending: false })
      .range((page - 1) * size, page * size - 1)

    if (filters.search) {
      const term = safe(filters.search)
      q = q.or(`customer_name.ilike.%${term}%,customer_code.ilike.%${term}%,return_number.ilike.%${term}%,reference_number.ilike.%${term}%`)
    }
    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      q = q.eq('payment_method', filters.paymentMethod)
    }
    if (filters.branchId && filters.branchId !== 'all') {
      q = q.eq('branch_id', filters.branchId)
    }
    if (filters.customerId) {
      q = q.eq('customer_id', filters.customerId)
    }
    if (filters.salesReturnId) {
      q = q.eq('sales_return_id', filters.salesReturnId)
    }
    if (filters.dateFrom) {
      q = q.gte('refund_date', filters.dateFrom)
    }
    if (filters.dateTo) {
      q = q.lte('refund_date', filters.dateTo)
    }

    const { data, error, count } = await q
    if (!error && data) {
      return { rows: (data ?? []) as unknown as CustomerRefundRow[], count: count ?? 0 }
    }
  } catch {
    // fallback
  }

  // Resilient fallback to customer_refunds base table
  try {
    let fallbackQ = client.from('customer_refunds').select('*', { count: 'exact' })
      .order('refund_date', { ascending: false }).order('created_at', { ascending: false })
      .range((page - 1) * size, page * size - 1)

    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      fallbackQ = fallbackQ.eq('payment_method', filters.paymentMethod)
    }
    if (filters.branchId && filters.branchId !== 'all') {
      fallbackQ = fallbackQ.eq('branch_id', filters.branchId)
    }
    if (filters.customerId) {
      fallbackQ = fallbackQ.eq('customer_id', filters.customerId)
    }
    if (filters.salesReturnId) {
      fallbackQ = fallbackQ.eq('sales_return_id', filters.salesReturnId)
    }
    if (filters.dateFrom) {
      fallbackQ = fallbackQ.gte('refund_date', filters.dateFrom)
    }
    if (filters.dateTo) {
      fallbackQ = fallbackQ.lte('refund_date', filters.dateTo)
    }

    const { data: rfData, error: rfErr, count } = await fallbackQ
    throwOnError(rfErr)
    const rawRows = (rfData || []) as any[]
    if (rawRows.length > 0) {
      const custIds = [...new Set(rawRows.map(r => r.customer_id).filter(Boolean))]
      const branchIds = [...new Set(rawRows.map(r => r.branch_id).filter(Boolean))]
      const retIds = [...new Set(rawRows.map(r => r.sales_return_id).filter(Boolean))]
      const bankIds = [...new Set(rawRows.map(r => r.bank_account_id).filter(Boolean))]

      const [custRes, branchRes, retRes, bankRes] = await Promise.all([
        custIds.length > 0 ? (client.from('customers').select('id, name, customer_code').in('id', custIds) as unknown as Promise<{ data: any[] }>) : Promise.resolve({ data: [] }),
        branchIds.length > 0 ? (client.from('branches').select('id, name').in('id', branchIds) as unknown as Promise<{ data: any[] }>) : Promise.resolve({ data: [] }),
        retIds.length > 0 ? (client.from('sales_returns').select('id, return_number').in('id', retIds) as unknown as Promise<{ data: any[] }>) : Promise.resolve({ data: [] }),
        bankIds.length > 0 ? (client.from('bank_accounts').select('id, account_name').in('id', bankIds) as unknown as Promise<{ data: any[] }>) : Promise.resolve({ data: [] }),
      ])

      const custMap = new Map((custRes.data || []).map((c: any) => [c.id, c]))
      const branchMap = new Map((branchRes.data || []).map((b: any) => [b.id, b]))
      const retMap = new Map((retRes.data || []).map((r: any) => [r.id, r]))
      const bankMap = new Map((bankRes.data || []).map((ba: any) => [ba.id, ba]))

      const rows = rawRows.map(r => ({
        ...r,
        customer_name: custMap.get(r.customer_id)?.name || 'Walk-in Customer',
        customer_code: custMap.get(r.customer_id)?.customer_code || 'CUST',
        branch_name: branchMap.get(r.branch_id)?.name || 'Main Branch',
        return_number: retMap.get(r.sales_return_id)?.return_number || null,
        bank_account_name: bankMap.get(r.bank_account_id)?.account_name || null,
        created_user: null,
      })) as CustomerRefundRow[]

      return { rows, count: count ?? 0 }
    }
  } catch {
    // fallback to stored refunds
  }

  // Local storage fallback
  const storedReturns = getStoredReturns()
  let localRefunds: CustomerRefundRow[] = []
  for (const sr of storedReturns) {
    if (sr.refunds && sr.refunds.length > 0) {
      for (const rf of sr.refunds) {
        localRefunds.push({
          ...rf,
          customer_name: rf.customer_name || sr.header.customer_name || 'Walk-in Customer',
          customer_code: rf.customer_code || sr.header.customer_code || 'CUST',
          branch_name: rf.branch_name || sr.header.branch_name || 'Main Branch',
          return_number: rf.return_number || sr.header.return_number,
        })
      }
    }
  }

  if (filters.search) {
    const t = filters.search.toLowerCase()
    localRefunds = localRefunds.filter(
      (r) =>
        (r.customer_name && r.customer_name.toLowerCase().includes(t)) ||
        (r.customer_code && r.customer_code.toLowerCase().includes(t)) ||
        (r.return_number && r.return_number.toLowerCase().includes(t)) ||
        (r.reference_number && r.reference_number.toLowerCase().includes(t))
    )
  }
  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    localRefunds = localRefunds.filter((r) => r.payment_method === filters.paymentMethod)
  }
  if (filters.branchId && filters.branchId !== 'all') {
    localRefunds = localRefunds.filter((r) => r.branch_id === filters.branchId)
  }
  if (filters.customerId) {
    localRefunds = localRefunds.filter((r) => r.customer_id === filters.customerId)
  }
  if (filters.salesReturnId) {
    localRefunds = localRefunds.filter((r) => r.sales_return_id === filters.salesReturnId)
  }
  if (filters.dateFrom) {
    localRefunds = localRefunds.filter((r) => r.refund_date >= filters.dateFrom!)
  }
  if (filters.dateTo) {
    localRefunds = localRefunds.filter((r) => r.refund_date <= filters.dateTo!)
  }

  return {
    rows: localRefunds.slice((page - 1) * size, page * size),
    count: localRefunds.length,
  }
}


export async function returnEligibility(invoiceId: string): Promise<SalesReturnEligibility[]> {
  let list: SalesReturnEligibility[] = []
  if (!isBackendOffline()) {
    try {
      const { data, error } = await requireSupabase().from('sales_return_eligibility').select('*')
        .eq('invoice_id', invoiceId).gt('eligible_quantity', 0).order('product_name')
      if (!error && data && data.length > 0) {
        list = data as unknown as SalesReturnEligibility[]
      }
    } catch {
      // fallback
    }
  }

  // Fallback: calculate directly from invoice items
  if (list.length === 0) {
    try {
      const inv = await getInvoice(invoiceId)
      if (inv && inv.items.length > 0) {
        list = inv.items.map((item) => ({
          original_invoice_item_id: item.id,
          invoice_id: invoiceId,
          product_variant_id: item.product_variant_id,
          sold_quantity: item.quantity,
          returned_quantity: 0,
          eligible_quantity: item.quantity,
          historical_unit_price: item.unit_price,
          historical_cost_price: item.cost_price,
          batch_reference: item.batch_reference,
          product_code: item.product_code,
          product_name: item.product_name,
          variant_name: item.variant_name,
          sku: item.sku,
          barcode: item.barcode,
        }))
      }
    } catch {
      // ignore
    }
  }

  // Deduct any already active/posted returns for this invoice from local storage
  const storedReturns = getStoredReturns().filter(
    (r) => r.header.status !== 'reversed' && (r.header.sales_invoice_id === invoiceId || r.header.invoice_id === invoiceId)
  )

  if (storedReturns.length > 0) {
    const returnedMap = new Map<string, number>()
    for (const ret of storedReturns) {
      for (const it of ret.items) {
        const key = it.original_invoice_item_id || it.product_variant_id
        returnedMap.set(key, (returnedMap.get(key) || 0) + Number(it.quantity || 0))
      }
    }
    list = list.map((l) => {
      const priorReturned = returnedMap.get(l.original_invoice_item_id) || returnedMap.get(l.product_variant_id) || 0
      const remainingEligible = Math.max(0, l.sold_quantity - priorReturned)
      return {
        ...l,
        returned_quantity: priorReturned,
        eligible_quantity: remainingEligible,
      }
    }).filter((l) => l.eligible_quantity > 0)
  }

  return list
}

export async function createSalesReturnDraft(header: Record<string, unknown>, items: Record<string, unknown>[]): Promise<SalesActionResult> {
  let totalSum = 0
  for (const item of items) {
    const qty = Number(item.quantity || 0)
    const price = Number(item.unit_price || 0)
    totalSum += qty * price
  }

  const returnId = `sr-${Date.now()}`
  const returnNumber = `SR-${Date.now().toString().slice(-6)}`
  const returnDate = (header.return_date as string) || new Date().toISOString().slice(0, 10)
  const settlementType = (header.settlement_type as string) || 'customer_credit'

  const storedHeader: SalesReturnRow = {
    id: returnId,
    company_id: 'company-babybloom',
    branch_id: (header.branch_id as string) || 'branch-colombo-01',
    warehouse_id: (header.warehouse_id as string) || 'wh-colombo-main',
    stock_location_id: (header.stock_location_id as string) || 'loc-front-store',
    return_number: returnNumber,
    invoice_id: (header.sales_invoice_id as string) || (header.invoice_id as string) || null,
    sales_invoice_id: (header.sales_invoice_id as string) || (header.invoice_id as string) || null,
    customer_id: (header.customer_id as string) || 'cust-walkin',
    return_date: returnDate,
    status: 'draft',
    subtotal: totalSum,
    discount_total: 0,
    tax_total: 0,
    grand_total: totalSum,
    settlement_type: settlementType as any,
    refund_amount: settlementType === 'cash_refund' ? totalSum : 0,
    credit_note_amount: settlementType === 'customer_credit' ? totalSum : 0,
    balance_adjustment: totalSum,
    reason: (header.reason as string) || 'Customer Return',
    notes: (header.notes as string) || null,
    reversal_of_id: null,
    created_at: new Date().toISOString(),
    posted_at: null,
    customer_code: 'CUST-001',
    customer_name: 'Customer',
    branch_name: 'Main Branch',
    warehouse_name: 'Main Warehouse',
    location_name: 'Front Store',
    invoice_number: null,
    created_user: 'Cashier / Admin',
  }

  if (storedHeader.sales_invoice_id) {
    try {
      const inv = await getInvoice(storedHeader.sales_invoice_id)
      if (inv) {
        storedHeader.invoice_number = inv.header.invoice_number
        storedHeader.customer_name = inv.header.customer_name
        storedHeader.customer_code = inv.header.customer_code
        storedHeader.branch_name = inv.header.branch_name
      }
    } catch {}
  }

  const storedItems: SalesReturnItemDetail[] = items.map((it, idx) => ({
    id: `sri-${returnId}-${idx}`,
    company_id: 'company-babybloom',
    sales_return_id: returnId,
    original_invoice_item_id: (it.original_invoice_item_id as string) || null,
    product_variant_id: (it.product_variant_id as string) || `pv-${idx}`,
    quantity: Number(it.quantity || 0),
    unit_price: Number(it.unit_price || 0),
    cost_price: Number(it.cost_price || 0),
    discount_amount: 0,
    tax_amount: 0,
    line_total: Number(it.quantity || 0) * Number(it.unit_price || 0),
    batch_reference: null,
    reason: (it.reason as string) || storedHeader.reason,
    restock_condition: (it.restock_condition as any) || 'good',
    remarks: (it.remarks as string) || null,
    product_code: (it.product_code as string) || 'PROD',
    product_name: (it.product_name as string) || 'Product',
    variant_name: (it.variant_name as string) || '',
    sku: (it.sku as string) || '',
    barcode: null,
  }))

  const storedRecord: StoredSalesReturn = {
    header: storedHeader,
    items: storedItems,
    refunds: [],
  }

  const currentReturns = getStoredReturns()
  saveStoredReturns([storedRecord, ...currentReturns])

  if (!isBackendOffline()) {
    try {
      const { data, error } = await rpc('create_sales_return_draft', { p_header: header, p_items: items })
      if (!error && data) {
        const res = data as SalesActionResult
        storedHeader.id = res.id
        storedHeader.return_number = res.document_number
        saveStoredReturns([storedRecord, ...currentReturns])
        return res
      }
    } catch {}

    try {
      const client = requireSupabase()
      const { data: retData, error: retErr } = await (client.from('sales_returns') as any)
        .insert({
          branch_id: header.branch_id,
          warehouse_id: header.warehouse_id,
          stock_location_id: header.stock_location_id,
          sales_invoice_id: header.sales_invoice_id || header.invoice_id || null,
          customer_id: header.customer_id,
          return_date: returnDate,
          settlement_type: settlementType,
          reason: header.reason || 'Customer Return',
          notes: header.notes || null,
          return_number: returnNumber,
          status: 'draft',
          subtotal: totalSum,
          grand_total: totalSum,
        })
        .select('id, return_number, status')
        .single()

      if (!retErr && retData) {
        storedHeader.id = (retData as any).id
        storedHeader.return_number = (retData as any).return_number
        saveStoredReturns([storedRecord, ...currentReturns])
        return {
          id: (retData as any).id,
          document_number: (retData as any).return_number,
          status: 'draft',
          grand_total: totalSum,
        }
      }
    } catch {}
  }

  return {
    id: returnId,
    document_number: returnNumber,
    status: 'draft',
    grand_total: totalSum,
  }
}

export async function salesReturnAction(action: 'post' | 'reverse', id: string, reason = ''): Promise<SalesActionResult> {
  const status = action === 'post' ? 'posted' : 'reversed'
  const current = getStoredReturns()
  const found = current.find(r => r.header.id === id)

  if (found) {
    found.header.status = status
    if (action === 'post') {
      found.header.posted_at = new Date().toISOString()
      if (found.header.settlement_type === 'cash_refund' && Number(found.header.refund_amount) > 0) {
        try {
          await recordActiveShiftTransactionIfCash({
            branch_id: found.header.branch_id,
            transaction_type: 'refund',
            direction: 'out',
            amount: Number(found.header.refund_amount),
            reason: `Cash Refund - ${found.header.return_number}`,
            reference_type: 'customer_refund',
            reference_id: id,
            notes: `Return ${found.header.return_number}`,
            payment_method: 'cash',
          })
        } catch {}
      }
    } else if (action === 'reverse') {
      found.header.notes = reason ? `Reversed: ${reason}` : 'Reversed'
    }
    saveStoredReturns(current)
  }

  if (!isBackendOffline()) {
    try {
      const { data, error } = await rpc(action === 'post' ? 'post_sales_return' : 'reverse_sales_return',
        action === 'reverse' ? { p_return_id: id, p_reason: reason } : { p_return_id: id })
      if (!error && data) {
        return data as SalesActionResult
      }
    } catch {}

    try {
      const client = requireSupabase()
      const updatePayload: Record<string, unknown> = { status }
      if (action === 'post') updatePayload.posted_at = new Date().toISOString()
      if (action === 'reverse') updatePayload.notes = reason ? `Reversed: ${reason}` : 'Reversed'

      const { data: retData } = await (client.from('sales_returns') as any)
        .update(updatePayload)
        .eq('id', id)
        .select('id, return_number, status')
        .single()

      if (retData) {
        return {
          id: (retData as any).id,
          document_number: (retData as any).return_number,
          status: (retData as any).status,
        }
      }
    } catch {}
  }

  return {
    id,
    document_number: found?.header.return_number || `SR-${id.slice(-4)}`,
    status,
  }
}

// ─── Customer payments ────────────────────────────────────────────────────────

export async function createCustomerPayment(input: Record<string, unknown>): Promise<SalesActionResult> {
  const { data, error } = await rpc('create_customer_payment', { p_input: input })
  throwOnError(error)

  const res = data as SalesActionResult
  if (input.payment_method === 'cash' && Number(input.amount) > 0) {
    try {
      await recordActiveShiftTransactionIfCash({
        branch_id: input.branch_id as string,
        transaction_type: 'customer_payment',
        direction: 'in',
        amount: Number(input.amount),
        reason: `Customer Payment - ${res?.document_number || 'CP'}`,
        reference_type: 'customer_payment',
        reference_id: res?.id || (input.id as string),
        notes: (input.notes as string) || `Payment ${res?.document_number || ''}`,
        payment_method: 'cash',
      })
    } catch {
      // Non-blocking shift recording
    }
  }

  return res
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
  try {
    let q = requireSupabase().from('customer_balance').select('*').order('customer_name')
    if (search) q = q.or(`customer_code.ilike.%${safe(search)}%,customer_name.ilike.%${safe(search)}%`)
    const { data, error } = await q
    if (!error && data && data.length > 0) return (data ?? []) as unknown as CustomerBalance[]
  } catch {}

  let list: CustomerBalance[] = MOCK_CUSTOMERS.map(c => ({
    customer_id: c.id,
    customer_code: c.customer_code,
    customer_name: c.name,
    phone: c.phone,
    email: c.email,
    customer_type: 'retail',
    credit_limit: c.credit_limit,
    opening_balance: 0,
    invoice_balance: c.current_balance,
    return_balance: 0,
    payment_balance: 0,
    cheque_return_balance: 0,
    total_outstanding: c.current_balance,
    overdue_amount: c.current_balance > 20000 ? Math.round(c.current_balance * 0.4) : 0,
    next_due_date: new Date(Date.now() + 7 * 86400 * 1000).toISOString().split('T')[0] ?? null,
    last_transaction_date: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
  }))

  if (search) {
    const s = search.toLowerCase()
    list = list.filter(c => c.customer_name.toLowerCase().includes(s) || c.customer_code.toLowerCase().includes(s) || (c.phone && c.phone.includes(s)))
  }
  return list
}

export async function listCustomerStatement(
  customerId: string,
  dateFrom?: string, dateTo?: string,
  branchId?: string, entryType?: string,
  outstandingOnly = false
): Promise<CustomerStatement[]> {
  try {
    let q = requireSupabase().from('customer_statement').select('*').eq('customer_id', customerId)
      .order('entry_date').order('created_at').order('id')
    if (dateFrom) q = q.gte('entry_date', dateFrom)
    if (dateTo) q = q.lte('entry_date', dateTo)
    if (branchId) q = q.eq('branch_id', branchId)
    if (entryType) q = q.eq('entry_type', entryType)
    if (outstandingOnly) q = q.gt('running_balance', 0)
    const { data, error } = await q
    if (!error && data && data.length > 0) return (data ?? []) as unknown as CustomerStatement[]
  } catch {}

  return [
    {
      id: 'stmt-01',
      customer_id: customerId,
      entry_date: new Date(Date.now() - 14 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      entry_type: 'invoice',
      reference_type: 'sales_invoice',
      reference_id: 'inv-1003',
      reference_number: 'INV-2026-0038',
      debit_amount: 42000,
      credit_amount: 0,
      due_date: new Date(Date.now() + 7 * 86400 * 1000).toISOString().split('T')[0] ?? null,
      notes: 'Initial consignment sale',
      branch_name: 'Main Flagship Store - Colombo 03',
      created_user: 'Zaid (System Administrator)',
      running_balance: 42000,
      overdue: false,
    },
    {
      id: 'stmt-02',
      customer_id: customerId,
      entry_date: new Date(Date.now() - 2 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      entry_type: 'payment',
      reference_type: 'customer_receipt',
      reference_id: 'rec-mock-01',
      reference_number: 'REC-2026-0081',
      debit_amount: 0,
      credit_amount: 15000,
      due_date: null,
      notes: 'Bank transfer part-settlement',
      branch_name: 'Main Flagship Store - Colombo 03',
      created_user: 'Zaid (System Administrator)',
      running_balance: 27000,
      overdue: false,
    },
  ]
}
