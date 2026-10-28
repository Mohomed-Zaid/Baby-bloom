import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { currentCompanyId } from './masterData'
import type { CreateStaffInput, StaffProfile, UpdateStaffInput } from '../types/staff'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

const STORAGE_KEY = 'bb_staff_profiles'

export const DEFAULT_MOCK_STAFF: StaffProfile[] = [
  {
    id: 'staff-001',
    company_id: 'company-babybloom',
    user_id: 'user-admin',
    staff_code: '001',
    first_name: 'Zaid',
    last_name: 'Mohomed',
    mobile_number: '+94 77 123 4567',
    address: 'No 45, Galle Road, Colombo 03',
    designation: 'Store Manager',
    role_level: 'LEVEL 1',
    commission_rate: 2.5,
    branch_id: 'colombo-main',
    branch_name: 'Colombo Main Branch',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    nick_name: 'Zaid',
    nic: '981234567V',
    dob: '1998-05-14',
    gender: 'MALE',
    area: 'Colombo',
    telephone_no: '+94 11 234 5678',
    email: 'admin@babybloom.lk',
    sales_in: true,
    sales_target: true,
    branches: ['Colombo Main Branch', 'EASY BABY - STORE'],
    joined_date: '2023-01-15',
    department_name: 'Management',
    salary_type: 'Monthly',
    vehicle_no: 'WP-CAD-1234',
    staff_short_key: 'ZD',
    full_name: 'Zaid Mohomed',
  },
  {
    id: 'staff-002',
    company_id: 'company-babybloom',
    user_id: 'user-kamal',
    staff_code: '002',
    first_name: 'Kamal',
    last_name: 'Perera',
    mobile_number: '+94 71 888 2233',
    address: '12 Kandy Road, Kiribathgoda',
    designation: 'Senior Cashier',
    role_level: 'Cashier',
    commission_rate: 1.0,
    branch_id: 'colombo-main',
    branch_name: 'Colombo Main Branch',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    nick_name: 'Kamal',
    nic: '951239874V',
    dob: '1995-10-22',
    gender: 'MALE',
    area: 'Kiribathgoda',
    telephone_no: '+94 11 999 8888',
    email: 'kamal.p@babybloom.lk',
    sales_in: true,
    sales_target: false,
    branches: ['Colombo Main Branch', 'EASY BABY - STORE'],
    joined_date: '2023-06-01',
    department_name: 'Cashier Counter',
    salary_type: 'Monthly',
    vehicle_no: 'WP-BCC-5678',
    staff_short_key: 'KP',
    full_name: 'Kamal Perera',
  },
  {
    id: 'staff-003',
    company_id: 'company-babybloom',
    user_id: 'user-saman',
    staff_code: '003',
    first_name: 'Saman',
    last_name: 'Kumara',
    mobile_number: '+94 76 333 4455',
    address: '88 High Level Road, Nugegoda',
    designation: 'Sales Representative',
    role_level: 'Sales Rep',
    commission_rate: 3.0,
    branch_id: 'colombo-main',
    branch_name: 'Colombo Main Branch',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    nick_name: 'Saman',
    nic: '923456781V',
    dob: '1992-03-18',
    gender: 'MALE',
    area: 'Nugegoda',
    telephone_no: '+94 11 444 5566',
    email: 'saman.k@babybloom.lk',
    sales_in: true,
    sales_target: true,
    branches: ['Colombo Main Branch', 'EASY BABY - STORE'],
    joined_date: '2023-09-10',
    department_name: 'Sales',
    salary_type: 'Monthly',
    vehicle_no: 'WP-QA-9012',
    staff_short_key: 'SK',
    full_name: 'Saman Kumara',
  },
]

export function getStoredStaffList(): StaffProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as StaffProfile[]
    }
  } catch { }
  return [...DEFAULT_MOCK_STAFF]
}

function saveStoredStaffList(list: StaffProfile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { }
}

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
  const localList = getStoredStaffList()

  const filterLocally = () => {
    let list = [...localList]
    if (filters.status === 'active' || filters.activeOnly) {
      list = list.filter((s) => s.is_active)
    } else if (filters.status === 'inactive') {
      list = list.filter((s) => !s.is_active)
    }
    if (filters.branchId && filters.branchId !== 'all') {
      list = list.filter((s) => !s.branch_id || s.branch_id === filters.branchId)
    }
    if (filters.roleLevel) {
      list = list.filter((s) => s.role_level === filters.roleLevel)
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase()
      list = list.filter((s) =>
        s.staff_code.toLowerCase().includes(q) ||
        s.first_name.toLowerCase().includes(q) ||
        (s.last_name && s.last_name.toLowerCase().includes(q)) ||
        s.mobile_number.toLowerCase().includes(q) ||
        (s.nick_name && s.nick_name.toLowerCase().includes(q)) ||
        (s.area && s.area.toLowerCase().includes(q))
      )
    }
    return list
  }

  if (isBackendOffline()) return filterLocally()

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) return filterLocally()

  try {
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
    if (!error && data && Array.isArray(data)) {
      return (data as Array<Record<string, unknown>>).map(mapStaffRow)
    }
  } catch {
    // fallback
  }

  return filterLocally()
}

export async function getStaff(id: string): Promise<StaffProfile> {
  const localList = getStoredStaffList()
  const match = localList.find((s) => s.id === id)

  if (isBackendOffline()) {
    if (match) return match
    throw new Error('Staff member not found.')
  }

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) {
    if (match) return match
    throw new Error('Staff member not found.')
  }

  try {
    const { data, error } = await supabase
      .from('staff_profiles')
      .select('*, branches_ref:branches(name)')
      .eq('id', id)
      .maybeSingle()

    if (!error && data) return mapStaffRow(data as Record<string, unknown>)
  } catch {
    // fallback
  }

  if (match) return match
  throw new Error('Staff member not found.')
}

