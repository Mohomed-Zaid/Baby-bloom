import type { Bank, BankAccount, BankBranch } from '../types/domain'
import { requireSupabase, throwOnError } from './client'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_BRANCHES, MOCK_BANK_ACCOUNTS } from './mockData'
import { currentCompanyId } from './masterData'

const db = () => requireSupabase() as any

const isUuid = (str: string | null | undefined): boolean =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str))

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

const STORAGE_KEY = 'bb_bank_accounts_list'

export function getStoredBankAccountsList(): BankAccountRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as BankAccountRow[]
    }
  } catch { }

  const defaultCompanyId = 'company-babybloom'
  const seed: BankAccountRow[] = MOCK_BANK_ACCOUNTS.map((a, i) => ({
    id: a.id,
    company_id: defaultCompanyId,
    branch_id: 'branch-colombo',
    bank_id: `bank-${i + 1}`,
    bank_branch_id: null,
    account_name: a.account_name,
    account_number: a.account_number,
    account_kind: 'Current',
    opening_balance: a.current_balance,
    ledger_account_id: null,
    is_default: i === 0,
    is_active: a.is_active,
    created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    created_by: null,
    updated_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    updated_by: null,
    deleted_at: null,
    bank_name: a.bank_name,
    bank_code: a.bank_name.includes('Commercial') ? 'COMB' : a.bank_name.includes('Hatton') ? 'HNB' : 'SAMP',
    bank_branch_name: a.branch_name,
    branch_name: 'Main Flagship Store - Colombo 03',
  }))

  saveStoredBankAccountsList(seed)
  return seed
}

export function saveStoredBankAccountsList(list: BankAccountRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { }
}

export const MOCK_BANKS_DEFAULT: Bank[] = [
  { id: 'bank-comb', company_id: null, bank_code: 'COMB', name: 'Commercial Bank of Ceylon', is_active: true, created_at: new Date().toISOString() },
  { id: 'bank-hnb', company_id: null, bank_code: 'HNB', name: 'Hatton National Bank', is_active: true, created_at: new Date().toISOString() },
  { id: 'bank-sampath', company_id: null, bank_code: 'SAMP', name: 'Sampath Bank PLC', is_active: true, created_at: new Date().toISOString() },
  { id: 'bank-boc', company_id: null, bank_code: 'BOC', name: 'Bank of Ceylon', is_active: true, created_at: new Date().toISOString() },
  { id: 'bank-ntb', company_id: null, bank_code: 'NTB', name: 'Nations Trust Bank', is_active: true, created_at: new Date().toISOString() },
]

export const MOCK_BANK_BRANCHES_DEFAULT: BankBranch[] = [
  { id: 'bbr-comb-col', company_id: null, bank_id: 'bank-comb', branch_code: '001', name: 'Kollupitiya Branch', address: 'Galle Road, Colombo 03', phone: '+94 11 230 0000', is_active: true, created_at: new Date().toISOString() },
  { id: 'bbr-hnb-fort', company_id: null, bank_id: 'bank-hnb', branch_code: '002', name: 'Colombo Fort Branch', address: 'York Street, Colombo 01', phone: '+94 11 240 0000', is_active: true, created_at: new Date().toISOString() },
  { id: 'bbr-samp-bamba', company_id: null, bank_id: 'bank-sampath', branch_code: '003', name: 'Bambalapitiya Branch', address: 'Galle Road, Colombo 04', phone: '+94 11 250 0000', is_active: true, created_at: new Date().toISOString() },
]

// ── Company Context Helper ──────────────────────────────────────────────────
async function resolveCompanyId(): Promise<string> {
  const supabase = db()
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id

  if (currentUserId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', currentUserId)
        .maybeSingle()

      if (profile && (profile as any).company_id) return (profile as any).company_id as string
    } catch {
      // ignore
    }
  }

  return currentCompanyId()
}

