import { requireSupabase, throwOnError } from './client'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

export interface BrandRow {
  id: string
  company_id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at?: string
}

export interface CreateBrandInput {
  code?: string
  name: string
  description?: string
  is_active?: boolean
}

export interface UpdateBrandInput extends Partial<CreateBrandInput> {
  id: string
}

export async function listBrandsPaginated(params: {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  page?: number
  pageSize?: number
}): Promise<{ rows: BrandRow[]; count: number }> {
  const supabase = db()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  let query = supabase
    .from('brands')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('code', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (params.status === 'active') {
    query = query.eq('is_active', true)
  } else if (params.status === 'inactive') {
    query = query.eq('is_active', false)
  }

  if (params.search?.trim()) {
    const term = safe(params.search.trim())
    query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%,description.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  throwOnError(error)

  const rows: BrandRow[] = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    company_id: row.company_id,
    code: row.code,
    name: row.name,
    description: row.description || null,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
  }))

  return {
    rows,
    count: count ?? rows.length,
  }
}

export async function createBrand(input: CreateBrandInput): Promise<BrandRow> {
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
      .from('brands')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
    code = String((count ?? 0) + 1).padStart(3, '0')
  }

  const payload: Record<string, unknown> = {
    company_id: companyId,
    code,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    is_active: input.is_active ?? true,
    created_by: currentUserId,
  }

  let { data, error } = await supabase
    .from('brands')
    .insert(payload)
    .select()
    .single()

  if (error && error.message?.includes('created_by')) {
    delete payload.created_by
    const retry = await supabase
      .from('brands')
      .insert(payload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  throwOnError(error)
  return data as BrandRow
}

export async function updateBrand(input: UpdateBrandInput): Promise<BrandRow> {
  const supabase = db()
  const payload: Record<string, unknown> = {}

  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.code !== undefined) payload.code = input.code.trim()
  if (input.description !== undefined) payload.description = input.description.trim() || null
  if (input.is_active !== undefined) payload.is_active = input.is_active

  payload.updated_at = new Date().toISOString()

  let { data, error } = await supabase
    .from('brands')
    .update(payload)
    .eq('id', input.id)
    .select()
    .single()

  if (error && error.message?.includes('updated_at')) {
    delete payload.updated_at
    const retry = await supabase
      .from('brands')
      .update(payload)
      .eq('id', input.id)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  throwOnError(error)
  return data as BrandRow
}

export async function toggleBrandStatus(id: string, currentStatus: boolean): Promise<BrandRow> {
  return updateBrand({ id, is_active: !currentStatus })
}

export async function softDeleteBrand(id: string): Promise<void> {
  const supabase = db()
  const { error } = await supabase
    .from('brands')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)

  throwOnError(error)
}