import type { Branch } from '../types/domain'
import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_BRANCHES } from './mockData'

export async function listBranches(): Promise<Branch[]> {
  if (isBackendOffline()) return MOCK_BRANCHES as unknown as Branch[]
  const supabase = requireSupabase()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) return MOCK_BRANCHES as unknown as Branch[]

  try {
    const { data, error } = await supabase.from('branches').select('*').order('is_head_office', { ascending: false }).order('name')
    if (!error && data) return data
  } catch {
    // fallback
  }
  return MOCK_BRANCHES as unknown as Branch[]
}