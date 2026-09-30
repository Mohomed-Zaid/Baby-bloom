import type { Bank, BankAccount, BankBranch } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

const db = () => requireSupabase() as any

export interface BankRow extends Bank {
  branches_count?: number
  accounts_count?: number
}

export interface BankBranchRow extends BankBranch {
  bank_name?: string
  bank_code?: string
  accounts_count?: number
}

export interface BankAccountRow extends BankAccount {
  bank_name?: string
  bank_code?: string
  bank_branch_name?: string
  branch_name?: string
  ledger_account_name?: string
}

export interface BankingBranchOption {
  id: string
  name: string
  is_head_office: boolean
}

// ── Company Context Helper ──────────────────────────────────────────────────
async function resolveCompanyId(): Promise<string> {
  const supabase = db()
  try {
    const { data: rpcCompany } = await supabase.rpc('current_user_company_id')
    if (rpcCompany) return rpcCompany as string
  } catch {
    // ignore
  }

  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', currentUserId ?? '')
    .maybeSingle()

  if (profile && (profile as any).company_id) return (profile as any).company_id as string
  throw new Error('Unable to resolve company context.')
}

// ── Simple Dropdown Lookups (Existing Backward Compatibility) ───────────────
export async function listBanks(activeOnly = true): Promise<Bank[]> {
  let q = db().from('banks').select('*').order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  throwOnError(error)
  return (data ?? []) as unknown as Bank[]
}

export async function listBankBranches(bankId?: string, activeOnly = true): Promise<BankBranch[]> {
  let q = db().from('bank_branches').select('*').order('name')
  if (bankId) q = q.eq('bank_id', bankId)
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  throwOnError(error)
  return (data ?? []) as unknown as BankBranch[]
}

export async function listBankAccounts(branchId?: string, activeOnly = true): Promise<BankAccountRow[]> {
  let q = db().from('bank_accounts').select(`
    *,
    banks:bank_id(name, bank_code),
    bank_branches:bank_branch_id(name),
    branches:branch_id(name)
  `).is('deleted_at', null).order('account_name')
  if (branchId) q = q.eq('branch_id', branchId)
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  throwOnError(error)

  return ((data ?? []) as any[]).map(raw => ({
    ...raw,
    bank_name: raw.banks?.name || 'Unknown Bank',
    bank_code: raw.banks?.bank_code || '',
    bank_branch_name: raw.bank_branches?.name || 'Main Branch',
    branch_name: raw.branches?.name || '',
  })) as BankAccountRow[]
}

export async function listBranchesForBanking(): Promise<BankingBranchOption[]> {
  const { data, error } = await db()
    .from('branches')
    .select('id, name, is_head_office')
    .eq('is_active', true)
    .order('is_head_office', { ascending: false })
    .order('name', { ascending: true })
  throwOnError(error)
  return (data ?? []) as BankingBranchOption[]
}

// ── 1. BANKS MASTER PAGINATED & CRUD ─────────────────────────────────────────

export interface ListBanksParams {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  page?: number
  pageSize?: number
}

