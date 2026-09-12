import type { Product } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await requireSupabase().from('products').select('*').order('name')
  throwOnError(error)
  return data ?? []
}