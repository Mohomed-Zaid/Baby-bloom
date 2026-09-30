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

export const STANDARD_PERMISSIONS_CATALOGUE = [
  // Sales & POS
  { id: '10000000-0000-0000-0000-000000000001', permission_key: 'sales.view', module: 'sales', name: 'View Sales Invoices & POS', description: 'Access POS invoice history and customer billing records' },
  { id: '10000000-0000-0000-0000-000000000002', permission_key: 'sales.create', module: 'sales', name: 'Create POS Invoices', description: 'Create and ring up sales transactions on POS terminals' },
  { id: '10000000-0000-0000-0000-000000000003', permission_key: 'sales.update_draft', module: 'sales', name: 'Update Draft Invoices', description: 'Modify held bills and unposted sales drafts' },
  { id: '10000000-0000-0000-0000-000000000004', permission_key: 'sales.post', module: 'sales', name: 'Post Final Invoices', description: 'Commit sales transactions to general ledger and stock depletion' },
  { id: '10000000-0000-0000-0000-000000000005', permission_key: 'sales.cancel', module: 'sales', name: 'Void / Cancel Invoices', description: 'Void open or draft sales invoices before completion' },
  { id: '10000000-0000-0000-0000-000000000006', permission_key: 'sales.reverse', module: 'sales', name: 'Reverse Posted Sales', description: 'Perform full ledger reversal of finalized customer invoices' },
  { id: '10000000-0000-0000-0000-000000000007', permission_key: 'sales.backdate', module: 'sales', name: 'Backdate Invoice Date', description: 'Post sales transactions with historical billing dates' },
  { id: '10000000-0000-0000-0000-000000000008', permission_key: 'sales.negative_stock_override', module: 'sales', name: 'Negative Stock Override', description: 'Ring up sales when stock quantity is zero or insufficient' },
  { id: '10000000-0000-0000-0000-000000000009', permission_key: 'sales.view_cost', module: 'sales', name: 'View Product Cost & Margin', description: 'Inspect unit purchase costs and profit margin on POS screen' },
  { id: '10000000-0000-0000-0000-000000000010', permission_key: 'sales.print', module: 'sales', name: 'Print Official Receipts', description: 'Trigger thermal docket or A4 tax invoice printing' },
  { id: '10000000-0000-0000-0000-000000000011', permission_key: 'sales.export', module: 'sales', name: 'Export Sales History', description: 'Download CSV and Excel files of sales journals' },
  { id: '10000000-0000-0000-0000-000000000012', permission_key: 'sales_returns.view', module: 'sales', name: 'View Sales Returns', description: 'Inspect customer return credits and replacement memos' },
  { id: '10000000-0000-0000-0000-000000000013', permission_key: 'sales_returns.create', module: 'sales', name: 'Issue Sales Returns', description: 'Accept customer returned merchandise and calculate refund' },
  { id: '10000000-0000-0000-0000-000000000014', permission_key: 'sales_returns.post', module: 'sales', name: 'Post Returns to Stock', description: 'Re-stock returned items into inventory and credit receivables' },
  { id: '10000000-0000-0000-0000-000000000015', permission_key: 'sales_returns.reverse', module: 'sales', name: 'Reverse Sales Return', description: 'Rollback erroneous return memos' },
  { id: '10000000-0000-0000-0000-000000000016', permission_key: 'sales_returns.unlinked', module: 'sales', name: 'Unlinked Sales Returns', description: 'Accept customer return without original bill reference' },

  // Purchases & Vendors
  { id: '20000000-0000-0000-0000-000000000001', permission_key: 'purchases.view', module: 'purchases', name: 'View Purchases & GRN', description: 'Access supplier purchase orders, bills and inward goods' },
  { id: '20000000-0000-0000-0000-000000000002', permission_key: 'purchases.create', module: 'purchases', name: 'Create Purchase Orders', description: 'Draft purchase orders and inward consignment entries' },
  { id: '20000000-0000-0000-0000-000000000003', permission_key: 'purchases.submit', module: 'purchases', name: 'Submit Purchase for Approval', description: 'Forward draft purchases to management' },
  { id: '20000000-0000-0000-0000-000000000004', permission_key: 'purchases.approve', module: 'purchases', name: 'Approve Purchase Orders', description: 'Authorize commercial vendor pricing and quantities' },
  { id: '20000000-0000-0000-0000-000000000005', permission_key: 'purchases.post', module: 'purchases', name: 'Post Goods Receipt (GRN)', description: 'Receive goods into warehouse inventory and credit vendor AP' },
  { id: '20000000-0000-0000-0000-000000000006', permission_key: 'purchases.cancel', module: 'purchases', name: 'Cancel Purchase Records', description: 'Void draft or unfulfilled supplier orders' },
  { id: '20000000-0000-0000-0000-000000000007', permission_key: 'purchases.reverse', module: 'purchases', name: 'Reverse Posted GRN', description: 'Reverse inward stock and vendor credit entries' },
  { id: '20000000-0000-0000-0000-000000000008', permission_key: 'purchases.backdate', module: 'purchases', name: 'Backdate Purchase Bills', description: 'Record purchase inward date retrospectively' },
  { id: '20000000-0000-0000-0000-000000000009', permission_key: 'purchases.view_cost', module: 'purchases', name: 'View Landed Vendor Costs', description: 'Access supplier wholesale costs and duty breakdown' },
  { id: '20000000-0000-0000-0000-000000000010', permission_key: 'purchase_returns.view', module: 'purchases', name: 'View Purchase Returns', description: 'View outward goods returns to suppliers' },
  { id: '20000000-0000-0000-0000-000000000011', permission_key: 'purchase_returns.create', module: 'purchases', name: 'Issue Purchase Returns', description: 'Draft debit notes and return manifests for vendors' },
  { id: '20000000-0000-0000-0000-000000000012', permission_key: 'purchase_returns.approve', module: 'purchases', name: 'Approve Purchase Returns', description: 'Authorize outward stock movement to vendor' },
  { id: '20000000-0000-0000-0000-000000000013', permission_key: 'purchase_returns.post', module: 'purchases', name: 'Post Purchase Returns', description: 'Deduct inventory and debit accounts payable' },
  { id: '20000000-0000-0000-0000-000000000014', permission_key: 'supplier_payments.create', module: 'purchases', name: 'Issue Supplier Payments', description: 'Draft cheques and bank transfers for vendor invoices' },
  { id: '20000000-0000-0000-0000-000000000015', permission_key: 'supplier_payments.post', module: 'purchases', name: 'Post Supplier Payments', description: 'Settle vendor ledger balances' },
  { id: '20000000-0000-0000-0000-000000000016', permission_key: 'vendor_statements.view', module: 'purchases', name: 'View Vendor Statements', description: 'Access supplier aging and statement reports' },

  // Inventory & Stock
  { id: '30000000-0000-0000-0000-000000000001', permission_key: 'inventory.view', module: 'inventory', name: 'View Stock & Products', description: 'Access product catalog, stock cards and bin locations' },
  { id: '30000000-0000-0000-0000-000000000002', permission_key: 'inventory.update', module: 'inventory', name: 'Manage Product Master', description: 'Create and update product prices, barcodes and categories' },
  { id: '30000000-0000-0000-0000-000000000003', permission_key: 'inventory.create_opening_stock', module: 'inventory', name: 'Create Opening Stock', description: 'Establish auditable opening quantities and valuation' },
  { id: '30000000-0000-0000-0000-000000000004', permission_key: 'inventory.create_transfer', module: 'inventory', name: 'Stock Transfers', description: 'Dispatch stock shipments between warehouse locations' },
  { id: '30000000-0000-0000-0000-000000000005', permission_key: 'inventory.create_adjustment', module: 'inventory', name: 'Stock Adjustments', description: 'Record physical count discrepancies and inventory adjustments' },
  { id: '30000000-0000-0000-0000-000000000006', permission_key: 'inventory.record_damage', module: 'inventory', name: 'Record Damaged Stock', description: 'Isolate expired or damaged items from sellable bins' },
  { id: '30000000-0000-0000-0000-000000000007', permission_key: 'inventory.write_off', module: 'inventory', name: 'Stock Write-Off', description: 'Authorize write-offs and scrap losses' },
  { id: '30000000-0000-0000-0000-000000000008', permission_key: 'inventory.approve', module: 'inventory', name: 'Approve Stock Documents', description: 'Authorize physical count adjustments and transfers' },
  { id: '30000000-0000-0000-0000-000000000009', permission_key: 'inventory.post', module: 'inventory', name: 'Post Stock Movements', description: 'Commit inventory balance changes to ledger' },
  { id: '30000000-0000-0000-0000-000000000010', permission_key: 'inventory.view_cost', module: 'inventory', name: 'View Inventory Valuation Cost', description: 'View weighted average cost and inventory valuation' },
  { id: '30000000-0000-0000-0000-000000000011', permission_key: 'transfers.receive', module: 'inventory', name: 'Receive In-Transit Transfers', description: 'Acknowledge and inspect incoming inter-branch shipments' },

  // Finance & Accounting
  { id: '40000000-0000-0000-0000-000000000001', permission_key: 'accounting.view', module: 'finance', name: 'View General Ledger', description: 'Access Chart of Accounts, General Ledger and Journal Vouchers' },
  { id: '40000000-0000-0000-0000-000000000002', permission_key: 'accounting.update', module: 'finance', name: 'Post Journal Entries', description: 'Post balanced double-entry manual journal vouchers and adjustments' },
  { id: '40000000-0000-0000-0000-000000000003', permission_key: 'banking.view', module: 'finance', name: 'View Bank & Cheque Registry', description: 'Access corporate bank accounts, cheque book registry and cards' },
  { id: '40000000-0000-0000-0000-000000000004', permission_key: 'banking.update', module: 'finance', name: 'Manage Banking & Cheques', description: 'Issue cheques, deposit, clear instruments and manage bank books' },
  { id: '40000000-0000-0000-0000-000000000005', permission_key: 'bank_recon.view', module: 'finance', name: 'View Bank Reconciliation', description: 'Access monthly bank statement reconciliation sheets' },
  { id: '40000000-0000-0000-0000-000000000006', permission_key: 'bank_recon.reconcile', module: 'finance', name: 'Reconcile Bank Accounts', description: 'Match bank feeds, identify outstanding items and post differences' },
  { id: '40000000-0000-0000-0000-000000000007', permission_key: 'cash_bank_book.view', module: 'finance', name: 'View Cash & Bank Books', description: 'Inspect daily cash receipts and bank credit/debit register' },
  { id: '40000000-0000-0000-0000-000000000008', permission_key: 'receivables.view', module: 'finance', name: 'View Customer Receivables', description: 'Access customer aging schedules and outstanding balances' },
  { id: '40000000-0000-0000-0000-000000000009', permission_key: 'receivables.receive', module: 'finance', name: 'Receive Customer Payments', description: 'Process customer account payments, cash settlements and cheque receipts' },
  { id: '40000000-0000-0000-0000-000000000010', permission_key: 'payables.view', module: 'finance', name: 'View Accounts Payable', description: 'Review unpaid supplier bills and payment schedules' },
  { id: '40000000-0000-0000-0000-000000000011', permission_key: 'payables.settle', module: 'finance', name: 'Settle Accounts Payable', description: 'Authorize vendor disbursement runs' },
  { id: '40000000-0000-0000-0000-000000000012', permission_key: 'petty_cash.view', module: 'finance', name: 'View Petty Cash Vouchers', description: 'Inspect petty cash disbursement log and vault balance' },
  { id: '40000000-0000-0000-0000-000000000013', permission_key: 'petty_cash.create', module: 'finance', name: 'Issue Petty Cash Requests', description: 'Request cash reimbursement for minor office expenses' },
  { id: '40000000-0000-0000-0000-000000000014', permission_key: 'petty_cash.approve', module: 'finance', name: 'Approve Petty Cash', description: 'Authorize cash disbursements from petty cash float' },

  // POS Shifts & Registers
  { id: '50000000-0000-0000-0000-000000000001', permission_key: 'shifts.view', module: 'shifts', name: 'View Shift & Register Status', description: 'Access cashier shift summaries and counter occupancy' },
  { id: '50000000-0000-0000-0000-000000000002', permission_key: 'shifts.manage', module: 'shifts', name: 'Manage POS Counters', description: 'Open cash drawers, assign registers and record opening floats' },
  { id: '50000000-0000-0000-0000-000000000003', permission_key: 'shifts.close', module: 'shifts', name: 'Close POS Shift & Cash Drop', description: 'Reconcile actual cash drawer count and execute end-of-shift lock' },

  // Orders & CRM
  { id: '60000000-0000-0000-0000-000000000001', permission_key: 'orders.view', module: 'orders', name: 'View Customer Orders', description: 'Review pre-orders, advance bookings and custom delivery orders' },
  { id: '60000000-0000-0000-0000-000000000002', permission_key: 'orders.create', module: 'orders', name: 'Create Customer Orders', description: 'Book customer advance orders and record deposit advances' },
  { id: '60000000-0000-0000-0000-000000000003', permission_key: 'orders.dispatch', module: 'orders', name: 'Dispatch Orders', description: 'Pack items and release order for delivery courier' },
  { id: '60000000-0000-0000-0000-000000000004', permission_key: 'orders.deliver', module: 'orders', name: 'Deliver & Complete Orders', description: 'Confirm customer handover and finalize invoice' },

  // Administration, Reports & Security
  { id: '70000000-0000-0000-0000-000000000001', permission_key: 'dashboard.view', module: 'admin', name: 'View Analytics Dashboard', description: 'Access executive revenue graphs, sales trends and KPIs' },
  { id: '70000000-0000-0000-0000-000000000002', permission_key: 'reports.view', module: 'admin', name: 'Generate Management Reports', description: 'Run P&L statements, balance sheets, inventory turnover and tax audits' },
  { id: '70000000-0000-0000-0000-000000000003', permission_key: 'audit.view', module: 'admin', name: 'View Security Audit Trail', description: 'Inspect tamper-proof user login and transaction override logs' },
  { id: '70000000-0000-0000-0000-000000000004', permission_key: 'settings.view', module: 'admin', name: 'View System Settings', description: 'Inspect branch profiles, tax tables and sequence formats' },
  { id: '70000000-0000-0000-0000-000000000005', permission_key: 'settings.update', module: 'admin', name: 'Manage System Administration', description: 'Configure user privileges, branches, staff members and security rules' },
]

