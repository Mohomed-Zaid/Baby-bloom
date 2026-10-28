import { requireSupabase } from './client'
import { currentCompanyId } from './masterData'
import { isBackendOffline } from '../lib/supabase'
import type { ChequeBook, Cheque, BankCard, ChequeStatus } from '../types/admin'
import { ChequeBookSchema, ChequeSchema, BankCardSchema } from '../types/admin'
import { z } from 'zod'

type RpcResult = { data: unknown; error: { message: string } | null }
const callRpc = (name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

const isUuid = (str: string | null | undefined): boolean =>
  typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)

function toValidUuid(val: string): string {
  if (isUuid(val)) return val
  let hash = 0
  for (let i = 0; i < val.length; i++) {
    hash = (hash << 5) - hash + val.charCodeAt(i)
    hash |= 0
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0')
  return `00000000-0000-4000-8000-${hex.padStart(12, '0')}`
}

export const STORAGE_KEY_CHEQUES = 'bb_cheques_list'
export const STORAGE_KEY_BOOKS = 'bb_cheque_books_list'
export const STORAGE_KEY_CARDS = 'bb_bank_cards_list'

// ── Default Mock Seeds ────────────────────────────────────────────────────────

export const DEFAULT_CHEQUE_BOOKS: ChequeBook[] = [
  {
    id: 'cb-00100000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    bank_account_id: 'bank-acc-comb',
    book_number: 'CB-COMB-2026-01',
    start_number: '100201',
    end_number: '100250',
    current_number: '100206',
    status: 'active',
    created_at: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    created_by: null,
    bank_account_name: 'Commercial Bank Current A/C (Colombo Flagship)',
  },
  {
    id: 'cb-00200000-0000-0000-0000-000000000002',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    bank_account_id: 'bank-acc-hnb',
    book_number: 'CB-HNB-2026-01',
    start_number: '300101',
    end_number: '300150',
    current_number: '300101',
    status: 'active',
    created_at: new Date(Date.now() - 15 * 86400 * 1000).toISOString(),
    created_by: null,
    bank_account_name: 'Hatton National Bank Operational A/C',
  },
]

export const DEFAULT_CHEQUES: Cheque[] = [
  {
    id: 'chq-00100000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    direction: 'inbound',
    bank_account_id: 'bank-acc-comb',
    cheque_book_id: null,
    cheque_number: 'CHQ-882101',
    payee_payor_name: 'Saman Perera (Nugegoda)',
    bank_name: 'Commercial Bank of Ceylon',
    amount: 45000,
    issue_date: new Date(Date.now() - 3 * 86400 * 1000).toISOString().split('T')[0] || '',
    due_date: new Date(Date.now() + 1 * 86400 * 1000).toISOString().split('T')[0] || '',
    status: 'in_hand',
    deposit_date: null,
    clear_date: null,
    return_reason: null,
    reference_type: 'invoice',
    reference_id: null,
    notes: 'Advance booking payment for baby cot & travel mattress',
    created_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
    created_by: null,
    bank_account_name: 'Commercial Bank Current A/C (Colombo Flagship)',
  },
  {
    id: 'chq-00200000-0000-0000-0000-000000000002',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    direction: 'inbound',
    bank_account_id: 'bank-acc-hnb',
    cheque_book_id: null,
    cheque_number: 'CHQ-739112',
    payee_payor_name: 'Baby Land Retailers (Pvt) Ltd',
    bank_name: 'Hatton National Bank',
    amount: 125000,
    issue_date: new Date(Date.now() - 5 * 86400 * 1000).toISOString().split('T')[0] || '',
    due_date: new Date(Date.now() + 3 * 86400 * 1000).toISOString().split('T')[0] || '',
    status: 'in_hand',
    deposit_date: null,
    clear_date: null,
    return_reason: null,
    reference_type: 'customer_payment',
    reference_id: null,
    notes: 'Bulk purchase settlement for nursing bottles & silicone warmers',
    created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    created_by: null,
    bank_account_name: 'Hatton National Bank Operational A/C',
  },
  {
    id: 'chq-00300000-0000-0000-0000-000000000003',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-kandy',
    direction: 'inbound',
    bank_account_id: 'bank-acc-sampath',
    cheque_book_id: null,
    cheque_number: 'CHQ-551029',
    payee_payor_name: 'Dr. Anusha Silva',
    bank_name: 'Sampath Bank',
    amount: 280000,
    issue_date: new Date(Date.now() - 4 * 86400 * 1000).toISOString().split('T')[0] || '',
    due_date: new Date(Date.now() + 5 * 86400 * 1000).toISOString().split('T')[0] || '',
    status: 'deposited',
    deposit_date: new Date(Date.now() - 1 * 86400 * 1000).toISOString().split('T')[0] || '',
    clear_date: null,
    return_reason: null,
    reference_type: 'invoice',
    reference_id: null,
    notes: 'Premium stroller & car seat combo clearance',
    created_at: new Date(Date.now() - 4 * 86400 * 1000).toISOString(),
    created_by: null,
    bank_account_name: 'Sampath Bank Corporate Account',
  },
  {
    id: 'chq-00400000-0000-0000-0000-000000000004',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    direction: 'outbound',
    bank_account_id: 'bank-acc-comb',
    cheque_book_id: 'cb-00100000-0000-0000-0000-000000000001',
    cheque_number: 'CHQ-100201',
    payee_payor_name: 'Softlogic Baby Essentials Ltd',
    bank_name: 'Commercial Bank of Ceylon',
    amount: 150000,
    issue_date: new Date(Date.now() - 8 * 86400 * 1000).toISOString().split('T')[0] || '',
    due_date: new Date(Date.now() - 2 * 86400 * 1000).toISOString().split('T')[0] || '',
    status: 'cleared',
    deposit_date: new Date(Date.now() - 4 * 86400 * 1000).toISOString().split('T')[0] || '',
    clear_date: new Date(Date.now() - 2 * 86400 * 1000).toISOString().split('T')[0] || '',
    return_reason: null,
    reference_type: 'vendor_payment',
    reference_id: null,
    notes: 'Vendor invoice INV-SL-8921 part settlement',
    created_at: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
    created_by: null,
    bank_account_name: 'Commercial Bank Current A/C (Colombo Flagship)',
  },
  {
    id: 'chq-00500000-0000-0000-0000-000000000005',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    direction: 'outbound',
    bank_account_id: 'bank-acc-comb',
    cheque_book_id: 'cb-00100000-0000-0000-0000-000000000001',
    cheque_number: 'CHQ-100202',
    payee_payor_name: 'Pigeon Lanka Distributors',
    bank_name: 'Commercial Bank of Ceylon',
    amount: 82500,
    issue_date: new Date(Date.now() - 2 * 86400 * 1000).toISOString().split('T')[0] || '',
    due_date: new Date(Date.now() + 2 * 86400 * 1000).toISOString().split('T')[0] || '',
    status: 'in_hand',
    deposit_date: null,
    clear_date: null,
    return_reason: null,
    reference_type: 'vendor_payment',
    reference_id: null,
    notes: 'Supplier payment for teething accessories and breast pumps',
    created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    created_by: null,
    bank_account_name: 'Commercial Bank Current A/C (Colombo Flagship)',
  },
]

export const DEFAULT_BANK_CARDS: BankCard[] = [
  {
    id: 'card-00100000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    bank_account_id: 'bank-acc-comb',
    card_holder: 'Baby Bloom Operations',
    card_number_last4: '4821',
    card_type: 'debit',
    expiry_month: 11,
    expiry_year: 2028,
    status: 'active',
    created_at: new Date(Date.now() - 60 * 86400 * 1000).toISOString(),
    bank_account_name: 'Commercial Bank Current A/C (Colombo Flagship)',
  },
  {
    id: 'card-00200000-0000-0000-0000-000000000002',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    bank_account_id: 'bank-acc-hnb',
    card_holder: 'Mohomed Zaid',
    card_number_last4: '9105',
    card_type: 'credit',
    expiry_month: 8,
    expiry_year: 2027,
    status: 'active',
    created_at: new Date(Date.now() - 45 * 86400 * 1000).toISOString(),
    bank_account_name: 'Hatton National Bank Operational A/C',
  },
]

// ── Local Storage Accessors ───────────────────────────────────────────────────

export function getStoredCheques(): Cheque[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CHEQUES)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Cheque[]
    }
  } catch {}
  return [...DEFAULT_CHEQUES]
}

