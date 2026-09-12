import type { Branch } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listBranches(): Promise<Branch[]> {
  const { data, error } = await requireSupabase().from('branches').select('*').order('is_head_office', { ascending: false }).order('name')
  throwOnError(error)
  return data ?? []
}