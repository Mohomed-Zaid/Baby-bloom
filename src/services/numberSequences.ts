import type { Branch } from '../types/domain'
import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_BRANCHES } from './mockData'
import { listBranches } from './branches'
import { currentCompanyId } from './masterData'

const db = () => requireSupabase() as any

const isUuid = (str: string | null | undefined): boolean =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str))

export type SequenceType =
  | 'invoice'
  | 'quotation'
  | 'sales_order'
  | 'sales_return'
  | 'purchase'
  | 'purchase_return'
  | 'receipt'
  | 'payment'
  | 'journal'
  | 'stock_transfer'
  | 'stock_adjustment'
  | 'credit_note'
  | 'debit_note'
  | 'cheque'
  | 'customer'
  | 'vendor'
  | 'product'

export type ResetFrequency = 'never' | 'daily' | 'monthly' | 'yearly'

export type SequenceCategory =
  | 'Sales & POS'
  | 'Purchases & GRN'
  | 'Treasury & Cash'
  | 'General Ledger'
  | 'Inventory & Transfers'
  | 'Master Entities'

export interface SequenceTypeInfo {
  label: string
  description: string
  defaultPrefix: string
  category: SequenceCategory
  badgeColor: string
}

export const SEQUENCE_TYPE_METADATA: Record<SequenceType, SequenceTypeInfo> = {
  invoice: {
    label: 'Sales Invoices (POS & Wholesale)',
    description: 'Issued upon completed POS sales and billing invoices.',
    defaultPrefix: 'INV-',
    category: 'Sales & POS',
    badgeColor: '#10b981',
  },
  quotation: {
    label: 'Sales Quotations / Estimates',
    description: 'Proforma pricing quotes provided to customers before purchase.',
    defaultPrefix: 'QUO-',
    category: 'Sales & POS',
    badgeColor: '#38d4c5',
  },
  sales_order: {
    label: 'Customer Sales Orders',
    description: 'Confirmed customer sales orders and reservation documents.',
    defaultPrefix: 'SO-',
    category: 'Sales & POS',
    badgeColor: '#00d2ff',
  },
  sales_return: {
    label: 'Sales Returns & Credit Notes',
    description: 'Customer item returns and cash refund credit slips.',
    defaultPrefix: 'SR-',
    category: 'Sales & POS',
    badgeColor: '#f59e0b',
  },
  purchase: {
    label: 'Purchase Orders & GRN Bills',
    description: 'Vendor purchase orders and Goods Received Notes (GRN).',
    defaultPrefix: 'PUR-',
    category: 'Purchases & GRN',
    badgeColor: '#6366f1',
  },
  purchase_return: {
    label: 'Purchase Returns (Debit Outward)',
    description: 'Defective or cancelled merchandise returned to vendors.',
    defaultPrefix: 'PR-',
    category: 'Purchases & GRN',
    badgeColor: '#ec4899',
  },
  receipt: {
    label: 'Customer Payment Receipts',
    description: 'Cash, cheque, and card payment receipts issued against receivables.',
    defaultPrefix: 'REC-',
    category: 'Treasury & Cash',
    badgeColor: '#14b8a6',
  },
  payment: {
    label: 'Vendor Supplier Payments',
    description: 'Payment vouchers disbursed to settle trade payables.',
    defaultPrefix: 'PAY-',
    category: 'Treasury & Cash',
    badgeColor: '#06b6d4',
  },
  cheque: {
    label: 'Cheque Vouchers & Register',
    description: 'Inward customer and outward vendor cheque references.',
    defaultPrefix: 'CHQ-',
    category: 'Treasury & Cash',
    badgeColor: '#8b5cf6',
  },
  journal: {
    label: 'General Journal Vouchers (JV)',
    description: 'Double-entry adjustment and direct ledger journal postings.',
    defaultPrefix: 'JV-',
    category: 'General Ledger',
    badgeColor: '#a855f7',
  },
  credit_note: {
    label: 'General Credit Notes',
    description: 'Receivable reduction adjustments and price corrections.',
    defaultPrefix: 'CN-',
    category: 'General Ledger',
    badgeColor: '#f43f5e',
  },
  debit_note: {
    label: 'General Debit Notes',
    description: 'Payable reduction or billing surcharge debit vouchers.',
    defaultPrefix: 'DN-',
    category: 'General Ledger',
    badgeColor: '#e11d48',
  },
  stock_transfer: {
    label: 'Stock Transfers (In-Transit)',
    description: 'Inter-branch and inter-warehouse inventory transfer notes.',
    defaultPrefix: 'ST-',
    category: 'Inventory & Transfers',
    badgeColor: '#3b82f6',
  },
  stock_adjustment: {
    label: 'Stock Adjustments & Counts',
    description: 'Physical audit reconciliations, surplus, and shrinkage writes.',
    defaultPrefix: 'SA-',
    category: 'Inventory & Transfers',
    badgeColor: '#d97706',
  },
  customer: {
    label: 'Customer Identification Codes',
    description: 'Unique internal code auto-generated for registered customer profiles.',
    defaultPrefix: 'C-',
    category: 'Master Entities',
    badgeColor: '#059669',
  },
  vendor: {
    label: 'Vendor / Supplier Codes',
    description: 'Unique supplier code assigned during vendor onboarding.',
    defaultPrefix: 'V-',
    category: 'Master Entities',
    badgeColor: '#7c3aed',
  },
  product: {
    label: 'Product SKU / Item Identifiers',
    description: 'Internal SKU numbers assigned when creating catalog items.',
    defaultPrefix: 'P-',
    category: 'Master Entities',
    badgeColor: '#0284c7',
  },
}

