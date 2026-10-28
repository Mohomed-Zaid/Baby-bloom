import type { Vendor, VendorMember } from '../types/domain'
import { requireSupabase } from './client'
import { currentCompanyId } from './masterData'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_VENDORS, MOCK_BRANCHES } from './mockData'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

const STORAGE_KEY = 'bb_vendors_list'

export interface CreateVendorInput {
  vendor_code?: string
  name: string
  address?: string
  phone?: string
  email?: string
  cheque_draw_name?: string
  become_customer?: boolean
  status?: 'active' | 'inactive'
  due_days?: number
  business_type?: string
  members?: VendorMember[]
  branch_id?: string
}

export type UpdateVendorInput = Partial<CreateVendorInput> & { id: string }

function getStoredVendorsList(): Vendor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Vendor[]
    }
  } catch { }

  const defaultBranchId = MOCK_BRANCHES[0]?.id ?? 'colombo-main'
  return MOCK_VENDORS.map((v, i) => ({
    id: v.id,
    company_id: 'company-babybloom',
    branch_id: defaultBranchId,
    vendor_code: v.vendor_code,
    name: v.name,
    contact_person: null,
    phone: v.phone,
    alternate_phone: null,
    email: v.email,
    address: 'Colombo, Sri Lanka',
    city: 'Colombo',
    tax_number: null,
    credit_limit: 500000,
    credit_days: 30,
    opening_balance: 0,
    opening_balance_type: 'credit',
    products_supplied_notes: null,
    payment_terms: 'Net 30',
    notes: null,
    status: (v.is_active ? 'active' : 'inactive') as 'active' | 'inactive',
    created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    created_by: null,
    updated_at: new Date().toISOString(),
    updated_by: null,
    deleted_at: null,
    cheque_draw_name: v.name,
    become_customer: false,
    due_days: 30,
  })) as Vendor[]
}

function saveStoredVendorsList(list: Vendor[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { }
}

const mapVendorRow = (v: Record<string, unknown>): Vendor => {
  let meta: Record<string, unknown> = {}
  if (typeof v.notes === 'string' && v.notes.startsWith('{')) {
    try {
      meta = JSON.parse(v.notes) as Record<string, unknown>
    } catch { }
  }

  return {
    ...(v as unknown as Vendor),
    cheque_draw_name: (meta.cheque_draw_name as string) || (v.cheque_draw_name as string) || null,
    become_customer: meta.become_customer !== undefined ? Boolean(meta.become_customer) : (v.become_customer !== undefined ? Boolean(v.become_customer) : false),
    due_days: Number(meta.due_days ?? v.credit_days ?? 0),
  }
}

export async function listVendors(branchId?: string): Promise<Vendor[]> {
  const localList = getStoredVendorsList().filter((v) => !v.deleted_at)
  const filterLocally = () => {
    if (branchId && branchId !== 'all') {
      return localList.filter((v) => !v.branch_id || v.branch_id === branchId)
    }
    return localList
  }

  if (isBackendOffline()) return filterLocally()

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) return filterLocally()

  try {
    let query = supabase
      .from('vendors')
      .select('*')
      .is('deleted_at', null)
      .order('vendor_code', { ascending: true })

    if (branchId && branchId !== 'all') query = query.eq('branch_id', branchId)
    const { data, error } = await query
    if (!error && data && Array.isArray(data)) {
      return (data as Array<Record<string, unknown>>).map(mapVendorRow)
    }
  } catch {
    // fallback
  }

  return filterLocally()
}

