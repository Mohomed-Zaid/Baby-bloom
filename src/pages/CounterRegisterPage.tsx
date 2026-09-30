import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Monitor,
  PlusCircle,
  Lock,
  Unlock,
  Play,
  SquareCheck,
  DollarSign,
  RefreshCw,
  ExternalLink,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  X,
  Building,
  User,
  Receipt,
} from 'lucide-react'
import { listLookup } from '../services/masterData'
import {
  fetchPosRegisters,
  createPosRegister,
  fetchActiveShift,
  openPosShift,
  closePosShiftService,
  toggleRegisterLock,
  fetchRecentShifts,
  fetchStaffUsersForPrivilegeMatrix,
} from '../services/adminService'
import type { PosRegister } from '../types/admin'

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export const CounterRegisterPage: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // ── Global Toast ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // ── States ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'terminals' | 'history'>('terminals')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [selectedRegister, setSelectedRegister] = useState<PosRegister | null>(null)
  const [isCreatingRegister, setIsCreatingRegister] = useState(false)
  const [historySearch, setHistorySearch] = useState('')

  // ── Open Shift Form States ────────────────────────────────────────────────
  const [openingBalance, setOpeningBalance] = useState<number>(5000)
  const [selectedCashierId, setSelectedCashierId] = useState<string>('')
  const [openShiftNotes, setOpenShiftNotes] = useState('')

  // ── Close Shift Form States ───────────────────────────────────────────────
  const [closingActual, setClosingActual] = useState<string>('')
  const [closeShiftNotes, setCloseShiftNotes] = useState('')

  // ── Create Register Form States ───────────────────────────────────────────
  const [newRegBranchId, setNewRegBranchId] = useState('')
  const [newRegCode, setNewRegCode] = useState('')
  const [newRegName, setNewRegName] = useState('')

  // ── Lookups ───────────────────────────────────────────────────────────────
  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => (await listLookup('branches', 'name')) || [],
  })

  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-lookup-for-shifts'],
    queryFn: () => fetchStaffUsersForPrivilegeMatrix(),
  })

  // Automatically pick cashier if empty
  React.useEffect(() => {
    if (!selectedCashierId && staffList.length > 0) {
      setSelectedCashierId(staffList[0]?.value || '')
    }
  }, [staffList, selectedCashierId])

  // ── Load Registers ────────────────────────────────────────────────────────
  const {
    data: registers = [],
    isLoading: loadingRegisters,
    isFetching: fetchingRegisters,
    refetch: refetchRegisters,
  } = useQuery({
    queryKey: ['pos-registers', selectedBranchId],
    queryFn: () => fetchPosRegisters(selectedBranchId || undefined),
  })

  // Automatically select first register if none selected
  React.useEffect(() => {
    if (!selectedRegister && registers.length > 0) {
      setSelectedRegister(registers[0] || null)
    } else if (selectedRegister) {
      const refreshed = registers.find((r) => r.id === selectedRegister.id)
      if (refreshed) setSelectedRegister(refreshed)
    }
  }, [registers, selectedRegister])

  // ── Load Active Shift for Selected Register ───────────────────────────────
  const {
    data: activeShift,
    isLoading: loadingShift,
    refetch: refetchShift,
  } = useQuery({
    queryKey: ['pos-shift-active', selectedRegister?.id],
    queryFn: () => fetchActiveShift(selectedRegister!.id),
    enabled: !!selectedRegister,
  })

  // Pre-fill closing balance with expected whenever shift loads
  React.useEffect(() => {
    if (activeShift) {
      const expected = (activeShift.opening_balance || 0) + (activeShift.cash_sales || 0)
      setClosingActual(expected.toFixed(2))
    } else {
      setClosingActual('')
    }
  }, [activeShift])

  // ── Load Shift History ────────────────────────────────────────────────────
  const {
    data: recentShifts = [],
    isLoading: loadingHistory,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['pos-shift-history', selectedBranchId],
    queryFn: () => fetchRecentShifts(selectedBranchId || undefined, 40),
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createRegisterMutation = useMutation({
    mutationFn: createPosRegister,
    onSuccess: (newReg) => {
      queryClient.invalidateQueries({ queryKey: ['pos-registers'] })
      setIsCreatingRegister(false)
      setNewRegCode('')
      setNewRegName('')
      setSelectedRegister(newReg)
      notify('Counter register created successfully!')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to create register', true)
    },
  })

  const lockToggleMutation = useMutation({
    mutationFn: async ({ registerId, isLocked }: { registerId: string; isLocked: boolean }) => {
      await toggleRegisterLock(registerId, isLocked)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pos-registers'] })
      notify(variables.isLocked ? 'Counter locked.' : 'Counter unlocked and available!')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to toggle register lock', true)
    },
  })

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRegister) return
      const cashierId = selectedCashierId || staffList[0]?.value || '00000000-0000-0000-0000-000000000000'
      await openPosShift(
        { register_id: selectedRegister.id, opening_balance: openingBalance, notes: openShiftNotes || undefined },
        cashierId,
        selectedRegister.branch_id
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-shift-active', selectedRegister?.id] })
      queryClient.invalidateQueries({ queryKey: ['pos-registers'] })
      queryClient.invalidateQueries({ queryKey: ['pos-shift-history'] })
      setOpenShiftNotes('')
      notify('Register shift session opened successfully!')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to open shift', true)
    },
  })

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!activeShift) return
      const actualVal = parseFloat(closingActual)
      if (isNaN(actualVal) || actualVal < 0) {
        throw new Error('Please enter a valid closing drawer cash count')
      }
      return await closePosShiftService({
        shift_id: activeShift.id,
        closing_balance_actual: actualVal,
        notes: closeShiftNotes || undefined,
      })
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pos-shift-active', selectedRegister?.id] })
      queryClient.invalidateQueries({ queryKey: ['pos-registers'] })
      queryClient.invalidateQueries({ queryKey: ['pos-shift-history'] })
      setCloseShiftNotes('')
      setClosingActual('')
      if (res) {
        notify(
          `Shift closed! Expected: LKR ${formatCurrency(res.expected)} | Actual: LKR ${formatCurrency(
            res.actual
          )} | Variance: LKR ${formatCurrency(res.variance)}`
        )
      } else {
        notify('Shift session closed and drawer reconciled!')
      }
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to close shift session', true)
    },
  })

  // ── Live Calculation: Expected & Variance ─────────────────────────────────
  const expectedDrawerBalance = useMemo(() => {
    if (!activeShift) return 0
    return (activeShift.opening_balance || 0) + (activeShift.cash_sales || 0)
  }, [activeShift])

  const countedVariance = useMemo(() => {
    const act = parseFloat(closingActual)
    if (isNaN(act)) return 0
    return act - expectedDrawerBalance
  }, [closingActual, expectedDrawerBalance])

  // ── KPI Summary Calculations ──────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalRegisters = registers.length
    const activeRegisters = registers.filter((r) => !r.is_locked).length
    const lockedRegisters = registers.filter((r) => r.is_locked).length

    // Active shifts from history that are status 'open'
    const openShifts = recentShifts.filter((s) => s.status === 'open')
    const activeFloat = openShifts.reduce((sum, s) => sum + (s.opening_balance || 0), 0)
    const todayCashSales = openShifts.reduce((sum, s) => sum + (s.cash_sales || 0), 0)
    const todayCardSales = openShifts.reduce((sum, s) => sum + (s.card_sales || 0), 0)
    const todayTotalCollections = todayCashSales + todayCardSales

    return {
      totalRegisters,
      activeRegisters,
      lockedRegisters,
      openShiftCount: openShifts.length,
      activeFloat,
      todayTotalCollections,
      todayCashSales,
      todayCardSales,
    }
  }, [registers, recentShifts])

  // ── Filtered History ──────────────────────────────────────────────────────
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return recentShifts
    const q = historySearch.toLowerCase()
    return recentShifts.filter(
      (s) =>
        (s.register_name && s.register_name.toLowerCase().includes(q)) ||
        (s.cashier_name && s.cashier_name.toLowerCase().includes(q)) ||
        (s.notes && s.notes.toLowerCase().includes(q))
    )
  }, [recentShifts, historySearch])

  // ── Export History to CSV ─────────────────────────────────────────────────
  const handleExportHistoryCsv = () => {
    if (filteredHistory.length === 0) {
      notify('No shift history to export', true)
      return
    }
    const headers = [
      'Register',
      'Cashier',
      'Opened At',
      'Closed At',
      'Opening Float (LKR)',
      'Cash Sales (LKR)',
      'Card Sales (LKR)',
      'Expected (LKR)',
      'Actual (LKR)',
      'Variance (LKR)',
      'Status',
      'Notes',
    ]
    const rows = filteredHistory.map((s) => [
      `"${s.register_name || ''}"`,
      `"${s.cashier_name || ''}"`,
      s.opened_at,
      s.closed_at || '',
      s.opening_balance.toFixed(2),
      s.cash_sales.toFixed(2),
      s.card_sales.toFixed(2),
      s.closing_balance_expected.toFixed(2),
      s.closing_balance_actual.toFixed(2),
      (s.closing_balance_actual - s.closing_balance_expected).toFixed(2),
      s.status,
      `"${(s.notes || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `pos_shift_audit_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notify('Shift history exported to CSV')
  }

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* ── TOAST NOTIFICATION ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 transition-all duration-300 ${
            toast.isError
              ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
              : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
          }`}
        >
          {toast.isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <Monitor className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Branch Register & Shift Administration
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Counter Terminals & Shift Operations
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Manage POS counter registers, shift opening floats, drawer cash drops and end-of-shift reconciliations
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              refetchRegisters()
              refetchShift()
              refetchHistory()
            }}
            disabled={fetchingRegisters}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingRegisters ? 'animate-spin text-[#38d4c5]' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => navigate('/sales/pos')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            POS Invoice
          </button>

          <button
            onClick={() => navigate('/pos/shift')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Cash Drawer
          </button>

          <button
            onClick={() => {
              setNewRegBranchId(selectedBranchId || branches[0]?.value || '')
              setIsCreatingRegister(true)
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
          >
            <PlusCircle className="w-4 h-4" />
            Add Register Counter
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Registers */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">POS Terminals</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5]">
              <Monitor className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {kpis.totalRegisters}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5 flex justify-between">
            <span className="text-emerald-400 font-semibold">{kpis.activeRegisters} Available</span>
            <span className="text-rose-400">{kpis.lockedRegisters} Locked</span>
          </div>
        </div>

        {/* 2. Active Shifts */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Active Shift Sessions</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-emerald-400 tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              {kpis.openShiftCount} Open
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            Drawers currently unsealed & operating
          </div>
        </div>

        {/* 3. Total Vault Float */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Deployed Opening Float</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-amber-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              LKR {formatCurrency(kpis.activeFloat)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            Issued cash floats across live drawers
          </div>
        </div>

        {/* 4. Active Shift Collections */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Live Shift Collections</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5]">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-[#38d4c5] tracking-tight">
              LKR {formatCurrency(kpis.todayTotalCollections)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5 flex justify-between">
            <span>Cash: {formatCurrency(kpis.todayCashSales)}</span>
            <span>Card: {formatCurrency(kpis.todayCardSales)}</span>
          </div>
        </div>
      </div>

      {/* ── TABS NAVIGATION ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[#164e48] pb-1">
        <button
          onClick={() => setActiveTab('terminals')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'terminals'
              ? 'border-[#38d4c5] text-[#38d4c5] bg-[#0c2e2a]/50'
              : 'border-transparent text-[#7aa5a0] hover:text-white'
          }`}
        >
          <Monitor className="w-4 h-4" />
          Terminal Counters & Live Shift
          <span className="px-2 py-0.5 text-xs rounded-full bg-[#113e3a] text-[#38d4c5] font-mono">
            {registers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'history'
              ? 'border-[#38d4c5] text-[#38d4c5] bg-[#0c2e2a]/50'
              : 'border-transparent text-[#7aa5a0] hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          Shift Session Audit History
          <span className="px-2 py-0.5 text-xs rounded-full bg-[#113e3a] text-[#38d4c5] font-mono">
            {recentShifts.length}
          </span>
        </button>
      </div>

      {/* ── TAB 1: TERMINAL COUNTERS & LIVE SHIFT ────────────────────────────── */}
      {activeTab === 'terminals' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Register Terminals List */}
          <div className="lg:col-span-1 bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-5 space-y-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 border-b border-[#164e48]">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-[#38d4c5]" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  POS Counters ({registers.length})
                </h2>
              </div>

              {/* Branch Filter dropdown */}
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="px-2.5 py-1 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            {loadingRegisters ? (
              <div className="p-8 text-center text-[#7aa5a0]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#38d4c5] mb-2" />
                <p className="text-xs">Loading registers...</p>
              </div>
            ) : registers.length === 0 ? (
              <div className="p-8 text-center text-[#7aa5a0]">
                <Monitor className="w-8 h-8 mx-auto text-[#164e48] mb-2" />
                <p className="text-sm font-medium text-white">No Counters Defined</p>
                <p className="text-xs mt-1">Click "Add Register Counter" to register your first POS station.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                {registers.map((reg) => {
                  const isSelected = selectedRegister?.id === reg.id
                  return (
                    <div
                      key={reg.id}
                      onClick={() => setSelectedRegister(reg)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#38d4c5] bg-[#0c2e2a] shadow-md shadow-[#38d4c5]/10'
                          : 'border-[#164e48]/70 hover:border-[#164e48] bg-[#082824]/60 hover:bg-[#0a2e2a]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{reg.name}</span>
                        <span className="text-xs font-mono bg-[#113e3a] text-[#38d4c5] px-2 py-0.5 rounded border border-[#164e48]">
                          {reg.register_code}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-xs text-[#7aa5a0]">
                        <span className="flex items-center gap-1">
                          <Building className="w-3 h-3 text-[#7aa5a0]" />
                          {reg.branch_name || 'Main Branch'}
                        </span>

                        <div className="flex items-center gap-2">
                          {reg.is_locked ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <Unlock className="w-3 h-3" /> Available
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              lockToggleMutation.mutate({
                                registerId: reg.id,
                                isLocked: !reg.is_locked,
                              })
                            }}
                            className="p-1 rounded text-[#7aa5a0] hover:text-white hover:bg-[#12423c] transition-colors"
                            title={reg.is_locked ? 'Unlock Counter' : 'Lock Counter'}
                          >
                            {reg.is_locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Terminal & Live Drawer Operations */}
          <div className="lg:col-span-2 bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-6 shadow-sm backdrop-blur-md">
            {!selectedRegister ? (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-6 text-[#7aa5a0]">
                <Monitor className="w-12 h-12 mb-3 text-[#164e48]" />
                <p className="text-base font-semibold text-white">Select a POS Counter Terminal</p>
                <p className="text-xs text-[#7aa5a0] max-w-sm mt-1">
                  Choose a register from the left panel to inspect live drawer sales, launch shift sessions, or execute cash drop reconciliations.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Register Header Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#164e48]">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-bold text-white">{selectedRegister.name}</h2>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                        {selectedRegister.register_code}
                      </span>
                    </div>
                    <p className="text-xs text-[#7aa5a0] mt-0.5">
                      Branch: <span className="text-white font-medium">{selectedRegister.branch_name || 'Main Branch'}</span>
                    </p>
                  </div>

                  <div>
                    {activeShift ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-full uppercase tracking-wider">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Shift LIVE (OPEN)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-500/15 text-slate-300 border border-slate-500/30 text-xs font-bold rounded-full uppercase tracking-wider">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Shift CLOSED
                      </span>
                    )}
                  </div>
                </div>

                {/* Active Shift or Open Shift Form */}
                {loadingShift ? (
                  <div className="p-12 text-center text-[#7aa5a0]">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#38d4c5] mb-2" />
                    <p className="text-xs">Checking register shift session...</p>
                  </div>
                ) : activeShift ? (
                  /* ── LIVE OPEN SHIFT PANEL ────────────────────────────────── */
                  <div className="space-y-6">
                    {/* Shift Metadata Banner */}
                    <div className="p-3.5 bg-[#0a2724] border border-[#164e48] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-white">
                        <User className="w-3.5 h-3.5 text-[#38d4c5]" />
                        <span>Cashier: <strong className="text-[#38d4c5]">{activeShift.cashier_name || 'Authorized Cashier'}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 text-[#7aa5a0]">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Opened: <strong className="text-white font-mono">{formatDateTime(activeShift.opened_at)}</strong></span>
                      </div>
                    </div>

                    {/* Financial Metrics Tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                      <div className="p-3.5 bg-[#082824] rounded-xl border border-[#164e48]">
                        <div className="text-[11px] font-semibold text-[#7aa5a0] uppercase tracking-wider">Opening Float</div>
                        <div className="text-base font-mono font-bold text-white mt-1">
                          LKR {formatCurrency(activeShift.opening_balance)}
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#082824] rounded-xl border border-[#164e48]">
                        <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Cash Sales</div>
                        <div className="text-base font-mono font-bold text-emerald-300 mt-1">
                          LKR {formatCurrency(activeShift.cash_sales)}
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#082824] rounded-xl border border-[#164e48]">
                        <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">Card Sales</div>
                        <div className="text-base font-mono font-bold text-blue-300 mt-1">
                          LKR {formatCurrency(activeShift.card_sales)}
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#082824] rounded-xl border border-[#164e48]">
                        <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Cheque Sales</div>
                        <div className="text-base font-mono font-bold text-amber-300 mt-1">
                          LKR {formatCurrency(activeShift.cheque_sales)}
                        </div>
                      </div>
                    </div>

                    {/* Drawer Reconciliation & Closing Box */}
                    <div className="p-5 bg-[#0a2f2b]/70 border border-[#164e48] rounded-xl space-y-4">
                      <div className="flex items-center justify-between border-b border-[#164e48] pb-3">
                        <div>
                          <span className="text-xs uppercase font-semibold text-[#7aa5a0] tracking-wider block">
                            Expected Cash Drawer Total
                          </span>
                          <span className="text-[11px] text-[#7aa5a0]">Opening Float + Cash Sales</span>
                        </div>
                        <span className="text-xl font-mono font-bold text-emerald-400">
                          LKR {formatCurrency(expectedDrawerBalance)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-white mb-1.5">
                            Actual Cash Counted in Drawer (LKR) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={closingActual}
                            onChange={(e) => setClosingActual(e.target.value)}
                            placeholder="Enter actual physical cash..."
                            className="w-full px-3.5 py-2.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-white font-mono text-base font-bold focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                          />
                        </div>

                        {/* Calculated Variance */}
                        <div>
                          <label className="block text-xs font-semibold text-[#7aa5a0] mb-1.5">
                            Reconciliation Variance
                          </label>
                          <div
                            className={`w-full px-3.5 py-2.5 rounded-lg border font-mono text-base font-bold flex items-center justify-between ${
                              countedVariance === 0
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : countedVariance > 0
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            }`}
                          >
                            <span>
                              {countedVariance === 0
                                ? 'BALANCED'
                                : countedVariance > 0
                                ? 'SURPLUS'
                                : 'SHORTAGE'}
                            </span>
                            <span>{formatCurrency(countedVariance)}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#7aa5a0] mb-1.5">
                          Shift Closing Notes / Handover Memo:
                        </label>
                        <input
                          type="text"
                          value={closeShiftNotes}
                          onChange={(e) => setCloseShiftNotes(e.target.value)}
                          placeholder="e.g. Cash count verified by shift manager. Excess coins deposited to vault."
                          className="w-full px-3.5 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                        />
                      </div>

                      <button
                        onClick={() => closeShiftMutation.mutate()}
                        disabled={closeShiftMutation.isPending || !closingActual}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
                      >
                        <SquareCheck className="w-5 h-5" />
                        {closeShiftMutation.isPending ? 'Reconciling & Closing...' : 'Close Shift & Reconcile Cash Drawer'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── START SHIFT FORM ─────────────────────────────────────── */
                  <div className="p-6 bg-[#082824] rounded-xl border border-[#164e48] space-y-5">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-[#164e48]">
                      <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5]">
                        <Play className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">Open New Register Shift Session</h3>
                        <p className="text-xs text-[#7aa5a0]">Assign an authorized cashier and initialize the opening cash float</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Cashier Assignment */}
                      <div>
                        <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                          Assigned Cashier / Staff *
                        </label>
                        <select
                          value={selectedCashierId}
                          onChange={(e) => setSelectedCashierId(e.target.value)}
                          className="w-full px-3.5 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                        >
                          {staffList.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Opening Balance Float */}
                      <div>
                        <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                          Opening Float / Initial Drawer Cash (LKR) *
                        </label>
                        <input
                          type="number"
                          step="100"
                          min="0"
                          value={openingBalance}
                          onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                          className="w-full px-3.5 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                        />

                        {/* Quick Float Presets */}
                        <div className="flex items-center gap-1.5 mt-2">
                          {[2000, 5000, 10000, 20000].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setOpeningBalance(preset)}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
                            >
                              +{preset / 1000}k
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Shift Notes */}
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                          Shift Identification Notes
                        </label>
                        <input
                          type="text"
                          value={openShiftNotes}
                          onChange={(e) => setOpenShiftNotes(e.target.value)}
                          placeholder="e.g. Morning Shift - Floor Counter Float verified"
                          className="w-full px-3.5 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => openShiftMutation.mutate()}
                      disabled={openShiftMutation.isPending || openingBalance < 0}
                      className="w-full py-3 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-md shadow-[#00b4d8]/20 disabled:opacity-50 transition-all"
                    >
                      <DollarSign className="w-5 h-5" />
                      {openShiftMutation.isPending ? 'Opening Register...' : 'Open Register Shift'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: SHIFT SESSION AUDIT HISTORY ────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <History className="w-4 h-4 text-[#38d4c5]" />
              <span className="text-xs uppercase font-semibold text-[#7aa5a0] tracking-wider">
                Historical Register Sessions & Drawer Audits
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history by cashier, terminal, or memo..."
                className="px-3.5 py-1.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white placeholder-[#7aa5a0] focus:outline-none focus:ring-1 focus:ring-[#38d4c5] w-64"
              />

              <button
                onClick={handleExportHistoryCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
                title="Export shift audit history to CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {/* History Table */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl overflow-hidden shadow-sm backdrop-blur-md">
            {loadingHistory ? (
              <div className="p-12 text-center text-[#7aa5a0]">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#38d4c5] mb-2" />
                <p className="text-sm">Loading shift session audits...</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-[#7aa5a0]">
                <History className="w-10 h-10 mx-auto text-[#164e48] mb-3" />
                <p className="text-base font-semibold text-white">No Shift Sessions Found</p>
                <p className="text-xs text-[#7aa5a0] mt-1">
                  Completed register shift sessions and cash reconciliations will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-[#082824] text-[#7aa5a0] text-xs uppercase tracking-wider font-semibold border-b border-[#164e48]">
                    <tr>
                      <th className="px-5 py-3">Register</th>
                      <th className="px-5 py-3">Cashier</th>
                      <th className="px-5 py-3">Session Window</th>
                      <th className="px-5 py-3 text-right">Opening Float</th>
                      <th className="px-5 py-3 text-right">Cash Collections</th>
                      <th className="px-5 py-3 text-right">Expected Drawer</th>
                      <th className="px-5 py-3 text-right">Actual Counted</th>
                      <th className="px-5 py-3 text-center">Variance</th>
                      <th className="px-5 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#164e48]/50 text-[#e2f1ef]">
                    {filteredHistory.map((s) => {
                      const variance = s.closing_balance_actual - s.closing_balance_expected
                      return (
                        <tr key={s.id} className="hover:bg-[#0a2e2a]/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="font-bold text-white">{s.register_name || 'Counter'}</span>
                          </td>

                          <td className="px-5 py-3.5 font-medium text-[#38d4c5]">
                            {s.cashier_name || 'Staff User'}
                          </td>

                          <td className="px-5 py-3.5 font-mono text-xs text-[#7aa5a0] whitespace-nowrap">
                            <div>{formatDateTime(s.opened_at)}</div>
                            {s.closed_at && <div className="text-[11px] text-white">to {formatDateTime(s.closed_at)}</div>}
                          </td>

                          <td className="px-5 py-3.5 text-right font-mono text-white whitespace-nowrap">
                            {formatCurrency(s.opening_balance)}
                          </td>

                          <td className="px-5 py-3.5 text-right font-mono text-emerald-400 whitespace-nowrap">
                            {formatCurrency(s.cash_sales)}
                          </td>

                          <td className="px-5 py-3.5 text-right font-mono text-white whitespace-nowrap font-semibold">
                            {formatCurrency(s.closing_balance_expected || s.opening_balance + s.cash_sales)}
                          </td>

                          <td className="px-5 py-3.5 text-right font-mono text-white whitespace-nowrap font-bold">
                            {s.status === 'open' ? 'In Session' : formatCurrency(s.closing_balance_actual)}
                          </td>

                          <td className="px-5 py-3.5 text-center whitespace-nowrap">
                            {s.status === 'open' ? (
                              <span className="text-xs text-[#7aa5a0]">—</span>
                            ) : variance === 0 ? (
                              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                0.00
                              </span>
                            ) : variance > 0 ? (
                              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                                +{formatCurrency(variance)}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                                {formatCurrency(variance)}
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-3.5 text-center whitespace-nowrap">
                            {s.status === 'open' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                OPEN
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-slate-400 bg-slate-500/10 px-2.5 py-0.5 rounded-full border border-slate-500/30">
                                CLOSED
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE REGISTER COUNTER ───────────────────────────────────── */}
      {isCreatingRegister && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#082321] border border-[#164e48] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl text-[#e2f1ef]">
            <div className="flex items-center justify-between border-b border-[#164e48] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5] border border-[#164e48]">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Create POS Counter Terminal</h3>
                  <p className="text-xs text-[#7aa5a0]">Define a new physical cashier station or checkout counter</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreatingRegister(false)}
                className="p-1 rounded-lg text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Target Branch *</label>
                <select
                  value={newRegBranchId}
                  onChange={(e) => setNewRegBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Register Code *</label>
                <input
                  type="text"
                  value={newRegCode}
                  onChange={(e) => setNewRegCode(e.target.value)}
                  placeholder="e.g. REG-01 or POS-COUNTER-A"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Counter Name *</label>
                <input
                  type="text"
                  value={newRegName}
                  onChange={(e) => setNewRegName(e.target.value)}
                  placeholder="e.g. Main Ground Floor Checkout #1"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#164e48]">
              <button
                onClick={() => setIsCreatingRegister(false)}
                className="px-4 py-2 border border-[#164e48] rounded-lg text-sm font-medium text-[#7aa5a0] hover:bg-[#0c2e2a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const targetBranch = newRegBranchId || branches[0]?.value || '00000000-0000-0000-0000-000000000000'
                  if (!newRegCode.trim() || !newRegName.trim()) {
                    notify('Please provide Register Code and Counter Name', true)
                    return
                  }
                  createRegisterMutation.mutate({
                    branch_id: targetBranch,
                    register_code: newRegCode.trim(),
                    name: newRegName.trim(),
                    is_active: true,
                  })
                }}
                disabled={createRegisterMutation.isPending}
                className="px-5 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] rounded-lg text-sm font-bold shadow-md shadow-[#00b4d8]/20 disabled:opacity-50"
              >
                {createRegisterMutation.isPending ? 'Creating...' : 'Create Counter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default CounterRegisterPage