export async function fetchUserPrivilegeMatrix(userId: string): Promise<PrivilegeMatrixRow[]> {
  const companyId = await currentCompanyId()
  const client = requireSupabase()

  // 1. Fetch all permissions from table
  let dbPermissions: Array<{ id: string; permission_key: string; module: string; name: string; description: string | null }> = []
  try {
    const { data: permissions } = await client
      .from('permissions')
      .select('*')
      .order('module', { ascending: true })
      .order('name', { ascending: true })
    if (permissions && permissions.length > 0) {
      dbPermissions = permissions
    }
  } catch {
    // fallback if table unseeded
  }

  // Merge with standard catalogue to ensure no missing permission keys
  const permissionMap = new Map<string, { id: string; permission_key: string; module: string; name: string; description: string | null }>()
  STANDARD_PERMISSIONS_CATALOGUE.forEach((p) => {
    permissionMap.set(p.permission_key, p)
  })
  dbPermissions.forEach((p) => {
    permissionMap.set(p.permission_key, p)
  })
  const allPermissions = Array.from(permissionMap.values())

  // 2. Fetch role permissions for this user
  const roleAllowedMap: Record<string, boolean> = {}
  try {
    const { data: userRoles } = await getTable('user_roles')
      .select('role_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)

    const roleIds = ((userRoles || []) as Array<{ role_id: string }>).map((r) => r.role_id)

    if (roleIds.length > 0) {
      const { data: rolePerms } = await getTable('role_permissions')
        .select('permission_id, is_allowed')
        .in('role_id', roleIds)
        .eq('company_id', companyId)

      ;((rolePerms || []) as Array<{ permission_id: string; is_allowed: boolean }>).forEach((rp) => {
        if (rp.is_allowed) roleAllowedMap[rp.permission_id] = true
      })
    }
  } catch {
    // Ignore role lookup errors on demo environments
  }

  // 3. Fetch user permission overrides
  const userOverrideMap: Record<string, boolean> = {}
  try {
    const { data: userPerms } = await getTable('user_permissions')
      .select('permission_id, is_allowed')
      .eq('user_id', userId)
      .eq('company_id', companyId)

    ;((userPerms || []) as Array<{ permission_id: string; is_allowed: boolean }>).forEach((up) => {
      userOverrideMap[up.permission_id] = up.is_allowed
    })
  } catch {
    // Ignore override query error if table offline
  }

  // Assemble matrix rows
  return allPermissions.map((p) => {
    // Check if role allows either by permission id or permission key
    const roleAllowed = !!roleAllowedMap[p.id] || !!roleAllowedMap[p.permission_key]
    const userOverride =
      userOverrideMap[p.id] !== undefined
        ? userOverrideMap[p.id]!
        : userOverrideMap[p.permission_key] !== undefined
        ? userOverrideMap[p.permission_key]!
        : null

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

export async function batchSetUserPermissionOverrides(
  userId: string,
  permissionIds: string[],
  isAllowed: boolean | null
): Promise<void> {
  const companyId = await currentCompanyId()
  const client = requireSupabase()

  if (isAllowed === null) {
    const { error } = await client
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .in('permission_id', permissionIds)
    throwOnError(error)
  } else {
    const records = permissionIds.map((pId) => ({
      user_id: userId,
      permission_id: pId,
      company_id: companyId,
      is_allowed: isAllowed,
    }))
    const { error } = await client
      .from('user_permissions')
      .upsert(records as never, { onConflict: 'user_id,permission_id' })
    throwOnError(error)
  }
}

export async function fetchStaffUsersForPrivilegeMatrix(): Promise<
  Array<{
    value: string
    label: string
    fullName: string
    code?: string
    designation?: string
    branchName?: string
    email?: string
  }>
> {
  const companyId = await currentCompanyId()
  const client = requireSupabase()

  try {
    const { data: staffList } = await client
      .from('staff_profiles')
      .select('id, user_id, staff_code, first_name, last_name, designation, role_level, email, branches_ref:branches(name)')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('staff_code', { ascending: true })

    if (staffList && staffList.length > 0) {
      return staffList.map((s: any) => {
        const fullName = `${s.first_name}${s.last_name ? ' ' + s.last_name : ''}`
        return {
          value: s.user_id || s.id,
          label: `${fullName} (${s.staff_code} - ${s.designation || s.role_level || 'Staff'})`,
          fullName,
          code: s.staff_code,
          designation: s.designation || s.role_level || 'Staff',
          branchName: s.branches_ref?.name || undefined,
          email: s.email || undefined,
        }
      })
    }
  } catch {
    // fallback
  }

  try {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, full_name, email, role, branches(name)')
      .eq('company_id', companyId)
      .order('full_name', { ascending: true })

    if (profiles && profiles.length > 0) {
      return profiles.map((p: any) => ({
        value: p.id,
        label: `${p.full_name || 'Staff User'} (${p.role || p.email || 'Staff'})`,
        fullName: p.full_name || 'Staff User',
        designation: p.role || 'Staff',
        email: p.email || undefined,
        branchName: p.branches?.name || undefined,
      }))
    }
  } catch {
    // fallback
  }

  return [
    {
      value: '00000000-0000-0000-0000-000000000000',
      label: 'System Admin / Main Cashier',
      fullName: 'System Administrator',
      designation: 'Super Admin',
      email: 'admin@babybloom.lk',
    },
  ]
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

export async function toggleRegisterLock(registerId: string, isLocked: boolean): Promise<void> {
  const { error } = await getTable('pos_registers')
    .update({ is_locked: isLocked } as unknown as never)
    .eq('id', registerId)
  throwOnError(error)
}

export async function fetchRecentShifts(branchId?: string, limit = 25): Promise<PosShift[]> {
  const companyId = await currentCompanyId()
  let query = getTable('pos_shifts')
    .select('*, pos_registers(name), profiles(full_name)')
    .eq('company_id', companyId)
    .order('opened_at', { ascending: false })
    .limit(limit)

  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  throwOnError(error)

  const rows = (data || []) as unknown as Array<PosShift & { pos_registers?: { name?: string }; profiles?: { full_name?: string } }>
  return rows.map((s) => ({
    ...s,
    register_name: s.pos_registers?.name,
    cashier_name: s.profiles?.full_name,
  }))
}

export async function closePosShiftService(payload: z.infer<typeof CloseShiftSchema>): Promise<{ expected: number; actual: number; variance: number }> {
  const valid = CloseShiftSchema.parse(payload)
  try {
    const res = await callRpc('close_pos_shift', {
      p_shift_id: valid.shift_id,
      p_closing_balance_actual: valid.closing_balance_actual,
      p_notes: valid.notes || null,
    })
    if (!res.error && res.data) {
      return res.data as { expected: number; actual: number; variance: number }
    }
  } catch {
    // fallback to direct table update if RPC unavailable
  }

  // Fallback: Fetch shift to calculate expected
  const { data: shift } = await getTable('pos_shifts').select('*').eq('id', valid.shift_id).single()
  const opening = Number((shift as any)?.opening_balance || 0)
  const cashSales = Number((shift as any)?.cash_sales || 0)
  const expected = opening + cashSales
  const actual = valid.closing_balance_actual
  const variance = actual - expected

  const { error } = await getTable('pos_shifts')
    .update({
      status: 'closed',
      closing_balance_actual: actual,
      closing_balance_expected: expected,
      closed_at: new Date().toISOString(),
      notes: valid.notes || null,
    } as unknown as never)
    .eq('id', valid.shift_id)

  throwOnError(error)
  return { expected, actual, variance }
}