// ── Simple Dropdown Lookups (Existing Backward Compatibility) ───────────────
export async function listBanks(activeOnly = true): Promise<Bank[]> {
  if (!isBackendOffline()) {
    try {
      let q = db().from('banks').select('*').order('name')
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (!error && data && data.length > 0) return data as Bank[]
    } catch {
      // fallback
    }
  }
  return MOCK_BANKS_DEFAULT.filter(b => !activeOnly || b.is_active)
}

export async function listBankBranches(bankId?: string, activeOnly = true): Promise<BankBranch[]> {
  if (!isBackendOffline() && (!bankId || isUuid(bankId))) {
    try {
      let q = db().from('bank_branches').select('*').order('name')
      if (bankId) q = q.eq('bank_id', bankId)
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (!error && data && data.length > 0) return data as BankBranch[]
    } catch {
      // fallback
    }
  }
  let list = MOCK_BANK_BRANCHES_DEFAULT.filter(b => !activeOnly || b.is_active)
  if (bankId) list = list.filter(b => b.bank_id === bankId)
  return list
}

export async function listBankAccounts(branchId?: string, activeOnly = true): Promise<BankAccountRow[]> {
  const storeBranches = await listBranchesForBanking()
  const branchMap = new Map<string, string>()
  storeBranches.forEach(b => branchMap.set(b.id, b.name))
  MOCK_BRANCHES.forEach(b => branchMap.set(b.id, b.name))

  if (!isBackendOffline()) {
    try {
      let q = db()
        .from('bank_accounts')
        .select(`
          *,
          banks:bank_id(name, bank_code),
          bank_branches:bank_branch_id(name)
        `)
        .is('deleted_at', null)
        .order('account_name')

      if (branchId && isUuid(branchId)) q = q.eq('branch_id', branchId)
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (!error && data && data.length > 0) {
        return ((data ?? []) as any[]).map(raw => ({
          ...raw,
          bank_name: raw.banks?.name || 'Unknown Bank',
          bank_code: raw.banks?.bank_code || '',
          bank_branch_name: raw.bank_branches?.name || 'Main Branch',
          branch_name: branchMap.get(raw.branch_id) || raw.branch_name || 'Main Flagship Store - Colombo 03',
          account_kind: raw.account_kind || raw.account_type || 'Current',
        })) as BankAccountRow[]
      }
    } catch {
      // fallback
    }
  }

  let list = getStoredBankAccountsList()
  if (activeOnly) list = list.filter(a => a.is_active)
  if (branchId) list = list.filter(a => a.branch_id === branchId)
  return list.map(a => ({
    ...a,
    branch_name: branchMap.get(a.branch_id) || a.branch_name || 'Main Flagship Store - Colombo 03',
  }))
}

