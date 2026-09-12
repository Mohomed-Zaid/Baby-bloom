import { z } from 'zod'

const uuid = z.string().uuid()
const requiredText = z.string().trim().min(1)
const optionalText = z.string().trim().optional().or(z.literal(''))
const optionalEmail = z.string().trim().email().optional().or(z.literal(''))
const money = z.coerce.number().finite()
const nonNegativeMoney = money.nonnegative()
const quantity = z.coerce.number().finite().nonnegative()
const percentage = z.coerce.number().finite().min(0).max(100)

export const customerSchema = z.object({
  branch_id: uuid,
  customer_code: requiredText.max(40),
  customer_type: z.enum(['cash', 'retail', 'wholesale']),
  name: requiredText.max(200),
  contact_person: optionalText,
  phone: optionalText,
  alternate_phone: optionalText,
  email: optionalEmail,
  address: optionalText,
  city: optionalText,
  tax_number: optionalText,
  credit_limit: nonNegativeMoney,
  credit_days: z.coerce.number().int().nonnegative(),
  opening_balance: nonNegativeMoney,
  opening_balance_type: z.enum(['debit', 'credit']),
  price_level: z.enum(['retail', 'wholesale', 'special']),
  sms_enabled: z.boolean(),
  notes: optionalText,
  is_active: z.boolean(),
})

export const vendorSchema = z.object({
  branch_id: uuid,
  vendor_code: requiredText.max(40),
  name: requiredText.max(200),
  contact_person: optionalText,
  phone: optionalText,
  alternate_phone: optionalText,
  email: optionalEmail,
  address: optionalText,
  city: optionalText,
  tax_number: optionalText,
  credit_limit: nonNegativeMoney,
  credit_days: z.coerce.number().int().nonnegative(),
  opening_balance: nonNegativeMoney,
  opening_balance_type: z.enum(['debit', 'credit']),
  products_supplied_notes: optionalText,
  payment_terms: optionalText,
  notes: optionalText,
  status: z.enum(['active', 'inactive']),
})

export const categorySchema = z.object({
  parent_id: uuid.nullable().optional(), code: requiredText.max(40), name: requiredText.max(160),
  description: optionalText, is_active: z.boolean(),
})
export const brandSchema = z.object({ code: requiredText.max(40), name: requiredText.max(160), description: optionalText, is_active: z.boolean() })
export const unitSchema = z.object({ code: requiredText.max(30), name: requiredText.max(100), symbol: requiredText.max(20), decimal_places: z.coerce.number().int().min(0).max(4), is_active: z.boolean() })

export const productSchema = z.object({
  product_code: requiredText.max(60), name: requiredText.max(240), description: optionalText,
  category_id: uuid, brand_id: uuid.nullable().optional(), base_unit_id: uuid,
  product_status: z.enum(['active', 'inactive', 'discontinued']), has_variants: z.boolean(),
  track_stock: z.boolean(), allow_negative_stock: z.boolean(), minimum_stock: quantity,
  reorder_level: quantity, default_warranty_days: z.coerce.number().int().nonnegative(),
  preferred_vendor_id: uuid.nullable().optional(), image_url: z.string().url().nullable().optional().or(z.literal('')),
  notes: optionalText,
})

export const productVariantSchema = z.object({
  product_id: uuid, sku: requiredText.max(80), barcode: optionalText, variant_name: requiredText.max(160),
  size: optionalText, colour: optionalText, attributes: z.record(z.string(), z.unknown()),
  purchase_price: nonNegativeMoney, average_cost: nonNegativeMoney, retail_price: nonNegativeMoney,
  wholesale_price: nonNegativeMoney, special_price: nonNegativeMoney, minimum_price: nonNegativeMoney,
  commission_percentage: percentage, default_discount_percentage: percentage, is_default: z.boolean(), is_active: z.boolean(),
}).refine((value) => value.minimum_price <= Math.max(value.retail_price, value.wholesale_price, value.special_price), {
  message: 'Minimum price cannot exceed the highest selling price.', path: ['minimum_price'],
})

export const branchSchema = z.object({
  code: requiredText.max(30), name: requiredText.max(160), phone: optionalText, email: optionalEmail,
  address: optionalText, city: optionalText, invoice_prefix: optionalText, is_head_office: z.boolean(), is_active: z.boolean(),
})
export const warehouseSchema = z.object({ branch_id: uuid, code: requiredText.max(30), name: requiredText.max(160), address: optionalText, is_default: z.boolean(), is_active: z.boolean() })
export const bankAccountSchema = z.object({
  branch_id: uuid, bank_id: uuid, bank_branch_id: uuid.nullable().optional(), account_name: requiredText.max(200),
  account_number: requiredText.max(80), account_kind: requiredText.max(80), opening_balance: money,
  ledger_account_id: uuid.nullable().optional(), is_default: z.boolean(), is_active: z.boolean(),
})
export const chartOfAccountSchema = z.object({
  account_code: requiredText.max(40), account_name: requiredText.max(200),
  account_type: z.enum(['asset', 'liability', 'equity', 'income', 'expense', 'cost_of_sales']),
  normal_balance: z.enum(['debit', 'credit']), parent_account_id: uuid.nullable().optional(),
  is_control_account: z.boolean(), is_system_account: z.boolean(), allow_manual_entries: z.boolean(), is_active: z.boolean(),
})

export type CustomerInput = z.infer<typeof customerSchema>
export type VendorInput = z.infer<typeof vendorSchema>
export type CategoryInput = z.infer<typeof categorySchema>
export type BrandInput = z.infer<typeof brandSchema>
export type UnitInput = z.infer<typeof unitSchema>
export type ProductInput = z.infer<typeof productSchema>
export type ProductVariantInput = z.infer<typeof productVariantSchema>
export type BranchInput = z.infer<typeof branchSchema>
export type WarehouseInput = z.infer<typeof warehouseSchema>
export type BankAccountInput = z.infer<typeof bankAccountSchema>
export type ChartOfAccountInput = z.infer<typeof chartOfAccountSchema>
