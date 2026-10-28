import type { Json } from '../types/domain'
import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'

export type MasterTable =
  | 'customers' | 'vendors' | 'categories' | 'brands' | 'units' | 'branches' | 'warehouses'
  | 'stock_locations' | 'banks' | 'bank_branches' | 'bank_accounts'
  | 'chart_of_accounts' | 'account_mappings' | 'number_sequences' | 'products'
  | 'product_variants' | 'product_barcodes'

export type MasterRecord = Record<string, unknown> & { id: string }
export interface PageResult { rows: MasterRecord[]; count: number }
export interface ListOptions {
  table: MasterTable
  page: number
  pageSize: number
  search?: string
  searchColumns?: string[]
  filters?: Record<string, string | boolean | null | undefined>
  orderBy?: string
  ascending?: boolean
  select?: string
}

const table = (name: MasterTable) => requireSupabase().from(name as 'customers')
type RpcResult = { data: unknown; error: { message: string } | null }
const callRpc = (name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult>)(name, args)

import {
  MOCK_BRANCHES,
  MOCK_WAREHOUSES,
  MOCK_LOCATIONS,
  MOCK_CATEGORIES,
  MOCK_BRANDS,
  MOCK_CUSTOMERS,
  MOCK_VENDORS,
  MOCK_BANK_ACCOUNTS,
  MOCK_PRODUCTS,
  MOCK_UNITS,
} from './mockData'
import {
  getStoredProductsList,
  saveNewProduct,
  updateProductDetails,
  setProductStatus,
} from './products'
import {
  getStoredCategoriesList,
  createCategory,
} from './categories'
import {
  getStoredWarehousesList,
  createWarehouse,
} from './warehouses'
import {
  getStoredStockLocationsList,
  createStockLocation,
} from './stockLocations'
import {
  getStoredBankAccountsList,
  createBankAccount,
} from './banks'
import {
  getStoredChartAccountsList,
  createChartAccount,
} from './chartOfAccounts'
import {
  getStoredNumberSequencesList,
  createNumberSequence,
} from './numberSequences'

let companyIdPromise: Promise<string> | null = null

export async function currentCompanyId(): Promise<string> {
  if (isBackendOffline()) return 'company-babybloom'
  const client = requireSupabase()
  const session = (await client.auth.getSession()).data.session
  if (!session) return 'company-babybloom'

  if (!companyIdPromise) {
    companyIdPromise = (async () => {
      try {
        const { data, error } = await client.rpc('current_user_company_id')
        if (!error && data) return data as string
      } catch {
        // fallback
      }
      companyIdPromise = null // don't cache failures; allow retry after cooldown
      return 'company-babybloom'
    })()
  }
  return companyIdPromise
}

function getMockMasterPage(options: ListOptions): PageResult {
  let list: MasterRecord[] = []
  if (options.table === 'branches') list = MOCK_BRANCHES as unknown as MasterRecord[]
  else if (options.table === 'customers') list = MOCK_CUSTOMERS as unknown as MasterRecord[]
  else if (options.table === 'vendors') list = MOCK_VENDORS as unknown as MasterRecord[]
  else if (options.table === 'categories') list = getStoredCategoriesList() as unknown as MasterRecord[]
  else if (options.table === 'brands') list = MOCK_BRANDS as unknown as MasterRecord[]
  else if (options.table === 'warehouses') list = getStoredWarehousesList() as unknown as MasterRecord[]
  else if (options.table === 'stock_locations') list = getStoredStockLocationsList() as unknown as MasterRecord[]
  else if (options.table === 'units') list = MOCK_UNITS as unknown as MasterRecord[]
  else if (options.table === 'bank_accounts') list = getStoredBankAccountsList() as unknown as MasterRecord[]
  else if (options.table === 'chart_of_accounts') list = getStoredChartAccountsList() as unknown as MasterRecord[]
  else if (options.table === 'number_sequences') list = getStoredNumberSequencesList() as unknown as MasterRecord[]
  else if (options.table === 'products') list = getStoredProductsList() as unknown as MasterRecord[]

  const search = options.search?.trim().toLowerCase()
  if (search) {
    list = list.filter((r) =>
      Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(search))
    )
  }
  return { rows: list, count: list.length }
}

