import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type { ChartOfAccount } from '../types/domain'

export interface GeneralLedgerFilterParams {
  accountId?: string | 'all'
  branchId?: string | 'all'
  dateFrom?: string
  dateTo?: string
  entryType?: string | 'all'
  search?: string
  limit?: number
  offset?: number
}

export interface GeneralLedgerLine {
  id: string
  entry_date: string
  entry_type: string
  reference_type: string
  reference_id: string
  reference_number: string
  account_id: string
  account_code?: string
  account_name?: string
  account_type?: string
  normal_balance?: 'debit' | 'credit'
  branch_id?: string
  branch_name?: string
  debit: number
  credit: number
  running_balance: number
  narration: string
  created_at: string
}

export interface GeneralLedgerReport {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  normal_balance: 'debit' | 'credit'
  date_from: string
  date_to: string
  opening_balance: number
  total_debit: number
  total_credit: number
  net_movement: number
  closing_balance: number
  lines: GeneralLedgerLine[]
}

export interface AccountLedgerSummaryItem {
  id: string
  account_code: string
  account_name: string
  account_type: string
  normal_balance: 'debit' | 'credit'
  opening_balance: number
  total_debit: number
  total_credit: number
  net_movement: number
  closing_balance: number
  transaction_count: number
}

// ── 1. Fetch Chart of Accounts for Ledger Selector ───────────────────────────
export async function fetchAccountsForLedger(): Promise<ChartOfAccount[]> {
  const supabase = requireSupabase()
  const companyId = await currentCompanyId()

  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, company_id, account_code, account_name, account_type, subtype, normal_balance, is_control_account, is_active, created_at, updated_at')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('account_code', { ascending: true })

  throwOnError(error)
  return (data || []) as ChartOfAccount[]
}

