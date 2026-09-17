import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'

export interface BarcodeLabelTemplate {
  id?: string
  company_id?: string
  template_name: string
  paper_width_mm: number
  paper_height_mm: number
  columns: number
  show_barcode: boolean
  show_price: boolean
  show_mfg_date: boolean
  show_exp_date: boolean
  is_default: boolean
  created_at?: string
  updated_at?: string
}

export interface PosShortcutKey {
  id?: string
  company_id?: string
  branch_id?: string | null
  function_or_product_id: string
  key_combination: string
  target_type: 'product' | 'command'
  description?: string | null
  created_at?: string
  label?: string
}

export interface PriceCheckResult {
  product_id: string
  variant_id: string
  product_name: string
  product_code: string
  sku: string
  barcode: string | null
  category_name?: string
  brand_name?: string
  retail_price: number
  wholesale_price: number
  special_price: number
  minimum_price: number
  purchase_price: number
  warranty_days?: number
  is_active: boolean
  current_stock: number
  reorder_level: number
  minimum_stock: number
}

const DEFAULT_TEMPLATES: BarcodeLabelTemplate[] = [
  {
    template_name: 'Single Thermal 50mm x 25mm (Standard)',
    paper_width_mm: 50,
    paper_height_mm: 25,
    columns: 1,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: true,
  },
  {
    template_name: 'Single Thermal 38mm x 25mm (Compact Jewellery/Cosmetics)',
    paper_width_mm: 38,
    paper_height_mm: 25,
    columns: 1,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: false,
  },
  {
    template_name: 'A4 Sheet (3 x 8 = 24 Labels per page)',
    paper_width_mm: 70,
    paper_height_mm: 37,
    columns: 3,
    show_barcode: true,
    show_price: true,
    show_mfg_date: true,
    show_exp_date: true,
    is_default: false,
  },
]

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

// --- Barcode Templates ---

export async function fetchBarcodeTemplates(): Promise<BarcodeLabelTemplate[]> {
  const companyId = await currentCompanyId()

  const { data, error } = await getTable('barcode_label_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .order('template_name', { ascending: true })

  if (error) {
    return DEFAULT_TEMPLATES
  }

  if (!data || data.length === 0) {
    return DEFAULT_TEMPLATES
  }

  return data as unknown as BarcodeLabelTemplate[]
}

export async function saveBarcodeTemplate(template: BarcodeLabelTemplate): Promise<BarcodeLabelTemplate> {
  const companyId = await currentCompanyId()

  if (template.id) {
    const { data, error } = await getTable('barcode_label_templates')
      .update({
        template_name: template.template_name,
        paper_width_mm: template.paper_width_mm,
        paper_height_mm: template.paper_height_mm,
        columns: template.columns,
        show_barcode: template.show_barcode,
        show_price: template.show_price,
        show_mfg_date: template.show_mfg_date,
        show_exp_date: template.show_exp_date,
        is_default: template.is_default,
        updated_at: new Date().toISOString(),
      } as unknown as never)
      .eq('id', template.id)
      .eq('company_id', companyId)
      .select()
      .single()

    throwOnError(error)
    return data as unknown as BarcodeLabelTemplate
  } else {
    const { data, error } = await getTable('barcode_label_templates')
      .insert({
        company_id: companyId,
        template_name: template.template_name,
        paper_width_mm: template.paper_width_mm,
        paper_height_mm: template.paper_height_mm,
        columns: template.columns,
        show_barcode: template.show_barcode,
        show_price: template.show_price,
        show_mfg_date: template.show_mfg_date,
        show_exp_date: template.show_exp_date,
        is_default: template.is_default,
      } as unknown as never)
      .select()
      .single()

    throwOnError(error)
    return data as unknown as BarcodeLabelTemplate
  }
}

export async function deleteBarcodeTemplate(id: string): Promise<void> {
  const companyId = await currentCompanyId()
  const { error } = await getTable('barcode_label_templates')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
  throwOnError(error)
}

// --- POS Shortcut Keys ---

export async function fetchPosShortcuts(branchId?: string): Promise<PosShortcutKey[]> {
  const companyId = await currentCompanyId()

  let query = getTable('pos_shortcut_keys')
    .select('*')
    .eq('company_id', companyId)

  if (branchId) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }

  const { data, error } = await query.order('key_combination', { ascending: true })
  if (error) {
    return []
  }

  return (data || []) as unknown as PosShortcutKey[]
}

