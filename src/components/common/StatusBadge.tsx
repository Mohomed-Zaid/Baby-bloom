import type { RecordStatus } from '../../types/common'

interface StatusBadgeProps { status: RecordStatus | string; label?: string }
export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{label ?? status}</span>
}