export async function listBranchesForBanking(): Promise<BankingBranchOption[]> {
  if (isBackendOffline()) {
    return MOCK_BRANCHES.map(b => ({ id: b.id, name: b.name, is_head_office: true }))
  }
  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) {
    return MOCK_BRANCHES.map(b => ({ id: b.id, name: b.name, is_head_office: true }))
  }

  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, is_head_office')
      .eq('is_active', true)
      .order('is_head_office', { ascending: false })
      .order('name', { ascending: true })
    if (!error && data) return data as BankingBranchOption[]
  } catch {
    // fallback
  }
  return MOCK_BRANCHES.map(b => ({ id: b.id, name: b.name, is_head_office: true }))
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
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  const storeBranches = await listBranchesForBanking()
  const branchMap = new Map<string, string>()
  storeBranches.forEach(b => branchMap.set(b.id, b.name))
  MOCK_BRANCHES.forEach(b => branchMap.set(b.id, b.name))

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      let q = supabase
        .from('bank_accounts')
        .select(`
          *,
          banks:bank_id(name, bank_code),
          bank_branches:bank_branch_id(name)
        `, { count: 'exact' })
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('account_name', { ascending: true })

      if (params.branchId && isUuid(params.branchId)) {
        q = q.eq('branch_id', params.branchId)
      }

      if (params.bankId && isUuid(params.bankId)) {
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

      const { data, error, count: dbCount } = await q
      if (!error && data && data.length > 0) {
        const localList = getStoredBankAccountsList()
        const dbIds = new Set(data.map((r: { id: string }) => r.id))
        const unSyncedLocal = localList.filter((l) => !dbIds.has(l.id))

        let combined = [...(data as any[]), ...unSyncedLocal]
        if (params.status === 'active') combined = combined.filter((c) => c.is_active)
        else if (params.status === 'inactive') combined = combined.filter((c) => !c.is_active)
        if (params.branchId) combined = combined.filter((c) => c.branch_id === params.branchId)
        if (params.bankId) combined = combined.filter((c) => c.bank_id === params.bankId)
        if (params.search?.trim()) {
          const s = params.search.trim().toLowerCase()
          combined = combined.filter(
            (c) =>
              (c.account_name && c.account_name.toLowerCase().includes(s)) ||
              (c.account_number && c.account_number.toLowerCase().includes(s))
          )
        }

        const total = Math.max(dbCount ?? 0, combined.length)
        const paged = combined.slice(from, to + 1).map((raw) => ({
          ...raw,
          bank_name: raw.banks?.name || raw.bank_name || 'Commercial Bank',
          bank_code: raw.banks?.bank_code || raw.bank_code || 'COMB',
          bank_branch_name: raw.bank_branches?.name || raw.bank_branch_name || 'Main Branch',
          branch_name: branchMap.get(raw.branch_id) || raw.branch_name || 'Main Flagship Store - Colombo 03',
          account_kind: raw.account_kind || raw.account_type || 'Current',
        })) as BankAccountRow[]

        return { rows: paged, count: total }
      }
    } catch {
      // fallback to local storage
    }
  }

  // Fallback to local storage
  let list = getStoredBankAccountsList()
  if (params.status === 'active') {
    list = list.filter((a) => a.is_active)
  } else if (params.status === 'inactive') {
    list = list.filter((a) => !a.is_active)
  }

  if (params.branchId) {
    list = list.filter((a) => a.branch_id === params.branchId)
  }

  if (params.bankId) {
    list = list.filter((a) => a.bank_id === params.bankId)
  }

  if (params.search?.trim()) {
    const s = params.search.trim().toLowerCase()
    list = list.filter(
      (a) =>
        a.account_name.toLowerCase().includes(s) ||
        a.account_number.toLowerCase().includes(s)
    )
  }

  const total = list.length
  const from = (page - 1) * pageSize
  const paged = list.slice(from, from + pageSize).map((a) => ({
    ...a,
    branch_name: branchMap.get(a.branch_id) || a.branch_name || 'Main Flagship Store - Colombo 03',
  }))

  return { rows: paged, count: total }
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
  const localList = getStoredBankAccountsList()
  const companyId = await resolveCompanyId()
  const kind = input.account_kind || 'Current'

  let createdId = `bank-acc-${Date.now()}`
  let dbRow: BankAccount | null = null

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const { data: userData } = await supabase.auth.getUser()
      const currentUserId = userData?.user?.id

      if (input.is_default && isUuid(input.branch_id) && isUuid(companyId)) {
        await supabase
          .from('bank_accounts')
          .update({ is_default: false })
          .eq('branch_id', input.branch_id)
          .eq('company_id', companyId)
      }

      if (isUuid(input.branch_id) && isUuid(input.bank_id) && isUuid(companyId)) {
        const payload: Record<string, unknown> = {
          company_id: companyId,
          branch_id: input.branch_id,
          bank_id: input.bank_id,
          bank_branch_id: input.bank_branch_id && isUuid(input.bank_branch_id) ? input.bank_branch_id : null,
          account_name: input.account_name.trim(),
          account_number: input.account_number.trim(),
          account_kind: kind,
          opening_balance: Number(input.opening_balance || 0),
          ledger_account_id: input.ledger_account_id && isUuid(input.ledger_account_id) ? input.ledger_account_id : null,
          is_default: input.is_default ?? false,
          is_active: input.is_active ?? true,
        }
        if (currentUserId && isUuid(currentUserId)) {
          payload.created_by = currentUserId
        }

        let { data, error } = await supabase
          .from('bank_accounts')
          .insert(payload)
          .select()
          .single()

        // If schema doesn't have created_by, retry without it
        if (error && error.message?.includes('created_by')) {
          delete payload.created_by
          const retry = await supabase.from('bank_accounts').insert(payload).select().single()
          data = retry.data
          error = retry.error
        }

        // If schema has account_type instead of account_kind, retry with account_type
        if (error && (error.message?.includes('account_kind') || error.message?.includes('account_type'))) {
          delete payload.account_kind
          payload.account_type = kind
          const retry = await supabase.from('bank_accounts').insert(payload).select().single()
          data = retry.data
          error = retry.error
        }

        if (!error && data) {
          dbRow = data as unknown as BankAccount
          createdId = data.id
        }
      }
    } catch {
      // Continue to local save
    }
  }

  const allBanks = await listBanks(false)
  const bank = allBanks.find((b) => b.id === input.bank_id)
  const storeBranches = await listBranchesForBanking()
  const branchName = storeBranches.find((b) => b.id === input.branch_id)?.name || 'Main Flagship Store - Colombo 03'

  if (input.is_default) {
    localList.forEach((a) => {
      if (a.branch_id === input.branch_id) a.is_default = false
    })
  }

  const newRow: BankAccountRow = {
    id: createdId,
    company_id: dbRow?.company_id || companyId || 'company-babybloom',
    branch_id: input.branch_id,
    bank_id: input.bank_id,
    bank_branch_id: input.bank_branch_id || null,
    account_name: input.account_name.trim(),
    account_number: input.account_number.trim(),
    account_kind: kind,
    opening_balance: Number(input.opening_balance || 0),
    ledger_account_id: input.ledger_account_id || null,
    is_default: input.is_default ?? false,
    is_active: input.is_active ?? true,
    created_at: dbRow?.created_at || new Date().toISOString(),
    created_by: dbRow?.created_by || null,
    updated_at: dbRow?.updated_at || new Date().toISOString(),
    updated_by: dbRow?.updated_by || null,
    deleted_at: null,
    bank_name: bank?.name || 'Commercial Bank of Ceylon',
    bank_code: bank?.bank_code || 'COMB',
    bank_branch_name: 'Main Branch',
    branch_name: branchName,
  }

  localList.unshift(newRow)
  saveStoredBankAccountsList(localList)

  return newRow as unknown as BankAccount
}

