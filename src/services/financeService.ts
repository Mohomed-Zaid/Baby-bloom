import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type {
  ChartOfAccount,
  CustomerReceipt,
  IncomeAndExpenseEntry,
  BankStatement,
  GeneralLedgerEntry,
  CashBankLedgerReport,
} from '../types/finance'

type RpcResult<T = unknown> = { data: T; error: { message: string } | null }
const callRpc = <T = unknown>(name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>)(name, args)

interface DynamicQueryBuilder {
  select: (columns?: string) => DynamicQueryBuilder
  insert: (values: unknown) => DynamicQueryBuilder
  update: (values: unknown) => DynamicQueryBuilder
  delete: () => DynamicQueryBuilder
  eq: (column: string, value: unknown) => DynamicQueryBuilder
  gt: (column: string, value: unknown) => DynamicQueryBuilder
  gte: (column: string, value: unknown) => DynamicQueryBuilder
  lt: (column: string, value: unknown) => DynamicQueryBuilder
  lte: (column: string, value: unknown) => DynamicQueryBuilder
  in: (column: string, values: unknown[]) => DynamicQueryBuilder
  order: (column: string, options?: { ascending?: boolean }) => DynamicQueryBuilder
  limit: (count: number) => DynamicQueryBuilder
  single: () => Promise<{ data: unknown; error: { message: string } | null }>
  then: <TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>
}

const getTable = (tableName: string) =>
  (requireSupabase().from as unknown as (name: string) => DynamicQueryBuilder)(tableName)


// ============================================================================
// 1. Chart of Accounts Tree & Creation
// ============================================================================

export async function fetchChartOfAccounts(buildTree = true): Promise<ChartOfAccount[]> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('chart_of_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('account_code', { ascending: true })

  throwOnError(error)
  const accounts = (data || []) as unknown as ChartOfAccount[]

  if (!buildTree) return accounts

  // Build hierarchical tree structure
  const accountMap = new Map<string, ChartOfAccount>()
  accounts.forEach((acc) => accountMap.set(acc.id, { ...acc, children: [] }))

  const rootAccounts: ChartOfAccount[] = []
  accountMap.forEach((acc) => {
    if (acc.parent_account_id && accountMap.has(acc.parent_account_id)) {
      accountMap.get(acc.parent_account_id)?.children?.push(acc)
    } else {
      rootAccounts.push(acc)
    }
  })

  return rootAccounts
}

export async function createChartAccount(payload: {
  account_code: string
  account_name: string
  account_type: string
  subtype?: string
  normal_balance: 'debit' | 'credit'
  parent_account_id?: string | null
  is_control_account?: boolean
  allow_manual_entries?: boolean
}): Promise<ChartOfAccount> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('chart_of_accounts')
    .insert({
      company_id: companyId,
      account_code: payload.account_code,
      account_name: payload.account_name,
      account_type: payload.account_type,
      subtype: payload.subtype || null,
      normal_balance: payload.normal_balance,
      parent_account_id: payload.parent_account_id || null,
      is_control_account: payload.is_control_account ?? false,
      allow_manual_entries: payload.allow_manual_entries ?? true,
      currency: 'LKR',
    })
    .select()
    .single()

  throwOnError(error)
  return data as unknown as ChartOfAccount
}

// ============================================================================
// 2. Customer Receivables & Payment Receipt Allocation
// ============================================================================

export async function fetchCustomerReceivablesSummary() {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('customer_balance')
    .select('*')
    .eq('company_id', companyId)
    .gt('total_outstanding', 0)
    .order('total_outstanding', { ascending: false })

  throwOnError(error)
  return (data || []) as unknown as Array<{
    customer_id: string
    customer_code: string
    customer_name: string
    phone?: string
    email?: string
    credit_limit: number
    total_outstanding: number
    overdue_amount: number
    last_transaction_date?: string
  }>
}

