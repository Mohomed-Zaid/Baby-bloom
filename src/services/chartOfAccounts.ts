import type { ChartOfAccount } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listChartOfAccounts(): Promise<ChartOfAccount[]> {
  const { data, error } = await requireSupabase().from('chart_of_accounts').select('*').order('account_code')
  throwOnError(error)
  return data ?? []
}