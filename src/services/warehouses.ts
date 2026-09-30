import { requireSupabase, throwOnError } from './client'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

export interface WarehouseRow {
  id: string
  company_id: string
  branch_id: string
  code: string
  name: string
  address: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at?: string
  branch_name?: string | null
}

export interface BranchOption {
  id: string
  name: string
  code?: string
}

export interface CreateWarehouseInput {
  branch_id: string
  code?: string
  name: string
  address?: string
  is_default?: boolean
  is_active?: boolean
}

export interface UpdateWarehouseInput extends Partial<CreateWarehouseInput> {
  id: string
}

export async function listWarehousesPaginated(params: {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  branchId?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: WarehouseRow[]; count: number }> {
  const supabase = db()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  let query = supabase
    .from('warehouses')
    .select(`
      id,
      company_id,
      branch_id,
      code,
      name,
      address,
      is_default,
      is_active,
      created_at,
      branches:branches!branch_id (
        id,
        name
      )
    `, { count: 'exact' })
    .is('deleted_at', null)
    .order('code', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (params.status === 'active') {
    query = query.eq('is_active', true)
  } else if (params.status === 'inactive') {
    query = query.eq('is_active', false)
  }

  if (params.branchId) {
    query = query.eq('branch_id', params.branchId)
  }

  if (params.search?.trim()) {
    const term = safe(params.search.trim())
    query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%,address.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  throwOnError(error)

  const rows: WarehouseRow[] = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    company_id: row.company_id,
    branch_id: row.branch_id,
    code: row.code,
    name: row.name,
    address: row.address || null,
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    branch_name: row.branches?.name || 'All Branches',
  }))

  return {
    rows,
    count: count ?? rows.length,
  }
}

export async function listBranchesForWarehouse(): Promise<BranchOption[]> {
  const supabase = db()
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, code')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  throwOnError(error)
  return (data ?? []) as BranchOption[]
}

export async function createWarehouse(input: CreateWarehouseInput): Promise<WarehouseRow> {
  const supabase = db()

  // Resolve company context
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', currentUserId ?? '')
    .maybeSingle()

  const companyId = profile?.company_id
  if (!companyId) {
    throw new Error('Unable to resolve company context.')
  }

  let code = input.code?.trim()
  if (!code) {
    const { count } = await supabase
      .from('warehouses')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
    code = String((count ?? 0) + 1).padStart(3, '0')
  }

  // If marked as default, unset other defaults in the same branch
  if (input.is_default) {
    await supabase
      .from('warehouses')
      .update({ is_default: false })
      .eq('branch_id', input.branch_id)
      .eq('company_id', companyId)
  }

  const payload: Record<string, unknown> = {
    company_id: companyId,
    branch_id: input.branch_id,
    code,
    name: input.name.trim(),
    address: input.address?.trim() || null,
    is_default: input.is_default ?? false,
    is_active: input.is_active ?? true,
    created_by: currentUserId,
  }

  let { data, error } = await supabase
    .from('warehouses')
    .insert(payload)
    .select()
    .single()

  if (error && error.message?.includes('created_by')) {
    delete payload.created_by
    const retry = await supabase
      .from('warehouses')
      .insert(payload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  throwOnError(error)
  return data as WarehouseRow
}

export async function updateWarehouse(input: UpdateWarehouseInput): Promise<WarehouseRow> {
  const supabase = db()
  const payload: Record<string, unknown> = {}

  if (input.branch_id !== undefined) payload.branch_id = input.branch_id
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.code !== undefined) payload.code = input.code.trim()
  if (input.address !== undefined) payload.address = input.address.trim() || null
  if (input.is_default !== undefined) payload.is_default = input.is_default
  if (input.is_active !== undefined) payload.is_active = input.is_active

  payload.updated_at = new Date().toISOString()

  // If setting default, unset other defaults in that branch
  if (input.is_default && input.branch_id) {
    await supabase
      .from('warehouses')
      .update({ is_default: false })
      .eq('branch_id', input.branch_id)
  }

  let { data, error } = await supabase
    .from('warehouses')
    .update(payload)
    .eq('id', input.id)
    .select()
    .single()

  if (error && error.message?.includes('updated_at')) {
    delete payload.updated_at
    const retry = await supabase
      .from('warehouses')
      .update(payload)
      .eq('id', input.id)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  throwOnError(error)
  return data as WarehouseRow
}

export async function toggleWarehouseStatus(id: string, currentStatus: boolean): Promise<WarehouseRow> {
  return updateWarehouse({ id, is_active: !currentStatus })
}

export async function softDeleteWarehouse(id: string): Promise<void> {
  const supabase = db()
  const { error } = await supabase
    .from('warehouses')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)

  throwOnError(error)
}