export async function updateBankAccount(id: string, input: Partial<CreateBankAccountInput>): Promise<BankAccount> {
  const companyId = await resolveCompanyId()

  if (!isBackendOffline() && isUuid(id)) {
    try {
      const supabase = db()
      const { data: userData } = await supabase.auth.getUser()
      const currentUserId = userData?.user?.id

      if (input.is_default && input.branch_id && isUuid(input.branch_id) && isUuid(companyId)) {
        await supabase
          .from('bank_accounts')
          .update({ is_default: false })
          .eq('branch_id', input.branch_id)
          .eq('company_id', companyId)
          .neq('id', id)
      }

      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (currentUserId && isUuid(currentUserId)) {
        payload.updated_by = currentUserId
      }

      if (input.branch_id !== undefined && isUuid(input.branch_id)) payload.branch_id = input.branch_id
      if (input.bank_id !== undefined && isUuid(input.bank_id)) payload.bank_id = input.bank_id
      if (input.bank_branch_id !== undefined) payload.bank_branch_id = (input.bank_branch_id && isUuid(input.bank_branch_id)) ? input.bank_branch_id : null
      if (input.account_name !== undefined) payload.account_name = input.account_name.trim()
      if (input.account_number !== undefined) payload.account_number = input.account_number.trim()
      if (input.account_kind !== undefined) {
        payload.account_kind = input.account_kind
      }
      if (input.opening_balance !== undefined) payload.opening_balance = Number(input.opening_balance || 0)
      if (input.ledger_account_id !== undefined) payload.ledger_account_id = (input.ledger_account_id && isUuid(input.ledger_account_id)) ? input.ledger_account_id : null
      if (input.is_default !== undefined) payload.is_default = input.is_default
      if (input.is_active !== undefined) payload.is_active = input.is_active

      let { error } = await supabase.from('bank_accounts').update(payload).eq('id', id)
      if (error && error.message?.includes('account_kind')) {
        delete payload.account_kind
        payload.account_type = input.account_kind
        await supabase.from('bank_accounts').update(payload).eq('id', id)
      }
    } catch {
      // Continue to local update
    }
  }

  const list = getStoredBankAccountsList()
  const idx = list.findIndex((a) => a.id === id)
  if (idx !== -1 && list[idx]) {
    const existing = list[idx]
    if (input.is_default && (input.branch_id || existing.branch_id)) {
      const effBranch = input.branch_id || existing.branch_id
      list.forEach((a) => {
        if (a.branch_id === effBranch) a.is_default = false
      })
    }

    const updated: BankAccountRow = {
      ...existing,
      branch_id: input.branch_id !== undefined ? input.branch_id : existing.branch_id,
      bank_id: input.bank_id !== undefined ? input.bank_id : existing.bank_id,
      bank_branch_id: input.bank_branch_id !== undefined ? (input.bank_branch_id || null) : existing.bank_branch_id,
      account_name: input.account_name !== undefined ? input.account_name.trim() : existing.account_name,
      account_number: input.account_number !== undefined ? input.account_number.trim() : existing.account_number,
      account_kind: input.account_kind !== undefined ? input.account_kind : existing.account_kind,
      opening_balance: input.opening_balance !== undefined ? Number(input.opening_balance) : existing.opening_balance,
      ledger_account_id: input.ledger_account_id !== undefined ? (input.ledger_account_id || null) : existing.ledger_account_id,
      is_default: input.is_default !== undefined ? input.is_default : existing.is_default,
      is_active: input.is_active !== undefined ? input.is_active : existing.is_active,
      updated_at: new Date().toISOString(),
    }
    list[idx] = updated
    saveStoredBankAccountsList(list)
    return updated as unknown as BankAccount
  }

  return {
    id,
    company_id: 'company-babybloom',
    branch_id: input.branch_id || 'branch-colombo',
    bank_id: input.bank_id || 'bank-1',
    bank_branch_id: input.bank_branch_id || null,
    account_name: input.account_name || 'Bank Account',
    account_number: input.account_number || '',
    account_kind: input.account_kind || 'Current',
    opening_balance: Number(input.opening_balance || 0),
    ledger_account_id: input.ledger_account_id || null,
    is_default: input.is_default ?? false,
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
    created_by: null,
    updated_at: new Date().toISOString(),
    updated_by: null,
    deleted_at: null,
  } as BankAccount
}

export async function toggleBankAccountStatus(id: string, currentStatus: boolean): Promise<BankAccount> {
  return updateBankAccount(id, { is_active: !currentStatus })
}

export async function setDefaultBankAccount(id: string, branchId: string): Promise<void> {
  const companyId = await resolveCompanyId()

  if (!isBackendOffline() && isUuid(id) && isUuid(branchId) && isUuid(companyId)) {
    try {
      const supabase = db()
      await supabase
        .from('bank_accounts')
        .update({ is_default: false })
        .eq('branch_id', branchId)
        .eq('company_id', companyId)

      await supabase
        .from('bank_accounts')
        .update({ is_default: true })
        .eq('id', id)
    } catch { }
  }

  const list = getStoredBankAccountsList()
  list.forEach((a) => {
    if (a.branch_id === branchId) a.is_default = a.id === id
  })
  saveStoredBankAccountsList(list)
}

export async function deleteBankAccount(id: string): Promise<void> {
  if (!isBackendOffline() && isUuid(id)) {
    try {
      const supabase = db()
      await supabase
        .from('bank_accounts')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
    } catch { }
  }

  const list = getStoredBankAccountsList()
  const filtered = list.filter((a) => a.id !== id)
  saveStoredBankAccountsList(filtered)
}