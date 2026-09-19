import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  X,
  Building2,
  CreditCard,
  User,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react'
import {
  fetchIncomeExpenseEntries,
  createAndPostIncomeExpense,
  fetchCashAndBankAccounts,
  fetchChartOfAccounts,
} from '../services/financeService'
import { fetchBranchesLookup } from '../services/orderService'

export function DirectIncomeExpensePage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'all' | 'expense' | 'income'>('all')
  const [search, setSearch] = useState('')

  // Create Voucher Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense')
  const [branchId, setBranchId] = useState('')
  const [categoryAccountId, setCategoryAccountId] = useState('')
  const [paidThroughAccountId, setPaidThroughAccountId] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const [payeeOrPayer, setPayeeOrPayer] = useState('')
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer' | 'cheque' | 'card'>('cash')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')

  // Lookups
  const { data: branches } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  const { data: coa } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => fetchChartOfAccounts(false),
  })

  const { data: cashBankAccounts } = useQuery({
    queryKey: ['cash-bank-accounts'],
    queryFn: fetchCashAndBankAccounts,
  })

  // Filter COA categories based on selected transaction type
  const categoryAccounts = (coa || []).filter((acc) => {
    if (transactionType === 'expense') {
      return (
        acc.account_type === 'expense' ||
        acc.subtype === 'operating_expense' ||
        acc.subtype === 'admin_expense'
      )
    } else {
      return (
        acc.account_type === 'income' ||
        acc.subtype === 'direct_income' ||
        acc.subtype === 'indirect_income'
      )
    }
  })

  // Entries
  const {
    data: entries,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['income-expense-entries', activeTab],
    queryFn: () => fetchIncomeExpenseEntries(activeTab === 'all' ? undefined : activeTab, 100),
  })

  // Mutation
  const voucherMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createAndPostIncomeExpense>[0]) =>
      createAndPostIncomeExpense(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['income-expense-entries'] })
      queryClient.invalidateQueries({ queryKey: ['cash-bank-ledger'] })
      setIsModalOpen(false)
      setCategoryAccountId('')
      setPaidThroughAccountId('')
      setAmount(0)
      setPayeeOrPayer('')
      setReferenceNumber('')
      setNotes('')
      alert(`Voucher #${res.entry_number} posted with balanced GL double entries!`)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to post voucher'
      alert(`Voucher Error: ${msg}`)
    },
  })

  const activeBranchId = branchId || (branches?.[0]?.id ?? '')

  const handleOpenModal = (type: 'expense' | 'income') => {
    setTransactionType(type)
    setCategoryAccountId('')
    setPaidThroughAccountId(cashBankAccounts?.[0]?.id ?? '')
    setAmount(0)
    setPayeeOrPayer('')
    setReferenceNumber('')
    setNotes('')
    setIsModalOpen(true)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeBranchId) {
      alert('Please select a branch')
      return
    }
    if (!categoryAccountId) {
      alert('Please select an account category')
      return
    }
    if (!paidThroughAccountId) {
      alert('Please select a paid-through (Cash / Bank) account')
      return
    }
    if (amount <= 0) {
      alert('Amount must be greater than 0')
      return
    }
    if (!payeeOrPayer.trim()) {
      alert('Payee / Payer name is required')
      return
    }

    voucherMutation.mutate({
      branch_id: activeBranchId,
      transaction_type: transactionType,
      category_account_id: categoryAccountId,
      paid_through_account_id: paidThroughAccountId,
      amount,
      payee_or_payer: payeeOrPayer.trim(),
      payment_mode: paymentMode,
      reference_number: referenceNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  // Summary Metrics
  const totalExpense = (entries || [])
    .filter((e) => e.transaction_type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0)

  const totalIncome = (entries || [])
    .filter((e) => e.transaction_type === 'income')
    .reduce((sum, e) => sum + Number(e.amount), 0)

  const netCashflow = totalIncome - totalExpense

  // Filtered entries
  const filteredEntries = (entries || []).filter((e) => {
    const term = search.toLowerCase()
    return (
      e.entry_number.toLowerCase().includes(term) ||
      e.payee_or_payer.toLowerCase().includes(term) ||
      (e.category_account?.account_name && e.category_account.account_name.toLowerCase().includes(term)) ||
      (e.reference_number && e.reference_number.toLowerCase().includes(term))
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Direct Income & Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">
            Record operating expenses, utility bills, direct sundry income, and cash vouchers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2.5 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <button
            onClick={() => handleOpenModal('expense')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Record Expense
          </button>
          <button
            onClick={() => handleOpenModal('income')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Record Income
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Direct Expenses</p>
            <p className="text-2xl font-bold text-rose-600 mt-0.5">
              Rs. {totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Direct Income</p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">
              Rs. {totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              netCashflow >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {netCashflow >= 0 ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Cash Impact</p>
            <p
              className={`text-2xl font-bold mt-0.5 ${
                netCashflow >= 0 ? 'text-gray-900' : 'text-amber-700'
              }`}
            >
              Rs. {netCashflow.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                activeTab === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              All Vouchers
            </button>
            <button
              onClick={() => setActiveTab('expense')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                activeTab === 'expense'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Expenses Only
            </button>
            <button
              onClick={() => setActiveTab('income')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                activeTab === 'income'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Incomes Only
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search voucher #, payee, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-gray-50/50"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-12 text-sm text-gray-500">Loading vouchers...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500">No vouchers recorded.</div>
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold uppercase text-gray-500 tracking-wider bg-gray-50/50">
                  <th className="py-3 px-4">Voucher #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Category Account</th>
                  <th className="py-3 px-4">Paid Through</th>
                  <th className="py-3 px-4">Payee / Payer</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-gray-900">{e.entry_number}</td>
                    <td className="py-3 px-4 text-gray-600">{new Date(e.entry_date).toLocaleDateString()}</td>
                    <td className="py-3 px-4">
                      {e.transaction_type === 'expense' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700">
                          <TrendingDown className="w-3 h-3" /> Expense
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                          <TrendingUp className="w-3 h-3" /> Income
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">
                        {e.category_account?.account_name || 'Account'}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        {e.category_account?.account_code}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-900">{e.paid_through_account?.account_name}</div>
                      <div className="text-xs text-gray-400 font-mono">
                        {e.paid_through_account?.account_code}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-800 font-medium">
                      {e.payee_or_payer}
                      {e.reference_number && (
                        <span className="block text-xs text-gray-400 font-mono">Ref: {e.reference_number}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 capitalize text-gray-600">{e.payment_mode.replace('_', ' ')}</td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${
                        e.transaction_type === 'expense' ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {e.transaction_type === 'expense' ? '-' : '+'}Rs.{' '}
                      {Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          e.status === 'posted'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {e.status === 'posted' && <CheckCircle2 className="w-3 h-3" />}
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Voucher Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2">
                {transactionType === 'expense' ? (
                  <TrendingDown className="w-5 h-5 text-rose-600" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                )}
                <h3 className="text-lg font-bold text-gray-900">
                  {transactionType === 'expense' ? 'Record Expense Voucher' : 'Record Direct Income'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 mt-4">
              {/* Branch */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Branch
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={activeBranchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  >
                    {branches?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Category Account */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  {transactionType === 'expense' ? 'Expense Account' : 'Income Account'}
                </label>
                <select
                  value={categoryAccountId}
                  onChange={(e) => setCategoryAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                >
                  <option value="">
                    Select {transactionType === 'expense' ? 'Expense' : 'Income'} Category
                  </option>
                  {categoryAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_code} - {acc.account_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Paid Through Account (Cash or Bank) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Paid Through (Cash / Bank Account)
                </label>
                <select
                  value={paidThroughAccountId}
                  onChange={(e) => setPaidThroughAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                >
                  <option value="">Select Cash / Bank Account</option>
                  {cashBankAccounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_code} - {acc.account_name} ({acc.subtype.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Payee / Payer */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  {transactionType === 'expense' ? 'Paid To (Payee)' : 'Received From (Payer)'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="e.g. Ceylon Electricity Board, Office Cleaner, Scrap Buyer..."
                    value={payeeOrPayer}
                    onChange={(e) => setPayeeOrPayer(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Amount & Payment Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Amount (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) =>
                      setPaymentMode(
                        e.target.value as 'cash' | 'bank_transfer' | 'cheque' | 'card'
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                  </select>
                </div>
              </div>

              {/* Reference # */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Reference # (Bill / Receipt #)
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="e.g. CEB-BILL-8891"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Description / Narration
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Purpose of voucher..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voucherMutation.isPending}
                  className={`inline-flex items-center gap-2 px-5 py-2 font-semibold text-sm rounded-xl shadow-sm transition-colors text-white ${
                    transactionType === 'expense'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  } disabled:opacity-50`}
                >
                  {voucherMutation.isPending
                    ? 'Posting...'
                    : `Post ${transactionType === 'expense' ? 'Expense' : 'Income'} Voucher`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
