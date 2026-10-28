import { requireSupabase } from './client'
import { currentCompanyId } from './masterData'
import { isBackendOffline } from '../lib/supabase'
import { getStoredDebitCreditNotes, saveStoredDebitCreditNotes } from './accountingService'
import { z } from 'zod'

const db = () => requireSupabase() as any

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

export type NoteType = 'debit_note' | 'credit_note'
export type EntityType = 'customer' | 'vendor'
export type NoteStatus = 'draft' | 'posted' | 'cancelled'

export interface AdjustmentNote {
  id: string
  company_id: string
  branch_id: string
  note_number: string
  note_type: NoteType
  entity_type: EntityType
  entity_id: string
  note_date: string
  amount: number
  reason: string
  status: NoteStatus
  journal_entry_id?: string | null
  created_at: string
  created_by?: string | null
  posted_at?: string | null
  posted_by?: string | null
  // Enriched fields
  entity_name?: string
  entity_code?: string
  entity_phone?: string
  entity_balance?: number
  branch_name?: string
}

export interface AdjustmentNoteFilterParams {
  noteType?: NoteType | 'all'
  entityType?: EntityType | 'all'
  status?: NoteStatus | 'all'
  branchId?: string | 'all'
  search?: string
  dateFrom?: string
  dateTo?: string
}

export const CreateAdjustmentNoteSchema = z.object({
  branch_id: z.string().min(1, 'Please select a valid branch'),
  note_type: z.enum(['debit_note', 'credit_note']),
  entity_type: z.enum(['customer', 'vendor']),
  entity_id: z.string().min(1, 'Please select a customer or supplier'),
  note_date: z.string().min(1, 'Date is required'),
  amount: z.number().positive('Amount must be greater than zero'),
  reason: z.string().min(2, 'Please provide a reason for adjustment'),
  auto_post: z.boolean().optional(),
})

export type CreateAdjustmentNoteInput = z.infer<typeof CreateAdjustmentNoteSchema>

// ── 1. Fetch Next Sequence Number ───────────────────────────────────────────
export async function getNextAdjustmentNoteNumber(
  companyId: string,
  branchId: string,
  noteType: NoteType
): Promise<string> {
  const supabase = db()
  const sequenceType = noteType === 'credit_note' ? 'credit_note' : 'debit_note'
  const fallbackPrefix = noteType === 'credit_note' ? 'CN-' : 'DN-'

  if (isUuid(companyId) && isUuid(branchId) && !isBackendOffline()) {
    try {
      const { data, error } = await supabase.rpc('next_document_number', {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_sequence_type: sequenceType,
      })
      if (!error && data) return String(data)
    } catch {
      // fallback if sequence RPC fails
    }
  }

  const randomSuffix = Math.floor(100000 + Math.random() * 900000)
  return `${fallbackPrefix}${randomSuffix}`
}

// ── 2. Fetch Entity Outstanding Balance ──────────────────────────────────────
export async function fetchPartyOutstandingBalance(
  entityType: EntityType,
  entityId: string
): Promise<number> {
  const supabase = db()
  const companyId = await currentCompanyId()

  if (!isUuid(companyId) || !isUuid(entityId) || isBackendOffline()) {
    return 35000 // default demo balance
  }

  try {
    if (entityType === 'customer') {
      const { data, error } = await supabase
        .from('customer_ledger_entries')
        .select('debit_amount, credit_amount')
        .eq('company_id', companyId)
        .eq('customer_id', entityId)

      if (error || !data) return 0
      return (data as any[]).reduce(
        (sum, r) => sum + (Number(r.debit_amount) || 0) - (Number(r.credit_amount) || 0),
        0
      )
    } else {
      const { data, error } = await supabase
        .from('vendor_ledger_entries')
        .select('debit_amount, credit_amount')
        .eq('company_id', companyId)
        .eq('vendor_id', entityId)

      if (error || !data) return 0
      // Vendor normal balance is credit (Payable)
      return (data as any[]).reduce(
        (sum, r) => sum + (Number(r.credit_amount) || 0) - (Number(r.debit_amount) || 0),
        0
      )
    }
  } catch {
    return 0
  }
}

