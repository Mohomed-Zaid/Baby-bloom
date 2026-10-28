export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export type AccountSubtype =
  | 'cash'
  | 'bank'
  | 'accounts_receivable'
  | 'accounts_payable'
  | 'inventory'
  | 'direct_income'
  | 'indirect_income'
  | 'operating_expense'
  | 'admin_expense'
  | 'retained_earnings'

export interface ChartOfAccount {
  id: string
  company_id: string
  account_code: string
  account_name: string
  account_type: AccountType
  subtype?: AccountSubtype | null
  normal_balance: 'debit' | 'credit'
  parent_account_id?: string | null
  is_control_account: boolean
  is_system_account: boolean
  allow_manual_entries: boolean
  is_active: boolean
  currency: string
  created_at: string
  updated_at: string
  // Tree navigation
  children?: ChartOfAccount[]
  current_balance?: number
}

export interface GeneralLedgerEntry {
  id: string
  company_id: string
  branch_id: string
  entry_date: string
  entry_type: string
  reference_type: string
  reference_id: string
  reference_number: string
  account_id: string
  debit_amount: number
  credit_amount: number
  narration: string
  reversal_of_id?: string | null
  created_at: string
  account?: ChartOfAccount
  branch?: { id: string; name: string }
}

export interface CustomerReceipt {
  id: string
  company_id: string
  branch_id: string
  receipt_number: string
  receipt_date: string
  customer_id: string
  payment_method: 'cash' | 'bank_transfer' | 'card' | 'cheque'
  amount: number
  bank_account_id?: string | null
  cheque_id?: string | null
  card_reference?: string | null
  notes?: string | null
  status: 'draft' | 'posted' | 'reversed'
  posted_at?: string | null
  created_at: string
  customer?: {
    id: string
    name: string
    customer_code: string
    phone?: string
  }
  allocations?: CustomerReceiptAllocation[]
}

export interface CustomerReceiptAllocation {
  id?: string
  receipt_id?: string
  invoice_id: string
  allocated_amount: number
  invoice?: {
    id: string
    invoice_number: string
    invoice_date: string
    grand_total: number
    paid_amount: number
    balance_amount: number
  }
}

export interface IncomeAndExpenseEntry {
  id: string
  company_id: string
  branch_id: string
  entry_number: string
  entry_date: string
  transaction_type: 'income' | 'expense'
  category_account_id: string
  paid_through_account_id: string
  amount: number
  payee_or_payer: string
  payment_mode: 'cash' | 'bank_transfer' | 'cheque' | 'card'
  reference_number?: string | null
  notes?: string | null
  status: 'draft' | 'posted' | 'reversed'
  posted_at?: string | null
  created_at: string
  category_account?: ChartOfAccount | Partial<ChartOfAccount>
  paid_through_account?: ChartOfAccount | Partial<ChartOfAccount>
  branch?: { id: string; name: string }
}

export interface BankStatement {
  id: string
  company_id: string
  bank_account_id: string
  statement_date: string
  opening_balance: number
  closing_balance: number
  reconciled_at?: string | null
  status: 'open' | 'reconciled'
  created_at?: string
  bank_account?: {
    id: string
    bank_name: string
    account_number: string
    account_name: string
  }
}

export interface BankReconciliationItem {
  id?: string
  bank_statement_id: string
  general_ledger_entry_id: string
  is_cleared: boolean
  cleared_date?: string | null
  notes?: string | null
  gl_entry?: {
    id: string
    entry_date: string
    reference_number: string
    narration: string
    debit_amount: number
    credit_amount: number
  }
}

export interface CashBankLedgerTransaction {
  id: string
  entry_date: string
  entry_type: string
  reference_type: string
  reference_number: string
  inflow: number
  outflow: number
  narration: string
  branch_name: string
  running_balance: number
}

export interface CashBankLedgerReport {
  account_id: string
  account_code: string
  account_name: string
  subtype: string
  opening_balance: number
  total_inflow: number
  total_outflow: number
  closing_balance: number
  transactions: CashBankLedgerTransaction[]
}
