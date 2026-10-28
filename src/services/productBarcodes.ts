import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

export interface ProductBarcodeRow {
  id: string
  company_id: string
  product_variant_id: string
  barcode: string
  barcode_type: string
  pack_quantity: number
  is_primary: boolean
  created_at: string
  updated_at?: string
  // Joined fields
  product_id?: string
  product_code?: string
  product_name?: string
  variant_name?: string
  sku?: string
  retail_price?: number
}

export interface VariantOption {
  variant_id: string
  product_id: string
  product_code: string
  product_name: string
  variant_name: string
  sku: string
  current_barcode: string | null
  retail_price: number
}

export interface CreateBarcodePayload {
  product_variant_id: string
  barcode: string
  barcode_type?: string
  pack_quantity?: number
  is_primary?: boolean
}

export interface UpdateBarcodePayload {
  id: string
  product_variant_id?: string
  barcode?: string
  barcode_type?: string
  pack_quantity?: number
  is_primary?: boolean
}

export async function listProductBarcodes(params: {
  search?: string
  filterType?: 'all' | 'primary' | 'secondary'
  page?: number
  pageSize?: number
}): Promise<{ rows: ProductBarcodeRow[]; count: number }> {
  const supabase = db()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  let query = supabase
    .from('product_barcodes')
    .select(`
      id,
      company_id,
      product_variant_id,
      barcode,
      barcode_type,
      pack_quantity,
      is_primary,
      created_at,
      product_variants:product_variants (
        id,
        sku,
        variant_name,
        retail_price,
        product:products (
          id,
          product_code,
          name
        )
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (params.filterType === 'primary') {
    query = query.eq('is_primary', true)
  } else if (params.filterType === 'secondary') {
    query = query.eq('is_primary', false)
  }

  if (params.search?.trim()) {
    const term = safe(params.search.trim())
    query = query.or(`barcode.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  throwOnError(error)

  const rows: ProductBarcodeRow[] = ((data ?? []) as any[]).map((r) => {
    const pv = r.product_variants
    const p = pv?.product
    return {
      id: r.id,
      company_id: r.company_id,
      product_variant_id: r.product_variant_id,
      barcode: r.barcode,
      barcode_type: r.barcode_type || 'CODE128',
      pack_quantity: Number(r.pack_quantity ?? 1),
      is_primary: Boolean(r.is_primary),
      created_at: r.created_at,
      product_id: p?.id,
      product_code: p?.product_code || '-',
      product_name: p?.name || 'Unnamed Product',
      variant_name: pv?.variant_name || 'Default',
      sku: pv?.sku || '-',
      retail_price: Number(pv?.retail_price ?? 0),
    }
  })

  // If search term was provided, we can also filter in-memory for product name / SKU matches
  let finalRows = rows
  if (params.search?.trim()) {
    const t = params.search.trim().toLowerCase()
    finalRows = rows.filter(
      (row) =>
        row.barcode.toLowerCase().includes(t) ||
        (row.product_code && row.product_code.toLowerCase().includes(t)) ||
        (row.product_name && row.product_name.toLowerCase().includes(t)) ||
        (row.sku && row.sku.toLowerCase().includes(t))
    )
  }

  return {
    rows: finalRows,
    count: count ?? finalRows.length,
  }
}

export async function listVariantsForBarcode(): Promise<VariantOption[]> {
  const supabase = db()
  const { data, error } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      variant_name,
      barcode,
      retail_price,
      products:products (
        id,
        product_code,
        name
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(300)

  throwOnError(error)

  return ((data ?? []) as any[]).map((row) => ({
    variant_id: row.id,
    product_id: row.products?.id || '',
    product_code: row.products?.product_code || '-',
    product_name: row.products?.name || 'Unnamed Product',
    variant_name: row.variant_name || 'Default',
    sku: row.sku || '-',
    current_barcode: row.barcode || null,
    retail_price: Number(row.retail_price ?? 0),
  }))
}

export async function createProductBarcode(input: CreateBarcodePayload): Promise<ProductBarcodeRow> {
  const supabase = db()

  // Resolve company context
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id ?? null
  let companyId: string | null = null

  if (currentUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', currentUserId)
      .maybeSingle()
    companyId = profile?.company_id ?? null
  }

  if (!companyId) {
    companyId = await currentCompanyId()
  }

  // If this is set as primary, unmark other barcodes for the same variant
  if (input.is_primary) {
    await supabase
      .from('product_barcodes')
      .update({ is_primary: false })
      .eq('product_variant_id', input.product_variant_id)
      .eq('company_id', companyId)
  }

  const insertPayload: Record<string, unknown> = {
    company_id: companyId,
    product_variant_id: input.product_variant_id,
    barcode: input.barcode.trim(),
    barcode_type: input.barcode_type || 'CODE128',
    pack_quantity: input.pack_quantity ?? 1,
    is_primary: input.is_primary ?? false,
    created_by: currentUserId || null,
  }

  let { data, error } = await supabase
    .from('product_barcodes')
    .insert(insertPayload)
    .select()
    .single()

  // Gracefully handle if created_by column hasn't been migrated yet in schema cache
  if (error && error.message?.includes('created_by')) {
    delete insertPayload.created_by
    const retry = await supabase
      .from('product_barcodes')
      .insert(insertPayload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  throwOnError(error)

  // Also update barcode on product_variants if primary
  if (input.is_primary) {
    await supabase
      .from('product_variants')
      .update({ barcode: input.barcode.trim() })
      .eq('id', input.product_variant_id)
  }

  return data as ProductBarcodeRow
}

export async function updateProductBarcode(input: UpdateBarcodePayload): Promise<ProductBarcodeRow> {
  const supabase = db()

  // Fetch current barcode row to know previous variant & barcode values
  const { data: current } = await supabase
    .from('product_barcodes')
    .select('product_variant_id, is_primary, barcode')
    .eq('id', input.id)
    .maybeSingle()

  const targetVariantId = input.product_variant_id || current?.product_variant_id
  const targetBarcode = input.barcode !== undefined ? input.barcode.trim() : current?.barcode
  const isPrimary = input.is_primary !== undefined ? input.is_primary : current?.is_primary

  // If the product variant was changed, remove barcode from old variant if it matched
  if (current && input.product_variant_id && current.product_variant_id !== input.product_variant_id) {
    await supabase
      .from('product_variants')
      .update({ barcode: null })
      .eq('id', current.product_variant_id)
      .eq('barcode', current.barcode)
  }

  // If marking primary, unmark others for the target variant
  if (isPrimary && targetVariantId) {
    await supabase
      .from('product_barcodes')
      .update({ is_primary: false })
      .eq('product_variant_id', targetVariantId)
  }

  const payload: Record<string, unknown> = {}
  if (input.product_variant_id !== undefined) payload.product_variant_id = input.product_variant_id
  if (input.barcode !== undefined) payload.barcode = input.barcode.trim()
  if (input.barcode_type !== undefined) payload.barcode_type = input.barcode_type
  if (input.pack_quantity !== undefined) payload.pack_quantity = input.pack_quantity
  if (input.is_primary !== undefined) payload.is_primary = input.is_primary

  payload.updated_at = new Date().toISOString()

  let { data, error } = await supabase
    .from('product_barcodes')
    .update(payload)
    .eq('id', input.id)
    .select()
    .single()

  if (error && error.message?.includes('updated_at')) {
    delete payload.updated_at
    const retry = await supabase
      .from('product_barcodes')
      .update(payload)
      .eq('id', input.id)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  throwOnError(error)

  // Also update target variant's barcode if primary
  if (isPrimary && targetVariantId && targetBarcode) {
    await supabase
      .from('product_variants')
      .update({ barcode: targetBarcode })
      .eq('id', targetVariantId)
  }

  return data as ProductBarcodeRow
}

export async function deleteProductBarcode(id: string): Promise<void> {
  const supabase = db()
  const { error } = await supabase
    .from('product_barcodes')
    .delete()
    .eq('id', id)

  throwOnError(error)
}
