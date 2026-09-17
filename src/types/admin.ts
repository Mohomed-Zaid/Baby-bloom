import { z } from 'zod'
import type { UUID, ISODate, ISODateTime } from './domain'

// User Permissions & Privileges
export interface UserPermissionOverride {
  user_id: UUID
  permission_id: UUID
  company_id: UUID
  is_allowed: boolean
  created_at: ISODateTime
  permission_key?: string
  module?: string
  name?: string
}

export interface PrivilegeMatrixRow {
  permission_id: UUID
  permission_key: string
  module: string
  name: string
  description: string | null
  role_allowed: boolean
  user_override: boolean | null // null = inheriting from role, true = granted, false = revoked
  effective_allowed: boolean
}

// POS Registers / Counters & Shifts
export interface PosRegister {
  id: UUID
  company_id: UUID
  branch_id: UUID
  register_code: string
  name: string
  is_active: boolean
  is_locked: boolean
  current_cashier_id: UUID | null
  created_at: ISODateTime
  updated_at: ISODateTime
  branch_name?: string
  cashier_name?: string
}

export const PosRegisterSchema = z.object({
  branch_id: z.string().uuid(),
  register_code: z.string().min(1, 'Register code is required'),
  name: z.string().min(1, 'Register name is required'),
  is_active: z.boolean().default(true),
})

export interface PosShift {
  id: UUID
  company_id: UUID
  branch_id: UUID
  register_id: UUID
  cashier_id: UUID
  opened_at: ISODateTime
  closed_at: ISODateTime | null
  opening_balance: number
  closing_balance_expected: number
  closing_balance_actual: number
  cash_sales: number
  card_sales: number
  cheque_sales: number
  status: 'open' | 'closed' | 'reconciled'
  notes: string | null
  created_at: ISODateTime
  updated_at: ISODateTime
  register_name?: string
  cashier_name?: string
}

export const OpenShiftSchema = z.object({
  register_id: z.string().uuid(),
  opening_balance: z.number().min(0, 'Opening balance must be 0 or positive'),
  notes: z.string().optional(),
})

export const CloseShiftSchema = z.object({
  shift_id: z.string().uuid(),
  closing_balance_actual: z.number().min(0, 'Closing balance must be 0 or positive'),
  notes: z.string().optional(),
})

// Cheques & Cheque Books
export type ChequeStatus = 'in_hand' | 'deposited' | 'cleared' | 'returned' | 'cancelled'
export type ChequeDirection = 'inbound' | 'outbound'

export interface ChequeBook {
  id: UUID
  company_id: UUID
  branch_id: UUID
  bank_account_id: UUID
  book_number: string
  start_number: string
  end_number: string
  current_number: string
  status: 'active' | 'exhausted' | 'cancelled'
  created_at: ISODateTime
  created_by: UUID | null
  bank_account_name?: string
}

export const ChequeBookSchema = z.object({
  branch_id: z.string().uuid(),
  bank_account_id: z.string().uuid(),
  book_number: z.string().min(1, 'Book number is required'),
  start_number: z.string().min(1, 'Start cheque number is required'),
  end_number: z.string().min(1, 'End cheque number is required'),
})

export interface Cheque {
  id: UUID
  company_id: UUID
  branch_id: UUID
  direction: ChequeDirection
  bank_account_id: UUID | null
  cheque_book_id: UUID | null
  cheque_number: string
  payee_payor_name: string
  bank_name: string | null
  amount: number
  issue_date: ISODate
  due_date: ISODate
  status: ChequeStatus
  deposit_date: ISODate | null
  clear_date: ISODate | null
  return_reason: string | null
  reference_type: string | null
  reference_id: UUID | null
  notes: string | null
  created_at: ISODateTime
  created_by: UUID | null
  bank_account_name?: string
}

