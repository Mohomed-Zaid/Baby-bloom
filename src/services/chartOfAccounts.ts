import type { ChartOfAccount, AccountType, NormalBalance } from '../types/domain'
import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { currentCompanyId } from './masterData'

const db = () => requireSupabase() as any

const isUuid = (str: string | null | undefined): boolean =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str))

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
    expectedType: 'cost_of_sales',
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

// ── Default Sri Lankan Standard Chart of Accounts Seed ───────────────────────
export const DEFAULT_MOCK_CHART_OF_ACCOUNTS: ChartOfAccountNode[] = [
  // Assets (1000 - 1999)
  {
    id: 'coa-1000',
    company_id: 'company-babybloom',
    account_code: '1000',
    account_name: 'Cash in Hand',
    account_type: 'asset',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-1010',
    company_id: 'company-babybloom',
    account_code: '1010',
    account_name: 'Petty Cash',
    account_type: 'asset',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-1020',
    company_id: 'company-babybloom',
    account_code: '1020',
    account_name: 'Commercial Bank A/C',
    account_type: 'asset',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: true,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-1030',
    company_id: 'company-babybloom',
    account_code: '1030',
    account_name: 'Hatton National Bank A/C',
    account_type: 'asset',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: true,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-1050',
    company_id: 'company-babybloom',
    account_code: '1050',
    account_name: 'Inward Cheques in Hand',
    account_type: 'asset',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-1100',
    company_id: 'company-babybloom',
    account_code: '1100',
    account_name: 'Accounts Receivable',
    account_type: 'asset',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: true,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-1200',
    company_id: 'company-babybloom',
    account_code: '1200',
    account_name: 'Inventory Asset',
    account_type: 'asset',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: true,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  // Liabilities (2000 - 2999)
  {
    id: 'coa-2000',
    company_id: 'company-babybloom',
    account_code: '2000',
    account_name: 'Accounts Payable',
    account_type: 'liability',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: true,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-2050',
    company_id: 'company-babybloom',
    account_code: '2050',
    account_name: 'Post-Dated Cheques Payable',
    account_type: 'liability',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-2100',
    company_id: 'company-babybloom',
    account_code: '2100',
    account_name: 'Customer Advances',
    account_type: 'liability',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: true,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-2200',
    company_id: 'company-babybloom',
    account_code: '2200',
    account_name: 'Supplier Advances',
    account_type: 'asset',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: true,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  // Equity (3000 - 3999)
  {
    id: 'coa-3000',
    company_id: 'company-babybloom',
    account_code: '3000',
    account_name: "Owner's Capital",
    account_type: 'equity',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: false,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-3100',
    company_id: 'company-babybloom',
    account_code: '3100',
    account_name: 'Retained Earnings',
    account_type: 'equity',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: true,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  // Revenue (4000 - 4999)
  {
    id: 'coa-4000',
    company_id: 'company-babybloom',
    account_code: '4000',
    account_name: 'Retail Sales',
    account_type: 'income',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-4010',
    company_id: 'company-babybloom',
    account_code: '4010',
    account_name: 'Wholesale Sales',
    account_type: 'income',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: false,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-4020',
    company_id: 'company-babybloom',
    account_code: '4020',
    account_name: 'Delivery Income',
    account_type: 'income',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: false,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-4100',
    company_id: 'company-babybloom',
    account_code: '4100',
    account_name: 'Sales Returns',
    account_type: 'income',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-4200',
    company_id: 'company-babybloom',
    account_code: '4200',
    account_name: 'Discounts Received',
    account_type: 'income',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  // Cost of Sales (5000 - 5999)
  {
    id: 'coa-5000',
    company_id: 'company-babybloom',
    account_code: '5000',
    account_name: 'Cost of Goods Sold',
    account_type: 'cost_of_sales',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-5100',
    company_id: 'company-babybloom',
    account_code: '5100',
    account_name: 'Purchase Returns',
    account_type: 'cost_of_sales',
    normal_balance: 'credit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  // Expenses (6000 - 6999)
  {
    id: 'coa-6000',
    company_id: 'company-babybloom',
    account_code: '6000',
    account_name: 'Rent Expense',
    account_type: 'expense',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: false,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-6010',
    company_id: 'company-babybloom',
    account_code: '6010',
    account_name: 'Staff Salaries',
    account_type: 'expense',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: false,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-6020',
    company_id: 'company-babybloom',
    account_code: '6020',
    account_name: 'Electricity & Water',
    account_type: 'expense',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: false,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-6030',
    company_id: 'company-babybloom',
    account_code: '6030',
    account_name: 'Card Machine Commission',
    account_type: 'expense',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: false,
    allow_manual_entries: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'coa-6100',
    company_id: 'company-babybloom',
    account_code: '6100',
    account_name: 'Discounts Allowed',
    account_type: 'expense',
    normal_balance: 'debit',
    parent_account_id: null,
    is_control_account: false,
    is_system_account: true,
    allow_manual_entries: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

const STORAGE_KEY = 'bb_chart_of_accounts_list'

export function getStoredChartAccountsList(): ChartOfAccountNode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as ChartOfAccountNode[]
    }
  } catch {}
  return [...DEFAULT_MOCK_CHART_OF_ACCOUNTS]
}

export function saveStoredChartAccountsList(list: ChartOfAccountNode[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {}
}

// ── Company Context Helper ──────────────────────────────────────────────────
async function resolveCompanyId(): Promise<string> {
  if (isBackendOffline()) return 'company-babybloom'
  const supabase = db()
  try {
    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userData?.user?.id

    if (currentUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', currentUserId)
        .maybeSingle()

      if (profile?.company_id) return profile.company_id as string
    }
  } catch {}

  return currentCompanyId()
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
  let accounts: ChartOfAccount[] = []

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const companyId = await resolveCompanyId()

      let q = supabase
        .from('chart_of_accounts')
        .select('*')
        .order('account_code', { ascending: true })

      if (isUuid(companyId)) {
        q = q.eq('company_id', companyId)
      }

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
      if (!error && data && data.length > 0) {
        accounts = data as unknown as ChartOfAccount[]
        // Merge Supabase accounts with stored accounts
        const local = getStoredChartAccountsList()
        const localMap = new Map<string, ChartOfAccountNode>(local.map((a) => [a.id, a]))
        for (const acc of accounts) {
          localMap.set(acc.id, { ...acc, children: [] })
        }
        saveStoredChartAccountsList(Array.from(localMap.values()))
      }
    } catch (err) {
      console.warn('Failed to fetch chart_of_accounts from Supabase, using local fallback:', err)
    }
  }

  if (accounts.length === 0) {
    let local = getStoredChartAccountsList()
    if (params.activeOnly) {
      local = local.filter((a) => a.is_active)
    }
    if (params.accountType && params.accountType !== 'all') {
      local = local.filter((a) => a.account_type === params.accountType)
    }
    if (params.search?.trim()) {
      const s = params.search.trim().toLowerCase()
      local = local.filter(
        (a) =>
          a.account_code.toLowerCase().includes(s) || a.account_name.toLowerCase().includes(s)
      )
    }
    accounts = local
  }

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
  const localList = getStoredChartAccountsList()
  const companyId = await resolveCompanyId()

  const code = input.account_code.trim()
  const name = input.account_name.trim()

  if (!code) throw new Error('Account code is required.')
  if (!name) throw new Error('Account name is required.')

  const existsLocal = localList.some((a) => a.account_code.toLowerCase() === code.toLowerCase())
  if (existsLocal) {
    throw new Error(`Account code "${code}" already exists in the Chart of Accounts.`)
  }

  // Rule: Control accounts cannot allow manual journal entries
  const isControl = Boolean(input.is_control_account)
  const allowManual = isControl ? false : (input.allow_manual_entries ?? true)

  // Postgres chart_of_accounts columns:
  // company_id, account_code, account_name, account_type, normal_balance, parent_account_id,
  // is_control_account, is_system_account, allow_manual_entries, is_active
  // Note: NO currency, NO subtype columns exist in Postgres chart_of_accounts!
  const payload: Record<string, unknown> = {
    account_code: code,
    account_name: name,
    account_type: input.account_type,
    normal_balance: input.normal_balance,
    parent_account_id: isUuid(input.parent_account_id) ? input.parent_account_id : null,
    is_control_account: isControl,
    is_system_account: input.is_system_account ?? false,
    allow_manual_entries: allowManual,
    is_active: input.is_active ?? true,
  }

  if (isUuid(companyId)) {
    payload.company_id = companyId
  }

  let dbRow: ChartOfAccount | null = null

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      if (isUuid(companyId)) {
        const { count } = await supabase
          .from('chart_of_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('account_code', code)

        if ((count ?? 0) > 0) {
          throw new Error(`Account code "${code}" already exists in the Chart of Accounts.`)
        }
      }

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .insert(payload)
        .select()
        .single()

      if (!error && data) {
        dbRow = data as unknown as ChartOfAccount
      } else if (error) {
        console.warn('Supabase chart_of_accounts insert failed, using fallback:', error.message)
      }
    } catch (err: any) {
      if (err.message && err.message.includes('already exists')) {
        throw err
      }
      console.warn('Supabase chart_of_accounts call failed:', err)
    }
  }

  const newAccount: ChartOfAccount = dbRow ?? {
    id: `coa-${Date.now()}`,
    company_id: companyId,
    account_code: code,
    account_name: name,
    account_type: input.account_type,
    normal_balance: input.normal_balance,
    parent_account_id: input.parent_account_id || null,
    is_control_account: isControl,
    is_system_account: input.is_system_account ?? false,
    allow_manual_entries: allowManual,
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  localList.push(newAccount)
  saveStoredChartAccountsList(localList)
  return newAccount
}

// ── 3. Update Chart of Account ───────────────────────────────────────────────
export async function updateChartAccount(
  id: string,
  input: Partial<CreateChartAccountInput>
): Promise<ChartOfAccount> {
  const localList = getStoredChartAccountsList()
  const companyId = await resolveCompanyId()
  const localIdx = localList.findIndex((a) => a.id === id)
  const current = localIdx >= 0 ? localList[localIdx] : null

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.account_name !== undefined) {
    if (!input.account_name.trim()) throw new Error('Account name cannot be blank.')
    payload.account_name = input.account_name.trim()
  }

  const isSystem = current?.is_system_account ?? false

  // For non-system accounts, allow updating code, type, normal balance, and parent
  if (!isSystem) {
    if (input.account_code !== undefined) {
      const code = input.account_code.trim()
      if (!code) throw new Error('Account code cannot be blank.')

      const dup = localList.find((a) => a.id !== id && a.account_code.toLowerCase() === code.toLowerCase())
      if (dup) throw new Error(`Account code "${code}" is already in use by another account.`)
      payload.account_code = code
    }

    if (input.account_type !== undefined) payload.account_type = input.account_type
    if (input.normal_balance !== undefined) payload.normal_balance = input.normal_balance

    if (input.parent_account_id !== undefined) {
      if (input.parent_account_id === id) {
        throw new Error('An account cannot be its own parent.')
      }
      payload.parent_account_id = isUuid(input.parent_account_id) ? input.parent_account_id : null
    }

    if (input.is_control_account !== undefined) {
      payload.is_control_account = input.is_control_account
      if (input.is_control_account) {
        payload.allow_manual_entries = false
      }
    }
  }

  if (input.allow_manual_entries !== undefined && !Boolean(payload.is_control_account ?? current?.is_control_account)) {
    payload.allow_manual_entries = input.allow_manual_entries
  }

  if (input.is_active !== undefined) payload.is_active = input.is_active

  let updatedAccount: ChartOfAccount | null = null

  if (!isBackendOffline() && isUuid(id)) {
    try {
      const supabase = db()
      let q = supabase
        .from('chart_of_accounts')
        .update(payload)
        .eq('id', id)

      if (isUuid(companyId)) {
        q = q.eq('company_id', companyId)
      }

      const { data, error } = await q.select().single()

      if (!error && data) {
        updatedAccount = data as unknown as ChartOfAccount
      }
    } catch (err) {
      console.warn('Supabase chart_of_accounts update error:', err)
    }
  }

  if (!updatedAccount && current) {
    updatedAccount = {
      ...current,
      ...payload,
      parent_account_id: (payload.parent_account_id !== undefined ? payload.parent_account_id : current.parent_account_id) as string | null,
    } as ChartOfAccount
  } else if (!updatedAccount) {
    updatedAccount = {
      id,
      company_id: companyId,
      account_code: String(payload.account_code || 'ACC'),
      account_name: String(payload.account_name || 'Account'),
      account_type: (payload.account_type || 'expense') as AccountType,
      normal_balance: (payload.normal_balance || 'debit') as NormalBalance,
      parent_account_id: null,
      is_control_account: false,
      is_system_account: false,
      allow_manual_entries: true,
      is_active: payload.is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  if (localIdx >= 0) {
    localList[localIdx] = updatedAccount
  } else {
    localList.push(updatedAccount)
  }
  saveStoredChartAccountsList(localList)

  return updatedAccount
}

// ── 4. Toggle Chart Account Status ──────────────────────────────────────────
export async function toggleChartAccountStatus(id: string, currentStatus: boolean): Promise<ChartOfAccount> {
  return updateChartAccount(id, { is_active: !currentStatus })
}

// ── 5. Delete Chart Account (with Safeguards) ────────────────────────────────
export async function deleteChartAccount(id: string): Promise<void> {
  const localList = getStoredChartAccountsList()
  const localIdx = localList.findIndex((a) => a.id === id)
  const current = localIdx >= 0 ? localList[localIdx] : null

  if (current?.is_system_account) {
    throw new Error(
      `Account "${current.account_code} - ${current.account_name}" is a protected core system account and cannot be deleted.`
    )
  }

  // Check child accounts in local list
  const childCount = localList.filter((a) => a.parent_account_id === id).length
  if (childCount > 0) {
    throw new Error(
      `Cannot delete this account because it has ${childCount} sub-account(s) under it. Reassign or delete child accounts first.`
    )
  }

  if (!isBackendOffline() && isUuid(id)) {
    try {
      const supabase = db()
      const companyId = await resolveCompanyId()

      // 1. Check if it's a protected system account
      let q = supabase
        .from('chart_of_accounts')
        .select('is_system_account, account_code, account_name')
        .eq('id', id)

      if (isUuid(companyId)) q = q.eq('company_id', companyId)
      const { data: account, error: accErr } = await q.single()

      if (!accErr && account?.is_system_account) {
        throw new Error(
          `Account "${account.account_code} - ${account.account_name}" is a protected core system account and cannot be deleted.`
        )
      }

      // 2. Check for child accounts
      let childQ = supabase
        .from('chart_of_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('parent_account_id', id)
      if (isUuid(companyId)) childQ = childQ.eq('company_id', companyId)
      const { count: dbChildCount } = await childQ

      if ((dbChildCount ?? 0) > 0) {
        throw new Error(
          `Cannot delete this account because it has ${dbChildCount} sub-account(s) under it. Reassign or delete child accounts first.`
        )
      }

      // 3. Check if mapped in account_mappings
      let mapQ = supabase
        .from('account_mappings')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', id)
      if (isUuid(companyId)) mapQ = mapQ.eq('company_id', companyId)
      const { count: mapCount } = await mapQ

      if ((mapCount ?? 0) > 0) {
        throw new Error(
          'Cannot delete this account because it is assigned as an automated system transaction posting destination.'
        )
      }

      // 4. Check if linked to any bank account
      let bankAccQ = supabase
        .from('bank_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('ledger_account_id', id)
      if (isUuid(companyId)) bankAccQ = bankAccQ.eq('company_id', companyId)
      const { count: bankAccCount } = await bankAccQ

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

      let delQ = supabase.from('chart_of_accounts').delete().eq('id', id)
      if (isUuid(companyId)) delQ = delQ.eq('company_id', companyId)
      await delQ
    } catch (err: any) {
      if (err.message && (err.message.includes('Cannot delete') || err.message.includes('protected'))) {
        throw err
      }
      console.warn('Supabase chart_of_accounts delete call error:', err)
    }
  }

  saveStoredChartAccountsList(localList.filter((a) => a.id !== id))
}

// ── 6. Account Mappings Management ──────────────────────────────────────────
export async function listAccountMappings(): Promise<AccountMappingRow[]> {
  const existingMap = new Map<string, any>()

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const companyId = await resolveCompanyId()

      let q = supabase
        .from('account_mappings')
        .select('id, mapping_key, account_id')

      if (isUuid(companyId)) {
        q = q.eq('company_id', companyId)
      }

      const { data, error } = await q
      if (!error && data) {
        for (const item of (data as any[]) || []) {
          existingMap.set(item.mapping_key, item)
        }
      }
    } catch (err) {
      console.warn('Failed to load account mappings from Supabase:', err)
    }
  }

  const storedAccounts = getStoredChartAccountsList()
  const defaultCodeMapping: Record<string, string> = {
    cash_in_hand: '1000',
    accounts_receivable: '1100',
    inventory: '1200',
    bank: '1020',
    accounts_payable: '2000',
    customer_advances: '2100',
    supplier_advances: '2200',
    retained_earnings: '3100',
    sales_revenue: '4000',
    sales_returns: '4100',
    discounts_received: '4200',
    cost_of_goods_sold: '5000',
    purchase_returns: '5100',
    expenses: '6000',
    discounts_allowed: '6100',
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
    const fallbackCode = defaultCodeMapping[key]
    const fallbackAccount = fallbackCode ? storedAccounts.find((a) => a.account_code === fallbackCode) : undefined
    const matchedAccount = row?.account_id ? storedAccounts.find((a) => a.id === row.account_id) : fallbackAccount

    return {
      id: row?.id,
      mapping_key: key,
      account_id: row?.account_id || matchedAccount?.id || '',
      account_code: matchedAccount?.account_code || '',
      account_name: matchedAccount?.account_name || 'Not Configured',
      account_type: matchedAccount?.account_type || meta.expectedType,
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
  if (!account_id) throw new Error('Please select an account.')

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const companyId = await resolveCompanyId()

      const payload: Record<string, unknown> = {
        mapping_key,
        account_id,
        updated_at: new Date().toISOString(),
      }
      if (isUuid(companyId)) {
        payload.company_id = companyId
      }

      await supabase
        .from('account_mappings')
        .upsert(payload, { onConflict: 'company_id, mapping_key' })
    } catch (err) {
      console.warn('saveAccountMapping Supabase call failed:', err)
    }
  }
}

// ── 7. Fetch Recent Account Transactions / Ledger Audit ──────────────────────
export async function fetchAccountLedgerDetails(
  accountId: string
): Promise<AccountLedgerEntry[]> {
  if (!isBackendOffline() && isUuid(accountId)) {
    try {
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

      if (!error && data) {
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
    } catch (err) {
      console.warn('fetchAccountLedgerDetails error:', err)
    }
  }

  return []
}