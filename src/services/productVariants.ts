import type { ProductVariant } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

/** Reads the cost-masking view; cost fields are null without products.view_cost. */
export async function listProductVariants(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await requireSupabase().from('product_variants_secure').select('*').eq('product_id', productId).order('variant_name')
  throwOnError(error)
  return data ?? []
}