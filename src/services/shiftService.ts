import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type {
  PosRegisterSession,
  PosCashMovement,
  ActiveShiftMetrics,
  ZReportData,
  OpenPosShiftSchema,
  CashMovementSchema,
  ClosePosShiftSchema,
  DenominationCounts,
} from '../types/shift'
import { z } from 'zod'

type RpcResult<T = unknown> = { data: T; error: { message: string } | null }
const callRpc = <T = unknown>(name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

export async function fetchActiveShiftSession(branchId?: string): Promise<ActiveShiftMetrics | null> {
  const res = await callRpc<{ active_session: ActiveShiftMetrics | null }>('get_active_pos_session', {
    p_branch_id: branchId || null,
  })
  throwOnError(res.error)
  return res.data?.active_session ?? null
}

export async function openPosShiftSession(
  payload: z.infer<typeof OpenPosShiftSchema>
): Promise<{ success: boolean; session_id: string; terminal_name: string; opened_at: string; opening_cash_float: number }> {
  const res = await callRpc<{
    success: boolean
    session_id: string
    terminal_name: string
    opened_at: string
    opening_cash_float: number
  }>('open_pos_session', {
    p_branch_id: payload.branch_id,
    p_opening_float: payload.opening_float,
    p_terminal_name: payload.terminal_name,
  })
  throwOnError(res.error)
  return res.data
}

export async function recordCashMovementService(
  payload: z.infer<typeof CashMovementSchema>
): Promise<{ success: boolean; movement_id: string; session_id: string; movement_type: string; amount: number }> {
  const res = await callRpc<{
    success: boolean
    movement_id: string
    session_id: string
    movement_type: string
    amount: number
  }>('record_pos_cash_movement', {
    p_session_id: payload.session_id,
    p_movement_type: payload.movement_type,
    p_amount: payload.amount,
    p_reason: payload.reason,
    p_authorized_by_id: payload.authorized_by_id || null,
  })
  throwOnError(res.error)
  return res.data
}

export async function closePosShiftSession(
  payload: z.infer<typeof ClosePosShiftSchema>,
  denominations?: DenominationCounts
): Promise<{ success: boolean; z_report: ZReportData }> {
  const res = await callRpc<{ success: boolean; z_report: ZReportData }>('close_pos_session', {
    p_session_id: payload.session_id,
    p_counted_cash: payload.closing_cash_counted,
    p_notes: payload.notes || null,
  })
  throwOnError(res.error)

  const zReport = res.data.z_report
  if (denominations && zReport) {
    zReport.denominations = denominations
  }
  return { success: true, z_report: zReport }
}

export async function fetchShiftHistory(branchId?: string, limit = 50): Promise<PosRegisterSession[]> {
  const companyId = await currentCompanyId()
  let query = getTable('pos_register_sessions')
    .select('*, branches(name), profiles(full_name)')
    .eq('company_id', companyId)
    .order('opened_at', { ascending: false })
    .limit(limit)

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<
    PosRegisterSession & { branches?: { name?: string }; profiles?: { full_name?: string } }
  >

  return rows.map((r) => ({
    ...r,
    branch_name: r.branches?.name,
    cashier_name: r.profiles?.full_name,
  }))
}

export async function fetchCashMovements(sessionId: string): Promise<PosCashMovement[]> {
  const { data, error } = await getTable('pos_register_cash_movements')
    .select('*, profiles(full_name)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  throwOnError(error)

  const rows = (data || []) as unknown as Array<
    PosCashMovement & { profiles?: { full_name?: string } }
  >

  return rows.map((r) => ({
    ...r,
    authorized_by_name: r.profiles?.full_name,
  }))
}