export interface NumberSequenceRow {
  id: string
  company_id: string
  branch_id: string
  branch_name: string
  is_head_office: boolean
  sequence_type: SequenceType
  prefix: string
  next_number: number
  padding_length: number
  reset_frequency: ResetFrequency
  last_reset_date: string | null
  updated_at: string
  preview_sample: string
  info: SequenceTypeInfo
}

export interface UpdateNumberSequenceInput {
  prefix?: string
  next_number?: number
  padding_length?: number
  reset_frequency?: ResetFrequency
}

export interface CreateNumberSequenceInput {
  branch_id: string
  sequence_type: SequenceType
  prefix: string
  next_number?: number
  padding_length?: number
  reset_frequency?: ResetFrequency
}

// ── Preview Formatter ────────────────────────────────────────────────────────
export function previewSequenceNumber(prefix: string, nextNumber: number, padding: number): string {
  const p = Math.max(1, Math.min(18, padding || 6))
  const num = Math.max(1, nextNumber || 1)
  return `${prefix || ''}${String(num).padStart(p, '0')}`
}

export function buildDefaultMockSequences(): NumberSequenceRow[] {
  const list: NumberSequenceRow[] = []
  const types = Object.keys(SEQUENCE_TYPE_METADATA) as SequenceType[]

  MOCK_BRANCHES.forEach((branch, bIdx) => {
    types.forEach((type) => {
      const meta = SEQUENCE_TYPE_METADATA[type]
      const isHeadOffice = Boolean((branch as any).is_head_office ?? (branch.code === 'COL' || bIdx === 0))
      const prefix = isHeadOffice ? meta.defaultPrefix : `${branch.code || 'KDY'}-${meta.defaultPrefix}`
      list.push({
        id: `seq-${bIdx + 1}-${type}`,
        company_id: 'company-babybloom',
        branch_id: branch.id,
        branch_name: branch.name,
        is_head_office: isHeadOffice,
        sequence_type: type,
        prefix,
        next_number: 1,
        padding_length: 6,
        reset_frequency: 'never',
        last_reset_date: null,
        updated_at: '2026-01-01T00:00:00Z',
        preview_sample: previewSequenceNumber(prefix, 1, 6),
        info: meta,
      })
    })
  })
  return list
}

const STORAGE_KEY = 'bb_number_sequences_list'

export function getStoredNumberSequencesList(): NumberSequenceRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as NumberSequenceRow[]
    }
  } catch {}
  return buildDefaultMockSequences()
}

