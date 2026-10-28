import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_BRANCHES, MOCK_WAREHOUSES } from './mockData'
import { currentCompanyId } from './masterData'

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

const STORAGE_KEY = 'bb_warehouses_list'

const isUuid = (str: string | null | undefined): boolean =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str))

export function getStoredWarehousesList(): WarehouseRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as WarehouseRow[]
    }
  } catch { }

  const defaultCompanyId = 'company-babybloom'
  const branchMap = new Map(MOCK_BRANCHES.map(b => [b.id, b.name]))

  const seed: WarehouseRow[] = MOCK_WAREHOUSES.map((w, i) => ({
    id: w.id,
    company_id: defaultCompanyId,
    branch_id: w.branch_id || MOCK_BRANCHES[0]?.id || 'branch-colombo',
    code: w.code || String(i + 1).padStart(3, '0'),
    name: w.name,
    address: 'Colombo, Sri Lanka',
    is_default: i === 0,
    is_active: w.is_active,
    created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    branch_name: branchMap.get(w.branch_id) || 'Main Flagship Store - Colombo 03',
  }))

  saveStoredWarehousesList(seed)
  return seed
}

export function saveStoredWarehousesList(list: WarehouseRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { }
}

export async function listWarehousesPaginated(params: {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  branchId?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: WarehouseRow[]; count: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  // 1. Attempt Supabase query without composite foreign key join (which causes 400 Bad Request)
  if (!isBackendOffline()) {
    try {
      const supabase = db()
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

      if (params.branchId && isUuid(params.branchId)) {
        query = query.eq('branch_id', params.branchId)
      }

      if (params.search?.trim()) {
        const term = safe(params.search.trim())
        query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%,address.ilike.%${term}%`)
      }

      const { data, error, count: dbCount } = await query
      if (!error && data && data.length > 0) {
        const localList = getStoredWarehousesList()
        const dbIds = new Set(data.map((r: { id: string }) => r.id))
        const unSyncedLocal = localList.filter((l) => !dbIds.has(l.id))

        let combined = [...(data as WarehouseRow[]), ...unSyncedLocal]
        if (params.status === 'active') combined = combined.filter((c) => c.is_active)
        else if (params.status === 'inactive') combined = combined.filter((c) => !c.is_active)
        if (params.branchId) combined = combined.filter((c) => c.branch_id === params.branchId)
        if (params.search?.trim()) {
          const q = params.search.trim().toLowerCase()
          combined = combined.filter(
            (c) =>
              c.code.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q) ||
              (c.address && c.address.toLowerCase().includes(q))
          )
        }

        const branches = await listBranchesForWarehouse()
        const branchMap = new Map<string, string>()
        branches.forEach(b => branchMap.set(b.id, b.name))
        MOCK_BRANCHES.forEach(b => branchMap.set(b.id, b.name))

        const total = Math.max(dbCount ?? 0, combined.length)
        const from = (page - 1) * pageSize
        const rows: WarehouseRow[] = combined.slice(from, from + pageSize).map((row) => ({
          id: row.id,
          company_id: row.company_id,
          branch_id: row.branch_id,
          code: row.code,
          name: row.name,
          address: row.address || null,
          is_default: Boolean(row.is_default),
          is_active: Boolean(row.is_active),
          created_at: row.created_at,
          branch_name: branchMap.get(row.branch_id) || 'All Branches',
        }))

        return {
          rows,
          count: total,
        }
      }
    } catch {
      // Backend error (400, 401, offline) -> fallback to local storage
    }
  }

  // 2. Fallback to local storage
  let list = getStoredWarehousesList()
  if (params.status === 'active') {
    list = list.filter((r) => r.is_active)
  } else if (params.status === 'inactive') {
    list = list.filter((r) => !r.is_active)
  }

  if (params.branchId) {
    list = list.filter((r) => r.branch_id === params.branchId)
  }

  if (params.search?.trim()) {
    const q = params.search.trim().toLowerCase()
    list = list.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.address && r.address.toLowerCase().includes(q))
    )
  }

  const branches = await listBranchesForWarehouse()
  const branchMap = new Map<string, string>()
  branches.forEach(b => branchMap.set(b.id, b.name))
  MOCK_BRANCHES.forEach(b => branchMap.set(b.id, b.name))

  const total = list.length
  const from = (page - 1) * pageSize
  const paged = list.slice(from, from + pageSize).map((row) => ({
    ...row,
    branch_name: branchMap.get(row.branch_id) || 'All Branches',
  }))

  return {
    rows: paged,
    count: total,
  }
}

export async function listBranchesForWarehouse(): Promise<BranchOption[]> {
  if (isBackendOffline()) {
    return MOCK_BRANCHES.map(b => ({ id: b.id, name: b.name, code: '001' }))
  }
  const supabase = db()
  const session = (await supabase.auth.getSession()).data.session
  if (!session) {
    return MOCK_BRANCHES.map(b => ({ id: b.id, name: b.name, code: '001' }))
  }

  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, code')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (!error && data && data.length > 0) return data as BranchOption[]
  } catch {
    // fallback
  }
  return MOCK_BRANCHES.map(b => ({ id: b.id, name: b.name, code: '001' }))
}

export async function createWarehouse(input: CreateWarehouseInput): Promise<WarehouseRow> {
  const localList = getStoredWarehousesList()
  let code = input.code?.trim()
  if (!code) {
    const numericCodes = localList
      .map((w) => parseInt(w.code.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const maxNum = numericCodes.length > 0 ? Math.max(...numericCodes) : 0
    code = String(maxNum + 1).padStart(3, '0')
  }

  let createdId = `wh-${Date.now()}`
  let dbRow: WarehouseRow | null = null

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const companyId = await currentCompanyId()

      // If marked as default, unset other defaults in the same branch
      if (input.is_default && isUuid(input.branch_id) && isUuid(companyId)) {
        await supabase
          .from('warehouses')
          .update({ is_default: false })
          .eq('branch_id', input.branch_id)
          .eq('company_id', companyId)
      }

      if (isUuid(input.branch_id) && isUuid(companyId)) {
        const payload: Record<string, unknown> = {
          company_id: companyId,
          branch_id: input.branch_id,
          code,
          name: input.name.trim(),
          address: input.address?.trim() || null,
          is_default: input.is_default ?? false,
          is_active: input.is_active ?? true,
        }

        const { data, error } = await supabase
          .from('warehouses')
          .insert(payload)
          .select()
          .single()

        if (!error && data) {
          dbRow = data as WarehouseRow
          createdId = data.id
        }
      }
    } catch {
      // Continue to local save
    }
  }

  const branches = await listBranchesForWarehouse()
  const branchName = branches.find(b => b.id === input.branch_id)?.name ||
    MOCK_BRANCHES.find(b => b.id === input.branch_id)?.name ||
    'Main Flagship Store - Colombo 03'

  if (input.is_default) {
    localList.forEach(w => {
      if (w.branch_id === input.branch_id) w.is_default = false
    })
  }

  const newRow: WarehouseRow = {
    id: createdId,
    company_id: dbRow?.company_id || 'company-babybloom',
    branch_id: input.branch_id,
    code,
    name: input.name.trim(),
    address: input.address?.trim() || null,
    is_default: input.is_default ?? false,
    is_active: input.is_active ?? true,
    created_at: dbRow?.created_at || new Date().toISOString(),
    branch_name: branchName,
  }

  localList.unshift(newRow)
  saveStoredWarehousesList(localList)

  return newRow
}

export async function updateWarehouse(input: UpdateWarehouseInput): Promise<WarehouseRow> {
  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const payload: Record<string, unknown> = {}

      if (input.branch_id !== undefined && isUuid(input.branch_id)) payload.branch_id = input.branch_id
      if (input.name !== undefined) payload.name = input.name.trim()
      if (input.code !== undefined) payload.code = input.code.trim()
      if (input.address !== undefined) payload.address = input.address.trim() || null
      if (input.is_default !== undefined) payload.is_default = input.is_default
      if (input.is_active !== undefined) payload.is_active = input.is_active
      payload.updated_at = new Date().toISOString()

      if (input.is_default && input.branch_id && isUuid(input.branch_id)) {
        await supabase
          .from('warehouses')
          .update({ is_default: false })
          .eq('branch_id', input.branch_id)
      }

      if (isUuid(input.id)) {
        await supabase.from('warehouses').update(payload).eq('id', input.id)
      }
    } catch {
      // Continue to local update
    }
  }

  const list = getStoredWarehousesList()
  const idx = list.findIndex((w) => w.id === input.id)
  if (idx !== -1 && list[idx]) {
    const existing = list[idx]
    if (input.is_default && (input.branch_id || existing.branch_id)) {
      const effBranch = input.branch_id || existing.branch_id
      list.forEach(w => {
        if (w.branch_id === effBranch) w.is_default = false
      })
    }

    const branches = await listBranchesForWarehouse()
    const effBranchId = input.branch_id || existing.branch_id
    const branchName = branches.find(b => b.id === effBranchId)?.name || existing.branch_name

    const updated: WarehouseRow = {
      ...existing,
      branch_id: input.branch_id !== undefined ? input.branch_id : existing.branch_id,
      code: input.code !== undefined ? input.code.trim() : existing.code,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      address: input.address !== undefined ? (input.address.trim() || null) : existing.address,
      is_default: input.is_default !== undefined ? input.is_default : existing.is_default,
      is_active: input.is_active !== undefined ? input.is_active : existing.is_active,
      branch_name: branchName,
    }
    list[idx] = updated
    saveStoredWarehousesList(list)
    return updated
  }

  return {
    id: input.id,
    company_id: 'company-babybloom',
    branch_id: input.branch_id || 'branch-colombo',
    code: input.code || '001',
    name: input.name || '',
    address: input.address || null,
    is_default: input.is_default ?? false,
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
  }
}

export async function toggleWarehouseStatus(id: string, currentStatus: boolean): Promise<WarehouseRow> {
  return updateWarehouse({ id, is_active: !currentStatus })
}

export async function softDeleteWarehouse(id: string): Promise<void> {
  if (!isBackendOffline() && isUuid(id)) {
    try {
      const supabase = db()
      await supabase
        .from('warehouses')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
    } catch { }
  }

  const list = getStoredWarehousesList()
  const filtered = list.filter((w) => w.id !== id)
  saveStoredWarehousesList(filtered)
}