// ── 3. Fetch Adjustment Notes List ───────────────────────────────────────────
export async function fetchAdjustmentNotes(
  params: AdjustmentNoteFilterParams = {}
): Promise<AdjustmentNote[]> {
  const supabase = db()
  const localStored = getStoredDebitCreditNotes()
  let notes: any[] = []

  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId()
      const session = (await supabase.auth.getSession()).data.session

      if (session) {
        let query = supabase
          .from('debit_credit_notes')
          .select('*')
          .order('note_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (isUuid(companyId)) {
          query = query.eq('company_id', companyId)
        }
        if (params.noteType && params.noteType !== 'all') {
          query = query.eq('note_type', params.noteType)
        }
        if (params.entityType && params.entityType !== 'all') {
          query = query.eq('entity_type', params.entityType)
        }
        if (params.status && params.status !== 'all') {
          query = query.eq('status', params.status)
        }
        if (params.branchId && params.branchId !== 'all' && isUuid(params.branchId)) {
          query = query.eq('branch_id', params.branchId)
        }
        if (params.dateFrom) {
          query = query.gte('note_date', params.dateFrom)
        }
        if (params.dateTo) {
          query = query.lte('note_date', params.dateTo)
        }

        const { data: rawNotes, error } = await query
        if (!error && rawNotes && rawNotes.length > 0) {
          notes = rawNotes as any[]
        }
      }
    } catch {
      // fallback to local stored notes
    }
  }

  if (notes.length === 0) {
    notes = localStored as any[]
    if (params.noteType && params.noteType !== 'all') notes = notes.filter((n) => n.note_type === params.noteType)
    if (params.entityType && params.entityType !== 'all') notes = notes.filter((n) => n.entity_type === params.entityType)
    if (params.status && params.status !== 'all') notes = notes.filter((n) => n.status === params.status)
    if (params.branchId && params.branchId !== 'all') notes = notes.filter((n) => n.branch_id === params.branchId)
    if (params.dateFrom) notes = notes.filter((n) => n.note_date >= params.dateFrom!)
    if (params.dateTo) notes = notes.filter((n) => n.note_date <= params.dateTo!)
  }

  if (notes.length === 0) return []

  // Collect unique entity IDs and branches to batch resolve
  const customerIds = Array.from(new Set(notes.filter((n) => n.entity_type === 'customer').map((n) => n.entity_id))).filter(isUuid)
  const vendorIds = Array.from(new Set(notes.filter((n) => n.entity_type === 'vendor').map((n) => n.entity_id))).filter(isUuid)
  const branchIds = Array.from(new Set(notes.map((n) => n.branch_id))).filter(isUuid)

  let customerMap = new Map<string, any>()
  let vendorMap = new Map<string, any>()
  let branchMap = new Map<string, string>()

  try {
    const [customersRes, vendorsRes, branchesRes] = await Promise.all([
      customerIds.length > 0
        ? supabase.from('customers').select('id, name, code, mobile').in('id', customerIds)
        : Promise.resolve({ data: [] }),
      vendorIds.length > 0
        ? supabase.from('vendors').select('id, name, code, phone').in('id', vendorIds)
        : Promise.resolve({ data: [] }),
      branchIds.length > 0
        ? supabase.from('branches').select('id, name').in('id', branchIds)
        : Promise.resolve({ data: [] }),
    ])

    ;((customersRes.data || []) as any[]).forEach((c: any) => customerMap.set(c.id, c))
    ;((vendorsRes.data || []) as any[]).forEach((v: any) => vendorMap.set(v.id, v))
    ;((branchesRes.data || []) as any[]).forEach((b: any) => branchMap.set(b.id, b.name))
  } catch {
    // fallback
  }

  const enriched: AdjustmentNote[] = notes.map((row) => {
    let entityName = row.entity_name || (row.entity_type === 'customer' ? 'Customer Account' : 'Supplier Account')
    let entityCode = ''
    let entityPhone = ''

    if (row.entity_type === 'customer') {
      const c = customerMap.get(row.entity_id)
      if (c) {
        entityName = c.name
        entityCode = c.code || ''
        entityPhone = c.mobile || ''
      }
    } else {
      const v = vendorMap.get(row.entity_id)
      if (v) {
        entityName = v.name
        entityCode = v.code || ''
        entityPhone = v.phone || ''
      }
    }

    return {
      id: row.id,
      company_id: row.company_id,
      branch_id: row.branch_id,
      note_number: row.note_number,
      note_type: row.note_type,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      note_date: row.note_date,
      amount: Number(row.amount) || 0,
      reason: row.reason,
      status: row.status,
      journal_entry_id: row.journal_entry_id,
      created_at: row.created_at,
      created_by: row.created_by,
      posted_at: row.posted_at,
      posted_by: row.posted_by,
      entity_name: entityName,
      entity_code: entityCode,
      entity_phone: entityPhone,
      branch_name: branchMap.get(row.branch_id) || 'Primary Colombo Branch',
    }
  })

  if (params.search && params.search.trim()) {
    const q = params.search.toLowerCase().trim()
    return enriched.filter(
      (n) =>
        n.note_number.toLowerCase().includes(q) ||
        n.reason.toLowerCase().includes(q) ||
        (n.entity_name && n.entity_name.toLowerCase().includes(q)) ||
        (n.entity_code && n.entity_code.toLowerCase().includes(q))
    )
  }

  return enriched
}

