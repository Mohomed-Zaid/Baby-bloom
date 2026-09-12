import type { Permission, Role } from '../types/domain'
import { requireSupabase, throwOnError } from './client'

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await requireSupabase().from('roles').select('*').order('name')
  throwOnError(error)
  return data ?? []
}
export async function listPermissions(): Promise<Permission[]> {
  const { data, error } = await requireSupabase().from('permissions').select('*').order('module').order('permission_key')
  throwOnError(error)
  return data ?? []
}