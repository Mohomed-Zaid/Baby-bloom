import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DollarSign,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  X,
  Building2,
  Calendar,
  CreditCard,
  Truck,
} from 'lucide-react'
import {
  fetchVendorPayablesSummary,
  fetchUnpaidVendorPurchases,
  createAndPostSupplierPayment,
  fetchSupplierPaymentsHistory,
  fetchBankAccountsLookup,
} from '../services/financeService'
import { fetchBranchesLookup } from '../services/orderService'

export function VendorPayablesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'payables' | 'payments'>('payables')

  // Payment Settlement Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('')
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0] ?? ''
  )
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank' | 'card' | 'cheque' | 'online'>('cash')
  const [amount, setAmount] = useState<number>(0)
  const [bankAccountId, setBankAccountId] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')

  // Lookups
  const { data: branches } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  const { data: bankAccounts } = useQuery({
    queryKey: ['lookup', 'bank-accounts'],
    queryFn: fetchBankAccountsLookup,
  })

  // Vendor Payables Summary
  const {
    data: payables,
    isLoading: loadingPayables,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['vendor-payables'],
    queryFn: fetchVendorPayablesSummary,
  })

  // Supplier Payments History
  const { data: paymentsHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ['supplier-payments-history'],
    queryFn: () => fetchSupplierPaymentsHistory(50),
    enabled: activeTab === 'payments',
  })

  // Unpaid Purchases for Selected Vendor
  const { data: unpaidPurchases } = useQuery({
    queryKey: ['unpaid-purchases', selectedVendorId],
    queryFn: () => (selectedVendorId ? fetchUnpaidVendorPurchases(selectedVendorId) : []),
    enabled: !!selectedVendorId,
  })

  // Mutation to post supplier payment
  const paymentMutation = useMutation({
    mutationFn: (payload: {
      branch_id: string
      vendor_id: string
      purchase_id?: string
      payment_date: string
      payment_method: 'cash' | 'bank' | 'card' | 'cheque' | 'online'
      amount: number
      bank_account_id?: string
      reference_number?: string
      notes?: string
    }) => createAndPostSupplierPayment(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-payables'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-payments-history'] })
      setIsPaymentModalOpen(false)
      setSelectedVendorId('')
      setSelectedPurchaseId('')
      setAmount(0)
      setReferenceNumber('')
      setNotes('')
      alert(`Supplier Payment #${res?.document_number || 'success'} posted and AP ledger updated!`)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to post payment'
      alert(`Payment Error: ${msg}`)
    },
  })

  // Calculations for KPI cards
  const totalPayables = payables?.reduce((sum, v) => sum + Number(v.total_outstanding || 0), 0) || 0
  const totalOverdue = payables?.reduce((sum, v) => sum + Number(v.overdue_amount || 0), 0) || 0
  const vendorCount = payables?.length || 0

  // Filtered payables
  const filteredPayables = (payables || []).filter((v) => {
    const term = search.toLowerCase()
    return (
      v.vendor_name.toLowerCase().includes(term) ||
      v.vendor_code.toLowerCase().includes(term) ||
      (v.phone && v.phone.includes(term))
    )
  })

  const selectedVendor = payables?.find((v) => v.vendor_id === selectedVendorId)
  const activeBranchId = branchId || (branches?.[0]?.id ?? '')

  const handleOpenPaymentModal = (vendorId?: string) => {
    if (vendorId) {
      setSelectedVendorId(vendorId)
      const targetVendor = payables?.find((v) => v.vendor_id === vendorId)
      if (targetVendor) {
        setAmount(Number(targetVendor.total_outstanding))
      }
    } else {
      setSelectedVendorId('')
      setAmount(0)
    }
    setSelectedPurchaseId('')
    setIsPaymentModalOpen(true)
  }

  const handlePurchaseSelect = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId)
    if (purchaseId && unpaidPurchases) {
      const match = unpaidPurchases.find((p) => p.id === purchaseId)
      if (match) {
        setAmount(Number(match.balance_amount))
      }
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedVendorId) {
      alert('Please select a supplier')
      return
    }
    if (!activeBranchId) {
      alert('Please select a branch')
      return
    }
    if (amount <= 0) {
      alert('Payment amount must be greater than 0')
      return
    }
    if (paymentMethod === 'bank' && !bankAccountId) {
      alert('Please select a bank account for bank payment')
      return
    }

    paymentMutation.mutate({
      branch_id: activeBranchId,
      vendor_id: selectedVendorId,
      purchase_id: selectedPurchaseId || undefined,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      amount,
      bank_account_id: bankAccountId || undefined,
      reference_number: referenceNumber || undefined,
      notes: notes || undefined,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Vendor Payables (Accounts Payable)</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track supplier outstanding balances, bill aging, and record vendor settlements.
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
            onClick={() => handleOpenPaymentModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Make Supplier Payment
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Payables</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">
              Rs. {totalPayables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Overdue Payables</p>
            <p className="text-2xl font-bold text-rose-600 mt-0.5">
              Rs. {totalOverdue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Suppliers with Balance</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{vendorCount}</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs & Search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('payables')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                activeTab === 'payables'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Outstanding Subledger
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                activeTab === 'payments'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Payment Settlements Log
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search supplier, code, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-gray-50/50"
            />
          </div>
        </div>

        {/* Tab 1: Outstanding Subledger Table */}
        {activeTab === 'payables' && (
          <div className="overflow-x-auto">
            {loadingPayables ? (
              <div className="text-center py-12 text-sm text-gray-500">Loading payables ledger...</div>
            ) : filteredPayables.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-500">No outstanding payables found.</div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold uppercase text-gray-500 tracking-wider bg-gray-50/50">
                    <th className="py-3 px-4">Supplier Code & Name</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4 text-right">Total Outstanding</th>
                    <th className="py-3 px-4 text-right">Overdue</th>
                    <th className="py-3 px-4">Next Due Date</th>
                    <th className="py-3 px-4">Last Transaction</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPayables.map((v) => (
                    <tr key={v.vendor_id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">{v.vendor_name}</div>
                        <div className="text-xs text-gray-500 font-mono">{v.vendor_code}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{v.phone || '—'}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">
                        Rs. {Number(v.total_outstanding).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {Number(v.overdue_amount) > 0 ? (
                          <span className="text-rose-600 font-semibold">
                            Rs. {Number(v.overdue_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-medium">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {v.next_due_date ? new Date(v.next_due_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {v.last_transaction_date ? new Date(v.last_transaction_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenPaymentModal(v.vendor_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs rounded-lg transition-colors border border-emerald-200"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          Settle Bill
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Supplier Payments History */}
        {activeTab === 'payments' && (
          <div className="overflow-x-auto">
            {loadingHistory ? (
              <div className="text-center py-12 text-sm text-gray-500">Loading payment history...</div>
            ) : !paymentsHistory || paymentsHistory.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-500">No payment records found.</div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold uppercase text-gray-500 tracking-wider bg-gray-50/50">
                    <th className="py-3 px-4">Payment #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Linked Bill</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paymentsHistory.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-gray-900">{p.payment_number}</td>
                      <td className="py-3 px-4 text-gray-600">{new Date(p.payment_date).toLocaleDateString()}</td>
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {p.vendor?.name || 'Unknown Supplier'}
                        {p.vendor?.vendor_code && (
                          <span className="text-xs text-gray-400 block font-mono">{p.vendor.vendor_code}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{p.branch?.name || '—'}</td>
                      <td className="py-3 px-4">
                        <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-600">
                        {p.purchase?.purchase_number || 'On Account / Advance'}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-gray-900">
                        Rs. {Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            p.status === 'posted'
                              ? 'bg-emerald-50 text-emerald-700'
                              : p.status === 'draft'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {p.status === 'posted' && <CheckCircle2 className="w-3 h-3" />}
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Settle Supplier Bill Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-gray-900">Settle Supplier Bill</h3>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 mt-4">
              {/* Branch Selector */}
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

              {/* Vendor Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Supplier
                </label>
                <select
                  value={selectedVendorId}
                  onChange={(e) => {
                    const vid = e.target.value
                    setSelectedVendorId(vid)
                    setSelectedPurchaseId('')
                    const v = payables?.find((item) => item.vendor_id === vid)
                    if (v) setAmount(Number(v.total_outstanding))
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                >
                  <option value="">Select Supplier</option>
                  {payables?.map((v) => (
                    <option key={v.vendor_id} value={v.vendor_id}>
                      {v.vendor_name} ({v.vendor_code}) - O/S: Rs. {Number(v.total_outstanding).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Linked Purchase (Optional) */}
              {selectedVendorId && unpaidPurchases && unpaidPurchases.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Apply to Specific Bill (Optional)
                  </label>
                  <select
                    value={selectedPurchaseId}
                    onChange={(e) => handlePurchaseSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">On Account / General Settlement</option>
                    {unpaidPurchases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.purchase_number} ({new Date(p.purchase_date).toLocaleDateString()}) - Bal: Rs.{' '}
                        {Number(p.balance_amount).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Payment Date & Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Payment Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'cash' | 'bank' | 'card' | 'cheque' | 'online')
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="cash">Cash in Hand</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="card">Credit / Debit Card</option>
                    <option value="cheque">Cheque</option>
                    <option value="online">Online Payment</option>
                  </select>
                </div>
              </div>

              {/* Bank Account (if bank or online) */}
              {(paymentMethod === 'bank' || paymentMethod === 'online') && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Paying Bank Account
                  </label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  >
                    <option value="">Select Bank Account</option>
                    {bankAccounts?.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.bank_name} - {ba.account_number} ({ba.account_name})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Amount & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Payment Amount (Rs.)
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
                    Cheque / Ref #
                  </label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. CHQ-99210 or TXN-491"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Settlement Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional payment notes..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Outstanding Summary helper */}
              {selectedVendor && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs flex justify-between items-center">
                  <span className="text-gray-600">Total Supplier Balance:</span>
                  <span className="font-bold text-gray-900">
                    Rs. {Number(selectedVendor.total_outstanding).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  {paymentMutation.isPending ? 'Posting...' : 'Post Supplier Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