export async function savePosShortcut(shortcut: PosShortcutKey): Promise<PosShortcutKey> {
  const companyId = await currentCompanyId()

  if (shortcut.id) {
    const { data, error } = await getTable('pos_shortcut_keys')
      .update({
        branch_id: shortcut.branch_id || null,
        function_or_product_id: shortcut.function_or_product_id,
        key_combination: shortcut.key_combination.trim().toUpperCase(),
        target_type: shortcut.target_type,
        description: shortcut.description || null,
      } as unknown as never)
      .eq('id', shortcut.id)
      .eq('company_id', companyId)
      .select()
      .single()

    throwOnError(error)
    return data as unknown as PosShortcutKey
  } else {
    const { data, error } = await getTable('pos_shortcut_keys')
      .insert({
        company_id: companyId,
        branch_id: shortcut.branch_id || null,
        function_or_product_id: shortcut.function_or_product_id,
        key_combination: shortcut.key_combination.trim().toUpperCase(),
        target_type: shortcut.target_type,
        description: shortcut.description || null,
      } as unknown as never)
      .select()
      .single()

    throwOnError(error)
    return data as unknown as PosShortcutKey
  }
}

export async function deletePosShortcut(id: string): Promise<void> {
  const companyId = await currentCompanyId()
  const { error } = await getTable('pos_shortcut_keys')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
  throwOnError(error)
}

// --- Price Check Lookup ---

export async function lookupPriceCheck(query: string, branchId?: string): Promise<PriceCheckResult[]> {
  const companyId = await currentCompanyId()
  const cleaned = query.trim()

  if (!cleaned) return []

  const { data: variants, error } = await getTable('product_variants')
    .select(`
      id,
      sku,
      barcode,
      variant_name,
      retail_price,
      wholesale_price,
      special_price,
      minimum_price,
      purchase_price,
      is_active,
      product:products (
        id,
        name,
        product_code,
        minimum_stock,
        reorder_level,
        default_warranty_days,
        category:categories (name),
        brand:brands (name)
      )
    `)
    .eq('company_id', companyId)
    .or(`sku.ilike.%${cleaned}%,barcode.ilike.%${cleaned}%,variant_name.ilike.%${cleaned}%`)
    .limit(10)

  throwOnError(error)

  const results: PriceCheckResult[] = []

  for (const v of (variants || []) as unknown as Array<{
    id: string
    sku: string
    barcode: string | null
    variant_name: string
    retail_price: number
    wholesale_price: number
    special_price: number
    minimum_price: number
    purchase_price: number
    is_active: boolean
    product: {
      id: string
      name: string
      product_code: string
      minimum_stock: number
      reorder_level: number
      default_warranty_days: number
      category?: { name: string } | null
      brand?: { name: string } | null
    }
  }>) {
    let stock = 0
    if (branchId) {
      const { data: stockData } = await getTable('inventory_balances')
        .select('current_stock')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .eq('product_variant_id', v.id)
        .maybeSingle()

      if (stockData) {
        stock = Number((stockData as { current_stock: number }).current_stock || 0)
      }
    }

    results.push({
      product_id: v.product.id,
      variant_id: v.id,
      product_name: v.product.name,
      product_code: v.product.product_code,
      sku: v.sku,
      barcode: v.barcode,
      category_name: v.product.category?.name,
      brand_name: v.product.brand?.name,
      retail_price: Number(v.retail_price || 0),
      wholesale_price: Number(v.wholesale_price || 0),
      special_price: Number(v.special_price || 0),
      minimum_price: Number(v.minimum_price || 0),
      purchase_price: Number(v.purchase_price || 0),
      warranty_days: v.product.default_warranty_days,
      is_active: v.is_active,
      current_stock: stock,
      reorder_level: Number(v.product.reorder_level || 0),
      minimum_stock: Number(v.product.minimum_stock || 0),
    })
  }

  return results
}
