import type { ChartOfAccount, AccountType, NormalBalance } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

const db = () => requireSupabase() as any

export interface ChartOfAccountNode extends ChartOfAccount {
  children?: ChartOfAccountNode[]
  parent_name?: string
  parent_code?: string
  balance?: number
}

export interface CreateChartAccountInput {
  account_code: string
  account_name: string
  account_type: AccountType
  subtype?: string | null
  normal_balance: NormalBalance
  parent_account_id?: string | null
  is_control_account?: boolean
  is_system_account?: boolean
  allow_manual_entries?: boolean
  is_active?: boolean
}

export interface AccountMappingRow {
  id?: string
  mapping_key: string
  account_id: string
  account_code?: string
  account_name?: string
  account_type?: string
  description?: string
  category?: string
}

export interface AccountLedgerEntry {
  id: string
  entry_date: string
  journal_number: string
  entry_type: string
  description: string | null
  debit: number
  credit: number
}

// ── Standard System Account Mapping Metadata ─────────────────────────────────
export const SYSTEM_MAPPING_DEFINITIONS: Record<
  string,
  { label: string; description: string; expectedType: string; category: string }
> = {
  cash_in_hand: {
    label: 'Cash In Hand',
    description: 'Main cashier cash drawer and daily till balance.',
    expectedType: 'asset',
    category: 'Assets & Cash',
  },
  bank: {
    label: 'Default Bank Clearing Account',
    description: 'Central bank ledger account for reconciliations and electronic receipts.',
    expectedType: 'asset',
    category: 'Assets & Cash',
  },
  accounts_receivable: {
    label: 'Accounts Receivable (Trade Debtors)',
    description: 'Customer credit sales and receivables subledger balance.',
    expectedType: 'asset',
    category: 'Receivables & Advances',
  },
  customer_advances: {
    label: 'Customer Advances (Prepayments)',
    description: 'Prepayments and advance deposits received against customer orders.',
    expectedType: 'liability',
    category: 'Receivables & Advances',
  },
  inventory: {
    label: 'Inventory Asset (Stock Valuation)',
    description: 'Merchandise inventory at landed purchase cost.',
    expectedType: 'asset',
    category: 'Inventory & Purchases',
  },
  cost_of_goods_sold: {
    label: 'Cost of Goods Sold (COGS)',
    description: 'Expensed purchase cost of goods delivered during sales.',
    expectedType: 'cost_of_sales',
    category: 'Inventory & Purchases',
  },
  purchase_returns: {
    label: 'Purchase Returns & Outward Rebates',
    description: 'Vendor returns and purchase cancellations credit ledger.',
    expectedType: 'expense',
    category: 'Inventory & Purchases',
  },
  accounts_payable: {
    label: 'Accounts Payable (Trade Creditors)',
    description: 'Supplier credit balances and unpaid goods received.',
    expectedType: 'liability',
    category: 'Payables & Liabilities',
  },
  supplier_advances: {
    label: 'Supplier Advances',
    description: 'Down payments and deposits remitted to suppliers prior to GRN.',
    expectedType: 'asset',
    category: 'Payables & Liabilities',
  },
  sales_revenue: {
    label: 'Sales Revenue (Turnover)',
    description: 'Gross earned income from retail POS and wholesale invoice sales.',
    expectedType: 'income',
    category: 'Revenue & Income',
  },
  sales_returns: {
    label: 'Sales Returns & Allowances',
    description: 'Contra-revenue account tracking customer refunds and returns.',
    expectedType: 'income',
    category: 'Revenue & Income',
  },
  discounts_allowed: {
    label: 'Discounts Allowed',
    description: 'Cash and promotional discounts given to customers at checkout.',
    expectedType: 'expense',
    category: 'Discounts',
  },
  discounts_received: {
    label: 'Discounts Received',
    description: 'Prompt settlement or vendor discount credits.',
    expectedType: 'income',
    category: 'Discounts',
  },
  expenses: {
    label: 'Operating & Administrative Expenses',
    description: 'Default expense control account for general overheads & petty cash vouchers.',
    expectedType: 'expense',
    category: 'General Operations',
  },
  retained_earnings: {
    label: 'Retained Earnings',
    description: 'Accumulated net profit/loss carried forward.',
    expectedType: 'equity',
    category: 'Equity',
  },
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

  if (profile?.company_id) return profile.company_id as string
  throw new Error('Unable to resolve company context.')
}

// ── 1. List Chart of Accounts (Flat or Hierarchical Tree) ───────────────────
export interface ListChartAccountsParams {
  search?: string
  accountType?: AccountType | 'all'
  activeOnly?: boolean
  buildTree?: boolean
}

