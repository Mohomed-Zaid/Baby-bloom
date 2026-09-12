import type { Warehouse } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listWarehouses(branchId: string): Promise<Warehouse[]> {
  const { data, error } = await requireSupabase().from('warehouses').select('*').eq('branch_id', branchId).order('name')
  throwOnError(error)
  return data ?? []
}