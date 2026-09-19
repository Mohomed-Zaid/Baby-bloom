import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type { SystemAuditLogEntry, AuditFilterState, AuditSeverity, AuditEventType } from '../types/audit'

type RpcResult<T = unknown> = { data: T; error: { message: string } | null }
const callRpc = <T = unknown>(name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

export async function fetchAuditTrail(filters?: Partial<AuditFilterState>, limit = 100): Promise<SystemAuditLogEntry[]> {
  const companyId = await currentCompanyId()
  let query = getTable('system_audit_trail')
    .select('*, branches(name), profiles(full_name, email)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters?.event_type && filters.event_type !== 'all') {
    query = query.eq('event_type', filters.event_type)
  }

  if (filters?.severity && filters.severity !== 'all') {
    query = query.eq('severity', filters.severity)
  }

  if (filters?.user_id && filters.user_id !== 'all') {
    query = query.eq('user_id', filters.user_id)
  }

  if (filters?.date_from) {
    query = query.gte('created_at', `${filters.date_from}T00:00:00`)
  }

  if (filters?.date_to) {
    query = query.lte('created_at', `${filters.date_to}T23:59:59`)
  }

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<
    SystemAuditLogEntry & {
      branches?: { name?: string }
      profiles?: { full_name?: string; email?: string }
    }
  >

  let result = rows.map((r) => ({
    ...r,
    branch_name: r.branches?.name,
    user_name: r.profiles?.full_name,
    user_email: r.profiles?.email,
  }))

  if (filters?.search) {
    const s = filters.search.toLowerCase()
    result = result.filter(
      (item) =>
        item.event_type.toLowerCase().includes(s) ||
        (item.target_table && item.target_table.toLowerCase().includes(s)) ||
        (item.user_name && item.user_name.toLowerCase().includes(s)) ||
        (item.user_email && item.user_email.toLowerCase().includes(s)) ||
        (item.metadata && JSON.stringify(item.metadata).toLowerCase().includes(s)) ||
        (item.new_values && JSON.stringify(item.new_values).toLowerCase().includes(s))
    )
  }

  return result
}

export async function logAuditEvent(
  branchId: string | null,
  eventType: AuditEventType,
  severity: AuditSeverity = 'info',
  targetTable?: string,
  targetId?: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const res = await callRpc<string>('log_system_audit_event', {
    p_branch_id: branchId,
    p_event_type: eventType,
    p_severity: severity,
    p_target_table: targetTable || null,
    p_target_id: targetId || null,
    p_old_values: oldValues ? JSON.stringify(oldValues) : null,
    p_new_values: newValues ? JSON.stringify(newValues) : null,
    p_metadata: metadata ? JSON.stringify(metadata) : null,
  })
  if (res.error) {
    console.warn('Failed to log audit event:', res.error.message)
    return null
  }
  return res.data
}

export async function fetchStaffLookup(): Promise<Array<{ value: string; label: string }>> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('profiles')
    .select('id, full_name, email')
    .eq('company_id', companyId)
    .order('full_name', { ascending: true })
  throwOnError(error)

  const list = (data || []) as Array<{ id: string; full_name: string | null; email: string | null }>
  return list.map((p) => ({
    value: p.id,
    label: p.full_name || p.email || p.id,
  }))
}

