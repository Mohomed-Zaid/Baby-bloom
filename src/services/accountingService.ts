import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type {
  JournalEntry,
  DebitCreditNote,
  TrialBalanceItem,
  DayBookItem,
  ProfitLossItem,
  ExpenseSummaryItem,
} from '../types/admin'
import { JournalEntrySchema, DebitCreditNoteSchema } from '../types/admin'
import { z } from 'zod'

type RpcResult = { data: unknown; error: { message: string } | null }
const callRpc = (name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

// --- Journal Entries & Lines ---

export async function fetchJournalEntries(branchId?: string): Promise<JournalEntry[]> {
  const companyId = await currentCompanyId()
  let query = getTable('journal_entries')
    .select('*, journal_entry_lines(*, chart_of_accounts(account_code, account_name))')
    .eq('company_id', companyId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<
    JournalEntry & {
      journal_entry_lines?: Array<
        Record<string, unknown> & { chart_of_accounts?: { account_code?: string; account_name?: string } }
      >
    }
  >

  return rows.map((entry) => ({
    ...entry,
    lines: (entry.journal_entry_lines || []).map((line) => ({
      account_id: line.account_id as string,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0,
      description: line.description as string | null,
      account_code: line.chart_of_accounts?.account_code,
      account_name: line.chart_of_accounts?.account_name,
    })),
  }))
}

export async function createJournalEntry(payload: z.infer<typeof JournalEntrySchema>): Promise<JournalEntry> {
  const companyId = await currentCompanyId()
  const valid = JournalEntrySchema.parse(payload)

  const totalDebit = valid.lines.reduce((sum, l) => sum + (l.debit || 0), 0)
  const totalCredit = valid.lines.reduce((sum, l) => sum + (l.credit || 0), 0)

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Unbalanced entry! Total Debits (${totalDebit.toFixed(2)}) must equal Total Credits (${totalCredit.toFixed(2)})`)
  }

  const entryNumber = `JE-${Date.now().toString().slice(-6)}`

  const { data: je, error: jeErr } = await getTable('journal_entries')
    .insert({
      company_id: companyId,
      branch_id: valid.branch_id,
      entry_number: entryNumber,
      entry_date: valid.entry_date || new Date().toISOString().split('T')[0],
      description: valid.description,
      reference_type: valid.reference_type || 'manual',
      total_debit: totalDebit,
      total_credit: totalCredit,
      status: 'draft',
    } as unknown as never)
    .select()
    .single()
  throwOnError(jeErr)

  const header = je as unknown as JournalEntry

  const linesToInsert = valid.lines.map((l) => ({
    journal_entry_id: header.id,
    company_id: companyId,
    account_id: l.account_id,
    description: l.description || valid.description,
    debit: l.debit || 0,
    credit: l.credit || 0,
    partner_type: l.partner_type || 'none',
    partner_id: l.partner_id || null,
  }))

  const { error: lineErr } = await getTable('journal_entry_lines').insert(linesToInsert as unknown as never)
  throwOnError(lineErr)

  return header
}

export async function postJournalEntryService(journalEntryId: string, userId: string): Promise<void> {
  const res = await callRpc('post_journal_entry', {
    p_journal_entry_id: journalEntryId,
    p_user_id: userId,
  })
  throwOnError(res.error)
}

// --- Debit / Credit Notes ---

export async function fetchDebitCreditNotes(branchId?: string): Promise<DebitCreditNote[]> {
  const companyId = await currentCompanyId()
  let query = getTable('debit_credit_notes')
    .select('*')
    .eq('company_id', companyId)
    .order('note_date', { ascending: false })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)
  return (data || []) as unknown as DebitCreditNote[]
}

export async function createDebitCreditNote(payload: z.infer<typeof DebitCreditNoteSchema>): Promise<DebitCreditNote> {
  const companyId = await currentCompanyId()
  const valid = DebitCreditNoteSchema.parse(payload)
  const prefix = valid.note_type === 'debit_note' ? 'DN' : 'CN'
  const noteNumber = `${prefix}-${Date.now().toString().slice(-6)}`

  const { data, error } = await getTable('debit_credit_notes')
    .insert({
      company_id: companyId,
      branch_id: valid.branch_id,
      note_number: noteNumber,
      note_type: valid.note_type,
      entity_type: valid.entity_type,
      entity_id: valid.entity_id,
      note_date: valid.note_date || new Date().toISOString().split('T')[0],
      amount: valid.amount,
      reason: valid.reason,
      status: 'draft',
    } as unknown as never)
    .select()
    .single()
  throwOnError(error)
  return data as unknown as DebitCreditNote
}

// --- Financial Reports ---

export async function fetchTrialBalance(): Promise<TrialBalanceItem[]> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('v_trial_balance')
    .select('*')
    .eq('company_id', companyId)
    .order('account_code', { ascending: true })
  throwOnError(error)
  return (data || []) as unknown as TrialBalanceItem[]
}

export async function fetchDayBook(branchId?: string): Promise<DayBookItem[]> {
  const companyId = await currentCompanyId()
  let query = getTable('v_day_book')
    .select('*')
    .eq('company_id', companyId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)
  return (data || []) as unknown as DayBookItem[]
}

export async function fetchProfitLoss(): Promise<ProfitLossItem[]> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('v_profit_loss')
    .select('*')
    .eq('company_id', companyId)
    .order('account_code', { ascending: true })
  throwOnError(error)
  return (data || []) as unknown as ProfitLossItem[]
}

export async function fetchExpenseSummary(branchId?: string): Promise<ExpenseSummaryItem[]> {
  const companyId = await currentCompanyId()
  let query = getTable('v_expense_summary')
    .select('*')
    .eq('company_id', companyId)
    .order('total_expense', { ascending: false })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)
  return (data || []) as unknown as ExpenseSummaryItem[]
}
