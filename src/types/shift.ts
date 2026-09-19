import { z } from 'zod'
import type { UUID, ISODateTime } from './domain'

export type PosSessionStatus = 'open' | 'closed' | 'audited'
export type CashMovementType = 'cash_in' | 'cash_out' | 'drop_to_safe' | 'float_adjustment'

export interface PosRegisterSession {
  id: UUID
  company_id: UUID
  branch_id: UUID
  cashier_id: UUID
  terminal_name: string
  opened_at: ISODateTime
  closed_at: ISODateTime | null
  opening_cash_float: number
  closing_cash_counted: number | null
  expected_cash_balance: number | null
  cash_difference: number | null
  total_sales_cash: number
  total_sales_card: number
  total_sales_credit: number
  total_sales_cheque: number
  status: PosSessionStatus
  auto_journal_id?: UUID | null
  notes: string | null
  created_at: ISODateTime
  updated_at: ISODateTime
  branch_name?: string
  cashier_name?: string
}

export interface PosCashMovement {
  id: UUID
  session_id: UUID
  company_id: UUID
  branch_id: UUID
  movement_type: CashMovementType
  amount: number
  reason: string
  authorized_by_id: UUID | null
  created_at: ISODateTime
  authorized_by_name?: string
}

export interface ActiveShiftMetrics {
  id: UUID
  branch_id: UUID
  branch_name?: string
  cashier_id: UUID
  cashier_name?: string
  terminal_name: string
  opened_at: ISODateTime
  opening_cash_float: number
  current_drawer_cash: number
  total_sales_cash: number
  total_sales_card: number
  total_sales_cheque: number
  total_sales_credit: number
  cash_in: number
  cash_out: number
  safe_drops: number
  status: PosSessionStatus
}

export interface DenominationCounts {
  note_5000: number
  note_1000: number
  note_500: number
  note_100: number
  note_50: number
  note_20: number
  coins: number
}

export interface ZReportData {
  session_id: UUID
  company_name: string
  branch_name: string
  terminal_name: string
  cashier_name: string
  opened_at: ISODateTime
  closed_at: ISODateTime
  opening_float: number
  total_sales_cash: number
  total_sales_card: number
  total_sales_cheque: number
  total_sales_credit: number
  gross_sales: number
  cash_in: number
  cash_out: number
  safe_drops: number
  expected_cash: number
  counted_cash: number
  variance: number
  auto_journal_id?: UUID | null
  invoice_count: number
  notes?: string | null
  denominations?: DenominationCounts
}

export const OpenPosShiftSchema = z.object({
  branch_id: z.string().uuid('Please select a valid branch'),
  terminal_name: z.string().min(1, 'Terminal name is required'),
  opening_float: z.number().min(0, 'Opening cash float cannot be negative'),
})

export const CashMovementSchema = z.object({
  session_id: z.string().uuid(),
  movement_type: z.enum(['cash_in', 'cash_out', 'drop_to_safe', 'float_adjustment']),
  amount: z.number().positive('Amount must be greater than 0'),
  reason: z.string().min(1, 'Reason is required'),
  authorized_by_id: z.string().uuid().optional(),
})

export const ClosePosShiftSchema = z.object({
  session_id: z.string().uuid(),
  closing_cash_counted: z.number().min(0, 'Counted cash cannot be negative'),
  notes: z.string().optional(),
})
