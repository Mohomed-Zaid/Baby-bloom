import type { Company } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function getCurrentCompany(): Promise<Company | null> {
  const { data, error } = await requireSupabase().from('companies').select('*').limit(1).maybeSingle()
  throwOnError(error)
  return data
}