import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Search,
  DollarSign,
  TrendingDown,
  Clock,
  Printer,
  FileText,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Download,
  X,
  RefreshCw,
  Phone,
} from 'lucide-react'
import { listCustomerBalances, listCustomerStatement } from '../services/sales'
import {
  fetchCustomerReceivablesSummary,
  fetchUnpaidCustomerInvoices,
  createAndPostCustomerReceipt,
  fetchBankAccountsLookup,
  fetchCustomerReceipts,
} from '../services/financeService'
import { fetchBranchesLookup } from '../services/orderService'
import { formatLkr } from '../lib/currency'
import { colomboNow, formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { permissions } from '../config/permissions'
import type { CustomerBalance } from '../types/sales'

interface CustomerBalancesPageProps {
  mode?: 'balances' | 'statement' | 'receipts'
}

export function CustomerBalancesPage({ mode = 'balances' }: CustomerBalancesPageProps) {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const activeBranchId = useBranchStore((s) => s.branchId)
  const userPermissions = useAuthStore((s) => s.user?.permissions)

  const canReceivePayment = userPermissions?.includes(permissions.receivablesReceive) ?? true

  // URL Query Sync
  const urlCustomer = searchParams.get('customer') || searchParams.get('id')

  // ── Navigation Tabs ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'balances' | 'statement' | 'receipts'>(mode)

  // ── Filter States for Balances (Tab 1) ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'outstanding' | 'overdue' | 'settled' | 'credit'>('all')
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('all')

  // ── Filter States for Statement (Tab 2) ──────────────────────────────────────
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(urlCustomer || '')
  const [statementDateFrom, setStatementDateFrom] = useState(colomboNow().subtract(30, 'day').format('YYYY-MM-DD'))
  const [statementDateTo, setStatementDateTo] = useState(colomboNow().format('YYYY-MM-DD'))
  const [statementBranchId, setStatementBranchId] = useState<string>('')
  const [statementEntryType] = useState<string>('')
  const [statementOutstandingOnly] = useState<boolean>(false)

  // ── Modals & Quick Actions ───────────────────────────────────────────────────
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)
  const [receiptCustomer, setReceiptCustomer] = useState<CustomerBalance | null>(null)
  const [receiptBranchId, setReceiptBranchId] = useState(activeBranchId || '')
  const [receiptMethod, setReceiptMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'cheque'>('cash')
  const [receiptAmount, setReceiptAmount] = useState<number>(0)
  const [receiptBankAccountId, setReceiptBankAccountId] = useState('')
  const [receiptCardReference, setReceiptCardReference] = useState('')
  const [receiptChequeNo, setReceiptChequeNo] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')
  const [allocations, setAllocations] = useState<Record<string, number>>({})

  // Printable Statement Modal
  const [printStatementCustomer, setPrintStatementCustomer] = useState<CustomerBalance | null>(null)

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

  // Customer Balances Main List
  const balancesQuery = useQuery({
    queryKey: ['customer-balances-list', searchQuery],
    queryFn: () => listCustomerBalances(searchQuery),
  })

  // Receivables Summary for KPI
  useQuery({
    queryKey: ['customer-receivables-summary-kpis'],
    queryFn: fetchCustomerReceivablesSummary,
  })

  // Selected Customer Statement List
  const statementQuery = useQuery({
    queryKey: [
      'customer-statement-ledger',
      selectedCustomerId,
      statementDateFrom,
      statementDateTo,
      statementBranchId,
      statementEntryType,
      statementOutstandingOnly,
    ],
    queryFn: () =>
      selectedCustomerId
        ? listCustomerStatement(
            selectedCustomerId,
            statementDateFrom || undefined,
            statementDateTo || undefined,
            statementBranchId || undefined,
            statementEntryType || undefined,
            statementOutstandingOnly
          )
        : [],
    enabled: !!selectedCustomerId,
  })

  // Unpaid Invoices for Payment Allocation
  const unpaidInvoicesQuery = useQuery({
    queryKey: ['unpaid-invoices-for-receipt', receiptCustomer?.customer_id],
    queryFn: () =>
      receiptCustomer ? fetchUnpaidCustomerInvoices(receiptCustomer.customer_id) : [],
    enabled: !!receiptCustomer && isReceiptModalOpen,
  })

  // Recent Payment Receipts (Tab 3)
  const receiptsQuery = useQuery({
    queryKey: ['customer-recent-receipts'],
    queryFn: () => fetchCustomerReceipts(50),
    enabled: activeTab === 'receipts',
  })

  // ── Filtered Balances ────────────────────────────────────────────────────────
  const filteredBalances = useMemo(() => {
    if (!balancesQuery.data) return []
    return balancesQuery.data.filter((c) => {
      // Balance status filter
      if (balanceFilter === 'outstanding' && Number(c.total_outstanding) <= 0) return false
      if (balanceFilter === 'overdue' && Number(c.overdue_amount) <= 0) return false
      if (balanceFilter === 'settled' && Number(c.total_outstanding) !== 0) return false
      if (balanceFilter === 'credit' && Number(c.total_outstanding) >= 0) return false

      // Customer type filter
      if (customerTypeFilter !== 'all' && c.customer_type !== customerTypeFilter) return false

      return true
    })
  }, [balancesQuery.data, balanceFilter, customerTypeFilter])

  // ── KPI Metrics ──────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const list = balancesQuery.data || []
    let totalOutstanding = 0
    let totalOverdue = 0
    let customersWithBalance = 0
    let totalCreditBalance = 0

    for (const c of list) {
      const out = Number(c.total_outstanding || 0)
      const ov = Number(c.overdue_amount || 0)
      if (out > 0) {
        totalOutstanding += out
        customersWithBalance++
      } else if (out < 0) {
        totalCreditBalance += Math.abs(out)
      }
      if (ov > 0) {
        totalOverdue += ov
      }
    }

    return {
      totalOutstanding,
      totalOverdue,
      customersWithBalance,
      totalCreditBalance,
      totalCustomers: list.length,
    }
  }, [balancesQuery.data])

  // ── Auto-Allocation for Payment Receipt ──────────────────────────────────────
  const handleAutoAllocate = (amount: number) => {
    const invoices = unpaidInvoicesQuery.data || []
    let remaining = amount
    const newAlloc: Record<string, number> = {}

    for (const inv of invoices) {
      if (remaining <= 0) break
      const alloc = Math.min(remaining, inv.balance_amount)
      newAlloc[inv.id] = alloc
      remaining -= alloc
    }
    setAllocations(newAlloc)
  }

  // Open Receive Payment Modal for specific customer
  const handleOpenReceivePayment = (customer: CustomerBalance) => {
    setReceiptCustomer(customer)
    setReceiptBranchId(activeBranchId || (branchesQuery.data?.[0]?.id ?? ''))
    setReceiptAmount(Math.max(0, Number(customer.total_outstanding)))
    setReceiptMethod('cash')
    setReceiptNotes('')
    setReceiptCardReference('')
    setReceiptChequeNo('')
    setAllocations({})
    setIsReceiptModalOpen(true)
  }

  // Post Payment Receipt Mutation
  const postReceiptMutation = useMutation({
    mutationFn: async () => {
      if (!receiptCustomer) throw new Error('No customer selected.')
      if (receiptAmount <= 0) throw new Error('Receipt amount must be greater than zero.')
      if (!receiptBranchId) throw new Error('Please select a receiving branch.')

      return await createAndPostCustomerReceipt(
        {
          customer_id: receiptCustomer.customer_id,
          branch_id: receiptBranchId,
          amount: receiptAmount,
          payment_method: receiptMethod,
          bank_account_id: ['bank_transfer', 'cheque'].includes(receiptMethod) ? receiptBankAccountId : undefined,
          card_reference: receiptMethod === 'card' ? receiptCardReference : undefined,
          notes: receiptNotes || `Direct settlement for ${receiptCustomer.customer_name}`,
        },
        Object.entries(allocations).map(([invoice_id, allocated_amount]) => ({ invoice_id, allocated_amount }))
      )
    },
    onSuccess: (res) => {
      showToast(`Payment Receipt #${res.receipt_number} posted and ledger updated!`, 'success')
      setIsReceiptModalOpen(false)
      setReceiptCustomer(null)
      queryClient.invalidateQueries({ queryKey: ['customer-balances-list'] })
      queryClient.invalidateQueries({ queryKey: ['customer-statement-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['customer-recent-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['customer-receivables-summary-kpis'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // Quick View Statement for a customer
  const handleViewCustomerStatement = (customer: CustomerBalance) => {
    setSelectedCustomerId(customer.customer_id)
    setActiveTab('statement')
  }

  // Statement Summary
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

  // Export CSV for Statement
  const handleExportStatementCsv = () => {
    const rows = statementQuery.data || []
    if (rows.length === 0) return

    const selectedCust = balancesQuery.data?.find((c) => c.customer_id === selectedCustomerId)
    const custName = selectedCust ? selectedCust.customer_name : 'Customer'

    const headers = [
      'Date',
      'Transaction Type',
      'Reference Number',
      'Debit (Rs)',
      'Credit (Rs)',
      'Running Balance (Rs)',
      'Due Date',
      'Overdue',
      'Branch',
      'Notes',
    ]

    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.entry_date,
          r.entry_type,
          `"${r.reference_number}"`,
          r.debit_amount,
          r.credit_amount,
          r.running_balance,
          r.due_date || '',
          r.overdue ? 'YES' : 'NO',
          `"${r.branch_name}"`,
          `"${(r.notes || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Statement_${custName.replace(/\s+/g, '_')}_${statementDateFrom}_to_${statementDateTo}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div
      className="min-h-screen text-slate-100 p-4 md:p-6"
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
              <Users className="w-8 h-8 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Customer Balances &amp; Statements</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">
                  Accounts Receivable Subledger
                </span>
              </div>
              <p className="text-sm text-teal-200/70 mt-0.5">
                Real-time debtor ledger, credit utilization limits, overdue aging, and automated payment receipts.
              </p>
            </div>
          </div>

          {/* Quick Sub-navigation Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/sales/invoices"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Sales Invoices
            </Link>
            <Link
              to="/sales/pos"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              POS Register
            </Link>
            <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-800/60 border border-teal-500/40 shadow-sm">
              Customer Balances
            </div>
            <Link
              to="/suppliers/balances"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Supplier Balances
            </Link>
          </div>
        </div>

        {/* ── KPI Summary Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Outstanding Receivables */}
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
              {balancesQuery.isLoading ? '...' : formatLkr(metrics.totalOutstanding)}
            </div>
            <div className="text-xs text-teal-300/60 mt-1 flex items-center gap-1">
              <span>Across all customer debtor accounts</span>
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
              {balancesQuery.isLoading ? '...' : formatLkr(metrics.totalOverdue)}
            </div>
            <div className="text-xs text-rose-400/70 mt-1 flex items-center gap-1">
              <span>Past credit due date term</span>
            </div>
          </div>

          {/* Card 3: Debtors with Active Balance */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300/80 uppercase tracking-wider">
                Active Debtors
              </span>
              <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-300 mt-2">
              {balancesQuery.isLoading ? '...' : metrics.customersWithBalance}
            </div>
            <div className="text-xs text-amber-300/60 mt-1">
              <span>Out of {metrics.totalCustomers} registered customers</span>
            </div>
          </div>

          {/* Card 4: Advance / Credit Balances */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300/80 uppercase tracking-wider">
                Customer Advances
              </span>
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-2">
              {balancesQuery.isLoading ? '...' : formatLkr(metrics.totalCreditBalance)}
            </div>
            <div className="text-xs text-cyan-300/60 mt-1">
              <span>Prepaid advances or credit returns</span>
            </div>
          </div>
        </div>

        {/* ── Mode Navigation Tabs ────────────────────────────────────────────── */}
        <div className="flex border-b border-teal-900/60 gap-2">
          <button
            onClick={() => setActiveTab('balances')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'balances'
                ? 'border-teal-400 text-teal-300 bg-teal-500/10 rounded-t-xl'
                : 'border-transparent text-teal-300/60 hover:text-white hover:bg-teal-900/20 rounded-t-xl'
            }`}
          >
            <Users className="w-4 h-4" />
            Customer Balances Ledger
            <span className="px-2 py-0.5 text-xs bg-teal-900/80 rounded-full text-teal-300 border border-teal-700/50">
              {filteredBalances.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('statement')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'statement'
                ? 'border-teal-400 text-teal-300 bg-teal-500/10 rounded-t-xl'
                : 'border-transparent text-teal-300/60 hover:text-white hover:bg-teal-900/20 rounded-t-xl'
            }`}
          >
            <FileText className="w-4 h-4" />
            Statement of Account
            {selectedCustomerId && (
              <span className="px-2 py-0.5 text-xs bg-emerald-600 rounded-full text-white font-bold">
                Selected
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('receipts')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'receipts'
                ? 'border-teal-400 text-teal-300 bg-teal-500/10 rounded-t-xl'
                : 'border-transparent text-teal-300/60 hover:text-white hover:bg-teal-900/20 rounded-t-xl'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Payment Receipts History
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: CUSTOMER BALANCES LEDGER
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'balances' && (
          <div className="space-y-4">
            {/* Filter Toolbar */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-4 shadow-lg backdrop-blur-md">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* Search */}
                <div className="lg:col-span-3 relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by customer name, code (e.g. CUST-...), phone or email..."
                    className="w-full pl-10 pr-4 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white placeholder-teal-300/40 focus:outline-none focus:border-teal-400 transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Balance Status */}
                <div>
                  <select
                    value={balanceFilter}
                    onChange={(e) => setBalanceFilter(e.target.value as typeof balanceFilter)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
                  >
                    <option value="all">All Balance Statuses</option>
                    <option value="outstanding">Outstanding Balance (&gt; 0)</option>
                    <option value="overdue">Overdue Accounts Only</option>
                    <option value="settled">Settled / Zero Balance (0)</option>
                    <option value="credit">Customer Advances (&lt; 0)</option>
                  </select>
                </div>

                {/* Customer Type */}
                <div>
                  <select
                    value={customerTypeFilter}
                    onChange={(e) => setCustomerTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
                  >
                    <option value="all">All Customer Types</option>
                    <option value="retail">Retail</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="corporate">Corporate</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>

                {/* Refresh */}
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['customer-balances-list'] })}
                    className="px-4 py-2 bg-teal-950/60 border border-teal-800/60 hover:bg-teal-900/60 text-teal-300 hover:text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition"
                  >
                    <RefreshCw className={`w-4 h-4 ${balancesQuery.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Balances Data Table */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-teal-950/80 text-teal-300/80 uppercase text-xs tracking-wider border-b border-teal-800/50">
                    <tr>
                      <th className="px-4 py-3.5">Customer &amp; Contact</th>
                      <th className="px-4 py-3.5">Credit Limit &amp; Usage</th>
                      <th className="px-4 py-3.5 text-right">Invoiced (Rs)</th>
                      <th className="px-4 py-3.5 text-right">Paid (Rs)</th>
                      <th className="px-4 py-3.5 text-right">Overdue (Rs)</th>
                      <th className="px-4 py-3.5 text-right">Total Outstanding</th>
                      <th className="px-4 py-3.5 text-center">Due Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/40 text-slate-200">
                    {balancesQuery.isLoading ? (
                      <tr>
                        <td colSpan={8} className="text-center py-16 text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Loading customer balances...
                        </td>
                      </tr>
                    ) : filteredBalances.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-16 text-teal-300/60">
                          <Users className="w-10 h-10 mx-auto mb-2 text-teal-700/60" />
                          No customers found matching the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredBalances.map((customer) => {
                        const outstanding = Number(customer.total_outstanding || 0)
                        const overdue = Number(customer.overdue_amount || 0)
                        const limit = Number(customer.credit_limit || 0)
                        const usagePct = limit > 0 ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0

                        return (
                          <tr key={customer.customer_id} className="hover:bg-teal-900/20 transition group">
                            {/* Customer & Contact */}
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span>{customer.customer_name}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 border border-teal-800 text-teal-400">
                                  {customer.customer_code}
                                </span>
                              </div>
                              <div className="text-xs text-teal-300/60 mt-0.5 flex items-center gap-3">
                                {customer.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-teal-500" />
                                    {customer.phone}
                                  </span>
                                )}
                                {customer.customer_type && (
                                  <span className="capitalize px-1.5 py-0.2 rounded bg-teal-900/40 text-[10px] text-teal-300">
                                    {customer.customer_type}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Credit Limit & Usage */}
                            <td className="px-4 py-3.5 max-w-xs">
                              {limit > 0 ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-teal-400/70">Limit: {formatLkr(limit)}</span>
                                    <span
                                      className={`font-semibold ${
                                        usagePct > 90
                                          ? 'text-rose-400'
                                          : usagePct > 60
                                          ? 'text-amber-400'
                                          : 'text-emerald-400'
                                      }`}
                                    >
                                      {usagePct}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-teal-950 rounded-full h-1.5 overflow-hidden border border-teal-800/40">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        usagePct > 90
                                          ? 'bg-rose-500'
                                          : usagePct > 60
                                          ? 'bg-amber-500'
                                          : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${usagePct}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-teal-500/50 italic">No limit set</span>
                              )}
                            </td>

                            {/* Invoiced */}
                            <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-300">
                              {formatLkr(Number(customer.invoice_balance || 0))}
                            </td>

                            {/* Paid */}
                            <td className="px-4 py-3.5 text-right font-mono text-xs text-emerald-400">
                              {formatLkr(Number(customer.payment_balance || 0))}
                            </td>

                            {/* Overdue */}
                            <td className="px-4 py-3.5 text-right font-mono text-xs">
                              {overdue > 0 ? (
                                <span className="font-bold text-rose-400">
                                  {formatLkr(overdue)}
                                </span>
                              ) : (
                                <span className="text-teal-700/50">—</span>
                              )}
                            </td>

                            {/* Total Outstanding */}
                            <td className="px-4 py-3.5 text-right font-mono">
                              <span
                                className={`text-sm font-black ${
                                  outstanding > 0
                                    ? overdue > 0
                                      ? 'text-rose-300'
                                      : 'text-amber-300'
                                    : outstanding < 0
                                    ? 'text-cyan-300'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {formatLkr(outstanding)}
                              </span>
                            </td>

                            {/* Due Status */}
                            <td className="px-4 py-3.5 text-center">
                              {overdue > 0 ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  OVERDUE
                                </span>
                              ) : outstanding > 0 ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  CURRENT
                                </span>
                              ) : outstanding < 0 ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                  ADVANCE
                                </span>
                              ) : (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  SETTLED
                                </span>
                              )}
                            </td>

                            {/* Row Actions */}
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Receive Payment */}
                                {outstanding > 0 && canReceivePayment && (
                                  <button
                                    onClick={() => handleOpenReceivePayment(customer)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1 transition"
                                    title="Receive Payment"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    Receive
                                  </button>
                                )}

                                {/* View Statement */}
                                <button
                                  onClick={() => handleViewCustomerStatement(customer)}
                                  className="p-1.5 rounded-lg bg-teal-950/60 text-teal-300 hover:text-white hover:bg-teal-900 border border-teal-800/60 transition"
                                  title="View Detailed Statement"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>

                                {/* Print Statement */}
                                <button
                                  onClick={() => {
                                    setPrintStatementCustomer(customer)
                                    setSelectedCustomerId(customer.customer_id)
                                  }}
                                  className="p-1.5 rounded-lg bg-teal-950/60 text-teal-300 hover:text-white hover:bg-teal-900 border border-teal-800/60 transition"
                                  title="Print Statement of Account"
                                >
                                  <Printer className="w-4 h-4" />
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

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: CUSTOMER STATEMENT & DETAILED RUNNING LEDGER
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'statement' && (
          <div className="space-y-4">
            {/* Statement Control Toolbar */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-400" />
                  <h3 className="font-bold text-white text-base">Customer Account Statement Parameters</h3>
                </div>
                {selectedCustomerId && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportStatementCsv}
                      disabled={statementQuery.isLoading || (statementQuery.data?.length ?? 0) === 0}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-950 border border-teal-800 text-teal-300 hover:text-white flex items-center gap-1.5 transition disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </button>
                    <button
                      onClick={() => {
                        const found = balancesQuery.data?.find((c) => c.customer_id === selectedCustomerId)
                        if (found) setPrintStatementCustomer(found)
                      }}
                      disabled={statementQuery.isLoading || (statementQuery.data?.length ?? 0) === 0}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white flex items-center gap-1.5 transition disabled:opacity-40"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Statement
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Customer Picker */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Select Customer Account *
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
                  >
                    <option value="">-- Choose Customer --</option>
                    {balancesQuery.data?.map((c) => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.customer_code} · {c.customer_name} (Balance: {formatLkr(Number(c.total_outstanding))})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Statement From
                  </label>
                  <input
                    type="date"
                    value={statementDateFrom}
                    onChange={(e) => setStatementDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Statement To
                  </label>
                  <input
                    type="date"
                    value={statementDateTo}
                    onChange={(e) => setStatementDateTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
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
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
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
            </div>

            {/* Statement Ledger Table */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
              {!selectedCustomerId ? (
                <div className="text-center py-16 text-teal-300/60">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-teal-700/60" />
                  Please select a customer above to view their chronological account statement.
                </div>
              ) : statementQuery.isLoading ? (
                <div className="text-center py-16 text-teal-300/60">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                  Loading customer ledger entries...
                </div>
              ) : (statementQuery.data?.length ?? 0) === 0 ? (
                <div className="text-center py-16 text-teal-300/60">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-teal-700/60" />
                  No ledger activity found for this customer within the selected date range.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-teal-950/80 text-teal-300/80 uppercase text-xs tracking-wider border-b border-teal-800/50">
                        <tr>
                          <th className="px-4 py-3.5">Date</th>
                          <th className="px-4 py-3.5">Transaction Type</th>
                          <th className="px-4 py-3.5">Reference #</th>
                          <th className="px-4 py-3.5 text-right">Debit (Rs)</th>
                          <th className="px-4 py-3.5 text-right">Credit (Rs)</th>
                          <th className="px-4 py-3.5 text-right">Running Balance</th>
                          <th className="px-4 py-3.5">Due Date</th>
                          <th className="px-4 py-3.5">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-teal-900/40 text-slate-200">
                        {statementQuery.data?.map((row) => {
                          const debit = Number(row.debit_amount || 0)
                          const credit = Number(row.credit_amount || 0)
                          const running = Number(row.running_balance || 0)

                          return (
                            <tr key={row.id} className="hover:bg-teal-900/20 transition">
                              <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                                {formatBusinessDate(row.entry_date)}
                              </td>

                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                                    row.entry_type === 'invoice'
                                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                      : row.entry_type === 'payment'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : row.entry_type === 'sales_return'
                                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                                      : row.entry_type === 'cheque_return'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                  }`}
                                >
                                  {row.entry_type.replaceAll('_', ' ')}
                                </span>
                              </td>

                              <td className="px-4 py-3 font-mono text-cyan-300 text-xs whitespace-nowrap">
                                {row.reference_number}
                              </td>

                              <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap">
                                {debit > 0 ? (
                                  <span className="font-semibold text-rose-300">+{formatLkr(debit)}</span>
                                ) : (
                                  <span className="text-teal-700/50">—</span>
                                )}
                              </td>

                              <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap">
                                {credit > 0 ? (
                                  <span className="font-semibold text-emerald-300">-{formatLkr(credit)}</span>
                                ) : (
                                  <span className="text-teal-700/50">—</span>
                                )}
                              </td>

                              <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                                <span
                                  className={`font-bold px-2 py-0.5 rounded ${
                                    running > 0
                                      ? 'text-rose-300 bg-rose-950/40 border border-rose-800/40'
                                      : running < 0
                                      ? 'text-cyan-300 bg-cyan-950/40 border border-cyan-800/40'
                                      : 'text-emerald-400'
                                  }`}
                                >
                                  {formatLkr(running)}
                                </span>
                              </td>

                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                {row.overdue ? (
                                  <span className="text-rose-400 font-bold flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {row.due_date ? formatBusinessDate(row.due_date) : 'Overdue'}
                                  </span>
                                ) : row.due_date ? (
                                  <span className="text-teal-300/70">{formatBusinessDate(row.due_date)}</span>
                                ) : (
                                  <span className="text-teal-700/50">—</span>
                                )}
                              </td>

                              <td className="px-4 py-3 text-xs text-teal-300/60 max-w-xs truncate" title={row.notes || ''}>
                                {row.notes || row.branch_name}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Statement Ledger Summary Bar */}
                  <div className="p-4 bg-teal-950/90 border-t border-teal-800/60 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="text-teal-400/60">Total Entries:</span>{' '}
                        <strong className="text-white text-sm">{statementSummary.entryCount}</strong>
                      </div>
                      <div>
                        <span className="text-teal-400/60">Total Invoiced (Debits):</span>{' '}
                        <strong className="text-rose-300 text-sm font-mono">{formatLkr(statementSummary.totalDebit)}</strong>
                      </div>
                      <div>
                        <span className="text-teal-400/60">Total Payments (Credits):</span>{' '}
                        <strong className="text-emerald-300 text-sm font-mono">{formatLkr(statementSummary.totalCredit)}</strong>
                      </div>
                    </div>

                    <div>
                      <span className="text-teal-400/60 mr-2">Closing Running Balance:</span>
                      <strong
                        className={`text-base font-black font-mono ${
                          statementSummary.closingBalance > 0
                            ? 'text-rose-300'
                            : statementSummary.closingBalance < 0
                            ? 'text-cyan-300'
                            : 'text-emerald-400'
                        }`}
                      >
                        {formatLkr(statementSummary.closingBalance)}
                      </strong>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 3: RECENT PAYMENT RECEIPTS
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'receipts' && (
          <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
            <div className="p-4 border-b border-teal-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-teal-400" />
                <h3 className="font-bold text-white text-base">Recent Customer Payment Receipts</h3>
              </div>
              <span className="text-xs text-teal-300/60">Last 50 Posted Payments</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-teal-950/80 text-teal-300/80 uppercase text-xs tracking-wider border-b border-teal-800/50">
                  <tr>
                    <th className="px-4 py-3.5">Receipt #</th>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Customer</th>
                    <th className="px-4 py-3.5">Branch</th>
                    <th className="px-4 py-3.5">Payment Method</th>
                    <th className="px-4 py-3.5 text-right">Amount (Rs)</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-900/40 text-slate-200">
                  {receiptsQuery.isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-teal-300/60">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                        Loading recent receipts...
                      </td>
                    </tr>
                  ) : (receiptsQuery.data?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-teal-300/60">
                        <Receipt className="w-8 h-8 mx-auto mb-2 text-teal-700/60" />
                        No customer payment receipts logged yet.
                      </td>
                    </tr>
                  ) : (
                    receiptsQuery.data?.map((rc) => (
                      <tr key={rc.id} className="hover:bg-teal-900/20 transition">
                        <td className="px-4 py-3 font-mono font-bold text-cyan-300 text-xs">
                          {rc.receipt_number}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                          {formatBusinessDate(rc.receipt_date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">{rc.customer?.name || rc.customer_id}</div>
                          <div className="text-xs text-teal-400/60 font-mono">{rc.customer?.customer_code || ''}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-teal-200">{rc.branch_id}</td>
                        <td className="px-4 py-3 text-xs capitalize text-teal-300">
                          {rc.payment_method.replaceAll('_', ' ')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-300 text-sm">
                          {formatLkr(Number(rc.amount || 0))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                            {rc.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 1: RECEIVE PAYMENT & AUTO-ALLOCATE INVOICES
         ══════════════════════════════════════════════════════════════════════════ */}
      {isReceiptModalOpen && receiptCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0b2926] border border-teal-800/60 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Receive Customer Payment</h3>
                  <p className="text-xs text-teal-300/60">
                    Settle invoices &amp; post receipt to customer subledger
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="text-teal-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Summary Card */}
            <div className="p-4 bg-teal-950/70 border border-teal-800/60 rounded-xl flex items-center justify-between flex-wrap gap-4 text-xs">
              <div>
                <span className="text-teal-400/60 block">Customer</span>
                <strong className="text-white text-sm">{receiptCustomer.customer_name}</strong>{' '}
                <span className="text-cyan-300 font-mono">({receiptCustomer.customer_code})</span>
              </div>
              <div>
                <span className="text-teal-400/60 block">Current Balance</span>
                <strong className="text-rose-300 text-sm font-bold font-mono">
                  {formatLkr(Number(receiptCustomer.total_outstanding))}
                </strong>
              </div>
              <div>
                <span className="text-teal-400/60 block">Overdue Amount</span>
                <strong className="text-amber-300 text-sm font-bold font-mono">
                  {formatLkr(Number(receiptCustomer.overdue_amount))}
                </strong>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-teal-300/80 mb-1">
                  Receiving Branch *
                </label>
                <select
                  value={receiptBranchId}
                  onChange={(e) => setReceiptBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400"
                >
                  {branchesQuery.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-teal-300/80 mb-1">
                  Payment Tender Method *
                </label>
                <select
                  value={receiptMethod}
                  onChange={(e) => setReceiptMethod(e.target.value as typeof receiptMethod)}
                  className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400"
                >
                  <option value="cash">Cash Tender</option>
                  <option value="bank_transfer">Direct Bank Transfer</option>
                  <option value="card">Card Terminal POS</option>
                  <option value="cheque">Cheque Settlement</option>
                </select>
              </div>

              {/* Amount */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-teal-300/80">
                    Payment Amount Received (Rs.) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const full = Math.max(0, Number(receiptCustomer.total_outstanding))
                      setReceiptAmount(full)
                      handleAutoAllocate(full)
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium"
                  >
                    Pay Full Balance ({formatLkr(Number(receiptCustomer.total_outstanding))})
                  </button>
                </div>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={receiptAmount || ''}
                  onChange={(e) => {
                    const amt = Number(e.target.value)
                    setReceiptAmount(amt)
                    handleAutoAllocate(amt)
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 text-base font-bold font-mono bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Bank Account for Bank Transfer / Cheque */}
              {['bank_transfer', 'cheque'].includes(receiptMethod) && (
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-teal-300/80 mb-1">
                    Deposit Bank Account *
                  </label>
                  <select
                    value={receiptBankAccountId}
                    onChange={(e) => setReceiptBankAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400"
                  >
                    <option value="">Select Bank Account</option>
                    {bankAccountsQuery.data?.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_name} — {acc.account_number} ({acc.bank_name})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Card Reference */}
              {receiptMethod === 'card' && (
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-teal-300/80 mb-1">
                    Card Auth / Terminal Trace Ref
                  </label>
                  <input
                    type="text"
                    value={receiptCardReference}
                    onChange={(e) => setReceiptCardReference(e.target.value)}
                    placeholder="e.g. VISA-9482-AUTH"
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white"
                  />
                </div>
              )}

              {/* Cheque # */}
              {receiptMethod === 'cheque' && (
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-teal-300/80 mb-1">
                    Cheque Number &amp; Clearing Bank
                  </label>
                  <input
                    type="text"
                    value={receiptChequeNo}
                    onChange={(e) => setReceiptChequeNo(e.target.value)}
                    placeholder="e.g. CHQ-002819 - Commercial Bank"
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white"
                  />
                </div>
              )}

              {/* Notes */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-teal-300/80 mb-1">
                  Receipt Remarks / Memo
                </label>
                <input
                  type="text"
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="e.g. Settlement of monthly order or cash advance"
                  className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white"
                />
              </div>
            </div>

            {/* Unpaid Invoices Allocation Preview */}
            <div className="border border-teal-800/50 rounded-xl p-3.5 bg-teal-950/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white uppercase tracking-wider">
                  Open Invoices Allocation
                </span>
                <span className="text-teal-400/70">
                  {unpaidInvoicesQuery.data?.length || 0} Unpaid Invoices
                </span>
              </div>

              {unpaidInvoicesQuery.isLoading ? (
                <div className="text-center py-4 text-xs text-teal-300/60">Loading unpaid invoices...</div>
              ) : (unpaidInvoicesQuery.data?.length ?? 0) === 0 ? (
                <div className="text-xs text-teal-300/60 italic py-2">
                  No individual open invoices found. The full amount will be credited to the customer&apos;s ledger balance as an unallocated receipt or advance.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pt-1">
                  {unpaidInvoicesQuery.data?.map((inv) => {
                    const alloc = allocations[inv.id] || 0
                    return (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-teal-950/60 text-xs border border-teal-800/40"
                      >
                        <div>
                          <span className="font-mono font-semibold text-white">{inv.invoice_number}</span>
                          <span className="text-teal-400/60 ml-2">Due: {inv.due_date}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-teal-300/70">Due: {formatLkr(inv.balance_amount)}</span>
                          <span className="font-mono font-bold text-emerald-400">
                            Allocated: {formatLkr(alloc)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-teal-950 border border-teal-800 text-teal-300 hover:text-white text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => postReceiptMutation.mutate()}
                disabled={postReceiptMutation.isPending || receiptAmount <= 0}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-950/60 disabled:opacity-40 transition flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {postReceiptMutation.isPending ? 'Posting Receipt...' : 'Post & Issue Payment Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 2: PRINTABLE A4 STATEMENT OF ACCOUNT
         ══════════════════════════════════════════════════════════════════════════ */}
      {printStatementCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white text-slate-900 rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto shadow-2xl p-8 space-y-6 print:p-0 print:max-h-none print:shadow-none">
            {/* Header controls (hidden on print) */}
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Print Preview: Official Statement of Account (A4)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-teal-700 text-white rounded-lg text-xs font-bold hover:bg-teal-800 flex items-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Now
                </button>
                <button
                  onClick={() => setPrintStatementCustomer(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* A4 Sheet Layout */}
            <div className="border border-slate-300 p-8 rounded-xl space-y-6">
              <div className="flex items-start justify-between border-b-2 border-slate-800 pb-5">
                <div>
                  <h2 className="text-2xl font-black uppercase text-slate-900 tracking-tight">
                    Baby Bloom (Pvt) Ltd
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Official Statement of Account · Accounts Receivable
                  </p>
                  <p className="text-xs text-slate-500">
                    Reg No: PV-00293841 · Inland Revenue Dept Audited Record
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div className="text-slate-500 font-semibold uppercase tracking-wider">Statement Date</div>
                  <div className="text-sm font-bold text-slate-800">
                    {colomboNow().format('YYYY-MM-DD')}
                  </div>
                  <div className="text-slate-600 mt-1">
                    Period: {statementDateFrom} to {statementDateTo}
                  </div>
                </div>
              </div>

              {/* Customer Info Card */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg text-xs border border-slate-200">
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Billed Customer</span>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {printStatementCustomer.customer_name}
                  </div>
                  <div className="font-mono text-slate-600 text-xs">
                    Code: {printStatementCustomer.customer_code}
                  </div>
                  {printStatementCustomer.phone && (
                    <div className="text-slate-600">Phone: {printStatementCustomer.phone}</div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Account Summary</span>
                  <div className="mt-1">
                    <span className="text-slate-500 mr-2">Credit Limit:</span>
                    <strong className="text-slate-800 font-mono">
                      {formatLkr(Number(printStatementCustomer.credit_limit || 0))}
                    </strong>
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="font-bold text-slate-700 mr-2">Total Outstanding:</span>
                    <strong className="text-rose-700 font-mono text-base font-black">
                      {formatLkr(Number(printStatementCustomer.total_outstanding))}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Statement Ledger Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2 text-right">Debit (Rs)</th>
                      <th className="px-3 py-2 text-right">Credit (Rs)</th>
                      <th className="px-3 py-2 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {statementQuery.data?.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2 text-slate-800">{it.entry_date}</td>
                        <td className="px-3 py-2 uppercase font-semibold text-[10px] text-slate-600">
                          {it.entry_type.replaceAll('_', ' ')}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-900">{it.reference_number}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-800">
                          {Number(it.debit_amount) > 0 ? formatLkr(Number(it.debit_amount)) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">
                          {Number(it.credit_amount) > 0 ? formatLkr(Number(it.credit_amount)) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                          {formatLkr(Number(it.running_balance))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right uppercase text-[11px] text-slate-700">
                        Net Outstanding Balance Due:
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm text-rose-800">
                        {formatLkr(Number(printStatementCustomer.total_outstanding))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Remittance & Bank Info */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Remittance / Payment Instructions
                </div>
                <div className="text-slate-600">
                  Please direct bank remittances to: <strong>Baby Bloom (Pvt) Ltd</strong> · Commercial Bank of Ceylon
                </div>
                <div className="text-slate-600">
                  Account No: <strong>1000-2948-1829</strong> · Branch: Colombo Head Office
                </div>
              </div>

              {/* Signature block */}
              <div className="grid grid-cols-2 gap-6 pt-10 text-xs">
                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Accounts Receivable Officer</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Stamp</div>
                </div>

                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Customer Confirmation</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default CustomerBalancesPage
