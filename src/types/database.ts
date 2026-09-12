import type {
  Bank, BankAccount, BankBranch, Brand, Branch, Category, ChartOfAccount, Company, Customer,
  Json, Permission, Product, ProductVariant, Role, Unit, Vendor, Warehouse,
} from './domain'
import type { CurrentStockRow, InventoryActionResult, InventoryDocument, InventoryDocumentItem, StockMovementRow } from './inventory'

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] }

interface RolePermissionRow { role_id: string; permission_id: string; company_id: string; is_allowed: boolean; created_at: string }
interface UserRoleRow { user_id: string; role_id: string; company_id: string; assigned_at: string; assigned_by: string | null }
interface ProfileRow { id: string; company_id: string; staff_code: string; full_name: string; username: string; phone: string | null; address: string | null; avatar_url: string | null; status: 'active'|'inactive'|'suspended'; default_branch_id: string | null; requires_two_factor: boolean; authentication_period: number; last_login_at: string | null; created_at: string; updated_at: string }

export interface Database {
  public: {
    Tables: {
      companies: Table<Company>
      profiles: Table<ProfileRow>
      branches: Table<Branch>
      warehouses: Table<Warehouse>
      customers: Table<Customer>
      vendors: Table<Vendor>
      categories: Table<Category>
      brands: Table<Brand>
      units: Table<Unit>
      products: Table<Product>
      product_variants: Table<ProductVariant & { deleted_at: string | null }>
      banks: Table<Bank>
      bank_branches: Table<BankBranch>
      bank_accounts: Table<BankAccount>
      chart_of_accounts: Table<ChartOfAccount>
      roles: Table<Role>
      permissions: Table<Permission>
      role_permissions: Table<RolePermissionRow>
      user_roles: Table<UserRoleRow>
      inventory_documents: Table<InventoryDocument>
      inventory_document_items: Table<InventoryDocumentItem>
    }
    Views: {
      product_variants_secure: { Row: ProductVariant; Relationships: [] }
      current_stock: { Row: CurrentStockRow; Relationships: [] }
      low_stock_products: { Row: CurrentStockRow & { shortage_quantity:number }; Relationships: [] }
      stock_movement_history: { Row: StockMovementRow; Relationships: [] }
    }
    Functions: {
      current_user_company_id: { Args: Record<PropertyKey, never>; Returns: string | null }
      user_has_branch_access: { Args: { branch_uuid: string }; Returns: boolean }
      user_can_transact_in_branch: { Args: { branch_uuid: string }; Returns: boolean }
      user_has_permission: { Args: { p_permission_key: string }; Returns: boolean }
      next_document_number: { Args: { p_company_id: string; p_branch_id: string; p_sequence_type: Database['public']['Enums']['sequence_type'] }; Returns: string }
      create_product_with_default_variant: { Args: { p_product: Json; p_variant: Json }; Returns: string }
      resolve_product_barcode: { Args: { p_barcode: string }; Returns: { product_variant_id:string; product_id:string; sku:string; variant_name:string; pack_quantity:number }[] }
      submit_inventory_document: { Args: { p_document_id:string }; Returns: InventoryActionResult }
      approve_inventory_document: { Args: { p_document_id:string }; Returns: InventoryActionResult }
      reject_inventory_document: { Args: { p_document_id:string;p_reason:string }; Returns: InventoryActionResult }
      cancel_inventory_document: { Args: { p_document_id:string;p_reason:string }; Returns: InventoryActionResult }
      post_opening_stock: { Args: { document_id:string }; Returns: InventoryActionResult }
      post_stock_transfer: { Args: { document_id:string }; Returns: InventoryActionResult }
      post_stock_adjustment: { Args: { document_id:string }; Returns: InventoryActionResult }
      post_damaged_stock: { Args: { document_id:string }; Returns: InventoryActionResult }
      post_stock_write_off: { Args: { document_id:string }; Returns: InventoryActionResult }
      reverse_inventory_document: { Args: { document_id:string;reason:string }; Returns: InventoryActionResult }
    }
    Enums: {
      user_status: 'active' | 'inactive' | 'suspended'
      customer_type: 'cash' | 'retail' | 'wholesale'
      vendor_status: 'active' | 'inactive'
      product_status: 'active' | 'inactive' | 'discontinued'
      account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'cost_of_sales'
      normal_balance: 'debit' | 'credit'
      price_level: 'retail' | 'wholesale' | 'special'
      sequence_type: 'invoice' | 'quotation' | 'sales_order' | 'sales_return' | 'purchase' | 'purchase_return' | 'receipt' | 'payment' | 'journal' | 'stock_transfer' | 'stock_adjustment' | 'credit_note' | 'debit_note' | 'cheque' | 'customer' | 'vendor' | 'product'
      inventory_document_type: InventoryDocument['document_type']
      inventory_document_status: InventoryDocument['status']
    }
    CompositeTypes: Record<string, never>
  }
}

export type { Json }
