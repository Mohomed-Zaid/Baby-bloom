import { requireSupabase } from './client'
import { isBackendOffline } from '../lib/supabase'
import { currentCompanyId } from './masterData'
import { getStoredStaffList } from './staffService'
import { MOCK_BRANCHES } from './mockData'
import type { PrivilegeMatrixRow, PosRegister, PosShift } from '../types/admin'
import { PosRegisterSchema, OpenShiftSchema, CloseShiftSchema } from '../types/admin'
import { z } from 'zod'

type RpcResult = { data: unknown; error: { message: string } | null }
const callRpc = (name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

const isUuid = (str: string | null | undefined): boolean =>
  typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

// --- User Privilege Matrix ---

const STORAGE_KEY_USER_PERMS = 'bb_user_permission_overrides'

function getStoredUserPermissionOverrides(userId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_PERMS)
    if (raw) {
      const all = JSON.parse(raw)
      return all[userId] || {}
    }
  } catch {}
  return {}
}

function saveStoredUserPermissionOverride(userId: string, permissionId: string, isAllowed: boolean | null) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_PERMS)
    const all = raw ? JSON.parse(raw) : {}
    if (!all[userId]) all[userId] = {}
    if (isAllowed === null) {
      delete all[userId][permissionId]
    } else {
      all[userId][permissionId] = isAllowed
    }
    localStorage.setItem(STORAGE_KEY_USER_PERMS, JSON.stringify(all))
  } catch {}
}

