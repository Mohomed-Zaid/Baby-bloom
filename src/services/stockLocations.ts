import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_BRANCHES, MOCK_LOCATIONS } from './mockData'
import { currentCompanyId } from './masterData'
import { getStoredWarehousesList } from './warehouses'

const safe = (v: string) => v.replaceAll(',', ' ').replaceAll('%', '\\%')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => requireSupabase() as any

export interface StockLocationRow {
  id: string
  company_id: string
  branch_id: string
  warehouse_id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at?: string
  branch_name?: string | null
  warehouse_name?: string | null
  warehouse_code?: string | null
  total_skus?: number
  total_stock_qty?: number
  total_stock_value?: number
}

export interface BranchOption {
  id: string
  name: string
  code?: string
}

export interface WarehouseOption {
  id: string
  name: string
  code?: string
  branch_id: string
}

export interface CreateStockLocationInput {
  branch_id: string
  warehouse_id: string
  code?: string
  name: string
  description?: string
  is_active?: boolean
}

export interface UpdateStockLocationInput extends Partial<CreateStockLocationInput> {
  id: string
}

export interface StockLocationKpis {
  totalLocations: number
  activeLocations: number
  inactiveLocations: number
  totalWarehouses: number
  totalStockUnits: number
  totalSkusStored: number
}

const STORAGE_KEY = 'bb_stock_locations_list'

const isUuid = (str: string | null | undefined): boolean =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str))

export function getStoredStockLocationsList(): StockLocationRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as StockLocationRow[]
    }
  } catch { }

  const defaultCompanyId = 'company-babybloom'
  const warehouses = getStoredWarehousesList()
  const whMap = new Map(warehouses.map(w => [w.id, w]))
  const branchMap = new Map(MOCK_BRANCHES.map(b => [b.id, b.name]))

  const seed: StockLocationRow[] = MOCK_LOCATIONS.map((l, i) => {
    const wh = whMap.get(l.warehouse_id)
    const branchId = wh?.branch_id || 'branch-colombo'
    return {
      id: l.id,
      company_id: defaultCompanyId,
      branch_id: branchId,
      warehouse_id: l.warehouse_id,
      code: l.code || `LOC-00${i + 1}`,
      name: l.name,
      description: 'Standard storage location',
      is_active: l.is_active,
      created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      branch_name: branchMap.get(branchId) || wh?.branch_name || 'Main Flagship Store - Colombo 03',
      warehouse_name: wh?.name || 'Main Warehouse',
      warehouse_code: wh?.code || '001',
      total_skus: 0,
      total_stock_qty: 0,
      total_stock_value: 0,
    }
  })

  saveStoredStockLocationsList(seed)
  return seed
}

export function saveStoredStockLocationsList(list: StockLocationRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { }
}