export function saveStoredCheques(list: Cheque[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CHEQUES, JSON.stringify(list))
  } catch {}
}

export function getStoredChequeBooks(): ChequeBook[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BOOKS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as ChequeBook[]
    }
  } catch {}
  return [...DEFAULT_CHEQUE_BOOKS]
}

export function saveStoredChequeBooks(list: ChequeBook[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify(list))
  } catch {}
}

export function getStoredBankCards(): BankCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CARDS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as BankCard[]
    }
  } catch {}
  return [...DEFAULT_BANK_CARDS]
}

export function saveStoredBankCards(list: BankCard[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(list))
  } catch {}
}

// ── 1. Cheque Books ──────────────────────────────────────────────────────────

export async function fetchChequeBooks(branchId?: string): Promise<ChequeBook[]> {
  const localList = getStoredChequeBooks()

  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId()
      const client = requireSupabase()
      const session = (await client.auth.getSession()).data.session

      if (session && isUuid(companyId)) {
        let query = getTable('cheque_books')
          .select('*, bank_accounts(account_name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })

        if (branchId && isUuid(branchId)) {
          query = query.eq('branch_id', branchId)
        }

        const { data, error } = await query
        if (!error && data && data.length > 0) {
          const remoteRows = (data as unknown as Array<ChequeBook & { bank_accounts?: { account_name?: string } }>).map(
            (b) => ({
              ...b,
              bank_account_name: b.bank_accounts?.account_name || b.bank_account_name,
            })
          )
          const merged: ChequeBook[] = [...remoteRows]
          for (const loc of localList) {
            if (!merged.some((m) => m.id === loc.id || m.book_number === loc.book_number)) {
              merged.push(loc)
            }
          }
          saveStoredChequeBooks(merged)
          return branchId ? merged.filter((b) => b.branch_id === branchId) : merged
        }
      }
    } catch {
      // fallback
    }
  }

  return branchId ? localList.filter((b) => b.branch_id === branchId) : localList
}

