export type UUID = string
export type ISODate = string
export type ISODateTime = string
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserStatus = 'active' | 'inactive' | 'suspended'
export type CustomerType = 'cash' | 'retail' | 'wholesale'
export type VendorStatus = 'active' | 'inactive'
export type ProductStatus = 'active' | 'inactive' | 'discontinued'
export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'cost_of_sales'
export type NormalBalance = 'debit' | 'credit'
export type PriceLevel = 'retail' | 'wholesale' | 'special'

export interface Company {
  id: UUID; code: string; name: string; legal_name: string | null; registration_number: string | null
  tax_number: string | null; email: string | null; phone: string | null; address_line_1: string | null
  address_line_2: string | null; city: string | null; country: string; currency_code: string; timezone: string
  logo_url: string | null; subscription_plan: string | null; subscription_starts_on: ISODate | null
  subscription_expires_on: ISODate | null; is_active: boolean; created_at: ISODateTime; updated_at: ISODateTime
}

export interface Branch {
  id: UUID; company_id: UUID; code: string; name: string; phone: string | null; email: string | null
  address: string | null; city: string | null; invoice_prefix: string | null; is_head_office: boolean
  is_active: boolean; created_at: ISODateTime; created_by: UUID | null; updated_at: ISODateTime
  updated_by: UUID | null; deleted_at: ISODateTime | null
}

export interface Warehouse {
  id: UUID; company_id: UUID; branch_id: UUID; code: string; name: string; address: string | null
  is_default: boolean; is_active: boolean; created_at: ISODateTime; updated_at: ISODateTime; deleted_at: ISODateTime | null
}

export interface Customer {
  id: UUID; company_id: UUID; branch_id: UUID; customer_code: string; customer_type: CustomerType; name: string
  contact_person: string | null; phone: string | null; alternate_phone: string | null; email: string | null
  address: string | null; city: string | null; tax_number: string | null; credit_limit: number; credit_days: number
  opening_balance: number; opening_balance_type: NormalBalance; price_level: PriceLevel; sms_enabled: boolean
  notes: string | null; is_active: boolean; created_at: ISODateTime; created_by: UUID | null
  updated_at: ISODateTime; updated_by: UUID | null; deleted_at: ISODateTime | null
}

export interface Vendor {
  id: UUID; company_id: UUID; branch_id: UUID; vendor_code: string; name: string; contact_person: string | null
  phone: string | null; alternate_phone: string | null; email: string | null; address: string | null; city: string | null
  tax_number: string | null; credit_limit: number; credit_days: number; opening_balance: number
  opening_balance_type: NormalBalance; products_supplied_notes: string | null; payment_terms: string | null
  notes: string | null; status: VendorStatus; created_at: ISODateTime; created_by: UUID | null
  updated_at: ISODateTime; updated_by: UUID | null; deleted_at: ISODateTime | null
}

export interface Category { id: UUID; company_id: UUID; parent_id: UUID | null; code: string; name: string; description: string | null; is_active: boolean; created_at: ISODateTime; updated_at: ISODateTime; deleted_at: ISODateTime | null }
export interface Brand { id: UUID; company_id: UUID; code: string; name: string; description: string | null; is_active: boolean; created_at: ISODateTime; updated_at: ISODateTime; deleted_at: ISODateTime | null }
export interface Unit { id: UUID; company_id: UUID; code: string; name: string; symbol: string; decimal_places: number; is_active: boolean; created_at: ISODateTime; updated_at: ISODateTime }

export interface Product {
  id: UUID; company_id: UUID; product_code: string; name: string; description: string | null; category_id: UUID
  brand_id: UUID | null; base_unit_id: UUID; product_status: ProductStatus; has_variants: boolean; track_stock: boolean
  allow_negative_stock: boolean; minimum_stock: number; reorder_level: number; default_warranty_days: number
  preferred_vendor_id: UUID | null; image_url: string | null; notes: string | null; created_at: ISODateTime
  created_by: UUID | null; updated_at: ISODateTime; updated_by: UUID | null; deleted_at: ISODateTime | null
}

export interface ProductVariant {
  id: UUID; company_id: UUID; product_id: UUID; sku: string; barcode: string | null; variant_name: string
  size: string | null; colour: string | null; attributes: Json; purchase_price: number | null; average_cost: number | null
  retail_price: number; wholesale_price: number; special_price: number; minimum_price: number | null
  commission_percentage: number; default_discount_percentage: number; is_default: boolean; is_active: boolean
  created_at: ISODateTime; created_by: UUID | null; updated_at: ISODateTime; updated_by: UUID | null; deleted_at: ISODateTime | null
}

export interface Bank { id: UUID; company_id: UUID | null; bank_code: string; name: string; is_active: boolean; created_at: ISODateTime }
export interface BankBranch { id: UUID; company_id: UUID | null; bank_id: UUID; branch_code: string; name: string; address: string | null; phone: string | null; is_active: boolean; created_at: ISODateTime }
export interface BankAccount { id: UUID; company_id: UUID; branch_id: UUID; bank_id: UUID; bank_branch_id: UUID | null; account_name: string; account_number: string; account_kind: string; opening_balance: number; ledger_account_id: UUID | null; is_default: boolean; is_active: boolean; created_at: ISODateTime; created_by: UUID | null; updated_at: ISODateTime; updated_by: UUID | null; deleted_at: ISODateTime | null }
export interface ChartOfAccount { id: UUID; company_id: UUID; account_code: string; account_name: string; account_type: AccountType; normal_balance: NormalBalance; parent_account_id: UUID | null; is_control_account: boolean; is_system_account: boolean; allow_manual_entries: boolean; is_active: boolean; created_at: ISODateTime; updated_at: ISODateTime }
export interface Role { id: UUID; company_id: UUID; code: string; name: string; description: string | null; is_system_role: boolean; is_active: boolean; created_at: ISODateTime; updated_at: ISODateTime }
export interface Permission { id: UUID; permission_key: string; module: string; name: string; description: string | null }
