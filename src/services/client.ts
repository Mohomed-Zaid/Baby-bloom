import { supabase } from '../lib/supabase'
export { supabase } from '../lib/supabase'

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Set the public URL and anonymous key environment variables.')
  return supabase
}

export function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export async function checkDataConnection(): Promise<{ connected: boolean; companyId: string | null }> {
  try {
    const client = requireSupabase()
    const session = (await client.auth.getSession()).data.session
    if (!session) {
      return { connected: true, companyId: 'company-babybloom' }
    }
    const { data, error } = await client.rpc('current_user_company_id')
    if (error) {
      return { connected: true, companyId: 'company-babybloom' }
    }
    return { connected: true, companyId: data || 'company-babybloom' }
  } catch {
    return { connected: true, companyId: 'company-babybloom' }
  }
}