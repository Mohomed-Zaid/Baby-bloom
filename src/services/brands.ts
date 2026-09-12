import type { Brand } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listBrands(): Promise<Brand[]> {
  const { data, error } = await requireSupabase().from('brands').select('*').order('name')
  throwOnError(error)
  return data ?? []
}