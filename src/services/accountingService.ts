import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { currentCompanyId } from './masterData'
import { getStoredChartAccountsList } from './chartOfAccounts'
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

const isUuid = (str: string | null | undefined): boolean =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str))

export function toValidUuid(id: string | null | undefined): string {
  if (!id) return '00000000-0000-4000-8000-000000000000'
  if (isUuid(id)) return id
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0')
  return `${hex}-0000-4000-8000-000000000000`
}

// ── Default Mock Seeds & Local Storage Persistence ────────────────────────────

export const DEFAULT_MOCK_JOURNALS: JournalEntry[] = [
  {
    id: 'je-1',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    entry_number: 'JV-2026-0001',
    entry_date: '2026-10-10',
    description: 'Initial Cashier Float Allocation',
    reference_type: 'manual',
    reference_id: null,
    total_debit: 25000,
    total_credit: 25000,
    status: 'posted',
    created_at: '2026-10-10T08:00:00Z',
    created_by: null,
    posted_at: '2026-10-10T08:05:00Z',
    posted_by: null,
    lines: [
      {
        account_id: 'coa-1010',
        account_code: '1010',
        account_name: 'Petty Cash',
        debit: 25000,
        credit: 0,
        description: 'Till Float Main Register',
      },
      {
        account_id: 'coa-1020',
        account_code: '1020',
        account_name: 'Commercial Bank A/C',
        debit: 0,
        credit: 25000,
        description: 'Bank withdrawal for petty float',
      },
    ],
  },
  {
    id: 'je-2',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    entry_number: 'JV-2026-0002',
    entry_date: '2026-10-12',
    description: 'Monthly Store Utility Provision',
    reference_type: 'manual',
    reference_id: null,
    total_debit: 14500,
    total_credit: 14500,
    status: 'draft',
    created_at: '2026-10-12T09:30:00Z',
    created_by: null,
    posted_at: null,
    posted_by: null,
    lines: [
      {
        account_id: 'coa-6020',
        account_code: '6020',
        account_name: 'Electricity & Water',
        debit: 14500,
        credit: 0,
        description: 'Store electricity accrual',
      },
      {
        account_id: 'coa-2000',
        account_code: '2000',
        account_name: 'Accounts Payable',
        debit: 0,
        credit: 14500,
        description: 'CEB utility bill payable',
      },
    ],
  },
]

export const DEFAULT_MOCK_NOTES: DebitCreditNote[] = [
  {
    id: 'dcn-1',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    note_number: 'DN-2026-0001',
    note_type: 'debit_note',
    entity_type: 'vendor',
    entity_id: 'vend-1',
    entity_name: 'BabyCare Lanka (Pvt) Ltd',
    note_date: '2026-10-11',
    amount: 18500,
    reason: 'Price variance adjustment on PO-0081',
    status: 'posted',
    journal_entry_id: null,
    created_at: '2026-10-11T10:00:00Z',
  },
  {
    id: 'dcn-2',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    note_number: 'CN-2026-0001',
    note_type: 'credit_note',
    entity_type: 'customer',
    entity_id: 'cust-1',
    entity_name: 'Amara Fernando',
    note_date: '2026-10-13',
    amount: 3200,
    reason: 'Store credit allowance for minor box damage',
    status: 'posted',
    journal_entry_id: null,
    created_at: '2026-10-13T14:20:00Z',
  },
]

const STORAGE_KEY_JOURNALS = 'bb_journal_entries_list'
const STORAGE_KEY_NOTES = 'bb_debit_credit_notes_list'

export function getStoredJournalEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_JOURNALS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as JournalEntry[]
    }
  } catch {}
  return [...DEFAULT_MOCK_JOURNALS]
}

export function saveStoredJournalEntries(list: JournalEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_JOURNALS, JSON.stringify(list))
  } catch {}
}

export function getStoredDebitCreditNotes(): DebitCreditNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTES)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as DebitCreditNote[]
    }
  } catch {}
  return [...DEFAULT_MOCK_NOTES]
}

export function saveStoredDebitCreditNotes(list: DebitCreditNote[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(list))
  } catch {}
}

// --- Journal Entries & Lines ---

