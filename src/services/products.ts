import type { Product } from '../types/domain'
import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_PRODUCTS, MOCK_CATEGORIES, MOCK_BRANDS } from './mockData'

export interface ProductVariantItem {
  id: string
  sku: string
  barcode: string | null
  retail_price: number
  purchase_price: number
  average_cost: number
  wholesale_price?: number
  special_price?: number
  minimum_price?: number
  commission_percentage?: number
  default_discount_percentage?: number
  colour?: string | null
  attributes?: Record<string, unknown>
  is_default: boolean
  is_active: boolean
}

export interface ProductRowItem {
  id: string
  product_code: string
  name: string
  product_status: string
  created_at: string
  category_id: string
  brand_id: string | null
  base_unit_id?: string | null
  preferred_vendor_id?: string | null
  minimum_stock?: number
  reorder_level?: number
  image_url: string | null
  notes?: string | null
  category?: { id: string; name: string } | null
  variants?: ProductVariantItem[]
}

const STORAGE_KEY = 'bb_products_list'

export function getStoredProductsList(): ProductRowItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as ProductRowItem[]
    }
  } catch { }

  const catMap = new Map(MOCK_CATEGORIES.map(c => [c.name.toLowerCase(), c]))
  const brandMap = new Map(MOCK_BRANDS.map(b => [b.name.toLowerCase(), b]))
  const prodMap = new Map<string, ProductRowItem>()

  let codeNum = 1001
  for (const m of MOCK_PRODUCTS) {
    const existing = prodMap.get(m.product_id)
    const varItem: ProductVariantItem = {
      id: m.id,
      sku: m.sku,
      barcode: m.barcode,
      retail_price: m.retail_price,
      purchase_price: m.cost_price,
      average_cost: m.cost_price,
      wholesale_price: Math.round(m.retail_price * 0.85),
      special_price: m.retail_price,
      minimum_price: m.cost_price,
      commission_percentage: 0,
      default_discount_percentage: 0,
      attributes: {
        unit1: { unit: 'PCS', price: m.retail_price, mrp: m.retail_price },
        service_type: 'Item',
        main_unit: 'unit1',
      },
      is_default: !existing,
      is_active: true,
    }

    if (existing) {
      existing.variants = [...(existing.variants || []), varItem]
    } else {
      const matchedCat = catMap.get(m.category_name.toLowerCase()) || MOCK_CATEGORIES[0]
      const matchedBrand = brandMap.get(m.brand_name.toLowerCase()) || MOCK_BRANDS[0]
      prodMap.set(m.product_id, {
        id: m.product_id,
        product_code: `P-${codeNum++}`,
        name: m.product_name,
        product_status: 'active',
        created_at: new Date(Date.now() - codeNum * 3600000).toISOString(),
        category_id: matchedCat?.id || 'cat-clothing',
        brand_id: matchedBrand?.id || 'br-babybloom',
        image_url: null,
        category: { id: matchedCat?.id || 'cat-clothing', name: m.category_name },
        variants: [varItem],
      })
    }
  }

  const list = Array.from(prodMap.values())
  saveStoredProductsList(list)
  return list
}

export function saveStoredProductsList(list: ProductRowItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { }
}

export interface ListProductsParams {
  page: number
  pageSize: number
  sortBy: 'newest' | 'oldest' | 'name_asc' | 'code_asc'
  categoryFilter: string
  statusFilter: string
  search: string
}

