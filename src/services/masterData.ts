import type { Json } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

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

export async function currentCompanyId(): Promise<string> {
  const { data, error } = await requireSupabase().rpc('current_user_company_id')
  throwOnError(error)
  if (!data) throw new Error('No active company is associated with this account.')
  return data
}

export async function listMasterPage(options: ListOptions): Promise<PageResult> {
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
  throwOnError(error)
  return { rows: (data ?? []) as unknown as MasterRecord[], count: count ?? 0 }
}

export async function getMasterRecord(tableName: MasterTable, id: string): Promise<MasterRecord> {
  const { data, error } = await table(tableName).select('*').eq('id', id).single()
  throwOnError(error)
  return data as unknown as MasterRecord
}

export async function createMasterRecord(tableName: MasterTable, values: Record<string, unknown>): Promise<string> {
  const companyId = await currentCompanyId()
  const { data, error } = await table(tableName)
    .insert({ ...values, company_id: companyId } as never)
    .select('id').single()
  throwOnError(error)
  if (!data) throw new Error('The record was not returned after creation.')
  return (data as unknown as { id: string }).id
}

export async function updateMasterRecord(tableName: MasterTable, id: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await table(tableName).update(values as never).eq('id', id)
  throwOnError(error)
}

export async function setMasterActive(tableName: MasterTable, id: string, active: boolean, statusField = 'is_active'): Promise<void> {
  const value = statusField === 'status' ? (active ? 'active' : 'inactive')
    : statusField === 'product_status' ? (active ? 'active' : 'inactive') : active
  const { error } = await table(tableName).update({ [statusField]: value } as never).eq('id', id)
  throwOnError(error)
}

export async function listLookup(tableName: MasterTable, labelField = 'name', filters: Record<string, string | boolean> = {}) {
  let query = table(tableName).select(`id,${labelField}`).order(labelField).limit(500)
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  const { data, error } = await query
  throwOnError(error)
  return ((data ?? []) as unknown as MasterRecord[]).map((row) => ({ value: row.id, label: String(row[labelField] ?? '') }))
}

export async function nextMasterCode(branchId: string, sequenceType: 'customer' | 'vendor' | 'product'): Promise<string> {
  const companyId = await currentCompanyId()
  const { data, error } = await callRpc('next_document_number', {
    p_company_id: companyId, p_branch_id: branchId, p_sequence_type: sequenceType,
  })
  throwOnError(error)
  if (typeof data !== 'string') throw new Error('The number sequence did not return a document number.')
  return data
}

export interface ProductDraft {
  product: Record<string, Json | undefined>
  variant: Record<string, Json | undefined>
}

export async function createProductWithVariant(draft: ProductDraft): Promise<string> {
  const { data, error } = await callRpc('create_product_with_default_variant', {
    p_product: draft.product as Json, p_variant: draft.variant as Json,
  })
  throwOnError(error)
  if (typeof data !== 'string') throw new Error('Product creation did not return an identifier.')
  return data
}

export async function resolveBarcode(barcode: string) {
  const { data, error } = await callRpc('resolve_product_barcode', { p_barcode: barcode })
  throwOnError(error)
  return (data ?? []) as { product_variant_id:string; product_id:string; sku:string; variant_name:string; pack_quantity:number }[]
}
