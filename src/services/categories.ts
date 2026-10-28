import { requireSupabase } from './client'
import { currentCompanyId } from './masterData'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_CATEGORIES } from './mockData'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

export interface CategoryRow {
  id: string
  company_id: string
  parent_id: string | null
  code: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at?: string
  parent_name?: string | null
}

export interface CreateCategoryInput {
  code?: string
  name: string
  parent_id?: string | null
  description?: string
  is_active?: boolean
}

export interface UpdateCategoryInput extends Partial<CreateCategoryInput> {
  id: string
}

const STORAGE_KEY = 'bb_categories_list'

export function getStoredCategoriesList(): CategoryRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as CategoryRow[]
    }
  } catch { }

  const defaultCompanyId = 'company-babybloom'
  const seed: CategoryRow[] = MOCK_CATEGORIES.map((c, i) => ({
    id: c.id,
    company_id: defaultCompanyId,
    parent_id: null,
    code: c.code || String(i + 1).padStart(3, '0'),
    name: c.name,
    description: null,
    is_active: c.is_active,
    created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    parent_name: null,
  }))

  saveStoredCategoriesList(seed)
  return seed
}

export function saveStoredCategoriesList(list: CategoryRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { }
}

const isUuid = (str: string | null | undefined): boolean =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str))

export async function listCategoriesPaginated(params: {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  page?: number
  pageSize?: number
}): Promise<{ rows: CategoryRow[]; count: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  // 1. Attempt Supabase query without composite self-join (which causes 400 Bad Request)
  if (!isBackendOffline()) {
    try {
      const supabase = db()
      let query = supabase
        .from('categories')
        .select(`
          id,
          company_id,
          parent_id,
          code,
          name,
          description,
          is_active,
          created_at,
          updated_at
        `, { count: 'exact' })
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
      if (!error && data && data.length > 0) {
        const localList = getStoredCategoriesList()
        const dbIds = new Set(data.map((r: { id: string }) => r.id))
        const unSyncedLocal = localList.filter((l) => !dbIds.has(l.id) && l.id.startsWith('cat-'))

        let combined = [...(data as CategoryRow[]), ...unSyncedLocal]
        if (params.status === 'active') combined = combined.filter((c) => c.is_active)
        else if (params.status === 'inactive') combined = combined.filter((c) => !c.is_active)
        if (params.search?.trim()) {
          const q = params.search.trim().toLowerCase()
          combined = combined.filter(
            (c) =>
              c.code.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q) ||
              (c.description && c.description.toLowerCase().includes(q))
          )
        }

        const nameMap = new Map<string, string>()
        combined.forEach((c) => nameMap.set(c.id, c.name))
        localList.forEach((c) => nameMap.set(c.id, c.name))

        const rows: CategoryRow[] = combined.slice(0, pageSize).map((row) => ({
          id: row.id,
          company_id: row.company_id,
          parent_id: row.parent_id || null,
          code: row.code,
          name: row.name,
          description: row.description || null,
          is_active: Boolean(row.is_active),
          created_at: row.created_at,
          parent_name: row.parent_id ? (nameMap.get(row.parent_id) || null) : null,
        }))

        return {
          rows,
          count: (count ?? data.length) + unSyncedLocal.length,
        }
      }
    } catch {
      // Backend error (400, 401, offline) -> fallback to local storage
    }
  }

  // 2. Fallback to local storage
  let list = getStoredCategoriesList()
  if (params.status === 'active') {
    list = list.filter((r) => r.is_active)
  } else if (params.status === 'inactive') {
    list = list.filter((r) => !r.is_active)
  }

  if (params.search?.trim()) {
    const q = params.search.trim().toLowerCase()
    list = list.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    )
  }

  const nameMap = new Map<string, string>()
  list.forEach((c) => nameMap.set(c.id, c.name))

  const total = list.length
  const from = (page - 1) * pageSize
  const paged = list.slice(from, from + pageSize).map((row) => ({
    ...row,
    parent_name: row.parent_id ? (nameMap.get(row.parent_id) || null) : null,
  }))

  return {
    rows: paged,
    count: total,
  }
}

