import type { Unit } from '../types/domain'
import { requireSupabase } from './client'
import { MOCK_UNITS } from './mockData'
import { isBackendOffline } from '../lib/supabase'

export async function listUnits(): Promise<Unit[]> {
  if (!isBackendOffline()) {
    try {
      const { data, error } = await requireSupabase().from('units').select('*').order('name')
      if (!error && data && data.length > 0) return data as Unit[]
    } catch {
      // fallback to mock units
    }
  }

  return MOCK_UNITS.map(u => ({
    id: u.id,
    company_id: 'company-babybloom',
    code: u.code,
    name: u.name,
    symbol: u.symbol,
    decimal_places: 0,
    is_active: u.is_active,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
}