export async function createChequeBook(payload: z.infer<typeof ChequeBookSchema>): Promise<ChequeBook> {
  const valid = ChequeBookSchema.parse(payload)
  const companyId = await currentCompanyId()

  const newBook: ChequeBook = {
    id: `cb-${Date.now()}`,
    company_id: companyId,
    branch_id: valid.branch_id,
    bank_account_id: valid.bank_account_id,
    book_number: valid.book_number,
    start_number: valid.start_number,
    end_number: valid.end_number,
    current_number: valid.start_number,
    status: 'active',
    created_at: new Date().toISOString(),
    created_by: null,
  }

  const existing = getStoredChequeBooks()
  saveStoredChequeBooks([newBook, ...existing])

  if (!isBackendOffline() && isUuid(companyId)) {
    try {
      const client = requireSupabase()
      const session = (await client.auth.getSession()).data.session
      if (session) {
        const { data, error } = await getTable('cheque_books')
          .insert({
            company_id: toValidUuid(companyId),
            branch_id: toValidUuid(valid.branch_id),
            bank_account_id: toValidUuid(valid.bank_account_id),
            book_number: valid.book_number,
            start_number: valid.start_number,
            end_number: valid.end_number,
            current_number: valid.start_number,
            status: 'active',
          } as unknown as never)
          .select()
          .single()

        if (!error && data) {
          const inserted = data as unknown as ChequeBook
          newBook.id = inserted.id
          saveStoredChequeBooks([newBook, ...existing])
        }
      }
    } catch {
      // optimistic update maintained
    }
  }

  return newBook
}

// ── 2. Cheques Lifecycle ─────────────────────────────────────────────────────

