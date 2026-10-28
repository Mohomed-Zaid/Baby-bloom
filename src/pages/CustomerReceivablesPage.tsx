import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
  Phone,
  Printer,
  Clock,
  Eye,
  Check,
} from 'lucide-react'
import {
  fetchCustomerReceivablesSummary,
  fetchUnpaidCustomerInvoices,
  createAndPostCustomerReceipt,
  fetchBankAccountsLookup,
  fetchCustomerReceipts,
} from '../services/financeService'
import { fetchBranchesLookup } from '../services/orderService'
import { formatLkr } from '../lib/currency'
import { formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { permissions } from '../config/permissions'
import { logSystemAction } from '../services/auditService'
import type { CustomerReceipt } from '../types/finance'

export function CustomerReceivablesPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const activeBranchId = useBranchStore((s) => s.branchId)
  const userPermissions = useAuthStore((s) => s.user?.permissions)

  const canReceivePayment = userPermissions?.includes(permissions.receivablesReceive) ?? true

  // URL query sync
  const initialCustomer = searchParams.get('customer') || searchParams.get('id') || ''

  const [activeTab, setActiveTab] = useState<'receivables' | 'receipts'>('receivables')
  const [search, setSearch] = useState('')
  const [receivablesFilter, setReceivablesFilter] = useState<'all' | 'overdue' | 'high' | 'limit_exceeded'>('all')

  // Receipts search & filter
  const [receiptSearch, setReceiptSearch] = useState('')
  const [receiptMethodFilter, setReceiptMethodFilter] = useState<string>('all')

  // Payment Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomer)
  const [branchId, setBranchId] = useState(activeBranchId || '')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'cheque'>('cash')
  const [receiptAmount, setReceiptAmount] = useState<number>(0)
  const [bankAccountId, setBankAccountId] = useState('')
  const [cardReference, setCardReference] = useState('')
  const [chequeNo, setChequeNo] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')

  // Allocation mapping: invoice_id -> allocated_amount
  const [allocations, setAllocations] = useState<Record<string, number>>({})

  // Printable Receipt Modal State
  const [printedReceipt, setPrintedReceipt] = useState<CustomerReceipt | null>(null)

  // Toast notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

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
  const {
    data: receivables,
    isLoading: loadingReceivables,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['customer-receivables'],
    queryFn: fetchCustomerReceivablesSummary,
  })

  // Recent Receipts
  const { data: receipts, isLoading: loadingReceipts } = useQuery({
    queryKey: ['customer-receipts'],
    queryFn: () => fetchCustomerReceipts(50),
    enabled: activeTab === 'receipts',
  })

  // Unpaid Invoices for Selected Customer
  const { data: unpaidInvoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['unpaid-invoices', selectedCustomerId],
    queryFn: () => (selectedCustomerId ? fetchUnpaidCustomerInvoices(selectedCustomerId) : []),
    enabled: !!selectedCustomerId && isReceiptModalOpen,
  })

  // Selected customer object in modal
  const selectedCustomerObj = useMemo(() => {
    return receivables?.find((c) => c.customer_id === selectedCustomerId) || null
  }, [receivables, selectedCustomerId])

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
      queryClient.invalidateQueries({ queryKey: ['customer-balances-list'] })
      queryClient.invalidateQueries({ queryKey: ['customer-statement-ledger'] })
      void logSystemAction({
        branchId: branchId || activeBranchId,
        eventType: 'other',
        severity: 'info',
        targetTable: 'customer_receipts',
        targetId: (res as { receipt_id?: string })?.receipt_id || undefined,
        action: 'customer_receipt_posted',
        title: `Customer Receipt #${res.receipt_number} Posted`,
        details: {
          receipt_number: res.receipt_number,
          customer_id: selectedCustomerId,
          amount: receiptAmount,
          payment_method: paymentMethod,
          cheque_no: chequeNo || undefined,
          card_reference: cardReference || undefined,
        },
      })
      setIsReceiptModalOpen(false)
      setSelectedCustomerId('')
      setReceiptAmount(0)
      setAllocations({})
      showToast(`Payment Receipt #${res.receipt_number} posted and ledger updated successfully!`, 'success')
    },
    onError: (err: Error) => showToast(getErrorMessage(err), 'error'),
  })

  const handleOpenReceivePayment = (customerId?: string) => {
    const custId = customerId || ''
    setSelectedCustomerId(custId)
    setBranchId(activeBranchId || (branches?.[0]?.id ?? ''))
    setAllocations({})
    setReceiptNotes('')
    setCardReference('')
    setChequeNo('')
    setPaymentMethod('cash')

    if (custId && receivables) {
      const cust = receivables.find((c) => c.customer_id === custId)
      if (cust) {
        const out = Math.max(0, Number(cust.total_outstanding))
        setReceiptAmount(out)
      } else {
        setReceiptAmount(0)
      }
    } else {
      setReceiptAmount(0)
    }

    setIsReceiptModalOpen(true)
  }

  // Metrics
  const totalReceivables = useMemo(
    () => receivables?.reduce((acc, c) => acc + Number(c.total_outstanding || 0), 0) ?? 0,
    [receivables]
  )
  const totalOverdue = useMemo(
    () => receivables?.reduce((acc, c) => acc + Number(c.overdue_amount || 0), 0) ?? 0,
    [receivables]
  )
  const totalCustomersWithBalance = receivables?.length ?? 0
  const totalReceiptsAmount = useMemo(
    () => receipts?.reduce((acc, r) => acc + Number(r.amount || 0), 0) ?? 0,
    [receipts]
  )

  // Filtered Receivables
  const filteredReceivables = useMemo(() => {
    if (!receivables) return []
    return receivables.filter((c) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = c.customer_name.toLowerCase().includes(q)
        const matchesCode = c.customer_code.toLowerCase().includes(q)
        const matchesPhone = c.phone && c.phone.includes(q)
        if (!matchesName && !matchesCode && !matchesPhone) return false
      }

      // Filter tag
      if (receivablesFilter === 'overdue' && Number(c.overdue_amount || 0) <= 0) return false
      if (receivablesFilter === 'high' && Number(c.total_outstanding || 0) < 50000) return false
      if (
        receivablesFilter === 'limit_exceeded' &&
        (Number(c.credit_limit || 0) <= 0 || Number(c.total_outstanding || 0) <= Number(c.credit_limit || 0))
      )
        return false

      return true
    })
  }, [receivables, search, receivablesFilter])

  // Filtered Receipts
  const filteredReceipts = useMemo(() => {
    if (!receipts) return []
    return receipts.filter((r) => {
      if (receiptMethodFilter !== 'all' && r.payment_method !== receiptMethodFilter) return false
      if (receiptSearch.trim()) {
        const q = receiptSearch.toLowerCase()
        const matchNo = r.receipt_number.toLowerCase().includes(q)
        const matchCust = r.customer?.name.toLowerCase().includes(q) || r.customer?.customer_code.toLowerCase().includes(q)
        const matchRef = r.card_reference?.toLowerCase().includes(q) || r.notes?.toLowerCase().includes(q)
        if (!matchNo && !matchCust && !matchRef) return false
      }
      return true
    })
  }, [receipts, receiptMethodFilter, receiptSearch])

  const allocatedTotal = useMemo(
    () => Object.values(allocations).reduce((acc, v) => acc + (Number(v) || 0), 0),
    [allocations]
  )
  const unallocatedAmount = Math.max(0, receiptAmount - allocatedTotal)

  return (
    <div
      className="min-h-screen text-slate-100 p-4 md:p-6 lg:p-8"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 backdrop-blur-md transition-all duration-300 ${
            toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : toastMessage.type === 'info'
              ? 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
              : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* ── Main Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-teal-900/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/30 rounded-2xl shadow-lg shadow-teal-950/30">
              <DollarSign className="w-8 h-8 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Customer Receivables &amp; Payment Receipts
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">
                  Accounts Receivable Subledger
                </span>
              </div>
              <p className="text-sm text-teal-200/70 mt-0.5">
                Dynamic debtor tracking, multi-tender payment receipts, automatic open invoice settlements, and official payment vouchers.
              </p>
            </div>
          </div>

          {/* Quick Sub-navigation Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-800/60 border border-teal-500/40 shadow-sm">
              Receivables
            </div>
            <Link
              to="/customers/balances"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Customer Balances
            </Link>
            <Link
              to="/customers/statement"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Customer Statement
            </Link>
            <Link
              to="/sales/invoices"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Sales Invoices
            </Link>
            <Link
              to="/suppliers/balances"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Supplier Balances
            </Link>
          </div>
        </div>

        {/* ── KPI Cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Receivables */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300/80 uppercase tracking-wider">
                Total Receivables
              </span>
              <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20 text-teal-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {loadingReceivables ? '...' : formatLkr(totalReceivables)}
            </div>
            <div className="text-xs text-teal-300/60 mt-1">
              Dynamic total from customer sales ledger
            </div>
          </div>

          {/* Card 2: Overdue Receivables */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300/80 uppercase tracking-wider">
                Overdue Receivables
              </span>
              <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-300 mt-2">
              {loadingReceivables ? '...' : formatLkr(totalOverdue)}
            </div>
            <div className="text-xs text-rose-300/70 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Exceeding invoice credit terms
            </div>
          </div>

          {/* Card 3: Active Debtors */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-300/80 uppercase tracking-wider">
                Active Debtors
              </span>
              <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {loadingReceivables ? '...' : totalCustomersWithBalance}
            </div>
            <div className="text-xs text-emerald-300/60 mt-1">
              Customers with outstanding balance
            </div>
          </div>

          {/* Card 4: Recent Receipts Recorded */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300/80 uppercase tracking-wider">
                Recent Receipts (LKR)
              </span>
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-2">
              {loadingReceipts && activeTab === 'receipts' ? '...' : formatLkr(totalReceiptsAmount)}
            </div>
            <div className="text-xs text-cyan-300/60 mt-1">
              Total collected across recent vouchers
            </div>
          </div>
        </div>

        {/* ── Tabs & Action Bar ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-teal-900/50 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('receivables')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === 'receivables'
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40 shadow-md shadow-teal-950/40'
                  : 'text-teal-300/60 hover:text-teal-200 hover:bg-teal-900/30'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Customer Outstanding Balances
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-teal-950/60 border border-teal-800/40">
                {receivables?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('receipts')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === 'receipts'
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40 shadow-md shadow-teal-950/40'
                  : 'text-teal-300/60 hover:text-teal-200 hover:bg-teal-900/30'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Payment Receipts Log &amp; Vouchers
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-teal-950/60 border border-teal-800/40">
                {receipts?.length || 0}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refetch()
                queryClient.invalidateQueries({ queryKey: ['customer-receipts'] })
                showToast('Customer receivables synchronized!', 'info')
              }}
              disabled={isRefetching}
              className="p-2 rounded-xl bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 text-teal-300 hover:text-white transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-teal-400' : ''}`} />
            </button>

            {canReceivePayment && (
              <button
                onClick={() => handleOpenReceivePayment()}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                Receive Customer Payment
              </button>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: CUSTOMER RECEIVABLES LEDGER                                 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'receivables' && (
          <div className="space-y-4">
            {/* Filter Toolbar */}
            <div className="bg-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto flex-1">
                <div className="relative w-full md:max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400/60" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by customer name, code, or phone..."
                    className="w-full pl-10 pr-4 py-2 bg-teal-950/50 border border-teal-800/40 rounded-xl text-sm text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/40"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400/60 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  <button
                    onClick={() => setReceivablesFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receivablesFilter === 'all'
                        ? 'bg-teal-500/30 border border-teal-500/50 text-white'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    All Debtors ({receivables?.length || 0})
                  </button>
                  <button
                    onClick={() => setReceivablesFilter('overdue')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receivablesFilter === 'overdue'
                        ? 'bg-rose-500/30 border border-rose-500/50 text-rose-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Overdue Only
                  </button>
                  <button
                    onClick={() => setReceivablesFilter('high')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receivablesFilter === 'high'
                        ? 'bg-amber-500/30 border border-amber-500/50 text-amber-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    High Due (&gt; 50k)
                  </button>
                  <button
                    onClick={() => setReceivablesFilter('limit_exceeded')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receivablesFilter === 'limit_exceeded'
                        ? 'bg-purple-500/30 border border-purple-500/50 text-purple-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Over Credit Limit
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <span className="text-xs text-teal-300/70">
                  Showing <strong>{filteredReceivables.length}</strong> of{' '}
                  <strong>{receivables?.length || 0}</strong> debtors
                </span>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white flex items-center gap-1.5 transition no-print"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print List
                </button>
              </div>
            </div>

            {/* Receivables Table */}
            <div className="bg-[#0a2321]/90 border border-teal-800/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-teal-950/70 border-b border-teal-800/50 text-teal-300/80 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Customer</th>
                      <th className="py-3.5 px-4">Contact</th>
                      <th className="py-3.5 px-4 text-center">Credit Limit &amp; Utilization</th>
                      <th className="py-3.5 px-4 text-right">Total Outstanding</th>
                      <th className="py-3.5 px-4 text-right">Overdue Balance</th>
                      <th className="py-3.5 px-4 text-center">Last Transaction</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/30">
                    {loadingReceivables ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Loading customer subledger balances...
                        </td>
                      </tr>
                    ) : filteredReceivables.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center">
                          <CheckCircle2 className="w-10 h-10 text-emerald-400/40 mx-auto mb-2" />
                          <p className="text-base font-semibold text-white">All customer receivables cleared!</p>
                          <p className="text-xs text-teal-300/60 mt-1">
                            No customers currently match the active filter or have unpaid accounts.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredReceivables.map((c) => {
                        const outstanding = Number(c.total_outstanding || 0)
                        const overdue = Number(c.overdue_amount || 0)
                        const limit = Number(c.credit_limit || 0)
                        const utilization = limit > 0 ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0
                        const isOverLimit = limit > 0 && outstanding > limit

                        return (
                          <tr key={c.customer_id} className="hover:bg-teal-900/20 transition-colors group">
                            {/* Customer */}
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white group-hover:text-teal-200 transition">
                                {c.customer_name}
                              </div>
                              <div className="text-xs text-teal-400/70 font-mono mt-0.5">
                                {c.customer_code}
                              </div>
                            </td>

                            {/* Contact */}
                            <td className="py-3.5 px-4 text-xs text-teal-300/70">
                              {c.phone ? (
                                <div className="flex items-center gap-1.5 text-slate-300">
                                  <Phone className="w-3 h-3 text-teal-400/70" />
                                  <span>{c.phone}</span>
                                </div>
                              ) : (
                                <span className="text-teal-600/40">—</span>
                              )}
                              {c.email && <div className="text-[11px] text-teal-400/60">{c.email}</div>}
                            </td>

                            {/* Credit Limit & Utilization */}
                            <td className="py-3.5 px-4 text-center">
                              {limit > 0 ? (
                                <div className="max-w-[150px] mx-auto space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-teal-300/70">{formatLkr(limit)}</span>
                                    <span className={isOverLimit ? 'text-rose-400 font-bold' : 'text-teal-200'}>
                                      {utilization}%
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full bg-teal-950 rounded-full overflow-hidden border border-teal-800/40">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        isOverLimit
                                          ? 'bg-rose-500'
                                          : utilization > 80
                                          ? 'bg-amber-400'
                                          : 'bg-emerald-400'
                                      }`}
                                      style={{ width: `${utilization}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-teal-500/50">No Limit</span>
                              )}
                            </td>

                            {/* Total Outstanding */}
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-300 text-base">
                              {formatLkr(outstanding)}
                            </td>

                            {/* Overdue Balance */}
                            <td className="py-3.5 px-4 text-right font-mono">
                              {overdue > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  {formatLkr(overdue)}
                                </span>
                              ) : (
                                <span className="text-teal-400/60 text-xs">Nil</span>
                              )}
                            </td>

                            {/* Last Transaction */}
                            <td className="py-3.5 px-4 text-center text-xs text-teal-300/70">
                              {c.last_transaction_date ? formatBusinessDate(c.last_transaction_date) : '—'}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {canReceivePayment && (
                                  <button
                                    onClick={() => handleOpenReceivePayment(c.customer_id)}
                                    className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-sm"
                                    title="Receive Customer Payment"
                                  >
                                    <Receipt className="w-3 h-3" />
                                    Receive
                                  </button>
                                )}
                                <Link
                                  to={`/customers/statement?customer=${c.customer_id}`}
                                  className="px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 rounded-lg text-xs font-medium transition flex items-center gap-1"
                                  title="View Statement of Account"
                                >
                                  <Eye className="w-3 h-3" />
                                  Statement
                                </Link>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: PAYMENT RECEIPTS LOG & VOUCHERS                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'receipts' && (
          <div className="space-y-4">
            {/* Filter Toolbar */}
            <div className="bg-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto flex-1">
                <div className="relative w-full md:max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400/60" />
                  <input
                    type="text"
                    value={receiptSearch}
                    onChange={(e) => setReceiptSearch(e.target.value)}
                    placeholder="Search receipt #, customer, or reference..."
                    className="w-full pl-10 pr-4 py-2 bg-teal-950/50 border border-teal-800/40 rounded-xl text-sm text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-500/60"
                  />
                  {receiptSearch && (
                    <button
                      onClick={() => setReceiptSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400/60 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setReceiptMethodFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receiptMethodFilter === 'all'
                        ? 'bg-teal-500/30 border border-teal-500/50 text-white'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    All Tenders
                  </button>
                  <button
                    onClick={() => setReceiptMethodFilter('cash')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receiptMethodFilter === 'cash'
                        ? 'bg-emerald-500/30 border border-emerald-500/50 text-emerald-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    onClick={() => setReceiptMethodFilter('bank_transfer')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receiptMethodFilter === 'bank_transfer'
                        ? 'bg-blue-500/30 border border-blue-500/50 text-blue-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Bank
                  </button>
                  <button
                    onClick={() => setReceiptMethodFilter('card')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receiptMethodFilter === 'card'
                        ? 'bg-cyan-500/30 border border-cyan-500/50 text-cyan-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Card POS
                  </button>
                  <button
                    onClick={() => setReceiptMethodFilter('cheque')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      receiptMethodFilter === 'cheque'
                        ? 'bg-purple-500/30 border border-purple-500/50 text-purple-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Cheque
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-teal-300/70">
                  Total Vouchers: <strong>{filteredReceipts.length}</strong>
                </span>
              </div>
            </div>

            {/* Receipts Table */}
            <div className="bg-[#0a2321]/90 border border-teal-800/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-teal-950/70 border-b border-teal-800/50 text-teal-300/80 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Receipt #</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Customer</th>
                      <th className="py-3.5 px-4">Tender</th>
                      <th className="py-3.5 px-4 text-right">Amount (LKR)</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4">Invoice Allocations</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/30">
                    {loadingReceipts ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Loading recent payment receipts...
                        </td>
                      </tr>
                    ) : filteredReceipts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center">
                          <Receipt className="w-10 h-10 text-teal-400/40 mx-auto mb-2" />
                          <p className="text-base font-semibold text-white">No payment receipts found</p>
                          <p className="text-xs text-teal-300/60 mt-1">
                            Disbursed customer payment receipts will appear here with full invoice settlement audit trail.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredReceipts.map((r) => {
                        const tenderBadgeColor =
                          r.payment_method === 'cash'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : r.payment_method === 'bank_transfer'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : r.payment_method === 'card'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/30'

                        return (
                          <tr key={r.id} className="hover:bg-teal-900/20 transition-colors">
                            {/* Receipt # */}
                            <td className="py-3.5 px-4 font-mono font-bold text-teal-200 text-xs">
                              {r.receipt_number}
                            </td>

                            {/* Date */}
                            <td className="py-3.5 px-4 font-mono text-xs text-teal-300/80">
                              {formatBusinessDate(r.receipt_date)}
                            </td>

                            {/* Customer */}
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white">{r.customer?.name}</div>
                              <div className="text-xs text-teal-400/70 font-mono">
                                {r.customer?.customer_code}
                              </div>
                            </td>

                            {/* Tender */}
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase border ${tenderBadgeColor}`}
                              >
                                {r.payment_method.replace(/_/g, ' ')}
                              </span>
                            </td>

                            {/* Amount */}
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                              {formatLkr(r.amount)}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                  r.status === 'posted'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : r.status === 'draft'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>

                            {/* Allocations */}
                            <td className="py-3.5 px-4 text-xs text-teal-300/80 max-w-xs">
                              {r.allocations && r.allocations.length > 0 ? (
                                <div>
                                  <span className="font-semibold text-white">
                                    {r.allocations.length} invoice(s) settled
                                  </span>
                                  <div className="text-[11px] text-teal-400/70 font-mono truncate">
                                    {r.allocations
                                      .map((a) => a.invoice?.invoice_number)
                                      .filter(Boolean)
                                      .join(', ')}
                                  </div>
                                </div>
                              ) : (
                                <span className="italic text-teal-400/60">On-Account Credit</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => setPrintedReceipt(r)}
                                className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 shadow-sm"
                                title="Print Payment Receipt"
                              >
                                <Printer className="w-3 h-3" />
                                Voucher
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: RECEIVE CUSTOMER PAYMENT & INVOICE ALLOCATION                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#082321] border border-teal-700/60 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-white my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-teal-800/50 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Receive Customer Payment</h3>
                  <p className="text-xs text-teal-300/70">
                    Post payment receipt, record cash drawer / bank entries, and settle open invoices.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="p-1.5 rounded-lg text-teal-400 hover:text-white hover:bg-teal-900/50 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer & Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Customer Account <span className="text-rose-400">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value)
                    setAllocations({})
                    const cust = receivables?.find((c) => c.customer_id === e.target.value)
                    if (cust) {
                      setReceiptAmount(Math.max(0, Number(cust.total_outstanding)))
                    } else {
                      setReceiptAmount(0)
                    }
                  }}
                >
                  <option value="">-- Choose Customer --</option>
                  {receivables?.map((c) => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.customer_name} ({c.customer_code}) — Bal: {formatLkr(c.total_outstanding)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Receiving Branch <span className="text-rose-400">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  value={branchId || (branches?.[0]?.id ?? '')}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {branches?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Customer Live Balance Banner */}
            {selectedCustomerObj && (
              <div className="bg-teal-950/60 border border-teal-800/40 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-teal-400/80">Total Outstanding:</span>{' '}
                  <strong className="text-amber-300 font-mono text-sm">
                    {formatLkr(selectedCustomerObj.total_outstanding)}
                  </strong>
                </div>
                <div>
                  <span className="text-teal-400/80">Overdue Balance:</span>{' '}
                  <strong className="text-rose-300 font-mono text-sm">
                    {formatLkr(selectedCustomerObj.overdue_amount)}
                  </strong>
                </div>
              </div>
            )}

            {/* Payment Tender & Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Payment Tender <span className="text-rose-400">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as 'cash' | 'bank_transfer' | 'card' | 'cheque')
                  }
                >
                  <option value="cash">Cash in Hand</option>
                  <option value="bank_transfer">Bank Transfer / Direct Deposit</option>
                  <option value="card">Credit / Debit Card POS</option>
                  <option value="cheque">Cheque Deposit</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-teal-300/80">
                    Total Amount Received (LKR) <span className="text-rose-400">*</span>
                  </label>
                  {selectedCustomerObj && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const val = Math.max(0, Number(selectedCustomerObj.total_outstanding))
                          setReceiptAmount(val)
                          handleAutoAllocate(val)
                        }}
                        className="text-[10px] text-teal-300 hover:text-white underline"
                      >
                        Full Balance
                      </button>
                      {Number(selectedCustomerObj.overdue_amount) > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const val = Number(selectedCustomerObj.overdue_amount)
                            setReceiptAmount(val)
                            handleAutoAllocate(val)
                          }}
                          className="text-[10px] text-rose-300 hover:text-white underline"
                        >
                          Overdue
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white font-mono font-bold focus:outline-none focus:border-teal-500"
                  value={receiptAmount || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    setReceiptAmount(val)
                    handleAutoAllocate(val)
                  }}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Bank Details */}
            {paymentMethod === 'bank_transfer' && (
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Receiving Bank Account <span className="text-rose-400">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                >
                  <option value="">-- Choose Company Bank Account --</option>
                  {bankAccounts?.map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {ba.bank_name ? `${ba.bank_name} - ` : ''}
                      {ba.account_number} ({ba.account_name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Card Ref */}
            {paymentMethod === 'card' && (
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Card POS Approval Code / Reference #
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  placeholder="e.g. AUTH-882941"
                  value={cardReference}
                  onChange={(e) => setCardReference(e.target.value)}
                />
              </div>
            )}

            {/* Cheque No */}
            {paymentMethod === 'cheque' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Cheque Number <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                    placeholder="e.g. CHQ-004921"
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Deposit Bank Account
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                  >
                    <option value="">Select Deposit Bank Account</option>
                    {bankAccounts?.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.bank_name ? `${ba.bank_name} - ` : ''}
                        {ba.account_number}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Open Invoices Table */}
            {selectedCustomerId && (
              <div className="space-y-2 pt-2 border-t border-teal-900/50">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-teal-300 uppercase tracking-wider">
                    Open Sales Invoices for Allocation
                  </div>
                  {receiptAmount > 0 && unpaidInvoices && unpaidInvoices.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-emerald-400 font-semibold hover:underline flex items-center gap-1"
                      onClick={() => handleAutoAllocate(receiptAmount)}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Auto-Allocate Oldest Invoices First
                    </button>
                  )}
                </div>

                {loadingInvoices ? (
                  <div className="p-4 text-center text-xs text-teal-300/60">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-teal-400" />
                    Fetching unpaid invoices...
                  </div>
                ) : unpaidInvoices && unpaidInvoices.length > 0 ? (
                  <div className="border border-teal-800/50 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-teal-950/80 text-teal-300/80 border-b border-teal-800/50 sticky top-0">
                        <tr>
                          <th className="p-2.5">Invoice #</th>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5 text-right">Total (LKR)</th>
                          <th className="p-2.5 text-right">Balance Due</th>
                          <th className="p-2.5 text-right">Allocation (LKR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-teal-900/30">
                        {unpaidInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-teal-900/20">
                            <td className="p-2.5 font-mono font-semibold text-white">
                              {inv.invoice_number}
                            </td>
                            <td className="p-2.5 text-teal-300/70">
                              {formatBusinessDate(inv.invoice_date)}
                            </td>
                            <td className="p-2.5 text-right text-teal-200">
                              {formatLkr(inv.grand_total)}
                            </td>
                            <td className="p-2.5 text-right font-bold text-rose-300 font-mono">
                              {formatLkr(inv.balance_amount)}
                            </td>
                            <td className="p-2.5 text-right">
                              <input
                                type="number"
                                min="0"
                                max={inv.balance_amount}
                                step="0.01"
                                className="w-28 px-2 py-1 bg-teal-950/80 border border-teal-700/60 rounded-lg text-right font-mono font-bold text-emerald-300 focus:outline-none focus:border-teal-400"
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
                  <div className="p-4 bg-teal-950/40 border border-teal-800/30 rounded-xl text-center text-xs text-teal-300/70">
                    No open invoices found. The full payment will be posted on-account as customer credit advance.
                  </div>
                )}

                {/* Allocation Summary Bar */}
                <div className="p-3 bg-teal-950/60 border border-teal-800/40 rounded-xl text-xs flex justify-between font-mono">
                  <span className="text-teal-200">
                    Allocated: <strong>{formatLkr(allocatedTotal)}</strong>
                  </span>
                  <span className={unallocatedAmount > 0 ? 'text-amber-300 font-bold' : 'text-emerald-400'}>
                    On Account / Advance: {formatLkr(unallocatedAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                Receipt Remarks / Notes
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                placeholder="Payment memo, counter details, or customer notes..."
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-teal-800/50">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-medium text-teal-300 hover:text-white bg-teal-950/60 border border-teal-800/40 transition"
                onClick={() => setIsReceiptModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition"
                disabled={receiptMutation.isPending || !selectedCustomerId || receiptAmount <= 0}
                onClick={() => {
                  if (paymentMethod === 'bank_transfer' && !bankAccountId) {
                    showToast('Please select a receiving bank account.', 'error')
                    return
                  }
                  if (paymentMethod === 'cheque' && !chequeNo.trim()) {
                    showToast('Please enter the cheque number.', 'error')
                    return
                  }

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
                      cheque_id: chequeNo || undefined,
                      notes: receiptNotes || undefined,
                    },
                    allocations: allocArray,
                  })
                }}
              >
                {receiptMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Posting Receipt...
                  </>
                ) : (
                  'Confirm & Post Receipt'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: PRINTABLE OFFICIAL PAYMENT RECEIPT VOUCHER                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {printedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-2xl w-full p-8 shadow-2xl my-8 space-y-6 print:p-0 print:m-0 print:shadow-none print:w-full">
            {/* Action Bar (Hidden in Print) */}
            <div className="flex items-center justify-between border-b pb-4 no-print">
              <div className="flex items-center gap-2 text-slate-700">
                <Receipt className="w-5 h-5 text-teal-700" />
                <span className="font-bold text-sm">Official Receipt Voucher Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
                >
                  <Printer className="w-4 h-4" />
                  Print / Save PDF
                </button>
                <button
                  onClick={() => setPrintedReceipt(null)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Branded Receipt Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-5">
              <div>
                <h1 className="text-2xl font-black text-teal-900 tracking-tight">BABY BLOOM</h1>
                <p className="text-xs text-slate-500 font-medium">Premium Maternity &amp; Baby Care</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  124 Galle Road, Colombo 03, Sri Lanka <br />
                  Tel: +94 11 234 5678 | Email: accounts@babybloom.lk
                </p>
              </div>
              <div className="text-right">
                <div className="inline-block px-3 py-1 bg-emerald-50 border border-emerald-300 rounded text-emerald-900 text-xs font-bold uppercase tracking-wider">
                  Payment Receipt
                </div>
                <div className="text-xs text-slate-600 mt-2 space-y-0.5 font-mono">
                  <div>
                    Receipt #: <strong>{printedReceipt.receipt_number}</strong>
                  </div>
                  <div>
                    Date: <strong>{formatBusinessDate(printedReceipt.receipt_date)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Details Box */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Received From:
                </div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {printedReceipt.customer?.name || 'Customer'}
                </div>
                <div className="text-slate-600 font-mono text-[11px]">
                  Code: {printedReceipt.customer?.customer_code}
                </div>
                {printedReceipt.customer?.phone && (
                  <div className="text-slate-600 text-[11px]">Tel: {printedReceipt.customer.phone}</div>
                )}
              </div>

              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Payment Method:
                </div>
                <div className="text-sm font-bold text-teal-900 uppercase mt-0.5">
                  {printedReceipt.payment_method.replace(/_/g, ' ')}
                </div>
                {printedReceipt.card_reference && (
                  <div className="text-slate-600 text-[11px] font-mono">
                    Ref: {printedReceipt.card_reference}
                  </div>
                )}
                {printedReceipt.notes && (
                  <div className="text-slate-500 text-[11px] italic mt-0.5">
                    {printedReceipt.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Invoice Settlement Breakdown */}
            <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <th className="py-2 px-3">Invoice #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-right">Invoice Total</th>
                    <th className="py-2 px-3 text-right">Settled Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {printedReceipt.allocations && printedReceipt.allocations.length > 0 ? (
                    printedReceipt.allocations.map((a) => (
                      <tr key={a.id || a.invoice_id}>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {a.invoice?.invoice_number || a.invoice_id}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {a.invoice?.invoice_date ? formatBusinessDate(a.invoice.invoice_date) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">
                          {a.invoice?.grand_total ? formatLkr(a.invoice.grand_total) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-800">
                          {formatLkr(a.allocated_amount)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-3 px-3 text-center text-slate-500 italic">
                        General on-account customer deposit (unallocated credit).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Amount Total Banner */}
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-xl p-4 font-mono">
              <span className="text-xs uppercase tracking-wider font-bold text-emerald-900">
                Total Amount Received:
              </span>
              <span className="text-2xl font-black text-emerald-900">
                {formatLkr(printedReceipt.amount)}
              </span>
            </div>

            {/* Signature & Confirmation */}
            <div className="border-t border-slate-200 pt-6 flex items-center justify-between text-[11px] text-slate-500">
              <div className="space-y-1">
                <div>Customer Signature: _________________________</div>
                <div className="text-[10px] text-slate-400">Thank you for your payment!</div>
              </div>
              <div className="space-y-1 text-right">
                <div>Authorized Cashier: _________________________</div>
                <div className="text-[10px] text-slate-400">Baby Bloom Accounts Department</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
