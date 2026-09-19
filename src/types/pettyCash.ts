import { z } from 'zod'
import type { UUID, ISODate, ISODateTime } from './domain'

export type PettyCashStatus = 'draft' | 'approved' | 'posted' | 'reimbursed'

export interface PettyCashVoucher {
  id: UUID
  company_id: UUID
  branch_id: UUID
  voucher_number: string
  voucher_date: ISODate
  expense_account_id: UUID
  payee: string
  amount: number
  description: string
  receipt_attachment_url: string | null
  status: PettyCashStatus
  journal_entry_id: UUID | null
  created_by: UUID | null
  approved_by: UUID | null
  approved_at: ISODateTime | null
  posted_at: ISODateTime | null
  posted_by: UUID | null
  created_at: ISODateTime
  updated_at: ISODateTime
  branch_name?: string
  expense_account_name?: string
  expense_account_code?: string
  creator_name?: string
  approver_name?: string
}

export interface PettyCashSummary {
  current_balance: number
  total_disbursed_month: number
  pending_approval_count: number
  pending_approval_amount: number
  posted_vouchers_count: number
}

export const PettyCashVoucherSchema = z.object({
  branch_id: z.string().uuid('Please select a branch'),
  voucher_date: z.string().min(1, 'Voucher date is required'),
  expense_account_id: z.string().uuid('Please select an expense account'),
  payee: z.string().min(1, 'Payee name is required'),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  receipt_attachment_url: z.string().optional().nullable(),
})

export const ReplenishPettyCashSchema = z.object({
  branch_id: z.string().uuid('Please select a branch'),
  source_account_id: z.string().uuid('Please select a bank or cash source account'),
  amount: z.number().positive('Replenishment amount must be positive'),
  reference: z.string().optional(),
})
