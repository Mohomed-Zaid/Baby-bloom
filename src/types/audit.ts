import type { UUID, ISODateTime } from './domain'

export type AuditSeverity = 'info' | 'warning' | 'critical'

export type AuditEventType =
  | 'login'
  | 'session_open'
  | 'session_close'
  | 'invoice_void'
  | 'price_override'
  | 'manual_journal'
  | 'cheque_bounce'
  | 'stock_reversal'
  | 'cash_movement'
  | 'petty_cash_post'
  | 'user_privilege_change'
  | 'other'

export interface SystemAuditLogEntry {
  id: UUID
  company_id: UUID
  branch_id: UUID | null
  user_id: UUID | null
  event_type: AuditEventType
  severity: AuditSeverity
  target_table: string | null
  target_id: UUID | null
  ip_address: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: ISODateTime
  user_name?: string
  user_email?: string
  branch_name?: string
}

export interface AuditFilterState {
  search: string
  event_type: string
  severity: string
  user_id: string
  date_from: string
  date_to: string
}
