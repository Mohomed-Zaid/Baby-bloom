// Phase 6: Sales invoicing, customer ledger, sales returns — TypeScript types.

export type SalesDocumentStatus = 'draft' | 'held' | 'posted' | 'cancelled' | 'reversed'
export type SalesInvoiceType = 'cash' | 'credit' | 'mixed'
export type SalesPaymentStatus = 'unpaid' | 'partial' | 'paid'
export type SalesDiscountType = 'none' | 'percentage' | 'fixed'
export type CustomerPaymentMethod = 'cash' | 'card' | 'cheque' | 'bank_transfer' | 'customer_credit'
export type CustomerLedgerEntryType = 'opening_balance' | 'invoice' | 'payment' | 'sales_return' | 'credit_note' | 'cheque_return' | 'reversal'
export type InvoicePaymentRecordStatus = 'draft' | 'posted' | 'cancelled' | 'reversed'
export type SalesReturnSettlementType = 'reduce_receivable' | 'customer_refund' | 'customer_credit'
export type StockMovementTypeSales = 'sale_out' | 'sale_return_in'

// ──────────────────────────────── INVOICE ─────────────────────────────────

export interface SalesInvoiceRow {
  id: string; company_id: string; branch_id: string; warehouse_id: string; stock_location_id: string
  invoice_number: string; customer_id: string; invoice_date: string; due_date: string
  invoice_type: SalesInvoiceType; status: SalesDocumentStatus
  subtotal: number | null; item_discount_total: number | null; bill_discount_type: SalesDiscountType
  bill_discount_value: number | null; bill_discount_amount: number | null; tax_total: number | null
  grand_total: number; paid_amount: number; balance_amount: number; change_amount: number; returned_amount: number
  payment_status: SalesPaymentStatus; rep_id: string | null; cashier_id: string | null
  notes: string | null; internal_reference: string | null; reversal_of_id: string | null
  created_at: string; created_by: string | null; posted_at: string | null; held_at: string | null; cancelled_at: string | null
  // View join columns
  customer_code: string; customer_name: string; customer_phone: string | null; customer_type: string
  credit_limit: number; branch_name: string; warehouse_name: string; location_name: string; created_user: string | null
}

export interface SalesInvoiceItemRow {
  id: string; company_id: string; invoice_id: string; product_variant_id: string
  quantity: number; unit_price: number; cost_price: number | null
  discount_type: SalesDiscountType; discount_value: number; discount_amount: number
  tax_rate: number; tax_amount: number; line_subtotal: number; line_total: number
  batch_reference: string | null; warranty_period: number | null; remarks: string | null; created_at: string
  product_code: string; product_name: string; variant_name: string; sku: string; barcode: string | null
}

// ──────────────────────────────── PAYMENTS ────────────────────────────────

export interface InvoicePaymentRow {
  id: string; company_id: string; branch_id: string; invoice_id: string | null; customer_id: string
  payment_number: string; payment_date: string; payment_method: CustomerPaymentMethod; amount: number
  bank_account_id: string | null; card_reference: string | null; cheque_number: string | null; cheque_date: string | null
  cheque_status: 'pending' | 'cleared' | 'returned'; notes: string | null
  status: InvoicePaymentRecordStatus; clearing_status: 'pending' | 'cleared' | 'returned'
  created_at: string; created_by: string | null; posted_at: string | null; reversed_at: string | null; reversal_reason: string | null
  // View columns
  customer_code: string; customer_name: string; branch_name: string; invoice_number: string | null; bank_account_name: string | null; created_user: string | null
}

// ──────────────────────────────── LEDGER ──────────────────────────────────

export interface CustomerBalance {
  customer_id: string; customer_code: string; customer_name: string; phone: string | null; email: string | null
  customer_type: string; credit_limit: number
  opening_balance: number; invoice_balance: number; return_balance: number; payment_balance: number
  cheque_return_balance: number; total_outstanding: number; overdue_amount: number
  next_due_date: string | null; last_transaction_date: string | null
}

export interface CustomerStatement {
  id: string; customer_id: string; entry_date: string; entry_type: CustomerLedgerEntryType
  reference_type: string; reference_id: string; reference_number: string
  debit_amount: number; credit_amount: number; due_date: string | null; notes: string | null
  branch_name: string; created_user: string | null; running_balance: number; overdue: boolean
}

// ──────────────────────────────── RETURNS ─────────────────────────────────

export interface SalesReturnRow {
  id: string; company_id: string; branch_id: string; warehouse_id: string; stock_location_id: string
  return_number: string; invoice_id: string | null; customer_id: string; return_date: string
  status: SalesDocumentStatus; subtotal: number; discount_total: number; tax_total: number; grand_total: number
  settlement_type: SalesReturnSettlementType; refund_amount: number; balance_adjustment: number
  reason: string; notes: string | null; reversal_of_id: string | null; created_at: string; posted_at: string | null
  customer_code: string; customer_name: string; branch_name: string; warehouse_name: string; location_name: string; invoice_number: string | null; created_user: string | null
}

export interface SalesReturnEligibility {
  original_invoice_item_id: string; invoice_id: string; product_variant_id: string
  sold_quantity: number; returned_quantity: number; eligible_quantity: number
  historical_unit_price: number; historical_cost_price: number | null
  batch_reference: string | null; product_code: string; product_name: string; variant_name: string; sku: string; barcode: string | null
}

// ──────────────────────────────── POS ─────────────────────────────────────

export interface PosProduct {
  product_variant_id: string; product_id: string; product_code: string; product_name: string
  variant_name: string; sku: string; barcode: string | null; base_unit_id: string; unit_name: string
  retail_price: number; wholesale_price: number; special_price: number; last_cost: number | null
  available_quantity: number; track_stock: boolean; allow_negative_stock: boolean; tax_rate: number
}

export interface PosCartLine {
  product_variant_id: string; product_code: string; product_name: string; variant_name: string
  sku: string; barcode: string | null; unit_name: string; available_quantity: number
  quantity: number; unit_price: number; cost_price: number; tax_rate: number
  discount_type: SalesDiscountType; discount_value: number; discount_amount: number; line_total: number
  track_stock: boolean; allow_negative_stock: boolean
}

export interface PosTender {
  cash: number; card: number; cheque: number; credit: number
  card_reference?: string; cheque_number?: string; cheque_date?: string
}

// ──────────────────────────────── RPC PAYLOADS ────────────────────────────

export interface SalesActionResult {
  id: string; document_number: string; status: SalesDocumentStatus
  grand_total?: number; paid_amount?: number; balance_amount?: number; change_amount?: number; idempotent?: boolean
}

export interface CreateSalesDraftHeader {
  branch_id: string; warehouse_id: string; stock_location_id: string; customer_id: string
  invoice_date: string; due_date: string; invoice_type: SalesInvoiceType
  bill_discount_type?: SalesDiscountType; bill_discount_value?: number
  notes?: string; internal_reference?: string; rep_id?: string; cashier_id?: string
}

export interface CreateSalesDraftItem {
  product_variant_id: string; quantity: number; unit_price: number
  discount_type?: SalesDiscountType; discount_value?: number; tax_rate?: number
  batch_reference?: string; warranty_period?: number; remarks?: string
}

export interface CreateSalesDraftPayment {
  payment_method: CustomerPaymentMethod; amount: number
  bank_account_id?: string; card_reference?: string; cheque_number?: string; cheque_date?: string; notes?: string
}

export interface SalesFilters {
  page?: number; pageSize?: number; search?: string; status?: string; paymentStatus?: string
  customerId?: string; branchId?: string; invoiceType?: string; dateFrom?: string; dateTo?: string
}
