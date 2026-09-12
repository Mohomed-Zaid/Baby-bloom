import type { Bank, BankAccount, BankBranch } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listBanks(): Promise<Bank[]> {
  const { data, error } = await requireSupabase().from('banks').select('*').order('name')
  throwOnError(error)
  return data ?? []
}
export async function listBankBranches(bankId: string): Promise<BankBranch[]> {
  const { data, error } = await requireSupabase().from('bank_branches').select('*').eq('bank_id', bankId).order('name')
  throwOnError(error)
  return data ?? []
}
export async function listBankAccounts(branchId: string): Promise<BankAccount[]> {
  const { data, error } = await requireSupabase().from('bank_accounts').select('*').eq('branch_id', branchId).order('account_name')
  throwOnError(error)
  return data ?? []
}