// ── 2. Fetch Core General Ledger Report ───────────────────────────────────────
export async function fetchGeneralLedgerReport(
  params: GeneralLedgerFilterParams
): Promise<GeneralLedgerReport> {
  const supabase = requireSupabase()
  const companyId = await currentCompanyId()

  const dateFrom = params.dateFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const dateTo = params.dateTo || new Date().toISOString().slice(0, 10)

  // Fetch accounts lookup
  const accounts = await fetchAccountsForLedger()
  const accountMap = new Map<string, ChartOfAccount>()
  accounts.forEach((a) => accountMap.set(a.id, a))

  // Fetch branches lookup
  const { data: branchRows } = await supabase
    .from('branches')
    .select('id, name')
    .eq('company_id', companyId)
  const branchMap = new Map<string, string>()
  ;(branchRows || []).forEach((b: { id: string; name: string }) => branchMap.set(b.id, b.name))

  // Selected account metadata
  const isSingleAccount = params.accountId && params.accountId !== 'all'
  const selectedAccount = isSingleAccount ? accountMap.get(params.accountId as string) : null

  // 1. Calculate Opening Balance prior to dateFrom
  let openingBalance = 0
  if (isSingleAccount && selectedAccount) {
    let openingQuery = supabase
      .from('general_ledger_entries')
      .select('debit_amount, credit_amount')
      .eq('company_id', companyId)
      .eq('account_id', selectedAccount.id)
      .lt('entry_date', dateFrom)

    if (params.branchId && params.branchId !== 'all') {
      openingQuery = openingQuery.eq('branch_id', params.branchId)
    }

    const { data: openingData, error: openingErr } = await openingQuery
    if (!openingErr && openingData) {
      const sumDebit = (openingData as any[]).reduce((acc, row) => acc + (Number(row.debit_amount) || 0), 0)
      const sumCredit = (openingData as any[]).reduce((acc, row) => acc + (Number(row.credit_amount) || 0), 0)
      openingBalance = selectedAccount.normal_balance === 'debit'
        ? sumDebit - sumCredit
        : sumCredit - sumDebit
    }
  }

  // 2. Fetch Period Transactions from general_ledger_entries
  let glQuery = supabase
    .from('general_ledger_entries')
    .select('*')
    .eq('company_id', companyId)
    .gte('entry_date', dateFrom)
    .lte('entry_date', dateTo)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (isSingleAccount && params.accountId) {
    glQuery = glQuery.eq('account_id', params.accountId)
  }
  if (params.branchId && params.branchId !== 'all') {
    glQuery = glQuery.eq('branch_id', params.branchId)
  }
  if (params.entryType && params.entryType !== 'all') {
    glQuery = glQuery.eq('entry_type', params.entryType)
  }

  const { data: glEntries, error: glErr } = await glQuery
  throwOnError(glErr)

  // 3. Also check journal_entry_lines for any manual journal entries
  let jeQuery = supabase
    .from('journal_entry_lines')
    .select(`
      id,
      account_id,
      description,
      debit,
      credit,
      created_at,
      journal_entries!inner (
        id,
        entry_number,
        entry_date,
        description,
        status,
        branch_id
      )
    `)
    .eq('company_id', companyId)
    .eq('journal_entries.status', 'posted')
    .gte('journal_entries.entry_date', dateFrom)
    .lte('journal_entries.entry_date', dateTo)

  if (isSingleAccount && params.accountId) {
    jeQuery = jeQuery.eq('account_id', params.accountId)
  }
  if (params.branchId && params.branchId !== 'all') {
    jeQuery = jeQuery.eq('journal_entries.branch_id', params.branchId)
  }

  const { data: jeLines } = await jeQuery

  // Merge and harmonize entries
  const mergedLines: GeneralLedgerLine[] = []

  // Add GL entries
  ;(glEntries || []).forEach((row: any) => {
    const acc = accountMap.get(row.account_id)
    mergedLines.push({
      id: row.id,
      entry_date: row.entry_date,
      entry_type: row.entry_type,
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      reference_number: row.reference_number || 'GL-TX',
      account_id: row.account_id,
      account_code: acc?.account_code || '---',
      account_name: acc?.account_name || 'General Account',
      account_type: acc?.account_type || 'asset',
      normal_balance: acc?.normal_balance || 'debit',
      branch_id: row.branch_id,
      branch_name: branchMap.get(row.branch_id) || 'Primary Branch',
      debit: Number(row.debit_amount) || 0,
      credit: Number(row.credit_amount) || 0,
      running_balance: 0,
      narration: row.narration || '',
      created_at: row.created_at,
    })
  })

  // Add manual JE lines if they aren't already represented in GL entries
  const glRefIds = new Set((glEntries || []).map((g: any) => g.reference_id))
  ;(jeLines || []).forEach((row: any) => {
    const je = row.journal_entries
    if (!glRefIds.has(je.id) && !glRefIds.has(row.id)) {
      const acc = accountMap.get(row.account_id)
      mergedLines.push({
        id: row.id,
        entry_date: je.entry_date,
        entry_type: 'journal',
        reference_type: 'journal_entry',
        reference_id: je.id,
        reference_number: je.entry_number || 'JV-MANUAL',
        account_id: row.account_id,
        account_code: acc?.account_code || '---',
        account_name: acc?.account_name || 'General Account',
        account_type: acc?.account_type || 'asset',
        normal_balance: acc?.normal_balance || 'debit',
        branch_id: je.branch_id,
        branch_name: branchMap.get(je.branch_id) || 'Primary Branch',
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
        running_balance: 0,
        narration: row.description || je.description || 'Journal Voucher Posting',
        created_at: row.created_at,
      })
    }
  })

  // Sort chronologically
  mergedLines.sort((a, b) => {
    const dateComp = a.entry_date.localeCompare(b.entry_date)
    if (dateComp !== 0) return dateComp
    return a.created_at.localeCompare(b.created_at)
  })

  // Filter by search text if provided
  let filteredLines = mergedLines
  if (params.search && params.search.trim()) {
    const q = params.search.toLowerCase().trim()
    filteredLines = mergedLines.filter((line) =>
      line.reference_number.toLowerCase().includes(q) ||
      line.narration.toLowerCase().includes(q) ||
      (line.account_code && line.account_code.toLowerCase().includes(q)) ||
      (line.account_name && line.account_name.toLowerCase().includes(q)) ||
      (line.branch_name && line.branch_name.toLowerCase().includes(q))
    )
  }

  // Calculate running balance and totals
  let running = openingBalance
  let totalDebit = 0
  let totalCredit = 0

  const linesWithRunningBalance = filteredLines.map((line) => {
    totalDebit += line.debit
    totalCredit += line.credit

    const isDebitNormal = line.normal_balance === 'debit'
    const delta = isDebitNormal ? line.debit - line.credit : line.credit - line.debit
    running += delta

    return {
      ...line,
      running_balance: running,
    }
  })

  const netMovement = selectedAccount?.normal_balance === 'credit'
    ? totalCredit - totalDebit
    : totalDebit - totalCredit

  const closingBalance = openingBalance + netMovement

  return {
    account_id: selectedAccount?.id || 'all',
    account_code: selectedAccount?.account_code || 'ALL',
    account_name: selectedAccount?.account_name || 'General Ledger (Consolidated All Accounts)',
    account_type: selectedAccount?.account_type || 'consolidated',
    normal_balance: selectedAccount?.normal_balance || 'debit',
    date_from: dateFrom,
    date_to: dateTo,
    opening_balance: openingBalance,
    total_debit: totalDebit,
    total_credit: totalCredit,
    net_movement: netMovement,
    closing_balance: closingBalance,
    lines: linesWithRunningBalance,
  }
}

