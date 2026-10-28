import { requireSupabase } from './client'
import { currentCompanyId } from './masterData'
import { isBackendOffline } from '../lib/supabase'
import type {
  PosRegisterSession,
  PosCashMovement,
  ActiveShiftMetrics,
  ZReportData,
  OpenPosShiftSchema,
  CashMovementSchema,
  ClosePosShiftSchema,
  DenominationCounts,
  ShiftCashTransactionRecord,
} from '../types/shift'
import { z } from 'zod'

type RpcResult<T = unknown> = { data: T; error: { message: string } | null }
const callRpc = <T = unknown>(name: string, args?: Record<string, unknown>) =>
  (requireSupabase().rpc as unknown as (functionName: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>)(name, args)

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

// ── Local Storage Persistence (Offline / Demo Resilience) ───────────────────
export const STORAGE_KEY_SESSIONS = 'bb_pos_register_sessions'
export const STORAGE_KEY_MOVEMENTS = 'bb_pos_register_movements'

export function getStoredSessions(): PosRegisterSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS)
    if (raw) return JSON.parse(raw)
  } catch {}

  const initial: PosRegisterSession[] = [
    {
      id: 'shift-active-01',
      company_id: 'comp-01',
      branch_id: 'branch-colombo',
      cashier_id: 'user-admin',
      terminal_name: 'Main Register / POS 01',
      opened_at: new Date(Date.now() - 3.5 * 3600 * 1000).toISOString(),
      closed_at: null,
      opening_cash_float: 15000,
      closing_cash_counted: null,
      expected_cash_balance: 63500,
      cash_difference: null,
      total_sales_cash: 48500,
      total_sales_card: 32400,
      total_sales_credit: 0,
      total_sales_cheque: 0,
      status: 'open',
      closing_type: 'manual',
      notes: 'Morning shift opening float verified',
      created_at: new Date(Date.now() - 3.5 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 3.5 * 3600 * 1000).toISOString(),
      branch_name: 'Main Flagship Store - Colombo 03',
      cashier_name: 'Zaid (System Administrator)',
    },
  ]
  saveStoredSessions(initial)
  return initial
}

export function saveStoredSessions(sessions: PosRegisterSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions))
  } catch {}
}

export function getStoredMovements(): PosCashMovement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MOVEMENTS)
    if (raw) return JSON.parse(raw)
  } catch {}

  const initial: PosCashMovement[] = [
    {
      id: 'mov-init-01',
      session_id: 'shift-active-01',
      company_id: 'comp-01',
      branch_id: 'branch-colombo',
      movement_type: 'sale',
      transaction_type: 'sale',
      direction: 'in',
      amount: 48500,
      reason: 'POS Cash Sale Invoice #INV-2026-0042',
      reference_type: 'invoice',
      reference_id: 'inv-1001',
      payment_method: 'cash',
      authorized_by_id: null,
      created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      user_name: 'Zaid (System Administrator)',
    },
  ]
  saveStoredMovements(initial)
  return initial
}

export function saveStoredMovements(movements: PosCashMovement[]) {
  try {
    localStorage.setItem(STORAGE_KEY_MOVEMENTS, JSON.stringify(movements))
  } catch {}
}

/**
 * Calculates live shift metrics from session header and movements array
 */
