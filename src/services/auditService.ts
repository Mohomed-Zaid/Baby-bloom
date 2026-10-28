import { requireSupabase } from './client'
import { currentCompanyId } from './masterData'
import { MOCK_AUDIT_LOGS } from './mockData'
import type { SystemAuditLogEntry, AuditFilterState, AuditSeverity, AuditEventType } from '../types/audit'

type RpcResult<T = unknown> = { data: T; error: { message: string } | null }
const callRpc = <T = unknown>(name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>)(name, args)

const getTable = (tableName: string) => (requireSupabase().from as unknown as (tbl: string) => any)(tableName)

export async function fetchAuditTrail(filters?: Partial<AuditFilterState>, limit = 100): Promise<SystemAuditLogEntry[]> {
  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    let query = getTable('system_audit_trail')
      .select('*, branches(name), profiles(full_name, email)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    const isSpecialFilter = ['logout', 'customer_payment', 'vendor_payment', 'stock_adjustment', 'barcode'].includes(filters?.event_type || '')

    if (filters?.event_type && filters.event_type !== 'all' && !isSpecialFilter) {
      query = query.eq('event_type', filters.event_type)
    } else if (filters?.event_type === 'logout') {
      query = query.eq('event_type', 'session_close')
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
    if (!error && data && data.length > 0) {
      const rows = data as unknown as Array<
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

      if (filters?.event_type === 'logout') {
        result = result.filter((item) => (item.metadata as Record<string, unknown> | null)?.action === 'logout')
      } else if (filters?.event_type === 'customer_payment') {
        result = result.filter((item) => (item.metadata as Record<string, unknown> | null)?.action === 'customer_receipt_posted')
      } else if (filters?.event_type === 'vendor_payment') {
        result = result.filter((item) => (item.metadata as Record<string, unknown> | null)?.action === 'vendor_payment_posted')
      } else if (filters?.event_type === 'stock_adjustment') {
        result = result.filter((item) => String((item.metadata as Record<string, unknown> | null)?.action || '').includes('stock_adjustment'))
      } else if (filters?.event_type === 'barcode') {
        result = result.filter((item) => String((item.metadata as Record<string, unknown> | null)?.action || '').includes('barcode'))
      }

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
  } catch {
    // fallback to mock data
  }

  // Graceful Mock Fallback
  let mockResult = [...MOCK_AUDIT_LOGS] as unknown as SystemAuditLogEntry[]
  if (filters?.event_type === 'logout') {
    mockResult = mockResult.filter((item) => (item.metadata as Record<string, unknown> | null)?.action === 'logout')
  } else if (filters?.event_type === 'customer_payment') {
    mockResult = mockResult.filter((item) => (item.metadata as Record<string, unknown> | null)?.action === 'customer_receipt_posted')
  } else if (filters?.event_type === 'vendor_payment') {
    mockResult = mockResult.filter((item) => (item.metadata as Record<string, unknown> | null)?.action === 'vendor_payment_posted')
  } else if (filters?.event_type === 'stock_adjustment') {
    mockResult = mockResult.filter((item) => String((item.metadata as Record<string, unknown> | null)?.action || '').includes('stock_adjustment'))
  } else if (filters?.event_type && filters.event_type !== 'all') {
    mockResult = mockResult.filter((item) => item.event_type === filters.event_type)
  }

  if (filters?.severity && filters.severity !== 'all') {
    mockResult = mockResult.filter((item) => item.severity === filters.severity)
  }

  if (filters?.search) {
    const s = filters.search.toLowerCase()
    mockResult = mockResult.filter(
      (item) =>
        item.event_type.toLowerCase().includes(s) ||
        (item.target_table && item.target_table.toLowerCase().includes(s)) ||
        (item.user_name && item.user_name.toLowerCase().includes(s)) ||
        (item.metadata && JSON.stringify(item.metadata).toLowerCase().includes(s))
    )
  }

  return mockResult
}

export async function logAuditEvent(
  branchId: string | null,
  eventType: AuditEventType,
  severity: AuditSeverity = 'info',
  targetTable?: string,
  targetId?: string,
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null
): Promise<string | null> {
  try {
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
    if (!res.error && res.data) {
      return res.data
    }

    // Direct table fallback insert
    const companyId = await currentCompanyId().catch(() => null)
    if (!companyId) return null

    const { data: userAuth } = await requireSupabase().auth.getUser()
    const { data: inserted, error: insertErr } = await getTable('system_audit_trail')
      .insert({
        company_id: companyId,
        branch_id: branchId || null,
        user_id: userAuth?.user?.id || null,
        event_type: eventType,
        severity,
        target_table: targetTable || null,
        target_id: targetId || null,
        old_values: oldValues || null,
        new_values: newValues || null,
        metadata: metadata || null,
      } as unknown as Record<string, unknown>)
      .select('id')
      .maybeSingle()

    if (insertErr) {
      console.warn('Fallback direct audit log insert failed:', insertErr.message)
      return null
    }
    return (inserted as { id: string } | null)?.id || null
  } catch (err) {
    console.warn('Failed to log audit event:', err)
    return null
  }
}

export async function logLoginEvent(params: {
  branchId?: string | null
  userId: string
  email: string
  fullName?: string | null
  role?: string | null
}): Promise<void> {
  try {
    await logAuditEvent(
      params.branchId || null,
      'login',
      'info',
      'auth.users',
      params.userId,
      null,
      { email: params.email, full_name: params.fullName || undefined },
      {
        action: 'login',
        title: 'User Signed In',
        email: params.email,
        full_name: params.fullName,
        role: params.role,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        device_type: typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        timestamp: new Date().toISOString(),
      }
    )
  } catch (err) {
    console.warn('Failed to log login audit event:', err)
  }
}

export async function logLogoutEvent(params: {
  branchId?: string | null
  userId?: string | null
  staffName?: string | null
  reason?: string
}): Promise<void> {
  try {
    await logAuditEvent(
      params.branchId || null,
      'session_close',
      'info',
      'auth.users',
      params.userId || undefined,
      null,
      null,
      {
        action: 'logout',
        title: 'User Signed Out',
        staff_name: params.staffName,
        reason: params.reason || 'Manual user sign-out',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        timestamp: new Date().toISOString(),
      }
    )
  } catch (err) {
    console.warn('Failed to log logout audit event:', err)
  }
}

export async function logSystemAction(params: {
  branchId?: string | null
  eventType?: AuditEventType
  severity?: AuditSeverity
  targetTable?: string
  targetId?: string
  action: string
  title: string
  details?: Record<string, unknown>
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
}): Promise<void> {
  try {
    await logAuditEvent(
      params.branchId || null,
      params.eventType || 'other',
      params.severity || 'info',
      params.targetTable,
      params.targetId,
      params.oldValues || null,
      params.newValues || null,
      {
        action: params.action,
        title: params.title,
        ...(params.details || {}),
        timestamp: new Date().toISOString(),
      }
    )
  } catch (err) {
    console.warn(`Failed to log system action [${params.action}]:`, err)
  }
}

export async function fetchStaffLookup(): Promise<Array<{ value: string; label: string }>> {
  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    const { data, error } = await getTable('profiles')
      .select('id, full_name, email')
      .eq('company_id', companyId)
      .order('full_name', { ascending: true })
    if (!error && data && data.length > 0) {
      const list = data as Array<{ id: string; full_name: string | null; email: string | null }>
      return list.map((p) => ({
        value: p.id,
        label: p.full_name || p.email || p.id,
      }))
    }
  } catch {}
  return [
    { value: 'user-admin', label: 'Zaid (System Administrator)' },
    { value: 'user-manager', label: 'Kamal Perera (Store Manager)' },
    { value: 'user-cashier', label: 'Saman Kumara (Cashier)' },
  ]
}