export async function listBanksPaginated(
  params: ListBanksParams = {}
): Promise<{ rows: BankRow[]; count: number }> {
  const supabase = db()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  let q = supabase
    .from('banks')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })

  if (params.status === 'active') {
    q = q.eq('is_active', true)
  } else if (params.status === 'inactive') {
    q = q.eq('is_active', false)
  }

  if (params.search?.trim()) {
    const s = params.search.trim()
    q = q.or(`name.ilike.%${s}%,bank_code.ilike.%${s}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  q = q.range(from, to)

  const { data, error, count } = await q
  throwOnError(error)

  const bankList = (data ?? []) as Bank[]
  if (bankList.length === 0) {
    return { rows: [], count: count ?? 0 }
  }

  const bankIds = bankList.map(b => b.id)

  // Fetch branch counts per bank
  const { data: branchCounts } = await supabase
    .from('bank_branches')
    .select('bank_id')
    .in('bank_id', bankIds)

  const branchCountMap = new Map<string, number>()
  for (const b of (branchCounts as any[]) || []) {
    branchCountMap.set(b.bank_id, (branchCountMap.get(b.bank_id) ?? 0) + 1)
  }

  // Fetch account counts per bank
  const { data: accountCounts } = await supabase
    .from('bank_accounts')
    .select('bank_id')
    .is('deleted_at', null)
    .in('bank_id', bankIds)

  const accountCountMap = new Map<string, number>()
  for (const a of (accountCounts as any[]) || []) {
    accountCountMap.set(a.bank_id, (accountCountMap.get(a.bank_id) ?? 0) + 1)
  }

  const enriched: BankRow[] = bankList.map(b => ({
    ...b,
    branches_count: branchCountMap.get(b.id) ?? 0,
    accounts_count: accountCountMap.get(b.id) ?? 0,
  }))

  return { rows: enriched, count: count ?? 0 }
}

export interface CreateBankInput {
  bank_code: string
  name: string
  is_active?: boolean
}

export async function createBank(input: CreateBankInput): Promise<Bank> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  const payload = {
    company_id: companyId,
    bank_code: input.bank_code.trim().toUpperCase(),
    name: input.name.trim(),
    is_active: input.is_active ?? true,
  }

  const { data, error } = await supabase
    .from('banks')
    .insert(payload)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as Bank
}

export async function updateBank(id: string, input: Partial<CreateBankInput>): Promise<Bank> {
  const supabase = db()
  const payload: Record<string, unknown> = {}
  if (input.bank_code !== undefined) payload.bank_code = input.bank_code.trim().toUpperCase()
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.is_active !== undefined) payload.is_active = input.is_active

  const { data, error } = await supabase
    .from('banks')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as Bank
}

export async function toggleBankStatus(id: string, currentStatus: boolean): Promise<Bank> {
  return updateBank(id, { is_active: !currentStatus })
}

export async function deleteBank(id: string): Promise<void> {
  const supabase = db()
  // Check if bank has associated branches or accounts
  const { count: branchCount } = await supabase
    .from('bank_branches')
    .select('*', { count: 'exact', head: true })
    .eq('bank_id', id)

  if ((branchCount ?? 0) > 0) {
    throw new Error(`Cannot delete this bank because it has ${branchCount} branch(es) registered. Deactivate it instead.`)
  }

  const { count: accCount } = await supabase
    .from('bank_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('bank_id', id)
    .is('deleted_at', null)

  if ((accCount ?? 0) > 0) {
    throw new Error(`Cannot delete this bank because it has ${accCount} active account(s) linked. Deactivate it instead.`)
  }

  const { error } = await supabase.from('banks').delete().eq('id', id)
  if (error) {
    await toggleBankStatus(id, true)
  }
}

// ── 2. BANK BRANCHES PAGINATED & CRUD ────────────────────────────────────────

export interface ListBankBranchesParams {
  search?: string
  bankId?: string
  status?: 'active' | 'inactive' | 'all'
  page?: number
  pageSize?: number
}

export async function listBankBranchesPaginated(
  params: ListBankBranchesParams = {}
): Promise<{ rows: BankBranchRow[]; count: number }> {
  const supabase = db()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  let q = supabase
    .from('bank_branches')
    .select(`
      *,
      banks:bank_id(name, bank_code)
    `, { count: 'exact' })
    .order('name', { ascending: true })

  if (params.bankId) {
    q = q.eq('bank_id', params.bankId)
  }

  if (params.status === 'active') {
    q = q.eq('is_active', true)
  } else if (params.status === 'inactive') {
    q = q.eq('is_active', false)
  }

  if (params.search?.trim()) {
    const s = params.search.trim()
    q = q.or(`name.ilike.%${s}%,branch_code.ilike.%${s}%,phone.ilike.%${s}%,address.ilike.%${s}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  q = q.range(from, to)

  const { data, error, count } = await q
  throwOnError(error)

  const rows = ((data ?? []) as any[]).map(raw => ({
    ...raw,
    bank_name: raw.banks?.name || 'Unknown Bank',
    bank_code: raw.banks?.bank_code || '',
  })) as BankBranchRow[]

  return { rows, count: count ?? 0 }
}

export interface CreateBankBranchInput {
  bank_id: string
  branch_code: string
  name: string
  address?: string
  phone?: string
  is_active?: boolean
}

export async function createBankBranch(input: CreateBankBranchInput): Promise<BankBranch> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  const payload = {
    company_id: companyId,
    bank_id: input.bank_id,
    branch_code: input.branch_code.trim().toUpperCase(),
    name: input.name.trim(),
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    is_active: input.is_active ?? true,
  }

  const { data, error } = await supabase
    .from('bank_branches')
    .insert(payload)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as BankBranch
}

export async function updateBankBranch(id: string, input: Partial<CreateBankBranchInput>): Promise<BankBranch> {
  const supabase = db()
  const payload: Record<string, unknown> = {}
  if (input.bank_id !== undefined) payload.bank_id = input.bank_id
  if (input.branch_code !== undefined) payload.branch_code = input.branch_code.trim().toUpperCase()
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.address !== undefined) payload.address = input.address.trim() || null
  if (input.phone !== undefined) payload.phone = input.phone.trim() || null
  if (input.is_active !== undefined) payload.is_active = input.is_active

  const { data, error } = await supabase
    .from('bank_branches')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as BankBranch
}

export async function toggleBankBranchStatus(id: string, currentStatus: boolean): Promise<BankBranch> {
  return updateBankBranch(id, { is_active: !currentStatus })
}