// ── 3. Fetch Overview Summary by Account ──────────────────────────────────────
export async function fetchLedgerSummaryByAccount(
  dateFrom: string,
  dateTo: string,
  branchId?: string
): Promise<AccountLedgerSummaryItem[]> {
  const supabase = requireSupabase()
  const companyId = await currentCompanyId()

  const accounts = await fetchAccountsForLedger()

  // Period entries
  let query = supabase
    .from('general_ledger_entries')
    .select('account_id, debit_amount, credit_amount, entry_date')
    .eq('company_id', companyId)

  if (branchId && branchId !== 'all') {
    query = query.eq('branch_id', branchId)
  }

  const { data: allEntries, error } = await query
  throwOnError(error)

  const accountStats: Record<string, {
    openingDebit: number
    openingCredit: number
    periodDebit: number
    periodCredit: number
    txCount: number
  }> = {}

  accounts.forEach((a) => {
    accountStats[a.id] = {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      txCount: 0,
    }
  })

  ;(allEntries || []).forEach((row: any) => {
    const stat = accountStats[row.account_id]
    if (!stat) return

    const debit = Number(row.debit_amount) || 0
    const credit = Number(row.credit_amount) || 0

    if (row.entry_date < dateFrom) {
      stat.openingDebit += debit
      stat.openingCredit += credit
    } else if (row.entry_date <= dateTo) {
      stat.periodDebit += debit
      stat.periodCredit += credit
      stat.txCount += 1
    }
  })

  return accounts.map((acc) => {
    const s = accountStats[acc.id] || {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      txCount: 0,
    }

    const isDebitNormal = acc.normal_balance === 'debit'
    const opening = isDebitNormal
      ? s.openingDebit - s.openingCredit
      : s.openingCredit - s.openingDebit

    const net = isDebitNormal
      ? s.periodDebit - s.periodCredit
      : s.periodCredit - s.periodDebit

    const closing = opening + net

    return {
      id: acc.id,
      account_code: acc.account_code || '',
      account_name: acc.account_name || '',
      account_type: acc.account_type,
      normal_balance: acc.normal_balance as 'debit' | 'credit',
      opening_balance: opening,
      total_debit: s.periodDebit,
      total_credit: s.periodCredit,
      net_movement: net,
      closing_balance: closing,
      transaction_count: s.txCount,
    }
  })
}

// ── 4. CSV Exporter ──────────────────────────────────────────────────────────
export function exportLedgerToCsv(report: GeneralLedgerReport): void {
  const headers = [
    'Date',
    'Reference #',
    'Entry Type',
    'Account Code',
    'Account Name',
    'Branch',
    'Narration / Description',
    'Debit (LKR)',
    'Credit (LKR)',
    'Running Balance (LKR)',
  ]

  const rows = report.lines.map((l) => [
    `"${l.entry_date}"`,
    `"${l.reference_number}"`,
    `"${l.entry_type}"`,
    `"${l.account_code || ''}"`,
    `"${l.account_name || ''}"`,
    `"${l.branch_name || ''}"`,
    `"${(l.narration || '').replace(/"/g, '""')}"`,
    l.debit.toFixed(2),
    l.credit.toFixed(2),
    l.running_balance.toFixed(2),
  ])

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute(
    'download',
    `General_Ledger_${report.account_code}_${report.date_from}_to_${report.date_to}.csv`
  )
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