// ── 4. Create Adjustment Note ────────────────────────────────────────────────
export async function createAdjustmentNote(
  input: CreateAdjustmentNoteInput
): Promise<AdjustmentNote> {
  const supabase = db()
  const companyId = await currentCompanyId()
  const validated = CreateAdjustmentNoteSchema.parse(input)

  const noteNumber = await getNextAdjustmentNoteNumber(
    companyId,
    validated.branch_id,
    validated.note_type
  )

  let currentUserId: string | null = null
  try {
    const { data: userRes } = await supabase.auth.getUser()
    currentUserId = userRes?.user?.id || null
  } catch {}

  const initialStatus: NoteStatus = validated.auto_post ? 'posted' : 'draft'

  const createdNote: AdjustmentNote = {
    id: `note-${Date.now()}`,
    company_id: companyId,
    branch_id: validated.branch_id,
    note_number: noteNumber,
    note_type: validated.note_type,
    entity_type: validated.entity_type,
    entity_id: validated.entity_id,
    note_date: validated.note_date,
    amount: validated.amount,
    reason: validated.reason,
    status: initialStatus,
    created_at: new Date().toISOString(),
    created_by: currentUserId,
    posted_at: validated.auto_post ? new Date().toISOString() : null,
    posted_by: validated.auto_post ? currentUserId : null,
  }

  const existingNotes = getStoredDebitCreditNotes()
  saveStoredDebitCreditNotes([createdNote as any, ...existingNotes])

  if (!isBackendOffline() && isUuid(companyId)) {
    try {
      const { data, error } = await supabase
        .from('debit_credit_notes')
        .insert({
          company_id: toValidUuid(companyId),
          branch_id: toValidUuid(validated.branch_id),
          note_number: noteNumber,
          note_type: validated.note_type,
          entity_type: validated.entity_type,
          entity_id: toValidUuid(validated.entity_id),
          note_date: validated.note_date,
          amount: validated.amount,
          reason: validated.reason,
          status: initialStatus,
          created_by: currentUserId,
          posted_at: validated.auto_post ? new Date().toISOString() : null,
          posted_by: validated.auto_post ? currentUserId : null,
        })
        .select()
        .single()

      if (!error && data) {
        createdNote.id = data.id
        saveStoredDebitCreditNotes([createdNote as any, ...existingNotes])
      }
    } catch {
      // optimistic fallback kept
    }
  }

  if (validated.auto_post) {
    try {
      await createLinkedJournalForNote(createdNote)
    } catch (e) {
      console.warn('Note posted but journal creation deferred:', e)
    }
  }

  return createdNote
}

// ── 5. Post Adjustment Note ──────────────────────────────────────────────────
export async function postAdjustmentNote(noteId: string): Promise<void> {
  const localList = getStoredDebitCreditNotes()
  const existingIndex = localList.findIndex((n) => n.id === noteId)
  if (existingIndex !== -1 && localList[existingIndex]) {
    const existing = localList[existingIndex]!
    localList[existingIndex] = {
      ...existing,
      status: 'posted',
    }
    saveStoredDebitCreditNotes(localList)
  }

  if (!isBackendOffline() && isUuid(noteId)) {
    try {
      const supabase = db()
      const { data: userRes } = await supabase.auth.getUser()
      const currentUserId = userRes?.user?.id || null

      const { data: note } = await supabase
        .from('debit_credit_notes')
        .select('*')
        .eq('id', noteId)
        .maybeSingle()

      if (note && note.status === 'draft') {
        await supabase
          .from('debit_credit_notes')
          .update({
            status: 'posted',
            posted_at: new Date().toISOString(),
            posted_by: currentUserId,
          })
          .eq('id', noteId)

        try {
          await createLinkedJournalForNote(note)
        } catch {}
      }
    } catch {
      // optimistic state is persisted
    }
  }
}

