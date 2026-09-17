import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, PlusCircle, Lock, Unlock, Play, SquareCheck, DollarSign } from 'lucide-react'
import { listLookup } from '../services/masterData'
import {
  fetchPosRegisters,
  createPosRegister,
  fetchActiveShift,
  openPosShift,
  closePosShiftService,
} from '../services/adminService'
import type { PosRegister } from '../types/admin'

export const CounterRegisterPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [selectedRegister, setSelectedRegister] = useState<PosRegister | null>(null)
  const [isCreatingRegister, setIsCreatingRegister] = useState(false)

  // Form states
  const [registerCode, setRegisterCode] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [openingBalance, setOpeningBalance] = useState<number>(5000)
  const [closingActual, setClosingActual] = useState<number>(0)
  const [shiftNotes, setShiftNotes] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  // Load branches
  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => {
      const list = await listLookup('branches', 'name')
      return list || []
    },
  })

  // Load registers
  const { data: registers = [], isLoading: loadingRegisters } = useQuery({
    queryKey: ['pos-registers', selectedBranchId],
    queryFn: () => fetchPosRegisters(selectedBranchId || undefined),
  })

  // Load active shift for selected register
  const { data: activeShift, isLoading: loadingShift } = useQuery({
    queryKey: ['pos-shift-active', selectedRegister?.id],
    queryFn: () => fetchActiveShift(selectedRegister!.id),
    enabled: !!selectedRegister,
  })

  // Mutations
  const createRegisterMutation = useMutation({
    mutationFn: createPosRegister,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-registers'] })
      setIsCreatingRegister(false)
      setRegisterCode('')
      setRegisterName('')
      setNotice('Counter register created successfully!')
    },
  })

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRegister) return
      // Use fallback cashier ID
      const defaultCashierId = '00000000-0000-0000-0000-000000000000'
      await openPosShift(
        { register_id: selectedRegister.id, opening_balance: openingBalance, notes: shiftNotes },
        defaultCashierId,
        selectedRegister.branch_id
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-shift-active', selectedRegister?.id] })
      setNotice('Shift session opened!')
    },
  })

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!activeShift) return
      return await closePosShiftService({ shift_id: activeShift.id, closing_balance_actual: closingActual, notes: shiftNotes })
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pos-shift-active', selectedRegister?.id] })
      setNotice(`Shift closed! Expected: LKR ${res?.expected.toFixed(2)}, Actual: LKR ${res?.actual.toFixed(2)}, Variance: LKR ${res?.variance.toFixed(2)}`)
    },
  })

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Branch Register & Shift Administration</h1>
            <p className="text-sm text-gray-500">Configure POS counter registers, shift opening balances, drawer counts and drawer reconciliation</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Filter Branch:</label>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsCreatingRegister(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow-sm"
          >
            <PlusCircle className="w-4 h-4" /> Add Register / Counter
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium rounded-xl flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">×</button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Register List */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-gray-500" /> POS Counters ({registers.length})
          </h2>

          {loadingRegisters ? (
            <p className="text-sm text-gray-500">Loading registers...</p>
          ) : registers.length === 0 ? (
            <p className="text-sm text-gray-400">No register counters defined yet.</p>
          ) : (
            <div className="space-y-2">
              {registers.map((reg) => {
                const isSelected = selectedRegister?.id === reg.id
                return (
                  <div
                    key={reg.id}
                    onClick={() => setSelectedRegister(reg)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">{reg.name}</span>
                      <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{reg.register_code}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>Branch: {reg.branch_name || 'Head Office'}</span>
                      {reg.is_locked ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <Unlock className="w-3 h-3" /> Available
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected Register / Shift Details */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          {!selectedRegister ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 text-gray-400">
              <Monitor className="w-12 h-12 mb-2 text-gray-300" />
              <p className="text-sm font-medium">Select a register counter from the left to view shift status or manage drawer sessions.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Register Header */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedRegister.name}</h2>
                  <p className="text-xs text-gray-500">Code: {selectedRegister.register_code} | Branch ID: {selectedRegister.branch_id}</p>
                </div>
                <div>
                  {activeShift ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full uppercase tracking-wider">
                      Shift OPEN
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full uppercase tracking-wider">
                      Shift CLOSED
                    </span>
                  )}
                </div>
              </div>

              {/* Active Shift Info or Open Form */}
              {loadingShift ? (
                <p className="text-sm text-gray-500">Checking shift session...</p>
              ) : activeShift ? (
                /* OPEN SHIFT PANEL */
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="text-xs font-medium text-gray-500">Opening Cash</div>
                      <div className="text-lg font-bold text-gray-900 mt-1">LKR {activeShift.opening_balance.toFixed(2)}</div>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="text-xs font-medium text-emerald-700">Cash Sales</div>
                      <div className="text-lg font-bold text-emerald-900 mt-1">LKR {activeShift.cash_sales.toFixed(2)}</div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <div className="text-xs font-medium text-blue-700">Card Sales</div>
                      <div className="text-lg font-bold text-blue-900 mt-1">LKR {activeShift.card_sales.toFixed(2)}</div>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="text-xs font-medium text-amber-700">Cheque Sales</div>
                      <div className="text-lg font-bold text-amber-900 mt-1">LKR {activeShift.cheque_sales.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="p-5 bg-slate-900 text-white rounded-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="text-sm font-medium text-slate-300">Expected Drawer Balance</span>
                      <span className="text-xl font-bold text-emerald-400">
                        LKR {(activeShift.opening_balance + activeShift.cash_sales).toFixed(2)}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-xs font-medium text-slate-300">Actual Cash Counted in Drawer:</label>
                      <input
                        type="number"
                        step="0.01"
                        value={closingActual}
                        onChange={(e) => setClosingActual(parseFloat(e.target.value) || 0)}
                        placeholder="Enter actual counted cash..."
                        className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-base focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-slate-300">Shift Closing Notes:</label>
                      <input
                        type="text"
                        value={shiftNotes}
                        onChange={(e) => setShiftNotes(e.target.value)}
                        placeholder="Any drawer discrepancies or shift comments..."
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>

                    <button
                      onClick={() => closeShiftMutation.mutate()}
                      disabled={closeShiftMutation.isPending}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-bold text-sm text-white rounded-lg flex items-center justify-center gap-2 shadow"
                    >
                      <SquareCheck className="w-5 h-5" /> Close Shift & Reconcile Drawer
                    </button>
                  </div>
                </div>
              ) : (
                /* START SHIFT FORM */
                <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Play className="w-4 h-4 text-blue-600" /> Open New Register Shift Session
                  </h3>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">Opening Float / Cash Drawer Balance (LKR):</label>
                    <input
                      type="number"
                      step="100"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">Shift Notes:</label>
                    <input
                      type="text"
                      value={shiftNotes}
                      onChange={(e) => setShiftNotes(e.target.value)}
                      placeholder="e.g. Morning shift cashier float"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>

                  <button
                    onClick={() => openShiftMutation.mutate()}
                    disabled={openShiftMutation.isPending}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm"
                  >
                    <DollarSign className="w-4 h-4" /> Open Register Shift
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {isCreatingRegister && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Create POS Counter / Register</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Branch:</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Register Code:</label>
                <input
                  type="text"
                  value={registerCode}
                  onChange={(e) => setRegisterCode(e.target.value)}
                  placeholder="REG-01"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Counter Name:</label>
                <input
                  type="text"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="Main Counter POS #1"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setIsCreatingRegister(false)}
                className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => createRegisterMutation.mutate({ branch_id: selectedBranchId, register_code: registerCode, name: registerName, is_active: true })}
                disabled={createRegisterMutation.isPending || !registerCode || !registerName || !selectedBranchId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold"
              >
                Create Counter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