export async function fetchCheques(filters?: { branchId?: string; direction?: string; status?: string }): Promise<Cheque[]> {
  const localList = getStoredCheques()

  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId()
      const client = requireSupabase()
      const session = (await client.auth.getSession()).data.session

      if (session && isUuid(companyId)) {
        let query = getTable('cheques')
          .select('*, bank_accounts(account_name)')
          .eq('company_id', companyId)
          .order('due_date', { ascending: true })

        if (filters?.branchId && isUuid(filters.branchId)) query = query.eq('branch_id', filters.branchId)
        if (filters?.direction && filters.direction !== 'all') query = query.eq('direction', filters.direction)
        if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status)

        const { data, error } = await query
        if (!error && data && data.length > 0) {
          const remoteRows = (data as unknown as Array<Cheque & { bank_accounts?: { account_name?: string } }>).map(
            (c) => ({
              ...c,
              bank_account_name: c.bank_accounts?.account_name || c.bank_account_name,
            })
          )
          const merged: Cheque[] = [...remoteRows]
          for (const loc of localList) {
            if (!merged.some((m) => m.id === loc.id || m.cheque_number === loc.cheque_number)) {
              merged.push(loc)
            }
          }
          saveStoredCheques(merged)
          return filterCheques(merged, filters)
        }
      }
    } catch {
      // fallback
    }
  }

  return filterCheques(localList, filters)
}

function filterCheques(
  list: Cheque[],
  filters?: { branchId?: string; direction?: string; status?: string }
): Cheque[] {
  let result = [...list]
  if (filters?.branchId && filters.branchId !== 'all') {
    result = result.filter((c) => c.branch_id === filters.branchId)
  }
  if (filters?.direction && filters.direction !== 'all') {
    result = result.filter((c) => c.direction === filters.direction)
  }
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((c) => c.status === filters.status)
  }
  return result
}

export async function createCheque(payload: z.infer<typeof ChequeSchema>): Promise<Cheque> {
  const valid = ChequeSchema.parse(payload)
  const companyId = await currentCompanyId()

  const newCheque: Cheque = {
    id: `chq-${Date.now()}`,
    company_id: companyId,
    branch_id: valid.branch_id,
    direction: valid.direction,
    bank_account_id: valid.bank_account_id || null,
    cheque_book_id: null,
    cheque_number: valid.cheque_number,
    payee_payor_name: valid.payee_payor_name,
    bank_name: valid.bank_name || null,
    amount: valid.amount,
    issue_date: valid.issue_date || new Date().toISOString().split('T')[0] || '',
    due_date: valid.due_date || new Date().toISOString().split('T')[0] || '',
    status: 'in_hand',
    deposit_date: null,
    clear_date: null,
    return_reason: null,
    reference_type: 'direct',
    reference_id: null,
    notes: valid.notes || null,
    created_at: new Date().toISOString(),
    created_by: null,
  }

  const existing = getStoredCheques()
  saveStoredCheques([newCheque, ...existing])

  if (!isBackendOffline() && isUuid(companyId)) {
    try {
      const client = requireSupabase()
      const session = (await client.auth.getSession()).data.session
      if (session) {
        const { data, error } = await getTable('cheques')
          .insert({
            company_id: toValidUuid(companyId),
            branch_id: toValidUuid(valid.branch_id),
            direction: valid.direction,
            bank_account_id: valid.bank_account_id && isUuid(valid.bank_account_id) ? valid.bank_account_id : null,
            cheque_number: valid.cheque_number,
            payee_payor_name: valid.payee_payor_name,
            bank_name: valid.bank_name || null,
            amount: valid.amount,
            issue_date: newCheque.issue_date,
            due_date: newCheque.due_date,
            status: 'in_hand',
            notes: valid.notes || null,
          } as unknown as never)
          .select()
          .single()

        if (!error && data) {
          const inserted = data as unknown as Cheque
          newCheque.id = inserted.id
          saveStoredCheques([newCheque, ...existing])
        }
      }
    } catch {
      // optimistic fallback kept
    }
  }

  return newCheque
}

