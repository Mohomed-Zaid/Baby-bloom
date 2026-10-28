import React, { useState, useMemo } from 'react'
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
  Truck,
  Phone,
  Printer,
  Clock,
  Eye,
} from 'lucide-react'
import {
  fetchVendorPayablesSummary,
  fetchUnpaidVendorPurchases,
  createAndPostSupplierPayment,
  fetchSupplierPaymentsHistory,
  fetchBankAccountsLookup,
} from '../services/financeService'
import { fetchBranchesLookup } from '../services/orderService'
import { formatLkr } from '../lib/currency'
import { colomboNow, formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { permissions } from '../config/permissions'
import { logSystemAction } from '../services/auditService'

type SupplierPaymentHistoryItem = {
  id: string
  payment_number: string
  payment_date?: string
  payment_method: string
  amount: number
  status: string
  reference_number?: string
  notes?: string
  vendor?: { id: string; name: string; vendor_code: string; phone?: string }
  branch?: { id: string; name: string }
  purchase?: { id: string; purchase_number: string; grand_total: number }
}

export function VendorPayablesPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const activeBranchId = useBranchStore((s) => s.branchId)
  const userPermissions = useAuthStore((s) => s.user?.permissions)

  const canCreatePayment = userPermissions?.includes(permissions.supplierPaymentsCreate) ?? true

  // URL query sync
  const initialVendor = searchParams.get('vendor') || searchParams.get('id') || ''

  const [activeTab, setActiveTab] = useState<'payables' | 'payments'>('payables')
  const [search, setSearch] = useState('')
  const [payablesFilter, setPayablesFilter] = useState<'all' | 'overdue' | 'high' | 'imminent'>('all')

  // Payments History search & filter
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all')

  // Payment Settlement Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [selectedVendorId, setSelectedVendorId] = useState(initialVendor)
  const [branchId, setBranchId] = useState(activeBranchId || '')
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('')
  const [paymentDate, setPaymentDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank' | 'card' | 'cheque' | 'online'>('cash')
  const [amount, setAmount] = useState<number>(0)
  const [bankAccountId, setBankAccountId] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')

  // Printable Payment Voucher Modal
  const [printedVoucher, setPrintedVoucher] = useState<SupplierPaymentHistoryItem | null>(null)

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
    enabled: !!selectedVendorId && isPaymentModalOpen,
  })

  const selectedVendor = useMemo(() => {
    return payables?.find((v) => v.vendor_id === selectedVendorId) || null
  }, [payables, selectedVendorId])

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
      queryClient.invalidateQueries({ queryKey: ['supplier-balances-list'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-statement-ledger'] })
      void logSystemAction({
        branchId: branchId || activeBranchId,
        eventType: 'other',
        severity: 'info',
        targetTable: 'supplier_payments',
        targetId: res?.id || undefined,
        action: 'vendor_payment_posted',
        title: `Supplier Payment #${res?.document_number || 'Posted'}`,
        details: {
          document_number: res?.document_number,
          vendor_id: selectedVendorId,
          vendor_name: selectedVendor?.vendor_name,
          amount: amount,
          payment_method: paymentMethod,
          reference_number: referenceNumber || undefined,
        },
      })
      setIsPaymentModalOpen(false)
      setSelectedVendorId('')
      setSelectedPurchaseId('')
      setAmount(0)
      setReferenceNumber('')
      setNotes('')
      showToast(`Supplier Payment #${res?.document_number || 'posted'} successfully recorded!`, 'success')
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  })

  // KPI Calculations
  const totalPayables = useMemo(
    () => payables?.reduce((sum, v) => sum + Number(v.total_outstanding || 0), 0) || 0,
    [payables]
  )
  const totalOverdue = useMemo(
    () => payables?.reduce((sum, v) => sum + Number(v.overdue_amount || 0), 0) || 0,
    [payables]
  )
  const vendorCount = payables?.length || 0
  const totalPaymentsDisbursed = useMemo(
    () => paymentsHistory?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0,
    [paymentsHistory]
  )

  // Filtered Payables
  const filteredPayables = useMemo(() => {
    if (!payables) return []
    return payables.filter((v) => {
      // Search
      if (search.trim()) {
        const term = search.toLowerCase()
        const matchName = v.vendor_name.toLowerCase().includes(term)
        const matchCode = v.vendor_code.toLowerCase().includes(term)
        const matchPhone = v.phone && v.phone.includes(term)
        if (!matchName && !matchCode && !matchPhone) return false
      }

      // Filter tag
      if (payablesFilter === 'overdue' && Number(v.overdue_amount || 0) <= 0) return false
      if (payablesFilter === 'high' && Number(v.total_outstanding || 0) < 100000) return false
      if (payablesFilter === 'imminent') {
        if (!v.next_due_date) return false
        const diffDays = Math.ceil(
          (new Date(v.next_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        )
        if (diffDays < 0 || diffDays > 7) return false
      }

      return true
    })
  }, [payables, search, payablesFilter])

  // Filtered Payments History
  const filteredPayments = useMemo(() => {
    if (!paymentsHistory) return []
    return paymentsHistory.filter((p) => {
      if (paymentMethodFilter !== 'all' && p.payment_method !== paymentMethodFilter) return false
      if (paymentSearch.trim()) {
        const q = paymentSearch.toLowerCase()
        const matchNo = p.payment_number.toLowerCase().includes(q)
        const matchVendor =
          p.vendor?.name.toLowerCase().includes(q) || p.vendor?.vendor_code.toLowerCase().includes(q)
        const matchRef = p.reference_number?.toLowerCase().includes(q) || p.notes?.toLowerCase().includes(q)
        if (!matchNo && !matchVendor && !matchRef) return false
      }
      return true
    })
  }, [paymentsHistory, paymentMethodFilter, paymentSearch])

  const handleOpenPaymentModal = (vendorId?: string) => {
    const vid = vendorId || ''
    setSelectedVendorId(vid)
    setBranchId(activeBranchId || (branches?.[0]?.id ?? ''))
    setSelectedPurchaseId('')
    setPaymentDate(colomboNow().format('YYYY-MM-DD'))
    setPaymentMethod('cash')
    setBankAccountId('')
    setReferenceNumber('')
    setNotes('')

    if (vid && payables) {
      const targetVendor = payables.find((v) => v.vendor_id === vid)
      if (targetVendor) {
        setAmount(Math.max(0, Number(targetVendor.total_outstanding)))
      } else {
        setAmount(0)
      }
    } else {
      setAmount(0)
    }

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
      showToast('Please select a supplier.', 'error')
      return
    }
    const targetBranchId = branchId || activeBranchId
    if (!targetBranchId) {
      showToast('Please select a disbursing branch.', 'error')
      return
    }
    if (amount <= 0) {
      showToast('Payment amount must be greater than 0.', 'error')
      return
    }
    if ((paymentMethod === 'bank' || paymentMethod === 'online') && !bankAccountId) {
      showToast('Please select a company bank account.', 'error')
      return
    }
    if (paymentMethod === 'cheque' && !referenceNumber.trim()) {
      showToast('Please enter the cheque reference number.', 'error')
      return
    }

    paymentMutation.mutate({
      branch_id: targetBranchId,
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
              <Truck className="w-8 h-8 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Vendor Payables (Accounts Payable)
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">
                  Accounts Payable Subledger
                </span>
              </div>
              <p className="text-sm text-teal-200/70 mt-0.5">
                Track supplier outstanding balances, bill aging analysis, and record multi-tender vendor settlements.
              </p>
            </div>
          </div>

          {/* Quick Sub-navigation Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-800/60 border border-teal-500/40 shadow-sm">
              Vendor Payables
            </div>
            <Link
              to="/suppliers/balances"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Supplier Balances
            </Link>
            <Link
              to="/suppliers/statement"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Supplier Statement
            </Link>
            <Link
              to="/purchases"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Purchases
            </Link>
            <Link
              to="/finance/receivables"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Customer Receivables
            </Link>
          </div>
        </div>

        {/* ── KPI Cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Payables */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300/80 uppercase tracking-wider">
                Total Payables
              </span>
              <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20 text-teal-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {loadingPayables ? '...' : formatLkr(totalPayables)}
            </div>
            <div className="text-xs text-teal-300/60 mt-1">
              Outstanding bills across supplier subledgers
            </div>
          </div>

          {/* Card 2: Overdue Payables */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300/80 uppercase tracking-wider">
                Overdue Payables
              </span>
              <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-300 mt-2">
              {loadingPayables ? '...' : formatLkr(totalOverdue)}
            </div>
            <div className="text-xs text-rose-300/70 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Past agreed supplier credit terms
            </div>
          </div>

          {/* Card 3: Creditors Count */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-300/80 uppercase tracking-wider">
                Active Creditors
              </span>
              <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {loadingPayables ? '...' : vendorCount}
            </div>
            <div className="text-xs text-emerald-300/60 mt-1">
              Suppliers with outstanding balances
            </div>
          </div>

          {/* Card 4: Recent Payments Disbursed */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300/80 uppercase tracking-wider">
                Recent Disbursements
              </span>
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-2">
              {loadingHistory && activeTab === 'payments' ? '...' : formatLkr(totalPaymentsDisbursed)}
            </div>
            <div className="text-xs text-cyan-300/60 mt-1">
              Disbursed across recent payment vouchers
            </div>
          </div>
        </div>

        {/* ── Tabs & Action Bar ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-teal-900/50 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('payables')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === 'payables'
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40 shadow-md shadow-teal-950/40'
                  : 'text-teal-300/60 hover:text-teal-200 hover:bg-teal-900/30'
              }`}
            >
              <Truck className="w-4 h-4" />
              Outstanding Subledger
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-teal-950/60 border border-teal-800/40">
                {payables?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === 'payments'
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40 shadow-md shadow-teal-950/40'
                  : 'text-teal-300/60 hover:text-teal-200 hover:bg-teal-900/30'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Payment Settlements Log
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-teal-950/60 border border-teal-800/40">
                {paymentsHistory?.length || 0}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refetch()
                queryClient.invalidateQueries({ queryKey: ['supplier-payments-history'] })
                showToast('Vendor payables synchronized!', 'info')
              }}
              disabled={isRefetching}
              className="p-2 rounded-xl bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 text-teal-300 hover:text-white transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-teal-400' : ''}`} />
            </button>

            {canCreatePayment && (
              <button
                onClick={() => handleOpenPaymentModal()}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                Make Supplier Payment
              </button>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: OUTSTANDING SUBLEDGER                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'payables' && (
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
                    placeholder="Search by supplier name, code, or phone..."
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
                    onClick={() => setPayablesFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      payablesFilter === 'all'
                        ? 'bg-teal-500/30 border border-teal-500/50 text-white'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    All Creditors ({payables?.length || 0})
                  </button>
                  <button
                    onClick={() => setPayablesFilter('overdue')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      payablesFilter === 'overdue'
                        ? 'bg-rose-500/30 border border-rose-500/50 text-rose-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Overdue Only
                  </button>
                  <button
                    onClick={() => setPayablesFilter('high')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      payablesFilter === 'high'
                        ? 'bg-amber-500/30 border border-amber-500/50 text-amber-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    High Due (&gt; 100k)
                  </button>
                  <button
                    onClick={() => setPayablesFilter('imminent')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      payablesFilter === 'imminent'
                        ? 'bg-purple-500/30 border border-purple-500/50 text-purple-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Due This Week
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <span className="text-xs text-teal-300/70">
                  Showing <strong>{filteredPayables.length}</strong> of{' '}
                  <strong>{payables?.length || 0}</strong> creditors
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

            {/* Payables Table */}
            <div className="bg-[#0a2321]/90 border border-teal-800/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-teal-950/70 border-b border-teal-800/50 text-teal-300/80 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Supplier</th>
                      <th className="py-3.5 px-4">Contact</th>
                      <th className="py-3.5 px-4 text-right">Total Outstanding</th>
                      <th className="py-3.5 px-4 text-right">Overdue</th>
                      <th className="py-3.5 px-4 text-center">Next Due Date</th>
                      <th className="py-3.5 px-4 text-center">Last Transaction</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/30">
                    {loadingPayables ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Loading payables subledger...
                        </td>
                      </tr>
                    ) : filteredPayables.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center">
                          <CheckCircle2 className="w-10 h-10 text-emerald-400/40 mx-auto mb-2" />
                          <p className="text-base font-semibold text-white">All vendor payables cleared!</p>
                          <p className="text-xs text-teal-300/60 mt-1">
                            No supplier bills currently have outstanding or overdue balances.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredPayables.map((v) => {
                        const outstanding = Number(v.total_outstanding || 0)
                        const overdue = Number(v.overdue_amount || 0)

                        return (
                          <tr key={v.vendor_id} className="hover:bg-teal-900/20 transition-colors group">
                            {/* Supplier Code & Name */}
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white group-hover:text-teal-200 transition">
                                {v.vendor_name}
                              </div>
                              <div className="text-xs text-teal-400/70 font-mono mt-0.5">
                                {v.vendor_code}
                              </div>
                            </td>

                            {/* Contact */}
                            <td className="py-3.5 px-4 text-xs text-teal-300/70">
                              {v.phone ? (
                                <div className="flex items-center gap-1.5 text-slate-300">
                                  <Phone className="w-3 h-3 text-teal-400/70" />
                                  <span>{v.phone}</span>
                                </div>
                              ) : (
                                <span className="text-teal-600/40">—</span>
                              )}
                            </td>

                            {/* Total Outstanding */}
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-300 text-base">
                              {formatLkr(outstanding)}
                            </td>

                            {/* Overdue */}
                            <td className="py-3.5 px-4 text-right font-mono">
                              {overdue > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  {formatLkr(overdue)}
                                </span>
                              ) : (
                                <span className="text-teal-400/60 text-xs">Nil</span>
                              )}
                            </td>

                            {/* Next Due Date */}
                            <td className="py-3.5 px-4 text-center text-xs">
                              {v.next_due_date ? (
                                <span className="font-mono text-rose-300">
                                  {formatBusinessDate(v.next_due_date)}
                                </span>
                              ) : (
                                <span className="text-teal-500/40">—</span>
                              )}
                            </td>

                            {/* Last Transaction */}
                            <td className="py-3.5 px-4 text-center text-xs text-teal-300/70">
                              {v.last_transaction_date ? formatBusinessDate(v.last_transaction_date) : '—'}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {canCreatePayment && (
                                  <button
                                    onClick={() => handleOpenPaymentModal(v.vendor_id)}
                                    className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-sm"
                                    title="Settle Supplier Bill"
                                  >
                                    <Receipt className="w-3 h-3" />
                                    Settle
                                  </button>
                                )}
                                <Link
                                  to={`/suppliers/statement?vendor=${v.vendor_id}`}
                                  className="px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 rounded-lg text-xs font-medium transition flex items-center gap-1"
                                  title="View Supplier Statement"
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
        {/* TAB 2: PAYMENT SETTLEMENTS LOG                                      */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            {/* Filter Toolbar */}
            <div className="bg-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto flex-1">
                <div className="relative w-full md:max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400/60" />
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Search payment #, supplier, or reference..."
                    className="w-full pl-10 pr-4 py-2 bg-teal-950/50 border border-teal-800/40 rounded-xl text-sm text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-500/60"
                  />
                  {paymentSearch && (
                    <button
                      onClick={() => setPaymentSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400/60 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPaymentMethodFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentMethodFilter === 'all'
                        ? 'bg-teal-500/30 border border-teal-500/50 text-white'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    All Methods
                  </button>
                  <button
                    onClick={() => setPaymentMethodFilter('cash')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentMethodFilter === 'cash'
                        ? 'bg-emerald-500/30 border border-emerald-500/50 text-emerald-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    onClick={() => setPaymentMethodFilter('bank')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentMethodFilter === 'bank'
                        ? 'bg-blue-500/30 border border-blue-500/50 text-blue-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Bank
                  </button>
                  <button
                    onClick={() => setPaymentMethodFilter('cheque')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentMethodFilter === 'cheque'
                        ? 'bg-purple-500/30 border border-purple-500/50 text-purple-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Cheque
                  </button>
                  <button
                    onClick={() => setPaymentMethodFilter('card')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentMethodFilter === 'card'
                        ? 'bg-cyan-500/30 border border-cyan-500/50 text-cyan-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Card
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-teal-300/70">
                  Total Records: <strong>{filteredPayments.length}</strong>
                </span>
              </div>
            </div>

            {/* Payments Table */}
            <div className="bg-[#0a2321]/90 border border-teal-800/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-teal-950/70 border-b border-teal-800/50 text-teal-300/80 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Payment #</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Supplier</th>
                      <th className="py-3.5 px-4">Branch</th>
                      <th className="py-3.5 px-4">Method</th>
                      <th className="py-3.5 px-4">Linked Bill</th>
                      <th className="py-3.5 px-4 text-right">Amount (LKR)</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/30">
                    {loadingHistory ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Loading supplier payment history...
                        </td>
                      </tr>
                    ) : filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center">
                          <Receipt className="w-10 h-10 text-teal-400/40 mx-auto mb-2" />
                          <p className="text-base font-semibold text-white">No payment records found</p>
                          <p className="text-xs text-teal-300/60 mt-1">
                            Disbursed supplier settlements will appear here with complete audit trail.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p) => {
                        const methodBadgeColor =
                          p.payment_method === 'cash'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : p.payment_method === 'bank'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : p.payment_method === 'card'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/30'

                        return (
                          <tr key={p.id} className="hover:bg-teal-900/20 transition-colors">
                            {/* Payment # */}
                            <td className="py-3.5 px-4 font-mono font-bold text-teal-200 text-xs">
                              {p.payment_number}
                            </td>

                            {/* Date */}
                            <td className="py-3.5 px-4 font-mono text-xs text-teal-300/80">
                              {formatBusinessDate(p.payment_date)}
                            </td>

                            {/* Supplier */}
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white">{p.vendor?.name || 'Supplier'}</div>
                              <div className="text-xs text-teal-400/70 font-mono">
                                {p.vendor?.vendor_code}
                              </div>
                            </td>

                            {/* Branch */}
                            <td className="py-3.5 px-4 text-xs text-teal-300/70">
                              {p.branch?.name || 'Main Branch'}
                            </td>

                            {/* Method */}
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase border ${methodBadgeColor}`}
                              >
                                {p.payment_method}
                              </span>
                            </td>

                            {/* Linked Bill */}
                            <td className="py-3.5 px-4 font-mono text-xs text-teal-300/80">
                              {p.purchase?.purchase_number ? (
                                <span className="font-semibold text-white">{p.purchase.purchase_number}</span>
                              ) : (
                                <span className="italic text-teal-500/50">On Account / Advance</span>
                              )}
                            </td>

                            {/* Amount */}
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                              {formatLkr(p.amount)}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                  p.status === 'posted'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : p.status === 'draft'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => setPrintedVoucher(p)}
                                className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 shadow-sm"
                                title="Print Payment Voucher"
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
      {/* MODAL: SETTLE SUPPLIER BILL DIALOG                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#082321] border border-teal-700/60 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-white my-8">
            <div className="flex items-center justify-between border-b border-teal-800/50 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Settle Supplier Bill</h3>
                  <p className="text-xs text-teal-300/70">
                    Disburse payment, record bank or cash transaction, and settle creditor balances.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 rounded-lg text-teal-400 hover:text-white hover:bg-teal-900/50 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Supplier & Branch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Supplier Account <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={selectedVendorId}
                    onChange={(e) => {
                      const vid = e.target.value
                      setSelectedVendorId(vid)
                      setSelectedPurchaseId('')
                      const v = payables?.find((item) => item.vendor_id === vid)
                      if (v) setAmount(Math.max(0, Number(v.total_outstanding)))
                      else setAmount(0)
                    }}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                    required
                  >
                    <option value="">-- Choose Supplier --</option>
                    {payables?.map((v) => (
                      <option key={v.vendor_id} value={v.vendor_id}>
                        {v.vendor_name} ({v.vendor_code}) — Due: {formatLkr(v.total_outstanding)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Disbursing Branch <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={branchId || (branches?.[0]?.id ?? '')}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
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

              {/* Supplier Live Stats Banner */}
              {selectedVendor && (
                <div className="bg-teal-950/60 border border-teal-800/40 rounded-xl p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-teal-400/80">Total Outstanding:</span>{' '}
                    <strong className="text-amber-300 font-mono text-sm">
                      {formatLkr(selectedVendor.total_outstanding)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-teal-400/80">Overdue Amount:</span>{' '}
                    <strong className="text-rose-300 font-mono text-sm">
                      {formatLkr(selectedVendor.overdue_amount)}
                    </strong>
                  </div>
                </div>
              )}

              {/* Linked Purchase (Optional) */}
              {selectedVendorId && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-teal-300/80">
                      Apply to Specific Purchase Bill (Optional)
                    </label>
                    <span className="text-[11px] text-teal-400/60">
                      Or leave for on-account general settlement
                    </span>
                  </div>
                  <select
                    value={selectedPurchaseId}
                    onChange={(e) => handlePurchaseSelect(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="">-- On Account / General Settlement (Oldest bills first) --</option>
                    {unpaidPurchases?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.purchase_number} ({formatBusinessDate(p.purchase_date)}) — Due:{' '}
                        {formatLkr(p.balance_amount)} (Total: {formatLkr(p.grand_total)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Payment Date & Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Payment Date <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Payment Method <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'cash' | 'bank' | 'card' | 'cheque' | 'online')
                    }
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="cash">Cash in Hand</option>
                    <option value="bank">Bank Transfer / Wire</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Company Debit / Credit Card</option>
                    <option value="online">Online Payment</option>
                  </select>
                </div>
              </div>

              {/* Amount & Bank Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-teal-300/80">
                      Payment Amount (LKR) <span className="text-rose-400">*</span>
                    </label>
                    {selectedVendor && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAmount(Math.max(0, Number(selectedVendor.total_outstanding)))}
                          className="text-[10px] text-teal-300 hover:text-white underline"
                        >
                          Full Balance
                        </button>
                        {Number(selectedVendor.overdue_amount) > 0 && (
                          <button
                            type="button"
                            onClick={() => setAmount(Number(selectedVendor.overdue_amount))}
                            className="text-[10px] text-rose-300 hover:text-white underline"
                          >
                            Overdue Only
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white font-mono font-bold focus:outline-none focus:border-teal-500"
                    placeholder="0.00"
                    required
                  />
                </div>

                {/* Bank Account (Conditional) */}
                {['bank', 'card', 'online', 'cheque'].includes(paymentMethod) ? (
                  <div>
                    <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                      Paying Bank Account <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                      className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                      required
                    >
                      <option value="">Select Bank Account</option>
                      {bankAccounts?.map((ba) => (
                        <option key={ba.id} value={ba.id}>
                          {ba.bank_name ? `${ba.bank_name} - ` : ''}
                          {ba.account_name} ({ba.account_number})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                      Reference / Memo
                    </label>
                    <input
                      type="text"
                      placeholder="Receipt or voucher memo"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>
                )}
              </div>

              {/* Cheque / Transaction Ref (if bank/card/cheque) */}
              {['bank', 'card', 'online', 'cheque'].includes(paymentMethod) && (
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    {paymentMethod === 'cheque' ? 'Cheque Number *' : 'Transaction / Reference Number'}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      paymentMethod === 'cheque' ? 'e.g. CHQ-99210' : 'e.g. TXN-491 or Wire Reference'
                    }
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                    required={paymentMethod === 'cheque'}
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Settlement Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional payment notes..."
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-teal-800/50">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-teal-300 hover:text-white bg-teal-950/60 border border-teal-800/40 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentMutation.isPending || amount <= 0 || !selectedVendorId}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition"
                >
                  {paymentMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    'Post Supplier Settlement'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: PRINTABLE OFFICIAL VENDOR PAYMENT VOUCHER                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {printedVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-2xl w-full p-8 shadow-2xl my-8 space-y-6 print:p-0 print:m-0 print:shadow-none print:w-full">
            {/* Action Bar (Hidden in Print) */}
            <div className="flex items-center justify-between border-b pb-4 no-print">
              <div className="flex items-center gap-2 text-slate-700">
                <Receipt className="w-5 h-5 text-teal-700" />
                <span className="font-bold text-sm">Vendor Payment Voucher Preview</span>
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
                  onClick={() => setPrintedVoucher(null)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Branded Header */}
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
                <div className="inline-block px-3 py-1 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs font-bold uppercase tracking-wider">
                  Payment Voucher
                </div>
                <div className="text-xs text-slate-600 mt-2 space-y-0.5 font-mono">
                  <div>
                    Voucher #: <strong>{printedVoucher.payment_number}</strong>
                  </div>
                  <div>
                    Date: <strong>{formatBusinessDate(printedVoucher.payment_date)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Vendor Details Box */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Paid To (Supplier):
                </div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {printedVoucher.vendor?.name || 'Supplier'}
                </div>
                <div className="text-slate-600 font-mono text-[11px]">
                  Code: {printedVoucher.vendor?.vendor_code}
                </div>
                {printedVoucher.vendor?.phone && (
                  <div className="text-slate-600 text-[11px]">Tel: {printedVoucher.vendor.phone}</div>
                )}
              </div>

              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Payment Details:
                </div>
                <div className="text-sm font-bold text-teal-900 uppercase mt-0.5">
                  {printedVoucher.payment_method}
                </div>
                {printedVoucher.reference_number && (
                  <div className="text-slate-600 text-[11px] font-mono">
                    Ref: {printedVoucher.reference_number}
                  </div>
                )}
                {printedVoucher.notes && (
                  <div className="text-slate-500 text-[11px] italic mt-0.5">
                    {printedVoucher.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Bill Settlement Breakdown */}
            <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <th className="py-2 px-3">Linked Document</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3 text-right">Disbursed Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {printedVoucher.purchase?.purchase_number || 'General Supplier Account'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {printedVoucher.purchase?.purchase_number ? 'Purchase Bill' : 'On-Account Advance'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-800">
                      {formatLkr(printedVoucher.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Banner */}
            <div className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl p-4 font-mono">
              <span className="text-xs uppercase tracking-wider font-bold text-amber-900">
                Total Amount Paid:
              </span>
              <span className="text-2xl font-black text-amber-900">
                {formatLkr(printedVoucher.amount)}
              </span>
            </div>

            {/* Signatures */}
            <div className="border-t border-slate-200 pt-6 flex items-center justify-between text-[11px] text-slate-500">
              <div className="space-y-1">
                <div>Prepared By: _________________________</div>
                <div className="text-[10px] text-slate-400">Accounts Payable Officer</div>
              </div>
              <div className="space-y-1 text-center">
                <div>Approved By: _________________________</div>
                <div className="text-[10px] text-slate-400">Finance Manager</div>
              </div>
              <div className="space-y-1 text-right">
                <div>Receiver Signature: _________________________</div>
                <div className="text-[10px] text-slate-400">Supplier Acknowledgement</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