export function computeMetricsFromSessionAndMovements(
  session: PosRegisterSession,
  allMovements?: PosCashMovement[]
): ActiveShiftMetrics {
  const movements = (allMovements || getStoredMovements()).filter((m) => m.session_id === session.id)

  let cashSales = 0
  let customerPayments = 0
  let otherCashIn = 0
  let refunds = 0
  let expenses = 0
  let cashDeposits = 0
  let otherCashOut = 0

  for (const m of movements) {
    const amt = Number(m.amount) || 0
    const tType = m.transaction_type || m.movement_type
    const isOut =
      m.direction === 'out' ||
      ['cash_out', 'drop_to_safe', 'expense', 'refund', 'deposit'].includes(tType || '')

    if (tType === 'sale') cashSales += amt
    else if (tType === 'customer_payment') customerPayments += amt
    else if (tType === 'refund') refunds += amt
    else if (tType === 'expense') expenses += amt
    else if (tType === 'deposit' || tType === 'drop_to_safe') cashDeposits += amt
    else if (tType === 'cash_in') otherCashIn += amt
    else if (tType === 'cash_out') otherCashOut += amt
    else if (isOut) otherCashOut += amt
    else otherCashIn += amt
  }

  const openingCash = Number(session.opening_cash_float) || 0
  const expectedCash =
    openingCash +
    cashSales +
    customerPayments +
    otherCashIn -
    refunds -
    expenses -
    cashDeposits -
    otherCashOut

  return {
    id: session.id,
    branch_id: session.branch_id,
    branch_name: session.branch_name || (session.branch_id === 'branch-kandy' ? 'Kandy Retail Outlet' : 'Main Flagship Store - Colombo 03'),
    cashier_id: session.cashier_id || 'user-admin',
    cashier_name: session.cashier_name || 'Zaid (System Administrator)',
    terminal_name: session.terminal_name || 'Main Register / POS 01',
    opened_at: session.opened_at,
    opening_cash_float: openingCash,
    current_drawer_cash: expectedCash,
    expected_cash: expectedCash,

    opening_cash: openingCash,
    cash_sales: cashSales,
    customer_payments: customerPayments,
    other_cash_in: otherCashIn,
    refunds: refunds,
    expenses: expenses,
    cash_deposits: cashDeposits,
    other_cash_out: otherCashOut,

    total_sales_cash: cashSales,
    total_sales_card: Number(session.total_sales_card) || 0,
    total_sales_cheque: Number(session.total_sales_cheque) || 0,
    total_sales_credit: Number(session.total_sales_credit) || 0,
    cash_in: otherCashIn,
    cash_out: otherCashOut,
    safe_drops: cashDeposits,
    status: session.status,
  }
}

/**
 * Returns current date string in Asia/Colombo time (YYYY-MM-DD)
 */
export function getSriLankaDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(date)
}

/**
 * Checks if a date was opened before today in Asia/Colombo time
 */
export function isShiftExpiredAtMidnight(openedAtIso: string): boolean {
  try {
    const shiftDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(openedAtIso))
    const todayDate = getSriLankaDateString()
    return shiftDate < todayDate
  } catch {
    return false
  }
}

/**
 * Auto-closes any shift that remained open past midnight in Asia/Colombo
 */
export async function autoCloseExpiredShifts(): Promise<number> {
  // First update local storage sessions
  const stored = getStoredSessions()
  const todayStr = getSriLankaDateString()
  let localClosedCount = 0

  for (const s of stored) {
    if (s.status === 'open' && isShiftExpiredAtMidnight(s.opened_at)) {
      const metrics = computeMetricsFromSessionAndMovements(s)
      s.status = 'auto_closed'
      s.closing_type = 'auto'
      s.closed_at = new Date().toISOString()
      s.expected_cash_balance = metrics.expected_cash
      s.notes = (s.notes ? s.notes + ' | ' : '') + '[Auto-closed at midnight Asia/Colombo]'
      s.updated_at = new Date().toISOString()
      localClosedCount++
    }
  }
  if (localClosedCount > 0) {
    saveStoredSessions(stored)
  }

  if (isBackendOffline()) return localClosedCount

  try {
    const supabase = requireSupabase()
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return localClosedCount

    try {
      const res = await callRpc<number>('auto_close_expired_shifts')
      if (!res.error && typeof res.data === 'number') {
        return res.data
      }
    } catch {}

    // Resilient direct table fallback
    const companyId = await currentCompanyId().catch(() => 'comp-01')
    const { data: openShifts, error } = await getTable('pos_register_sessions')
      .select('id, opened_at, opening_cash_float, notes')
      .eq('company_id', companyId)
      .eq('status', 'open')

    if (error || !openShifts || openShifts.length === 0) return localClosedCount

    let closedCount = 0
    for (const s of openShifts as unknown as Array<{ id: string; opened_at: string; opening_cash_float: number; notes?: string }>) {
      const shiftDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(s.opened_at))
      if (shiftDate < todayStr) {
        const { data: mvRows } = await getTable('pos_register_cash_movements')
          .select('amount, direction, movement_type')
          .eq('session_id', s.id)

        let inSum = 0
        let outSum = 0
        if (mvRows) {
          for (const m of mvRows as unknown as Array<{ amount: number; direction?: string; movement_type?: string }>) {
            const isOut = m.direction === 'out' || ['cash_out', 'drop_to_safe', 'expense', 'refund', 'deposit'].includes(m.movement_type || '')
            if (isOut) outSum += Number(m.amount) || 0
            else inSum += Number(m.amount) || 0
          }
        }

        const expectedCash = (Number(s.opening_cash_float) || 0) + inSum - outSum

        await (getTable('pos_register_sessions') as any)
          .update({
            status: 'auto_closed',
            closing_type: 'auto',
            closed_at: new Date().toISOString(),
            closing_cash_counted: null,
            cash_difference: null,
            expected_cash_balance: expectedCash,
            notes: (s.notes ? s.notes + ' | ' : '') + '[Auto-closed at midnight Asia/Colombo]',
            updated_at: new Date().toISOString(),
          })
          .eq('id', s.id)

        closedCount++
      }
    }

    return closedCount || localClosedCount
  } catch {
    return localClosedCount
  }
}