export async function createStaff(input: CreateStaffInput): Promise<StaffProfile> {
  const localList = getStoredStaffList()

  let code = input.staff_code?.trim()
  if (!code) {
    code = String(localList.length + 1).padStart(3, '0')
  }

  const companyId = await currentCompanyId()
  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  const currentUserId = session?.user?.id ?? null

  const newStaff: StaffProfile = {
    id: `staff-${Date.now()}`,
    company_id: companyId,
    user_id: currentUserId,
    staff_code: code,
    first_name: input.first_name.trim(),
    last_name: input.last_name?.trim() || null,
    mobile_number: input.mobile_number.trim(),
    address: input.address?.trim() || null,
    designation: input.designation?.trim() || input.role_level || 'Staff',
    role_level: input.role_level?.trim() || 'LEVEL 1',
    commission_rate: input.commission_rate ?? 0,
    branch_id: input.branch_id || null,
    branch_name: 'All Branches',
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
    created_by: currentUserId,
    updated_at: new Date().toISOString(),
    updated_by: currentUserId,
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
    full_name: `${input.first_name.trim()}${input.last_name?.trim() ? ' ' + input.last_name.trim() : ''}`,
  }

  // If online & authenticated, attempt Supabase insertion
  if (!isBackendOffline() && session) {
    try {
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

      if (!error && data) {
        const created = mapStaffRow(data as Record<string, unknown>)
        saveStoredStaffList([created, ...localList.filter((s) => s.id !== created.id)])
        return created
      }
    } catch {
      // Supabase table missing or unmigrated; gracefully persist locally
    }
  }

  // Save to persistent local storage so UI is fully functional
  const updatedList = [newStaff, ...localList.filter((s) => s.id !== newStaff.id)]
  saveStoredStaffList(updatedList)
  return newStaff
}

export async function updateStaff(id: string, input: Partial<UpdateStaffInput>): Promise<StaffProfile> {
  const localList = getStoredStaffList()
  const existing = localList.find((s) => s.id === id)

  const updatedLocally: StaffProfile = {
    ...(existing ?? DEFAULT_MOCK_STAFF[0]!),
    id,
    first_name: input.first_name !== undefined ? input.first_name.trim() : existing?.first_name ?? '',
    last_name: input.last_name !== undefined ? (input.last_name?.trim() || null) : existing?.last_name ?? null,
    mobile_number: input.mobile_number !== undefined ? input.mobile_number.trim() : existing?.mobile_number ?? '',
    address: input.address !== undefined ? (input.address?.trim() || null) : existing?.address ?? null,
    designation: input.designation !== undefined ? input.designation.trim() : existing?.designation ?? 'Staff',
    role_level: input.role_level !== undefined ? input.role_level.trim() : existing?.role_level ?? 'LEVEL 1',
    commission_rate: input.commission_rate !== undefined ? input.commission_rate : existing?.commission_rate ?? 0,
    branch_id: input.branch_id !== undefined ? input.branch_id : existing?.branch_id ?? null,
    is_active: input.is_active !== undefined ? input.is_active : existing?.is_active ?? true,
    nick_name: input.nick_name !== undefined ? (input.nick_name?.trim() || null) : existing?.nick_name ?? null,
    nic: input.nic !== undefined ? (input.nic?.trim() || null) : existing?.nic ?? null,
    dob: input.dob !== undefined ? input.dob : existing?.dob ?? null,
    gender: input.gender !== undefined ? input.gender : existing?.gender ?? 'MALE',
    area: input.area !== undefined ? (input.area?.trim() || null) : existing?.area ?? null,
    telephone_no: input.telephone_no !== undefined ? (input.telephone_no?.trim() || null) : existing?.telephone_no ?? null,
    email: input.email !== undefined ? (input.email?.trim() || null) : existing?.email ?? null,
    sales_in: input.sales_in !== undefined ? input.sales_in : existing?.sales_in ?? true,
    sales_target: input.sales_target !== undefined ? input.sales_target : existing?.sales_target ?? false,
    branches: input.branches !== undefined ? input.branches : existing?.branches ?? [],
    joined_date: input.joined_date !== undefined ? input.joined_date : existing?.joined_date ?? null,
    department_name: input.department_name !== undefined ? (input.department_name?.trim() || null) : existing?.department_name ?? null,
    salary_type: input.salary_type !== undefined ? (input.salary_type?.trim() || null) : existing?.salary_type ?? null,
    vehicle_no: input.vehicle_no !== undefined ? (input.vehicle_no?.trim() || null) : existing?.vehicle_no ?? null,
    staff_short_key: input.staff_short_key !== undefined ? (input.staff_short_key?.trim() || null) : existing?.staff_short_key ?? null,
    full_name: `${input.first_name ?? existing?.first_name ?? ''}${input.last_name ? ' ' + input.last_name : existing?.last_name ? ' ' + existing.last_name : ''}`,
    updated_at: new Date().toISOString(),
  }

  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session

  if (!isBackendOffline() && session) {
    try {
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

      if (!error) {
        saveStoredStaffList(localList.map((s) => (s.id === id ? updatedLocally : s)))
        return updatedLocally
      }
    } catch {
      // fallback
    }
  }

  saveStoredStaffList(localList.map((s) => (s.id === id ? updatedLocally : s)))
  return updatedLocally
}

export async function toggleStaffStatus(id: string, is_active: boolean): Promise<StaffProfile> {
  return updateStaff(id, { is_active })
}
