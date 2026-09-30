import { requireSupabase, throwOnError } from './client'

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

export async function listStockLocationsPaginated(params: {
  search?: string
  status?: 'active' | 'inactive' | 'all'
  branchId?: string
  warehouseId?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: StockLocationRow[]; count: number }> {
  const supabase = db()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 15

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
      branches:branches!branch_id (
        id,
        name
      ),
      warehouses:warehouses!warehouse_id (
        id,
        name,
        code
      )
    `, { count: 'exact' })
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (params.status === 'active') {
    query = query.eq('is_active', true)
  } else if (params.status === 'inactive') {
    query = query.eq('is_active', false)
  }

  if (params.branchId) {
    query = query.eq('branch_id', params.branchId)
  }

  if (params.warehouseId) {
    query = query.eq('warehouse_id', params.warehouseId)
  }

  if (params.search?.trim()) {
    const term = safe(params.search.trim())
    query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%,description.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  throwOnError(error)

  const rawRows = (data ?? []) as any[]
  const locationIds = rawRows.map(r => r.id)

  // Query live stock aggregates from public.current_stock for these locations
  const stockMap = new Map<string, { skus: number; qty: number; value: number }>()
  if (locationIds.length > 0) {
    try {
      const { data: stockData } = await supabase
        .from('current_stock')
        .select('stock_location_id, quantity_on_hand, weighted_average_cost')
        .in('stock_location_id', locationIds)

      if (stockData && Array.isArray(stockData)) {
        for (const item of stockData) {
          const locId = item.stock_location_id
          const qty = Number(item.quantity_on_hand) || 0
          const cost = Number(item.weighted_average_cost) || 0
          const val = qty * cost

          const existing = stockMap.get(locId) || { skus: 0, qty: 0, value: 0 }
          existing.skus += 1
          existing.qty += qty
          existing.value += val
          stockMap.set(locId, existing)
        }
      }
    } catch {
      // Non-fatal if current_stock view has a temporary issue
    }
  }

  const rows: StockLocationRow[] = rawRows.map((row) => {
    const stockInfo = stockMap.get(row.id) || { skus: 0, qty: 0, value: 0 }
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
      branch_name: row.branches?.name || 'All Branches',
      warehouse_name: row.warehouses?.name || 'Main Warehouse',
      warehouse_code: row.warehouses?.code || '',
      total_skus: stockInfo.skus,
      total_stock_qty: stockInfo.qty,
      total_stock_value: stockInfo.value,
    }
  })

  return {
    rows,
    count: count ?? rows.length,
  }
}

export async function listBranchesForLocation(): Promise<BranchOption[]> {
  const supabase = db()
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, code')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  throwOnError(error)
  return (data ?? []) as BranchOption[]
}

export async function listWarehousesForLocation(branchId?: string): Promise<WarehouseOption[]> {
  const supabase = db()
  let query = supabase
    .from('warehouses')
    .select('id, name, code, branch_id')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query
  throwOnError(error)
  return (data ?? []) as WarehouseOption[]
}

export async function getStockLocationKpis(): Promise<StockLocationKpis> {
  const supabase = db()

  const { data: locs, error: locErr } = await supabase
    .from('stock_locations')
    .select('id, is_active, warehouse_id')
    .is('deleted_at', null)

  throwOnError(locErr)
  const allLocs = (locs ?? []) as any[]

  const totalLocations = allLocs.length
  const activeLocations = allLocs.filter(l => l.is_active).length
  const inactiveLocations = totalLocations - activeLocations
  const warehouseSet = new Set(allLocs.map(l => l.warehouse_id))

  let totalStockUnits = 0
  let totalSkusStored = 0

  try {
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

  return {
    totalLocations,
    activeLocations,
    inactiveLocations,
    totalWarehouses: warehouseSet.size,
    totalStockUnits,
    totalSkusStored,
  }
}

export async function createStockLocation(input: CreateStockLocationInput): Promise<StockLocationRow> {
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
      .from('stock_locations')
      .select('*', { count: 'exact', head: true })
      .eq('warehouse_id', input.warehouse_id)
    code = `LOC-${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  const payload: Record<string, unknown> = {
    company_id: companyId,
    branch_id: input.branch_id,
    warehouse_id: input.warehouse_id,
    code,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    is_active: input.is_active ?? true,
    created_by: currentUserId,
  }

  let { data, error } = await supabase
    .from('stock_locations')
    .insert(payload)
    .select()
    .single()

  if (error && error.message?.includes('created_by')) {
    delete payload.created_by
    const retry = await supabase
      .from('stock_locations')
      .insert(payload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  throwOnError(error)
  return data as StockLocationRow
}

export async function updateStockLocation(input: UpdateStockLocationInput): Promise<StockLocationRow> {
  const supabase = db()
  const payload: Record<string, unknown> = {}

  if (input.branch_id !== undefined) payload.branch_id = input.branch_id
  if (input.warehouse_id !== undefined) payload.warehouse_id = input.warehouse_id
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.code !== undefined) payload.code = input.code.trim()
  if (input.description !== undefined) payload.description = input.description.trim() || null
  if (input.is_active !== undefined) payload.is_active = input.is_active

  payload.updated_at = new Date().toISOString()

  let { data, error } = await supabase
    .from('stock_locations')
    .update(payload)
    .eq('id', input.id)
    .select()
    .single()

  if (error && error.message?.includes('updated_at')) {
    delete payload.updated_at
    const retry = await supabase
      .from('stock_locations')
      .update(payload)
      .eq('id', input.id)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  throwOnError(error)
  return data as StockLocationRow
}

export async function toggleStockLocationStatus(id: string, currentStatus: boolean): Promise<StockLocationRow> {
  return updateStockLocation({ id, is_active: !currentStatus })
}

export async function deleteStockLocation(id: string): Promise<void> {
  const supabase = db()

  // Safety verification: Check if there is active stock in this location
  try {
    const { data: stockItems } = await supabase
      .from('current_stock')
      .select('quantity_on_hand, product_name')
      .eq('stock_location_id', id)
      .gt('quantity_on_hand', 0)
      .limit(5)

    if (stockItems && stockItems.length > 0) {
      const totalItems = stockItems.reduce((acc: number, curr: any) => acc + Number(curr.quantity_on_hand), 0)
      throw new Error(
        `Cannot delete this location: It still contains active inventory (${totalItems} units). Please transfer or adjust the stock first.`
      )
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Cannot delete this location')) {
      throw err
    }
  }

  const { error } = await supabase
    .from('stock_locations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)

  throwOnError(error)
}