export async function listStockLocationsPaginated(params: {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  branchId?: string
  warehouseId?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: StockLocationRow[]; count: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

  // 1. Attempt Supabase query without composite joins
  if (!isBackendOffline()) {
    try {
      const supabase = db()
      let query = supabase
        .from('stock_locations')
        .select(`
          id,
          company_id,
          branch_id,
          warehouse_id,
          code,
          name,
          description,
          is_active,
          created_at,
          updated_at
        `, { count: 'exact' })
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (params.status === 'active') {
        query = query.eq('is_active', true)
      } else if (params.status === 'inactive') {
        query = query.eq('is_active', false)
      }

      if (params.branchId && isUuid(params.branchId)) {
        query = query.eq('branch_id', params.branchId)
      }

      if (params.warehouseId && isUuid(params.warehouseId)) {
        query = query.eq('warehouse_id', params.warehouseId)
      }

      if (params.search?.trim()) {
        const term = safe(params.search.trim())
        query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%,description.ilike.%${term}%`)
      }

      const { data, error, count: dbCount } = await query
      if (!error && data && data.length > 0) {
        const localList = getStoredStockLocationsList()
        const dbIds = new Set(data.map((r: { id: string }) => r.id))
        const unSyncedLocal = localList.filter((l) => !dbIds.has(l.id))

        let combined = [...(data as StockLocationRow[]), ...unSyncedLocal]
        if (params.status === 'active') combined = combined.filter((c) => c.is_active)
        else if (params.status === 'inactive') combined = combined.filter((c) => !c.is_active)
        if (params.branchId) combined = combined.filter((c) => c.branch_id === params.branchId)
        if (params.warehouseId) combined = combined.filter((c) => c.warehouse_id === params.warehouseId)
        if (params.search?.trim()) {
          const q = params.search.trim().toLowerCase()
          combined = combined.filter(
            (c) =>
              c.code.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q) ||
              (c.description && c.description.toLowerCase().includes(q))
          )
        }

        const branches = await listBranchesForLocation()
        const branchMap = new Map<string, string>()
        branches.forEach(b => branchMap.set(b.id, b.name))
        MOCK_BRANCHES.forEach(b => branchMap.set(b.id, b.name))

        const warehouses = getStoredWarehousesList()
        const whMap = new Map(warehouses.map(w => [w.id, w]))

        const total = Math.max(dbCount ?? 0, combined.length)
        const from = (page - 1) * pageSize
        const rows: StockLocationRow[] = combined.slice(from, from + pageSize).map((row) => {
          const wh = whMap.get(row.warehouse_id)
          return {
            id: row.id,
            company_id: row.company_id,
            branch_id: row.branch_id,
            warehouse_id: row.warehouse_id,
            code: row.code,
            name: row.name,
            description: row.description || null,
            is_active: Boolean(row.is_active),
            created_at: row.created_at,
            branch_name: branchMap.get(row.branch_id) || wh?.branch_name || 'All Branches',
            warehouse_name: wh?.name || 'Main Warehouse',
            warehouse_code: wh?.code || '',
            total_skus: 0,
            total_stock_qty: 0,
            total_stock_value: 0,
          }
        })

        return {
          rows,
          count: total,
        }
      }
    } catch {
      // Backend error -> fallback to local storage
    }
  }

  // 2. Fallback to local storage
  let list = getStoredStockLocationsList()
  if (params.status === 'active') {
    list = list.filter((r) => r.is_active)
  } else if (params.status === 'inactive') {
    list = list.filter((r) => !r.is_active)
  }

  if (params.branchId) {
    list = list.filter((r) => r.branch_id === params.branchId)
  }

  if (params.warehouseId) {
    list = list.filter((r) => r.warehouse_id === params.warehouseId)
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

  const branches = await listBranchesForLocation()
  const branchMap = new Map<string, string>()
  branches.forEach(b => branchMap.set(b.id, b.name))
  MOCK_BRANCHES.forEach(b => branchMap.set(b.id, b.name))

  const warehouses = getStoredWarehousesList()
  const whMap = new Map(warehouses.map(w => [w.id, w]))

  const total = list.length
  const from = (page - 1) * pageSize
  const paged = list.slice(from, from + pageSize).map((row) => {
    const wh = whMap.get(row.warehouse_id)
    return {
      ...row,
      branch_name: branchMap.get(row.branch_id) || wh?.branch_name || 'All Branches',
      warehouse_name: wh?.name || 'Main Warehouse',
      warehouse_code: wh?.code || '',
    }
  })

  return {
    rows: paged,
    count: total,
  }
}

export async function listBranchesForLocation(): Promise<BranchOption[]> {
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
      .order('name', { ascending: true })

    if (!error && data) return data as BranchOption[]
  } catch {
    // fallback
  }
  return MOCK_BRANCHES.map(b => ({ id: b.id, name: b.name, code: '001' }))
}

export async function listWarehousesForLocation(branchId?: string): Promise<WarehouseOption[]> {
  const localWarehouses = getStoredWarehousesList().filter(w => w.is_active)
  let result: WarehouseOption[] = []

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      let query = supabase
        .from('warehouses')
        .select('id, name, code, branch_id')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (branchId && isUuid(branchId)) {
        query = query.eq('branch_id', branchId)
      }

      const { data, error } = await query
      if (!error && data && Array.isArray(data)) {
        result = data as WarehouseOption[]
      }
    } catch {
      // fallback
    }
  }

  const seenIds = new Set(result.map(w => w.id))
  for (const w of localWarehouses) {
    if (!seenIds.has(w.id)) {
      result.push({
        id: w.id,
        name: w.name,
        code: w.code,
        branch_id: w.branch_id,
      })
    }
  }

  if (branchId) {
    result = result.filter(w => w.branch_id === branchId)
  }
  return result
}

export async function getStockLocationKpis(): Promise<StockLocationKpis> {
  const localList = getStoredStockLocationsList()
  const warehouses = getStoredWarehousesList()

  const totalLocations = localList.length
  const activeLocations = localList.filter(l => l.is_active).length
  const inactiveLocations = totalLocations - activeLocations
  const warehouseSet = new Set(localList.map(l => l.warehouse_id))

  let totalStockUnits = 0
  let totalSkusStored = 0

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const { data: stockData } = await supabase
        .from('current_stock')
        .select('quantity_on_hand')

      if (stockData && Array.isArray(stockData)) {
        totalSkusStored = stockData.length
        totalStockUnits = stockData.reduce((acc: number, curr: any) => acc + (Number(curr.quantity_on_hand) || 0), 0)
      }
    } catch {
      // Current stock calculation fallback
    }
  }

  return {
    totalLocations,
    activeLocations,
    inactiveLocations,
    totalWarehouses: Math.max(warehouseSet.size, warehouses.length),
    totalStockUnits,
    totalSkusStored,
  }
}

export async function createStockLocation(input: CreateStockLocationInput): Promise<StockLocationRow> {
  const localList = getStoredStockLocationsList()
  let code = input.code?.trim()
  if (!code) {
    const count = localList.filter(l => l.warehouse_id === input.warehouse_id).length
    code = `LOC-${String(count + 1).padStart(3, '0')}`
  }

  let createdId = `loc-${Date.now()}`
  let dbRow: StockLocationRow | null = null

  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const companyId = await currentCompanyId()

      if (isUuid(input.branch_id) && isUuid(input.warehouse_id) && isUuid(companyId)) {
        const payload: Record<string, unknown> = {
          company_id: companyId,
          branch_id: input.branch_id,
          warehouse_id: input.warehouse_id,
          code,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          is_active: input.is_active ?? true,
        }

        const { data, error } = await supabase
          .from('stock_locations')
          .insert(payload)
          .select()
          .single()

        if (!error && data) {
          dbRow = data as StockLocationRow
          createdId = data.id
        }
      }
    } catch {
      // Continue to local save
    }
  }

  const branches = await listBranchesForLocation()
  const branchName = branches.find(b => b.id === input.branch_id)?.name ||
    MOCK_BRANCHES.find(b => b.id === input.branch_id)?.name ||
    'Main Flagship Store - Colombo 03'

  const warehouses = getStoredWarehousesList()
  const wh = warehouses.find(w => w.id === input.warehouse_id)

  const newRow: StockLocationRow = {
    id: createdId,
    company_id: dbRow?.company_id || 'company-babybloom',
    branch_id: input.branch_id,
    warehouse_id: input.warehouse_id,
    code,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    is_active: input.is_active ?? true,
    created_at: dbRow?.created_at || new Date().toISOString(),
    branch_name: branchName,
    warehouse_name: wh?.name || 'Main Warehouse',
    warehouse_code: wh?.code || '',
    total_skus: 0,
    total_stock_qty: 0,
    total_stock_value: 0,
  }

  localList.unshift(newRow)
  saveStoredStockLocationsList(localList)

  return newRow
}

export async function updateStockLocation(input: UpdateStockLocationInput): Promise<StockLocationRow> {
  if (!isBackendOffline()) {
    try {
      const supabase = db()
      const payload: Record<string, unknown> = {}

      if (input.branch_id !== undefined && isUuid(input.branch_id)) payload.branch_id = input.branch_id
      if (input.warehouse_id !== undefined && isUuid(input.warehouse_id)) payload.warehouse_id = input.warehouse_id
      if (input.name !== undefined) payload.name = input.name.trim()
      if (input.code !== undefined) payload.code = input.code.trim()
      if (input.description !== undefined) payload.description = input.description.trim() || null
      if (input.is_active !== undefined) payload.is_active = input.is_active
      payload.updated_at = new Date().toISOString()

      if (isUuid(input.id)) {
        await supabase.from('stock_locations').update(payload).eq('id', input.id)
      }
    } catch {
      // Continue to local update
    }
  }

  const list = getStoredStockLocationsList()
  const idx = list.findIndex((l) => l.id === input.id)
  if (idx !== -1 && list[idx]) {
    const existing = list[idx]
    const warehouses = getStoredWarehousesList()
    const effWhId = input.warehouse_id || existing.warehouse_id
    const wh = warehouses.find(w => w.id === effWhId)

    const branches = await listBranchesForLocation()
    const effBranchId = input.branch_id || existing.branch_id
    const branchName = branches.find(b => b.id === effBranchId)?.name || existing.branch_name

    const updated: StockLocationRow = {
      ...existing,
      branch_id: input.branch_id !== undefined ? input.branch_id : existing.branch_id,
      warehouse_id: input.warehouse_id !== undefined ? input.warehouse_id : existing.warehouse_id,
      code: input.code !== undefined ? input.code.trim() : existing.code,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      description: input.description !== undefined ? (input.description.trim() || null) : existing.description,
      is_active: input.is_active !== undefined ? input.is_active : existing.is_active,
      branch_name: branchName,
      warehouse_name: wh?.name || existing.warehouse_name,
      warehouse_code: wh?.code || existing.warehouse_code,
    }
    list[idx] = updated
    saveStoredStockLocationsList(list)
    return updated
  }

  return {
    id: input.id,
    company_id: 'company-babybloom',
    branch_id: input.branch_id || 'branch-colombo',
    warehouse_id: input.warehouse_id || 'wh-colombo-main',
    code: input.code || 'LOC-001',
    name: input.name || '',
    description: input.description || null,
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
  }
}

export async function toggleStockLocationStatus(id: string, currentStatus: boolean): Promise<StockLocationRow> {
  return updateStockLocation({ id, is_active: !currentStatus })
}

export async function deleteStockLocation(id: string): Promise<void> {
  if (!isBackendOffline() && isUuid(id)) {
    try {
      const supabase = db()
      await supabase
        .from('stock_locations')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
    } catch { }
  }

  const list = getStoredStockLocationsList()
  const filtered = list.filter((l) => l.id !== id)
  saveStoredStockLocationsList(filtered)
}