export async function listChartOfAccounts(
  params: ListChartAccountsParams = {}
): Promise<ChartOfAccountNode[]> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  let q = supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('account_code', { ascending: true })

  if (params.activeOnly) {
    q = q.eq('is_active', true)
  }

  if (params.accountType && params.accountType !== 'all') {
    q = q.eq('account_type', params.accountType)
  }

  if (params.search?.trim()) {
    const s = params.search.trim()
    q = q.or(`account_code.ilike.%${s}%,account_name.ilike.%${s}%`)
  }

  const { data, error } = await q
  throwOnError(error)

  const accounts = (data ?? []) as ChartOfAccount[]

  // Enrich with parent codes/names
  const accountIdMap = new Map<string, ChartOfAccount>()
  accounts.forEach((a) => accountIdMap.set(a.id, a))

  const enriched: ChartOfAccountNode[] = accounts.map((a) => ({
    ...a,
    parent_name: a.parent_account_id ? accountIdMap.get(a.parent_account_id)?.account_name : undefined,
    parent_code: a.parent_account_id ? accountIdMap.get(a.parent_account_id)?.account_code : undefined,
    children: [],
  }))

  if (!params.buildTree) {
    return enriched
  }

  // Construct hierarchy
  const treeMap = new Map<string, ChartOfAccountNode>()
  enriched.forEach((node) => treeMap.set(node.id, { ...node, children: [] }))

  const rootNodes: ChartOfAccountNode[] = []

  treeMap.forEach((node) => {
    if (node.parent_account_id && treeMap.has(node.parent_account_id)) {
      treeMap.get(node.parent_account_id)?.children?.push(node)
    } else {
      rootNodes.push(node)
    }
  })

  return rootNodes
}

// ── 2. Create Chart of Account ───────────────────────────────────────────────
export async function createChartAccount(input: CreateChartAccountInput): Promise<ChartOfAccount> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  const code = input.account_code.trim()
  const name = input.account_name.trim()

  if (!code) throw new Error('Account code is required.')
  if (!name) throw new Error('Account name is required.')

  // Check unique code
  const { count } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('account_code', code)

  if ((count ?? 0) > 0) {
    throw new Error(`Account code "${code}" already exists in the Chart of Accounts.`)
  }

  // Rule: Control accounts cannot allow manual journal entries
  const isControl = Boolean(input.is_control_account)
  const allowManual = isControl ? false : (input.allow_manual_entries ?? true)

  const payload = {
    company_id: companyId,
    account_code: code,
    account_name: name,
    account_type: input.account_type,
    subtype: input.subtype || null,
    normal_balance: input.normal_balance,
    parent_account_id: input.parent_account_id || null,
    is_control_account: isControl,
    is_system_account: input.is_system_account ?? false,
    allow_manual_entries: allowManual,
    is_active: input.is_active ?? true,
    currency: 'LKR',
  }

  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert(payload)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as ChartOfAccount
}

// ── 3. Update Chart of Account ───────────────────────────────────────────────
export async function updateChartAccount(
  id: string,
  input: Partial<CreateChartAccountInput>
): Promise<ChartOfAccount> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  // Get current account
  const { data: current, error: getError } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  throwOnError(getError)
  if (!current) throw new Error('Account not found.')

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.account_name !== undefined) {
    if (!input.account_name.trim()) throw new Error('Account name cannot be blank.')
    payload.account_name = input.account_name.trim()
  }

  // For non-system accounts, allow updating code, type, normal balance, and parent
  if (!current.is_system_account) {
    if (input.account_code !== undefined) {
      const code = input.account_code.trim()
      if (!code) throw new Error('Account code cannot be blank.')

      if (code !== current.account_code) {
        const { count } = await supabase
          .from('chart_of_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('account_code', code)
          .neq('id', id)

        if ((count ?? 0) > 0) {
          throw new Error(`Account code "${code}" is already in use by another account.`)
        }
      }
      payload.account_code = code
    }

    if (input.account_type !== undefined) payload.account_type = input.account_type
    if (input.subtype !== undefined) payload.subtype = input.subtype || null
    if (input.normal_balance !== undefined) payload.normal_balance = input.normal_balance

    if (input.parent_account_id !== undefined) {
      if (input.parent_account_id === id) {
        throw new Error('An account cannot be its own parent.')
      }
      payload.parent_account_id = input.parent_account_id || null
    }

    if (input.is_control_account !== undefined) {
      payload.is_control_account = input.is_control_account
      if (input.is_control_account) {
        payload.allow_manual_entries = false
      }
    }
  }

  if (input.allow_manual_entries !== undefined && !Boolean(payload.is_control_account ?? current.is_control_account)) {
    payload.allow_manual_entries = input.allow_manual_entries
  }

  if (input.is_active !== undefined) payload.is_active = input.is_active

  const { data, error } = await supabase
    .from('chart_of_accounts')
    .update(payload)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as ChartOfAccount
}