export async function listProductsFiltered(params: ListProductsParams): Promise<{ rows: ProductRowItem[]; count: number }> {
  const { page, pageSize, sortBy, categoryFilter, statusFilter, search } = params

  if (!isBackendOffline()) {
    try {
      let query = requireSupabase()
        .from('products')
        .select(`
          id,
          product_code,
          name,
          product_status,
          created_at,
          category_id,
          brand_id,
          image_url,
          notes,
          category:categories(id, name),
          variants:product_variants(
            id,
            sku,
            barcode,
            retail_price,
            purchase_price,
            average_cost,
            wholesale_price,
            special_price,
            minimum_price,
            commission_percentage,
            default_discount_percentage,
            colour,
            attributes,
            is_default,
            is_active
          )
        `, { count: 'exact' })

      if (categoryFilter !== 'all') {
        query = query.eq('category_id', categoryFilter)
      }
      if (statusFilter !== 'all') {
        query = query.eq('product_status', statusFilter)
      }
      if (search.trim()) {
        const s = search.trim().replaceAll(',', ' ').replaceAll('%', '\\%')
        query = query.or(`product_code.ilike.%${s}%,name.ilike.%${s}%`)
      }

      if (sortBy === 'newest') query = query.order('created_at', { ascending: false })
      else if (sortBy === 'oldest') query = query.order('created_at', { ascending: true })
      else if (sortBy === 'name_asc') query = query.order('name', { ascending: true })
      else if (sortBy === 'code_asc') query = query.order('product_code', { ascending: true })

      const from = (page - 1) * pageSize
      query = query.range(from, from + pageSize - 1)

      const { data, count, error } = await query
      if (!error && data && data.length > 0) {
        // Also combine any locally created products that haven't synced to DB yet
        const localList = getStoredProductsList()
        const dbIds = new Set(data.map((r: { id: string }) => r.id))
        const unSyncedLocal = localList.filter(l => !dbIds.has(l.id) && l.id.startsWith('prod-'))

        let combined = [...(data as ProductRowItem[]), ...unSyncedLocal]
        if (categoryFilter !== 'all') {
          combined = combined.filter(c => c.category_id === categoryFilter)
        }
        if (statusFilter !== 'all') {
          combined = combined.filter(c => c.product_status === statusFilter)
        }
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          combined = combined.filter(c => c.name.toLowerCase().includes(q) || c.product_code.toLowerCase().includes(q))
        }

        return {
          rows: combined.slice(0, pageSize),
          count: (count ?? data.length) + unSyncedLocal.length,
        }
      }
    } catch {
      // Backend error (401 / offline / network) -> fallback to local storage
    }
  }

  // Local fallback
  let list = getStoredProductsList()

  if (categoryFilter !== 'all') {
    list = list.filter(r => r.category_id === categoryFilter)
  }
  if (statusFilter !== 'all') {
    list = list.filter(r => r.product_status === statusFilter)
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    list = list.filter(r => r.name.toLowerCase().includes(q) || r.product_code.toLowerCase().includes(q))
  }

  if (sortBy === 'newest') list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  else if (sortBy === 'oldest') list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  else if (sortBy === 'name_asc') list.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortBy === 'code_asc') list.sort((a, b) => a.product_code.localeCompare(b.product_code))

  const total = list.length
  const from = (page - 1) * pageSize
  const paged = list.slice(from, from + pageSize)

  return {
    rows: paged,
    count: total,
  }
}

export interface CreateProductInput {
  product: {
    product_code: string
    name: string
    category_id: string
    brand_id?: string | null
    base_unit_id?: string | null
    product_status?: string
    has_variants?: boolean
    track_stock?: boolean
    allow_negative_stock?: boolean
    minimum_stock?: number
    reorder_level?: number
    default_warranty_days?: number
    preferred_vendor_id?: string | null
    image_url?: string | null
    notes?: string | null
  }
  variant: {
    sku: string
    barcode?: string | null
    variant_name?: string
    retail_price?: number
    wholesale_price?: number
    purchase_price?: number
    average_cost?: number
    special_price?: number
    minimum_price?: number
    commission_percentage?: number
    default_discount_percentage?: number
    colour?: string | null
    attributes?: Record<string, unknown>
  }
}

export async function saveNewProduct(input: CreateProductInput): Promise<string> {
  let createdId = `prod-${Date.now()}`
  const variantId = `pv-${Date.now()}`

  if (!isBackendOffline()) {
    try {
      const { data, error } = await (requireSupabase().rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)('create_product_with_default_variant', {
        p_product: input.product as unknown as Record<string, unknown>,
        p_variant: input.variant as unknown as Record<string, unknown>,
      })
      if (!error && typeof data === 'string' && data) {
        createdId = data
      }
    } catch {
      // fallback to local save
    }
  }

  const list = getStoredProductsList()
  const matchedCat = MOCK_CATEGORIES.find(c => c.id === input.product.category_id)
  const newProductRow: ProductRowItem = {
    id: createdId,
    product_code: input.product.product_code,
    name: input.product.name,
    product_status: input.product.product_status || 'active',
    created_at: new Date().toISOString(),
    category_id: input.product.category_id,
    brand_id: input.product.brand_id || null,
    base_unit_id: input.product.base_unit_id || null,
    preferred_vendor_id: input.product.preferred_vendor_id || null,
    minimum_stock: input.product.minimum_stock || 0,
    reorder_level: input.product.reorder_level || 0,
    image_url: input.product.image_url || null,
    notes: input.product.notes || null,
    category: {
      id: input.product.category_id,
      name: matchedCat?.name || 'General Category',
    },
    variants: [{
      id: variantId,
      sku: input.variant.sku,
      barcode: input.variant.barcode || null,
      retail_price: input.variant.retail_price || 0,
      purchase_price: input.variant.purchase_price || 0,
      average_cost: input.variant.average_cost || 0,
      wholesale_price: input.variant.wholesale_price || 0,
      special_price: input.variant.special_price || 0,
      minimum_price: input.variant.minimum_price || 0,
      commission_percentage: input.variant.commission_percentage || 0,
      default_discount_percentage: input.variant.default_discount_percentage || 0,
      colour: input.variant.colour || null,
      attributes: input.variant.attributes || {},
      is_default: true,
      is_active: true,
    }],
  }

  list.unshift(newProductRow)
  saveStoredProductsList(list)

  return createdId
}