export async function fetchUnpaidCustomerInvoices(customerId: string) {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('sales_invoices')
    .select('id, invoice_number, invoice_date, due_date, grand_total, paid_amount, balance_amount, status')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .eq('status', 'posted')
    .gt('balance_amount', 0)
    .order('invoice_date', { ascending: true })

  throwOnError(error)
  return (data || []) as unknown as Array<{
    id: string
    invoice_number: string
    invoice_date: string
    due_date: string
    grand_total: number
    paid_amount: number
    balance_amount: number
  }>
}

export async function createAndPostCustomerReceipt(
  receiptData: {
    branch_id: string
    customer_id: string
    payment_method: 'cash' | 'bank_transfer' | 'card' | 'cheque'
    amount: number
    bank_account_id?: string
    cheque_id?: string
    card_reference?: string
    notes?: string
  },
  allocations: Array<{ invoice_id: string; allocated_amount: number }>
): Promise<{ success: boolean; receipt_number: string; status: string }> {
  const companyId = await currentCompanyId()

  // 1. Generate receipt number sequence
  let receiptNumber: string
  try {
    const seqRes = await callRpc<string>('generate_number_sequence', {
      p_company_id: companyId,
      p_branch_id: receiptData.branch_id,
      p_sequence_type: 'receipt',
    })
    receiptNumber = seqRes.data || `REC-${Date.now()}`
  } catch {
    receiptNumber = `REC-${Date.now()}`
  }

  // 2. Insert draft receipt
  const { data: receiptRecord, error: recErr } = await getTable('customer_receipts')
    .insert({
      company_id: companyId,
      branch_id: receiptData.branch_id,
      receipt_number: receiptNumber,
      customer_id: receiptData.customer_id,
      payment_method: receiptData.payment_method,
      amount: receiptData.amount,
      bank_account_id: receiptData.bank_account_id || null,
      cheque_id: receiptData.cheque_id || null,
      card_reference: receiptData.card_reference || null,
      notes: receiptData.notes || null,
      status: 'draft',
    })
    .select()
    .single()

  throwOnError(recErr)
  const createdReceipt = receiptRecord as unknown as { id: string }

  // 3. Insert allocations
  if (allocations.length > 0) {
    const allocRows = allocations.map((a) => ({
      company_id: companyId,
      receipt_id: createdReceipt.id,
      invoice_id: a.invoice_id,
      allocated_amount: a.allocated_amount,
    }))

    const { error: allocErr } = await getTable('customer_receipt_allocations').insert(allocRows)
    throwOnError(allocErr)
  }

  // 4. Atomically post via post_customer_receipt RPC
  const postRes = await callRpc<{ success: boolean; receipt_number: string; status: string }>(
    'post_customer_receipt',
    {
      p_receipt_id: createdReceipt.id,
    }
  )

  throwOnError(postRes.error)
  return postRes.data
}

