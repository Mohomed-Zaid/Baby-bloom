import type { ProductVariant } from '../types/domain'
import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { getStoredProductsList } from './products'
import { MOCK_PRODUCTS } from './mockData'

export interface ProductVariantWithStock extends ProductVariant {
  quantity_on_hand?: number
  available_quantity?: number
}

/** Reads the cost-masking view and joins company stock levels per variant, with local fallback. */
export async function listProductVariants(productId: string): Promise<ProductVariantWithStock[]> {
  if (!isBackendOffline()) {
    try {
      const [variantsRes, stockRes] = await Promise.all([
        requireSupabase()
          .from('product_variants_secure')
          .select('*')
          .eq('product_id', productId)
          .order('variant_name'),
        requireSupabase()
          .from('company_stock_summary')
          .select('product_variant_id, quantity_on_hand, available_quantity')
          .eq('product_id', productId),
      ])

      if (!variantsRes.error && variantsRes.data && variantsRes.data.length > 0) {
        const variants = (variantsRes.data ?? []) as ProductVariant[]
        const stockMap = new Map(
          (stockRes.data ?? []).map((s: { product_variant_id: string; quantity_on_hand: number; available_quantity: number }) => [
            s.product_variant_id,
            s,
          ])
        )

        return variants.map((v) => ({
          ...v,
          quantity_on_hand: Number(stockMap.get(v.id)?.quantity_on_hand ?? 0),
          available_quantity: Number(stockMap.get(v.id)?.available_quantity ?? 0),
        }))
      }
    } catch {
      // Fallback
    }
  }

  // 1. Search local stored products list
  const list = getStoredProductsList()
  const prod = list.find((p) => p.id === productId)
  if (prod && prod.variants && prod.variants.length > 0) {
    return prod.variants.map((v) => ({
      id: v.id,
      company_id: 'company-babybloom',
      product_id: prod.id,
      sku: v.sku,
      barcode: v.barcode,
      variant_name: 'Default',
      size: null,
      colour: v.colour || null,
      attributes: (v.attributes || {}) as never,
      purchase_price: v.purchase_price,
      average_cost: v.average_cost,
      retail_price: v.retail_price,
      wholesale_price: v.wholesale_price || Math.round(v.retail_price * 0.85),
      special_price: v.special_price || v.retail_price,
      minimum_price: v.minimum_price || v.purchase_price,
      commission_percentage: v.commission_percentage || 0,
      default_discount_percentage: v.default_discount_percentage || 0,
      is_default: v.is_default,
      is_active: v.is_active,
      created_at: prod.created_at,
      created_by: null,
      updated_at: prod.created_at,
      updated_by: null,
      deleted_at: null,
      quantity_on_hand: 50,
      available_quantity: 50,
    }))
  }

  // 2. Search MOCK_PRODUCTS
  const mockMatches = MOCK_PRODUCTS.filter((m) => m.product_id === productId)
  if (mockMatches.length > 0) {
    return mockMatches.map((m) => ({
      id: m.id,
      company_id: 'company-babybloom',
      product_id: m.product_id,
      sku: m.sku,
      barcode: m.barcode,
      variant_name: m.variant_name,
      size: null,
      colour: null,
      attributes: { unit1: { unit: 'PCS', price: m.retail_price, mrp: m.retail_price } } as never,
      purchase_price: m.cost_price,
      average_cost: m.cost_price,
      retail_price: m.retail_price,
      wholesale_price: Math.round(m.retail_price * 0.85),
      special_price: m.retail_price,
      minimum_price: m.cost_price,
      commission_percentage: 0,
      default_discount_percentage: 0,
      is_default: true,
      is_active: true,
      created_at: new Date().toISOString(),
      created_by: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
      deleted_at: null,
      quantity_on_hand: m.available_quantity,
      available_quantity: m.available_quantity,
    }))
  }

  return []
}