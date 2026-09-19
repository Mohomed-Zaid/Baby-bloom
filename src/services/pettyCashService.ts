import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type { PettyCashVoucher, PettyCashSummary } from '../types/pettyCash'
import { PettyCashVoucherSchema, ReplenishPettyCashSchema } from '../types/pettyCash'
import { z } from 'zod'

type RpcResult<T = unknown> = { data: T; error: { message: string } | null }
const callRpc = <T = unknown>(name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

export async function fetchPettyCashVouchers(branchId?: string): Promise<PettyCashVoucher[]> {
  const companyId = await currentCompanyId()
  let query = getTable('petty_cash_vouchers')
    .select('*, branches(name), chart_of_accounts(account_name, account_code)')
    .eq('company_id', companyId)
    .order('voucher_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<
    PettyCashVoucher & {
      branches?: { name?: string }
      chart_of_accounts?: { account_name?: string; account_code?: string }
    }
  >

  return rows.map((r) => ({
    ...r,
    branch_name: r.branches?.name,
    expense_account_name: r.chart_of_accounts?.account_name,
    expense_account_code: r.chart_of_accounts?.account_code,
  }))
}

export async function createPettyCashVoucher(
  payload: z.infer<typeof PettyCashVoucherSchema>
): Promise<PettyCashVoucher> {
  const companyId = await currentCompanyId()
  const valid = PettyCashVoucherSchema.parse(payload)

  // Generate next voucher number sequence
  const seqRes = await callRpc<string>('next_document_number', {
    company_uuid: companyId,
    branch_uuid: valid.branch_id,
    doc_type: 'payment',
  })

  const finalVoucherNumber = seqRes.error || !seqRes.data ? `PCV-${Date.now().toString().slice(-6)}` : String(seqRes.data)

  const { data, error } = await getTable('petty_cash_vouchers')
    .insert({
      company_id: companyId,
      branch_id: valid.branch_id,
      voucher_number: finalVoucherNumber,
      voucher_date: valid.voucher_date,
      expense_account_id: valid.expense_account_id,
      payee: valid.payee,
      amount: valid.amount,
      description: valid.description,
      receipt_attachment_url: valid.receipt_attachment_url || null,
      status: 'draft',
    } as unknown as never)
    .select()
    .single()
  throwOnError(error)

  return data as unknown as PettyCashVoucher
}

export async function approvePettyCashVoucher(voucherId: string): Promise<void> {
  const companyId = await currentCompanyId()
  const client = requireSupabase()
  const { data: user } = await client.auth.getUser()

  const { error } = await getTable('petty_cash_vouchers')
    .update({
      status: 'approved',
      approved_by: user?.user?.id || null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as never)
    .eq('id', voucherId)
    .eq('company_id', companyId)
  throwOnError(error)
}

export async function postPettyCashVoucher(
  voucherId: string
): Promise<{ success: boolean; voucher_id: string; voucher_number: string; journal_entry_id: string; amount: number; status: string }> {
  const res = await callRpc<{ success: boolean; voucher_id: string; voucher_number: string; journal_entry_id: string; amount: number; status: string }>(
    'post_petty_cash_voucher',
    {
      p_voucher_id: voucherId,
    }
  )
  throwOnError(res.error)
  return res.data
}

export async function replenishPettyCashService(
  payload: z.infer<typeof ReplenishPettyCashSchema>
): Promise<{ success: boolean; journal_entry_id: string; journal_entry_number: string; amount: number }> {
  const valid = ReplenishPettyCashSchema.parse(payload)
  const res = await callRpc<{
    success: boolean
    journal_entry_id: string
    journal_entry_number: string
    amount: number
  }>('replenish_petty_cash', {
    p_branch_id: valid.branch_id,
    p_source_account_id: valid.source_account_id,
    p_amount: valid.amount,
    p_reference: valid.reference || null,
  })
  throwOnError(res.error)
  return res.data
}

export async function fetchPettyCashSummary(branchId?: string): Promise<PettyCashSummary> {
  const companyId = await currentCompanyId()

  // 1. Fetch live balance from GL
  const res = await callRpc<{ petty_cash_balance: number }>('get_dashboard_summary', {
    p_branch_id: branchId || null,
  })

  // 2. Fetch vouchers aggregate
  let q = getTable('petty_cash_vouchers').select('status, amount, voucher_date').eq('company_id', companyId)
  if (branchId) q = q.eq('branch_id', branchId)

  const { data: vouchers, error } = await q
  throwOnError(error)

  const list = (vouchers || []) as Array<{ status: string; amount: number; voucher_date: string }>
  const currentMonth = new Date().toISOString().slice(0, 7)

  const totalDisbursedMonth = list
    .filter((v) => v.status === 'posted' && v.voucher_date.startsWith(currentMonth))
    .reduce((sum, v) => sum + Number(v.amount), 0)

  const pendingApproval = list.filter((v) => v.status === 'draft')
  const pendingAmount = pendingApproval.reduce((sum, v) => sum + Number(v.amount), 0)
  const postedCount = list.filter((v) => v.status === 'posted').length

  return {
    current_balance: res.data?.petty_cash_balance ?? 0,
    total_disbursed_month: totalDisbursedMonth,
    pending_approval_count: pendingApproval.length,
    pending_approval_amount: pendingAmount,
    posted_vouchers_count: postedCount,
  }
}
