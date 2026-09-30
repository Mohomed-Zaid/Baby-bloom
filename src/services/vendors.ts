import type { Vendor, VendorMember } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

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

export async function listVendors(branchId?: string): Promise<Vendor[]> {
  const supabase = db()
  let query = supabase
    .from('vendors')
    .select('*')
    .is('deleted_at', null)
    .order('vendor_code', { ascending: true })

  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  throwOnError(error)
  return (data ?? []) as unknown as Vendor[]
}

export async function listVendorsPaginated(params: {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  page?: number
  pageSize?: number
}): Promise<{ rows: Vendor[]; count: number }> {
  const supabase = db()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

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
    query = query.or(`vendor_code.ilike.%${term}%,name.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%,email.ilike.%${term}%,cheque_draw_name.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  throwOnError(error)

  return {
    rows: (data ?? []) as unknown as Vendor[],
    count: count ?? 0,
  }
}

export async function getVendor(id: string): Promise<Vendor> {
  const supabase = db()
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', id)
    .single()

  throwOnError(error)
  return data as unknown as Vendor
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const supabase = db()

  // Resolve user & company context
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, default_branch_id')
    .eq('id', currentUserId ?? '')
    .maybeSingle()

  const companyId = profile?.company_id
  if (!companyId) {
    throw new Error('Unable to resolve company context.')
  }

  const branchId = input.branch_id || profile?.default_branch_id || null

  let code = input.vendor_code?.trim()
  if (!code) {
    const { count } = await supabase
      .from('vendors')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
    code = String((count ?? 0) + 1).padStart(3, '0')
  }

  const payload: Record<string, unknown> = {
    company_id: companyId,
    branch_id: branchId,
    vendor_code: code,
    name: input.name.trim(),
    address: input.address?.trim() || '',
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    cheque_draw_name: input.cheque_draw_name?.trim() || null,
    become_customer: input.become_customer ?? false,
    status: input.status ?? 'active',
    credit_days: input.due_days ?? 0,
    due_days: input.due_days ?? 0,
    business_type: input.business_type?.trim() || null,
    members: input.members ?? [],
    created_by: currentUserId,
  }

  const { data, error } = await supabase
    .from('vendors')
    .insert(payload)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as Vendor
}

export async function updateVendor(input: UpdateVendorInput): Promise<Vendor> {
  const supabase = db()
  const payload: Record<string, unknown> = {}

  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.vendor_code !== undefined) payload.vendor_code = input.vendor_code.trim()
  if (input.address !== undefined) payload.address = input.address.trim()
  if (input.phone !== undefined) payload.phone = input.phone?.trim() || null
  if (input.email !== undefined) payload.email = input.email?.trim() || null
  if (input.cheque_draw_name !== undefined) payload.cheque_draw_name = input.cheque_draw_name?.trim() || null
  if (input.become_customer !== undefined) payload.become_customer = input.become_customer
  if (input.status !== undefined) payload.status = input.status
  if (input.due_days !== undefined) {
    payload.due_days = input.due_days
    payload.credit_days = input.due_days
  }
  if (input.business_type !== undefined) payload.business_type = input.business_type?.trim() || null
  if (input.members !== undefined) payload.members = input.members

  payload.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('vendors')
    .update(payload)
    .eq('id', input.id)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as Vendor
}

export async function toggleVendorStatus(id: string, currentStatus: string): Promise<Vendor> {
  const supabase = db()
  const nextStatus = currentStatus === 'active' ? 'inactive' : 'active'
  const { data, error } = await supabase
    .from('vendors')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  throwOnError(error)
  return data as unknown as Vendor
}

export async function softDeleteVendor(id: string): Promise<void> {
  const supabase = db()
  const { error } = await supabase
    .from('vendors')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  throwOnError(error)
}