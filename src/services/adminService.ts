import { requireSupabase, throwOnError } from './client'
import { currentCompanyId } from './masterData'
import type { PrivilegeMatrixRow, PosRegister, PosShift } from '../types/admin'
import { PosRegisterSchema, OpenShiftSchema, CloseShiftSchema } from '../types/admin'
import { z } from 'zod'

type RpcResult = { data: unknown; error: { message: string } | null }
const callRpc = (name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

// --- User Privilege Matrix ---

export async function fetchUserPrivilegeMatrix(userId: string): Promise<PrivilegeMatrixRow[]> {
  const companyId = await currentCompanyId()
  const client = requireSupabase()

  // 1. Fetch all permissions
  const { data: permissions, error: pErr } = await client
    .from('permissions')
    .select('*')
    .order('module', { ascending: true })
    .order('name', { ascending: true })
  throwOnError(pErr)

  // 2. Fetch role permissions for this user
  const { data: userRoles, error: urErr } = await getTable('user_roles')
    .select('role_id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
  throwOnError(urErr)

  const roleIds = ((userRoles || []) as Array<{ role_id: string }>).map((r) => r.role_id)
  const roleAllowedMap: Record<string, boolean> = {}

  if (roleIds.length > 0) {
    const { data: rolePerms, error: rpErr } = await getTable('role_permissions')
      .select('permission_id, is_allowed')
      .in('role_id', roleIds)
      .eq('company_id', companyId)
    throwOnError(rpErr)

    ;((rolePerms || []) as Array<{ permission_id: string; is_allowed: boolean }>).forEach((rp) => {
      if (rp.is_allowed) roleAllowedMap[rp.permission_id] = true
    })
  }

  // 3. Fetch user permission overrides
  const { data: userPerms, error: upErr } = await getTable('user_permissions')
    .select('permission_id, is_allowed')
    .eq('user_id', userId)
    .eq('company_id', companyId)
  throwOnError(upErr)

  const userOverrideMap: Record<string, boolean> = {}
  ;((userPerms || []) as Array<{ permission_id: string; is_allowed: boolean }>).forEach((up) => {
    userOverrideMap[up.permission_id] = up.is_allowed
  })

  // Assemble matrix rows
  return ((permissions || []) as Array<{ id: string; permission_key: string; module: string; name: string; description: string | null }>).map((p) => {
    const roleAllowed = !!roleAllowedMap[p.id]
    const userOverride = userOverrideMap[p.id] !== undefined ? userOverrideMap[p.id]! : null
    const effectiveAllowed = userOverride !== null ? userOverride : roleAllowed

    return {
      permission_id: p.id,
      permission_key: p.permission_key,
      module: p.module,
      name: p.name,
      description: p.description,
      role_allowed: roleAllowed,
      user_override: userOverride,
      effective_allowed: effectiveAllowed,
    }
  })
}

export async function toggleUserPermissionOverride(
  userId: string,
  permissionId: string,
  isAllowed: boolean | null
): Promise<void> {
  const companyId = await currentCompanyId()

  if (isAllowed === null) {
    const { error } = await getTable('user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('permission_id', permissionId)
      .eq('company_id', companyId)
    throwOnError(error)
  } else {
    const { error } = await getTable('user_permissions')
      .upsert(
        {
          user_id: userId,
          permission_id: permissionId,
          company_id: companyId,
          is_allowed: isAllowed,
        } as unknown as never,
        { onConflict: 'user_id,permission_id' }
      )
    throwOnError(error)
  }
}

// --- POS Registers & Shifts ---

export async function fetchPosRegisters(branchId?: string): Promise<PosRegister[]> {
  const companyId = await currentCompanyId()
  let query = getTable('pos_registers')
    .select('*, branches(name), profiles(full_name)')
    .eq('company_id', companyId)
    .order('register_code', { ascending: true })

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<PosRegister & { branches?: { name?: string }; profiles?: { full_name?: string } }>
  return rows.map((r) => ({
    ...r,
    branch_name: r.branches?.name,
    cashier_name: r.profiles?.full_name,
  }))
}

export async function createPosRegister(payload: z.infer<typeof PosRegisterSchema>): Promise<PosRegister> {
  const companyId = await currentCompanyId()
  const valid = PosRegisterSchema.parse(payload)

  const { data, error } = await getTable('pos_registers')
    .insert({
      company_id: companyId,
      branch_id: valid.branch_id,
      register_code: valid.register_code,
      name: valid.name,
      is_active: valid.is_active,
    } as unknown as never)
    .select()
    .single()
  throwOnError(error)
  return data as unknown as PosRegister
}

export async function fetchActiveShift(registerId: string): Promise<PosShift | null> {
  const companyId = await currentCompanyId()
  const { data, error } = await getTable('pos_shifts')
    .select('*, pos_registers(name), profiles(full_name)')
    .eq('company_id', companyId)
    .eq('register_id', registerId)
    .eq('status', 'open')
    .maybeSingle()
  throwOnError(error)

  if (!data) return null
  const shift = data as unknown as PosShift & { pos_registers?: { name?: string }; profiles?: { full_name?: string } }
  return {
    ...shift,
    register_name: shift.pos_registers?.name,
    cashier_name: shift.profiles?.full_name,
  }
}

export async function openPosShift(payload: z.infer<typeof OpenShiftSchema>, cashierId: string, branchId: string): Promise<PosShift> {
  const companyId = await currentCompanyId()
  const valid = OpenShiftSchema.parse(payload)

  const { data, error } = await getTable('pos_shifts')
    .insert({
      company_id: companyId,
      branch_id: branchId,
      register_id: valid.register_id,
      cashier_id: cashierId,
      opening_balance: valid.opening_balance,
      notes: valid.notes || null,
      status: 'open',
    } as unknown as never)
    .select()
    .single()
  throwOnError(error)
  return data as unknown as PosShift
}

export async function closePosShiftService(payload: z.infer<typeof CloseShiftSchema>): Promise<{ expected: number; actual: number; variance: number }> {
  const valid = CloseShiftSchema.parse(payload)
  const res = await callRpc('close_pos_shift', {
    p_shift_id: valid.shift_id,
    p_closing_balance_actual: valid.closing_balance_actual,
    p_notes: valid.notes || null,
  })
  throwOnError(res.error)
  return res.data as { expected: number; actual: number; variance: number }
}
