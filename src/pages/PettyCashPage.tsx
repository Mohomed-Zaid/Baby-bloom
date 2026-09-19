import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  CheckCircle2,
  Coins,
  FileCheck,
  FilePlus,
  FileText,
  Receipt,
  RefreshCw,
  Send,
  Wallet,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { useBranchStore } from '../stores/branchStore'
import { listLookup } from '../services/masterData'
import {
  fetchPettyCashVouchers,
  createPettyCashVoucher,
  approvePettyCashVoucher,
  postPettyCashVoucher,
  replenishPettyCashService,
  fetchPettyCashSummary,
} from '../services/pettyCashService'
import { getErrorMessage } from '../lib/errors'

const cash = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PettyCashPage() {
  const qc = useQueryClient()
  const branchId = useBranchStore((s) => s.branchId)

  // ── States ─────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'approved' | 'posted'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showReplenishModal, setShowReplenishModal] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Create form state
  const [voucherBranchId, setVoucherBranchId] = useState(branchId || '')
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().slice(0, 10))
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')

  // Replenish form state
  const [replenishBranchId, setReplenishBranchId] = useState(branchId || '')
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [replenishAmount, setReplenishAmount] = useState<number>(0)
  const [replenishRef, setReplenishRef] = useState('')

  // ── Queries ─────────────────────────────────────────────────────────────
  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  const expenseAccounts = useQuery({
    queryKey: ['lookup', 'expense-accounts'],
    queryFn: () => listLookup('chart_of_accounts', 'account_name', { account_type: 'expense', is_active: true }),
  })

  const bankAndCashAccounts = useQuery({
    queryKey: ['lookup', 'bank-cash-accounts'],
    queryFn: () => listLookup('chart_of_accounts', 'account_name', { account_type: 'asset', is_active: true }),
  })

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['petty-cash-summary', branchId],
    queryFn: () => fetchPettyCashSummary(branchId || undefined),
    refetchInterval: 15000,
  })

  const { data: vouchers, isLoading: vouchersLoading } = useQuery({
    queryKey: ['petty-cash-vouchers', branchId],
    queryFn: () => fetchPettyCashVouchers(branchId || undefined),
  })

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 5000)
  }

  // ── Mutations ───────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () =>
      createPettyCashVoucher({
        branch_id: voucherBranchId || branchId || branches.data?.[0]?.value || '',
        voucher_date: voucherDate,
        expense_account_id: expenseAccountId || expenseAccounts.data?.[0]?.value || '',
        payee,
        amount: Number(amount),
        description,
        receipt_attachment_url: receiptUrl || null,
      }),
    onSuccess: (data) => {
      notify(`Petty cash voucher ${data.voucher_number} created in draft status!`)
      setShowCreateModal(false)
      setPayee('')
      setAmount(0)
      setDescription('')
      setReceiptUrl('')
      qc.invalidateQueries({ queryKey: ['petty-cash-vouchers'] })
      qc.invalidateQueries({ queryKey: ['petty-cash-summary'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const approveMutation = useMutation({
    mutationFn: (voucherId: string) => approvePettyCashVoucher(voucherId),
    onSuccess: () => {
      notify('Petty cash voucher approved!')
      qc.invalidateQueries({ queryKey: ['petty-cash-vouchers'] })
      qc.invalidateQueries({ queryKey: ['petty-cash-summary'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const postMutation = useMutation({
    mutationFn: (voucherId: string) => postPettyCashVoucher(voucherId),
    onSuccess: (data) => {
      notify(`Voucher ${data.voucher_number} posted to General Ledger! (Debit Expense, Credit Petty Cash)`)
      qc.invalidateQueries({ queryKey: ['petty-cash-vouchers'] })
      qc.invalidateQueries({ queryKey: ['petty-cash-summary'] })
      qc.invalidateQueries({ queryKey: ['active-pos-shift'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  const replenishMutation = useMutation({
    mutationFn: () =>
      replenishPettyCashService({
        branch_id: replenishBranchId || branchId || branches.data?.[0]?.value || '',
        source_account_id: sourceAccountId || bankAndCashAccounts.data?.[0]?.value || '',
        amount: Number(replenishAmount),
        reference: replenishRef,
      }),
    onSuccess: (data) => {
      notify(`Petty cash float replenished by ${cash(data.amount)}! (JE: ${data.journal_entry_number})`)
      setShowReplenishModal(false)
      setReplenishAmount(0)
      setReplenishRef('')
      qc.invalidateQueries({ queryKey: ['petty-cash-vouchers'] })
      qc.invalidateQueries({ queryKey: ['petty-cash-summary'] })
    },
    onError: (err) => notify(getErrorMessage(err), 'error'),
  })

  // ── Filtered Vouchers List ──────────────────────────────────────────────
  const filteredVouchers = (vouchers || []).filter((v) => {
    if (statusFilter !== 'all' && v.status !== statusFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        v.voucher_number.toLowerCase().includes(q) ||
        v.payee.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        (v.expense_account_name && v.expense_account_name.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
            <Banknote className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Petty Cash & Imprest Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Track small branch disbursements, submit expense vouchers, and automatically post balanced GL journal entries.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl shadow-xs bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all cursor-pointer"
            onClick={() => setShowReplenishModal(true)}
          >
            <RefreshCw className="w-4 h-4" />
            Replenish Float
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl shadow-xs bg-emerald-700 hover:bg-emerald-800 text-white transition-all cursor-pointer"
            onClick={() => setShowCreateModal(true)}
          >
            <FilePlus className="w-4 h-4" />
            New Petty Cash Voucher
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

      {/* ── Imprest Float Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-600">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Petty Cash Balance (GL)</span>
              <strong className="block text-2xl font-black text-emerald-700 mt-1">
                {summaryLoading ? '...' : cash(summary?.current_balance || 0)}
              </strong>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Live imprest asset position in Chart of Accounts
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-blue-600">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Month-to-Date Disbursed</span>
              <strong className="block text-2xl font-black text-blue-700 mt-1">
                {summaryLoading ? '...' : cash(summary?.total_disbursed_month || 0)}
              </strong>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Posted vouchers this calendar month
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending Approval</span>
              <strong className="block text-2xl font-black text-amber-600 mt-1">
                {summaryLoading ? '...' : `${summary?.pending_approval_count || 0}`}
              </strong>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Total: <strong>{cash(summary?.pending_approval_amount || 0)}</strong> awaiting sign-off
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-purple-600">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Posted Vouchers</span>
              <strong className="block text-2xl font-black text-purple-700 mt-1">
                {summaryLoading ? '...' : summary?.posted_vouchers_count || 0}
              </strong>
            </div>
            <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            All-time posted and balanced expense rows
          </div>
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Status:</span>
            {(['all', 'draft', 'approved', 'posted'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                onClick={() => setStatusFilter(st)}
              >
                {st.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex-1 max-w-sm">
            <input
              type="text"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-xs"
              placeholder="Search voucher #, payee, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Vouchers Ledger Table ────────────────────────────────────────── */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        {vouchersLoading ? (
          <div className="p-8 text-center text-gray-500">Loading petty cash vouchers...</div>
        ) : filteredVouchers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="pb-3">Voucher #</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Payee</th>
                  <th className="pb-3">Expense Category</th>
                  <th className="pb-3">Description</th>
                  <th className="pb-3 text-right">Amount</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Receipt</th>
                  <th className="pb-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredVouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/50">
                    <td className="py-3.5 font-bold text-emerald-800 font-mono text-xs">{v.voucher_number}</td>
                    <td className="py-3.5 text-gray-600 text-xs">{v.voucher_date}</td>
                    <td className="py-3.5 font-bold text-gray-900">{v.payee}</td>
                    <td className="py-3.5 text-gray-700 text-xs">
                      {v.expense_account_name || 'General Expense'}
                    </td>
                    <td className="py-3.5 max-w-[200px] truncate text-gray-600 text-xs" title={v.description}>
                      {v.description}
                    </td>
                    <td className="py-3.5 text-right font-bold text-gray-900">{cash(v.amount)}</td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          v.status === 'posted'
                            ? 'bg-emerald-50 text-emerald-700'
                            : v.status === 'approved'
                            ? 'bg-blue-50 text-blue-700'
                            : v.status === 'draft'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {v.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5">
                      {v.receipt_attachment_url ? (
                        <a
                          href={v.receipt_attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                          title="View receipt attachment"
                        >
                          <Receipt className="w-3.5 h-3.5" /> View
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">None</span>
                      )}
                    </td>
                    <td className="py-3.5 text-center">
                      <div className="inline-flex items-center gap-2">
                        {v.status === 'draft' && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                            title="Approve Voucher"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(v.id)}
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Approve
                          </button>
                        )}
                        {(v.status === 'draft' || v.status === 'approved') && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer"
                            title="Post to General Ledger"
                            disabled={postMutation.isPending}
                            onClick={() => postMutation.mutate(v.id)}
                          >
                            <Send className="w-3 h-3" /> Post to GL
                          </button>
                        )}
                        {v.status === 'posted' && (
                          <span className="text-xs text-emerald-700 font-bold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Posted
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-800">No petty cash vouchers found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              Click "New Petty Cash Voucher" to record tea/coffee, transport, or minor supplies expenses.
            </p>
          </div>
        )}
      </div>

      {/* ── MODAL 1: Create New Petty Cash Voucher ──────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-emerald-600" />
                New Petty Cash Voucher
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                onClick={() => setShowCreateModal(false)}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Branch Location</label>
                  <select
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                    value={voucherBranchId}
                    onChange={(e) => setVoucherBranchId(e.target.value)}
                  >
                    {branches.data?.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Voucher Date</label>
                  <input
                    type="date"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Expense Category (COA Account)</label>
                <select
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={expenseAccountId}
                  onChange={(e) => setExpenseAccountId(e.target.value)}
                >
                  <option value="">Select Expense Account...</option>
                  {expenseAccounts.data?.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Payee / Claimant</label>
                  <input
                    type="text"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    placeholder="e.g. Office Assistant / Taxi driver"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Amount (Rs.)</label>
                  <input
                    type="number"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 font-bold focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                    value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    placeholder="1500"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Description / Business Purpose</label>
                <textarea
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Refreshments for client meeting / Urgent stationery"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Receipt Image URL (Optional)</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={receiptUrl}
                  onChange={(e) => setReceiptUrl(e.target.value)}
                  placeholder="https://... receipt image link"
                />
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 leading-relaxed">
                Posting this voucher will automatically generate balanced double-entry rows (Debit Expense Account, Credit Petty Cash).
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                disabled={createMutation.isPending || !payee.trim() || amount <= 0 || !description.trim()}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Saving...' : 'Create Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Replenish Petty Cash Float ─────────────────────────── */}
      {showReplenishModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-600" />
                Replenish Petty Cash Float
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                onClick={() => setShowReplenishModal(false)}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Branch</label>
                <select
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={replenishBranchId}
                  onChange={(e) => setReplenishBranchId(e.target.value)}
                >
                  {branches.data?.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Source Account (Fund Origin)</label>
                <select
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={sourceAccountId}
                  onChange={(e) => setSourceAccountId(e.target.value)}
                >
                  <option value="">Select Bank / Cash Account...</option>
                  {bankAndCashAccounts.data?.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
                <span className="block text-xs text-gray-500 mt-1">
                  Funds will be credited from this account and debited to Petty Cash asset.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Replenishment Amount (Rs.)</label>
                <input
                  type="number"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 font-bold focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={replenishAmount || ''}
                  onChange={(e) => setReplenishAmount(Number(e.target.value))}
                  placeholder="25000"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">Transfer Reference / Cheque #</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={replenishRef}
                  onChange={(e) => setReplenishRef(e.target.value)}
                  placeholder="e.g. Bank Cheque #492011 / Cash Transfer"
                />
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setShowReplenishModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                disabled={replenishMutation.isPending || replenishAmount <= 0}
                onClick={() => replenishMutation.mutate()}
              >
                {replenishMutation.isPending ? 'Processing Transfer...' : 'Confirm Replenishment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
