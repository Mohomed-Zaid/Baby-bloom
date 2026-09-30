import { requireSupabase, throwOnError } from './client'

const db = () => requireSupabase() as any

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

// ── Company Context Helper ──────────────────────────────────────────────────
async function resolveCompanyId(): Promise<string> {
  const supabase = db()
  try {
    const { data: rpcCompany } = await supabase.rpc('current_user_company_id')
    if (rpcCompany) return rpcCompany as string
  } catch {
    // ignore
  }

  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', currentUserId ?? '')
    .maybeSingle()

  if (profile?.company_id) return profile.company_id as string
  throw new Error('Unable to resolve company context.')
}

// ── 1. List Sequences (with Branch Details & Preview) ────────────────────────
export interface ListNumberSequencesParams {
  branchId?: string
  search?: string
  category?: SequenceCategory | 'all'
}

export async function listNumberSequences(
  params: ListNumberSequencesParams = {}
): Promise<NumberSequenceRow[]> {
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
      updated_at,
      branches:branch_id (
        name,
        is_head_office
      )
    `)
    .eq('company_id', companyId)
    .order('sequence_type', { ascending: true })

  if (params.branchId) {
    q = q.eq('branch_id', params.branchId)
  }

  const { data, error } = await q
  throwOnError(error)

  const rows = ((data ?? []) as any[]).map((r) => {
    const seqType = r.sequence_type as SequenceType
    const meta = SEQUENCE_TYPE_METADATA[seqType] || {
      label: seqType,
      description: 'Document sequence',
      defaultPrefix: `${seqType.toUpperCase().slice(0, 3)}-`,
      category: 'Master Entities',
      badgeColor: '#38d4c5',
    }

    const nextNum = Number(r.next_number) || 1
    const pad = Number(r.padding_length) || 6
    const prefix = r.prefix || ''

    return {
      id: r.id,
      company_id: r.company_id,
      branch_id: r.branch_id,
      branch_name: r.branches?.name || 'Main Branch',
      is_head_office: Boolean(r.branches?.is_head_office),
      sequence_type: seqType,
      prefix,
      next_number: nextNum,
      padding_length: pad,
      reset_frequency: (r.reset_frequency as ResetFrequency) || 'never',
      last_reset_date: r.last_reset_date,
      updated_at: r.updated_at,
      preview_sample: previewSequenceNumber(prefix, nextNum, pad),
      info: meta,
    } as NumberSequenceRow
  })

  // Client-side filtering by category & search
  return rows.filter((r) => {
    if (params.category && params.category !== 'all' && r.info.category !== params.category) {
      return false
    }

    if (params.search?.trim()) {
      const s = params.search.trim().toLowerCase()
      const matchesType = r.sequence_type.toLowerCase().includes(s)
      const matchesLabel = r.info.label.toLowerCase().includes(s)
      const matchesPrefix = r.prefix.toLowerCase().includes(s)
      const matchesBranch = r.branch_name.toLowerCase().includes(s)
      const matchesSample = r.preview_sample.toLowerCase().includes(s)
      return matchesType || matchesLabel || matchesPrefix || matchesBranch || matchesSample
    }

    return true
  })
}

// ── 2. Update Number Sequence ───────────────────────────────────────────────
export async function updateNumberSequence(
  id: string,
  input: UpdateNumberSequenceInput
): Promise<NumberSequenceRow> {
  const supabase = db()
  const companyId = await resolveCompanyId()

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

  const { data, error } = await supabase
    .from('number_sequences')
    .update(payload)
    .eq('id', id)
    .eq('company_id', companyId)
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
      updated_at,
      branches:branch_id (
        name,
        is_head_office
      )
    `)
    .single()

  throwOnError(error)

  const r = data as any
  const seqType = r.sequence_type as SequenceType
  const meta = SEQUENCE_TYPE_METADATA[seqType]

  return {
    id: r.id,
    company_id: r.company_id,
    branch_id: r.branch_id,
    branch_name: r.branches?.name || 'Main Branch',
    is_head_office: Boolean(r.branches?.is_head_office),
    sequence_type: seqType,
    prefix: r.prefix || '',
    next_number: Number(r.next_number) || 1,
    padding_length: Number(r.padding_length) || 6,
    reset_frequency: r.reset_frequency || 'never',
    last_reset_date: r.last_reset_date,
    updated_at: r.updated_at,
    preview_sample: previewSequenceNumber(r.prefix || '', Number(r.next_number) || 1, Number(r.padding_length) || 6),
    info: meta,
  }
}

// ── 3. Create Custom Number Sequence ─────────────────────────────────────────
export async function createNumberSequence(
  input: CreateNumberSequenceInput
): Promise<NumberSequenceRow> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  const payload = {
    company_id: companyId,
    branch_id: input.branch_id,
    sequence_type: input.sequence_type,
    prefix: input.prefix.trim(),
    next_number: Math.max(1, Math.floor(input.next_number || 1)),
    padding_length: Math.max(1, Math.min(18, Math.floor(input.padding_length || 6))),
    reset_frequency: input.reset_frequency || 'never',
  }

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
      updated_at,
      branches:branch_id (
        name,
        is_head_office
      )
    `)
    .single()

  throwOnError(error)

  const r = data as any
  const seqType = r.sequence_type as SequenceType
  const meta = SEQUENCE_TYPE_METADATA[seqType]

  return {
    id: r.id,
    company_id: r.company_id,
    branch_id: r.branch_id,
    branch_name: r.branches?.name || 'Main Branch',
    is_head_office: Boolean(r.branches?.is_head_office),
    sequence_type: seqType,
    prefix: r.prefix || '',
    next_number: Number(r.next_number) || 1,
    padding_length: Number(r.padding_length) || 6,
    reset_frequency: r.reset_frequency || 'never',
    last_reset_date: r.last_reset_date,
    updated_at: r.updated_at,
    preview_sample: previewSequenceNumber(r.prefix || '', Number(r.next_number) || 1, Number(r.padding_length) || 6),
    info: meta,
  }
}

// ── 4. Initialize Missing Standard Sequences For A Branch ────────────────────
export async function initializeMissingBranchSequences(
  branchId: string,
  branchCodePrefix?: string
): Promise<{ addedCount: number }> {
  const supabase = db()
  const companyId = await resolveCompanyId()

  // Get existing sequence types for this branch
  const { data: existing, error: existErr } = await supabase
    .from('number_sequences')
    .select('sequence_type')
    .eq('company_id', companyId)
    .eq('branch_id', branchId)

  throwOnError(existErr)

  const existingTypes = new Set(((existing ?? []) as any[]).map((e) => e.sequence_type))
  const allTypes = Object.keys(SEQUENCE_TYPE_METADATA) as SequenceType[]
  const missingTypes = allTypes.filter((t) => !existingTypes.has(t))

  if (missingTypes.length === 0) {
    return { addedCount: 0 }
  }

  const prefixModifier = branchCodePrefix ? `${branchCodePrefix.trim().toUpperCase()}-` : ''

  const recordsToInsert = missingTypes.map((t) => {
    const meta = SEQUENCE_TYPE_METADATA[t]
    return {
      company_id: companyId,
      branch_id: branchId,
      sequence_type: t,
      prefix: `${prefixModifier}${meta.defaultPrefix}`,
      next_number: 1,
      padding_length: 6,
      reset_frequency: 'never',
    }
  })

  const { error: insErr } = await supabase
    .from('number_sequences')
    .insert(recordsToInsert)

  throwOnError(insErr)
  return { addedCount: recordsToInsert.length }
}