export async function transitionCheque(
  chequeId: string,
  newStatus: ChequeStatus,
  details?: { depositDate?: string; clearDate?: string; returnReason?: string }
): Promise<void> {
  // Update local storage first
  const existing = getStoredCheques()
  const updatedList = existing.map((c) => {
    if (c.id === chequeId) {
      return {
        ...c,
        status: newStatus,
        deposit_date: details?.depositDate || c.deposit_date,
        clear_date: details?.clearDate || c.clear_date,
        return_reason: details?.returnReason || c.return_reason,
      }
    }
    return c
  })
  saveStoredCheques(updatedList)

  // Then try Supabase if online and UUID is valid
  if (!isBackendOffline() && isUuid(chequeId)) {
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
      try {
        const updatePayload: Record<string, unknown> = {
          status: newStatus,
        }
        if (details?.depositDate) updatePayload.deposit_date = details.depositDate
        if (details?.clearDate) updatePayload.clear_date = details.clearDate
        if (details?.returnReason) updatePayload.return_reason = details.returnReason

        await getTable('cheques').update(updatePayload as never).eq('id', chequeId)
      } catch {
        // optimistic state is persisted locally
      }
    }
  }
}

// ── 3. Bank Cards ────────────────────────────────────────────────────────────

export async function fetchBankCards(branchId?: string): Promise<BankCard[]> {
  const localList = getStoredBankCards()

  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId()
      const client = requireSupabase()
      const session = (await client.auth.getSession()).data.session

      if (session && isUuid(companyId)) {
        let query = getTable('bank_cards')
          .select('*, bank_accounts(account_name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })

        if (branchId && isUuid(branchId)) {
          query = query.eq('branch_id', branchId)
        }

        const { data, error } = await query
        if (!error && data && data.length > 0) {
          const remoteRows = (data as unknown as Array<BankCard & { bank_accounts?: { account_name?: string } }>).map(
            (card) => ({
              ...card,
              bank_account_name: card.bank_accounts?.account_name || card.bank_account_name,
            })
          )
          const merged: BankCard[] = [...remoteRows]
          for (const loc of localList) {
            if (!merged.some((m) => m.id === loc.id || (m.card_holder === loc.card_holder && m.card_number_last4 === loc.card_number_last4))) {
              merged.push(loc)
            }
          }
          saveStoredBankCards(merged)
          return branchId ? merged.filter((c) => c.branch_id === branchId) : merged
        }
      }
    } catch {
      // fallback
    }
  }

  return branchId ? localList.filter((c) => c.branch_id === branchId) : localList
}

export async function createBankCard(payload: z.infer<typeof BankCardSchema>): Promise<BankCard> {
  const valid = BankCardSchema.parse(payload)
  const companyId = await currentCompanyId()

  const newCard: BankCard = {
    id: `card-${Date.now()}`,
    company_id: companyId,
    branch_id: valid.branch_id,
    bank_account_id: valid.bank_account_id,
    card_holder: valid.card_holder,
    card_number_last4: valid.card_number_last4,
    card_type: valid.card_type,
    expiry_month: valid.expiry_month,
    expiry_year: valid.expiry_year,
    status: 'active',
    created_at: new Date().toISOString(),
  }

  const existing = getStoredBankCards()
  saveStoredBankCards([newCard, ...existing])

  if (!isBackendOffline() && isUuid(companyId)) {
    try {
      const client = requireSupabase()
      const session = (await client.auth.getSession()).data.session
      if (session) {
        const { data, error } = await getTable('bank_cards')
          .insert({
            company_id: toValidUuid(companyId),
            branch_id: toValidUuid(valid.branch_id),
            bank_account_id: toValidUuid(valid.bank_account_id),
            card_holder: valid.card_holder,
            card_number_last4: valid.card_number_last4,
            card_type: valid.card_type,
            expiry_month: valid.expiry_month,
            expiry_year: valid.expiry_year,
            status: 'active',
          } as unknown as never)
          .select()
          .single()

        if (!error && data) {
          const inserted = data as unknown as BankCard
          newCard.id = inserted.id
          saveStoredBankCards([newCard, ...existing])
        }
      }
    } catch {
      // fallback
    }
  }

  return newCard
}