export async function listVendorsPaginated(params: {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  page?: number
  pageSize?: number
}): Promise<{ rows: Vendor[]; count: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15
  const localList = getStoredVendorsList().filter((v) => !v.deleted_at)

  const paginateLocally = () => {
    let list = [...localList]
    if (params.status === 'active') {
      list = list.filter((v) => v.status === 'active')
    } else if (params.status === 'inactive') {
      list = list.filter((v) => v.status === 'inactive')
    }

    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase()
      list = list.filter((v) =>
        v.vendor_code.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q) ||
        (v.phone && v.phone.toLowerCase().includes(q)) ||
        (v.email && v.email.toLowerCase().includes(q)) ||
        (v.address && v.address.toLowerCase().includes(q))
      )
    }

    const from = (page - 1) * pageSize
    return {
      rows: list.slice(from, from + pageSize),
      count: list.length,
    }
  }

  if (isBackendOffline()) return paginateLocally()

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) return paginateLocally()

  try {
    let query = supabase
      .from('vendors')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .order('vendor_code', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (params.status === 'active') {
      query = query.eq('status', 'active')
    } else if (params.status === 'inactive') {
      query = query.eq('status', 'inactive')
    }

    if (params.search?.trim()) {
      const term = safe(params.search.trim())
      query = query.or(`vendor_code.ilike.%${term}%,name.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%,email.ilike.%${term}%`)
    }

    const { data, error, count } = await query
    if (!error && data && Array.isArray(data)) {
      return {
        rows: (data as Array<Record<string, unknown>>).map(mapVendorRow),
        count: count ?? data.length,
      }
    }
  } catch {
    // fallback
  }

  return paginateLocally()
}

export async function getVendor(id: string): Promise<Vendor> {
  const localList = getStoredVendorsList()
  const match = localList.find((v) => v.id === id)

  if (isBackendOffline()) {
    if (match) return match
    throw new Error('Vendor not found.')
  }

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) {
    if (match) return match
    throw new Error('Vendor not found.')
  }

  try {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!error && data) return mapVendorRow(data as Record<string, unknown>)
  } catch {
    // fallback
  }

  if (match) return match
  throw new Error('Vendor not found.')
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const localList = getStoredVendorsList()
  const defaultBranchId = MOCK_BRANCHES[0]?.id ?? 'colombo-main'

  let code = input.vendor_code?.trim()
  if (!code) {
    code = String(localList.length + 1).padStart(3, '0')
  }

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  const currentUserId = session?.user?.id ?? null

  let companyId: string | null = null
  let userDefaultBranch: string | null = null

  if (currentUserId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id, default_branch_id')
        .eq('id', currentUserId)
        .maybeSingle()
      companyId = profile?.company_id ?? null
      userDefaultBranch = profile?.default_branch_id ?? null
    } catch { }
  }

  if (!companyId) {
    companyId = await currentCompanyId()
  }

  const branchId = input.branch_id || userDefaultBranch || defaultBranchId

  const extraMeta = {
    cheque_draw_name: input.cheque_draw_name?.trim() || undefined,
    become_customer: input.become_customer ?? false,
    due_days: input.due_days ?? 0,
    business_type: input.business_type?.trim() || undefined,
    members: input.members ?? [],
  }

  const newVendor: Vendor = {
    id: `vend-${Date.now()}`,
    company_id: companyId,
    branch_id: branchId,
    vendor_code: code,
    name: input.name.trim(),
    contact_person: input.members?.[0]?.name || null,
    phone: input.phone?.trim() || null,
    alternate_phone: input.members?.[0]?.phone || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    city: null,
    tax_number: null,
    credit_limit: 0,
    credit_days: input.due_days ?? 0,
    opening_balance: 0,
    opening_balance_type: 'credit',
    products_supplied_notes: null,
    payment_terms: null,
    notes: JSON.stringify(extraMeta),
    status: (input.status ?? 'active') as 'active' | 'inactive',
    created_at: new Date().toISOString(),
    created_by: currentUserId,
    updated_at: new Date().toISOString(),
    updated_by: currentUserId,
    deleted_at: null,
    cheque_draw_name: input.cheque_draw_name?.trim() || null,
    become_customer: input.become_customer ?? false,
    due_days: input.due_days ?? 0,
  }

  // Attempt live Supabase insert if online and session exists
  if (!isBackendOffline() && session) {
    try {
      // Valid columns of public.vendors ONLY
      const payload: Record<string, unknown> = {
        company_id: companyId,
        branch_id: branchId,
        vendor_code: code,
        name: input.name.trim(),
        address: input.address?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        status: input.status ?? 'active',
        credit_days: input.due_days ?? 0,
        notes: JSON.stringify(extraMeta),
        created_by: currentUserId,
      }

      const { data, error } = await supabase
        .from('vendors')
        .insert(payload)
        .select()
        .single()

      if (!error && data) {
        const created = mapVendorRow(data as Record<string, unknown>)
        saveStoredVendorsList([created, ...localList.filter((v) => v.id !== created.id)])
        return created
      }
    } catch {
      // fallback to local storage
    }
  }

  const updatedList = [newVendor, ...localList.filter((v) => v.id !== newVendor.id)]
  saveStoredVendorsList(updatedList)
  return newVendor
}

