import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Coins,
  DollarSign,
  FileSpreadsheet,
  History,
  Lock,
  PlusCircle,
  Printer,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Unlock,
  Wallet,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { listLookup } from '../services/masterData'
import {
  fetchActiveShiftSession,
  openPosShiftSession,
  recordCashMovementService,
  closePosShiftSession,
  fetchShiftHistory,
  fetchCashMovements,
} from '../services/shiftService'
import type {
  DenominationCounts,
  ZReportData,
} from '../types/shift'
import { getErrorMessage } from '../lib/errors'

const cash = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const initialDenominations: DenominationCounts = {
  note_5000: 0,
  note_1000: 0,
  note_500: 0,
  note_100: 0,
  note_50: 0,
  note_20: 0,
  coins: 0,
}

export function PosShiftPage() {
  const qc = useQueryClient()
  const branchId = useBranchStore((s) => s.branchId)
  const staffName = useAuthStore((s) => s.user?.displayName)
  const currentUser = useAuthStore((s) => s.user)

  // ── States ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<ZReportData | null>(null)
  const [showPrintView, setShowPrintView] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Form states: Open Shift
  const [openBranchId, setOpenBranchId] = useState(branchId || '')
  const [openTerminal, setOpenTerminal] = useState('POS Terminal 01')
  const [openFloat, setOpenFloat] = useState<number>(5000)

  // Form states: Cash Movement
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out' | 'drop_to_safe'>('cash_in')
  const [movementAmount, setMovementAmount] = useState<number>(0)
  const [movementReason, setMovementReason] = useState('')
  const [managerPin, setManagerPin] = useState('')

  // Form states: Close Shift & Denominations
  const [denominations, setDenominations] = useState<DenominationCounts>(initialDenominations)
  const [manualCountedOverride, setManualCountedOverride] = useState<number | null>(null)
  const [closeNotes, setCloseNotes] = useState('')
  const [activeZReport, setActiveZReport] = useState<ZReportData | null>(null)

  // ── Queries ─────────────────────────────────────────────────────────────
  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  const { data: activeShift, isLoading: shiftLoading } = useQuery({
    queryKey: ['active-pos-shift', branchId],
    queryFn: () => fetchActiveShiftSession(branchId || undefined),
    refetchInterval: 10000,
  })

  const { data: shiftHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['shift-history', branchId],
    queryFn: () => fetchShiftHistory(branchId || undefined, 30),
    enabled: activeTab === 'history',
  })

  const { data: cashMovements } = useQuery({
    queryKey: ['cash-movements', activeShift?.id],
    queryFn: () => (activeShift?.id ? fetchCashMovements(activeShift.id) : Promise.resolve([])),
    enabled: !!activeShift?.id,
  })

  // ── Elapsed Time Calculation ────────────────────────────────────────────
  const [elapsed, setElapsed] = useState<string>('00:00:00')
  useEffect(() => {
    if (!activeShift?.opened_at) return
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(activeShift.opened_at).getTime()) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [activeShift?.opened_at])

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 5000)
  }

  // ── Calculated Denomination Sum ─────────────────────────────────────────
  const calculatedDenomTotal = useMemo(() => {
    return (
      denominations.note_5000 * 5000 +
      denominations.note_1000 * 1000 +
      denominations.note_500 * 500 +
      denominations.note_100 * 100 +
      denominations.note_50 * 50 +
      denominations.note_20 * 20 +
      (Number(denominations.coins) || 0)
    )
  }, [denominations])

  const effectiveCountedCash = manualCountedOverride !== null ? manualCountedOverride : calculatedDenomTotal
  const expectedDrawerCash = activeShift ? activeShift.current_drawer_cash : 0
  const currentVariance = effectiveCountedCash - expectedDrawerCash

  // ── Mutations ───────────────────────────────────────────────────────────
  const openShiftMutation = useMutation({
    mutationFn: () =>
      openPosShiftSession({
        branch_id: openBranchId || branchId || branches.data?.[0]?.value || '',
        terminal_name: openTerminal,
        opening_float: Number(openFloat) || 0,
      }),
    onSuccess: () => {
      notify('Shift session opened successfully! Cash drawer initialized.')
      setShowOpenModal(false)
      qc.invalidateQueries({ queryKey: ['active-pos-shift'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const cashMovementMutation = useMutation({
    mutationFn: () => {
      if (!activeShift?.id) throw new Error('No active shift session')
      if (movementAmount <= 0) throw new Error('Amount must be greater than 0')
      if (!movementReason.trim()) throw new Error('Reason is required')
      return recordCashMovementService({
        session_id: activeShift.id,
        movement_type: movementType,
        amount: Number(movementAmount),
        reason: movementReason,
      })
    },
    onSuccess: (data) => {
      notify(`Cash movement (${data.movement_type.toUpperCase()}) of ${cash(data.amount)} recorded!`)
      setShowMovementModal(false)
      setMovementAmount(0)
      setMovementReason('')
      setManagerPin('')
      qc.invalidateQueries({ queryKey: ['active-pos-shift'] })
      qc.invalidateQueries({ queryKey: ['cash-movements'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!activeShift?.id) throw new Error('No active shift session')
      return closePosShiftSession(
        {
          session_id: activeShift.id,
          closing_cash_counted: effectiveCountedCash,
          notes: closeNotes,
        },
        denominations
      )
    },
    onSuccess: (res) => {
      notify('Shift closed & reconciled successfully. Z-Report generated.')
      setShowCloseModal(false)
      setActiveZReport(res.z_report)
      setShowPrintView(true)
      qc.invalidateQueries({ queryKey: ['active-pos-shift'] })
      qc.invalidateQueries({ queryKey: ['shift-history'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
            <Wallet className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Shift Management & Cash Drawer (Z-Report)</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage cashier shift sessions, track drawer cash inflows/outflows, and reconcile end-of-day Z-Reports.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer ${
              activeTab === 'current'
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('current')}
          >
            <Clock className="w-4 h-4" />
            Current Shift
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('history')}
          >
            <History className="w-4 h-4" />
            Shift History
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium border ${
          notice.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          {notice.type === 'error' ? <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />}
          <span>{notice.message}</span>
        </div>
      )}

      {/* ── Tab 1: Current Active Shift ─────────────────────────────────── */}
      {activeTab === 'current' && (
        <>
          {shiftLoading ? (
            <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500 font-medium">
              Loading active shift status...
            </div>
          ) : activeShift ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Columns: Shift Details & Live Metrics */}
              <div className="lg:col-span-2 space-y-6">
                {/* Active Shift Header Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-600">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                          SESSION ACTIVE
                        </span>
                        <strong className="text-lg font-bold text-gray-900">{activeShift.terminal_name}</strong>
                      </div>
                      <p className="text-sm text-gray-600">
                        Cashier: <strong className="text-gray-900">{activeShift.cashier_name || staffName}</strong> • Branch: <strong className="text-gray-900">{activeShift.branch_name || 'Main Branch'}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Shift Elapsed Time</div>
                      <div className="text-2xl font-black font-mono text-emerald-700 tracking-tight">
                        {elapsed}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Started: {new Date(activeShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <hr className="my-5 border-gray-100" />

                  {/* Top Key Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100">
                      <span className="text-xs font-medium text-gray-500">Opening Float</span>
                      <strong className="block text-base font-bold text-gray-900 mt-1">{cash(activeShift.opening_cash_float)}</strong>
                    </div>
                    <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-100">
                      <span className="text-xs font-semibold text-emerald-700">Cash In Drawer</span>
                      <strong className="block text-lg font-black text-emerald-700 mt-0.5">
                        {cash(activeShift.current_drawer_cash)}
                      </strong>
                    </div>
                    <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100">
                      <span className="text-xs font-medium text-gray-500">Cash Sales</span>
                      <strong className="block text-base font-bold text-gray-900 mt-1">{cash(activeShift.total_sales_cash)}</strong>
                    </div>
                    <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100">
                      <span className="text-xs font-medium text-gray-500">Non-Cash Sales</span>
                      <strong className="block text-base font-bold text-gray-900 mt-1">
                        {cash(activeShift.total_sales_card + activeShift.total_sales_cheque + activeShift.total_sales_credit)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Sales Breakdown by Tender */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    Session Sales Breakdown by Tender
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                      <span className="text-xs font-medium text-gray-600">💵 Cash Sales</span>
                      <strong className="block text-base font-bold text-emerald-800 mt-1">{cash(activeShift.total_sales_cash)}</strong>
                    </div>
                    <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                      <span className="text-xs font-medium text-gray-600">💳 Card Sales</span>
                      <strong className="block text-base font-bold text-blue-800 mt-1">{cash(activeShift.total_sales_card)}</strong>
                    </div>
                    <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100">
                      <span className="text-xs font-medium text-gray-600">📝 Cheque Sales</span>
                      <strong className="block text-base font-bold text-amber-800 mt-1">{cash(activeShift.total_sales_cheque)}</strong>
                    </div>
                    <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100">
                      <span className="text-xs font-medium text-gray-600">🤝 Customer Credit</span>
                      <strong className="block text-base font-bold text-purple-800 mt-1">{cash(activeShift.total_sales_credit)}</strong>
                    </div>
                  </div>
                </div>

                {/* Drawer Cash Movements Log */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <Coins className="w-5 h-5 text-emerald-600" />
                      Drawer Cash Adjustments & Safe Drops
                    </h3>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                      onClick={() => setShowMovementModal(true)}
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Cash In / Out
                    </button>
                  </div>

                  {cashMovements && cashMovements.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <th className="pb-3">Time</th>
                            <th className="pb-3">Type</th>
                            <th className="pb-3">Reason</th>
                            <th className="pb-3">Authorized By</th>
                            <th className="pb-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {cashMovements.map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50/50">
                              <td className="py-3 text-gray-500">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="py-3">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  m.movement_type === 'cash_in'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : m.movement_type === 'drop_to_safe'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {m.movement_type === 'cash_in' && <ArrowDownRight className="w-3 h-3" />}
                                  {m.movement_type === 'cash_out' && <ArrowUpRight className="w-3 h-3" />}
                                  {m.movement_type === 'drop_to_safe' && <Lock className="w-3 h-3" />}
                                  {' '}{m.movement_type.toUpperCase().replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="py-3 font-medium text-gray-800">{m.reason}</td>
                              <td className="py-3 text-gray-600">{m.authorized_by_name || 'Cashier'}</td>
                              <td className="py-3 text-right font-bold text-gray-900">
                                {m.movement_type === 'cash_in' || m.movement_type === 'float_adjustment' ? '+' : '-'}
                                {cash(m.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-sm text-gray-500 bg-gray-50/50 rounded-xl border border-gray-100">
                      No manual cash adjustments recorded during this shift.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Shift Actions & Reconciliation Launcher */}
              <div className="space-y-6">
                {/* Actions Box */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Drawer Quick Actions</h3>

                  <div className="space-y-3">
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 p-3.5 bg-gray-50/80 hover:bg-emerald-50/60 border border-gray-200/80 hover:border-emerald-300 rounded-xl transition-all text-left cursor-pointer group"
                      onClick={() => {
                        setMovementType('cash_in')
                        setShowMovementModal(true)
                      }}
                    >
                      <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg group-hover:scale-105 transition-transform">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <strong className="block text-sm text-gray-900">Cash In (Add Change)</strong>
                        <span className="text-xs text-gray-500">Add float or emergency change into drawer</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="w-full flex items-center gap-3 p-3.5 bg-gray-50/80 hover:bg-blue-50/60 border border-gray-200/80 hover:border-blue-300 rounded-xl transition-all text-left cursor-pointer group"
                      onClick={() => {
                        setMovementType('drop_to_safe')
                        setShowMovementModal(true)
                      }}
                    >
                      <div className="p-2.5 bg-blue-100 text-blue-700 rounded-lg group-hover:scale-105 transition-transform">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <strong className="block text-sm text-gray-900">Safe Drop (Skim Drawer)</strong>
                        <span className="text-xs text-gray-500">Transfer excess cash to main branch safe</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="w-full flex items-center gap-3 p-3.5 bg-gray-50/80 hover:bg-amber-50/60 border border-gray-200/80 hover:border-amber-300 rounded-xl transition-all text-left cursor-pointer group"
                      onClick={() => {
                        setMovementType('cash_out')
                        setShowMovementModal(true)
                      }}
                    >
                      <div className="p-2.5 bg-amber-100 text-amber-700 rounded-lg group-hover:scale-105 transition-transform">
                        <TrendingDown className="w-5 h-5" />
                      </div>
                      <div>
                        <strong className="block text-sm text-gray-900">Cash Out (Expense/Payout)</strong>
                        <span className="text-xs text-gray-500">Emergency drawer payout with authorization</span>
                      </div>
                    </button>

                    <hr className="my-4 border-gray-100" />

                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm shadow-md transition-all cursor-pointer"
                      onClick={() => {
                        setDenominations(initialDenominations)
                        setManualCountedOverride(null)
                        setShowCloseModal(true)
                      }}
                    >
                      <XCircle className="w-5 h-5" />
                      End Shift & Reconcile (Z-Report)
                    </button>
                  </div>
                </div>

                {/* Reconciliation Quick Status */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                    Expected Reconciliation Formula
                  </h4>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Opening Float:</span>
                      <strong className="text-gray-900">{cash(activeShift.opening_cash_float)}</strong>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>+ Cash Sales:</span>
                      <strong className="text-emerald-600">+{cash(activeShift.total_sales_cash)}</strong>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>+ Cash In Inflows:</span>
                      <strong className="text-gray-900">+{cash(activeShift.cash_in)}</strong>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>- Safe Drops & Out:</span>
                      <strong className="text-rose-600">-{cash(activeShift.safe_drops + activeShift.cash_out)}</strong>
                    </div>
                    <hr className="my-3 border-gray-100" />
                    <div className="flex justify-between text-base font-bold">
                      <span className="text-gray-900">Expected Drawer:</span>
                      <span className="text-emerald-700">{cash(activeShift.current_drawer_cash)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* No Active Shift -> Clean White Card (Matches Image 1 fix) */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center max-w-xl mx-auto my-12">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Unlock className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No Active Shift Session</h2>
              <p className="text-gray-500 text-sm max-w-md mx-auto mb-8">
                You must open a cashier shift session and specify the opening cash float before ringing up sales or accessing the cash drawer.
              </p>
              <button
                type="button"
                onClick={() => setShowOpenModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-md font-bold text-base transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                <PlusCircle className="w-5 h-5" />
                Open Cashier Shift Now
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Tab 2: Shift Session History ────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Past Closed Shifts & Z-Report Archive
            </h3>
            <span className="text-xs text-gray-500 font-medium">Showing last 30 shift sessions</span>
          </div>

          {historyLoading ? (
            <div className="p-8 text-center text-gray-500">Loading shift history...</div>
          ) : shiftHistory && shiftHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="pb-3">Terminal</th>
                    <th className="pb-3">Cashier</th>
                    <th className="pb-3">Opened</th>
                    <th className="pb-3">Closed</th>
                    <th className="pb-3 text-right">Cash Float</th>
                    <th className="pb-3 text-right">Cash Sales</th>
                    <th className="pb-3 text-right">Expected Cash</th>
                    <th className="pb-3 text-right">Counted Cash</th>
                    <th className="pb-3 text-right">Variance</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-center">Z-Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {shiftHistory.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50">
                      <td className="py-3.5 font-bold text-gray-900">{s.terminal_name}</td>
                      <td className="py-3.5 text-gray-700">{s.cashier_name || 'Staff'}</td>
                      <td className="py-3.5 text-gray-500 text-xs">{new Date(s.opened_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="py-3.5 text-gray-500 text-xs">{s.closed_at ? new Date(s.closed_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Still Open'}</td>
                      <td className="py-3.5 text-right font-medium">{cash(s.opening_cash_float)}</td>
                      <td className="py-3.5 text-right font-medium text-emerald-700">{cash(s.total_sales_cash)}</td>
                      <td className="py-3.5 text-right font-medium">{cash(s.expected_cash_balance || 0)}</td>
                      <td className="py-3.5 text-right font-bold text-gray-900">{cash(s.closing_cash_counted || 0)}</td>
                      <td className="py-3.5 text-right">
                        {s.cash_difference === null || s.cash_difference === undefined ? (
                          <span className="text-gray-400">-</span>
                        ) : Math.abs(s.cash_difference) < 0.01 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">Balanced (0.00)</span>
                        ) : s.cash_difference > 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">+{cash(s.cash_difference)} (Over)</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700">{cash(s.cash_difference)} (Short)</span>
                        )}
                      </td>
                      <td className="py-3.5">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 text-center">
                        {s.status === 'closed' || s.status === 'audited' ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-xs transition-colors cursor-pointer"
                            title="View / Print Z-Report"
                            onClick={() => {
                              setSelectedHistoryReport({
                                session_id: s.id,
                                company_name: 'Baby Bloom Business Suite',
                                branch_name: s.branch_name || 'Branch',
                                terminal_name: s.terminal_name,
                                cashier_name: s.cashier_name || 'Cashier',
                                opened_at: s.opened_at,
                                closed_at: s.closed_at || new Date().toISOString(),
                                opening_float: s.opening_cash_float,
                                total_sales_cash: s.total_sales_cash,
                                total_sales_card: s.total_sales_card,
                                total_sales_cheque: s.total_sales_cheque,
                                total_sales_credit: s.total_sales_credit,
                                gross_sales: s.total_sales_cash + s.total_sales_card + s.total_sales_cheque + s.total_sales_credit,
                                cash_in: 0,
                                cash_out: 0,
                                safe_drops: 0,
                                expected_cash: s.expected_cash_balance || 0,
                                counted_cash: s.closing_cash_counted || 0,
                                variance: s.cash_difference || 0,
                                auto_journal_id: s.auto_journal_id,
                                invoice_count: 0,
                                notes: s.notes,
                              })
                              setShowPrintView(true)
                            }}
                          >
                            <Printer className="w-3.5 h-3.5 text-gray-500" />
                            Z-Report
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">No historical shifts found.</div>
          )}
        </div>
      )}

      {/* ── MODAL 1: Open Shift (Matches Image 2 fix with crisp white card) ─ */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Unlock className="w-5 h-5 text-emerald-600" />
                Open Cashier Shift
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                onClick={() => setShowOpenModal(false)}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Branch Location</label>
                <select
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-xs"
                  value={openBranchId}
                  onChange={(e) => setOpenBranchId(e.target.value)}
                >
                  {branches.data?.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">POS Terminal / Counter</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-xs"
                  value={openTerminal}
                  onChange={(e) => setOpenTerminal(e.target.value)}
                  placeholder="e.g. Counter 01 / Main POS"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Opening Cash Float (Rs.)</label>
                <input
                  type="number"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-xs"
                  value={openFloat}
                  onChange={(e) => setOpenFloat(Number(e.target.value))}
                  placeholder="5000"
                  min="0"
                  step="500"
                />
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {[2000, 5000, 10000, 20000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                        openFloat === preset
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                      onClick={() => setOpenFloat(preset)}
                    >
                      Rs. {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs text-emerald-800 leading-relaxed">
                Opening float will be logged as the starting drawer balance and recorded in the security audit trail.
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setShowOpenModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                disabled={openShiftMutation.isPending}
                onClick={() => openShiftMutation.mutate()}
              >
                {openShiftMutation.isPending ? 'Opening...' : 'Confirm & Open Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Cash In / Out / Safe Drop ───────────────────────────── */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-600" />
                Drawer Cash Movement
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                onClick={() => setShowMovementModal(false)}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Movement Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      movementType === 'cash_in'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => setMovementType('cash_in')}
                  >
                    Cash In
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      movementType === 'drop_to_safe'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => setMovementType('drop_to_safe')}
                  >
                    Safe Drop
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      movementType === 'cash_out'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => setMovementType('cash_out')}
                  >
                    Cash Out
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Amount (Rs.)</label>
                <input
                  type="number"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-xs"
                  value={movementAmount || ''}
                  onChange={(e) => setMovementAmount(Number(e.target.value))}
                  placeholder="e.g. 5000"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Reason / Description</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-xs"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="e.g. Midday safe drop / Emergency change"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Manager Authorization PIN</label>
                <input
                  type="password"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 tracking-widest font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-xs"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="••••"
                  maxLength={6}
                />
                <span className="block text-xs text-gray-400 mt-1">
                  Authorizer: {staffName} ({currentUser?.email})
                </span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setShowMovementModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                disabled={cashMovementMutation.isPending || !movementAmount || !movementReason.trim()}
                onClick={() => cashMovementMutation.mutate()}
              >
                {cashMovementMutation.isPending ? 'Recording...' : 'Record Movement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Close Shift & End-of-Day Reconciliation ─────────────── */}
      {showCloseModal && activeShift && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-rose-600" />
                  Close Shift & Cash Drawer Reconciliation (Z-Report)
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Terminal: <strong className="text-gray-900">{activeShift.terminal_name}</strong> • Cashier: <strong className="text-gray-900">{activeShift.cashier_name || staffName}</strong>
                </p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                onClick={() => setShowCloseModal(false)}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Sri Lankan Rupee Denomination Breakdown */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-emerald-600" />
                  Physical Cash Count (Denominations)
                </h4>

                <div className="space-y-2">
                  {[
                    { key: 'note_5000' as const, label: 'Rs. 5,000 Notes', mult: 5000 },
                    { key: 'note_1000' as const, label: 'Rs. 1,000 Notes', mult: 1000 },
                    { key: 'note_500' as const, label: 'Rs. 500 Notes', mult: 500 },
                    { key: 'note_100' as const, label: 'Rs. 100 Notes', mult: 100 },
                    { key: 'note_50' as const, label: 'Rs. 50 Notes', mult: 50 },
                    { key: 'note_20' as const, label: 'Rs. 20 Notes', mult: 20 },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <span className="w-32 text-xs font-semibold text-gray-700">{row.label}</span>
                      <span className="text-gray-400">×</span>
                      <input
                        type="number"
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 text-center font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={denominations[row.key] || ''}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0)
                          setDenominations((prev) => ({ ...prev, [row.key]: val }))
                          setManualCountedOverride(null)
                        }}
                        min="0"
                      />
                      <span className="text-gray-400">=</span>
                      <strong className="flex-1 text-right text-xs font-bold text-gray-900">
                        {cash(denominations[row.key] * row.mult)}
                      </strong>
                    </div>
                  ))}

                  {/* Coins Total */}
                  <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                    <span className="w-32 text-xs font-semibold text-gray-700">Coins (Total Rs.)</span>
                    <span className="text-gray-400">=</span>
                    <input
                      type="number"
                      className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 text-center font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={denominations.coins || ''}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0)
                        setDenominations((prev) => ({ ...prev, coins: val }))
                        setManualCountedOverride(null)
                      }}
                      min="0"
                    />
                    <strong className="flex-1 text-right text-xs font-bold text-gray-900">
                      {cash(denominations.coins)}
                    </strong>
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Calculated Physical Cash:</span>
                  <strong className="text-lg font-black text-emerald-800">{cash(calculatedDenomTotal)}</strong>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Reconciliation Notes</label>
                  <textarea
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                    rows={2}
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="e.g. End of shift. Cash verified with supervisor."
                  />
                </div>
              </div>

              {/* Right Column: System Expected vs Physical Variance */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  System Expected vs Actual
                </h4>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Opening Float:</span>
                    <span>{cash(activeShift.opening_cash_float)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Total Cash Sales:</span>
                    <span className="text-emerald-700 font-medium">+{cash(activeShift.total_sales_cash)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Drawer Cash In:</span>
                    <span>+{cash(activeShift.cash_in)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Drawer Cash Out / Drops:</span>
                    <span className="text-rose-700 font-medium">-{cash(activeShift.safe_drops + activeShift.cash_out)}</span>
                  </div>
                  <hr className="my-2 border-gray-200" />
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>Expected Drawer Balance:</span>
                    <span>{cash(expectedDrawerCash)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-800 text-base pt-1">
                    <span>Actual Physical Counted:</span>
                    <span>{cash(effectiveCountedCash)}</span>
                  </div>
                </div>

                {/* Variance Banner */}
                {Math.abs(currentVariance) < 0.01 ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-900">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                    <div>
                      <strong className="block text-sm">Drawer is Balanced (0.00)</strong>
                      <span className="text-xs text-emerald-700">Counted cash perfectly matches system expectations.</span>
                    </div>
                  </div>
                ) : currentVariance > 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-900">
                    <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                    <div>
                      <strong className="block text-sm">Cash Overage: +{cash(currentVariance)}</strong>
                      <span className="text-xs text-amber-700">Physical cash exceeds expected total. Auto-journal will record overage.</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-900">
                    <ShieldAlert className="w-6 h-6 text-rose-600 flex-shrink-0" />
                    <div>
                      <strong className="block text-sm">Cash Shortage: {cash(currentVariance)}</strong>
                      <span className="text-xs text-rose-700">Physical cash is less than expected. Auto-journal will record shortage expense.</span>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500 leading-relaxed">
                  Closing this shift will lock the register session, compute final Z-Report metrics, and generate the printable thermal receipt.
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setShowCloseModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                disabled={closeShiftMutation.isPending}
                onClick={() => closeShiftMutation.mutate()}
              >
                {closeShiftMutation.isPending ? 'Closing Shift...' : 'Confirm & Close Shift (Print Z-Report)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: Thermal Receipt (80mm) Z-Report Print View ─────────── */}
      {showPrintView && (activeZReport || selectedHistoryReport) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-sm w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-600" />
                Z-Report (80mm Thermal Receipt)
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                onClick={() => {
                  setShowPrintView(false)
                  setActiveZReport(null)
                  setSelectedHistoryReport(null)
                }}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Thermal Receipt Container */}
            {(() => {
              const report = (activeZReport || selectedHistoryReport)!
              return (
                <div className="p-4 bg-gray-100 flex justify-center">
                  <div
                    id="z-report-thermal-receipt"
                    className="w-[80mm] bg-white text-black p-4 font-mono text-xs leading-tight shadow-md border border-gray-200 rounded"
                  >
                    <div className="text-center mb-3">
                      <div className="font-bold text-sm tracking-tight">{report.company_name}</div>
                      <div className="text-[11px] text-gray-600">{report.branch_name}</div>
                      <div className="text-[11px] font-bold mt-1 uppercase">POS RECONCILIATION Z-REPORT</div>
                      <div className="border-b border-dashed border-black my-2" />
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>Terminal:</span>
                        <strong className="font-bold">{report.terminal_name}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Cashier:</span>
                        <span>{report.cashier_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Opened:</span>
                        <span>{new Date(report.opened_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Closed:</span>
                        <span>{new Date(report.closed_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    </div>

                    <div className="border-b border-dashed border-black my-2" />

                    <div className="font-bold text-[11px] mb-1">SALES SUMMARY</div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>Cash Sales:</span>
                        <span>{cash(report.total_sales_cash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Card Sales:</span>
                        <span>{cash(report.total_sales_card)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cheque Sales:</span>
                        <span>{cash(report.total_sales_cheque)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Credit Sales:</span>
                        <span>{cash(report.total_sales_credit)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-dotted border-gray-400 pt-1 mt-1">
                        <span>GROSS SALES:</span>
                        <span>{cash(report.gross_sales)}</span>
                      </div>
                    </div>

                    <div className="border-b border-dashed border-black my-2" />

                    <div className="font-bold text-[11px] mb-1">DRAWER RECONCILIATION</div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>Opening Float:</span>
                        <span>{cash(report.opening_float)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>+ Cash Inflows:</span>
                        <span>{cash(report.cash_in)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>- Safe Drops/Out:</span>
                        <span>{cash(report.safe_drops + report.cash_out)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-dotted border-gray-400 pt-1 mt-1">
                        <span>EXPECTED CASH:</span>
                        <span>{cash(report.expected_cash)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>ACTUAL COUNTED:</span>
                        <span>{cash(report.counted_cash)}</span>
                      </div>
                      <div className="flex justify-between font-black text-xs pt-1">
                        <span>VARIANCE:</span>
                        <span>{report.variance >= 0 ? `+${cash(report.variance)}` : cash(report.variance)}</span>
                      </div>
                    </div>

                    {report.auto_journal_id && (
                      <div className="text-[10px] text-gray-500 mt-2 border-t border-dotted border-gray-300 pt-1">
                        Auto-Journal: {report.auto_journal_id.slice(0, 8)}... (Variance posted)
                      </div>
                    )}

                    <div className="border-b border-dashed border-black my-3" />

                    <div className="text-center text-[10px] text-gray-600 space-y-3 pt-1">
                      <div>
                        <div className="border-b border-gray-400 w-32 mx-auto mb-1" />
                        <div>Cashier Signature</div>
                      </div>
                      <div>
                        <div className="border-b border-gray-400 w-32 mx-auto mb-1" />
                        <div>Manager Signature</div>
                      </div>
                      <div className="text-[9px] text-gray-400 pt-1">Baby Bloom POS Suite • Z-Report</div>
                    </div>
                  </div>
                </div>
              )
            })()}

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                onClick={() => {
                  setShowPrintView(false)
                  setActiveZReport(null)
                  setSelectedHistoryReport(null)
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium shadow-xs transition-colors cursor-pointer"
                onClick={handlePrint}
              >
                <Printer className="w-4 h-4" />
                Print 80mm Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
