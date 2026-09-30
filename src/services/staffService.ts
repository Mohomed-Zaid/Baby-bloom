import { requireSupabase, throwOnError } from './client'
import type { CreateStaffInput, StaffProfile, UpdateStaffInput } from '../types/staff'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

const mapStaffRow = (row: Record<string, unknown>): StaffProfile => ({
  id: row.id as string,
  company_id: row.company_id as string,
  user_id: (row.user_id as string | null) ?? null,
  staff_code: row.staff_code as string,
  first_name: row.first_name as string,
  last_name: (row.last_name as string | null) ?? null,
  mobile_number: (row.mobile_number as string) ?? '',
  address: (row.address as string | null) ?? null,
  designation: (row.designation as string) ?? 'Staff',
  role_level: (row.role_level as string) ?? 'LEVEL 1',
  commission_rate: Number(row.commission_rate ?? 0),
  branch_id: (row.branch_id as string | null) ?? null,
  is_active: Boolean(row.is_active ?? true),
  created_at: row.created_at as string,
  created_by: (row.created_by as string | null) ?? null,
  updated_at: row.updated_at as string,
  updated_by: (row.updated_by as string | null) ?? null,
  // Extended fields
  nick_name: (row.nick_name as string | null) ?? null,
  nic: (row.nic as string | null) ?? null,
  dob: (row.dob as string | null) ?? null,
  gender: (row.gender as string | null) ?? 'MALE',
  area: (row.area as string | null) ?? null,
  telephone_no: (row.telephone_no as string | null) ?? null,
  email: (row.email as string | null) ?? null,
  sales_in: row.sales_in !== undefined ? Boolean(row.sales_in) : true,
  sales_target: row.sales_target !== undefined ? Boolean(row.sales_target) : false,
  branches: Array.isArray(row.branches) ? (row.branches as string[]) : [],
  joined_date: (row.joined_date as string | null) ?? null,
  department_name: (row.department_name as string | null) ?? null,
  salary_type: (row.salary_type as string | null) ?? null,
  vehicle_no: (row.vehicle_no as string | null) ?? null,
  staff_short_key: (row.staff_short_key as string | null) ?? null,
  // Joined / computed fields
  branch_name: (row.branches_ref as { name?: string } | null)?.name ?? 'All Branches',
  full_name: `${row.first_name}${row.last_name ? ' ' + row.last_name : ''}`,
})

export async function listStaff(filters: {
  branchId?: string
  search?: string
  activeOnly?: boolean
  status?: 'active' | 'inactive' | 'all'
  roleLevel?: string
} = {}): Promise<StaffProfile[]> {
  const supabase = db()
  let query = supabase
    .from('staff_profiles')
    .select('*, branches_ref:branches(name)')
    .order('staff_code', { ascending: true })

  if (filters.status === 'active' || filters.activeOnly) {
    query = query.eq('is_active', true)
  } else if (filters.status === 'inactive') {
    query = query.eq('is_active', false)
  }

  if (filters.branchId) {
    query = query.or(`branch_id.eq.${filters.branchId},branch_id.is.null`)
  }
  if (filters.roleLevel) {
    query = query.eq('role_level', filters.roleLevel)
  }
  if (filters.search) {
    const term = safe(filters.search)
    query = query.or(`staff_code.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,mobile_number.ilike.%${term}%,designation.ilike.%${term}%,nick_name.ilike.%${term}%,area.ilike.%${term}%`)
  }

  const { data, error } = await query
  throwOnError(error)

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapStaffRow)
}

export async function getStaff(id: string): Promise<StaffProfile> {
  const supabase = db()
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('*, branches_ref:branches(name)')
    .eq('id', id)
    .single()

  throwOnError(error)
  return mapStaffRow(data as Record<string, unknown>)
}

export async function createStaff(input: CreateStaffInput): Promise<StaffProfile> {
  const supabase = db()
  let code = input.staff_code?.trim()

  if (!code) {
    const { count, error: countErr } = await supabase
      .from('staff_profiles')
      .select('*', { count: 'exact', head: true })
    throwOnError(countErr)
    code = String((count ?? 0) + 1).padStart(3, '0')
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

  const insertPayload: Record<string, unknown> = {
    company_id: companyId,
    staff_code: code,
    first_name: input.first_name.trim(),
    last_name: input.last_name?.trim() || null,
    mobile_number: input.mobile_number.trim(),
    address: input.address?.trim() || null,
    designation: input.designation?.trim() || input.role_level || 'Staff',
    role_level: input.role_level?.trim() || 'LEVEL 1',
    commission_rate: input.commission_rate ?? 0,
    branch_id: input.branch_id || null,
    is_active: input.is_active ?? true,
    created_by: currentUserId,
    // Extended fields
    nick_name: input.nick_name?.trim() || null,
    nic: input.nic?.trim() || null,
    dob: input.dob || null,
    gender: input.gender || 'MALE',
    area: input.area?.trim() || null,
    telephone_no: input.telephone_no?.trim() || null,
    email: input.email?.trim() || null,
    sales_in: input.sales_in ?? true,
    sales_target: input.sales_target ?? false,
    branches: input.branches ?? [],
    joined_date: input.joined_date || null,
    department_name: input.department_name?.trim() || null,
    salary_type: input.salary_type?.trim() || null,
    vehicle_no: input.vehicle_no?.trim() || null,
    staff_short_key: input.staff_short_key?.trim() || null,
  }

  const { data, error } = await supabase
    .from('staff_profiles')
    .insert(insertPayload)
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

  // Extended fields
  if (input.nick_name !== undefined) payload.nick_name = input.nick_name?.trim() || null
  if (input.nic !== undefined) payload.nic = input.nic?.trim() || null
  if (input.dob !== undefined) payload.dob = input.dob || null
  if (input.gender !== undefined) payload.gender = input.gender || 'MALE'
  if (input.area !== undefined) payload.area = input.area?.trim() || null
  if (input.telephone_no !== undefined) payload.telephone_no = input.telephone_no?.trim() || null
  if (input.email !== undefined) payload.email = input.email?.trim() || null
  if (input.sales_in !== undefined) payload.sales_in = input.sales_in
  if (input.sales_target !== undefined) payload.sales_target = input.sales_target
  if (input.branches !== undefined) payload.branches = input.branches
  if (input.joined_date !== undefined) payload.joined_date = input.joined_date || null
  if (input.department_name !== undefined) payload.department_name = input.department_name?.trim() || null
  if (input.salary_type !== undefined) payload.salary_type = input.salary_type?.trim() || null
  if (input.vehicle_no !== undefined) payload.vehicle_no = input.vehicle_no?.trim() || null
  if (input.staff_short_key !== undefined) payload.staff_short_key = input.staff_short_key?.trim() || null

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