export const ChequeSchema = z.object({
  branch_id: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  bank_account_id: z.string().uuid().optional().nullable(),
  cheque_number: z.string().min(1, 'Cheque number is required'),
  payee_payor_name: z.string().min(1, 'Payee or Payor name is required'),
  bank_name: z.string().optional(),
  amount: z.number().positive('Amount must be positive'),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
})

// Bank Cards
export interface BankCard {
  id: UUID
  company_id: UUID
  branch_id: UUID
  bank_account_id: UUID
  card_holder: string
  card_number_last4: string
  card_type: 'debit' | 'credit'
  expiry_month: number
  expiry_year: number
  status: 'active' | 'blocked' | 'expired'
  created_at: ISODateTime
  bank_account_name?: string
}

export const BankCardSchema = z.object({
  branch_id: z.string().uuid(),
  bank_account_id: z.string().uuid(),
  card_holder: z.string().min(1, 'Card holder name is required'),
  card_number_last4: z.string().regex(/^[0-9]{4}$/, 'Must be 4 digits'),
  card_type: z.enum(['debit', 'credit']),
  expiry_month: z.number().int().min(1).max(12),
  expiry_year: z.number().int().min(2024),
})

// Accounting Journal Entries & Notes
export interface JournalEntryLine {
  id?: UUID
  journal_entry_id?: UUID
  company_id?: UUID
  account_id: UUID
  description?: string | null
  debit: number
  credit: number
  partner_type?: 'customer' | 'vendor' | 'staff' | 'none'
  partner_id?: UUID | null
  account_code?: string
  account_name?: string
}

export interface JournalEntry {
  id: UUID
  company_id: UUID
  branch_id: UUID
  entry_number: string
  entry_date: ISODate
  description: string
  reference_type: string | null
  reference_id: UUID | null
  total_debit: number
  total_credit: number
  status: 'draft' | 'posted' | 'cancelled'
  created_at: ISODateTime
  created_by: UUID | null
  posted_at: ISODateTime | null
  posted_by: UUID | null
  lines?: JournalEntryLine[]
}

export const JournalEntrySchema = z.object({
  branch_id: z.string().uuid(),
  entry_date: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  reference_type: z.string().optional(),
  lines: z.array(z.object({
    account_id: z.string().uuid(),
    description: z.string().optional(),
    debit: z.number().min(0),
    credit: z.number().min(0),
    partner_type: z.enum(['customer', 'vendor', 'staff', 'none']).optional(),
    partner_id: z.string().uuid().optional().nullable(),
  })).min(2, 'Journal entry must have at least 2 lines'),
})

export interface DebitCreditNote {
  id: UUID
  company_id: UUID
  branch_id: UUID
  note_number: string
  note_type: 'debit_note' | 'credit_note'
  entity_type: 'customer' | 'vendor'
  entity_id: UUID
  note_date: ISODate
  amount: number
  reason: string
  status: 'draft' | 'posted' | 'cancelled'
  journal_entry_id: UUID | null
  created_at: ISODateTime
  entity_name?: string
}

export const DebitCreditNoteSchema = z.object({
  branch_id: z.string().uuid(),
  note_type: z.enum(['debit_note', 'credit_note']),
  entity_type: z.enum(['customer', 'vendor']),
  entity_id: z.string().uuid(),
  note_date: z.string().optional(),
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
})

// Financial Reports Data Models
export interface TrialBalanceItem {
  account_id: UUID
  account_code: string
  account_name: string
  account_type: string
  normal_balance: string
  total_debit: number
  total_credit: number
  net_balance: number
}

export interface DayBookItem {
  branch_id: UUID
  entry_date: ISODate
  entry_number: string
  entry_description: string
  line_id: UUID
  account_code: string
  account_name: string
  line_description: string | null
  debit: number
  credit: number
  created_at: ISODateTime
}

export interface ProfitLossItem {
  account_type: string
  account_code: string
  account_name: string
  net_amount: number
}

export interface ExpenseSummaryItem {
  branch_id: UUID
  branch_name: string
  account_code: string
  account_name: string
  total_expense: number
}
