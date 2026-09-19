import type { ProductVariant } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export interface ProductVariantWithStock extends ProductVariant {
  quantity_on_hand?: number
  available_quantity?: number
}

/** Reads the cost-masking view and joins company stock levels per variant. */
export async function listProductVariants(productId: string): Promise<ProductVariantWithStock[]> {
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

  throwOnError(variantsRes.error)
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