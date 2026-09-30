import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type { ChequeBook, Cheque, BankCard, ChequeStatus } from '../types/admin'
import { ChequeBookSchema, ChequeSchema, BankCardSchema } from '../types/admin'
import { z } from 'zod'

type RpcResult = { data: unknown; error: { message: string } | null }
const callRpc = (name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

// --- Cheque Books ---

export async function fetchChequeBooks(branchId?: string): Promise<ChequeBook[]> {
  const companyId = await currentCompanyId()
  let query = getTable('cheque_books')
    .select('*, bank_accounts(account_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<ChequeBook & { bank_accounts?: { account_name?: string } }>
  return rows.map((b) => ({
    ...b,
    bank_account_name: b.bank_accounts?.account_name,
  }))
}

export async function createChequeBook(payload: z.infer<typeof ChequeBookSchema>): Promise<ChequeBook> {
  const companyId = await currentCompanyId()
  const valid = ChequeBookSchema.parse(payload)

  const { data, error } = await getTable('cheque_books')
    .insert({
      company_id: companyId,
      branch_id: valid.branch_id,
      bank_account_id: valid.bank_account_id,
      book_number: valid.book_number,
      start_number: valid.start_number,
      end_number: valid.end_number,
      current_number: valid.start_number,
      status: 'active',
    } as unknown as never)
    .select()
    .single()
  throwOnError(error)
  return data as unknown as ChequeBook
}

// --- Cheques Lifecycle ---

export async function fetchCheques(filters?: { branchId?: string; direction?: string; status?: string }): Promise<Cheque[]> {
  const companyId = await currentCompanyId()
  let query = getTable('cheques')
    .select('*, bank_accounts(account_name)')
    .eq('company_id', companyId)
    .order('due_date', { ascending: true })

  if (filters?.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters?.direction) query = query.eq('direction', filters.direction)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<Cheque & { bank_accounts?: { account_name?: string } }>
  return rows.map((c) => ({
    ...c,
    bank_account_name: c.bank_accounts?.account_name,
  }))
}

export async function createCheque(payload: z.infer<typeof ChequeSchema>): Promise<Cheque> {
  const companyId = await currentCompanyId()
  const valid = ChequeSchema.parse(payload)

  const { data, error } = await getTable('cheques')
    .insert({
      company_id: companyId,
      branch_id: valid.branch_id,
      direction: valid.direction,
      bank_account_id: valid.bank_account_id || null,
      cheque_number: valid.cheque_number,
      payee_payor_name: valid.payee_payor_name,
      bank_name: valid.bank_name || null,
      amount: valid.amount,
      issue_date: valid.issue_date || new Date().toISOString().split('T')[0],
      due_date: valid.due_date || new Date().toISOString().split('T')[0],
      status: 'in_hand',
      notes: valid.notes || null,
    } as unknown as never)
    .select()
    .single()
  throwOnError(error)
  return data as unknown as Cheque
}

export async function transitionCheque(
  chequeId: string,
  newStatus: ChequeStatus,
  details?: { depositDate?: string; clearDate?: string; returnReason?: string }
): Promise<void> {
  let rpcSuccess = false
  try {
    const res = await callRpc('transition_cheque_status', {
      p_cheque_id: chequeId,
      p_new_status: newStatus,
      p_deposit_date: details?.depositDate || null,
      p_clear_date: details?.clearDate || null,
      p_return_reason: details?.returnReason || null,
    })
    if (!res?.error) {
      rpcSuccess = true
    }
  } catch {
    rpcSuccess = false
  }

  if (!rpcSuccess) {
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
    }
    if (details?.depositDate) updatePayload.deposit_date = details.depositDate
    if (details?.clearDate) updatePayload.clear_date = details.clearDate
    if (details?.returnReason) updatePayload.return_reason = details.returnReason

    const { error } = await getTable('cheques').update(updatePayload as never).eq('id', chequeId)
    throwOnError(error)
  }
}


// --- Bank Cards ---

export async function fetchBankCards(branchId?: string): Promise<BankCard[]> {
  const companyId = await currentCompanyId()
  let query = getTable('bank_cards')
    .select('*, bank_accounts(account_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<BankCard & { bank_accounts?: { account_name?: string } }>
  return rows.map((card) => ({
    ...card,
    bank_account_name: card.bank_accounts?.account_name,
  }))
}

export async function createBankCard(payload: z.infer<typeof BankCardSchema>): Promise<BankCard> {
  const companyId = await currentCompanyId()
  const valid = BankCardSchema.parse(payload)

  const { data, error } = await getTable('bank_cards')
    .insert({
      company_id: companyId,
      branch_id: valid.branch_id,
      bank_account_id: valid.bank_account_id,
      card_holder: valid.card_holder,
      card_number_last4: valid.card_number_last4,
      card_type: valid.card_type,
      expiry_month: valid.expiry_month,
      expiry_year: valid.expiry_year,
      status: 'active',
    } as unknown as never)
    .select()
    .single()
  throwOnError(error)
  return data as unknown as BankCard
}
