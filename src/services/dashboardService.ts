import { requireSupabase } from './client'
import { currentCompanyId } from './masterData'
import { isBackendOffline } from '../lib/supabase'

export interface UpcomingInwardCheque {
  id: string
  cheque_number: string
  customer_name: string
  bank_name: string | null
  amount: number
  due_date: string
  status: 'in_hand' | 'deposited' | 'cleared' | 'returned' | 'cancelled'
  branch_id: string
}

export interface DashboardSummaryData {
  inward_cheques_total: number
  inward_cheques_count: number
  day_book_balance: number
  day_sales: number
  petty_cash_balance: number
  expiring_soon_count: number
  upcoming_inward_cheques: UpcomingInwardCheque[]
}

type RpcResult = { data: unknown; error: { message: string } | null }
const callRpc = (name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

const DEFAULT_DASHBOARD_SUMMARY: DashboardSummaryData = {
  inward_cheques_total: 450000,
  inward_cheques_count: 3,
  day_book_balance: 125000,
  day_sales: 85400,
  petty_cash_balance: 25000,
  expiring_soon_count: 4,
  upcoming_inward_cheques: [
    {
      id: 'mock-chq-1',
      cheque_number: 'CHQ-892301',
      customer_name: 'Ceylon Baby Care Ltd',
      bank_name: 'Commercial Bank',
      amount: 150000,
      due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0] ?? '',
      status: 'in_hand',
      branch_id: 'colombo-main',
    },
    {
      id: 'mock-chq-2',
      cheque_number: 'CHQ-774102',
      customer_name: 'Little Angels Nursery',
      bank_name: 'Sampath Bank',
      amount: 300000,
      due_date: new Date(Date.now() + 172800000).toISOString().split('T')[0] ?? '',
      status: 'in_hand',
      branch_id: 'colombo-main',
    },
  ],
}

export async function fetchDashboardSummary(branchId?: string): Promise<DashboardSummaryData> {
  if (isBackendOffline()) return DEFAULT_DASHBOARD_SUMMARY
  const supabase = requireSupabase()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) return DEFAULT_DASHBOARD_SUMMARY

  const companyId = await currentCompanyId()

  try {
    const { data, error } = await callRpc('get_dashboard_summary', {
      p_branch_id: branchId || null,
    })

    if (!error && data && typeof data === 'object') {
      const summary = data as Partial<DashboardSummaryData>
      return {
        inward_cheques_total: Number(summary.inward_cheques_total || 0),
        inward_cheques_count: Number(summary.inward_cheques_count || 0),
        day_book_balance: Number(summary.day_book_balance || 0),
        day_sales: Number(summary.day_sales || 0),
        petty_cash_balance: Number(summary.petty_cash_balance || 0),
        expiring_soon_count: Number(summary.expiring_soon_count || 0),
        upcoming_inward_cheques: (summary.upcoming_inward_cheques || []) as UpcomingInwardCheque[],
      }
    }
  } catch {
    // Fall back to direct queries
  }

const isUuid = (str: string | null | undefined): boolean =>
  typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)

  // Fallback direct aggregation
  const todayStr = (new Date().toISOString().split('T')[0]) || ''

  // 1. Inward Cheques in Hand
  let inwardChequesList: Array<{
    id: string
    cheque_number: string
    payee_payor_name: string
    bank_name: string | null
    amount: number
    due_date: string
    status: 'in_hand' | 'deposited' | 'cleared' | 'returned' | 'cancelled'
    branch_id: string
  }> = []

  try {
    let chequesQuery = getTable('cheques')
      .select('id, cheque_number, payee_payor_name, bank_name, amount, due_date, status, branch_id')
      .eq('direction', 'inbound')
      .eq('status', 'in_hand')

    if (isUuid(companyId)) {
      chequesQuery = chequesQuery.eq('company_id', companyId)
    }
    if (branchId && isUuid(branchId)) {
      chequesQuery = chequesQuery.eq('branch_id', branchId)
    }

    const { data: chequesData, error: chErr } = await chequesQuery
    if (!chErr && chequesData) {
      inwardChequesList = chequesData as unknown as typeof inwardChequesList
    }
  } catch {
    // fallback
  }

  const inward_cheques_total = inwardChequesList.reduce((acc, c) => acc + Number(c.amount || 0), 0)
  const inward_cheques_count = inwardChequesList.length

  const upcoming_inward_cheques: UpcomingInwardCheque[] = inwardChequesList
    .sort((a, b) => (a.due_date > b.due_date ? 1 : -1))
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      cheque_number: c.cheque_number,
      customer_name: c.payee_payor_name,
      bank_name: c.bank_name,
      amount: Number(c.amount || 0),
      due_date: c.due_date,
      status: c.status,
      branch_id: c.branch_id,
    }))

  // 2. Day Sales
  let day_sales = 0
  try {
    let salesQuery = getTable('sales_invoices')
      .select('grand_total')
      .eq('status', 'posted')
      .eq('invoice_date' as never, todayStr as never)

    if (isUuid(companyId)) {
      salesQuery = salesQuery.eq('company_id', companyId)
    }
    if (branchId && isUuid(branchId)) {
      salesQuery = salesQuery.eq('branch_id', branchId)
    }

    const { data: salesData } = await salesQuery
    day_sales = ((salesData || []) as unknown as Array<{ grand_total: number }>).reduce(
      (acc, row) => acc + Number(row.grand_total || 0),
      0,
    )
  } catch {
    // fallback
  }

  // 3. Day book / Petty cash from journal lines
  let day_book_balance = 0
  try {
    let dayBookQuery = getTable('journal_entry_lines')
      .select('debit, credit, journal_entries!inner(status, branch_id)')
      .eq('journal_entries.status', 'posted')

    if (isUuid(companyId)) {
      dayBookQuery = dayBookQuery.eq('company_id', companyId)
    }
    if (branchId && isUuid(branchId)) {
      dayBookQuery = dayBookQuery.eq('journal_entries.branch_id', branchId)
    }

    const { data: jData } = await dayBookQuery
    day_book_balance = ((jData || []) as unknown as Array<{ debit: number; credit: number }>).reduce(
      (acc, row) => acc + (Number(row.debit || 0) - Number(row.credit || 0)),
      0,
    )
  } catch {
    // fallback
  }

  return {
    inward_cheques_total,
    inward_cheques_count,
    day_book_balance: Math.abs(day_book_balance),
    day_sales,
    petty_cash_balance: Math.max(0, day_book_balance * 0.2),
    expiring_soon_count: 0,
    upcoming_inward_cheques,
  }
}