// ── 4. Toggle Chart Account Status ──────────────────────────────────────────
export async function toggleChartAccountStatus(id: string, currentStatus: boolean): Promise<ChartOfAccount> {
  return updateChartAccount(id, { is_active: !currentStatus })
}

// ── 5. Delete Chart Account (with Safeguards) ────────────────────────────────
export async function deleteChartAccount(id: string): Promise<void> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  // 1. Check if it's a protected system account
  const { data: account, error: accErr } = await supabase
    .from('chart_of_accounts')
    .select('is_system_account, account_code, account_name')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  throwOnError(accErr)
  if (account?.is_system_account) {
    throw new Error(
      `Account "${account.account_code} - ${account.account_name}" is a protected core system account and cannot be deleted.`
    )
  }

  // 2. Check for child accounts
  const { count: childCount } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('parent_account_id', id)

  if ((childCount ?? 0) > 0) {
    throw new Error(
      `Cannot delete this account because it has ${childCount} sub-account(s) under it. Reassign or delete child accounts first.`
    )
  }

  // 3. Check if mapped in account_mappings
  const { count: mapCount } = await supabase
    .from('account_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('account_id', id)

  if ((mapCount ?? 0) > 0) {
    throw new Error(
      'Cannot delete this account because it is assigned as an automated system transaction posting destination.'
    )
  }

  // 4. Check if linked to any bank account
  const { count: bankAccCount } = await supabase
    .from('bank_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('ledger_account_id', id)

  if ((bankAccCount ?? 0) > 0) {
    throw new Error(
      `Cannot delete this account because it is linked to ${bankAccCount} business bank account(s).`
    )
  }

  // 5. Check if referenced in journal entry lines
  const { count: journalLinesCount } = await supabase
    .from('journal_entry_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id)

  if ((journalLinesCount ?? 0) > 0) {
    throw new Error(
      `Cannot delete this account because it contains ${journalLinesCount} ledger transaction(s). You can deactivate it instead.`
    )
  }

  const { error } = await supabase
    .from('chart_of_accounts')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  throwOnError(error)
}

// ── 6. Account Mappings Management ──────────────────────────────────────────
export async function listAccountMappings(): Promise<AccountMappingRow[]> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  const { data, error } = await supabase
    .from('account_mappings')
    .select(`
      id,
      mapping_key,
      account_id,
      chart_of_accounts:account_id (
        account_code,
        account_name,
        account_type
      )
    `)
    .eq('company_id', companyId)

  throwOnError(error)

  const existingMap = new Map<string, any>()
  for (const item of (data as any[]) || []) {
    existingMap.set(item.mapping_key, item)
  }

  // Return all predefined system keys, merged with database mappings
  const results: AccountMappingRow[] = Object.keys(SYSTEM_MAPPING_DEFINITIONS).map((key) => {
    const meta = SYSTEM_MAPPING_DEFINITIONS[key] || {
      label: key,
      description: 'System posting key',
      expectedType: 'asset',
      category: 'General',
    }
    const row = existingMap.get(key)
    return {
      id: row?.id,
      mapping_key: key,
      account_id: row?.account_id || '',
      account_code: row?.chart_of_accounts?.account_code || '',
      account_name: row?.chart_of_accounts?.account_name || 'Not Configured',
      account_type: row?.chart_of_accounts?.account_type || meta.expectedType,
      description: meta.description,
      category: meta.category,
    }
  })

  return results
}

export async function saveAccountMapping(
  mapping_key: string,
  account_id: string
): Promise<void> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  if (!account_id) throw new Error('Please select an account.')

  const { error } = await supabase
    .from('account_mappings')
    .upsert(
      {
        company_id: companyId,
        mapping_key,
        account_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id, mapping_key' }
    )

  throwOnError(error)
}

// ── 7. Fetch Recent Account Transactions / Ledger Audit ──────────────────────
export async function fetchAccountLedgerDetails(
  accountId: string
): Promise<AccountLedgerEntry[]> {
  const supabase = db()

  const { data, error } = await supabase
    .from('journal_entry_lines')
    .select(`
      id,
      debit,
      credit,
      description,
      journal_entries:journal_entry_id (
        journal_number,
        entry_date,
        entry_type
      )
    `)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(40)

  throwOnError(error)

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    entry_date: r.journal_entries?.entry_date || '',
    journal_number: r.journal_entries?.journal_number || 'JV-AUTO',
    entry_type: r.journal_entries?.entry_type || 'General',
    description: r.description,
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
  }))
}