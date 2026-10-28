import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Coins,
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
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Landmark,
  Eye,
  Check,
  RefreshCw,
  X,
  CreditCard,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { listLookup } from '../services/masterData'
import { MOCK_BRANCHES } from '../services/mockData'
import {
  fetchActiveShiftSession,
  openPosShiftSession,
  recordShiftCashTransaction,
  closePosShiftSession,
  fetchShiftHistory,
  fetchShiftTransactions,
} from '../services/shiftService'
import type {
  DenominationCounts,
  ZReportData,
  PosRegisterSession,
} from '../types/shift'
import { getErrorMessage } from '../lib/errors'

const cash = (n: number) => `LKR ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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

  // ── Tab State ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')

  // ── Modal Visibility States ───────────────────────────────────────────────
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [shiftToClose, setShiftToClose] = useState<PosRegisterSession | null>(null)
  const [closeStep, setCloseStep] = useState<'count' | 'confirm'>('count')
  const [selectedShiftForDetails, setSelectedShiftForDetails] = useState<PosRegisterSession | null>(null)
  const [showA4ReportView, setShowA4ReportView] = useState(false)
  const [reportToPrint, setReportToPrint] = useState<ZReportData | null>(null)
  const [reportFormat, setReportFormat] = useState<'a4' | 'thermal'>('a4')
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  const branchOptions = useMemo(() => {
    if (branches.data && branches.data.length > 0) return branches.data
    return MOCK_BRANCHES.map((b) => ({ value: b.id, label: b.name }))
  }, [branches.data])

  // ── Form States: Open Shift ───────────────────────────────────────────────
  const [openBranchId, setOpenBranchId] = useState(branchId || 'branch-colombo')
  const [openTerminal, setOpenTerminal] = useState('Main Register / POS 01')
  const [openFloat, setOpenFloat] = useState<number>(10000)
  const [openNote, setOpenNote] = useState('')

  useEffect(() => {
    if (!openBranchId && branchOptions.length > 0 && branchOptions[0]?.value) {
      setOpenBranchId(branchOptions[0].value)
    }
  }, [branchOptions, openBranchId])

  // ── Form States: Cash Movements (Cash In / Cash Out / Cash Deposit) ───────
  const [movementKind, setMovementKind] = useState<'deposit' | 'cash_in' | 'cash_out'>('deposit')
  const [movementAmount, setMovementAmount] = useState<number>(0)
  const [movementReason, setMovementReason] = useState('')
  const [movementNotes, setMovementNotes] = useState('')

  // ── Form States: Cash-Up & Close Shift ────────────────────────────────────
  const [denominations, setDenominations] = useState<DenominationCounts>(initialDenominations)
  const [manualCountedOverride, setManualCountedOverride] = useState<number | null>(null)
  const [closeNotes, setCloseNotes] = useState('')


  const { data: activeShift, isLoading: shiftLoading } = useQuery({
    queryKey: ['active-pos-shift', branchId],
    queryFn: () => fetchActiveShiftSession(branchId || undefined),
    refetchInterval: 8000,
  })

  const { data: shiftHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['shift-history', branchId],
    queryFn: () => fetchShiftHistory(branchId || undefined, 50),
    enabled: activeTab === 'history',
  })

  // Detailed cash transactions for active shift
  const { data: activeShiftTransactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['shift-transactions', activeShift?.id],
    queryFn: () => (activeShift?.id ? fetchShiftTransactions(activeShift.id) : Promise.resolve([])),
    enabled: !!activeShift?.id && activeTab === 'current',
    refetchInterval: 8000,
  })

  // Detailed cash transactions for modal view
  const { data: detailShiftTransactions, isLoading: detailTransactionsLoading } = useQuery({
    queryKey: ['shift-detail-transactions', selectedShiftForDetails?.id],
    queryFn: () => (selectedShiftForDetails?.id ? fetchShiftTransactions(selectedShiftForDetails.id) : Promise.resolve([])),
    enabled: !!selectedShiftForDetails?.id,
  })

  // ── Elapsed Time Timer (Sri Lanka Timezone) ───────────────────────────────
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

  // ── Calculated Denomination Sum ───────────────────────────────────────────
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
  const targetShiftForClosing = shiftToClose || activeShift
  const expectedDrawerCash = targetShiftForClosing
    ? Number(
        (targetShiftForClosing as any).expected_cash ??
        (targetShiftForClosing as any).expected_cash_balance ??
        (targetShiftForClosing as any).current_drawer_cash ??
        0
      )
    : 0
  const currentVariance = effectiveCountedCash - expectedDrawerCash

  // ── Mutations ─────────────────────────────────────────────────────────────
  const openShiftMutation = useMutation({
    mutationFn: () => {
      if (activeShift?.id) {
        throw new Error('An active shift is already open for this cash drawer. Please close the active shift first.')
      }
      return openPosShiftSession({
        branch_id: openBranchId || branchId || branchOptions[0]?.value || 'branch-colombo',
        terminal_name: openTerminal,
        opening_float: Number(openFloat) || 0,
        notes: openNote.trim() || undefined,
      })
    },
    onSuccess: () => {
      notify('Shift session opened successfully! Cash drawer initialized.', 'success')
      setShowOpenModal(false)
      setOpenNote('')
      qc.invalidateQueries({ queryKey: ['active-pos-shift'] })
      qc.invalidateQueries({ queryKey: ['shift-history'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const cashMovementMutation = useMutation({
    mutationFn: () => {
      if (!activeShift?.id) throw new Error('No active shift session is open.')
      if (movementAmount <= 0) throw new Error('Amount must be greater than 0.')
      if (!movementReason.trim()) throw new Error('Reason is required.')

      const direction: 'in' | 'out' = movementKind === 'cash_in' ? 'in' : 'out'
      return recordShiftCashTransaction({
        session_id: activeShift.id,
        branch_id: activeShift.branch_id,
        transaction_type: movementKind,
        direction,
        amount: Number(movementAmount),
        reason: movementReason.trim(),
        notes: movementNotes.trim() || undefined,
        payment_method: 'cash',
      })
    },
    onSuccess: () => {
      const label =
        movementKind === 'deposit'
          ? 'Cash Deposit'
          : movementKind === 'cash_in'
          ? 'Cash In'
          : 'Cash Out'
      notify(`${label} of ${cash(movementAmount)} recorded successfully!`, 'success')
      setShowMovementModal(false)
      setMovementAmount(0)
      setMovementReason('')
      setMovementNotes('')
      qc.invalidateQueries({ queryKey: ['active-pos-shift'] })
      qc.invalidateQueries({ queryKey: ['shift-transactions'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      const targetSessionId = shiftToClose?.id || activeShift?.id
      if (!targetSessionId) throw new Error('No active shift session is selected to close.')
      if (Math.abs(currentVariance) > 0.01 && !closeNotes.trim()) {
        throw new Error('A closing note is required when there is a cash difference (shortage or overage).')
      }
      return closePosShiftSession(
        {
          session_id: targetSessionId,
          closing_cash_counted: effectiveCountedCash,
          notes: closeNotes.trim() || undefined,
        },
        denominations
      )
    },
    onSuccess: (res) => {
      notify('Shift closed & reconciled successfully. Shift Closing Report generated.', 'success')
      setShowCloseModal(false)
      setShiftToClose(null)
      setCloseStep('count')
      setReportToPrint(res.z_report)
      setShowA4ReportView(true)
      qc.invalidateQueries({ queryKey: ['active-pos-shift'] })
      qc.invalidateQueries({ queryKey: ['shift-history'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* ── Toast Notification ───────────────────────────────────────────── */}
      {notice && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 transition-all duration-300 ${
            notice.type === 'error'
              ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
              : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
          }`}
        >
          {notice.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{notice.message}</span>
        </div>
      )}

      {/* ── Top Header Bar (matches SalesInvoices / InTransitTransfers) ───── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-teal-400/80 font-semibold mb-1">
            <span>POS & Terminals</span>
            <span>/</span>
            <span className="text-teal-200">Cash Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            Shift Management & Cash Drawer
            <span className="text-xs px-2.5 py-1 rounded-md bg-[#164e48]/60 text-teal-300 font-mono font-medium border border-teal-500/30">
              Daily Register
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Live register sessions, continuous cash formula calculation, denomination counting, cash-up reconciliation, and audit log.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Tab Switcher */}
          <div className="bg-[#061e1c] border border-[#164e48] p-1 rounded-xl inline-flex gap-1">
            <button
              type="button"
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'current'
                  ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-md'
                  : 'text-teal-300/80 hover:text-white hover:bg-[#0c312e]'
              }`}
              onClick={() => setActiveTab('current')}
            >
              <Clock className="w-3.5 h-3.5" />
              Active Register
            </button>
            <button
              type="button"
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-md'
                  : 'text-teal-300/80 hover:text-white hover:bg-[#0c312e]'
              }`}
              onClick={() => setActiveTab('history')}
            >
              <History className="w-3.5 h-3.5" />
              Shift History
            </button>
          </div>

          {activeShift ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMovementKind('deposit')
                  setMovementAmount(0)
                  setMovementReason('')
                  setMovementNotes('')
                  setShowMovementModal(true)
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all cursor-pointer"
              >
                <Coins size={14} /> Quick Movement
              </button>
              <button
                type="button"
                onClick={() => {
                  setShiftToClose(null)
                  setDenominations(initialDenominations)
                  setManualCountedOverride(null)
                  setCloseNotes('')
                  setCloseStep('count')
                  setShowCloseModal(true)
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/60 transition-all cursor-pointer shadow-lg"
              >
                <Lock size={14} /> Close / Cash-Up
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowOpenModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-xs bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
            >
              <PlusCircle size={15} /> Open New Shift
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['active-pos-shift'] })
              qc.invalidateQueries({ queryKey: ['shift-history'] })
              qc.invalidateQueries({ queryKey: ['shift-transactions'] })
              notify('Refreshed register data')
            }}
            className="p-2.5 rounded-xl bg-[#061e1c] hover:bg-[#0c312e] text-teal-400 border border-[#164e48] transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── Tab 1: Current Active Register ───────────────────────────────── */}
      {activeTab === 'current' && (
        <>
          {shiftLoading ? (
            <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-12 text-center text-teal-300 font-medium backdrop-blur-md">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
              Checking register session...
            </div>
          ) : activeShift ? (
            <div className="space-y-6">
              {/* Active Shift Header Banner */}
              <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        ACTIVE SHIFT
                      </span>
                      <strong className="text-xl font-bold text-white">{activeShift.terminal_name}</strong>
                      <span className="text-xs text-teal-400/60 font-mono">ID: {activeShift.id.slice(0, 8)}...</span>
                    </div>
                    <p className="text-sm text-slate-300">
                      Cashier: <strong className="text-white">{activeShift.cashier_name || staffName}</strong> • Branch:{' '}
                      <strong className="text-teal-300">{activeShift.branch_name || 'Main Branch'}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs font-semibold text-teal-400/80 uppercase tracking-wider">Shift Duration</div>
                      <div className="text-3xl font-black font-mono text-emerald-300 tracking-tight">{elapsed}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Opened: {new Date(activeShift.opened_at).toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-4 py-2.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/60 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        setShiftToClose(null)
                        setDenominations(initialDenominations)
                        setManualCountedOverride(null)
                        setCloseNotes('')
                        setCloseStep('count')
                        setShowCloseModal(true)
                      }}
                    >
                      <Lock className="w-4 h-4" />
                      Close / Cash-Up
                    </button>
                  </div>
                </div>
              </div>

              {/* Big Expected Drawer Total Banner */}
              <div className="bg-gradient-to-br from-[#0c2e2a] via-[#061e1c] to-[#031413] border-2 border-emerald-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">
                      <Wallet className="w-4 h-4" />
                      <span>LIVE SYSTEM CASH BALANCE</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
                        Drawer Balance
                      </span>
                    </div>
                    <div className="text-4xl sm:text-5xl font-black text-emerald-300 tracking-tight font-mono">
                      {cash(activeShift.expected_cash)}
                    </div>
                    <p className="text-xs text-slate-300 mt-1.5">
                      Net physical cash expected inside the drawer right now based on active shift formula.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setMovementKind('deposit')
                        setMovementAmount(0)
                        setMovementReason('')
                        setMovementNotes('')
                        setShowMovementModal(true)
                      }}
                      className="px-4 py-2.5 bg-[#082b27] hover:bg-[#0c3b36] border border-[#164e48] text-teal-300 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Landmark className="w-4 h-4 text-teal-300" />
                      Bank / Safe Deposit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShiftToClose(null)
                        setDenominations(initialDenominations)
                        setManualCountedOverride(null)
                        setCloseNotes('')
                        setCloseStep('count')
                        setShowCloseModal(true)
                      }}
                      className="px-5 py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-950/40 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <Coins className="w-4 h-4" />
                      Count Physical Cash
                    </button>
                  </div>
                </div>
              </div>

              {/* 8 Shift Breakdown Cards (Responsive 4-Col Grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Opening Cash */}
                <div className="bg-[#061e1c]/80 border border-[#164e48] hover:border-teal-400/50 rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-semibold text-teal-300 mb-1">
                    <span>1. Opening Cash Float</span>
                    <span className="p-1 bg-[#082b27] border border-[#164e48] rounded text-teal-300">
                      <Wallet className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-xl font-bold text-white font-mono mt-1">{cash(activeShift.opening_cash)}</div>
                  <span className="text-[11px] text-slate-400 mt-1">Starting cash float</span>
                </div>

                {/* 2. Cash Sales */}
                <div className="bg-[#061e1c]/80 border border-[#164e48] hover:border-emerald-400/50 rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-400 mb-1">
                    <span>2. + Cash Sales</span>
                    <span className="p-1 bg-emerald-950/80 border border-emerald-500/40 rounded text-emerald-400">
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-xl font-bold text-emerald-300 font-mono mt-1">+{cash(activeShift.cash_sales)}</div>
                  <span className="text-[11px] text-slate-400 mt-1">Cash portion of POS receipts</span>
                </div>

                {/* 3. Customer Payments */}
                <div className="bg-[#061e1c]/80 border border-[#164e48] hover:border-cyan-400/50 rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-semibold text-cyan-300 mb-1">
                    <span>3. + Customer Payments</span>
                    <span className="p-1 bg-cyan-950/80 border border-cyan-500/40 rounded text-cyan-300">
                      <CreditCard className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-xl font-bold text-cyan-300 font-mono mt-1">+{cash(activeShift.customer_payments)}</div>
                  <span className="text-[11px] text-slate-400 mt-1">Credit invoice cash receipts</span>
                </div>

                {/* 4. Other Cash In */}
                <div className="bg-[#061e1c]/80 border border-[#164e48] hover:border-teal-400/50 rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-semibold text-teal-300 mb-1">
                    <span>4. + Other Cash In</span>
                    <span className="p-1 bg-teal-950/80 border border-teal-500/40 rounded text-teal-300">
                      <TrendingUp className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-xl font-bold text-teal-300 font-mono mt-1">+{cash(activeShift.other_cash_in)}</div>
                  <span className="text-[11px] text-slate-400 mt-1">Manual top-up or float adds</span>
                </div>

                {/* 5. Refunds */}
                <div className="bg-[#061e1c]/80 border border-[#164e48] hover:border-rose-400/50 rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-semibold text-rose-300 mb-1">
                    <span>5. - Refunds</span>
                    <span className="p-1 bg-rose-950/80 border border-rose-500/40 rounded text-rose-300">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-xl font-bold text-rose-400 font-mono mt-1">-{cash(activeShift.refunds)}</div>
                  <span className="text-[11px] text-slate-400 mt-1">Customer cash returns</span>
                </div>

                {/* 6. Expenses */}
                <div className="bg-[#061e1c]/80 border border-[#164e48] hover:border-amber-400/50 rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-300 mb-1">
                    <span>6. - Expenses</span>
                    <span className="p-1 bg-amber-950/80 border border-amber-500/40 rounded text-amber-300">
                      <TrendingDown className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-xl font-bold text-amber-400 font-mono mt-1">-{cash(activeShift.expenses)}</div>
                  <span className="text-[11px] text-slate-400 mt-1">Cash expense vouchers</span>
                </div>

                {/* 7. Cash Deposits */}
                <div className="bg-[#061e1c]/80 border border-[#164e48] hover:border-indigo-400/50 rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-semibold text-indigo-300 mb-1">
                    <span>7. - Cash Deposits</span>
                    <span className="p-1 bg-indigo-950/80 border border-indigo-500/40 rounded text-indigo-300">
                      <Landmark className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-xl font-bold text-indigo-300 font-mono mt-1">-{cash(activeShift.cash_deposits)}</div>
                  <span className="text-[11px] text-slate-400 mt-1">Transfers to safe or bank</span>
                </div>

                {/* 8. Other Cash Out */}
                <div className="bg-[#061e1c]/80 border border-[#164e48] hover:border-orange-400/50 rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-semibold text-orange-300 mb-1">
                    <span>8. - Other Cash Out</span>
                    <span className="p-1 bg-orange-950/80 border border-orange-500/40 rounded text-orange-300">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="text-xl font-bold text-orange-400 font-mono mt-1">-{cash(activeShift.other_cash_out)}</div>
                  <span className="text-[11px] text-slate-400 mt-1">Manual drawer withdrawals</span>
                </div>
              </div>

              {/* Equation Banner */}
              <div className="bg-[#031413] border border-[#164e48] p-4 rounded-2xl shadow-inner text-xs font-mono overflow-x-auto">
                <div className="text-teal-400/80 text-[10px] font-sans uppercase font-bold tracking-wider mb-2 flex items-center justify-between">
                  <span>LIVE CASH CALCULATION FORMULA</span>
                  <span className="text-emerald-400">Asia/Colombo Live System</span>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="bg-[#061e1c] border border-[#164e48] px-2.5 py-1 rounded text-slate-200">
                    Opening: <strong className="text-white">{cash(activeShift.opening_cash)}</strong>
                  </span>
                  <span className="text-emerald-400 font-bold">+</span>
                  <span className="bg-emerald-950/80 border border-emerald-800 px-2.5 py-1 rounded text-emerald-300">
                    Sales: <strong className="text-emerald-200">{cash(activeShift.cash_sales)}</strong>
                  </span>
                  <span className="text-emerald-400 font-bold">+</span>
                  <span className="bg-cyan-950/80 border border-cyan-800 px-2.5 py-1 rounded text-cyan-300">
                    Payments: <strong className="text-cyan-200">{cash(activeShift.customer_payments)}</strong>
                  </span>
                  <span className="text-emerald-400 font-bold">+</span>
                  <span className="bg-teal-950/80 border border-teal-800 px-2.5 py-1 rounded text-teal-300">
                    Cash In: <strong className="text-teal-200">{cash(activeShift.other_cash_in)}</strong>
                  </span>
                  <span className="text-rose-400 font-bold">-</span>
                  <span className="bg-rose-950/80 border border-rose-800 px-2.5 py-1 rounded text-rose-300">
                    Refunds: <strong className="text-rose-200">{cash(activeShift.refunds)}</strong>
                  </span>
                  <span className="text-rose-400 font-bold">-</span>
                  <span className="bg-amber-950/80 border border-amber-800 px-2.5 py-1 rounded text-amber-300">
                    Expenses: <strong className="text-amber-200">{cash(activeShift.expenses)}</strong>
                  </span>
                  <span className="text-rose-400 font-bold">-</span>
                  <span className="bg-indigo-950/80 border border-indigo-800 px-2.5 py-1 rounded text-indigo-300">
                    Deposits: <strong className="text-indigo-200">{cash(activeShift.cash_deposits)}</strong>
                  </span>
                  <span className="text-rose-400 font-bold">-</span>
                  <span className="bg-orange-950/80 border border-orange-800 px-2.5 py-1 rounded text-orange-300">
                    Cash Out: <strong className="text-orange-200">{cash(activeShift.other_cash_out)}</strong>
                  </span>
                  <span className="text-emerald-400 font-bold">=</span>
                  <span className="bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-bold px-3.5 py-1 rounded text-sm shadow-md">
                    Expected: {cash(activeShift.expected_cash)}
                  </span>
                </div>
              </div>

              {/* Main Content Grid: Transactions Log & Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Shift Cash Transactions Ledger */}
                <div className="lg:col-span-2 bg-[#061e1c]/80 border border-[#164e48] p-6 rounded-2xl shadow-xl backdrop-blur-md space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-teal-400" />
                        Shift Cash Ledger (Live Recorded Movements)
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        All cash-affecting sales, customer payments, refunds, expenses, and drawer movements.
                      </p>
                    </div>
                    <span className="text-xs bg-[#0c2e2a] text-teal-300 border border-[#164e48] px-3 py-1 rounded-full font-semibold">
                      {activeShiftTransactions?.length || 0} Transactions
                    </span>
                  </div>

                  {transactionsLoading ? (
                    <div className="p-8 text-center text-teal-300 text-sm">Loading cash transactions...</div>
                  ) : activeShiftTransactions && activeShiftTransactions.length > 0 ? (
                    <div className="overflow-x-auto max-h-[420px] pos-custom-scroll rounded-xl border border-[#164e48]/60">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-[#082b27] border-b border-[#164e48] text-xs font-semibold text-teal-300 uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Time</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Description / Reason</th>
                            <th className="p-3">Reference</th>
                            <th className="p-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#164e48]/40">
                          {activeShiftTransactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-[#0c312e]/50 transition-colors">
                              <td className="p-3 text-xs text-slate-300 font-mono">
                                {new Date(tx.created_at).toLocaleTimeString('en-LK', {
                                  timeZone: 'Asia/Colombo',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="p-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                    tx.direction === 'in'
                                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                                      : 'bg-rose-950/80 text-rose-400 border border-rose-500/40'
                                  }`}
                                >
                                  {tx.direction === 'in' ? '+' : '-'} {tx.transaction_type.toUpperCase().replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="p-3 font-medium text-white text-xs max-w-xs truncate" title={tx.reason}>
                                {tx.reason}
                              </td>
                              <td className="p-3 text-xs font-mono text-slate-400">
                                {tx.reference_type ? `${tx.reference_type}: ` : ''}
                                {tx.reference_id ? tx.reference_id.slice(0, 8) : '-'}
                              </td>
                              <td
                                className={`p-3 text-right font-bold text-xs font-mono ${
                                  tx.direction === 'in' ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {tx.direction === 'in' ? '+' : '-'}
                                {cash(tx.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-sm text-slate-400 bg-[#031413]/60 rounded-xl border border-[#164e48]">
                      No cash transactions recorded in this shift yet. Start ringing up sales or record a movement below.
                    </div>
                  )}
                </div>

                {/* Right Col: Drawer Quick Actions & Deposit */}
                <div className="space-y-4">
                  <div className="bg-[#061e1c]/80 border border-[#164e48] p-6 rounded-2xl shadow-xl backdrop-blur-md">
                    <h3 className="text-base font-bold text-white mb-1">Manual Cash Movements</h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Record physical drawer adjustments with mandatory reason and security audit.
                    </p>

                    <div className="space-y-2.5">
                      {/* Cash Deposit */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 p-3 bg-[#031413] hover:bg-[#0c2e2a] border border-[#164e48] hover:border-indigo-400/50 rounded-xl transition-all text-left cursor-pointer group"
                        onClick={() => {
                          setMovementKind('deposit')
                          setMovementAmount(0)
                          setMovementReason('')
                          setMovementNotes('')
                          setShowMovementModal(true)
                        }}
                      >
                        <div className="p-2.5 bg-indigo-950/80 border border-indigo-500/40 text-indigo-400 rounded-lg group-hover:scale-105 transition-transform">
                          <Landmark className="w-5 h-5" />
                        </div>
                        <div>
                          <strong className="block text-xs font-bold text-white">Cash Deposit</strong>
                          <span className="text-[11px] text-slate-400">Transfer drawer cash to safe or bank</span>
                        </div>
                      </button>

                      {/* Cash In */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 p-3 bg-[#031413] hover:bg-[#0c2e2a] border border-[#164e48] hover:border-emerald-400/50 rounded-xl transition-all text-left cursor-pointer group"
                        onClick={() => {
                          setMovementKind('cash_in')
                          setMovementAmount(0)
                          setMovementReason('')
                          setMovementNotes('')
                          setShowMovementModal(true)
                        }}
                      >
                        <div className="p-2.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 rounded-lg group-hover:scale-105 transition-transform">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                          <strong className="block text-xs font-bold text-white">Cash In (Float / Top-Up)</strong>
                          <span className="text-[11px] text-slate-400">Add emergency float or owner funds</span>
                        </div>
                      </button>

                      {/* Cash Out */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 p-3 bg-[#031413] hover:bg-[#0c2e2a] border border-[#164e48] hover:border-amber-400/50 rounded-xl transition-all text-left cursor-pointer group"
                        onClick={() => {
                          setMovementKind('cash_out')
                          setMovementAmount(0)
                          setMovementReason('')
                          setMovementNotes('')
                          setShowMovementModal(true)
                        }}
                      >
                        <div className="p-2.5 bg-amber-950/80 border border-amber-500/40 text-amber-400 rounded-lg group-hover:scale-105 transition-transform">
                          <TrendingDown className="w-5 h-5" />
                        </div>
                        <div>
                          <strong className="block text-xs font-bold text-white">Cash Out (Miscellaneous Payout)</strong>
                          <span className="text-[11px] text-slate-400">Take cash from drawer for small payment</span>
                        </div>
                      </button>

                      <hr className="my-3 border-[#164e48]" />

                      {/* Close Shift / Cash Up Trigger */}
                      <button
                        type="button"
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
                        onClick={() => {
                          setShiftToClose(null)
                          setDenominations(initialDenominations)
                          setManualCountedOverride(null)
                          setCloseNotes('')
                          setCloseStep('count')
                          setShowCloseModal(true)
                        }}
                      >
                        <Lock className="w-4 h-4" />
                        Close Shift / Cash Up
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* No Active Shift -> Prominent Open Shift Card */
            <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl shadow-2xl p-12 text-center max-w-xl mx-auto my-12 backdrop-blur-md">
              <div className="w-16 h-16 bg-[#0e3b37] border border-[#164e48] text-[#38d4c5] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Unlock className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">No Active Shift Session</h2>
              <p className="text-slate-300 text-sm max-w-md mx-auto mb-6">
                You must open a cashier shift session and specify the opening cash float before recording cash transactions or ringing up POS sales.
              </p>
              <button
                type="button"
                onClick={() => setShowOpenModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl shadow-lg shadow-emerald-950/40 font-bold text-base transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                <PlusCircle className="w-5 h-5" />
                Open Shift Now
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Tab 2: Shift History Archive ─────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="bg-[#061e1c]/80 border border-[#164e48] p-6 rounded-2xl shadow-xl backdrop-blur-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-teal-400" />
                Shift History & Daily Registers
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Past closed and automatically closed registers with full cash-up variance records and audit trail.
              </p>
            </div>
            <span className="text-xs text-teal-300/80 font-medium">Showing recent registers</span>
          </div>

          {historyLoading ? (
            <div className="p-8 text-center text-teal-300 text-sm">Loading shift history...</div>
          ) : shiftHistory && shiftHistory.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-[#164e48]/60">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#082b27] border-b border-[#164e48] font-semibold text-teal-300 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Shift ID</th>
                    <th className="p-3">Cashier</th>
                    <th className="p-3">Opened</th>
                    <th className="p-3">Closed</th>
                    <th className="p-3 text-right">Opening Cash</th>
                    <th className="p-3 text-right">Cash Sales</th>
                    <th className="p-3 text-right">Expected Cash</th>
                    <th className="p-3 text-right">Actual Cash</th>
                    <th className="p-3 text-right">Difference</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Closing Type</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#164e48]/40">
                  {shiftHistory.map((s) => {
                    const statusStr = (s.status || 'closed').toLowerCase()
                    const isAuto = s.closing_type === 'auto' || statusStr === 'auto_closed'
                    const isOpen = statusStr === 'open'
                    return (
                      <tr key={s.id} className="hover:bg-[#0c312e]/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-teal-300">{s.id.slice(0, 8)}</td>
                        <td className="p-3 text-white font-medium">{s.cashier_name || 'Staff'}</td>
                        <td className="p-3 text-slate-300">
                          {new Date(s.opened_at).toLocaleString('en-LK', {
                            timeZone: 'Asia/Colombo',
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="p-3 text-slate-300">
                          {s.closed_at
                            ? new Date(s.closed_at).toLocaleString('en-LK', {
                                timeZone: 'Asia/Colombo',
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : 'Still Open'}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-300">{cash(s.opening_cash_float)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400 font-bold">+{cash(s.total_sales_cash)}</td>
                        <td className="p-3 text-right font-mono font-bold text-teal-300">
                          {cash(s.expected_cash_balance || 0)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white">
                          {s.closing_cash_counted !== null ? cash(s.closing_cash_counted) : '—'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          {s.cash_difference === null ? (
                            <span className="text-slate-500">—</span>
                          ) : Math.abs(s.cash_difference) < 0.01 ? (
                            <span className="text-emerald-400">0.00 (Balanced)</span>
                          ) : s.cash_difference > 0 ? (
                            <span className="text-amber-400">+{cash(s.cash_difference)}</span>
                          ) : (
                            <span className="text-rose-400">{cash(s.cash_difference)}</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isOpen
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                                : 'bg-slate-800 text-slate-300 border border-slate-600/40'
                            }`}
                          >
                            {statusStr.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isAuto
                                ? 'bg-purple-950/80 text-purple-400 border border-purple-500/40'
                                : 'bg-[#0c2e2a] text-teal-300 border border-[#164e48]'
                            }`}
                          >
                            {isAuto ? 'AUTO' : 'MANUAL'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-300 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] rounded-lg transition-colors cursor-pointer"
                              onClick={() => setSelectedShiftForDetails(s)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Details
                            </button>
                            {isOpen && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                                title="Close Shift & Cash Up"
                                onClick={() => {
                                  setShiftToClose(s)
                                  setDenominations(initialDenominations)
                                  setManualCountedOverride(null)
                                  setCloseNotes('')
                                  setCloseStep('count')
                                  setShowCloseModal(true)
                                }}
                              >
                                <Lock className="w-3.5 h-3.5" />
                                Close / Cash Up
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">No historical shifts found.</div>
          )}
        </div>
      )}

      {/* ── MODAL 1: Open Shift ─────────────────────────────────────────── */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-md w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Unlock className="w-5 h-5 text-teal-400" />
                Open Cash Register Shift
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setShowOpenModal(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-[#061e1c] space-y-4">
              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1.5 uppercase tracking-wider">Branch Location</label>
                <select
                  className="w-full px-3.5 py-2.5 border border-[#164e48] rounded-xl text-sm bg-[#031413] text-white focus:border-teal-400 outline-none"
                  value={openBranchId}
                  onChange={(e) => setOpenBranchId(e.target.value)}
                >
                  {branchOptions.map((b) => (
                    <option key={b.value} value={b.value} className="bg-[#031413] text-white">
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1.5 uppercase tracking-wider">Register / Terminal</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-[#164e48] rounded-xl text-sm bg-[#031413] text-white focus:border-teal-400 outline-none"
                  value={openTerminal}
                  onChange={(e) => setOpenTerminal(e.target.value)}
                  placeholder="e.g. Main Register / POS 01"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1.5 uppercase tracking-wider">
                  Opening Cash Float ({cash(openFloat)})
                </label>
                <input
                  type="number"
                  className="w-full px-3.5 py-2.5 border border-[#164e48] rounded-xl text-sm bg-[#031413] text-white font-mono font-bold focus:border-teal-400 outline-none"
                  value={openFloat || ''}
                  onChange={(e) => setOpenFloat(Number(e.target.value))}
                  placeholder="10000"
                  min="0"
                  step="500"
                />
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {[5000, 10000, 15000, 20000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                        openFloat === preset
                          ? 'bg-[#10b981] border-[#10b981] text-white'
                          : 'bg-[#031413] border-[#164e48] text-slate-300 hover:text-white'
                      }`}
                      onClick={() => setOpenFloat(preset)}
                    >
                      LKR {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1.5 uppercase tracking-wider">Optional Shift Note</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-[#164e48] rounded-xl text-sm bg-[#031413] text-white focus:border-teal-400 outline-none"
                  value={openNote}
                  onChange={(e) => setOpenNote(e.target.value)}
                  placeholder="e.g. Morning shift starting float"
                />
              </div>

              <div className="p-3 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-teal-300 leading-relaxed">
                Opening Cash will initialize the register with Status = OPEN. Only one active shift is permitted for this drawer.
              </div>
            </div>

            <div className="p-4 bg-[#0c2e2a] border-t border-[#164e48] flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setShowOpenModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer disabled:opacity-50"
                disabled={openShiftMutation.isPending}
                onClick={() => openShiftMutation.mutate()}
              >
                {openShiftMutation.isPending ? 'Opening...' : 'Open Shift Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Manual Cash Movements (Cash In / Cash Out / Cash Deposit) ─ */}
      {showMovementModal && activeShift && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-md w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-teal-400" />
                Record Cash Movement
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setShowMovementModal(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-[#061e1c] space-y-4">
              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1.5 uppercase tracking-wider">Movement Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      movementKind === 'deposit'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                        : 'bg-[#031413] text-slate-300 border-[#164e48] hover:text-white'
                    }`}
                    onClick={() => setMovementKind('deposit')}
                  >
                    Cash Deposit
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      movementKind === 'cash_in'
                        ? 'bg-[#10b981] text-white border-[#10b981] shadow-md'
                        : 'bg-[#031413] text-slate-300 border-[#164e48] hover:text-white'
                    }`}
                    onClick={() => setMovementKind('cash_in')}
                  >
                    Cash In
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      movementKind === 'cash_out'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                        : 'bg-[#031413] text-slate-300 border-[#164e48] hover:text-white'
                    }`}
                    onClick={() => setMovementKind('cash_out')}
                  >
                    Cash Out
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1.5 uppercase tracking-wider">Amount (LKR)</label>
                <input
                  type="number"
                  className="w-full px-3.5 py-2.5 border border-[#164e48] rounded-xl text-sm bg-[#031413] text-white font-mono font-bold focus:border-teal-400 outline-none"
                  value={movementAmount || ''}
                  onChange={(e) => setMovementAmount(Number(e.target.value))}
                  placeholder="e.g. 5000"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1.5 uppercase tracking-wider">
                  Reason <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-[#164e48] rounded-xl text-sm bg-[#031413] text-white focus:border-teal-400 outline-none"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder={
                    movementKind === 'deposit'
                      ? 'e.g. Midday safe drop / Transfer to branch safe'
                      : movementKind === 'cash_in'
                      ? 'e.g. Owner added float / Change replenish'
                      : 'e.g. Emergency payout / Cleaning petty cash'
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1.5 uppercase tracking-wider">Optional Note</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-[#164e48] rounded-xl text-sm bg-[#031413] text-white focus:border-teal-400 outline-none"
                  value={movementNotes}
                  onChange={(e) => setMovementNotes(e.target.value)}
                  placeholder="Additional reference or remarks"
                />
              </div>

              <div className="p-3 bg-[#031413] rounded-xl border border-[#164e48] text-xs text-slate-300">
                User: <strong className="text-white">{staffName || currentUser?.email || 'Current User'}</strong> • Date/Time:{' '}
                <strong className="text-teal-300">{new Date().toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo' })}</strong>
              </div>
            </div>

            <div className="p-4 bg-[#0c2e2a] border-t border-[#164e48] flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setShowMovementModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer disabled:opacity-50"
                disabled={cashMovementMutation.isPending || !movementAmount || !movementReason.trim()}
                onClick={() => cashMovementMutation.mutate()}
              >
                {cashMovementMutation.isPending ? 'Recording...' : 'Record Movement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Close Shift & Cash-Up (2-Step Flow) ─────────────────── */}
      {showCloseModal && targetShiftForClosing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-rose-400" />
                  {closeStep === 'count' ? 'Cash-Up & Physical Cash Count' : 'Shift Closing Confirmation Summary'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cashier: <strong className="text-white">{targetShiftForClosing.cashier_name || staffName}</strong> • Register:{' '}
                  <strong className="text-teal-300">{targetShiftForClosing.terminal_name}</strong>
                  <span className="text-teal-400/60 font-mono ml-2">ID: {targetShiftForClosing.id.slice(0, 8)}</span>
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => {
                  setShowCloseModal(false)
                  setShiftToClose(null)
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: CASH COUNTING SCREEN */}
            {closeStep === 'count' ? (
              <div className="p-6 bg-[#061e1c] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Col: Physical Cash Count (Denominations + Direct Count) */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-teal-400" />
                    Physical Cash Count
                  </h4>

                  <div className="space-y-1.5">
                    {[
                      { key: 'note_5000' as const, label: 'LKR 5,000 Notes', mult: 5000 },
                      { key: 'note_1000' as const, label: 'LKR 1,000 Notes', mult: 1000 },
                      { key: 'note_500' as const, label: 'LKR 500 Notes', mult: 500 },
                      { key: 'note_100' as const, label: 'LKR 100 Notes', mult: 100 },
                      { key: 'note_50' as const, label: 'LKR 50 Notes', mult: 50 },
                      { key: 'note_20' as const, label: 'LKR 20 Notes', mult: 20 },
                    ].map((row) => (
                      <div key={row.key} className="flex items-center gap-2.5 bg-[#031413] p-2 rounded-xl border border-[#164e48]">
                        <span className="w-32 text-xs font-semibold text-slate-300">{row.label}</span>
                        <span className="text-slate-500">×</span>
                        <input
                          type="number"
                          className="w-16 px-2 py-1 border border-[#164e48] rounded-lg text-xs bg-[#082321] text-white text-center font-mono font-bold focus:border-teal-400 outline-none"
                          value={denominations[row.key] || ''}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0)
                            setDenominations((prev) => ({ ...prev, [row.key]: val }))
                            setManualCountedOverride(null)
                          }}
                          min="0"
                        />
                        <span className="text-slate-500">=</span>
                        <strong className="flex-1 text-right text-xs font-bold text-emerald-300 font-mono">
                          {cash(denominations[row.key] * row.mult)}
                        </strong>
                      </div>
                    ))}

                    {/* Coins */}
                    <div className="flex items-center gap-2.5 bg-[#031413] p-2 rounded-xl border border-[#164e48]">
                      <span className="w-32 text-xs font-semibold text-slate-300">Coins Total</span>
                      <span className="text-slate-500">=</span>
                      <input
                        type="number"
                        className="w-24 px-2 py-1 border border-[#164e48] rounded-lg text-xs bg-[#082321] text-white text-center font-mono font-bold focus:border-teal-400 outline-none"
                        value={denominations.coins || ''}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0)
                          setDenominations((prev) => ({ ...prev, coins: val }))
                          setManualCountedOverride(null)
                        }}
                        min="0"
                      />
                      <strong className="flex-1 text-right text-xs font-bold text-emerald-300 font-mono">
                        {cash(denominations.coins)}
                      </strong>
                    </div>
                  </div>

                  {/* Direct Count Override Option */}
                  <div>
                    <label className="block text-xs font-semibold text-teal-300 mb-1">
                      Direct Counted Cash Entry (Override)
                    </label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-[#164e48] rounded-xl text-sm bg-[#031413] text-white font-mono font-bold focus:border-teal-400 outline-none"
                      placeholder={`Calculated: ${calculatedDenomTotal}`}
                      value={manualCountedOverride !== null ? manualCountedOverride : ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value)
                        setManualCountedOverride(val)
                      }}
                    />
                  </div>

                  {/* Required Closing Note */}
                  <div>
                    <label className="block text-xs font-semibold text-teal-300 mb-1">
                      Closing Note {Math.abs(currentVariance) > 0.01 && <span className="text-rose-400 font-bold">* (Required for Difference)</span>}
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-[#164e48] rounded-xl text-xs bg-[#031413] text-white focus:border-teal-400 outline-none"
                      rows={2}
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      placeholder={
                        Math.abs(currentVariance) > 0.01
                          ? 'Explain the cash difference / variance before closing...'
                          : 'Optional closing remarks...'
                      }
                    />
                  </div>
                </div>

                {/* Right Col: Live Expected Breakdown & Difference */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                    Expected Cash vs Counted Cash
                  </h4>

                  <div className="p-4 bg-[#031413] rounded-xl border border-[#164e48] space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span>Opening Cash:</span>
                      <strong className="text-white">
                        {cash(Number((targetShiftForClosing as any).opening_cash ?? (targetShiftForClosing as any).opening_cash_float ?? 0))}
                      </strong>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>+ Cash Sales:</span>
                      <strong>
                        +{cash(Number((targetShiftForClosing as any).cash_sales ?? (targetShiftForClosing as any).total_sales_cash ?? 0))}
                      </strong>
                    </div>
                    <div className="flex justify-between text-cyan-400">
                      <span>+ Customer Payments:</span>
                      <strong>
                        +{cash(Number((targetShiftForClosing as any).customer_payments ?? (targetShiftForClosing as any).total_customer_payments_cash ?? 0))}
                      </strong>
                    </div>
                    <div className="flex justify-between text-teal-300">
                      <span>+ Other Cash In:</span>
                      <strong>
                        +{cash(Number((targetShiftForClosing as any).other_cash_in ?? (targetShiftForClosing as any).total_cash_in ?? (targetShiftForClosing as any).cash_in ?? 0))}
                      </strong>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span>- Refunds:</span>
                      <strong>
                        -{cash(Number((targetShiftForClosing as any).refunds ?? (targetShiftForClosing as any).total_refunds_cash ?? 0))}
                      </strong>
                    </div>
                    <div className="flex justify-between text-amber-400">
                      <span>- Expenses:</span>
                      <strong>
                        -{cash(Number((targetShiftForClosing as any).expenses ?? (targetShiftForClosing as any).total_expenses_cash ?? 0))}
                      </strong>
                    </div>
                    <div className="flex justify-between text-indigo-400">
                      <span>- Cash Deposits:</span>
                      <strong>
                        -{cash(Number((targetShiftForClosing as any).cash_deposits ?? (targetShiftForClosing as any).total_cash_deposits ?? (targetShiftForClosing as any).safe_drops ?? 0))}
                      </strong>
                    </div>
                    <div className="flex justify-between text-orange-400">
                      <span>- Other Cash Out:</span>
                      <strong>
                        -{cash(Number((targetShiftForClosing as any).other_cash_out ?? (targetShiftForClosing as any).total_cash_out ?? (targetShiftForClosing as any).cash_out ?? 0))}
                      </strong>
                    </div>
                    <hr className="my-2 border-[#164e48]" />
                    <div className="flex justify-between font-bold text-sm text-white">
                      <span>Expected Cash:</span>
                      <span className="text-emerald-300">{cash(expectedDrawerCash)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-sm text-white pt-1">
                      <span>Actual Cash Counted:</span>
                      <span className="text-teal-300">{cash(effectiveCountedCash)}</span>
                    </div>
                  </div>

                  {/* Difference Banner */}
                  {Math.abs(currentVariance) < 0.01 ? (
                    <div className="p-4 bg-[#062320] border border-[#164e48] rounded-xl flex items-center gap-3 text-emerald-300">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                      <div>
                        <strong className="block text-sm font-bold">Difference: LKR 0.00 (Balanced)</strong>
                        <span className="text-xs text-slate-300">Counted physical cash perfectly matches expected transactions.</span>
                      </div>
                    </div>
                  ) : currentVariance > 0 ? (
                    <div className="p-4 bg-[#261e06] border border-[#785b12] rounded-xl flex items-center gap-3 text-amber-300">
                      <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                      <div>
                        <strong className="block text-sm font-bold">Difference: +{cash(currentVariance)} (Overage)</strong>
                        <span className="text-xs text-slate-300">Physical cash exceeds expected balance. Closing note is required.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-[#26090e] border border-[#781b28] rounded-xl flex items-center gap-3 text-rose-300">
                      <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
                      <div>
                        <strong className="block text-sm font-bold">Difference: {cash(currentVariance)} (Shortage)</strong>
                        <span className="text-xs text-slate-300">Physical cash is less than expected balance. Closing note is required.</span>
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-[#031413] rounded-xl border border-[#164e48] text-xs text-slate-400 leading-relaxed">
                    The expected cash amount is calculated strictly from actual recorded transactions and will NOT be modified.
                  </div>
                </div>
              </div>
            ) : (
              /* STEP 2: CLOSE SHIFT CONFIRMATION SUMMARY */
              <div className="p-6 bg-[#061e1c] overflow-y-auto space-y-4">
                <div className="bg-[#031413] p-6 rounded-2xl border border-[#164e48] space-y-3 font-mono text-sm max-w-lg mx-auto">
                  <div className="text-center pb-2 border-b border-[#164e48]">
                    <h4 className="font-bold text-base text-white">SHIFT SUMMARY CONFIRMATION</h4>
                    <span className="text-xs text-slate-400 font-sans">Verify numbers before locking the register</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-slate-400">Cashier:</span>
                    <strong className="text-right text-white">{targetShiftForClosing.cashier_name || staffName}</strong>

                    <span className="text-slate-400">Opening Cash:</span>
                    <strong className="text-right text-white">
                      {cash(Number((targetShiftForClosing as any).opening_cash ?? (targetShiftForClosing as any).opening_cash_float ?? 0))}
                    </strong>

                    <span className="text-slate-400">Cash Sales:</span>
                    <strong className="text-right text-emerald-400">
                      +{cash(Number((targetShiftForClosing as any).cash_sales ?? (targetShiftForClosing as any).total_sales_cash ?? 0))}
                    </strong>

                    <span className="text-slate-400">Customer Payments:</span>
                    <strong className="text-right text-cyan-400">
                      +{cash(Number((targetShiftForClosing as any).customer_payments ?? (targetShiftForClosing as any).total_customer_payments_cash ?? 0))}
                    </strong>

                    <span className="text-slate-400">Refunds:</span>
                    <strong className="text-right text-rose-400">
                      -{cash(Number((targetShiftForClosing as any).refunds ?? (targetShiftForClosing as any).total_refunds_cash ?? 0))}
                    </strong>

                    <span className="text-slate-400">Expenses:</span>
                    <strong className="text-right text-amber-400">
                      -{cash(Number((targetShiftForClosing as any).expenses ?? (targetShiftForClosing as any).total_expenses_cash ?? 0))}
                    </strong>

                    <span className="text-slate-400">Deposits:</span>
                    <strong className="text-right text-indigo-400">
                      -{cash(Number((targetShiftForClosing as any).cash_deposits ?? (targetShiftForClosing as any).total_cash_deposits ?? (targetShiftForClosing as any).safe_drops ?? 0))}
                    </strong>

                    <span className="text-slate-400">Other Cash In:</span>
                    <strong className="text-right text-teal-300">
                      +{cash(Number((targetShiftForClosing as any).other_cash_in ?? (targetShiftForClosing as any).total_cash_in ?? (targetShiftForClosing as any).cash_in ?? 0))}
                    </strong>

                    <span className="text-slate-400">Other Cash Out:</span>
                    <strong className="text-right text-orange-400">
                      -{cash(Number((targetShiftForClosing as any).other_cash_out ?? (targetShiftForClosing as any).total_cash_out ?? (targetShiftForClosing as any).cash_out ?? 0))}
                    </strong>
                  </div>

                  <hr className="border-[#164e48] my-2" />

                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-slate-300">Expected Cash:</span>
                    <span className="text-emerald-300">{cash(expectedDrawerCash)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-slate-300">Actual Cash:</span>
                    <span className="text-teal-300">{cash(effectiveCountedCash)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1 border-t border-dashed border-[#164e48]">
                    <span className="text-slate-300">Difference:</span>
                    <span
                      className={
                        Math.abs(currentVariance) < 0.01
                          ? 'text-emerald-400'
                          : currentVariance > 0
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }
                    >
                      {currentVariance >= 0 ? `+${cash(currentVariance)}` : cash(currentVariance)}
                    </span>
                  </div>

                  {closeNotes && (
                    <div className="pt-2 border-t border-[#164e48] text-xs">
                      <span className="text-slate-400 block mb-0.5">Closing Note:</span>
                      <p className="bg-[#082321] p-2 rounded-xl border border-[#164e48] text-slate-200 italic">
                        "{closeNotes}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="p-4 bg-[#0c2e2a] border-t border-[#164e48] flex items-center justify-between">
              {closeStep === 'confirm' ? (
                <button
                  type="button"
                  className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  onClick={() => setCloseStep('count')}
                >
                  Back to Count
                </button>
              ) : (
                <button
                  type="button"
                  className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  onClick={() => setShowCloseModal(false)}
                >
                  Cancel
                </button>
              )}

              {closeStep === 'count' ? (
                <button
                  type="button"
                  className="px-5 py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
                  disabled={Math.abs(currentVariance) > 0.01 && !closeNotes.trim()}
                  onClick={() => {
                    if (Math.abs(currentVariance) > 0.01 && !closeNotes.trim()) {
                      notify('Please enter a closing note explaining the cash difference.', 'error')
                      return
                    }
                    setCloseStep('confirm')
                  }}
                >
                  Review Summary & Confirm
                </button>
              ) : (
                <button
                  type="button"
                  className="px-6 py-2.5 bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-950/40 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  disabled={closeShiftMutation.isPending}
                  onClick={() => closeShiftMutation.mutate()}
                >
                  <Check className="w-4 h-4" />
                  {closeShiftMutation.isPending ? 'Confirming Closure...' : 'Confirm Close Shift'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: Shift Detail Modal (with Transaction History Ledger) ─ */}
      {selectedShiftForDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-400" />
                  Shift Register Details #{selectedShiftForDetails.id.slice(0, 8)}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cashier: <strong className="text-white">{selectedShiftForDetails.cashier_name || 'Staff'}</strong> • Register:{' '}
                  <strong className="text-teal-300">{selectedShiftForDetails.terminal_name}</strong>
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setSelectedShiftForDetails(null)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 bg-[#061e1c] overflow-y-auto space-y-6">
              {/* Shift Information Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#031413] p-4 rounded-xl border border-[#164e48] text-xs">
                <div>
                  <span className="text-slate-400 block">Status:</span>
                  <span className="font-bold uppercase text-white">{selectedShiftForDetails.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Closing Type:</span>
                  <span className="font-bold uppercase text-white">{selectedShiftForDetails.closing_type || 'MANUAL'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Opened At:</span>
                  <span className="font-semibold text-teal-300">
                    {new Date(selectedShiftForDetails.opened_at).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Closed At:</span>
                  <span className="font-semibold text-teal-300">
                    {selectedShiftForDetails.closed_at
                      ? new Date(selectedShiftForDetails.closed_at).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })
                      : 'Still Open'}
                  </span>
                </div>
              </div>

              {/* Cash Summary Breakdown */}
              <div>
                <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider mb-2">Cash Summary</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48]">
                    <span className="text-slate-400 block">Opening Cash</span>
                    <strong className="text-white">{cash(selectedShiftForDetails.opening_cash_float)}</strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48] text-emerald-400">
                    <span className="block text-slate-400">Cash Sales</span>
                    <strong>+{cash(selectedShiftForDetails.total_sales_cash)}</strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48] text-cyan-400">
                    <span className="block text-slate-400">Customer Payments</span>
                    <strong>+{cash(selectedShiftForDetails.total_customer_payments_cash || 0)}</strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48] text-teal-300">
                    <span className="block text-slate-400">Other Cash In</span>
                    <strong>+{cash(selectedShiftForDetails.total_cash_in || 0)}</strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48] text-rose-400">
                    <span className="block text-slate-400">Refunds</span>
                    <strong>-{cash(selectedShiftForDetails.total_refunds_cash || 0)}</strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48] text-amber-400">
                    <span className="block text-slate-400">Expenses</span>
                    <strong>-{cash(selectedShiftForDetails.total_expenses_cash || 0)}</strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48] text-indigo-400">
                    <span className="block text-slate-400">Deposits</span>
                    <strong>-{cash(selectedShiftForDetails.total_cash_deposits || 0)}</strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48] text-orange-400">
                    <span className="block text-slate-400">Other Cash Out</span>
                    <strong>-{cash(selectedShiftForDetails.total_cash_out || 0)}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-xs">
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48]">
                    <span className="text-slate-400 block font-bold">Expected Cash</span>
                    <strong className="text-base text-emerald-300">{cash(selectedShiftForDetails.expected_cash_balance || 0)}</strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48]">
                    <span className="text-slate-400 block font-bold">Actual Counted</span>
                    <strong className="text-base text-teal-300">
                      {selectedShiftForDetails.closing_cash_counted !== null
                        ? cash(selectedShiftForDetails.closing_cash_counted)
                        : '-'}
                    </strong>
                  </div>
                  <div className="bg-[#031413] p-2.5 rounded-xl border border-[#164e48]">
                    <span className="text-slate-400 block font-bold">Difference</span>
                    <strong
                      className={`text-base ${
                        selectedShiftForDetails.cash_difference === null
                          ? 'text-slate-500'
                          : Math.abs(selectedShiftForDetails.cash_difference || 0) < 0.01
                          ? 'text-emerald-400'
                          : (selectedShiftForDetails.cash_difference || 0) > 0
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {selectedShiftForDetails.cash_difference === null
                        ? '-'
                        : (selectedShiftForDetails.cash_difference || 0) >= 0
                        ? `+${cash(selectedShiftForDetails.cash_difference || 0)}`
                        : cash(selectedShiftForDetails.cash_difference || 0)}
                    </strong>
                  </div>
                </div>

                {selectedShiftForDetails.closing_note && (
                  <div className="mt-2 p-2.5 bg-[#031413] rounded-xl border border-[#164e48] text-xs">
                    <span className="text-slate-400 font-semibold block mb-0.5">Closing Note:</span>
                    <p className="text-slate-200 italic">"{selectedShiftForDetails.closing_note}"</p>
                  </div>
                )}
              </div>

              {/* Detailed Transaction History Table */}
              <div>
                <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Transaction Ledger</span>
                  <span className="text-slate-400 font-normal">{detailShiftTransactions?.length || 0} entries</span>
                </h4>

                {detailTransactionsLoading ? (
                  <div className="p-6 text-center text-teal-300 text-xs">Loading shift transactions...</div>
                ) : detailShiftTransactions && detailShiftTransactions.length > 0 ? (
                  <div className="overflow-x-auto max-h-64 pos-custom-scroll border border-[#164e48] rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#082b27] sticky top-0 border-b border-[#164e48] text-teal-300 uppercase font-semibold">
                        <tr>
                          <th className="p-2.5">Time</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Description</th>
                          <th className="p-2.5">Reference</th>
                          <th className="p-2.5">User</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#164e48]/40 font-mono">
                        {detailShiftTransactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-[#0c312e]/50 transition-colors">
                            <td className="p-2 text-slate-300">
                              {new Date(tx.created_at).toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo' })}
                            </td>
                            <td className="p-2 font-bold uppercase">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  tx.direction === 'in' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40' : 'bg-rose-950/80 text-rose-400 border border-rose-500/40'
                                }`}
                              >
                                {tx.direction === 'in' ? '+' : '-'} {tx.transaction_type}
                              </span>
                            </td>
                            <td className="p-2 font-sans text-slate-200 max-w-xs truncate">{tx.reason}</td>
                            <td className="p-2 text-slate-400 font-sans">
                              {tx.reference_type ? `${tx.reference_type}: ` : ''}
                              {tx.reference_id ? tx.reference_id.slice(0, 8) : '-'}
                            </td>
                            <td className="p-2 font-sans text-slate-300">{tx.user_name || 'Staff'}</td>
                            <td className={`p-2 text-right font-bold ${tx.direction === 'in' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {tx.direction === 'in' ? '+' : '-'}
                              {cash(tx.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs bg-[#031413] rounded-xl border border-[#164e48]">
                    No transactions recorded for this shift.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#0c2e2a] border-t border-[#164e48] flex items-center justify-between">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setSelectedShiftForDetails(null)}
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {selectedShiftForDetails.status === 'open' && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white rounded-xl text-sm font-bold shadow-md transition-colors cursor-pointer"
                    onClick={() => {
                      const s = selectedShiftForDetails
                      setSelectedShiftForDetails(null)
                      setShiftToClose(s)
                      setDenominations(initialDenominations)
                      setManualCountedOverride(null)
                      setCloseNotes('')
                      setCloseStep('count')
                      setShowCloseModal(true)
                    }}
                  >
                    <Lock className="w-4 h-4" />
                    Close Shift / Cash Up
                  </button>
                )}

                <button
                  type="button"
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer"
                  onClick={() => {
                    const s = selectedShiftForDetails
                    setReportToPrint({
                      session_id: s.id,
                      company_name: 'Baby Bloom',
                      branch_name: s.branch_name || 'Main Branch',
                      terminal_name: s.terminal_name,
                      cashier_name: s.cashier_name || 'Cashier',
                      opened_at: s.opened_at,
                      closed_at: s.closed_at || new Date().toISOString(),
                      opening_float: s.opening_cash_float,
                      cash_sales: s.total_sales_cash,
                      customer_payments: s.total_customer_payments_cash || 0,
                      other_cash_in: s.total_cash_in || 0,
                      refunds: s.total_refunds_cash || 0,
                      expenses: s.total_expenses_cash || 0,
                      cash_deposits: s.total_cash_deposits || 0,
                      other_cash_out: s.total_cash_out || 0,
                      total_sales_cash: s.total_sales_cash,
                      total_sales_card: s.total_sales_card,
                      total_sales_cheque: s.total_sales_cheque,
                      total_sales_credit: s.total_sales_credit,
                      gross_sales: s.total_sales_cash + (s.total_sales_card || 0) + (s.total_sales_cheque || 0) + (s.total_sales_credit || 0),
                      cash_in: s.total_cash_in || 0,
                      cash_out: s.total_cash_out || 0,
                      safe_drops: s.total_cash_deposits || 0,
                      expected_cash: s.expected_cash_balance || 0,
                      counted_cash: s.closing_cash_counted || 0,
                      variance: s.cash_difference || 0,
                      invoice_count: 0,
                      notes: s.closing_note || s.notes,
                      closing_type: (s.closing_type as any) || 'manual',
                    })
                    setShowA4ReportView(true)
                  }}
                >
                  <Printer className="w-4 h-4" />
                  Print Shift Closing Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 5: Printable Shift Closing Report (A4 Sheet / 80mm Thermal Docket) ───── */}
      {showA4ReportView && reportToPrint && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-2xl w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#164e48] bg-[#0c2e2a] flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Printer className="w-4 h-4 text-teal-400" />
                  Shift Closing Report Preview
                </h3>
                {/* Format Toggle Buttons */}
                <div className="flex items-center bg-[#031413] border border-[#164e48] rounded-xl p-1 gap-1 text-xs font-semibold">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      reportFormat === 'a4'
                        ? 'bg-[#10b981] text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    onClick={() => setReportFormat('a4')}
                  >
                    A4 Sheet
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      reportFormat === 'thermal'
                        ? 'bg-[#10b981] text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    onClick={() => setReportFormat('thermal')}
                  >
                    80mm Thermal Docket
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => {
                  setShowA4ReportView(false)
                  setReportToPrint(null)
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Preview Container */}
            <div className="p-6 bg-slate-900/60 flex justify-center max-h-[75vh] overflow-y-auto">
              {reportFormat === 'a4' ? (
                /* ── A4 Standard Layout ────────────────────────────────────────── */
                <div
                  id="shift-closing-report-printable"
                  className="w-full bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl border border-gray-300 rounded-xl"
                >
                  {/* Header */}
                  <div className="text-center pb-4 border-b-2 border-black mb-4">
                    <h2 className="text-xl font-black uppercase tracking-wider">Baby Bloom</h2>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-gray-700">Shift Closing Report</h3>
                    <p className="text-[11px] text-gray-500 mt-1">{reportToPrint.branch_name} • POS Cash Register Reconciliation</p>
                  </div>

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-4 pb-3 border-b border-gray-200">
                    <div>
                      <span className="text-gray-600">Shift ID: </span>
                      <strong className="font-mono">{reportToPrint.session_id.slice(0, 8)}</strong>
                    </div>
                    <div>
                      <span className="text-gray-600">Date: </span>
                      <strong>{new Date(reportToPrint.opened_at).toLocaleDateString('en-LK', { timeZone: 'Asia/Colombo' })}</strong>
                    </div>
                    <div>
                      <span className="text-gray-600">Cashier: </span>
                      <strong>{reportToPrint.cashier_name}</strong>
                    </div>
                    <div>
                      <span className="text-gray-600">Terminal: </span>
                      <strong>{reportToPrint.terminal_name}</strong>
                    </div>
                    <div>
                      <span className="text-gray-600">Opened: </span>
                      <strong>{new Date(reportToPrint.opened_at).toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo' })}</strong>
                    </div>
                    <div>
                      <span className="text-gray-600">Closed: </span>
                      <strong>{new Date(reportToPrint.closed_at).toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo' })}</strong>
                    </div>
                  </div>

                  {/* Cash Reconciliation Table */}
                  <div className="mb-4">
                    <h4 className="font-bold text-xs uppercase tracking-wider mb-2 border-b border-gray-400 pb-1">
                      Cash Summary
                    </h4>
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex justify-between">
                        <span>Opening Cash</span>
                        <strong>{cash(reportToPrint.opening_float)}</strong>
                      </div>
                      <div className="flex justify-between text-emerald-800">
                        <span>+ Cash Sales</span>
                        <strong>+{cash(reportToPrint.cash_sales ?? reportToPrint.total_sales_cash)}</strong>
                      </div>
                      <div className="flex justify-between text-blue-800">
                        <span>+ Customer Payments</span>
                        <strong>+{cash(reportToPrint.customer_payments ?? 0)}</strong>
                      </div>
                      <div className="flex justify-between text-teal-800">
                        <span>+ Other Cash In</span>
                        <strong>+{cash(reportToPrint.other_cash_in ?? reportToPrint.cash_in ?? 0)}</strong>
                      </div>
                      <div className="flex justify-between text-rose-800">
                        <span>- Refunds</span>
                        <strong>-{cash(reportToPrint.refunds ?? 0)}</strong>
                      </div>
                      <div className="flex justify-between text-amber-800">
                        <span>- Expenses</span>
                        <strong>-{cash(reportToPrint.expenses ?? 0)}</strong>
                      </div>
                      <div className="flex justify-between text-indigo-800">
                        <span>- Deposits</span>
                        <strong>-{cash(reportToPrint.cash_deposits ?? reportToPrint.safe_drops ?? 0)}</strong>
                      </div>
                      <div className="flex justify-between text-orange-800">
                        <span>- Other Cash Out</span>
                        <strong>-{cash(reportToPrint.other_cash_out ?? reportToPrint.cash_out ?? 0)}</strong>
                      </div>

                      <div className="border-t-2 border-black pt-2 mt-2 flex justify-between font-black text-sm">
                        <span>Expected Cash</span>
                        <span>{cash(reportToPrint.expected_cash)}</span>
                      </div>

                      <div className="flex justify-between font-black text-sm">
                        <span>Actual Cash</span>
                        <span>{cash(reportToPrint.counted_cash)}</span>
                      </div>

                      <div className="border-t border-dashed border-gray-400 pt-1 flex justify-between font-black text-sm">
                        <span>Difference</span>
                        <span className={reportToPrint.variance < 0 ? 'text-rose-700' : reportToPrint.variance > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                          {reportToPrint.variance >= 0 ? `+${cash(reportToPrint.variance)}` : cash(reportToPrint.variance)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Closing Note */}
                  {reportToPrint.notes && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded text-xs mb-6">
                      <span className="font-bold block mb-1">Closing Note:</span>
                      <p className="italic">{reportToPrint.notes}</p>
                    </div>
                  )}

                  {/* Signatures */}
                  <div className="grid grid-cols-2 gap-12 pt-8 mt-6 border-t border-gray-300 text-center text-xs">
                    <div>
                      <div className="border-b border-black w-40 mx-auto mb-1.5" />
                      <span className="font-semibold">Cashier Signature</span>
                    </div>
                    <div>
                      <div className="border-b border-black w-40 mx-auto mb-1.5" />
                      <span className="font-semibold">Manager Signature</span>
                    </div>
                  </div>

                  <div className="text-center text-[10px] text-gray-400 mt-6 pt-3 border-t border-gray-200">
                    Baby Bloom Shift Management System • Colombo Sri Lanka
                  </div>
                </div>
              ) : (
                /* ── 80mm Continuous Thermal Docket Layout ─────────────────────── */
                <div
                  id="z-report-thermal-receipt"
                  className="thermal-receipt-docket bg-white text-black p-4 font-mono text-[11px] leading-tight shadow-2xl border border-gray-300 rounded-lg max-w-[320px] w-full"
                >
                  <div className="text-center pb-2 border-b border-dashed border-black">
                    <h2 className="text-base font-black tracking-wide">BABY BLOOM</h2>
                    <p className="text-[10px] font-bold mt-0.5">{reportToPrint.branch_name}</p>
                    <p className="text-[10px] font-bold mt-1 uppercase tracking-wider">POS SHIFT Z-REPORT</p>
                    <p className="text-[9px] text-gray-700 mt-0.5">Shift ID: #{reportToPrint.session_id.slice(0, 8)}</p>
                  </div>

                  <div className="py-2 text-[10px] space-y-0.5 border-b border-dashed border-black">
                    <div className="flex justify-between">
                      <span>Date/Time :</span>
                      <span>{new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Terminal :</span>
                      <span>{reportToPrint.terminal_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cashier :</span>
                      <span>{reportToPrint.cashier_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Opened :</span>
                      <span>{new Date(reportToPrint.opened_at).toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Closed :</span>
                      <span>{new Date(reportToPrint.closed_at).toLocaleTimeString('en-LK', { timeZone: 'Asia/Colombo' })}</span>
                    </div>
                  </div>

                  {/* Cash Drawer Reconciliation */}
                  <div className="py-2 border-b border-dashed border-black text-[10px] space-y-1">
                    <div className="font-bold uppercase tracking-wider">CASH DRAWER RECONCILIATION</div>
                    <div className="flex justify-between">
                      <span>Opening Float:</span>
                      <span>{cash(reportToPrint.opening_float)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>+ Cash Sales:</span>
                      <span>+{cash(reportToPrint.cash_sales ?? reportToPrint.total_sales_cash)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>+ Cust. Payments:</span>
                      <span>+{cash(reportToPrint.customer_payments ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>+ Cash In:</span>
                      <span>+{cash(reportToPrint.other_cash_in ?? reportToPrint.cash_in ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>- Refunds:</span>
                      <span>-{cash(reportToPrint.refunds ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>- Expenses:</span>
                      <span>-{cash(reportToPrint.expenses ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>- Safe Deposits:</span>
                      <span>-{cash(reportToPrint.cash_deposits ?? reportToPrint.safe_drops ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>- Other Cash Out:</span>
                      <span>-{cash(reportToPrint.other_cash_out ?? reportToPrint.cash_out ?? 0)}</span>
                    </div>

                    <div className="border-t border-black pt-1 mt-1 flex justify-between font-bold text-[11px]">
                      <span>EXPECTED CASH:</span>
                      <span>{cash(reportToPrint.expected_cash)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-[11px]">
                      <span>COUNTED CASH:</span>
                      <span>{cash(reportToPrint.counted_cash)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-[11px] border-t border-dotted border-black pt-0.5">
                      <span>VARIANCE:</span>
                      <span>{reportToPrint.variance >= 0 ? `+${cash(reportToPrint.variance)}` : cash(reportToPrint.variance)}</span>
                    </div>
                  </div>

                  {/* Sales by Tender */}
                  <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
                    <div className="font-bold uppercase tracking-wider">SALES BY TENDER</div>
                    <div className="flex justify-between">
                      <span>Cash Sales:</span>
                      <span>{cash(reportToPrint.total_sales_cash)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Card Sales:</span>
                      <span>{cash(reportToPrint.total_sales_card || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Credit Sales:</span>
                      <span>{cash(reportToPrint.total_sales_credit || 0)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t border-black pt-0.5 mt-0.5 text-[11px]">
                      <span>TOTAL GROSS SALES:</span>
                      <span>{cash(reportToPrint.gross_sales)}</span>
                    </div>
                  </div>

                  {reportToPrint.notes && (
                    <div className="py-2 border-b border-dashed border-black text-[10px]">
                      <span className="font-bold">Note: </span>
                      <span>{reportToPrint.notes}</span>
                    </div>
                  )}

                  <div className="pt-4 text-center text-[10px] space-y-4">
                    <div>
                      <div className="border-b border-black w-32 mx-auto mb-1" />
                      <span>Cashier Signature</span>
                    </div>
                    <div>
                      <div className="border-b border-black w-32 mx-auto mb-1" />
                      <span>Manager Signature</span>
                    </div>
                    <p className="text-[9px] text-gray-600 mt-2">Software by Baby Bloom POS</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-[#0c2e2a] border-t border-[#164e48] flex items-center justify-between no-print">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                onClick={() => {
                  setShowA4ReportView(false)
                  setReportToPrint(null)
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer"
                onClick={handlePrint}
              >
                <Printer className="w-4 h-4" />
                Print {reportFormat === 'thermal' ? '80mm Docket' : 'A4 Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
