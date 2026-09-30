export type PurchaseStatus='draft'|'submitted'|'approved'|'posted'|'cancelled'|'reversed'
export type PurchaseType='cash'|'credit'|'mixed'
export type PaymentMethod='cash'|'bank'|'card'|'online'|'cheque'|'supplier_advance'
export type DiscountType='none'|'fixed'|'percentage'

export interface PurchaseRow {
 id:string;company_id:string;branch_id:string;warehouse_id:string;stock_location_id:string;purchase_number:string;vendor_invoice_number:string|null;vendor_id:string
 purchase_date:string;due_date:string;purchase_type:PurchaseType;status:PurchaseStatus;subtotal:number|null;item_discount_total:number|null;bill_discount_type:DiscountType
 bill_discount_value:number|null;bill_discount_amount:number|null;tax_total:number|null;shipping_cost:number|null;other_cost:number|null;grand_total:number|null;paid_amount:number|null
 balance_amount:number|null;payment_status:string;returned_amount:number;notes:string|null;internal_reference:string|null;reversal_of_id:string|null;created_at:string;posted_at:string|null
 vendor_code:string;vendor_name:string;branch_name:string;warehouse_name:string;location_name:string;created_user:string|null
}
export interface PurchaseItemRow {id:string;purchase_id:string;product_variant_id:string;unit_id:string;quantity:number;free_quantity:number;unit_cost:number|null;discount_type:DiscountType;discount_value:number|null;discount_amount:number|null;tax_rate:number;tax_amount:number|null;line_subtotal:number|null;line_total:number|null;allocated_bill_discount:number|null;allocated_extra_cost:number|null;final_unit_cost:number|null;batch_reference:string|null;manufacture_date:string|null;expiry_date:string|null;warranty_days:number|null;remarks:string|null;product_code:string;product_name:string;variant_name:string;sku:string;barcode:string|null;unit_name:string;unit_symbol:string}
export interface PurchaseProduct {product_variant_id:string;product_id:string;product_code:string;product_name:string;variant_name:string;sku:string;barcode:string|null;base_unit_id:string;unit_name:string;preferred_vendor_id:string|null;preferred_vendor_name:string|null;reorder_level:number;retail_price:number;wholesale_price:number;last_purchase_cost:number|null;available_quantity?:number;company_available_quantity?:number}
export interface PurchasePayment {id:string;purchase_id:string|null;vendor_id:string;payment_number:string;payment_date:string;payment_method:PaymentMethod;amount:number;bank_account_id:string|null;cheque_id:string|null;reference_number:string|null;notes:string|null;status:'draft'|'posted'|'reversed';clearing_status:'pending'|'cleared'|'returned';vendor_code:string;vendor_name:string;branch_name:string;purchase_number:string|null;bank_account_name:string|null}
export interface PurchaseReturnRow {id:string;branch_id:string;warehouse_id:string;stock_location_id:string;return_number:string;purchase_id:string|null;vendor_id:string;return_date:string;status:PurchaseStatus;subtotal:number|null;discount_total:number|null;tax_total:number|null;grand_total:number|null;settlement_type:'reduce_payable'|'supplier_credit'|'supplier_refund';refund_amount:number|null;balance_adjustment:number|null;reason:string;notes:string|null;reversal_of_id:string|null;vendor_code:string;vendor_name:string;branch_name:string;warehouse_name:string;location_name:string;purchase_number:string|null}
export interface ReturnEligibility {original_purchase_item_id:string;purchase_id:string;product_variant_id:string;purchased_quantity:number;returned_quantity:number;eligible_quantity:number;historical_unit_cost:number|null;batch_reference:string|null;product_code:string;product_name:string;variant_name:string;sku:string;barcode:string|null}
export interface SupplierBalance {vendor_id:string;vendor_code:string;vendor_name:string;phone:string|null;email:string|null;opening_balance:number;purchase_balance:number;purchase_return_balance:number;payment_balance:number;cheque_return_balance:number;supplier_advance:number;total_outstanding:number;overdue_amount:number;next_due_date:string|null;last_transaction_date:string|null}
export interface SupplierStatement {id:string;vendor_id:string;entry_date:string;entry_type:string;reference_type:string;reference_id:string;reference_number:string;debit_amount:number;credit_amount:number;due_date:string|null;notes:string|null;branch_name:string;created_user:string|null;running_balance:number;overdue:boolean}
export interface PurchaseReturnItemDetail {
  id: string
  company_id: string
  purchase_return_id: string
  original_purchase_item_id: string | null
  product_variant_id: string
  quantity: number
  unit_cost: number | null
  discount_amount: number | null
  tax_amount: number | null
  line_total: number | null
  batch_reference: string | null
  reason: string | null
  condition: string
  created_at?: string
  product_code: string
  product_name: string
  variant_name: string
  sku: string
  barcode: string | null
}

export interface ListReturnsOptions {
  search?: string
  status?: string
  branchId?: string
  vendorId?: string
  page?: number
  pageSize?: number
}

export interface PurchaseActionResult {
  id: string
  document_number: string
  status: PurchaseStatus
  grand_total?: number
  idempotent?: boolean
}
