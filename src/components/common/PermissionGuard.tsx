import type { ReactNode } from 'react'
import { useAuthStore } from '../../stores/authStore'

interface PermissionGuardProps { permission: string; children: ReactNode; fallback?: ReactNode }
export function PermissionGuard({ permission, children, fallback = null }: PermissionGuardProps) {
  const permissions = useAuthStore((state) => state.user?.permissions)
  return permissions?.includes(permission) ? children : fallback
}
