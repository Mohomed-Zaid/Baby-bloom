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
} from 'lucide-react'
import {
  fetchCustomerReceivablesSummary,
  fetchUnpaidCustomerInvoices,
  createAndPostCustomerReceipt,
  fetchBankAccountsLookup,
  fetchCustomerReceipts,
} from '../services/financeService'
import { fetchBranchesLookup } from '../services/orderService'

export function CustomerReceivablesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'receivables' | 'receipts'>('receivables')

  // Payment Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'cheque'>('cash')
  const [receiptAmount, setReceiptAmount] = useState<number>(0)
  const [bankAccountId, setBankAccountId] = useState('')
  const [cardReference, setCardReference] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')

  // Allocation mapping: invoice_id -> allocated_amount
  const [allocations, setAllocations] = useState<Record<string, number>>({})

  // Lookups
  const { data: branches } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  const { data: bankAccounts } = useQuery({
    queryKey: ['lookup', 'bank-accounts'],
    queryFn: fetchBankAccountsLookup,
  })

  // Customer Receivables Summary
  const { data: receivables, isLoading: loadingReceivables, refetch, isRefetching } = useQuery({
    queryKey: ['customer-receivables'],
    queryFn: fetchCustomerReceivablesSummary,
  })

  // Recent Receipts
  const { data: receipts } = useQuery({
    queryKey: ['customer-receipts'],
    queryFn: () => fetchCustomerReceipts(50),
    enabled: activeTab === 'receipts',
  })

  // Unpaid Invoices for Selected Customer
  const { data: unpaidInvoices } = useQuery({
    queryKey: ['unpaid-invoices', selectedCustomerId],
    queryFn: () => (selectedCustomerId ? fetchUnpaidCustomerInvoices(selectedCustomerId) : []),
    enabled: !!selectedCustomerId,
  })

  // Auto-allocate helper: fills invoices sequentially from oldest to newest
  const handleAutoAllocate = (amount: number) => {
    if (!unpaidInvoices || unpaidInvoices.length === 0) return
    let remaining = amount
    const newAlloc: Record<string, number> = {}

    for (const inv of unpaidInvoices) {
      if (remaining <= 0) break
      const alloc = Math.min(remaining, inv.balance_amount)
      newAlloc[inv.id] = alloc
      remaining -= alloc
    }
    setAllocations(newAlloc)
  }

  // Mutation to post customer receipt
  const receiptMutation = useMutation({
    mutationFn: (payload: {
      receipt: Parameters<typeof createAndPostCustomerReceipt>[0]
      allocations: Parameters<typeof createAndPostCustomerReceipt>[1]
    }) => createAndPostCustomerReceipt(payload.receipt, payload.allocations),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customer-receivables'] })
      queryClient.invalidateQueries({ queryKey: ['customer-receipts'] })
      setIsReceiptModalOpen(false)
      setSelectedCustomerId('')
      setReceiptAmount(0)
      setAllocations({})
      alert(`Payment Receipt #${res.receipt_number} posted and ledger updated successfully!`)
    },
    onError: (err: Error) => alert('Receipt failed: ' + err.message),
  })

  const handleOpenReceivePayment = (customerId?: string) => {
    setSelectedCustomerId(customerId || '')
    setReceiptAmount(0)
    setAllocations({})
    setReceiptNotes('')
    setCardReference('')
    setPaymentMethod('cash')
    setIsReceiptModalOpen(true)
  }

  // Metrics
  const totalReceivables = receivables?.reduce((acc, c) => acc + Number(c.total_outstanding), 0) ?? 0
  const totalOverdue = receivables?.reduce((acc, c) => acc + Number(c.overdue_amount), 0) ?? 0
  const totalCustomersWithBalance = receivables?.length ?? 0

  const filteredReceivables = receivables?.filter(
    (c) =>
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_code.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search))
  )

  const allocatedTotal = Object.values(allocations).reduce((acc, v) => acc + (Number(v) || 0), 0)
  const unallocatedAmount = Math.max(0, receiptAmount - allocatedTotal)

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <DollarSign className="text-emerald-700" size={28} />
            Customer Receivables & Payment Receipts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Accounts receivable subledger, open invoice settlement, and multi-tender customer payment allocations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            <RefreshCw size={15} className={isRefetching ? 'animate-spin text-emerald-700' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            onClick={() => handleOpenReceivePayment()}
          >
            <Plus size={16} />
            Receive Customer Payment
          </button>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Accounts Receivable</div>
          <div className="text-2xl font-bold text-gray-900 mt-1.5">
            Rs. {totalReceivables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-400 mt-1">Dynamic balance from customer ledger</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-rose-600 uppercase tracking-wider">Overdue Receivables</div>
          <div className="text-2xl font-bold text-rose-600 mt-1.5">
            Rs. {totalOverdue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-rose-400 mt-1">Exceeding invoice credit terms</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Customers with Balance</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1.5">{totalCustomersWithBalance}</div>
          <div className="text-xs text-gray-400 mt-1">Active debtor accounts</div>
        </div>
      </div>

      {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 gap-4">
        <button
          type="button"
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'receivables'
              ? 'border-emerald-700 text-emerald-700 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('receivables')}
        >
          Customer Outstanding Balances
        </button>
        <button
          type="button"
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'receipts'
              ? 'border-emerald-700 text-emerald-700 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('receipts')}
        >
          Payment Receipts Log
        </button>
      </div>

      {activeTab === 'receivables' ? (
        <>
          {/* ── Search Bar ───────────────────────────────────────────────── */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-600"
                placeholder="Search customer name, code or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* ── Receivables Table ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingReceivables ? (
              <div className="p-12 text-center text-sm text-gray-500">Loading customer subledger balances...</div>
            ) : filteredReceivables && filteredReceivables.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Customer</th>
                      <th className="px-5 py-3.5">Contact</th>
                      <th className="px-5 py-3.5 text-right">Credit Limit</th>
                      <th className="px-5 py-3.5 text-right">Total Outstanding</th>
                      <th className="px-5 py-3.5 text-right">Overdue Balance</th>
                      <th className="px-5 py-3.5 text-center">Last Transaction</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredReceivables.map((c) => (
                      <tr key={c.customer_id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-gray-900">{c.customer_name}</div>
                          <div className="text-xs text-gray-400 font-mono">{c.customer_code}</div>
                        </td>

                        <td className="px-5 py-3.5 text-xs text-gray-600">
                          {c.phone || c.email || '-'}
                        </td>

                        <td className="px-5 py-3.5 text-right font-medium text-gray-800">
                          {c.credit_limit > 0
                            ? `Rs. ${c.credit_limit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            : 'No Limit'}
                        </td>

                        <td className="px-5 py-3.5 text-right font-bold text-gray-900">
                          Rs. {Number(c.total_outstanding).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="px-5 py-3.5 text-right font-bold text-rose-600">
                          {Number(c.overdue_amount) > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle size={13} />
                              Rs. {Number(c.overdue_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-gray-400 font-normal">Rs. 0.00</span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-center text-xs text-gray-500">
                          {c.last_transaction_date ? new Date(c.last_transaction_date).toLocaleDateString() : '-'}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors"
                            onClick={() => handleOpenReceivePayment(c.customer_id)}
                          >
                            <Receipt size={13} /> Receive Payment
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-16 text-center">
                <CheckCircle2 size={44} className="mx-auto text-emerald-700 mb-3" />
                <h3 className="text-base font-semibold text-gray-900">All customer receivables are cleared!</h3>
                <p className="text-sm text-gray-500 mt-1">No customers currently have unpaid balances.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Receipts Log Table ─────────────────────────────────────────── */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Receipt #</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Method</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5">Allocations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receipts?.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-emerald-800">{r.receipt_number}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600">{new Date(r.receipt_date).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 font-medium text-gray-900">{r.customer?.name}</td>
                    <td className="px-5 py-3.5 capitalize text-xs text-gray-700">{r.payment_method.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-gray-900">
                      Rs. {r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">
                      {r.allocations && r.allocations.length > 0 ? (
                        <span>
                          {r.allocations.length} invoice(s) settled (
                          {r.allocations.map((a) => a.invoice?.invoice_number).filter(Boolean).join(', ')})
                        </span>
                      ) : (
                        <span className="italic">On Account</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: Receive Payment & Open Invoice Allocation ─────────────── */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Receive Customer Payment</h3>
                  <p className="text-xs text-gray-500">Post payment receipt, record GL entries & settle open invoices</p>
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setIsReceiptModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Customer *</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 font-medium focus:ring-2 focus:ring-emerald-600"
                    value={selectedCustomerId}
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value)
                      setAllocations({})
                    }}
                  >
                    <option value="">-- Choose Customer --</option>
                    {receivables?.map((c) => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.customer_name} (Bal: Rs. {Number(c.total_outstanding).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Branch</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-800"
                    value={branchId || (branches?.[0]?.id ?? '')}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    {branches?.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Tender *</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-800 focus:ring-2 focus:ring-emerald-600"
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as 'cash' | 'bank_transfer' | 'card' | 'cheque'
                      )
                    }
                  >
                    <option value="cash">Cash in Hand</option>
                    <option value="bank_transfer">Bank Transfer / Direct Deposit</option>
                    <option value="card">Credit / Debit Card POS</option>
                    <option value="cheque">Cheque Deposit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Total Amount Received (Rs.) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 font-bold focus:ring-2 focus:ring-emerald-600"
                    value={receiptAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0
                      setReceiptAmount(val)
                      handleAutoAllocate(val)
                    }}
                  />
                </div>
              </div>

              {paymentMethod === 'bank_transfer' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Receiving Bank Account *</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                  >
                    <option value="">-- Choose Company Bank Account --</option>
                    {bankAccounts?.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.bank_name} - {ba.account_number} ({ba.account_name})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Card Approval Code / Ref #</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                    placeholder="e.g. AUTH-882941"
                    value={cardReference}
                    onChange={(e) => setCardReference(e.target.value)}
                  />
                </div>
              )}

              {/* Open Invoices Table */}
              {selectedCustomerId && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      Open Sales Invoices for Allocation
                    </div>
                    {receiptAmount > 0 && (
                      <button
                        type="button"
                        className="text-xs text-emerald-700 font-semibold hover:underline"
                        onClick={() => handleAutoAllocate(receiptAmount)}
                      >
                        Auto-Allocate Amount
                      </button>
                    )}
                  </div>

                  {unpaidInvoices && unpaidInvoices.length > 0 ? (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                          <tr>
                            <th className="p-2.5">Invoice #</th>
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5 text-right">Total (Rs.)</th>
                            <th className="p-2.5 text-right">Open Due (Rs.)</th>
                            <th className="p-2.5 text-right">Allocation (Rs.)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {unpaidInvoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="p-2.5 font-mono font-semibold text-gray-900">{inv.invoice_number}</td>
                              <td className="p-2.5 text-gray-500">{new Date(inv.invoice_date).toLocaleDateString()}</td>
                              <td className="p-2.5 text-right text-gray-600">{inv.grand_total.toFixed(2)}</td>
                              <td className="p-2.5 text-right font-bold text-rose-600">{inv.balance_amount.toFixed(2)}</td>
                              <td className="p-2.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max={inv.balance_amount}
                                  step="0.01"
                                  className="w-24 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-emerald-800"
                                  value={allocations[inv.id] ?? 0}
                                  onChange={(e) => {
                                    const val = Math.min(inv.balance_amount, parseFloat(e.target.value) || 0)
                                    setAllocations((prev) => ({ ...prev, [inv.id]: val }))
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-xl text-center text-xs text-gray-500">
                      No unpaid invoices found. Full receipt will be held on account as customer credit.
                    </div>
                  )}

                  {/* Allocation Check Summary */}
                  <div className="p-3 bg-gray-50 rounded-xl text-xs flex justify-between font-medium">
                    <span>Allocated: Rs. {allocatedTotal.toFixed(2)}</span>
                    <span className={unallocatedAmount > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700'}>
                      On Account / Unallocated: Rs. {unallocatedAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Receipt Remarks</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900"
                  placeholder="Payment notes, reference, or counter details..."
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => setIsReceiptModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                disabled={receiptMutation.isPending || !selectedCustomerId || receiptAmount <= 0}
                onClick={() => {
                  const allocArray = Object.entries(allocations)
                    .filter(([, amt]) => amt > 0)
                    .map(([invId, amt]) => ({ invoice_id: invId, allocated_amount: amt }))

                  receiptMutation.mutate({
                    receipt: {
                      branch_id: branchId || (branches?.[0]?.id ?? ''),
                      customer_id: selectedCustomerId,
                      payment_method: paymentMethod,
                      amount: receiptAmount,
                      bank_account_id: bankAccountId || undefined,
                      card_reference: cardReference || undefined,
                      notes: receiptNotes || undefined,
                    },
                    allocations: allocArray,
                  })
                }}
              >
                {receiptMutation.isPending ? 'Posting Receipt...' : 'Confirm & Post Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
