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
  try {
    const res = await callRpc<{
      success: boolean
      shipment_id: string
      transfer_number: string
      status: string
    }>('create_branch_transfer_shipment', {
      p_shipment: payload,
    })
    if (!res.error && res.data) {
      return res.data
    }
  } catch {
    // proceed to direct fallback
  }

  // Direct table insert fallback
  const client = requireSupabase()
  const companyId = await currentCompanyId()
  const transferNum = `TRF-SHP-${Date.now().toString().slice(-6)}`

  const { data: shipment, error: sErr } = await client
    .from('branch_transfer_shipments')
    .insert({
      company_id: companyId,
      transfer_number: transferNum,
      source_branch_id: payload.source_branch_id,
      source_warehouse_id: payload.source_warehouse_id,
      source_location_id: payload.source_location_id,
      destination_branch_id: payload.destination_branch_id,
      destination_warehouse_id: payload.destination_warehouse_id,
      destination_location_id: payload.destination_location_id,
      carrier_name: payload.carrier_name || 'Internal Fleet',
      tracking_number: payload.tracking_number || null,
      notes: payload.notes || null,
      status: 'in_transit',
      dispatched_at: new Date().toISOString(),
    } as never)
    .select('id')
    .single()
  throwOnError(sErr)
  const shipmentId = (shipment as unknown as { id: string }).id

  if (payload.items.length > 0) {
    const itemRows = payload.items.map((it) => ({
      company_id: companyId,
      shipment_id: shipmentId,
      product_variant_id: it.product_variant_id,
      dispatched_quantity: it.quantity,
      received_quantity: 0,
    }))
    const { error: iErr } = await client.from('branch_transfer_shipment_items').insert(itemRows as never)
    throwOnError(iErr)
  }

  return {
    success: true,
    shipment_id: shipmentId,
    transfer_number: transferNum,
    status: 'in_transit',
  }
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
  try {
    const res = await callRpc<{
      success: boolean
      shipment_id: string
      status: string
      has_discrepancy: boolean
    }>('confirm_branch_transfer_receipt', {
      p_shipment_id: shipmentId,
      p_received_items: receivedItems,
    })
    if (!res.error && res.data) {
      return res.data
    }
  } catch {
    // proceed to direct fallback
  }

  // Fallback direct table updates
  const client = requireSupabase()
  let hasDiscrepancy = false

  for (const item of receivedItems) {
    const { data: itemRows } = await client
      .from('branch_transfer_shipment_items')
      .select('dispatched_quantity')
      .eq('shipment_id', shipmentId)
      .eq('product_variant_id', item.product_variant_id)
      .limit(1)

    const dispatched = (itemRows?.[0] as unknown as { dispatched_quantity: number })?.dispatched_quantity ?? item.received_quantity
    const discrepancy = Number(dispatched) - Number(item.received_quantity)
    if (discrepancy !== 0) hasDiscrepancy = true

    await client
      .from('branch_transfer_shipment_items')
      .update({
        received_quantity: item.received_quantity,
        discrepancy_quantity: discrepancy,
        discrepancy_reason: item.discrepancy_reason || null,
      } as never)
      .eq('shipment_id', shipmentId)
      .eq('product_variant_id', item.product_variant_id)
  }

  const finalStatus = hasDiscrepancy ? 'discrepancy_reported' : 'received_fully'
  await client
    .from('branch_transfer_shipments')
    .update({
      status: finalStatus,
      received_at: new Date().toISOString(),
    } as never)
    .eq('id', shipmentId)

  return {
    success: true,
    shipment_id: shipmentId,
    status: finalStatus,
    has_discrepancy: hasDiscrepancy,
  }
}

