import { supabase } from '../lib/supabase'

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Set the public URL and anonymous key environment variables.')
  return supabase
}

export function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export async function checkDataConnection(): Promise<{ connected: boolean; companyId: string | null }> {
  const { data, error } = await requireSupabase().rpc('current_user_company_id')
  throwOnError(error)
  return { connected: true, companyId: data }
}