export async function updateVendor(input: UpdateVendorInput): Promise<Vendor> {
  const localList = getStoredVendorsList()
  const existing = localList.find((v) => v.id === input.id)

  const extraMeta = {
    cheque_draw_name: input.cheque_draw_name !== undefined ? input.cheque_draw_name?.trim() : existing?.cheque_draw_name,
    become_customer: input.become_customer !== undefined ? input.become_customer : existing?.become_customer,
    due_days: input.due_days !== undefined ? input.due_days : existing?.due_days,
    business_type: input.business_type !== undefined ? input.business_type?.trim() : undefined,
    members: input.members !== undefined ? input.members : undefined,
  }

  const updatedLocally: Vendor = {
    ...(existing ?? {
      id: input.id,
      company_id: 'company-babybloom',
      branch_id: 'colombo-main',
      vendor_code: 'VEND-001',
      name: input.name ?? '',
      contact_person: null,
      phone: null,
      alternate_phone: null,
      email: null,
      address: null,
      city: null,
      tax_number: null,
      credit_limit: 0,
      credit_days: 0,
      opening_balance: 0,
      opening_balance_type: 'credit',
      products_supplied_notes: null,
      payment_terms: null,
      notes: null,
      status: 'active',
      created_at: new Date().toISOString(),
      created_by: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
      deleted_at: null,
    }),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.vendor_code !== undefined ? { vendor_code: input.vendor_code.trim() } : {}),
    ...(input.address !== undefined ? { address: input.address.trim() } : {}),
    ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.due_days !== undefined ? { credit_days: input.due_days, due_days: input.due_days } : {}),
    notes: JSON.stringify(extraMeta),
    updated_at: new Date().toISOString(),
    cheque_draw_name: input.cheque_draw_name !== undefined ? input.cheque_draw_name?.trim() || null : existing?.cheque_draw_name ?? null,
    become_customer: input.become_customer !== undefined ? input.become_customer : existing?.become_customer ?? false,
  }

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session

  if (!isBackendOffline() && session) {
    try {
      const payload: Record<string, unknown> = {}
      if (input.name !== undefined) payload.name = input.name.trim()
      if (input.vendor_code !== undefined) payload.vendor_code = input.vendor_code.trim()
      if (input.address !== undefined) payload.address = input.address.trim()
      if (input.phone !== undefined) payload.phone = input.phone?.trim() || null
      if (input.email !== undefined) payload.email = input.email?.trim() || null
      if (input.status !== undefined) payload.status = input.status
      if (input.due_days !== undefined) payload.credit_days = input.due_days
      payload.notes = JSON.stringify(extraMeta)
      payload.updated_at = new Date().toISOString()

      const { error } = await supabase
        .from('vendors')
        .update(payload)
        .eq('id', input.id)

      if (!error) {
        saveStoredVendorsList(localList.map((v) => (v.id === input.id ? updatedLocally : v)))
        return updatedLocally
      }
    } catch {
      // fallback
    }
  }

  saveStoredVendorsList(localList.map((v) => (v.id === input.id ? updatedLocally : v)))
  return updatedLocally
}

export async function toggleVendorStatus(id: string, currentStatus: string): Promise<Vendor> {
  const nextStatus = currentStatus === 'active' ? 'inactive' : 'active'
  return updateVendor({ id, status: nextStatus })
}

export async function softDeleteVendor(id: string): Promise<void> {
  const localList = getStoredVendorsList()
  const updated = localList.map((v) => (v.id === id ? { ...v, deleted_at: new Date().toISOString() } : v))
  saveStoredVendorsList(updated)

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session

  if (!isBackendOffline() && session) {
    try {
      await supabase
        .from('vendors')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
    } catch { }
  }
}