function getMockLookup(tableName: MasterTable, _labelField = 'name') {
  if (tableName === 'branches') {
    return MOCK_BRANCHES.map((b) => ({ value: b.id, label: b.name }))
  }
  if (tableName === 'warehouses') {
    const stored = getStoredWarehousesList().filter((w) => w.is_active)
    if (stored.length > 0) {
      return stored.map((w) => ({ value: w.id, label: w.name }))
    }
    return MOCK_WAREHOUSES.map((w) => ({ value: w.id, label: w.name }))
  }
  if (tableName === 'stock_locations') {
    const stored = getStoredStockLocationsList().filter((l) => l.is_active)
    if (stored.length > 0) {
      return stored.map((l) => ({ value: l.id, label: l.name }))
    }
    return MOCK_LOCATIONS.map((l) => ({ value: l.id, label: l.name }))
  }
  if (tableName === 'categories') {
    const stored = getStoredCategoriesList().filter((c) => c.is_active)
    if (stored.length > 0) {
      return stored.map((c) => ({ value: c.id, label: c.name }))
    }
    return MOCK_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))
  }
  if (tableName === 'brands') {
    return MOCK_BRANDS.map((b) => ({ value: b.id, label: b.name }))
  }
  if (tableName === 'units') {
    return MOCK_UNITS.map((u) => ({ value: u.id, label: u.name }))
  }
  if (tableName === 'customers') {
    return MOCK_CUSTOMERS.map((c) => ({ value: c.id, label: c.name }))
  }
  if (tableName === 'vendors') {
    return MOCK_VENDORS.map((v) => ({ value: v.id, label: v.name }))
  }
  if (tableName === 'bank_accounts') {
    const stored = getStoredBankAccountsList().filter((a) => a.is_active)
    if (stored.length > 0) {
      return stored.map((a) => ({ value: a.id, label: `${a.bank_name || 'Bank'} - ${a.account_name} (${a.account_number})` }))
    }
    return MOCK_BANK_ACCOUNTS.map((a) => ({ value: a.id, label: `${a.bank_name} - ${a.account_name} (${a.account_number})` }))
  }
  if (tableName === 'chart_of_accounts') {
    return getStoredChartAccountsList()
      .filter((a) => a.is_active)
      .map((a) => ({ value: a.id, label: `[${a.account_code}] ${a.account_name}` }))
  }
  if (tableName === 'number_sequences') {
    return getStoredNumberSequencesList().map((s) => ({
      value: s.id,
      label: `${s.branch_name} - ${s.info?.label || s.sequence_type} (${s.prefix})`,
    }))
  }
  return []
}

export async function listMasterPage(options: ListOptions): Promise<PageResult> {
  if (isBackendOffline()) return getMockMasterPage(options)
  const session = (await requireSupabase().auth.getSession()).data.session
  if (!session) return getMockMasterPage(options)

  try {
    const from = (options.page - 1) * options.pageSize
    let query = table(options.table)
      .select(options.select ?? '*', { count: 'exact' })
      .range(from, from + options.pageSize - 1)
      .order(options.orderBy ?? 'created_at', { ascending: options.ascending ?? false })

    const search = options.search?.trim()
    if (search && options.searchColumns?.length) {
      const safe = search.replaceAll(',', ' ').replaceAll('%', '\\%')
      query = query.or(options.searchColumns.map((column) => `${column}.ilike.%${safe}%`).join(','))
    }
    for (const [column, value] of Object.entries(options.filters ?? {})) {
      if (value !== undefined && value !== null && value !== '') query = query.eq(column, value)
    }
    const { data, error, count } = await query
    if (!error && data) {
      return { rows: (data ?? []) as unknown as MasterRecord[], count: count ?? 0 }
    }
  } catch {
    // fallback
  }
  return getMockMasterPage(options)
}