export function saveStoredNumberSequencesList(list: NumberSequenceRow[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {}
}

// ── Company Context Helper ──────────────────────────────────────────────────
async function resolveCompanyId(): Promise<string> {
  if (isBackendOffline()) return 'company-babybloom'
  const supabase = db()
  try {
    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userData?.user?.id

    if (currentUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', currentUserId)
        .maybeSingle()

      if (profile?.company_id) return profile.company_id as string
    }
  } catch {}

  return currentCompanyId()
}

// ── 1. List Sequences (with In-Memory Branch Resolution & Preview) ───────────
export interface ListNumberSequencesParams {
  branchId?: string
  search?: string
  category?: SequenceCategory | 'all'
}

export async function listNumberSequences(
  params: ListNumberSequencesParams = {}
): Promise<NumberSequenceRow[]> {
  const branches = await listBranches().catch(() => MOCK_BRANCHES as unknown as Branch[])
  const branchMap = new Map<string, Branch>(branches.map((b) => [b.id, b]))

  let rows: NumberSequenceRow[] = []

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const companyId = await resolveCompanyId()

      let q = supabase
        .from('number_sequences')
        .select(`
          id,
          company_id,
          branch_id,
          sequence_type,
          prefix,
          next_number,
          padding_length,
          reset_frequency,
          last_reset_date,
          updated_at
        `)
        .order('sequence_type', { ascending: true })

      if (isUuid(companyId)) {
        q = q.eq('company_id', companyId)
      }

      if (params.branchId && isUuid(params.branchId)) {
        q = q.eq('branch_id', params.branchId)
      }

      const { data, error } = await q
      if (!error && data && data.length > 0) {
        rows = (data as any[]).map((r) => {
          const seqType = r.sequence_type as SequenceType
          const meta = SEQUENCE_TYPE_METADATA[seqType] || {
            label: seqType,
            description: 'Custom Sequence',
            defaultPrefix: r.prefix || '',
            category: 'Sales & POS' as SequenceCategory,
            badgeColor: '#10b981',
          }
          const branch = branchMap.get(r.branch_id)
          return {
            id: r.id,
            company_id: r.company_id,
            branch_id: r.branch_id,
            branch_name: branch?.name || 'Main Branch',
            is_head_office: Boolean(branch?.is_head_office),
            sequence_type: seqType,
            prefix: r.prefix || '',
            next_number: Number(r.next_number) || 1,
            padding_length: Number(r.padding_length) || 6,
            reset_frequency: r.reset_frequency || 'never',
            last_reset_date: r.last_reset_date,
            updated_at: r.updated_at,
            preview_sample: previewSequenceNumber(
              r.prefix || '',
              Number(r.next_number) || 1,
              Number(r.padding_length) || 6
            ),
            info: meta,
          }
        })

        // Merge into local storage cache
        const local = getStoredNumberSequencesList()
        const localMap = new Map<string, NumberSequenceRow>(local.map((s) => [s.id, s]))
        rows.forEach((s) => localMap.set(s.id, s))
        saveStoredNumberSequencesList(Array.from(localMap.values()))
      }
    } catch (err) {
      console.warn('Failed to load number_sequences from Supabase:', err)
    }
  }

  if (rows.length === 0) {
    rows = getStoredNumberSequencesList()
  }

  // Apply filters in memory
  if (params.branchId) {
    rows = rows.filter((r) => r.branch_id === params.branchId)
  }

  if (params.category && params.category !== 'all') {
    rows = rows.filter((r) => r.info?.category === params.category)
  }

  if (params.search?.trim()) {
    const s = params.search.trim().toLowerCase()
    rows = rows.filter(
      (r) =>
        r.sequence_type.toLowerCase().includes(s) ||
        r.prefix.toLowerCase().includes(s) ||
        r.info?.label.toLowerCase().includes(s) ||
        r.branch_name.toLowerCase().includes(s)
    )
  }

  return rows
}