/**
 * Fetches the currently active shift session with complete breakdown metrics
 */
export async function fetchActiveShiftSession(branchId?: string): Promise<ActiveShiftMetrics | null> {
  // First ensure any shifts opened on prior days in Sri Lanka time are auto-closed
  await autoCloseExpiredShifts()

  if (!isBackendOffline()) {
    try {
      const supabase = requireSupabase()
      const authSession = (await supabase.auth.getSession()).data.session
      if (authSession) {
        // 1. Try RPC
        try {
          const res = await callRpc<{ active_session: ActiveShiftMetrics | null }>('get_active_pos_session', {
            p_branch_id: branchId || null,
          })
          if (!res.error && res.data?.active_session) {
            const active = res.data.active_session
            if (isShiftExpiredAtMidnight(active.opened_at)) {
              await autoCloseExpiredShifts()
              return null
            }
            return {
              ...active,
              opening_cash: Number(active.opening_cash ?? active.opening_cash_float ?? 0),
              cash_sales: Number(active.cash_sales ?? active.total_sales_cash ?? 0),
              customer_payments: Number(active.customer_payments ?? 0),
              other_cash_in: Number(active.other_cash_in ?? active.cash_in ?? 0),
              refunds: Number(active.refunds ?? 0),
              expenses: Number(active.expenses ?? 0),
              cash_deposits: Number(active.cash_deposits ?? active.safe_drops ?? 0),
              other_cash_out: Number(active.other_cash_out ?? active.cash_out ?? 0),
              expected_cash: Number(active.expected_cash ?? active.current_drawer_cash ?? 0),
            }
          }
        } catch {}

        // 2. Try direct table
        try {
          const companyId = await currentCompanyId().catch(() => 'comp-01')
          let query = getTable('pos_register_sessions')
            .select('*, branches(name), profiles(full_name)')
            .eq('company_id', companyId)
            .eq('status', 'open')
            .order('opened_at', { ascending: false })
            .limit(1)

          if (branchId) query = query.eq('branch_id', branchId)
          const { data: sessions, error } = await query
          if (!error && sessions && sessions.length > 0) {
            const raw = sessions[0] as unknown as PosRegisterSession & {
              branches?: { name?: string }
              profiles?: { full_name?: string }
            }
            if (isShiftExpiredAtMidnight(raw.opened_at)) {
              await autoCloseExpiredShifts()
              return null
            }

            const { data: movements } = await getTable('pos_register_cash_movements')
              .select('*')
              .eq('session_id', raw.id)

            return computeMetricsFromSessionAndMovements(
              {
                ...raw,
                branch_name: raw.branches?.name || raw.branch_name,
                cashier_name: raw.profiles?.full_name || raw.cashier_name,
              },
              (movements || []) as unknown as PosCashMovement[]
            )
          }
        } catch {}
      }
    } catch {}
  }

  // 3. Fallback to local storage (works offline, in demo mode, or when Supabase is unreachable)
  const storedSessions = getStoredSessions()
  const openSession =
    storedSessions.find((s) => s.status === 'open' && (!branchId || s.branch_id === branchId)) ||
    storedSessions.find((s) => s.status === 'open')

  if (!openSession) return null

  if (isShiftExpiredAtMidnight(openSession.opened_at)) {
    openSession.status = 'auto_closed'
    saveStoredSessions(storedSessions)
    return null
  }

  return computeMetricsFromSessionAndMovements(openSession)
}

