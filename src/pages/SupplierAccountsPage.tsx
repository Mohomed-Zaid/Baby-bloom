import { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  Search,
  DollarSign,
  Clock,
  Printer,
  FileText,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Plus,
  Eye,
  Receipt,
  Download,
  Building2,
  CreditCard,
  X,
  RefreshCw,
  Phone,
  Mail,
  Scale,
  AlertTriangle,
} from 'lucide-react'
import {
  listSupplierBalances,
  listSupplierStatement,
  listSupplierPayments,
  paymentAction,
} from '../services/purchasing'
import {
  fetchUnpaidVendorPurchases,
  createAndPostSupplierPayment,
  fetchBankAccountsLookup,
} from '../services/financeService'
import { fetchBranchesLookup } from '../services/orderService'
import { formatLkr } from '../lib/currency'
import { colomboNow, formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { permissions } from '../config/permissions'
import type { PaymentMethod, PurchasePayment, SupplierBalance } from '../types/purchasing'

interface SupplierAccountsPageProps {
  mode?: 'balances' | 'statement' | 'payments'
}

export function SupplierAccountsPage({ mode = 'balances' }: SupplierAccountsPageProps) {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const activeBranchId = useBranchStore((s) => s.branchId)
  const userPermissions = useAuthStore((s) => s.user?.permissions)

  const canCreatePayment = userPermissions?.includes(permissions.supplierPaymentsCreate) ?? true
  const canPostPayment = userPermissions?.includes(permissions.supplierPaymentsPost) ?? true
  const canReversePayment = userPermissions?.includes(permissions.supplierPaymentsReverse) ?? true

  // URL Query Sync
  const urlVendor = searchParams.get('vendor') || searchParams.get('id')

  // ── Navigation Tabs ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'balances' | 'statement' | 'payments'>(mode)

  useEffect(() => {
    if (mode) setActiveTab(mode)
  }, [mode])

  // ── Filter States for Balances (Tab 1) ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'outstanding' | 'overdue' | 'settled' | 'advance'>('all')

  // ── Filter States for Statement (Tab 2) ──────────────────────────────────────
  const [selectedVendorId, setSelectedVendorId] = useState<string>(urlVendor || '')
  const [statementDateFrom, setStatementDateFrom] = useState(colomboNow().subtract(30, 'day').format('YYYY-MM-DD'))
  const [statementDateTo, setStatementDateTo] = useState(colomboNow().format('YYYY-MM-DD'))
  const [statementBranchId, setStatementBranchId] = useState<string>('')
  const [statementEntryType, setStatementEntryType] = useState<string>('')
  const [statementOutstandingOnly, setStatementOutstandingOnly] = useState<boolean>(false)

  // ── Filter States for Payments (Tab 3) ───────────────────────────────────────
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all')

  // ── Modals & Quick Actions ───────────────────────────────────────────────────
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentVendor, setPaymentVendor] = useState<SupplierBalance | null>(null)
  const [paymentBranchId, setPaymentBranchId] = useState(activeBranchId || '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentDate, setPaymentDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentBankAccountId, setPaymentBankAccountId] = useState('')
  const [paymentReferenceNumber, setPaymentReferenceNumber] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>('')

  // Printable Statement Modal
  const [printStatementVendor, setPrintStatementVendor] = useState<SupplierBalance | null>(null)

  // Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // ── Queries ──────────────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  const bankAccountsQuery = useQuery({
    queryKey: ['lookup', 'bank-accounts'],
    queryFn: fetchBankAccountsLookup,
  })

  // Supplier Balances Main List
  const balancesQuery = useQuery({
    queryKey: ['supplier-balances-list', searchQuery],
    queryFn: () => listSupplierBalances(searchQuery),
  })

  // Selected Vendor Statement List
  const statementQuery = useQuery({
    queryKey: [
      'supplier-statement-ledger',
      selectedVendorId,
      statementDateFrom,
      statementDateTo,
      statementBranchId,
      statementEntryType,
      statementOutstandingOnly,
    ],
    queryFn: () =>
      selectedVendorId
        ? listSupplierStatement(
            selectedVendorId,
            statementDateFrom || undefined,
            statementDateTo || undefined,
            statementBranchId || undefined,
            statementEntryType || undefined,
            statementOutstandingOnly
          )
        : [],
    enabled: !!selectedVendorId,
  })

  // Unpaid Purchases for Payment Allocation
  const unpaidPurchasesQuery = useQuery({
    queryKey: ['unpaid-purchases-for-payment', paymentVendor?.vendor_id],
    queryFn: () => (paymentVendor ? fetchUnpaidVendorPurchases(paymentVendor.vendor_id) : []),
    enabled: !!paymentVendor && isPaymentModalOpen,
  })

  // Supplier Payments History (Tab 3)
  const paymentsQuery = useQuery({
    queryKey: ['supplier-payments-history-list'],
    queryFn: listSupplierPayments,
  })

  // ── Filtered Balances ────────────────────────────────────────────────────────
  const filteredBalances = useMemo(() => {
    if (!balancesQuery.data) return []
    return balancesQuery.data.filter((v) => {
      // Balance status filter
      if (balanceFilter === 'outstanding' && Number(v.total_outstanding) <= 0) return false
      if (balanceFilter === 'overdue' && Number(v.overdue_amount) <= 0) return false
      if (balanceFilter === 'settled' && Number(v.total_outstanding) !== 0) return false
      if (balanceFilter === 'advance' && Number(v.total_outstanding) >= 0) return false

      return true
    })
  }, [balancesQuery.data, balanceFilter])

  // ── Filtered Payments ────────────────────────────────────────────────────────
  const filteredPayments = useMemo(() => {
    if (!paymentsQuery.data) return []
    return paymentsQuery.data.filter((p) => {
      if (paymentStatusFilter !== 'all' && p.status !== paymentStatusFilter) return false
      if (paymentSearch.trim()) {
        const s = paymentSearch.toLowerCase().trim()
        const matchesNo = p.payment_number?.toLowerCase().includes(s)
        const matchesVendor = p.vendor_name?.toLowerCase().includes(s) || p.vendor_code?.toLowerCase().includes(s)
        const matchesRef = p.reference_number?.toLowerCase().includes(s)
        if (!matchesNo && !matchesVendor && !matchesRef) return false
      }
      return true
    })
  }, [paymentsQuery.data, paymentStatusFilter, paymentSearch])

  // ── KPI Metrics ──────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const list = balancesQuery.data || []
    let totalOutstanding = 0
    let totalOverdue = 0
    let suppliersWithBalance = 0
    let totalAdvance = 0

    for (const v of list) {
      const out = Number(v.total_outstanding || 0)
      const ov = Number(v.overdue_amount || 0)
      if (out > 0) {
        totalOutstanding += out
        suppliersWithBalance++
      } else if (out < 0) {
        totalAdvance += Math.abs(out)
      }
      if (ov > 0) {
        totalOverdue += ov
      }
    }

    return {
      totalOutstanding,
      totalOverdue,
      suppliersWithBalance,
      totalAdvance,
      totalSuppliers: list.length,
    }
  }, [balancesQuery.data])

  // ── Open Payment Settlement Modal ────────────────────────────────────────────
  const handleOpenPaymentModal = (vendor?: SupplierBalance) => {
    if (vendor) {
      setPaymentVendor(vendor)
      setPaymentAmount(Math.max(0, Number(vendor.total_outstanding)))
    } else {
      setPaymentVendor(null)
      setPaymentAmount(0)
    }
    setPaymentBranchId(activeBranchId || (branchesQuery.data?.[0]?.id ?? ''))
    setPaymentMethod('cash')
    setPaymentDate(colomboNow().format('YYYY-MM-DD'))
    setPaymentBankAccountId('')
    setPaymentReferenceNumber('')
    setPaymentNotes('')
    setSelectedPurchaseId('')
    setIsPaymentModalOpen(true)
  }

  // ── Post Supplier Payment Mutation ───────────────────────────────────────────
  const postPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentVendor) throw new Error('Please select a supplier.')
      if (paymentAmount <= 0) throw new Error('Payment amount must be greater than zero.')
      if (!paymentBranchId) throw new Error('Please select a branch.')

      if (['bank', 'card', 'online'].includes(paymentMethod) && !paymentBankAccountId) {
        throw new Error('Please select a bank account for electronic disbursement.')
      }
      if (paymentMethod === 'cheque' && !paymentReferenceNumber.trim()) {
        throw new Error('Please enter the cheque reference number.')
      }

      return await createAndPostSupplierPayment({
        branch_id: paymentBranchId,
        vendor_id: paymentVendor.vendor_id,
        purchase_id: selectedPurchaseId || undefined,
        payment_date: paymentDate,
        payment_method: paymentMethod as 'cash' | 'bank' | 'card' | 'cheque' | 'online',
        amount: paymentAmount,
        bank_account_id: paymentBankAccountId || undefined,
        reference_number: paymentReferenceNumber || undefined,
        notes: paymentNotes || `Supplier settlement for ${paymentVendor.vendor_name}`,
      })
    },
    onSuccess: (res) => {
      showToast(`Supplier payment ${res?.document_number || 'posted'} successfully!`, 'success')
      setIsPaymentModalOpen(false)
      setPaymentVendor(null)
      queryClient.invalidateQueries({ queryKey: ['supplier-balances-list'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-statement-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-payments-history-list'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // ── Payment Action (Post / Reverse) Mutation ─────────────────────────────────
  const paymentActionMutation = useMutation({
    mutationFn: async ({ action, row }: { action: 'post' | 'reverse'; row: PurchasePayment }) => {
      let reason = ''
      if (action === 'reverse') {
        const inputReason = window.prompt('Please enter a mandatory reversal reason:')
        if (!inputReason || !inputReason.trim()) {
          throw new Error('Reversal reason is required.')
        }
        reason = inputReason.trim()
      }
      return await paymentAction(action, row.id, reason)
    },
    onSuccess: (res, variables) => {
      showToast(
        variables.action === 'reverse'
          ? `Payment reversed. Reversal entry ${res.document_number} posted.`
          : `Payment ${res.document_number} posted to ledger.`,
        'success'
      )
      queryClient.invalidateQueries({ queryKey: ['supplier-payments-history-list'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-balances-list'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-statement-ledger'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // ── Quick View Statement for a vendor ────────────────────────────────────────
  const handleViewVendorStatement = (vendor: SupplierBalance) => {
    setSelectedVendorId(vendor.vendor_id)
    setActiveTab('statement')
  }

  // ── Statement Summary ────────────────────────────────────────────────────────
  const statementSummary = useMemo(() => {
    const list = statementQuery.data || []
    let totalDebit = 0
    let totalCredit = 0
    let closingBalance = 0

    for (const row of list) {
      totalDebit += Number(row.debit_amount || 0)
      totalCredit += Number(row.credit_amount || 0)
      closingBalance = Number(row.running_balance || 0)
    }

    return { totalDebit, totalCredit, closingBalance, entryCount: list.length }
  }, [statementQuery.data])

  // ── Export CSV for Statement ─────────────────────────────────────────────────
  const handleExportStatementCsv = () => {
    const rows = statementQuery.data || []
    if (rows.length === 0) return

    const selectedVen = balancesQuery.data?.find((v) => v.vendor_id === selectedVendorId)
    const venName = selectedVen ? selectedVen.vendor_name : 'Supplier'
    const headers = [
      'Date',
      'Reference Number',
      'Transaction Type',
      'Debit (Payments / Returns)',
      'Credit (Purchases / Invoices)',
      'Running Balance',
      'Due Date',
      'Overdue',
      'Branch',
      'User',
      'Remarks',
    ]

    const csvRows = rows.map((r) => [
      r.entry_date,
      `"${r.reference_number || ''}"`,
      r.entry_type,
      Number(r.debit_amount || 0).toFixed(2),
      Number(r.credit_amount || 0).toFixed(2),
      Number(r.running_balance || 0).toFixed(2),
      r.due_date || '',
      r.overdue ? 'YES' : 'NO',
      `"${r.branch_name || ''}"`,
      `"${r.created_user || ''}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Supplier_Statement_${venName.replace(/\s+/g, '_')}_${colomboNow().format('YYYYMMDD')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Active Selected Vendor for Statement ─────────────────────────────────────
  const currentStatementVendor = useMemo(() => {
    return balancesQuery.data?.find((v) => v.vendor_id === selectedVendorId) || null
  }, [balancesQuery.data, selectedVendorId])

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
            <AlertCircle className="w-5 h-5 text-rose-400" />
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
        {/* Main Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-teal-900/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/30 rounded-2xl shadow-lg shadow-teal-950/30">
              <Truck className="w-8 h-8 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Supplier Balances &amp; Statements</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">
                  Accounts Payable Subledger
                </span>
              </div>
              <p className="text-sm text-teal-200/70 mt-0.5">
                Real-time creditor ledger, purchase invoice settlements, running ledger statements, and payment disbursement tracking.
              </p>
            </div>
          </div>

          {/* Quick Sub-navigation Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/purchases"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Purchases
            </Link>
            <Link
              to="/purchase-returns"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Purchase Returns
            </Link>
            <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-800/60 border border-teal-500/40 shadow-sm">
              Supplier Balances
            </div>
            <Link
              to="/customers/balances"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Customer Balances
            </Link>
          </div>
        </div>

        {/* ── KPI Summary Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Outstanding Payables */}
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
              {balancesQuery.isLoading ? '...' : formatLkr(metrics.totalOutstanding)}
            </div>
            <div className="text-xs text-teal-300/60 mt-1 flex items-center gap-1">
              <span>Across all vendor creditor accounts</span>
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
              {balancesQuery.isLoading ? '...' : formatLkr(metrics.totalOverdue)}
            </div>
            <div className="text-xs text-rose-300/70 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Invoices past credit payment terms</span>
            </div>
          </div>

          {/* Card 3: Active Creditors */}
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
              {balancesQuery.isLoading ? '...' : metrics.suppliersWithBalance}
            </div>
            <div className="text-xs text-emerald-300/60 mt-1">
              <span>Out of {metrics.totalSuppliers} registered suppliers</span>
            </div>
          </div>

          {/* Card 4: Supplier Advances */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300/80 uppercase tracking-wider">
                Supplier Advances
              </span>
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-2">
              {balancesQuery.isLoading ? '...' : formatLkr(metrics.totalAdvance)}
            </div>
            <div className="text-xs text-cyan-300/60 mt-1">
              <span>Prepayments &amp; credit balances available</span>
            </div>
          </div>
        </div>

        {/* ── Sub-module Tabs ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-teal-900/50 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('balances')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === 'balances'
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40 shadow-md shadow-teal-950/40'
                  : 'text-teal-300/60 hover:text-teal-200 hover:bg-teal-900/30'
              }`}
            >
              <Scale className="w-4 h-4" />
              Supplier Balances Ledger
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-teal-950/60 border border-teal-800/40">
                {balancesQuery.data?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('statement')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === 'statement'
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40 shadow-md shadow-teal-950/40'
                  : 'text-teal-300/60 hover:text-teal-200 hover:bg-teal-900/30'
              }`}
            >
              <FileText className="w-4 h-4" />
              Supplier Statement &amp; Running Ledger
              {selectedVendorId && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
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
              Payment Settlements History
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-teal-950/60 border border-teal-800/40">
                {paymentsQuery.data?.length || 0}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['supplier-balances-list'] })
                queryClient.invalidateQueries({ queryKey: ['supplier-statement-ledger'] })
                queryClient.invalidateQueries({ queryKey: ['supplier-payments-history-list'] })
                showToast('Supplier accounts synchronized!', 'info')
              }}
              className="p-2 rounded-xl bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 text-teal-300 hover:text-white transition"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {canCreatePayment && (
              <button
                onClick={() => handleOpenPaymentModal()}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                Record Supplier Payment
              </button>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: SUPPLIER BALANCES LEDGER                                        */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'balances' && (
          <div className="space-y-4">
            {/* Toolbar Filters */}
            <div className="bg-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto flex-1">
                <div className="relative w-full md:max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by supplier name, code, phone, or email..."
                    className="w-full pl-10 pr-4 py-2 bg-teal-950/50 border border-teal-800/40 rounded-xl text-sm text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/40"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400/60 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  <button
                    onClick={() => setBalanceFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      balanceFilter === 'all'
                        ? 'bg-teal-500/30 border border-teal-500/50 text-white'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    All ({balancesQuery.data?.length || 0})
                  </button>
                  <button
                    onClick={() => setBalanceFilter('outstanding')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      balanceFilter === 'outstanding'
                        ? 'bg-amber-500/30 border border-amber-500/50 text-amber-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Outstanding ({metrics.suppliersWithBalance})
                  </button>
                  <button
                    onClick={() => setBalanceFilter('overdue')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      balanceFilter === 'overdue'
                        ? 'bg-rose-500/30 border border-rose-500/50 text-rose-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Overdue
                  </button>
                  <button
                    onClick={() => setBalanceFilter('settled')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      balanceFilter === 'settled'
                        ? 'bg-emerald-500/30 border border-emerald-500/50 text-emerald-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Settled
                  </button>
                  <button
                    onClick={() => setBalanceFilter('advance')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      balanceFilter === 'advance'
                        ? 'bg-cyan-500/30 border border-cyan-500/50 text-cyan-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    In Advance
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <span className="text-xs text-teal-300/70">
                  Showing <strong>{filteredBalances.length}</strong> of{' '}
                  <strong>{balancesQuery.data?.length || 0}</strong> suppliers
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

            {/* Table Panel */}
            <div className="bg-[#0a2321]/90 border border-teal-800/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-teal-950/70 border-b border-teal-800/50 text-teal-300/80 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Supplier</th>
                      <th className="py-3.5 px-4 text-right">Opening (LKR)</th>
                      <th className="py-3.5 px-4 text-right">Purchases (LKR)</th>
                      <th className="py-3.5 px-4 text-right">Returns (LKR)</th>
                      <th className="py-3.5 px-4 text-right">Payments (LKR)</th>
                      <th className="py-3.5 px-4 text-right">Overdue (LKR)</th>
                      <th className="py-3.5 px-4 text-right">Total Net Payable</th>
                      <th className="py-3.5 px-4 text-center">Last Activity</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/30">
                    {balancesQuery.isLoading ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Loading supplier balance subledgers...
                        </td>
                      </tr>
                    ) : filteredBalances.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center">
                          <Truck className="w-8 h-8 text-teal-400/40 mx-auto mb-2" />
                          <p className="text-base font-semibold text-white">No supplier balances match your criteria</p>
                          <p className="text-xs text-teal-300/60 mt-1">
                            Try adjusting your search query or filter tags.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredBalances.map((vendor) => {
                        const outstanding = Number(vendor.total_outstanding || 0)
                        const overdue = Number(vendor.overdue_amount || 0)

                        return (
                          <tr
                            key={vendor.vendor_id}
                            className="hover:bg-teal-900/20 transition-colors group"
                          >
                            {/* Supplier Info */}
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white group-hover:text-teal-200 transition">
                                {vendor.vendor_name}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-teal-300/70">
                                <span className="font-mono bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-800/40">
                                  {vendor.vendor_code || 'VEND-???'}
                                </span>
                                {vendor.phone && (
                                  <span className="flex items-center gap-1 text-slate-400">
                                    <Phone className="w-3 h-3 text-teal-400/60" />
                                    {vendor.phone}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Opening Balance */}
                            <td className="py-3.5 px-4 text-right font-mono text-teal-200/80">
                              {Number(vendor.opening_balance || 0) !== 0
                                ? formatLkr(vendor.opening_balance)
                                : '—'}
                            </td>

                            {/* Purchases */}
                            <td className="py-3.5 px-4 text-right font-mono text-white">
                              {formatLkr(vendor.purchase_balance || 0)}
                            </td>

                            {/* Returns */}
                            <td className="py-3.5 px-4 text-right font-mono text-amber-300">
                              {Number(vendor.purchase_return_balance || 0) > 0
                                ? formatLkr(vendor.purchase_return_balance)
                                : '—'}
                            </td>

                            {/* Payments */}
                            <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                              {Number(vendor.payment_balance || 0) > 0
                                ? formatLkr(vendor.payment_balance)
                                : '—'}
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

                            {/* Total Net Outstanding */}
                            <td className="py-3.5 px-4 text-right font-mono font-bold">
                              {outstanding > 0 ? (
                                <span className="text-amber-300 text-base">{formatLkr(outstanding)}</span>
                              ) : outstanding < 0 ? (
                                <span className="text-cyan-300 text-base">
                                  {formatLkr(Math.abs(outstanding))} (Adv)
                                </span>
                              ) : (
                                <span className="text-emerald-400 flex items-center justify-end gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Settled
                                </span>
                              )}
                            </td>

                            {/* Last Activity */}
                            <td className="py-3.5 px-4 text-center text-xs text-teal-300/70">
                              {vendor.last_transaction_date ? (
                                <span>{formatBusinessDate(vendor.last_transaction_date)}</span>
                              ) : (
                                <span className="text-teal-500/40">—</span>
                              )}
                              {vendor.next_due_date && (
                                <div className="text-[11px] text-rose-300/80 mt-0.5">
                                  Due: {formatBusinessDate(vendor.next_due_date)}
                                </div>
                              )}
                            </td>

                            {/* Row Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {canCreatePayment && outstanding > 0 && (
                                  <button
                                    onClick={() => handleOpenPaymentModal(vendor)}
                                    className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-sm"
                                    title="Pay Supplier"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Pay
                                  </button>
                                )}
                                <button
                                  onClick={() => handleViewVendorStatement(vendor)}
                                  className="px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 rounded-lg text-xs font-medium transition flex items-center gap-1"
                                  title="View Statement of Account"
                                >
                                  <Eye className="w-3 h-3" />
                                  Statement
                                </button>
                                <button
                                  onClick={() => setPrintStatementVendor(vendor)}
                                  className="p-1 text-teal-400 hover:text-white hover:bg-teal-900/40 rounded-lg transition"
                                  title="Print Statement of Account"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
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

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: SUPPLIER STATEMENT & RUNNING LEDGER                             */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'statement' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Supplier Selector */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Select Supplier <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="">-- Choose a Supplier to view Statement --</option>
                    {balancesQuery.data?.map((v) => (
                      <option key={v.vendor_id} value={v.vendor_id}>
                        {v.vendor_name} ({v.vendor_code}) — Balance: {formatLkr(v.total_outstanding)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Date From
                  </label>
                  <input
                    type="date"
                    value={statementDateFrom}
                    onChange={(e) => setStatementDateFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Date To
                  </label>
                  <input
                    type="date"
                    value={statementDateTo}
                    onChange={(e) => setStatementDateTo(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                {/* Branch */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Branch Filter
                  </label>
                  <select
                    value={statementBranchId}
                    onChange={(e) => setStatementBranchId(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="">All Branches</option>
                    {branchesQuery.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Secondary Filter Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-teal-900/40">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Transaction Type Filter */}
                  <select
                    value={statementEntryType}
                    onChange={(e) => setStatementEntryType(e.target.value)}
                    className="px-3 py-1.5 bg-teal-950/60 border border-teal-800/50 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="">All Transaction Types</option>
                    <option value="purchase">Purchases (Bills)</option>
                    <option value="payment">Payments Settled</option>
                    <option value="purchase_return">Purchase Returns</option>
                    <option value="opening_balance">Opening Balance</option>
                    <option value="supplier_advance">Supplier Advance</option>
                    <option value="reversal">Reversals</option>
                  </select>

                  {/* Outstanding Only Toggle */}
                  <label className="flex items-center gap-2 text-xs font-medium text-teal-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={statementOutstandingOnly}
                      onChange={(e) => setStatementOutstandingOnly(e.target.checked)}
                      className="rounded border-teal-700 bg-teal-950 text-teal-500 focus:ring-teal-500"
                    />
                    <span>Outstanding balances only</span>
                  </label>

                  {/* Date Range Presets */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setStatementDateFrom(colomboNow().subtract(30, 'day').format('YYYY-MM-DD'))
                        setStatementDateTo(colomboNow().format('YYYY-MM-DD'))
                      }}
                      className="px-2 py-1 bg-teal-950/40 hover:bg-teal-900/40 rounded text-[11px] text-teal-300"
                    >
                      Last 30 Days
                    </button>
                    <button
                      onClick={() => {
                        setStatementDateFrom(colomboNow().startOf('month').format('YYYY-MM-DD'))
                        setStatementDateTo(colomboNow().format('YYYY-MM-DD'))
                      }}
                      className="px-2 py-1 bg-teal-950/40 hover:bg-teal-900/40 rounded text-[11px] text-teal-300"
                    >
                      This Month
                    </button>
                    <button
                      onClick={() => {
                        setStatementDateFrom(colomboNow().startOf('year').format('YYYY-MM-DD'))
                        setStatementDateTo(colomboNow().format('YYYY-MM-DD'))
                      }}
                      className="px-2 py-1 bg-teal-950/40 hover:bg-teal-900/40 rounded text-[11px] text-teal-300"
                    >
                      This Year
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={!selectedVendorId || (statementQuery.data?.length || 0) === 0}
                    onClick={handleExportStatementCsv}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-teal-300 bg-teal-950/50 border border-teal-800/50 hover:bg-teal-900/60 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>

                  <button
                    disabled={!selectedVendorId}
                    onClick={() => {
                      if (currentStatementVendor) {
                        setPrintStatementVendor(currentStatementVendor)
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-teal-600/80 hover:bg-teal-500 border border-teal-500/50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Statement
                  </button>
                </div>
              </div>
            </div>

            {/* Selected Supplier Summary Card */}
            {selectedVendorId && currentStatementVendor && (
              <div className="bg-gradient-to-r from-teal-950/70 via-[#0a2321]/90 to-teal-950/70 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-500/20 border border-teal-500/30 rounded-xl text-teal-300">
                      <Truck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-white">
                          {currentStatementVendor.vendor_name}
                        </h2>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-teal-900/60 border border-teal-700/50 text-teal-300">
                          {currentStatementVendor.vendor_code}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-teal-300/70 mt-1">
                        {currentStatementVendor.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-teal-400" />
                            {currentStatementVendor.phone}
                          </span>
                        )}
                        {currentStatementVendor.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3 text-teal-400" />
                            {currentStatementVendor.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Statement Totals Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-teal-950/60 border border-teal-800/40 rounded-xl p-3">
                    <div>
                      <div className="text-[11px] text-teal-400/80 uppercase tracking-wider">
                        Opening Balance
                      </div>
                      <div className="text-sm font-mono font-semibold text-teal-200 mt-0.5">
                        {formatLkr(currentStatementVendor.opening_balance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-teal-400/80 uppercase tracking-wider">
                        Total Debits (Paid/Ret)
                      </div>
                      <div className="text-sm font-mono font-semibold text-emerald-300 mt-0.5">
                        {formatLkr(statementSummary.totalDebit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-teal-400/80 uppercase tracking-wider">
                        Total Credits (Purchases)
                      </div>
                      <div className="text-sm font-mono font-semibold text-white mt-0.5">
                        {formatLkr(statementSummary.totalCredit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-amber-300 uppercase tracking-wider font-bold">
                        Closing Payable
                      </div>
                      <div className="text-base font-mono font-black text-amber-300 mt-0.5">
                        {formatLkr(
                          statementSummary.entryCount > 0
                            ? statementSummary.closingBalance
                            : currentStatementVendor.total_outstanding
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Statement Ledger Table */}
            <div className="bg-[#0a2321]/90 border border-teal-800/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-teal-950/70 border-b border-teal-800/50 text-teal-300/80 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Reference No</th>
                      <th className="py-3 px-4">Branch</th>
                      <th className="py-3 px-4 text-right">Debit (Paid / Ret)</th>
                      <th className="py-3 px-4 text-right">Credit (Purchases)</th>
                      <th className="py-3 px-4 text-right">Running Balance</th>
                      <th className="py-3 px-4 text-center">Due / Status</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/30">
                    {!selectedVendorId ? (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-teal-300/70">
                          <FileText className="w-10 h-10 text-teal-500/30 mx-auto mb-2" />
                          <p className="text-base font-semibold text-white">Select a supplier above</p>
                          <p className="text-xs text-teal-300/60 mt-1">
                            Choose any registered supplier to load their deterministic running statement of account.
                          </p>
                        </td>
                      </tr>
                    ) : statementQuery.isLoading ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Calculating chronological statement entries...
                        </td>
                      </tr>
                    ) : (statementQuery.data?.length || 0) === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center">
                          <CheckCircle2 className="w-8 h-8 text-teal-400/40 mx-auto mb-2" />
                          <p className="text-base font-semibold text-white">No ledger activity found</p>
                          <p className="text-xs text-teal-300/60 mt-1">
                            No transactions found for this supplier within the selected period.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      statementQuery.data?.map((entry) => {
                        const debit = Number(entry.debit_amount || 0)
                        const credit = Number(entry.credit_amount || 0)
                        const balance = Number(entry.running_balance || 0)

                        const typeBadgeColor =
                          entry.entry_type === 'purchase'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : entry.entry_type === 'payment'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : entry.entry_type === 'purchase_return'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : entry.entry_type === 'opening_balance'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-teal-500/20 text-teal-300 border-teal-500/30'

                        return (
                          <tr key={entry.id} className="hover:bg-teal-900/20 transition-colors">
                            {/* Date */}
                            <td className="py-3 px-4 font-mono text-xs text-teal-200">
                              {formatBusinessDate(entry.entry_date)}
                            </td>

                            {/* Type */}
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${typeBadgeColor}`}
                              >
                                {entry.entry_type.replace(/_/g, ' ')}
                              </span>
                            </td>

                            {/* Reference */}
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-white">
                              {entry.reference_number || '—'}
                            </td>

                            {/* Branch */}
                            <td className="py-3 px-4 text-xs text-teal-300/70">
                              {entry.branch_name || 'Main Branch'}
                            </td>

                            {/* Debit (Payments & Returns) */}
                            <td className="py-3 px-4 text-right font-mono text-emerald-400">
                              {debit > 0 ? formatLkr(debit) : '—'}
                            </td>

                            {/* Credit (Purchases) */}
                            <td className="py-3 px-4 text-right font-mono text-white">
                              {credit > 0 ? formatLkr(credit) : '—'}
                            </td>

                            {/* Running Balance */}
                            <td className="py-3 px-4 text-right font-mono font-bold">
                              <span
                                className={
                                  balance > 0
                                    ? 'text-amber-300'
                                    : balance < 0
                                    ? 'text-cyan-300'
                                    : 'text-emerald-400'
                                }
                              >
                                {formatLkr(balance)}
                              </span>
                            </td>

                            {/* Due / Overdue Status */}
                            <td className="py-3 px-4 text-center">
                              {entry.overdue ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  Overdue
                                </span>
                              ) : entry.due_date ? (
                                <span className="text-xs text-teal-300/70">
                                  {formatBusinessDate(entry.due_date)}
                                </span>
                              ) : (
                                <span className="text-teal-500/40">—</span>
                              )}
                            </td>

                            {/* Remarks */}
                            <td className="py-3 px-4 text-xs text-teal-300/70 max-w-xs truncate">
                              {entry.notes || '—'}
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

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: SUPPLIER PAYMENT HISTORY & SETTLEMENTS                          */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            {/* Toolbar */}
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
                    onClick={() => setPaymentStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentStatusFilter === 'all'
                        ? 'bg-teal-500/30 border border-teal-500/50 text-white'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    All Statuses
                  </button>
                  <button
                    onClick={() => setPaymentStatusFilter('posted')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentStatusFilter === 'posted'
                        ? 'bg-emerald-500/30 border border-emerald-500/50 text-emerald-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Posted
                  </button>
                  <button
                    onClick={() => setPaymentStatusFilter('draft')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentStatusFilter === 'draft'
                        ? 'bg-amber-500/30 border border-amber-500/50 text-amber-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Draft
                  </button>
                  <button
                    onClick={() => setPaymentStatusFilter('reversed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      paymentStatusFilter === 'reversed'
                        ? 'bg-rose-500/30 border border-rose-500/50 text-rose-200'
                        : 'bg-teal-950/40 border border-teal-800/40 text-teal-300/70 hover:text-white'
                    }`}
                  >
                    Reversed
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-teal-300/70">
                  Total Payments: <strong>{filteredPayments.length}</strong>
                </span>
              </div>
            </div>

            {/* Payments Table */}
            <div className="bg-[#0a2321]/90 border border-teal-800/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-teal-950/70 border-b border-teal-800/50 text-teal-300/80 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Payment No</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Supplier</th>
                      <th className="py-3.5 px-4">Method</th>
                      <th className="py-3.5 px-4">Bank / Reference</th>
                      <th className="py-3.5 px-4 text-right">Amount (LKR)</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-center">Clearing</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/30">
                    {paymentsQuery.isLoading ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Loading supplier payments history...
                        </td>
                      </tr>
                    ) : filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center">
                          <Receipt className="w-8 h-8 text-teal-400/40 mx-auto mb-2" />
                          <p className="text-base font-semibold text-white">No payment records found</p>
                          <p className="text-xs text-teal-300/60 mt-1">
                            Disbursed payments will appear here with audit trail and clearance status.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p) => {
                        return (
                          <tr key={p.id} className="hover:bg-teal-900/20 transition-colors">
                            {/* Payment No */}
                            <td className="py-3.5 px-4 font-mono font-semibold text-teal-200 text-xs">
                              {p.payment_number}
                            </td>

                            {/* Date */}
                            <td className="py-3.5 px-4 font-mono text-xs text-teal-300/80">
                              {formatBusinessDate(p.payment_date)}
                            </td>

                            {/* Supplier */}
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white">{p.vendor_name}</div>
                              <div className="text-xs text-teal-400/70 font-mono">{p.vendor_code}</div>
                            </td>

                            {/* Method */}
                            <td className="py-3.5 px-4">
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-900/60 border border-teal-700/50 text-teal-200 uppercase">
                                {p.payment_method}
                              </span>
                            </td>

                            {/* Bank / Reference */}
                            <td className="py-3.5 px-4 text-xs text-teal-300/80">
                              {p.bank_account_name && (
                                <div className="font-medium text-white">{p.bank_account_name}</div>
                              )}
                              {p.reference_number ? (
                                <span className="font-mono text-teal-400/80">Ref: {p.reference_number}</span>
                              ) : (
                                <span className="text-teal-500/40">—</span>
                              )}
                            </td>

                            {/* Amount */}
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
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

                            {/* Clearing Status */}
                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                  p.clearing_status === 'cleared'
                                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                                    : p.clearing_status === 'pending'
                                    ? 'bg-amber-500/10 text-amber-300/80 border-amber-500/20'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                }`}
                              >
                                {p.clearing_status}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {p.status === 'draft' && canPostPayment && (
                                  <button
                                    onClick={() => paymentActionMutation.mutate({ action: 'post', row: p })}
                                    disabled={paymentActionMutation.isPending}
                                    className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 rounded-lg text-xs font-semibold transition"
                                  >
                                    Post
                                  </button>
                                )}
                                {p.status === 'posted' && canReversePayment && (
                                  <button
                                    onClick={() => paymentActionMutation.mutate({ action: 'reverse', row: p })}
                                    disabled={paymentActionMutation.isPending}
                                    className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-lg text-xs transition"
                                    title="Reverse Payment"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
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
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: SUPPLIER SETTLEMENT PAYMENT DIALOG                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#082321] border border-teal-700/60 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-white my-8">
            <div className="flex items-center justify-between border-b border-teal-800/50 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Record Supplier Payment</h3>
                  <p className="text-xs text-teal-300/70">
                    Settle creditor accounts, allocate against unpaid purchases, and update cash books.
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

            {/* Supplier Selector / Info */}
            <div>
              <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                Supplier Account <span className="text-rose-400">*</span>
              </label>
              <select
                value={paymentVendor?.vendor_id || ''}
                onChange={(e) => {
                  const ven = balancesQuery.data?.find((v) => v.vendor_id === e.target.value) || null
                  setPaymentVendor(ven)
                  if (ven) {
                    setPaymentAmount(Math.max(0, Number(ven.total_outstanding)))
                  }
                  setSelectedPurchaseId('')
                }}
                className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
              >
                <option value="">-- Choose Supplier --</option>
                {balancesQuery.data?.map((v) => (
                  <option key={v.vendor_id} value={v.vendor_id}>
                    {v.vendor_name} ({v.vendor_code}) — Balance: {formatLkr(v.total_outstanding)}
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier Live Stats Banner */}
            {paymentVendor && (
              <div className="bg-teal-950/60 border border-teal-800/40 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-teal-400/80">Total Outstanding:</span>{' '}
                  <strong className="text-amber-300 font-mono text-sm">
                    {formatLkr(paymentVendor.total_outstanding)}
                  </strong>
                </div>
                <div>
                  <span className="text-teal-400/80">Overdue Amount:</span>{' '}
                  <strong className="text-rose-300 font-mono text-sm">
                    {formatLkr(paymentVendor.overdue_amount)}
                  </strong>
                </div>
              </div>
            )}

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Branch */}
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Disbursing Branch <span className="text-rose-400">*</span>
                </label>
                <select
                  value={paymentBranchId}
                  onChange={(e) => setPaymentBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="">Select Branch</option>
                  {branchesQuery.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Payment Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Payment Method <span className="text-rose-400">*</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="cash">Cash in Hand</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Company Debit / Credit Card</option>
                  <option value="online">Online / Wire</option>
                  <option value="supplier_advance">Supplier Advance Deduction</option>
                </select>
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-teal-300/80">
                    Payment Amount (LKR) <span className="text-rose-400">*</span>
                  </label>
                  {paymentVendor && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentAmount(Math.max(0, Number(paymentVendor.total_outstanding)))
                        }
                        className="text-[10px] text-teal-300 hover:text-white underline"
                      >
                        Full Balance
                      </button>
                      {Number(paymentVendor.overdue_amount) > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentAmount(Number(paymentVendor.overdue_amount))}
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
                  min="0.01"
                  step="0.01"
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Bank Account (Conditional) */}
              {['bank', 'card', 'online', 'cheque'].includes(paymentMethod) && (
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Bank Account <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={paymentBankAccountId}
                    onChange={(e) => setPaymentBankAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Select Bank Account</option>
                    {bankAccountsQuery.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name ? `${b.bank_name} - ` : ''}
                        {b.account_name} ({b.account_number})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reference / Cheque No */}
              <div>
                <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                  Reference / Cheque No {paymentMethod === 'cheque' && <span className="text-rose-400">*</span>}
                </label>
                <input
                  type="text"
                  value={paymentReferenceNumber}
                  onChange={(e) => setPaymentReferenceNumber(e.target.value)}
                  placeholder={paymentMethod === 'cheque' ? 'Cheque # e.g. CHQ-98214' : 'Bank reference or memo'}
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Unpaid Purchases Bill Allocation (Optional) */}
            {paymentVendor && (
              <div className="space-y-2 border-t border-teal-900/50 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-teal-300/80">
                    Allocate to Specific Purchase Bill (Optional)
                  </label>
                  <span className="text-[11px] text-teal-400/60">
                    Leave unselected for on-account unallocated settlement
                  </span>
                </div>
                <select
                  value={selectedPurchaseId}
                  onChange={(e) => {
                    setSelectedPurchaseId(e.target.value)
                    if (e.target.value) {
                      const pur = unpaidPurchasesQuery.data?.find((p) => p.id === e.target.value)
                      if (pur) {
                        setPaymentAmount(pur.balance_amount)
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="">-- Apply to General Account (Oldest invoices settled first) --</option>
                  {unpaidPurchasesQuery.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.purchase_number} ({formatBusinessDate(p.purchase_date)}) — Due:{' '}
                      {formatLkr(p.balance_amount)} (Total: {formatLkr(p.grand_total)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                Internal Remarks / Notes
              </label>
              <input
                type="text"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="e.g. Settlement for September invoices / Wire transfer ref"
                className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-teal-800/50 pt-4">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-teal-300 hover:text-white bg-teal-950/60 border border-teal-800/40 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={postPaymentMutation.isPending || paymentAmount <= 0 || !paymentVendor}
                onClick={() => postPaymentMutation.mutate()}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition"
              >
                {postPaymentMutation.isPending && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                Post Supplier Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: PRINTABLE A4 SUPPLIER STATEMENT OF ACCOUNT                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {printStatementVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-4xl w-full p-8 shadow-2xl my-8 space-y-6 print:p-0 print:m-0 print:shadow-none print:w-full">
            {/* Action Bar (Hidden in Print) */}
            <div className="flex items-center justify-between border-b pb-4 no-print">
              <div className="flex items-center gap-2 text-slate-700">
                <Printer className="w-5 h-5 text-teal-700" />
                <span className="font-bold text-sm">Print Statement Preview</span>
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
                  onClick={() => setPrintStatementVendor(null)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Branded Statement Document Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-6">
              <div>
                <h1 className="text-3xl font-black text-teal-900 tracking-tight">BABY BLOOM</h1>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Premium Baby Care, Clothing &amp; Maternity Essentials
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  124 Galle Road, Colombo 03, Sri Lanka <br />
                  Hotline: +94 11 234 5678 | Email: accounts@babybloom.lk
                </p>
              </div>
              <div className="text-right">
                <div className="inline-block px-3 py-1 bg-teal-50 border border-teal-200 rounded text-teal-800 text-xs font-bold uppercase tracking-wider">
                  Statement of Account
                </div>
                <div className="text-xs text-slate-500 mt-2 space-y-0.5">
                  <div>
                    Statement Date: <strong>{colomboNow().format('DD/MM/YYYY')}</strong>
                  </div>
                  <div>
                    Currency: <strong>LKR (Sri Lankan Rupee)</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Supplier & Period Details */}
            <div className="grid grid-cols-2 gap-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Supplier / Creditor Details:
                </div>
                <div className="text-base font-bold text-slate-900">
                  {printStatementVendor.vendor_name}
                </div>
                <div className="text-slate-600 mt-0.5">
                  Code: <span className="font-mono font-semibold">{printStatementVendor.vendor_code}</span>
                </div>
                {printStatementVendor.phone && <div>Tel: {printStatementVendor.phone}</div>}
                {printStatementVendor.email && <div>Email: {printStatementVendor.email}</div>}
              </div>

              <div className="text-right flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Account Status:
                  </div>
                  <div className="text-sm font-semibold">
                    Net Balance Payable:{' '}
                    <span className="text-base font-bold text-teal-900">
                      {formatLkr(printStatementVendor.total_outstanding)}
                    </span>
                  </div>
                  {Number(printStatementVendor.overdue_amount) > 0 && (
                    <div className="text-rose-600 font-semibold mt-0.5">
                      Past Due Overdue: {formatLkr(printStatementVendor.overdue_amount)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Summary Box */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs border border-slate-200 rounded-lg p-3 bg-slate-50 font-mono">
              <div>
                <div className="text-slate-400 text-[10px] uppercase">Opening Balance</div>
                <div className="font-bold text-slate-800 text-sm mt-0.5">
                  {formatLkr(printStatementVendor.opening_balance)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px] uppercase">Total Purchases</div>
                <div className="font-bold text-slate-800 text-sm mt-0.5">
                  {formatLkr(printStatementVendor.purchase_balance)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px] uppercase">Settlements / Returns</div>
                <div className="font-bold text-emerald-700 text-sm mt-0.5">
                  {formatLkr(
                    Number(printStatementVendor.payment_balance || 0) +
                      Number(printStatementVendor.purchase_return_balance || 0)
                  )}
                </div>
              </div>
              <div>
                <div className="text-teal-700 text-[10px] uppercase font-bold">Total Net Payable</div>
                <div className="font-black text-teal-900 text-base mt-0.5">
                  {formatLkr(printStatementVendor.total_outstanding)}
                </div>
              </div>
            </div>

            {/* Statement Entries Preview */}
            <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Debit (Paid)</th>
                    <th className="py-2.5 px-3 text-right">Credit (Purchases)</th>
                    <th className="py-2.5 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {statementQuery.data && statementQuery.data.length > 0 ? (
                    statementQuery.data.slice(0, 30).map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 px-3">{formatBusinessDate(row.entry_date)}</td>
                        <td className="py-2 px-3 font-semibold">{row.reference_number}</td>
                        <td className="py-2 px-3 capitalize">{row.entry_type.replace(/_/g, ' ')}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">
                          {Number(row.debit_amount) > 0 ? formatLkr(row.debit_amount) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-800">
                          {Number(row.credit_amount) > 0 ? formatLkr(row.credit_amount) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {formatLkr(row.running_balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-400">
                        Summary ledger balance: {formatLkr(printStatementVendor.total_outstanding)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer / Remittance */}
            <div className="border-t border-slate-200 pt-4 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">Remittance &amp; Inquiries:</p>
              <p>
                Please address any statement discrepancies or invoice queries to the Finance &amp; Accounts Department within 7 days of statement generation.
              </p>
              <div className="flex items-center justify-between pt-6 text-slate-400 text-[11px]">
                <span>Generated by Baby Bloom ERP Accounts Payable Module</span>
                <span>Authorized Signatory: _________________________</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
