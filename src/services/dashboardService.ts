import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'

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

export async function fetchDashboardSummary(branchId?: string): Promise<DashboardSummaryData> {
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

  // Fallback direct aggregation
  const todayStr = (new Date().toISOString().split('T')[0]) || ''

  // 1. Inward Cheques in Hand
  let chequesQuery = getTable('cheques')
    .select('id, cheque_number, payee_payor_name, bank_name, amount, due_date, status, branch_id')
    .eq('company_id', companyId)
    .eq('direction', 'inbound')
    .eq('status', 'in_hand')

  if (branchId) {
    chequesQuery = chequesQuery.eq('branch_id', branchId)
  }

  const { data: chequesData, error: chErr } = await chequesQuery
  throwOnError(chErr)

  const inwardChequesList = ((chequesData || []) as unknown as Array<{
    id: string
    cheque_number: string
    payee_payor_name: string
    bank_name: string | null
    amount: number
    due_date: string
    status: 'in_hand' | 'deposited' | 'cleared' | 'returned' | 'cancelled'
    branch_id: string
  }>)

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
  let salesQuery = getTable('sales_invoices')
    .select('grand_total')
    .eq('company_id', companyId)
    .eq('status', 'posted')
    .eq('invoice_date' as never, todayStr as never)

  if (branchId) {
    salesQuery = salesQuery.eq('branch_id', branchId)
  }

  const { data: salesData } = await salesQuery
  const day_sales = ((salesData || []) as unknown as Array<{ grand_total: number }>).reduce(
    (acc, row) => acc + Number(row.grand_total || 0),
    0,
  )

  // 3. Day book / Petty cash from journal lines
  let dayBookQuery = getTable('journal_entry_lines')
    .select('debit, credit, journal_entries!inner(status, branch_id)')
    .eq('company_id', companyId)
    .eq('journal_entries.status', 'posted')

  if (branchId) {
    dayBookQuery = dayBookQuery.eq('journal_entries.branch_id', branchId)
  }

  const { data: jData } = await dayBookQuery
  const day_book_balance = ((jData || []) as unknown as Array<{ debit: number; credit: number }>).reduce(
    (acc, row) => acc + (Number(row.debit || 0) - Number(row.credit || 0)),
    0,
  )

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
