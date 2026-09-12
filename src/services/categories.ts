import type { Category } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await requireSupabase().from('categories').select('*').order('name')
  throwOnError(error)
  return data ?? []
}