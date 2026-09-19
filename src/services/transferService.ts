import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type { BranchTransferShipment } from '../types/orders'

type RpcResult<T = unknown> = { data: T; error: { message: string } | null }
const callRpc = <T = unknown>(name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

export async function fetchBranchTransferShipments(
  branchId?: string,
  statusFilter?: string
): Promise<BranchTransferShipment[]> {
  const companyId = await currentCompanyId()
  let query = getTable('branch_transfer_shipments')
    .select(`
      *,
      source_branch:source_branch_id (id, name, code),
      destination_branch:destination_branch_id (id, name, code),
      items:branch_transfer_shipment_items (
        id, product_variant_id, dispatched_quantity, received_quantity, unit_cost,
        discrepancy_quantity, discrepancy_reason,
        variant:product_variant_id (
          id, variant_name, sku, barcode,
          product:product_id (id, name, product_code)
        )
      )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (branchId && branchId !== 'all') {
    query = query.or(`source_branch_id.eq.${branchId},destination_branch_id.eq.${branchId}`)
  }

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  throwOnError(error)
  return (data || []) as unknown as BranchTransferShipment[]
}

export async function fetchShipmentDetails(shipmentId: string): Promise<BranchTransferShipment | null> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('branch_transfer_shipments')
    .select(`
      *,
      source_branch:source_branch_id (id, name, code),
      destination_branch:destination_branch_id (id, name, code),
      items:branch_transfer_shipment_items (
        id, product_variant_id, dispatched_quantity, received_quantity, unit_cost,
        discrepancy_quantity, discrepancy_reason,
        variant:product_variant_id (
          id, variant_name, sku, barcode,
          product:product_id (id, name, product_code)
        )
      )
    `)
    .eq('company_id', companyId)
    .eq('id', shipmentId)
    .single()

  throwOnError(error)
  return (data as unknown as BranchTransferShipment) ?? null
}

export async function createBranchTransferShipment(payload: {
  source_branch_id: string
  source_warehouse_id: string
  source_location_id: string
  destination_branch_id: string
  destination_warehouse_id: string
  destination_location_id: string
  carrier_name?: string
  tracking_number?: string
  notes?: string
  items: Array<{ product_variant_id: string; quantity: number }>
}): Promise<{
  success: boolean
  shipment_id: string
  transfer_number: string
  status: string
}> {
  const res = await callRpc<{
    success: boolean
    shipment_id: string
    transfer_number: string
    status: string
  }>('create_branch_transfer_shipment', {
    p_shipment: payload,
  })
  throwOnError(res.error)
  return res.data
}

export async function confirmBranchTransferReceipt(
  shipmentId: string,
  receivedItems: Array<{
    product_variant_id: string
    received_quantity: number
    discrepancy_reason?: string
  }>
): Promise<{
  success: boolean
  shipment_id: string
  status: string
  has_discrepancy: boolean
}> {
  const res = await callRpc<{
    success: boolean
    shipment_id: string
    status: string
    has_discrepancy: boolean
  }>('confirm_branch_transfer_receipt', {
    p_shipment_id: shipmentId,
    p_received_items: receivedItems,
  })
  throwOnError(res.error)
  return res.data
}