// ── 6. Cancel Adjustment Note ────────────────────────────────────────────────
export async function cancelAdjustmentNote(
  noteId: string,
  cancellationReason: string
): Promise<void> {
  const localList = getStoredDebitCreditNotes()
  const existingIndex = localList.findIndex((n) => n.id === noteId)
  if (existingIndex !== -1 && localList[existingIndex]) {
    const existing = localList[existingIndex]!
    localList[existingIndex] = {
      ...existing,
      status: 'cancelled',
      reason: `${existing.reason} [CANCELLED: ${cancellationReason}]`,
    }
    saveStoredDebitCreditNotes(localList)
  }

  if (!isBackendOffline() && isUuid(noteId)) {
    try {
      const supabase = db()
      const { data: note } = await supabase
        .from('debit_credit_notes')
        .select('*')
        .eq('id', noteId)
        .maybeSingle()

      if (note && note.status !== 'cancelled') {
        const updatedReason = `${note.reason} [CANCELLED: ${cancellationReason}]`
        await supabase
          .from('debit_credit_notes')
          .update({
            status: 'cancelled',
            reason: updatedReason,
          })
          .eq('id', noteId)
      }
    } catch {
      // optimistic state is persisted
    }
  }
}

// ── 7. Helper to create balancing Journal Entry for posted note ───────────────
async function createLinkedJournalForNote(note: any): Promise<void> {
  const supabase = db()
  const companyId = await currentCompanyId()

  let accounts: any[] = []
  if (isUuid(companyId) && !isBackendOffline()) {
    try {
      const { data: coaAccounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type, subtype')
        .eq('company_id', companyId)
        .eq('is_active', true)
      if (coaAccounts) accounts = coaAccounts as any[]
    } catch {}
  }
  const arAccount = accounts.find((a: any) => a.account_code === '1100' || a.subtype === 'accounts_receivable' || (a.account_name && a.account_name.toLowerCase().includes('receivable')))
  const apAccount = accounts.find((a: any) => a.account_code === '2100' || a.subtype === 'accounts_payable' || (a.account_name && a.account_name.toLowerCase().includes('payable')))
  const salesAdjAccount = accounts.find((a: any) => a.account_code === '4100' || a.subtype === 'sales_returns' || a.account_type === 'income' || a.account_type === 'expense')
  const purchaseAdjAccount = accounts.find((a: any) => a.account_code === '5100' || a.subtype === 'purchase_returns' || a.account_type === 'cost_of_sales' || a.account_type === 'income')

  let debitAccountId: string | undefined
  let creditAccountId: string | undefined

  if (note.entity_type === 'customer') {
    if (note.note_type === 'credit_note') {
      // Credit Note to Customer: Debit Sales Returns / Adjustment, Credit AR
      debitAccountId = salesAdjAccount?.id || accounts[0]?.id
      creditAccountId = arAccount?.id || accounts[1]?.id
    } else {
      // Debit Note to Customer: Debit AR, Credit Income/Adjustment
      debitAccountId = arAccount?.id || accounts[0]?.id
      creditAccountId = salesAdjAccount?.id || accounts[1]?.id
    }
  } else {
    if (note.note_type === 'debit_note') {
      // Debit Note to Vendor: Debit AP, Credit Purchase Adjustment / Rebate
      debitAccountId = apAccount?.id || accounts[0]?.id
      creditAccountId = purchaseAdjAccount?.id || accounts[1]?.id
    } else {
      // Credit Note from Vendor: Debit Expense/Asset, Credit AP
      debitAccountId = purchaseAdjAccount?.id || accounts[0]?.id
      creditAccountId = apAccount?.id || accounts[1]?.id
    }
  }

  if (!debitAccountId || !creditAccountId || debitAccountId === creditAccountId) {
    return
  }

  const { data: userRes } = await supabase.auth.getUser()
  const userId = userRes?.user?.id || null

  const jeNumber = `JV-${note.note_number}`
  const description = `${note.note_type === 'credit_note' ? 'Credit Note' : 'Debit Note'} ${note.note_number}: ${note.reason}`

  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      branch_id: note.branch_id,
      entry_number: jeNumber,
      entry_date: note.note_date,
      description: description,
      reference_type: 'debit_credit_note',
      reference_id: note.id,
      total_debit: note.amount,
      total_credit: note.amount,
      status: 'posted',
      created_by: userId,
      posted_at: new Date().toISOString(),
      posted_by: userId,
    })
    .select()
    .single()

  if (jeErr || !je) return

  // Insert balancing lines
  await supabase.from('journal_entry_lines').insert([
    {
      journal_entry_id: je.id,
      company_id: companyId,
      account_id: debitAccountId,
      description: description,
      debit: note.amount,
      credit: 0,
      partner_type: note.entity_type,
      partner_id: note.entity_id,
    },
    {
      journal_entry_id: je.id,
      company_id: companyId,
      account_id: creditAccountId,
      description: description,
      debit: 0,
      credit: note.amount,
      partner_type: note.entity_type,
      partner_id: note.entity_id,
    },
  ])

  // Link journal_entry_id back to note
  await supabase
    .from('debit_credit_notes')
    .update({ journal_entry_id: je.id })
    .eq('id', note.id)
}
