import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Calendar,
  X,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  FileSpreadsheet,
} from 'lucide-react'
import {
  fetchBankAccountsLookup,
  fetchBankStatements,
  createBankStatement,
  fetchUnreconciledGLTransactions,
  finalizeBankReconciliation,
  fetchChartOfAccounts,
} from '../services/financeService'

export function BankReconciliationPage() {
  const queryClient = useQueryClient()

  // Selected bank account
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('')
  const [selectedStatementId, setSelectedStatementId] = useState('')

  // New Statement Modal
  const [isNewStatementModalOpen, setIsNewStatementModalOpen] = useState(false)
  const [newStatementDate, setNewStatementDate] = useState(
    new Date().toISOString().split('T')[0] ?? ''
  )
  const [newOpeningBalance, setNewOpeningBalance] = useState<number>(0)
  const [newClosingBalance, setNewClosingBalance] = useState<number>(0)

  // Cleared state mapping: gl_entry_id -> { is_cleared: boolean, cleared_date: string, notes?: string }
  const [clearedMap, setClearedMap] = useState<
    Record<string, { is_cleared: boolean; cleared_date: string; notes?: string }>
  >({})

  // Lookups
  const { data: bankAccounts, isLoading: loadingBankAccounts } = useQuery({
    queryKey: ['lookup', 'bank-accounts'],
    queryFn: fetchBankAccountsLookup,
  })

  const { data: coa } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => fetchChartOfAccounts(false),
  })

  // Set active bank account
  const activeBankAccountId =
    selectedBankAccountId || (bankAccounts?.[0]?.id ?? '')

  const currentBankAccount = bankAccounts?.find((ba) => ba.id === activeBankAccountId)

  // Find associated GL account if not directly set on bank_account row
  const linkedGlAccount =
    currentBankAccount?.gl_account_id ||
    coa?.find(
      (a) =>
        a.subtype === 'bank' &&
        (a.account_name.toLowerCase().includes(currentBankAccount?.bank_name?.toLowerCase() || '') ||
          a.account_code.startsWith('1020'))
    )?.id

  // Bank statements for this account
  const {
    data: statements,
    refetch: refetchStatements,
    isRefetching,
  } = useQuery({
    queryKey: ['bank-statements', activeBankAccountId],
    queryFn: () => (activeBankAccountId ? fetchBankStatements(activeBankAccountId) : []),
    enabled: !!activeBankAccountId,
  })

  // Active statement
  const activeStatement =
    selectedStatementId && statements?.some((s) => s.id === selectedStatementId)
      ? statements.find((s) => s.id === selectedStatementId)
      : statements?.[0]

  // Unreconciled GL Transactions for this bank account up to statement date
  const { data: glTransactions, isLoading: loadingGL } = useQuery({
    queryKey: ['unreconciled-gl', linkedGlAccount, activeStatement?.statement_date],
    queryFn: () =>
      linkedGlAccount && activeStatement
        ? fetchUnreconciledGLTransactions(linkedGlAccount, activeStatement.statement_date)
        : [],
    enabled: !!linkedGlAccount && !!activeStatement,
  })

  // Create Statement Mutation
  const createStatementMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createBankStatement>[0]) =>
      createBankStatement(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['bank-statements'] })
      setIsNewStatementModalOpen(false)
      setSelectedStatementId(res.id)
      setClearedMap({})
      alert(`Bank Statement for ${res.statement_date} created!`)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create statement'
      alert(`Error: ${msg}`)
    },
  })

  // Finalize Reconciliation Mutation
  const finalizeMutation = useMutation({
    mutationFn: (payload: {
      statementId: string
      clearedItems: Array<{
        general_ledger_entry_id: string
        is_cleared: boolean
        cleared_date?: string
        notes?: string
      }>
    }) => finalizeBankReconciliation(payload.statementId, payload.clearedItems),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['bank-statements'] })
      queryClient.invalidateQueries({ queryKey: ['unreconciled-gl'] })
      alert(`Bank Reconciliation finalized successfully! Closing balance: Rs. ${res.closing_balance.toFixed(2)}`)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Finalization failed'
      alert(`Reconciliation Error: ${msg}`)
    },
  })

  // Reconciliation calculations
  const openingBal = Number(activeStatement?.opening_balance || 0)
  const statementClosing = Number(activeStatement?.closing_balance || 0)

  // Compute sum of cleared debits and credits
  let clearedDebits = 0
  let clearedCredits = 0

  if (glTransactions) {
    for (const tx of glTransactions) {
      const isCleared = clearedMap[tx.id]?.is_cleared
      if (isCleared) {
        clearedDebits += Number(tx.debit_amount || 0)
        clearedCredits += Number(tx.credit_amount || 0)
      }
    }
  }

  const calculatedBookClosing = openingBal + (clearedDebits - clearedCredits)
  const variance = Math.round(Math.abs(statementClosing - calculatedBookClosing) * 100) / 100
  const isBalanced = variance < 0.01

  // Handle toggling cleared item
  const handleToggleCleared = (txId: string, defaultDate: string) => {
    if (activeStatement?.status === 'reconciled') return
    setClearedMap((prev) => {
      const curr = prev[txId]
      const nextCleared = !curr?.is_cleared
      return {
        ...prev,
        [txId]: {
          is_cleared: nextCleared,
          cleared_date: curr?.cleared_date || defaultDate,
        },
      }
    })
  }

  // Handle Select All / Clear All
  const handleSelectAll = (select: boolean) => {
    if (!glTransactions || activeStatement?.status === 'reconciled') return
    const newMap: Record<string, { is_cleared: boolean; cleared_date: string }> = {}
    for (const tx of glTransactions) {
      newMap[tx.id] = {
        is_cleared: select,
        cleared_date: activeStatement?.statement_date || tx.entry_date,
      }
    }
    setClearedMap(newMap)
  }

  // Submit Finalize
  const handleFinalize = () => {
    if (!activeStatement) return
    if (!isBalanced) {
      alert(`Cannot finalize with unreconciled variance of Rs. ${variance.toFixed(2)}`)
      return
    }

    const items = Object.entries(clearedMap).map(([gleId, item]) => ({
      general_ledger_entry_id: gleId,
      is_cleared: item.is_cleared,
      cleared_date: item.cleared_date,
    }))

    finalizeMutation.mutate({
      statementId: activeStatement.id,
      clearedItems: items,
    })
  }

  const handleCreateStatementSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeBankAccountId) {
      alert('Please select a bank account')
      return
    }

    createStatementMutation.mutate({
      bank_account_id: activeBankAccountId,
      statement_date: newStatementDate,
      opening_balance: newOpeningBalance,
      closing_balance: newClosingBalance,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Bank Reconciliation Engine</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reconcile physical bank statements against general ledger cash/bank entries with live variance checking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchStatements()}
            disabled={isRefetching}
            className="p-2.5 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <button
            onClick={() => setIsNewStatementModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Bank Statement
          </button>
        </div>
      </div>

      {/* Bank Account Selector Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                Bank Account
              </label>
              <select
                value={activeBankAccountId}
                onChange={(e) => {
                  setSelectedBankAccountId(e.target.value)
                  setSelectedStatementId('')
                  setClearedMap({})
                }}
                className="mt-0.5 text-base font-bold text-gray-900 border-none bg-transparent focus:ring-0 cursor-pointer p-0"
                disabled={loadingBankAccounts}
              >
                {bankAccounts?.map((ba) => (
                  <option key={ba.id} value={ba.id}>
                    {ba.bank_name} &mdash; {ba.account_number} ({ba.account_name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Statement Picker */}
          {statements && statements.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Statement Date:
              </label>
              <select
                value={activeStatement?.id || ''}
                onChange={(e) => {
                  setSelectedStatementId(e.target.value)
                  setClearedMap({})
                }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-gray-50/50"
              >
                {statements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.statement_date).toLocaleDateString()} &mdash; ({s.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Reconciliation Workspace */}
      {!activeStatement ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900">No Bank Statement Selected</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Create a bank statement with the opening and closing balance from your bank statement to begin reconciliation.
          </p>
          <button
            onClick={() => setIsNewStatementModalOpen(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Statement
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary / Variance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {/* Statement Opening Balance */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Opening Balance</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                Rs. {openingBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400 mt-1">Statement baseline</p>
            </div>

            {/* Cleared Book Balance */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cleared Book Balance</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">
                Rs. {calculatedBookClosing.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                +Rs. {clearedDebits.toFixed(2)} / -Rs. {clearedCredits.toFixed(2)}
              </p>
            </div>

            {/* Statement Target Closing */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank Statement Closing</p>
              <p className="text-xl font-bold text-blue-700 mt-1">
                Rs. {statementClosing.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Date: {new Date(activeStatement.statement_date).toLocaleDateString()}
              </p>
            </div>

            {/* Variance */}
            <div
              className={`p-5 rounded-2xl border shadow-sm ${
                isBalanced
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-rose-50/70 border-rose-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-700">Variance</p>
                {isBalanced ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                )}
              </div>
              <p
                className={`text-xl font-extrabold mt-1 ${
                  isBalanced ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                Rs. {variance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-medium text-gray-600 mt-1">
                {isBalanced ? 'Reconciled (Balanced)' : 'Unreconciled Difference'}
              </p>
            </div>
          </div>

          {/* Variance Status Banner & Finalize Button */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isBalanced
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {isBalanced ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
              )}
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {isBalanced
                    ? 'Statement Reconciled to Rs. 0.00 Variance'
                    : `Unreconciled Difference of Rs. ${variance.toFixed(2)}`}
                </p>
                <p className="text-xs text-gray-600">
                  {isBalanced
                    ? 'All selected movements match the physical statement balance. You may finalize this reconciliation.'
                    : 'Select the transactions cleared on this statement. Finalization is locked until the variance reaches zero.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeStatement.status === 'reconciled' ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl">
                  <Lock className="w-4 h-4" /> Reconciled & Locked
                </span>
              ) : (
                <button
                  onClick={handleFinalize}
                  disabled={!isBalanced || finalizeMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Lock className="w-4 h-4" />
                  {finalizeMutation.isPending ? 'Finalizing...' : 'Finalize Reconciliation'}
                </button>
              )}
            </div>
          </div>

          {/* Unreconciled GL Transactions Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">General Ledger Bank Movements</h3>
                <p className="text-xs text-gray-500">
                  Transactions up to {new Date(activeStatement.statement_date).toLocaleDateString()}
                </p>
              </div>

              {activeStatement.status !== 'reconciled' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelectAll(true)}
                    className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => handleSelectAll(false)}
                    className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              {loadingGL ? (
                <div className="text-center py-12 text-sm text-gray-500">Loading ledger transactions...</div>
              ) : !glTransactions || glTransactions.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-500">
                  No GL transactions found for this bank account.
                </div>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs font-semibold uppercase text-gray-500 tracking-wider bg-gray-50/50">
                      <th className="py-3 px-4 w-12 text-center">Cleared</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Ref #</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Narration</th>
                      <th className="py-3 px-4 text-right">Debit (Deposit)</th>
                      <th className="py-3 px-4 text-right">Credit (Withdrawal)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {glTransactions.map((tx) => {
                      const isCleared = !!clearedMap[tx.id]?.is_cleared
                      return (
                        <tr
                          key={tx.id}
                          className={`transition-colors cursor-pointer ${
                            isCleared ? 'bg-emerald-50/40' : 'hover:bg-gray-50/50'
                          }`}
                          onClick={() => handleToggleCleared(tx.id, activeStatement.statement_date)}
                        >
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isCleared}
                              disabled={activeStatement.status === 'reconciled'}
                              onChange={() => handleToggleCleared(tx.id, activeStatement.statement_date)}
                              className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                            {new Date(tx.entry_date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-gray-900">
                            {tx.reference_number}
                          </td>
                          <td className="py-3 px-4">
                            <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {tx.entry_type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-700 max-w-sm truncate" title={tx.narration}>
                            {tx.narration}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {Number(tx.debit_amount) > 0 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                                Rs. {Number(tx.debit_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-gray-300">&mdash;</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {Number(tx.credit_amount) > 0 ? (
                              <span className="inline-flex items-center gap-1 text-rose-600">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                Rs. {Number(tx.credit_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-gray-300">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Statement Modal */}
      {isNewStatementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-gray-900">New Bank Statement</h3>
              </div>
              <button
                onClick={() => setIsNewStatementModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStatementSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Bank Account
                </label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900">
                  {currentBankAccount?.bank_name} &mdash; {currentBankAccount?.account_number}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Statement Date
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={newStatementDate}
                    onChange={(e) => setNewStatementDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Opening Balance (Rs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newOpeningBalance}
                  onChange={(e) => setNewOpeningBalance(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Closing Balance (Rs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newClosingBalance}
                  onChange={(e) => setNewClosingBalance(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewStatementModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createStatementMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  {createStatementMutation.isPending ? 'Creating...' : 'Create Statement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