export async function getMasterRecord(tableName: MasterTable, id: string): Promise<MasterRecord> {
  if (tableName === 'products') {
    const local = getStoredProductsList().find(p => p.id === id)
    if (local) return local as unknown as MasterRecord
  }
  if (isBackendOffline()) {
    const { rows } = getMockMasterPage({ table: tableName, page: 1, pageSize: 1000 })
    return rows.find((r) => r.id === id) ?? { id, name: id }
  }
  const session = (await requireSupabase().auth.getSession()).data.session
  if (!session) {
    const { rows } = getMockMasterPage({ table: tableName, page: 1, pageSize: 1000 })
    return rows.find((r) => r.id === id) ?? { id, name: id }
  }

  try {
    const { data, error } = await table(tableName).select('*').eq('id', id).single()
    if (!error && data) return data as unknown as MasterRecord
  } catch {
    // fallback
  }
  const { rows } = getMockMasterPage({ table: tableName, page: 1, pageSize: 1000 })
  return rows.find((r) => r.id === id) ?? { id, name: id }
}

export async function createMasterRecord(tableName: MasterTable, values: Record<string, unknown>): Promise<string> {
  if (tableName === 'categories') {
    const cat = await createCategory({
      name: String(values.name || ''),
      code: values.code ? String(values.code) : undefined,
      description: values.description ? String(values.description) : undefined,
      is_active: values.is_active !== false,
    })
    return cat.id
  }
  if (tableName === 'warehouses') {
    const wh = await createWarehouse({
      name: String(values.name || ''),
      branch_id: String(values.branch_id || 'branch-colombo'),
      code: values.code ? String(values.code) : undefined,
      address: values.address ? String(values.address) : undefined,
      is_default: Boolean(values.is_default),
      is_active: values.is_active !== false,
    })
    return wh.id
  }
  if (tableName === 'stock_locations') {
    const loc = await createStockLocation({
      name: String(values.name || ''),
      warehouse_id: String(values.warehouse_id || 'wh-colombo-main'),
      branch_id: String(values.branch_id || 'branch-colombo'),
      code: values.code ? String(values.code) : undefined,
      description: values.description ? String(values.description) : undefined,
      is_active: values.is_active !== false,
    })
    return loc.id
  }
  if (tableName === 'bank_accounts') {
    const account = await createBankAccount({
      branch_id: String(values.branch_id || 'branch-colombo'),
      bank_id: String(values.bank_id || ''),
      bank_branch_id: values.bank_branch_id ? String(values.bank_branch_id) : undefined,
      account_name: String(values.account_name || ''),
      account_number: String(values.account_number || ''),
      account_kind: String(values.account_kind || values.account_type || 'Current'),
      opening_balance: Number(values.opening_balance || 0),
      ledger_account_id: values.ledger_account_id ? String(values.ledger_account_id) : undefined,
      is_default: Boolean(values.is_default),
      is_active: values.is_active !== false,
    })
    return account.id
  }
  if (tableName === 'chart_of_accounts') {
    const account = await createChartAccount({
      account_code: String(values.account_code || ''),
      account_name: String(values.account_name || ''),
      account_type: (values.account_type || 'expense') as any,
      normal_balance: (values.normal_balance || 'debit') as any,
      parent_account_id: values.parent_account_id ? String(values.parent_account_id) : undefined,
      is_control_account: Boolean(values.is_control_account),
      is_system_account: Boolean(values.is_system_account),
      allow_manual_entries: values.allow_manual_entries !== false,
      is_active: values.is_active !== false,
    })
    return account.id
  }
  if (tableName === 'number_sequences') {
    const seq = await createNumberSequence({
      branch_id: String(values.branch_id || 'branch-colombo'),
      sequence_type: (values.sequence_type || 'invoice') as any,
      prefix: String(values.prefix || 'INV-'),
      next_number: Number(values.next_number || 1),
      padding_length: Number(values.padding_length || 6),
      reset_frequency: (values.reset_frequency || 'never') as any,
    })
    return seq.id
  }
  const companyId = await currentCompanyId()
  try {
    const { data, error } = await table(tableName)
      .insert({ ...values, company_id: companyId } as never)
      .select('id').single()
    if (!error && data) return (data as unknown as { id: string }).id
  } catch { }
  return `${tableName}-${Date.now()}`
}