/**
 * Opens a new shift session. Validates single active shift rule.
 */
export async function openPosShiftSession(
  payload: z.infer<typeof OpenPosShiftSchema>
): Promise<{ success: boolean; session_id: string; terminal_name: string; opened_at: string; opening_cash_float: number }> {
  // First auto-close any expired sessions
  await autoCloseExpiredShifts()

  // Try online RPC/insert if backend is available
  if (!isBackendOffline()) {
    try {
      const supabase = requireSupabase()
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData?.user?.id

      if (currentUserId) {
        // Try RPC
        try {
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
          if (!res.error && res.data) {
            return res.data
          }
        } catch {}

        // Try direct table
        const companyId = await currentCompanyId().catch(() => 'comp-01')
        const { data: existing } = await getTable('pos_register_sessions')
          .select('id')
          .eq('company_id', companyId)
          .eq('branch_id', payload.branch_id)
          .eq('status', 'open')
          .limit(1)

        if (existing && existing.length > 0) {
          throw new Error('An active shift is already open for this branch. Please close it before opening a new shift.')
        }

        const { data: newSession, error: insertError } = await (getTable('pos_register_sessions') as any)
          .insert({
            company_id: companyId,
            branch_id: payload.branch_id,
            cashier_id: currentUserId,
            terminal_name: payload.terminal_name.trim(),
            opened_at: new Date().toISOString(),
            opening_cash_float: payload.opening_float,
            status: 'open',
            closing_type: 'manual',
            notes: payload.notes || null,
          })
          .select()
          .single()

        if (!insertError && newSession) {
          const session = newSession as unknown as PosRegisterSession
          if (payload.opening_float > 0) {
            await (getTable('pos_register_cash_movements') as any).insert({
              session_id: session.id,
              company_id: companyId,
              branch_id: payload.branch_id,
              movement_type: 'float_adjustment',
              transaction_type: 'float_adjustment',
              direction: 'in',
              amount: payload.opening_float,
              reason: 'Opening Cash Float',
              authorized_by_id: currentUserId,
              created_by: currentUserId,
              payment_method: 'cash',
            })
          }
          return {
            success: true,
            session_id: session.id,
            terminal_name: session.terminal_name,
            opened_at: session.opened_at,
            opening_cash_float: session.opening_cash_float,
          }
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('already open')) {
        throw err
      }
    }
  }

  // Fallback to local storage (offline/demo mode)
  const storedSessions = getStoredSessions()
  const alreadyOpen = storedSessions.some(
    (s) => s.status === 'open' && s.branch_id === payload.branch_id
  )
  if (alreadyOpen) {
    throw new Error('An active shift is already open for this branch. Please close it before opening a new shift.')
  }

  const branchLabel =
    payload.branch_id === 'branch-kandy'
      ? 'Kandy Retail Outlet'
      : 'Main Flagship Store - Colombo 03'

  const newSession: PosRegisterSession = {
    id: `shift-${Date.now()}`,
    company_id: 'comp-01',
    branch_id: payload.branch_id,
    branch_name: branchLabel,
    cashier_id: 'user-admin',
    cashier_name: 'Zaid (System Administrator)',
    terminal_name: payload.terminal_name.trim() || 'Main Register / POS 01',
    opened_at: new Date().toISOString(),
    closed_at: null,
    opening_cash_float: payload.opening_float,
    closing_cash_counted: null,
    expected_cash_balance: payload.opening_float,
    cash_difference: null,
    total_sales_cash: 0,
    total_sales_card: 0,
    total_sales_credit: 0,
    total_sales_cheque: 0,
    status: 'open',
    closing_type: 'manual',
    notes: payload.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  storedSessions.unshift(newSession)
  saveStoredSessions(storedSessions)

  return {
    success: true,
    session_id: newSession.id,
    terminal_name: newSession.terminal_name,
    opened_at: newSession.opened_at,
    opening_cash_float: newSession.opening_cash_float,
  }
}

/**
 * Records a detailed cash transaction against an active shift session
 */
export async function recordShiftCashTransaction(payload: {
  session_id: string
  branch_id?: string
  transaction_type: 'sale' | 'customer_payment' | 'refund' | 'expense' | 'deposit' | 'cash_in' | 'cash_out' | 'float_adjustment'
  direction: 'in' | 'out'
  amount: number
  reason: string
  reference_type?: string
  reference_id?: string
  notes?: string
  payment_method?: string
}): Promise<{ success: boolean; movement_id?: string; already_recorded?: boolean }> {
  if (payload.amount <= 0) {
    return { success: false }
  }

  // Try online RPC / insert
  if (!isBackendOffline()) {
    try {
      const res = await callRpc<{ success: boolean; movement_id?: string; already_recorded?: boolean }>(
        'record_shift_cash_transaction',
        {
          p_session_id: payload.session_id,
          p_transaction_type: payload.transaction_type,
          p_direction: payload.direction,
          p_amount: payload.amount,
          p_reason: payload.reason,
          p_reference_type: payload.reference_type || null,
          p_reference_id: payload.reference_id || null,
          p_notes: payload.notes || null,
        }
      )
      if (!res.error && res.data) {
        return res.data
      }
    } catch {}

    try {
      const companyId = await currentCompanyId().catch(() => 'comp-01')
      const supabase = requireSupabase()
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData?.user?.id

      if (payload.reference_type && payload.reference_id) {
        const { data: existing } = await getTable('pos_register_cash_movements')
          .select('id')
          .eq('session_id', payload.session_id)
          .eq('reference_type', payload.reference_type)
          .eq('reference_id', payload.reference_id)
          .limit(1)

        if (existing && existing.length > 0) {
          return { success: true, already_recorded: true, movement_id: (existing[0] as unknown as { id: string })?.id }
        }
      }

      let movementType: string = payload.transaction_type
      if (payload.transaction_type === 'deposit') movementType = 'drop_to_safe'
      else if (payload.direction === 'out') movementType = 'cash_out'
      else movementType = 'cash_in'

      const { data: newMv, error } = await (getTable('pos_register_cash_movements') as any)
        .insert({
          session_id: payload.session_id,
          company_id: companyId,
          branch_id: payload.branch_id || companyId,
          movement_type: movementType,
          transaction_type: payload.transaction_type,
          direction: payload.direction,
          reference_type: payload.reference_type || null,
          reference_id: payload.reference_id || null,
          amount: payload.amount,
          reason: payload.reason,
          notes: payload.notes || null,
          payment_method: payload.payment_method || 'cash',
          authorized_by_id: currentUserId || null,
          created_by: currentUserId || null,
        })
        .select()
        .single()

      if (!error && newMv) {
        return { success: true, movement_id: (newMv as unknown as { id: string })?.id }
      }
    } catch {}
  }

  // Fallback to local storage (offline/demo mode)
  const movements = getStoredMovements()

  // Idempotency check
  if (payload.reference_type && payload.reference_id) {
    const existing = movements.find(
      (m) =>
        m.session_id === payload.session_id &&
        m.reference_type === payload.reference_type &&
        m.reference_id === payload.reference_id
    )
    if (existing) {
      return { success: true, already_recorded: true, movement_id: existing.id }
    }
  }

  let movementType: any = payload.transaction_type
  if (payload.transaction_type === 'deposit') movementType = 'drop_to_safe'
  else if (payload.direction === 'out') movementType = 'cash_out'
  else movementType = 'cash_in'

  const newMv: PosCashMovement = {
    id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    session_id: payload.session_id,
    company_id: 'comp-01',
    branch_id: payload.branch_id || 'branch-colombo',
    movement_type: movementType,
    transaction_type: payload.transaction_type,
    direction: payload.direction,
    amount: payload.amount,
    reason: payload.reason,
    reference_type: payload.reference_type || null,
    reference_id: payload.reference_id || null,
    notes: payload.notes || null,
    payment_method: payload.payment_method || 'cash',
    authorized_by_id: null,
    created_at: new Date().toISOString(),
    user_name: 'Zaid (System Administrator)',
  }

  movements.unshift(newMv)
  saveStoredMovements(movements)

  return { success: true, movement_id: newMv.id }
}

/**
 * Automatically associates a cash transaction with the active shift of a branch.
 * If no active shift exists, returns { success: false, no_active_shift: true }
 */
export async function recordActiveShiftTransactionIfCash(payload: {
  branch_id?: string
  transaction_type: 'sale' | 'customer_payment' | 'refund' | 'expense' | 'deposit' | 'cash_in' | 'cash_out' | 'float_adjustment'
  direction: 'in' | 'out'
  amount: number
  reason: string
  reference_type?: string
  reference_id?: string
  notes?: string
  payment_method?: string
}): Promise<{ success: boolean; movement_id?: string; already_recorded?: boolean; no_active_shift?: boolean }> {
  if (payload.amount <= 0) return { success: false }

  const activeShift = await fetchActiveShiftSession(payload.branch_id)
  if (!activeShift?.id) {
    return { success: false, no_active_shift: true }
  }

  return await recordShiftCashTransaction({
    session_id: activeShift.id,
    branch_id: payload.branch_id || activeShift.branch_id,
    transaction_type: payload.transaction_type,
    direction: payload.direction,
    amount: payload.amount,
    reason: payload.reason,
    reference_type: payload.reference_type,
    reference_id: payload.reference_id,
    notes: payload.notes,
    payment_method: payload.payment_method || 'cash',
  })
}

/**
 * Legacy cash movement wrapper used by quick modals
 */
export async function recordCashMovementService(
  payload: z.infer<typeof CashMovementSchema>
): Promise<{ success: boolean; movement_id: string; session_id: string; movement_type: string; amount: number }> {
  const isOut = ['cash_out', 'drop_to_safe', 'expense', 'refund', 'deposit'].includes(payload.movement_type)
  const res = await recordShiftCashTransaction({
    session_id: payload.session_id,
    transaction_type: payload.movement_type as 'cash_in' | 'cash_out' | 'deposit',
    direction: isOut ? 'out' : 'in',
    amount: payload.amount,
    reason: payload.reason,
    notes: payload.notes,
  })

  return {
    success: !!res.success,
    movement_id: res.movement_id || '',
    session_id: payload.session_id,
    movement_type: payload.movement_type,
    amount: payload.amount,
  }
}

/**
 * Closes an active shift with physical cash count reconciliation and generates Z-Report
 */
export async function closePosShiftSession(
  payload: z.infer<typeof ClosePosShiftSchema>,
  denominations?: DenominationCounts
): Promise<{ success: boolean; z_report: ZReportData }> {
  // Try online RPC
  if (!isBackendOffline()) {
    try {
      const res = await callRpc<{ success: boolean; z_report: ZReportData }>('close_pos_session', {
        p_session_id: payload.session_id,
        p_counted_cash: payload.closing_cash_counted,
        p_notes: payload.notes || null,
      })
      if (!res.error && res.data) {
        const zReport = res.data.z_report
        if (denominations && zReport) {
          zReport.denominations = denominations
        }
        return { success: true, z_report: zReport }
      }
    } catch {}

    // Try direct table update
    try {
      const supabase = requireSupabase()
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData?.user?.id

      const { data: rawSession, error: sErr } = await getTable('pos_register_sessions')
        .select('*, branches(name), profiles(full_name)')
        .eq('id', payload.session_id)
        .single()

      if (!sErr && rawSession) {
        const session = rawSession as unknown as PosRegisterSession & {
          branches?: { name?: string }
          profiles?: { full_name?: string }
        }

        const { data: movements } = await getTable('pos_register_cash_movements')
          .select('*')
          .eq('session_id', session.id)

        const metrics = computeMetricsFromSessionAndMovements(
          session,
          (movements || []) as unknown as PosCashMovement[]
        )
        const countedCash = Number(payload.closing_cash_counted) || 0
        const variance = Math.round((countedCash - metrics.expected_cash) * 100) / 100

        await (getTable('pos_register_sessions') as any)
          .update({
            closed_at: new Date().toISOString(),
            closed_by: currentUserId || null,
            closing_type: 'manual',
            closing_cash_counted: countedCash,
            expected_cash_balance: metrics.expected_cash,
            cash_difference: variance,
            total_sales_cash: metrics.cash_sales,
            total_customer_payments_cash: metrics.customer_payments,
            total_expenses_cash: metrics.expenses,
            total_refunds_cash: metrics.refunds,
            total_cash_deposits: metrics.cash_deposits,
            total_cash_in: metrics.other_cash_in,
            total_cash_out: metrics.other_cash_out,
            status: 'closed',
            notes: payload.notes || null,
            closing_note: payload.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id)

        const zReport: ZReportData = {
          session_id: session.id,
          company_name: 'Baby Bloom Business Suite',
          branch_name: session.branches?.name || session.branch_name || 'Main Branch',
          terminal_name: session.terminal_name,
          cashier_name: session.profiles?.full_name || session.cashier_name || 'Cashier',
          opened_at: session.opened_at,
          closed_at: new Date().toISOString(),
          opening_float: metrics.opening_cash,
          cash_sales: metrics.cash_sales,
          customer_payments: metrics.customer_payments,
          other_cash_in: metrics.other_cash_in,
          refunds: metrics.refunds,
          expenses: metrics.expenses,
          cash_deposits: metrics.cash_deposits,
          other_cash_out: metrics.other_cash_out,
          total_sales_cash: metrics.cash_sales,
          total_sales_card: Number(session.total_sales_card) || 0,
          total_sales_cheque: Number(session.total_sales_cheque) || 0,
          total_sales_credit: Number(session.total_sales_credit) || 0,
          gross_sales:
            metrics.cash_sales +
            (Number(session.total_sales_card) || 0) +
            (Number(session.total_sales_cheque) || 0) +
            (Number(session.total_sales_credit) || 0),
          cash_in: metrics.other_cash_in,
          cash_out: metrics.other_cash_out,
          safe_drops: metrics.cash_deposits,
          expected_cash: metrics.expected_cash,
          counted_cash: countedCash,
          variance: variance,
          invoice_count: 0,
          notes: payload.notes || null,
          closing_type: 'manual',
          denominations: denominations,
        }

        return { success: true, z_report: zReport }
      }
    } catch {}
  }

  // Fallback to local storage (offline/demo mode)
  const storedSessions = getStoredSessions()
  const session =
    storedSessions.find((s) => s.id === payload.session_id) ||
    storedSessions.find((s) => s.status === 'open') ||
    storedSessions[0]

  if (!session) {
    throw new Error('Shift session not found to close.')
  }

  const allMovements = getStoredMovements()
  const metrics = computeMetricsFromSessionAndMovements(session, allMovements)
  const countedCash = Number(payload.closing_cash_counted) || 0
  const variance = Math.round((countedCash - metrics.expected_cash) * 100) / 100

  session.status = 'closed'
  session.closed_at = new Date().toISOString()
  session.closing_cash_counted = countedCash
  session.expected_cash_balance = metrics.expected_cash
  session.cash_difference = variance
  session.total_sales_cash = metrics.cash_sales
  session.total_customer_payments_cash = metrics.customer_payments
  session.total_expenses_cash = metrics.expenses
  session.total_refunds_cash = metrics.refunds
  session.total_cash_deposits = metrics.cash_deposits
  session.total_cash_in = metrics.other_cash_in
  session.total_cash_out = metrics.other_cash_out
  session.notes = payload.notes || session.notes
  session.closing_note = payload.notes || null
  session.updated_at = new Date().toISOString()

  saveStoredSessions(storedSessions)

  const zReport: ZReportData = {
    session_id: session.id,
    company_name: 'Baby Bloom Business Suite',
    branch_name: session.branch_name || 'Main Flagship Store - Colombo 03',
    terminal_name: session.terminal_name,
    cashier_name: session.cashier_name || 'Zaid (System Administrator)',
    opened_at: session.opened_at,
    closed_at: session.closed_at!,
    opening_float: metrics.opening_cash,
    cash_sales: metrics.cash_sales,
    customer_payments: metrics.customer_payments,
    other_cash_in: metrics.other_cash_in,
    refunds: metrics.refunds,
    expenses: metrics.expenses,
    cash_deposits: metrics.cash_deposits,
    other_cash_out: metrics.other_cash_out,
    total_sales_cash: metrics.cash_sales,
    total_sales_card: Number(session.total_sales_card) || 0,
    total_sales_cheque: Number(session.total_sales_cheque) || 0,
    total_sales_credit: Number(session.total_sales_credit) || 0,
    gross_sales:
      metrics.cash_sales +
      (Number(session.total_sales_card) || 0) +
      (Number(session.total_sales_cheque) || 0) +
      (Number(session.total_sales_credit) || 0),
    cash_in: metrics.other_cash_in,
    cash_out: metrics.other_cash_out,
    safe_drops: metrics.cash_deposits,
    expected_cash: metrics.expected_cash,
    counted_cash: countedCash,
    variance: variance,
    invoice_count: allMovements.filter((m) => m.session_id === session.id && (m.transaction_type === 'sale' || m.reference_type === 'invoice')).length,
    notes: payload.notes || null,
    closing_type: 'manual',
    denominations: denominations,
  }

  return { success: true, z_report: zReport }
}

/**
 * Fetches shift history for the branch / company
 */
export async function fetchShiftHistory(branchId?: string, limit = 50): Promise<PosRegisterSession[]> {
  await autoCloseExpiredShifts()

  if (!isBackendOffline()) {
    try {
      const companyId = await currentCompanyId().catch(() => 'comp-01')
      let query = getTable('pos_register_sessions')
        .select('*, branches(name), profiles(full_name)')
        .eq('company_id', companyId)
        .order('opened_at', { ascending: false })
        .limit(limit)

      if (branchId) query = query.eq('branch_id', branchId)

      const { data, error } = await query
      if (!error && data) {
        const rows = data as unknown as Array<
          PosRegisterSession & { branches?: { name?: string }; profiles?: { full_name?: string } }
        >
        return rows.map((r) => ({
          ...r,
          branch_name: r.branches?.name || r.branch_name,
          cashier_name: r.profiles?.full_name || r.cashier_name,
        }))
      }
    } catch {}
  }

  // Local storage fallback
  const stored = getStoredSessions()
  const filtered = branchId ? stored.filter((s) => s.branch_id === branchId) : stored
  return filtered
    .slice()
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
    .slice(0, limit)
}

/**
 * Fetches all detailed cash transactions for a given shift session
 */
export async function fetchShiftTransactions(sessionId: string): Promise<ShiftCashTransactionRecord[]> {
  if (!isBackendOffline()) {
    try {
      const { data, error } = await getTable('pos_register_cash_movements')
        .select('*, profiles(full_name)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (!error && data) {
        const rows = data as unknown as Array<
          PosCashMovement & { profiles?: { full_name?: string } }
        >
        return rows.map((r) => {
          const isOut =
            r.direction === 'out' ||
            ['cash_out', 'drop_to_safe', 'expense', 'refund', 'deposit'].includes(r.movement_type || '')
          const tType = r.transaction_type || r.movement_type
          return {
            id: r.id,
            created_at: r.created_at,
            transaction_type: tType,
            direction: isOut ? 'out' : 'in',
            amount: Number(r.amount) || 0,
            reason: r.reason,
            reference_type: r.reference_type,
            reference_id: r.reference_id,
            payment_method: r.payment_method || 'cash',
            notes: r.notes,
            user_name: r.profiles?.full_name || r.authorized_by_name || 'Cashier',
          }
        })
      }
    } catch {}
  }

  // Local storage fallback
  const allMovements = getStoredMovements()
  const shiftMovements = allMovements
    .filter((m) => m.session_id === sessionId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return shiftMovements.map((r) => {
    const isOut =
      r.direction === 'out' ||
      ['cash_out', 'drop_to_safe', 'expense', 'refund', 'deposit'].includes(r.movement_type || '')
    const tType = r.transaction_type || r.movement_type
    return {
      id: r.id,
      created_at: r.created_at,
      transaction_type: tType,
      direction: isOut ? 'out' : 'in',
      amount: Number(r.amount) || 0,
      reason: r.reason,
      reference_type: r.reference_type,
      reference_id: r.reference_id,
      payment_method: r.payment_method || 'cash',
      notes: r.notes,
      user_name: r.user_name || r.authorized_by_name || 'Zaid (System Administrator)',
    }
  })
}

/**
 * Legacy wrapper for cash movements
 */
export async function fetchCashMovements(sessionId: string): Promise<PosCashMovement[]> {
  if (!isBackendOffline()) {
    try {
      const { data, error } = await getTable('pos_register_cash_movements')
        .select('*, profiles(full_name)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (!error && data) {
        const rows = data as unknown as Array<
          PosCashMovement & { profiles?: { full_name?: string } }
        >
        return rows.map((r) => ({
          ...r,
          authorized_by_name: r.profiles?.full_name,
        }))
      }
    } catch {}
  }

  const allMovements = getStoredMovements()
  return allMovements.filter((m) => m.session_id === sessionId)
}