export async function listCategoryOptions(): Promise<{ id: string; name: string; code: string }[]> {
  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, code')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (!error && data && data.length > 0) {
        const localList = getStoredCategoriesList().filter((c) => c.is_active)
        const dbIds = new Set(data.map((r: { id: string }) => r.id))
        const unSynced = localList.filter((l) => !dbIds.has(l.id))
        return [
          ...(data as { id: string; name: string; code: string }[]),
          ...unSynced.map((u) => ({ id: u.id, name: u.name, code: u.code })),
        ]
      }
    } catch {
      // Fallback
    }
  }

  const localList = getStoredCategoriesList().filter((c) => c.is_active)
  return localList.map((c) => ({ id: c.id, name: c.name, code: c.code }))
}

export async function createCategory(input: CreateCategoryInput): Promise<CategoryRow> {
  const localList = getStoredCategoriesList()
  let code = input.code?.trim()
  if (!code) {
    const numericCodes = localList
      .map((c) => parseInt(c.code.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const maxNum = numericCodes.length > 0 ? Math.max(...numericCodes) : 0
    code = String(maxNum + 1).padStart(3, '0')
  }

  let createdId = `cat-${Date.now()}`
  let dbRow: CategoryRow | null = null

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const companyId = await currentCompanyId()
      const payload: Record<string, unknown> = {
        company_id: companyId,
        code,
        name: input.name.trim(),
        parent_id: isUuid(input.parent_id) ? input.parent_id : null,
        description: input.description?.trim() || null,
        is_active: input.is_active ?? true,
      }

      const { data, error } = await supabase
        .from('categories')
        .insert(payload)
        .select()
        .single()

      if (!error && data) {
        dbRow = data as CategoryRow
        createdId = data.id
      }
    } catch {
      // Continue to local save
    }
  }

  const parentName = input.parent_id
    ? localList.find((c) => c.id === input.parent_id)?.name || null
    : null

  const newRow: CategoryRow = {
    id: createdId,
    company_id: dbRow?.company_id || 'company-babybloom',
    parent_id: input.parent_id || null,
    code,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    is_active: input.is_active ?? true,
    created_at: dbRow?.created_at || new Date().toISOString(),
    parent_name: parentName,
  }

  localList.unshift(newRow)
  saveStoredCategoriesList(localList)

  return newRow
}

export async function updateCategory(input: UpdateCategoryInput): Promise<CategoryRow> {
  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const payload: Record<string, unknown> = {}
      if (input.name !== undefined) payload.name = input.name.trim()
      if (input.code !== undefined) payload.code = input.code.trim()
      if (input.parent_id !== undefined) payload.parent_id = isUuid(input.parent_id) ? input.parent_id : null
      if (input.description !== undefined) payload.description = input.description.trim() || null
      if (input.is_active !== undefined) payload.is_active = input.is_active
      payload.updated_at = new Date().toISOString()

      await supabase.from('categories').update(payload).eq('id', input.id)
    } catch {
      // Continue to local update
    }
  }

  const list = getStoredCategoriesList()
  const idx = list.findIndex((c) => c.id === input.id)
  if (idx !== -1 && list[idx]) {
    const existing = list[idx]
    const parentName = input.parent_id
      ? list.find((c) => c.id === input.parent_id)?.name || null
      : existing.parent_name
    const updated: CategoryRow = {
      ...existing,
      code: input.code !== undefined ? input.code.trim() : existing.code,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      parent_id: input.parent_id !== undefined ? (input.parent_id || null) : existing.parent_id,
      description: input.description !== undefined ? (input.description.trim() || null) : existing.description,
      is_active: input.is_active !== undefined ? input.is_active : existing.is_active,
      parent_name: parentName,
    }
    list[idx] = updated
    saveStoredCategoriesList(list)
    return updated
  }

  return {
    id: input.id,
    company_id: 'company-babybloom',
    code: input.code || '001',
    name: input.name || '',
    parent_id: input.parent_id || null,
    description: input.description || null,
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
  }
}

export async function toggleCategoryStatus(id: string, currentStatus: boolean): Promise<CategoryRow> {
  return updateCategory({ id, is_active: !currentStatus })
}

export async function softDeleteCategory(id: string): Promise<void> {
  if (!isBackendOffline()) {
    try {
      const supabase = db()
      await supabase
        .from('categories')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
    } catch { }
  }

  const list = getStoredCategoriesList()
  const filtered = list.filter((c) => c.id !== id)
  saveStoredCategoriesList(filtered)
}