export async function fetchCustomerReceipts(limit = 100): Promise<CustomerReceipt[]> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('customer_receipts')
    .select(`
      *,
      customer:customer_id (id, name, customer_code, phone),
      allocations:customer_receipt_allocations (
        id, allocated_amount, invoice_id,
        invoice:invoice_id (id, invoice_number, grand_total, balance_amount)
      )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  throwOnError(error)
  return (data || []) as unknown as CustomerReceipt[]
}

// ============================================================================
// 3. Vendor Payables & Settlement Subledger
// ============================================================================

export async function fetchVendorPayablesSummary() {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('supplier_balance')
    .select('*')
    .eq('company_id', companyId)
    .gt('total_outstanding', 0)
    .order('total_outstanding', { ascending: false })

  throwOnError(error)
  return (data || []) as unknown as Array<{
    vendor_id: string
    vendor_code: string
    vendor_name: string
    phone?: string
    total_outstanding: number
    overdue_amount: number
    next_due_date?: string
    last_transaction_date?: string
  }>
}

export async function fetchUnpaidVendorPurchases(vendorId: string) {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('purchases')
    .select('id, purchase_number, purchase_date, grand_total, balance_amount, status')
    .eq('company_id', companyId)
    .eq('vendor_id', vendorId)
    .eq('status', 'posted')
    .gt('balance_amount', 0)
    .order('purchase_date', { ascending: true })

  throwOnError(error)
  return (data || []) as unknown as Array<{
    id: string
    purchase_number: string
    purchase_date: string
    grand_total: number
    balance_amount: number
  }>
}

export async function createAndPostSupplierPayment(payload: {
  branch_id: string
  vendor_id: string
  purchase_id?: string
  payment_date: string
  payment_method: 'cash' | 'bank' | 'card' | 'cheque' | 'online'
  amount: number
  bank_account_id?: string
  cheque_id?: string
  reference_number?: string
  notes?: string
}) {
  // 1. Create supplier payment draft
  const createRes = await callRpc<{ id: string; document_number: string; status: string }>(
    'create_supplier_payment',
    {
      p_input: {
        branch_id: payload.branch_id,
        vendor_id: payload.vendor_id,
        purchase_id: payload.purchase_id || null,
        payment_date: payload.payment_date,
        payment_method: payload.payment_method,
        amount: payload.amount,
        bank_account_id: payload.bank_account_id || null,
        cheque_id: payload.cheque_id || null,
        reference_number: payload.reference_number || null,
        notes: payload.notes || null,
      },
    }
  )
  throwOnError(createRes.error)

  const paymentId = createRes.data?.id
  if (!paymentId) {
    throw new Error('Failed to create supplier payment draft')
  }

  // 2. Post supplier payment
  const postRes = await callRpc<{ id: string; document_number: string; status: string }>(
    'post_supplier_payment',
    {
      p_payment_id: paymentId,
    }
  )
  throwOnError(postRes.error)
  return postRes.data
}

export async function fetchSupplierPaymentsHistory(limit = 100) {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('purchase_payments')
    .select(`
      *,
      vendor:vendor_id (id, name, vendor_code, phone),
      branch:branch_id (id, name),
      purchase:purchase_id (id, purchase_number, grand_total)
    `)
    .eq('company_id', companyId)
    .order('payment_date', { ascending: false })
    .limit(limit)

  throwOnError(error)
  return (data || []) as unknown as Array<{
    id: string
    payment_number: string
    payment_date: string
    payment_method: string
    amount: number
    status: string
    reference_number?: string
    notes?: string
    vendor?: { id: string; name: string; vendor_code: string; phone?: string }
    branch?: { id: string; name: string }
    purchase?: { id: string; purchase_number: string; grand_total: number }
  }>
}


// ============================================================================
// 4. Direct Incomes & Expenses
// ============================================================================

export async function fetchIncomeExpenseEntries(
  type?: 'income' | 'expense',
  limit = 100
): Promise<IncomeAndExpenseEntry[]> {
  const companyId = await currentCompanyId()
  let query = getTable('income_and_expense_entries')
    .select(`
      *,
      category_account:category_account_id (id, account_name, account_code),
      paid_through_account:paid_through_account_id (id, account_name, account_code),
      branch:branch_id (id, name)
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) {
    query = query.eq('transaction_type', type)
  }

  const { data, error } = await query
  throwOnError(error)
  return (data || []) as unknown as IncomeAndExpenseEntry[]
}

export async function createAndPostIncomeExpense(payload: {
  branch_id: string
  transaction_type: 'income' | 'expense'
  category_account_id: string
  paid_through_account_id: string
  amount: number
  payee_or_payer: string
  payment_mode?: 'cash' | 'bank_transfer' | 'cheque' | 'card'
  reference_number?: string
  notes?: string
}): Promise<{ success: boolean; entry_number: string; status: string }> {
  const companyId = await currentCompanyId()

  const prefix = payload.transaction_type === 'expense' ? 'EXP-' : 'INC-'
  const entryNumber = `${prefix}${Date.now().toString().slice(-6)}`

  // 1. Insert voucher
  const { data: record, error: insErr } = await getTable('income_and_expense_entries')
    .insert({
      company_id: companyId,
      branch_id: payload.branch_id,
      entry_number: entryNumber,
      transaction_type: payload.transaction_type,
      category_account_id: payload.category_account_id,
      paid_through_account_id: payload.paid_through_account_id,
      amount: payload.amount,
      payee_or_payer: payload.payee_or_payer,
      payment_mode: payload.payment_mode || 'cash',
      reference_number: payload.reference_number || null,
      notes: payload.notes || null,
      status: 'draft',
    })
    .select()
    .single()

  throwOnError(insErr)
  const entry = record as unknown as { id: string }

  // 2. Post atomically via post_income_expense RPC
  const postRes = await callRpc<{ success: boolean; entry_number: string; status: string }>(
    'post_income_expense',
    {
      p_entry_id: entry.id,
    }
  )

  throwOnError(postRes.error)
  return postRes.data
}