// ── 2. Update Number Sequence Configuration ──────────────────────────────────
export async function updateNumberSequence(
  id: string,
  input: UpdateNumberSequenceInput
): Promise<NumberSequenceRow> {
  const branches = await listBranches().catch(() => MOCK_BRANCHES as unknown as Branch[])
  const branchMap = new Map<string, Branch>(branches.map((b) => [b.id, b]))
  const localList = getStoredNumberSequencesList()
  const localIdx = localList.findIndex((s) => s.id === id)
  const current = localIdx >= 0 ? localList[localIdx] : null

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.prefix !== undefined) payload.prefix = input.prefix.trim()
  if (input.next_number !== undefined) {
    const nextNum = Math.max(1, Math.floor(input.next_number))
    payload.next_number = nextNum
  }
  if (input.padding_length !== undefined) {
    const pad = Math.max(1, Math.min(18, Math.floor(input.padding_length)))
    payload.padding_length = pad
  }
  if (input.reset_frequency !== undefined) {
    payload.reset_frequency = input.reset_frequency
  }

  let dbRow: any = null

  if (!isBackendOffline() && isUuid(id)) {
    try {
      const supabase = db()
      const companyId = await resolveCompanyId()

      let q = supabase
        .from('number_sequences')
        .update(payload)
        .eq('id', id)

      if (isUuid(companyId)) {
        q = q.eq('company_id', companyId)
      }

      const { data, error } = await q
        .select(`
          id,
          company_id,
          branch_id,
          sequence_type,
          prefix,
          next_number,
          padding_length,
          reset_frequency,
          last_reset_date,
          updated_at
        `)
        .single()

      if (!error && data) {
        dbRow = data
      }
    } catch (err) {
      console.warn('Supabase number_sequences update failed:', err)
    }
  }

  const r = dbRow ?? {
    id,
    company_id: current?.company_id || 'company-babybloom',
    branch_id: current?.branch_id || 'branch-colombo',
    sequence_type: current?.sequence_type || 'invoice',
    prefix: payload.prefix !== undefined ? payload.prefix : (current?.prefix || 'INV-'),
    next_number: payload.next_number !== undefined ? payload.next_number : (current?.next_number || 1),
    padding_length: payload.padding_length !== undefined ? payload.padding_length : (current?.padding_length || 6),
    reset_frequency: payload.reset_frequency !== undefined ? payload.reset_frequency : (current?.reset_frequency || 'never'),
    last_reset_date: current?.last_reset_date || null,
    updated_at: new Date().toISOString(),
  }

  const seqType = r.sequence_type as SequenceType
  const meta = SEQUENCE_TYPE_METADATA[seqType] || current?.info
  const branch = branchMap.get(r.branch_id)

  const updatedRow: NumberSequenceRow = {
    id: r.id,
    company_id: r.company_id,
    branch_id: r.branch_id,
    branch_name: branch?.name || current?.branch_name || 'Main Branch',
    is_head_office: Boolean(branch?.is_head_office ?? current?.is_head_office),
    sequence_type: seqType,
    prefix: r.prefix || '',
    next_number: Number(r.next_number) || 1,
    padding_length: Number(r.padding_length) || 6,
    reset_frequency: r.reset_frequency || 'never',
    last_reset_date: r.last_reset_date,
    updated_at: r.updated_at,
    preview_sample: previewSequenceNumber(
      r.prefix || '',
      Number(r.next_number) || 1,
      Number(r.padding_length) || 6
    ),
    info: meta,
  }

  if (localIdx >= 0) {
    localList[localIdx] = updatedRow
  } else {
    localList.push(updatedRow)
  }
  saveStoredNumberSequencesList(localList)

  return updatedRow
}

