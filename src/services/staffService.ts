import { requireSupabase, throwOnError } from './client'
import type { CreateStaffInput, StaffProfile, UpdateStaffInput } from '../types/staff'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

export async function listStaff(filters: {
  branchId?: string
  search?: string
  activeOnly?: boolean
  roleLevel?: string
} = {}): Promise<StaffProfile[]> {
  const supabase = db()
  let query = supabase
    .from('staff_profiles')
    .select('*, branches(name)')
    .order('staff_code', { ascending: true })

  if (filters.activeOnly) {
    query = query.eq('is_active', true)
  }
  if (filters.branchId) {
    query = query.or(`branch_id.eq.${filters.branchId},branch_id.is.null`)
  }
  if (filters.roleLevel) {
    query = query.eq('role_level', filters.roleLevel)
  }
  if (filters.search) {
    const term = safe(filters.search)
    query = query.or(`staff_code.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,mobile_number.ilike.%${term}%,designation.ilike.%${term}%`)
  }

  const { data, error } = await query
  throwOnError(error)

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    company_id: row.company_id as string,
    user_id: (row.user_id as string | null) ?? null,
    staff_code: row.staff_code as string,
    first_name: row.first_name as string,
    last_name: (row.last_name as string | null) ?? null,
    mobile_number: row.mobile_number as string,
    address: (row.address as string | null) ?? null,
    designation: row.designation as string,
    role_level: row.role_level as string,
    commission_rate: Number(row.commission_rate ?? 0),
    branch_id: (row.branch_id as string | null) ?? null,
    is_active: Boolean(row.is_active),
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
    updated_at: row.updated_at as string,
    updated_by: (row.updated_by as string | null) ?? null,
    branch_name: (row.branches as { name?: string } | null)?.name ?? 'All Branches',
    full_name: `${row.first_name}${row.last_name ? ' ' + row.last_name : ''}`,
  }))
}

export async function getStaff(id: string): Promise<StaffProfile> {
  const supabase = db()
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('*, branches(name)')
    .eq('id', id)
    .single()

  throwOnError(error)
  const row = data as unknown as Record<string, unknown>
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    user_id: (row.user_id as string | null) ?? null,
    staff_code: row.staff_code as string,
    first_name: row.first_name as string,
    last_name: (row.last_name as string | null) ?? null,
    mobile_number: row.mobile_number as string,
    address: (row.address as string | null) ?? null,
    designation: row.designation as string,
    role_level: row.role_level as string,
    commission_rate: Number(row.commission_rate ?? 0),
    branch_id: (row.branch_id as string | null) ?? null,
    is_active: Boolean(row.is_active),
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
    updated_at: row.updated_at as string,
    updated_by: (row.updated_by as string | null) ?? null,
    branch_name: (row.branches as { name?: string } | null)?.name ?? 'All Branches',
    full_name: `${row.first_name}${row.last_name ? ' ' + row.last_name : ''}`,
  }
}

export async function createStaff(input: CreateStaffInput): Promise<StaffProfile> {
  const supabase = db()
  let code = input.staff_code?.trim()

  if (!code) {
    const { count, error: countErr } = await supabase
      .from('staff_profiles')
      .select('*', { count: 'exact', head: true })
    throwOnError(countErr)
    code = `STF-${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  // Get current user company id
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', currentUserId ?? '')
    .maybeSingle()

  const companyId = (profile as { company_id?: string } | null)?.company_id
  if (!companyId) {
    throw new Error('Unable to resolve company context')
  }

  const { data, error } = await supabase
    .from('staff_profiles')
    .insert({
      company_id: companyId,
      staff_code: code,
      first_name: input.first_name.trim(),
      last_name: input.last_name?.trim() || null,
      mobile_number: input.mobile_number.trim(),
      address: input.address?.trim() || null,
      designation: input.designation.trim(),
      role_level: input.role_level.trim(),
      commission_rate: input.commission_rate ?? 0,
      branch_id: input.branch_id || null,
      is_active: input.is_active ?? true,
      created_by: currentUserId,
    })
    .select()
    .single()

  throwOnError(error)
  return getStaff((data as { id: string }).id)
}

export async function updateStaff(id: string, input: Partial<UpdateStaffInput>): Promise<StaffProfile> {
  const supabase = db()
  const payload: Record<string, unknown> = {}

  if (input.first_name !== undefined) payload.first_name = input.first_name.trim()
  if (input.last_name !== undefined) payload.last_name = input.last_name?.trim() || null
  if (input.mobile_number !== undefined) payload.mobile_number = input.mobile_number.trim()
  if (input.address !== undefined) payload.address = input.address?.trim() || null
  if (input.designation !== undefined) payload.designation = input.designation.trim()
  if (input.role_level !== undefined) payload.role_level = input.role_level.trim()
  if (input.commission_rate !== undefined) payload.commission_rate = input.commission_rate
  if (input.branch_id !== undefined) payload.branch_id = input.branch_id || null
  if (input.is_active !== undefined) payload.is_active = input.is_active

  payload.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('staff_profiles')
    .update(payload)
    .eq('id', id)

  throwOnError(error)
  return getStaff(id)
}

export async function toggleStaffStatus(id: string, is_active: boolean): Promise<StaffProfile> {
  return updateStaff(id, { is_active })
}