// ============================================================================
// 5. Cash Book & Bank Book
// ============================================================================

export async function fetchCashAndBankAccounts() {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('chart_of_accounts')
    .select('id, account_code, account_name, subtype')
    .eq('company_id', companyId)
    .in('subtype', ['cash', 'bank'])
    .order('account_code', { ascending: true })

  throwOnError(error)
  return (data || []) as unknown as Array<{
    id: string
    account_code: string
    account_name: string
    subtype: 'cash' | 'bank'
  }>
}

export async function fetchCashBankLedger(
  branchId: string | null,
  accountId: string,
  dateFrom: string,
  dateTo: string
): Promise<CashBankLedgerReport> {
  const res = await callRpc<CashBankLedgerReport>('get_cash_bank_ledger', {
    p_branch_id: branchId && branchId !== 'all' ? branchId : null,
    p_account_id: accountId,
    p_date_from: dateFrom,
    p_date_to: dateTo,
  })

  throwOnError(res.error)
  return res.data
}

// ============================================================================
// 6. Bank Reconciliation Engine
// ============================================================================

export async function fetchBankAccountsLookup() {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('bank_accounts')
    .select('id, bank_name, account_number, account_name, gl_account_id')
    .eq('company_id', companyId)
    .eq('is_active', true)

  throwOnError(error)
  return (data || []) as unknown as Array<{
    id: string
    bank_name: string
    account_number: string
    account_name: string
    gl_account_id?: string
  }>
}

export async function fetchBankStatements(bankAccountId: string): Promise<BankStatement[]> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('bank_statements')
    .select('*')
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId)
    .order('statement_date', { ascending: false })

  throwOnError(error)
  return (data || []) as unknown as BankStatement[]
}

export async function createBankStatement(payload: {
  bank_account_id: string
  statement_date: string
  opening_balance: number
  closing_balance: number
}): Promise<BankStatement> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('bank_statements')
    .insert({
      company_id: companyId,
      bank_account_id: payload.bank_account_id,
      statement_date: payload.statement_date,
      opening_balance: payload.opening_balance,
      closing_balance: payload.closing_balance,
      status: 'open',
    })
    .select()
    .single()

  throwOnError(error)
  return data as unknown as BankStatement
}

export async function fetchUnreconciledGLTransactions(
  glAccountId: string,
  statementDate: string
): Promise<GeneralLedgerEntry[]> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('general_ledger_entries')
    .select('*')
    .eq('company_id', companyId)
    .eq('account_id', glAccountId)
    .lte('entry_date', statementDate)
    .order('entry_date', { ascending: true })

  throwOnError(error)
  return (data || []) as unknown as GeneralLedgerEntry[]
}

export async function finalizeBankReconciliation(
  statementId: string,
  clearedItems: Array<{
    general_ledger_entry_id: string
    is_cleared: boolean
    cleared_date?: string
    notes?: string
  }>
): Promise<{ success: boolean; closing_balance: number; cleared_balance: number; variance: number }> {
  const res = await callRpc<{
    success: boolean
    closing_balance: number
    cleared_balance: number
    variance: number
  }>('reconcile_bank_statement', {
    p_statement_id: statementId,
    p_cleared_items: clearedItems,
  })

  throwOnError(res.error)
  return res.data
}