// ── 3. Create Custom Number Sequence ─────────────────────────────────────────
export async function createNumberSequence(
  input: CreateNumberSequenceInput
): Promise<NumberSequenceRow> {
  const branches = await listBranches().catch(() => MOCK_BRANCHES as unknown as Branch[])
  const branchMap = new Map<string, Branch>(branches.map((b) => [b.id, b]))
  const localList = getStoredNumberSequencesList()
  const companyId = await resolveCompanyId()

  const payload: Record<string, unknown> = {
    branch_id: input.branch_id,
    sequence_type: input.sequence_type,
    prefix: input.prefix.trim(),
    next_number: Math.max(1, Math.floor(input.next_number || 1)),
    padding_length: Math.max(1, Math.min(18, Math.floor(input.padding_length || 6))),
    reset_frequency: input.reset_frequency || 'never',
  }

  if (isUuid(companyId)) {
    payload.company_id = companyId
  }

  let dbRow: any = null

  if (!isBackendOffline() && isUuid(input.branch_id)) {
    try {
      const supabase = db()
      const { data, error } = await supabase
        .from('number_sequences')
        .insert(payload)
        .select(`
          id,
          company_id,
          branch_id,
          sequence_type,
          prefix,
          next_number,
          padding_length,
          reset_frequency,
          last_reset_date,
          updated_at
        `)
        .single()

      if (!error && data) {
        dbRow = data
      }
    } catch (err) {
      console.warn('Supabase number_sequences insert failed:', err)
    }
  }

  const r = dbRow ?? {
    id: `seq-${Date.now()}`,
    company_id: companyId,
    branch_id: input.branch_id,
    sequence_type: input.sequence_type,
    prefix: payload.prefix,
    next_number: payload.next_number,
    padding_length: payload.padding_length,
    reset_frequency: payload.reset_frequency,
    last_reset_date: null,
    updated_at: new Date().toISOString(),
  }

  const seqType = r.sequence_type as SequenceType
  const meta = SEQUENCE_TYPE_METADATA[seqType]
  const branch = branchMap.get(r.branch_id)

  const createdRow: NumberSequenceRow = {
    id: r.id,
    company_id: r.company_id,
    branch_id: r.branch_id,
    branch_name: branch?.name || 'Main Branch',
    is_head_office: Boolean(branch?.is_head_office),
    sequence_type: seqType,
    prefix: r.prefix || '',
    next_number: Number(r.next_number) || 1,
    padding_length: Number(r.padding_length) || 6,
    reset_frequency: r.reset_frequency || 'never',
    last_reset_date: r.last_reset_date,
    updated_at: r.updated_at,
    preview_sample: previewSequenceNumber(
      r.prefix || '',
      Number(r.next_number) || 1,
      Number(r.padding_length) || 6
    ),
    info: meta,
  }

  localList.push(createdRow)
  saveStoredNumberSequencesList(localList)

  return createdRow
}

// ── 4. Initialize Missing Standard Sequences For A Branch ────────────────────
export async function initializeMissingBranchSequences(
  branchId: string,
  branchCodePrefix?: string
): Promise<{ addedCount: number }> {
  const branches = await listBranches().catch(() => MOCK_BRANCHES as unknown as Branch[])
  const branchMap = new Map<string, Branch>(branches.map((b) => [b.id, b]))
  const localList = getStoredNumberSequencesList()
  const companyId = await resolveCompanyId()

  const existingLocalTypes = new Set(
    localList.filter((s) => s.branch_id === branchId).map((s) => s.sequence_type)
  )

  const allTypes = Object.keys(SEQUENCE_TYPE_METADATA) as SequenceType[]
  const missingTypes = allTypes.filter((t) => !existingLocalTypes.has(t))

  if (missingTypes.length === 0) {
    return { addedCount: 0 }
  }

  const prefixModifier = branchCodePrefix ? `${branchCodePrefix.trim().toUpperCase()}-` : ''
  const branch = branchMap.get(branchId)

  const recordsToInsert = missingTypes.map((t) => {
    const meta = SEQUENCE_TYPE_METADATA[t]
    return {
      company_id: companyId,
      branch_id: branchId,
      sequence_type: t,
      prefix: `${prefixModifier}${meta.defaultPrefix}`,
      next_number: 1,
      padding_length: 6,
      reset_frequency: 'never' as ResetFrequency,
    }
  })

  if (!isBackendOffline() && isUuid(branchId) && isUuid(companyId)) {
    try {
      const supabase = db()
      await supabase.from('number_sequences').insert(recordsToInsert)
    } catch (err) {
      console.warn('Supabase initializeMissingBranchSequences failed:', err)
    }
  }

  recordsToInsert.forEach((rec, idx) => {
    const meta = SEQUENCE_TYPE_METADATA[rec.sequence_type]
    localList.push({
      id: `seq-${branchId}-${rec.sequence_type}-${idx}`,
      company_id: companyId,
      branch_id: branchId,
      branch_name: branch?.name || 'Main Branch',
      is_head_office: Boolean(branch?.is_head_office),
      sequence_type: rec.sequence_type,
      prefix: rec.prefix,
      next_number: rec.next_number,
      padding_length: rec.padding_length,
      reset_frequency: rec.reset_frequency,
      last_reset_date: null,
      updated_at: new Date().toISOString(),
      preview_sample: previewSequenceNumber(rec.prefix, rec.next_number, rec.padding_length),
      info: meta,
    })
  })

  saveStoredNumberSequencesList(localList)
  return { addedCount: recordsToInsert.length }
}