export async function updateMasterRecord(tableName: MasterTable, id: string, values: Record<string, unknown>): Promise<void> {
  if (tableName === 'products') {
    await updateProductDetails(id, values)
    return
  }
  try {
    const { error } = await table(tableName).update(values as never).eq('id', id)
    if (!error) return
  } catch {
    // fallback
  }
}

export async function setMasterActive(tableName: MasterTable, id: string, active: boolean, statusField = 'is_active'): Promise<void> {
  if (tableName === 'products') {
    await setProductStatus(id, active)
    return
  }
  const value = statusField === 'status' ? (active ? 'active' : 'inactive')
    : statusField === 'product_status' ? (active ? 'active' : 'inactive') : active
  try {
    const { error } = await table(tableName).update({ [statusField]: value } as never).eq('id', id)
    if (!error) return
  } catch { }
}

export async function listLookup(tableName: MasterTable, labelField = 'name', filters: Record<string, string | boolean> = {}) {
  if (isBackendOffline()) return getMockLookup(tableName, labelField)
  const session = (await requireSupabase().auth.getSession()).data.session
  if (!session) return getMockLookup(tableName, labelField)

  try {
    let query = table(tableName).select(`id,${labelField}`).order(labelField).limit(500)
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
    const { data, error } = await query
    if (!error && data && data.length > 0) {
      return ((data ?? []) as unknown as MasterRecord[]).map((row) => ({ value: row.id, label: String(row[labelField] ?? '') }))
    }
  } catch {
    // fallback to mock data
  }

  return getMockLookup(tableName, labelField)
}

export async function nextMasterCode(branchId: string, sequenceType: 'customer' | 'vendor' | 'product'): Promise<string> {
  try {
    const companyId = await currentCompanyId()
    const { data, error } = await callRpc('next_document_number', {
      p_company_id: companyId, p_branch_id: branchId, p_sequence_type: sequenceType,
    })
    if (!error && typeof data === 'string') return data
  } catch { }
  const prefix = sequenceType === 'customer' ? 'CUST' : sequenceType === 'vendor' ? 'VEND' : 'PRD'
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`
}

export interface ProductDraft {
  product: Record<string, Json | undefined>
  variant: Record<string, Json | undefined>
}

export async function createProductWithVariant(draft: ProductDraft): Promise<string> {
  return await saveNewProduct({
    product: draft.product as never,
    variant: draft.variant as never,
  })
}

export async function resolveBarcode(barcode: string) {
  try {
    const { data, error } = await callRpc('resolve_product_barcode', { p_barcode: barcode })
    if (!error && data && Array.isArray(data) && data.length > 0) {
      return data as { product_variant_id: string; product_id: string; sku: string; variant_name: string; pack_quantity: number }[]
    }
  } catch { }
  const clean = barcode.trim().toLowerCase()
  const matched = MOCK_PRODUCTS.filter((p) => p.barcode === clean || p.sku.toLowerCase() === clean)
  return matched.map((p) => ({
    product_variant_id: p.id,
    product_id: p.product_id,
    sku: p.sku,
    variant_name: p.variant_name,
    pack_quantity: 1,
  }))
}
