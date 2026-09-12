import type { Vendor } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listVendors(branchId?: string): Promise<Vendor[]> {
  let query = requireSupabase().from('vendors').select('*').order('name')
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  throwOnError(error)
  return data ?? []
}