export async function deleteBankBranch(id: string): Promise<void> {
  const supabase = db()
  const { count: accCount } = await supabase
    .from('bank_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('bank_branch_id', id)
    .is('deleted_at', null)

  if ((accCount ?? 0) > 0) {
    throw new Error(`Cannot delete this branch because it has ${accCount} active account(s) attached. Deactivate it instead.`)
  }

  const { error } = await supabase.from('bank_branches').delete().eq('id', id)
  if (error) {
    await toggleBankBranchStatus(id, true)
  }
}

// ── 3. BANK ACCOUNTS PAGINATED & CRUD ────────────────────────────────────────

export interface ListBankAccountsParams {
  search?: string
  branchId?: string
  bankId?: string
  status?: 'active' | 'inactive' | 'all'
  page?: number
  pageSize?: number
}

export async function listBankAccountsPaginated(
  params: ListBankAccountsParams = {}
): Promise<{ rows: BankAccountRow[]; count: number }> {
  const supabase = db()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  let q = supabase
    .from('bank_accounts')
    .select(`
      *,
      banks:bank_id(name, bank_code),
      bank_branches:bank_branch_id(name),
      branches:branch_id(name)
    `, { count: 'exact' })
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('account_name', { ascending: true })

  if (params.branchId) {
    q = q.eq('branch_id', params.branchId)
  }

  if (params.bankId) {
    q = q.eq('bank_id', params.bankId)
  }

  if (params.status === 'active') {
    q = q.eq('is_active', true)
  } else if (params.status === 'inactive') {
    q = q.eq('is_active', false)
  }

  if (params.search?.trim()) {
    const s = params.search.trim()
    q = q.or(`account_name.ilike.%${s}%,account_number.ilike.%${s}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  q = q.range(from, to)

  const { data, error, count } = await q
  throwOnError(error)

  const rows = ((data ?? []) as any[]).map(raw => ({
    ...raw,
    bank_name: raw.banks?.name || 'Unknown Bank',
    bank_code: raw.banks?.bank_code || '',
    bank_branch_name: raw.bank_branches?.name || 'General Branch',
    branch_name: raw.branches?.name || '',
    account_kind: raw.account_kind || raw.account_type || 'Current',
  })) as BankAccountRow[]

  return { rows, count: count ?? 0 }
}

export interface CreateBankAccountInput {
  branch_id: string
  bank_id: string
  bank_branch_id?: string
  account_name: string
  account_number: string
  account_kind?: string
  opening_balance?: number
  ledger_account_id?: string
  is_default?: boolean
  is_active?: boolean
}

export async function createBankAccount(input: CreateBankAccountInput): Promise<BankAccount> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id

  // If set as default, unset other defaults in the same store branch
  if (input.is_default) {
    await supabase
      .from('bank_accounts')
      .update({ is_default: false })
      .eq('branch_id', input.branch_id)
      .eq('company_id', companyId)
  }

  const kind = input.account_kind || 'Current'
  const payload: Record<string, unknown> = {
    company_id: companyId,
    branch_id: input.branch_id,
    bank_id: input.bank_id,
    bank_branch_id: input.bank_branch_id || null,
    account_name: input.account_name.trim(),
    account_number: input.account_number.trim(),
    account_kind: kind,
    account_type: kind,
    opening_balance: Number(input.opening_balance || 0),
    ledger_account_id: input.ledger_account_id || null,
    is_default: input.is_default ?? false,
    is_active: input.is_active ?? true,
    created_by: currentUserId,
  }

  const { data, error } = await supabase
    .from('bank_accounts')
    .insert(payload)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as BankAccount
}

export async function updateBankAccount(id: string, input: Partial<CreateBankAccountInput>): Promise<BankAccount> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id

  if (input.is_default && input.branch_id) {
    await supabase
      .from('bank_accounts')
      .update({ is_default: false })
      .eq('branch_id', input.branch_id)
      .eq('company_id', companyId)
      .neq('id', id)
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: currentUserId,
  }

  if (input.branch_id !== undefined) payload.branch_id = input.branch_id
  if (input.bank_id !== undefined) payload.bank_id = input.bank_id
  if (input.bank_branch_id !== undefined) payload.bank_branch_id = input.bank_branch_id || null
  if (input.account_name !== undefined) payload.account_name = input.account_name.trim()
  if (input.account_number !== undefined) payload.account_number = input.account_number.trim()
  if (input.account_kind !== undefined) {
    payload.account_kind = input.account_kind
    payload.account_type = input.account_kind
  }
  if (input.opening_balance !== undefined) payload.opening_balance = Number(input.opening_balance || 0)
  if (input.ledger_account_id !== undefined) payload.ledger_account_id = input.ledger_account_id || null
  if (input.is_default !== undefined) payload.is_default = input.is_default
  if (input.is_active !== undefined) payload.is_active = input.is_active

  const { data, error } = await supabase
    .from('bank_accounts')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as BankAccount
}

export async function toggleBankAccountStatus(id: string, currentStatus: boolean): Promise<BankAccount> {
  return updateBankAccount(id, { is_active: !currentStatus })
}

export async function setDefaultBankAccount(id: string, branchId: string): Promise<void> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  // Unset previous defaults in this store branch
  await supabase
    .from('bank_accounts')
    .update({ is_default: false })
    .eq('branch_id', branchId)
    .eq('company_id', companyId)

  // Set the selected account as default
  const { error } = await supabase
    .from('bank_accounts')
    .update({ is_default: true })
    .eq('id', id)

  throwOnError(error)
}

export async function deleteBankAccount(id: string): Promise<void> {
  const supabase = db()
  // Soft delete to protect financial audit history and RLS restrictions
  const { error } = await supabase
    .from('bank_accounts')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)

  throwOnError(error)
}