export async function fetchJournalEntries(branchId?: string): Promise<JournalEntry[]> {
  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId()
      let query = getTable('journal_entries')
        .select('*, journal_entry_lines(*, chart_of_accounts(account_code, account_name))')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (isUuid(companyId)) query = query.eq('company_id', companyId)
      if (branchId && isUuid(branchId)) query = query.eq('branch_id', branchId)

      const { data, error } = await query
      if (!error && data && data.length > 0) {
        const rows = (data || []) as unknown as Array<
          JournalEntry & {
            journal_entry_lines?: Array<
              Record<string, unknown> & { chart_of_accounts?: { account_code?: string; account_name?: string } }
            >
          }
        >
        const mapped = rows.map((entry) => ({
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
        saveStoredJournalEntries(mapped)
        return mapped
      }
    } catch (err) {
      console.warn('Supabase fetchJournalEntries error, using fallback:', err)
    }
  }

  let local = getStoredJournalEntries()
  if (branchId) local = local.filter((j) => j.branch_id === branchId)
  return local
}

export async function createJournalEntry(payload: z.infer<typeof JournalEntrySchema>): Promise<JournalEntry> {
  const valid = JournalEntrySchema.parse(payload)

  const totalDebit = valid.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
  const totalCredit = valid.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Unbalanced entry! Total Debits (${totalDebit.toFixed(2)}) must equal Total Credits (${totalCredit.toFixed(2)})`)
  }

  const localList = getStoredJournalEntries()
  const companyId = await currentCompanyId()
  const entryNumber = `JV-${new Date().getFullYear()}-${String(localList.length + 1).padStart(4, '0')}`
  const entryDate = (valid.entry_date && valid.entry_date.trim() ? valid.entry_date.trim() : new Date().toISOString().split('T')[0]) as string

  let dbHeader: JournalEntry | null = null

  if (!isBackendOffline() && isUuid(companyId)) {
    try {
      const dbBranchId = toValidUuid(valid.branch_id)
      const { data: je, error: jeErr } = await getTable('journal_entries')
        .insert({
          company_id: companyId,
          branch_id: dbBranchId,
          entry_number: entryNumber,
          entry_date: entryDate,
          description: valid.description,
          reference_type: valid.reference_type || 'manual',
          total_debit: totalDebit,
          total_credit: totalCredit,
          status: 'draft',
        } as unknown as never)
        .select()
        .single()

      if (!jeErr && je) {
        dbHeader = je as unknown as JournalEntry

        const linesToInsert = valid.lines.map((l) => ({
          journal_entry_id: dbHeader!.id,
          company_id: companyId,
          account_id: toValidUuid(l.account_id),
          description: l.description || valid.description,
          debit: l.debit || 0,
          credit: l.credit || 0,
          partner_type: l.partner_type || 'none',
          partner_id: l.partner_id ? toValidUuid(l.partner_id) : null,
        }))

        await getTable('journal_entry_lines').insert(linesToInsert as unknown as never)
      }
    } catch (err) {
      console.warn('Supabase createJournalEntry insert failed, using local storage:', err)
    }
  }

  // Get account names/codes from stored chart of accounts
  const coaList = getStoredChartAccountsList()
  const coaMap = new Map(coaList.map((a) => [a.id, a]))

  const newEntry: JournalEntry = dbHeader ?? {
    id: `je-${Date.now()}`,
    company_id: companyId,
    branch_id: valid.branch_id,
    entry_number: entryNumber,
    entry_date: entryDate,
    description: valid.description,
    reference_type: valid.reference_type || 'manual',
    reference_id: null,
    total_debit: totalDebit,
    total_credit: totalCredit,
    status: 'draft',
    created_at: new Date().toISOString(),
    created_by: null,
    posted_at: null,
    posted_by: null,
    lines: valid.lines.map((l) => {
      const acc = coaMap.get(l.account_id)
      return {
        account_id: l.account_id,
        account_code: acc?.account_code || 'ACC',
        account_name: acc?.account_name || 'Account',
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || valid.description,
        partner_type: l.partner_type || 'none',
        partner_id: l.partner_id || null,
      }
    }),
  }

  localList.unshift(newEntry)
  saveStoredJournalEntries(localList)
  return newEntry
}

export async function postJournalEntryService(journalEntryId: string, userId: string): Promise<void> {
  const localList = getStoredJournalEntries()
  const entryIdx = localList.findIndex((j) => j.id === journalEntryId)
  if (entryIdx >= 0) {
    localList[entryIdx]!.status = 'posted'
    localList[entryIdx]!.posted_at = new Date().toISOString()
    saveStoredJournalEntries(localList)
  }

  if (!isBackendOffline() && isUuid(journalEntryId)) {
    try {
      await callRpc('post_journal_entry', {
        p_journal_entry_id: journalEntryId,
        p_user_id: isUuid(userId) ? userId : '00000000-0000-0000-0000-000000000000',
      })
    } catch (err) {
      console.warn('Supabase post_journal_entry error:', err)
    }
  }
}

// --- Debit / Credit Notes ---

export async function fetchDebitCreditNotes(branchId?: string): Promise<DebitCreditNote[]> {
  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId()
      let query = getTable('debit_credit_notes')
        .select('*')
        .order('note_date', { ascending: false })

      if (isUuid(companyId)) query = query.eq('company_id', companyId)
      if (branchId && isUuid(branchId)) query = query.eq('branch_id', branchId)

      const { data, error } = await query
      if (!error && data && data.length > 0) {
        const rows = data as unknown as DebitCreditNote[]
        saveStoredDebitCreditNotes(rows)
        return rows
      }
    } catch (err) {
      console.warn('fetchDebitCreditNotes Supabase error:', err)
    }
  }

  let local = getStoredDebitCreditNotes()
  if (branchId) local = local.filter((n) => n.branch_id === branchId)
  return local
}

export async function createDebitCreditNote(payload: z.infer<typeof DebitCreditNoteSchema>): Promise<DebitCreditNote> {
  const valid = DebitCreditNoteSchema.parse(payload)
  const localList = getStoredDebitCreditNotes()
  const companyId = await currentCompanyId()
  const prefix = valid.note_type === 'debit_note' ? 'DN' : 'CN'
  const noteNumber = `${prefix}-${new Date().getFullYear()}-${String(localList.length + 1).padStart(4, '0')}`

  let dbNote: DebitCreditNote | null = null

  if (!isBackendOffline() && isUuid(companyId)) {
    try {
      const { data, error } = await getTable('debit_credit_notes')
        .insert({
          company_id: companyId,
          branch_id: toValidUuid(valid.branch_id),
          note_number: noteNumber,
          note_type: valid.note_type,
          entity_type: valid.entity_type,
          entity_id: toValidUuid(valid.entity_id),
          note_date: valid.note_date || new Date().toISOString().split('T')[0],
          amount: valid.amount,
          reason: valid.reason,
          status: 'draft',
        } as unknown as never)
        .select()
        .single()

      if (!error && data) {
        dbNote = data as unknown as DebitCreditNote
      }
    } catch (err) {
      console.warn('createDebitCreditNote Supabase error:', err)
    }
  }

  const noteDate = (valid.note_date && valid.note_date.trim() ? valid.note_date.trim() : new Date().toISOString().split('T')[0]) as string

  const newNote: DebitCreditNote = dbNote ?? {
    id: `dcn-${Date.now()}`,
    company_id: companyId,
    branch_id: valid.branch_id,
    note_number: noteNumber,
    note_type: valid.note_type,
    entity_type: valid.entity_type,
    entity_id: valid.entity_id,
    note_date: noteDate,
    amount: valid.amount,
    reason: valid.reason,
    status: 'draft',
    journal_entry_id: null,
    created_at: new Date().toISOString(),
  }

  localList.unshift(newNote)
  saveStoredDebitCreditNotes(localList)
  return newNote
}

// --- Financial Reports ---

export async function fetchTrialBalance(): Promise<TrialBalanceItem[]> {
  try {
    const companyId = await currentCompanyId()
    const { data, error } = await getTable('v_trial_balance')
      .select('*')
      .eq('company_id', companyId)
      .order('account_code', { ascending: true })
    if (!error && data) return data as unknown as TrialBalanceItem[]
  } catch {}

  const coa = getStoredChartAccountsList()
  return coa.map((a) => ({
    account_id: a.id,
    account_code: a.account_code,
    account_name: a.account_name,
    account_type: a.account_type,
    normal_balance: a.normal_balance,
    total_debit: a.normal_balance === 'debit' ? (a.balance || 0) : 0,
    total_credit: a.normal_balance === 'credit' ? (a.balance || 0) : 0,
    net_balance: a.balance || 0,
  }))
}

export async function fetchDayBook(branchId?: string): Promise<DayBookItem[]> {
  try {
    const companyId = await currentCompanyId()
    let query = getTable('v_day_book')
      .select('*')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (isUuid(companyId)) query = query.eq('company_id', companyId)
    if (branchId && isUuid(branchId)) query = query.eq('branch_id', branchId)

    const { data, error } = await query
    if (!error && data) return data as unknown as DayBookItem[]
  } catch {}

  return []
}

export async function fetchProfitLoss(): Promise<ProfitLossItem[]> {
  try {
    const companyId = await currentCompanyId()
    const { data, error } = await getTable('v_profit_loss')
      .select('*')
      .order('account_code', { ascending: true })
    if (isUuid(companyId)) {
      // view filter if applicable
    }
    if (!error && data) return data as unknown as ProfitLossItem[]
  } catch {}

  return []
}

export async function fetchExpenseSummary(branchId?: string): Promise<ExpenseSummaryItem[]> {
  try {
    const companyId = await currentCompanyId()
    let query = getTable('v_expense_summary')
      .select('*')
      .order('total_expense', { ascending: false })

    if (isUuid(companyId)) query = query.eq('company_id', companyId)
    if (branchId && isUuid(branchId)) query = query.eq('branch_id', branchId)

    const { data, error } = await query
    if (!error && data) return data as unknown as ExpenseSummaryItem[]
  } catch {}

  return []
}