function saveStoredBatchUserPermissionOverrides(userId: string, permissionIds: string[], isAllowed: boolean | null) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_PERMS)
    const all = raw ? JSON.parse(raw) : {}
    if (!all[userId]) all[userId] = {}
    for (const pId of permissionIds) {
      if (isAllowed === null) {
        delete all[userId][pId]
      } else {
        all[userId][pId] = isAllowed
      }
    }
    localStorage.setItem(STORAGE_KEY_USER_PERMS, JSON.stringify(all))
  } catch {}
}

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

  // 1. Fetch permissions catalogue from DB if online & authenticated
  let dbPermissions: Array<{ id: string; permission_key: string; module: string; name: string; description: string | null }> = []
  if (!isBackendOffline()) {
    try {
      const { data: { session } } = await client.auth.getSession()
      if (session) {
        const { data: permissions, error } = await client
          .from('permissions')
          .select('*')
          .order('module', { ascending: true })
          .order('name', { ascending: true })
        if (!error && permissions && permissions.length > 0) {
          dbPermissions = permissions
        }
      }
    } catch {
      // fallback to standard catalogue
    }
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

  // 2. Fetch or compute role baseline permissions
  const roleAllowedMap: Record<string, boolean> = {}

  // Determine intelligent baseline based on staff role & designation
  const storedStaff = getStoredStaffList()
  const currentStaff = storedStaff.find((s) => s.user_id === userId || s.id === userId)
  const isSuperAdmin =
    !currentStaff ||
    userId === '00000000-0000-0000-0000-000000000000' ||
    userId === 'user-admin' ||
    currentStaff.role_level === 'LEVEL 1' ||
    currentStaff.designation?.toLowerCase().includes('manager') ||
    currentStaff.designation?.toLowerCase().includes('admin')

  const isCashier =
    currentStaff?.role_level?.toLowerCase().includes('cashier') ||
    currentStaff?.designation?.toLowerCase().includes('cashier')

  const isSales =
    currentStaff?.role_level?.toLowerCase().includes('sales') ||
    currentStaff?.designation?.toLowerCase().includes('sales')

  allPermissions.forEach((p) => {
    if (isSuperAdmin) {
      roleAllowedMap[p.id] = true
      roleAllowedMap[p.permission_key] = true
    } else if (isCashier) {
      const allowedCashierKeys = [
        'sales.view',
        'sales.create',
        'sales.update_draft',
        'sales.post',
        'sales.cancel',
        'sales.print',
        'sales_returns.view',
        'sales_returns.create',
        'shifts.view',
        'shifts.manage',
        'shifts.close',
        'inventory.view',
        'transfers.receive',
        'orders.view',
        'orders.create',
        'orders.dispatch',
        'orders.deliver',
        'receivables.view',
        'receivables.receive',
      ]
      const allowed = allowedCashierKeys.includes(p.permission_key)
      roleAllowedMap[p.id] = allowed
      roleAllowedMap[p.permission_key] = allowed
    } else if (isSales) {
      const allowedSalesKeys = [
        'sales.view',
        'sales.create',
        'sales.update_draft',
        'sales.print',
        'inventory.view',
        'orders.view',
        'orders.create',
        'orders.dispatch',
        'customers.view',
        'customers.create',
      ]
      const allowed = allowedSalesKeys.includes(p.permission_key)
      roleAllowedMap[p.id] = allowed
      roleAllowedMap[p.permission_key] = allowed
    } else {
      const allowed = p.permission_key.endsWith('.view')
      roleAllowedMap[p.id] = allowed
      roleAllowedMap[p.permission_key] = allowed
    }
  })

  // Also query DB role permissions if online and valid UUIDs
  if (!isBackendOffline() && isUuid(userId) && isUuid(companyId)) {
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
          if (rp.is_allowed) {
            roleAllowedMap[rp.permission_id] = true
          }
        })
      }
    } catch {
      // Ignore role lookup errors on demo environments
    }
  }

  // 3. User permission overrides (merge local overrides + DB overrides)
  const localOverrides = getStoredUserPermissionOverrides(userId)
  const userOverrideMap: Record<string, boolean> = { ...localOverrides }

  if (!isBackendOffline() && isUuid(userId) && isUuid(companyId)) {
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
  }

  // Assemble matrix rows
  return allPermissions.map((p) => {
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
  // Always persist locally first so matrix updates immediately and works offline
  saveStoredUserPermissionOverride(userId, permissionId, isAllowed)

  const companyId = await currentCompanyId()

  if (!isBackendOffline() && isUuid(userId) && isUuid(companyId)) {
    try {
      if (isAllowed === null) {
        await getTable('user_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('permission_id', permissionId)
          .eq('company_id', companyId)
      } else {
        await getTable('user_permissions')
          .upsert(
            {
              user_id: userId,
              permission_id: permissionId,
              company_id: companyId,
              is_allowed: isAllowed,
            } as unknown as never,
            { onConflict: 'user_id,permission_id' }
          )
      }
    } catch (err) {
      console.warn('[adminService] toggleUserPermissionOverride remote sync skipped:', err)
    }
  }
}

export async function batchSetUserPermissionOverrides(
  userId: string,
  permissionIds: string[],
  isAllowed: boolean | null
): Promise<void> {
  // Always persist locally first so matrix updates immediately and works offline
  saveStoredBatchUserPermissionOverrides(userId, permissionIds, isAllowed)

  const companyId = await currentCompanyId()
  const client = requireSupabase()

  if (!isBackendOffline() && isUuid(userId) && isUuid(companyId)) {
    try {
      if (isAllowed === null) {
        await client
          .from('user_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('company_id', companyId)
          .in('permission_id', permissionIds)
      } else {
        const records = permissionIds.map((pId) => ({
          user_id: userId,
          permission_id: pId,
          company_id: companyId,
          is_allowed: isAllowed,
        }))
        await client
          .from('user_permissions')
          .upsert(records as never, { onConflict: 'user_id,permission_id' })
      }
    } catch (err) {
      console.warn('[adminService] batchSetUserPermissionOverrides remote sync skipped:', err)
    }
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

  // 1. Use stored staff list from staff directory
  const storedStaff = getStoredStaffList().filter((s) => s.is_active !== false)
  const staffItems: Array<{
    value: string
    label: string
    fullName: string
    code?: string
    designation?: string
    branchName?: string
    email?: string
  }> = storedStaff.map((s) => {
    const fullName = `${s.first_name}${s.last_name ? ' ' + s.last_name : ''}`.trim()
    const roleDesc = s.designation || s.role_level || 'Staff'
    const branch = s.branch_name || (Array.isArray(s.branches) && s.branches[0] ? s.branches[0] : undefined)
    return {
      value: s.user_id || s.id,
      label: `${fullName} (${s.staff_code} - ${roleDesc})`,
      fullName,
      code: s.staff_code,
      designation: roleDesc,
      branchName: branch,
      email: s.email || undefined,
    }
  })

  // 2. If online, authenticated, and companyId is a valid UUID, query remote staff_profiles
  if (!isBackendOffline() && isUuid(companyId)) {
    try {
      const { data: { session } } = await client.auth.getSession()
      if (session) {
        const { data: staffList } = await client
          .from('staff_profiles')
          .select('id, user_id, staff_code, first_name, last_name, designation, role_level, email, branches_ref:branches(name)')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('staff_code', { ascending: true })

        if (staffList && staffList.length > 0) {
          staffList.forEach((s: any) => {
            const val = s.user_id || s.id
            if (!staffItems.some((item) => item.value === val)) {
              const fullName = `${s.first_name}${s.last_name ? ' ' + s.last_name : ''}`.trim()
              staffItems.push({
                value: val,
                label: `${fullName} (${s.staff_code} - ${s.designation || s.role_level || 'Staff'})`,
                fullName,
                code: s.staff_code,
                designation: s.designation || s.role_level || 'Staff',
                branchName: s.branches_ref?.name || undefined,
                email: s.email || undefined,
              })
            }
          })
        }
      }
    } catch {
      // fallback
    }
  }

  if (staffItems.length > 0) {
    return staffItems
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

export const STORAGE_KEY_POS_REGISTERS = 'bb_pos_registers'
export const STORAGE_KEY_POS_SHIFTS = 'bb_pos_shifts'

export const DEFAULT_REGISTERS: PosRegister[] = [
  {
    id: 'reg-00000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    register_code: 'REG-COL-01',
    name: 'Counter 01 (Main Retail & Express Checkout)',
    is_active: true,
    is_locked: false,
    current_cashier_id: 'user-kamal',
    created_at: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    branch_name: 'Main Flagship Store - Colombo 03',
    cashier_name: 'Kamal Perera',
  },
  {
    id: 'reg-00000000-0000-0000-0000-000000000002',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    register_code: 'REG-COL-02',
    name: 'Counter 02 (Baby Nursery & Stroller Station)',
    is_active: true,
    is_locked: false,
    current_cashier_id: null,
    created_at: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    branch_name: 'Main Flagship Store - Colombo 03',
  },
  {
    id: 'reg-00000000-0000-0000-0000-000000000003',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-kandy',
    register_code: 'REG-KDY-01',
    name: 'Counter 01 (KCC Outlet Main Counter)',
    is_active: true,
    is_locked: false,
    current_cashier_id: null,
    created_at: new Date(Date.now() - 20 * 86400 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    branch_name: 'Kandy City Centre Branch',
  },
]

export const DEFAULT_SHIFTS: PosShift[] = [
  {
    id: 'shift-00000000-0000-0000-0000-000000000001',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    register_id: 'reg-00000000-0000-0000-0000-000000000001',
    cashier_id: 'user-kamal',
    opened_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    closed_at: null,
    opening_balance: 5000,
    closing_balance_expected: 29500,
    closing_balance_actual: 0,
    cash_sales: 24500,
    card_sales: 42000,
    cheque_sales: 0,
    status: 'open',
    notes: 'Morning shift float verified and accepted.',
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    register_name: 'Counter 01 (Main Retail & Express Checkout)',
    cashier_name: 'Kamal Perera',
  },
  {
    id: 'shift-00000000-0000-0000-0000-000000000002',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    register_id: 'reg-00000000-0000-0000-0000-000000000001',
    cashier_id: 'user-admin',
    opened_at: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    closed_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    opening_balance: 5000,
    closing_balance_expected: 48500,
    closing_balance_actual: 48500,
    cash_sales: 43500,
    card_sales: 68900,
    cheque_sales: 15000,
    status: 'closed',
    notes: 'Evening shift cash drop verified. Drawer balanced without discrepancy.',
    created_at: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    register_name: 'Counter 01 (Main Retail & Express Checkout)',
    cashier_name: 'Zaid Mohomed',
  },
  {
    id: 'shift-00000000-0000-0000-0000-000000000003',
    company_id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'branch-colombo',
    register_id: 'reg-00000000-0000-0000-0000-000000000002',
    cashier_id: 'user-saman',
    opened_at: new Date(Date.now() - 52 * 3600 * 1000).toISOString(),
    closed_at: new Date(Date.now() - 44 * 3600 * 1000).toISOString(),
    opening_balance: 3000,
    closing_balance_expected: 32400,
    closing_balance_actual: 32400,
    cash_sales: 29400,
    card_sales: 51200,
    cheque_sales: 0,
    status: 'closed',
    notes: 'Reconciled and safe dropped.',
    created_at: new Date(Date.now() - 52 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 44 * 3600 * 1000).toISOString(),
    register_name: 'Counter 02 (Baby Nursery & Stroller Station)',
    cashier_name: 'Saman Kumara',
  },
]

export function getStoredPosRegisters(): PosRegister[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POS_REGISTERS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [...DEFAULT_REGISTERS]
}

export function saveStoredPosRegisters(items: PosRegister[]) {
  try {
    localStorage.setItem(STORAGE_KEY_POS_REGISTERS, JSON.stringify(items))
  } catch {}
}

export function getStoredPosShifts(): PosShift[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POS_SHIFTS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [...DEFAULT_SHIFTS]
}

export function saveStoredPosShifts(items: PosShift[]) {
  try {
    localStorage.setItem(STORAGE_KEY_POS_SHIFTS, JSON.stringify(items))
  } catch {}
}

export async function fetchPosRegisters(branchId?: string): Promise<PosRegister[]> {
  const staff = getStoredStaffList()
  const localList = getStoredPosRegisters()

  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId()
      if (isUuid(companyId)) {
        let query = getTable('pos_registers')
          .select('*, branches(name)')
          .order('register_code', { ascending: true })

        query = query.eq('company_id', companyId)
        if (branchId && isUuid(branchId)) query = query.eq('branch_id', branchId)

        const { data, error } = await query
        if (!error && data && data.length > 0) {
          const rows = data as unknown as Array<PosRegister & { branches?: { name?: string } }>
          const mapped = rows.map((r) => {
            const cashier = staff.find((s) => s.user_id === r.current_cashier_id || s.id === r.current_cashier_id)
            return {
              ...r,
              branch_name: r.branches?.name || r.branch_name,
              cashier_name: cashier ? `${cashier.first_name} ${cashier.last_name || ''}`.trim() : r.cashier_name,
            }
          })
          saveStoredPosRegisters(mapped)
          return mapped
        }
      }
    } catch {
      // fallback to stored list
    }
  }

  // Populate branch and cashier names from local references
  const enriched = localList.map((r) => {
    const branch = MOCK_BRANCHES.find((b) => b.id === r.branch_id)
    const cashier = staff.find((s) => s.user_id === r.current_cashier_id || s.id === r.current_cashier_id)
    return {
      ...r,
      branch_name: r.branch_name || branch?.name || 'Main Flagship Store - Colombo 03',
      cashier_name: r.cashier_name || (cashier ? `${cashier.first_name} ${cashier.last_name || ''}`.trim() : undefined),
    }
  })

  return branchId ? enriched.filter((r) => r.branch_id === branchId) : enriched
}

export async function createPosRegister(payload: z.infer<typeof PosRegisterSchema>): Promise<PosRegister> {
  const valid = PosRegisterSchema.parse(payload)
  const companyId = await currentCompanyId()
  const branch = MOCK_BRANCHES.find((b) => b.id === valid.branch_id)

  const newReg: PosRegister = {
    id: `reg-${Date.now()}`,
    company_id: companyId,
    branch_id: valid.branch_id,
    register_code: valid.register_code.trim().toUpperCase(),
    name: valid.name.trim(),
    is_active: valid.is_active,
    is_locked: false,
    current_cashier_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    branch_name: branch?.name || 'Main Flagship Store - Colombo 03',
  }

  // Save to local storage immediately
  const existing = getStoredPosRegisters()
  saveStoredPosRegisters([...existing, newReg])

  if (!isBackendOffline() && isUuid(companyId) && isUuid(valid.branch_id)) {
    try {
      const { data, error } = await getTable('pos_registers')
        .insert({
          company_id: companyId,
          branch_id: valid.branch_id,
          register_code: newReg.register_code,
          name: newReg.name,
          is_active: newReg.is_active,
          is_locked: false,
        } as unknown as never)
        .select()
        .single()
      if (!error && data) {
        const dbReg = data as unknown as PosRegister
        return { ...dbReg, branch_name: newReg.branch_name }
      }
    } catch {
      // optimistic fallback
    }
  }

  return newReg
}

export async function toggleRegisterLock(registerId: string, isLocked: boolean): Promise<void> {
  const registers = getStoredPosRegisters()
  const idx = registers.findIndex((r) => r.id === registerId)
  if (idx !== -1 && registers[idx]) {
    registers[idx] = { ...registers[idx]!, is_locked: isLocked, updated_at: new Date().toISOString() }
    saveStoredPosRegisters(registers)
  }

  if (!isBackendOffline() && isUuid(registerId)) {
    try {
      await getTable('pos_registers')
        .update({ is_locked: isLocked, updated_at: new Date().toISOString() } as unknown as never)
        .eq('id', registerId)
    } catch {
      // optimistic
    }
  }
}

export async function fetchActiveShift(registerId: string): Promise<PosShift | null> {
  const staff = getStoredStaffList()
  const registers = getStoredPosRegisters()
  const shifts = getStoredPosShifts()

  // 1. Check local shifts first
  const localActive = shifts.find((s) => s.register_id === registerId && s.status === 'open')

  if (!isBackendOffline() && isUuid(registerId)) {
    try {
      const companyId = await currentCompanyId()
      if (isUuid(companyId)) {
        let query = getTable('pos_shifts')
          .select('*, pos_registers(name)')
          .eq('register_id', registerId)
          .eq('status', 'open')
          .eq('company_id', companyId)

        const { data, error } = await query.maybeSingle()
        if (!error && data) {
          const shift = data as unknown as PosShift & { pos_registers?: { name?: string } }
          const cashier = staff.find((s) => s.user_id === shift.cashier_id || s.id === shift.cashier_id)
          return {
            ...shift,
            register_name: shift.pos_registers?.name || shift.register_name,
            cashier_name: cashier ? `${cashier.first_name} ${cashier.last_name || ''}`.trim() : shift.cashier_name,
          }
        }
      }
    } catch {
      // fallback
    }
  }

  if (localActive) {
    const reg = registers.find((r) => r.id === localActive.register_id)
    const cashier = staff.find((s) => s.user_id === localActive.cashier_id || s.id === localActive.cashier_id)
    return {
      ...localActive,
      register_name: localActive.register_name || reg?.name,
      cashier_name: localActive.cashier_name || (cashier ? `${cashier.first_name} ${cashier.last_name || ''}`.trim() : 'Authorized Cashier'),
    }
  }

  return null
}

export async function openPosShift(
  payload: z.infer<typeof OpenShiftSchema>,
  cashierId: string,
  branchId: string
): Promise<PosShift> {
  const companyId = await currentCompanyId()
  const valid = OpenShiftSchema.parse(payload)
  const staff = getStoredStaffList()
  const registers = getStoredPosRegisters()
  const cashier = staff.find((s) => s.user_id === cashierId || s.id === cashierId)
  const reg = registers.find((r) => r.id === valid.register_id)

  const newShift: PosShift = {
    id: `shift-${Date.now()}`,
    company_id: companyId,
    branch_id: branchId,
    register_id: valid.register_id,
    cashier_id: cashierId,
    opening_balance: valid.opening_balance,
    notes: valid.notes || null,
    status: 'open',
    opened_at: new Date().toISOString(),
    closed_at: null,
    closing_balance_actual: 0,
    closing_balance_expected: valid.opening_balance,
    cash_sales: 0,
    card_sales: 0,
    cheque_sales: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    register_name: reg?.name || 'Counter Terminal',
    cashier_name: cashier ? `${cashier.first_name} ${cashier.last_name || ''}`.trim() : 'Authorized Cashier',
  }

  // Update shifts in local storage
  const currentShifts = getStoredPosShifts()
  saveStoredPosShifts([newShift, ...currentShifts])

  // Update register cashier assignment in local storage
  const regIdx = registers.findIndex((r) => r.id === valid.register_id)
  if (regIdx !== -1 && registers[regIdx]) {
    registers[regIdx] = {
      ...registers[regIdx]!,
      current_cashier_id: cashierId,
      cashier_name: newShift.cashier_name,
      updated_at: new Date().toISOString(),
    }
    saveStoredPosRegisters(registers)
  }

  if (
    !isBackendOffline() &&
    isUuid(companyId) &&
    isUuid(branchId) &&
    isUuid(valid.register_id) &&
    isUuid(cashierId)
  ) {
    try {
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
      if (!error && data) {
        return { ...(data as unknown as PosShift), register_name: newShift.register_name, cashier_name: newShift.cashier_name }
      }
    } catch {
      // optimistic fallback
    }
  }

  return newShift
}

export async function closePosShiftService(
  payload: z.infer<typeof CloseShiftSchema>
): Promise<{ expected: number; actual: number; variance: number }> {
  const valid = CloseShiftSchema.parse(payload)
  const shifts = getStoredPosShifts()
  const idx = shifts.findIndex((s) => s.id === valid.shift_id)
  const shift = idx !== -1 ? shifts[idx] : null

  const opening = Number(shift?.opening_balance || 0)
  const cashSales = Number(shift?.cash_sales || 0)
  const expected = opening + cashSales
  const actual = valid.closing_balance_actual
  const variance = actual - expected

  // 1. Update local shift record
  if (idx !== -1 && shift) {
    shifts[idx] = {
      ...shift,
      status: 'closed',
      closing_balance_actual: actual,
      closing_balance_expected: expected,
      closed_at: new Date().toISOString(),
      notes: valid.notes || shift.notes,
      updated_at: new Date().toISOString(),
    }
    saveStoredPosShifts(shifts)

    // Unassign cashier from register
    const registers = getStoredPosRegisters()
    const rIdx = registers.findIndex((r) => r.id === shift.register_id)
    if (rIdx !== -1 && registers[rIdx]) {
      registers[rIdx] = {
        ...registers[rIdx]!,
        current_cashier_id: null,
        cashier_name: undefined,
        updated_at: new Date().toISOString(),
      }
      saveStoredPosRegisters(registers)
    }
  }

  // 2. Synchronize with Supabase if online and UUID
  if (!isBackendOffline() && isUuid(valid.shift_id)) {
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

    try {
      await getTable('pos_shifts')
        .update({
          status: 'closed',
          closing_balance_actual: actual,
          closing_balance_expected: expected,
          closed_at: new Date().toISOString(),
          notes: valid.notes || null,
          updated_at: new Date().toISOString(),
        } as unknown as never)
        .eq('id', valid.shift_id)
    } catch {
      // optimistic fallback
    }
  }

  return { expected, actual, variance }
}

export async function fetchRecentShifts(branchId?: string, limit = 25): Promise<PosShift[]> {
  const staff = getStoredStaffList()
  const registers = getStoredPosRegisters()
  const localShifts = getStoredPosShifts()

  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId()
      if (isUuid(companyId)) {
        let query = getTable('pos_shifts')
          .select('*, pos_registers(name)')
          .order('opened_at', { ascending: false })
          .limit(limit)

        query = query.eq('company_id', companyId)
        if (branchId && isUuid(branchId)) query = query.eq('branch_id', branchId)

        const { data, error } = await query
        if (!error && data && data.length > 0) {
          const rows = data as unknown as Array<PosShift & { pos_registers?: { name?: string } }>
          const mapped = rows.map((s) => {
            const cashier = staff.find((st) => st.user_id === s.cashier_id || st.id === s.cashier_id)
            return {
              ...s,
              register_name: s.pos_registers?.name || s.register_name,
              cashier_name: cashier ? `${cashier.first_name} ${cashier.last_name || ''}`.trim() : s.cashier_name,
            }
          })
          return mapped
        }
      }
    } catch {
      // fallback
    }
  }

  const enriched = localShifts.map((s) => {
    const reg = registers.find((r) => r.id === s.register_id)
    const cashier = staff.find((st) => st.user_id === s.cashier_id || st.id === s.cashier_id)
    return {
      ...s,
      register_name: s.register_name || reg?.name || 'Counter Terminal',
      cashier_name: s.cashier_name || (cashier ? `${cashier.first_name} ${cashier.last_name || ''}`.trim() : 'Authorized Staff'),
    }
  })

  const filtered = branchId ? enriched.filter((s) => s.branch_id === branchId) : enriched
  return filtered
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
    .slice(0, limit)
}

