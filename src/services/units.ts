import type { Unit } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listUnits(): Promise<Unit[]> {
  const { data, error } = await requireSupabase().from('units').select('*').order('name')
  throwOnError(error)
  return data ?? []
}