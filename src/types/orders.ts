export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'dispatched' | 'delivered' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid'
export type DeliveryType = 'store_pickup' | 'courier' | 'internal_delivery'
export type PricingTier = 'retail' | 'wholesale' | 'tier_1' | 'tier_2' | 'special'
export type TransferShipmentStatus = 'in_transit' | 'received_fully' | 'discrepancy_reported' | 'cancelled'

export interface CustomerOrder {
  id: string
  company_id: string
  branch_id: string
  warehouse_id: string
  stock_location_id: string
  order_number: string
  customer_id: string
  order_date: string
  expected_delivery_date?: string | null
  order_status: OrderStatus
  payment_status: PaymentStatus
  delivery_type: DeliveryType
  courier_name?: string | null
  tracking_number?: string | null
  delivery_address?: string | null
  contact_phone?: string | null
  pricing_tier: PricingTier
  subtotal: number
  discount_total: number
  tax_total: number
  grand_total: number
  advance_paid: number
  balance_amount: number
  assigned_rep_id?: string | null
  sales_invoice_id?: string | null
  notes?: string | null
  dispatched_at?: string | null
  dispatched_by?: string | null
  delivered_at?: string | null
  delivered_by?: string | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancellation_reason?: string | null
  created_at: string
  updated_at: string
  // Joins
  customer?: {
    id: string
    name: string
    customer_code: string
    phone?: string
    email?: string
    address?: string
    credit_limit?: number
    is_credit_blocked?: boolean
  }
  branch?: {
    id: string
    name: string
    code: string
  }
  assigned_rep?: {
    id: string
    full_name: string
  }
  items?: CustomerOrderItem[]
}

export interface CustomerOrderItem {
  id?: string
  company_id?: string
  order_id?: string
  product_variant_id: string
  ordered_quantity: number
  allocated_quantity?: number
  delivered_quantity?: number
  unit_price: number
  discount_amount: number
  tax_amount?: number
  line_total: number
  remarks?: string | null
  // UI joins
  variant?: {
    id: string
    variant_name: string
    sku: string
    barcode?: string
    retail_price?: number
    wholesale_price?: number
    special_price?: number
    product?: {
      id: string
      name: string
      product_code: string
    }
  }
}

export interface CustomerCreditStatus {
  customer_id: string
  customer_code: string
  name: string
  credit_limit: number
  credit_days: number
  pricing_tier: PricingTier
  is_credit_blocked: boolean
  total_outstanding: number
  overdue_amount: number
  available_credit: number
  is_over_limit: boolean
}

export interface ProductTierPrice {
  id: string
  company_id: string
  product_variant_id: string
  tier_name: PricingTier
  unit_price: number
  created_at: string
}

export interface BranchTransferShipment {
  id: string
  company_id: string
  source_branch_id: string
  source_warehouse_id: string
  source_location_id: string
  destination_branch_id: string
  destination_warehouse_id: string
  destination_location_id: string
  transfer_number: string
  status: TransferShipmentStatus
  dispatched_at: string
  dispatched_by?: string | null
  received_at?: string | null
  received_by?: string | null
  carrier_name?: string | null
  tracking_number?: string | null
  notes?: string | null
  inventory_document_id?: string | null
  created_at: string
  updated_at: string
  // Joins
  source_branch?: {
    id: string
    name: string
    code: string
  }
  destination_branch?: {
    id: string
    name: string
    code: string
  }
  items?: BranchTransferShipmentItem[]
}

export interface BranchTransferShipmentItem {
  id?: string
  company_id?: string
  shipment_id?: string
  product_variant_id: string
  dispatched_quantity: number
  received_quantity: number
  unit_cost: number
  discrepancy_quantity?: number
  discrepancy_reason?: string | null
  variant?: {
    id: string
    variant_name: string
    sku: string
    barcode?: string
    product?: {
      id: string
      name: string
      product_code: string
    }
  }
}

export interface CustomerOrderFilterState {
  search: string
  order_status: string
  delivery_type: string
  branch_id: string
  date_from: string
  date_to: string
}