export async function updateProductDetails(
  id: string,
  productUpdates: Record<string, unknown>,
  variantUpdates?: Record<string, unknown>
): Promise<void> {
  if (!isBackendOffline()) {
    try {
      await requireSupabase().from('products').update(productUpdates as never).eq('id', id)
      if (variantUpdates) {
        const { data: vars } = await requireSupabase().from('product_variants').select('id').eq('product_id', id).limit(1)
        if (vars && vars[0]) {
          await requireSupabase().from('product_variants').update(variantUpdates as never).eq('id', (vars[0] as { id: string }).id)
        }
      }
    } catch {
      // Continue to local update
    }
  }

  const list = getStoredProductsList()
  const idx = list.findIndex(p => p.id === id)
  const existing = idx !== -1 ? list[idx] : undefined
  if (existing && idx !== -1) {
    const updatedProd: ProductRowItem = {
      ...existing,
      ...productUpdates,
      id: existing.id,
      product_code: typeof productUpdates.product_code === 'string' ? productUpdates.product_code : existing.product_code,
      name: typeof productUpdates.name === 'string' ? productUpdates.name : existing.name,
      product_status: typeof productUpdates.product_status === 'string' ? productUpdates.product_status : existing.product_status,
      created_at: existing.created_at,
      category_id: typeof productUpdates.category_id === 'string' ? productUpdates.category_id : existing.category_id,
      brand_id: productUpdates.brand_id !== undefined ? (productUpdates.brand_id as string | null) : existing.brand_id,
      image_url: productUpdates.image_url !== undefined ? (productUpdates.image_url as string | null) : existing.image_url,
    } as ProductRowItem

    if (variantUpdates && updatedProd.variants && updatedProd.variants.length > 0) {
      const existingVar = updatedProd.variants[0]
      if (existingVar) {
        updatedProd.variants[0] = {
          ...existingVar,
          ...variantUpdates,
          id: existingVar.id,
          sku: typeof variantUpdates.sku === 'string' ? variantUpdates.sku : existingVar.sku,
          barcode: variantUpdates.barcode !== undefined ? (variantUpdates.barcode as string | null) : existingVar.barcode,
          retail_price: typeof variantUpdates.retail_price === 'number' ? variantUpdates.retail_price : existingVar.retail_price,
          purchase_price: typeof variantUpdates.purchase_price === 'number' ? variantUpdates.purchase_price : existingVar.purchase_price,
          average_cost: typeof variantUpdates.average_cost === 'number' ? variantUpdates.average_cost : existingVar.average_cost,
          is_default: existingVar.is_default,
          is_active: typeof variantUpdates.is_active === 'boolean' ? variantUpdates.is_active : existingVar.is_active,
        } as ProductVariantItem
      }
    }
    list[idx] = updatedProd
    saveStoredProductsList(list)
  }
}

export async function setProductStatus(id: string, active: boolean): Promise<void> {
  const status = active ? 'active' : 'inactive'
  if (!isBackendOffline()) {
    try {
      await requireSupabase().from('products').update({ product_status: status } as never).eq('id', id)
    } catch { }
  }
  const list = getStoredProductsList()
  const p = list.find(x => x.id === id)
  if (p) {
    p.product_status = status
    saveStoredProductsList(list)
  }
}

export async function listProducts(): Promise<Product[]> {
  const { rows } = await listProductsFiltered({
    page: 1,
    pageSize: 1000,
    sortBy: 'name_asc',
    categoryFilter: 'all',
    statusFilter: 'all',
    search: '',
  })
  return rows as unknown as Product[]
}