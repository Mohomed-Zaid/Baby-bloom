import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RotateCcw,
  CheckCircle2,
  Plus,
  Search,
  Eye,
  Printer,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Coins,
  TrendingDown,
  CreditCard,
  Banknote,
  AlertCircle,
  Download,
  Building2,
  Users,
} from 'lucide-react'
import { listSalesReturns, salesReturnAction, getSalesReturn } from '../services/sales'
import { listLookup } from '../services/masterData'
import { MOCK_BRANCHES, MOCK_CUSTOMERS } from '../services/mockData'
import { formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { ThermalReceiptDocket } from '../components/common/ThermalReceiptDocket'
import type { SalesReturnRow } from '../types/sales'

const formatCurrency = (n: number | null | undefined) => {
  if (n === null || n === undefined) return 'Rs. 0.00'
  return `Rs. ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const SalesReturnsPage: React.FC = () => {
  const queryClient = useQueryClient()

  // ── Filters State ─────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [settlementType, setSettlementType] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // ── Modals & Notifications State ──────────────────────────────────────────
  const [viewingReturnId, setViewingReturnId] = useState<string | null>(null)
  const [viewingFormat, setViewingFormat] = useState<'details' | 'thermal' | 'a4'>('details')
  const [quickPrint, setQuickPrint] = useState<{ id: string; format: 'thermal' | 'a4' } | null>(null)
  const [registerPrintModal, setRegisterPrintModal] = useState(false)
  const [reverseModal, setReverseModal] = useState<{
    open: boolean
    returnItem: SalesReturnRow | null
    reason: string
  }>({
    open: false,
    returnItem: null,
    reason: '',
  })
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)

  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Master Data Lookups ───────────────────────────────────────────────────
  const { data: dbBranches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches', 'name'),
  })
  const branchOptions = useMemo(() => {
    if (dbBranches.length > 0) return dbBranches
    return MOCK_BRANCHES.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))
  }, [dbBranches])

  const { data: dbCustomers = [] } = useQuery({
    queryKey: ['lookup', 'customers'],
    queryFn: () => listLookup('customers', 'name'),
  })
  const customerOptions = useMemo(() => {
    if (dbCustomers.length > 0) return dbCustomers
    return MOCK_CUSTOMERS.map((c) => ({ value: c.id, label: `${c.name} (${c.customer_code})` }))
  }, [dbCustomers])

  // ── Returns List Query ────────────────────────────────────────────────────
  const { data: returnsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: [
      'sales-returns',
      page,
      searchTerm,
      selectedBranch,
      selectedCustomer,
      settlementType,
      statusFilter,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      listSalesReturns({
        page,
        pageSize,
        search: searchTerm || undefined,
        branchId: selectedBranch || undefined,
        customerId: selectedCustomer || undefined,
        settlementType: settlementType !== 'all' ? settlementType : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  })

  // ── Detailed Return Query for Inspector Modal ─────────────────────────────
  const { data: returnDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['sales-return-detail', viewingReturnId],
    queryFn: () => getSalesReturn(viewingReturnId!),
    enabled: !!viewingReturnId,
  })

  // ── Quick Print Return Query ──────────────────────────────────────────────
  const { data: quickPrintDetail, isLoading: loadingQuickPrint } = useQuery({
    queryKey: ['sales-return-quick', quickPrint?.id],
    queryFn: () => getSalesReturn(quickPrint!.id),
    enabled: !!quickPrint?.id,
  })

  // ── Post Return Mutation ──────────────────────────────────────────────────
  const postMutation = useMutation({
    mutationFn: (id: string) => salesReturnAction('post', id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sales-return-detail'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      notify(`Sales return ${res.document_number} successfully posted. Stock reinstated and accounts updated!`)
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  // ── Reverse Return Mutation ───────────────────────────────────────────────
  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => salesReturnAction('reverse', id, reason),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sales-return-detail'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      setReverseModal({ open: false, returnItem: null, reason: '' })
      notify(`Sales return ${res.document_number} reversed. Stock movements and credits reversed.`)
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  const handleOpenReverse = (ret: SalesReturnRow) => {
    setReverseModal({
      open: true,
      returnItem: ret,
      reason: '',
    })
  }

  const handleConfirmReverse = () => {
    if (!reverseModal.returnItem) return
    if (!reverseModal.reason.trim()) {
      notify('Please provide a reason for reversing this return.', true)
      return
    }
    reverseMutation.mutate({
      id: reverseModal.returnItem.id,
      reason: reverseModal.reason.trim(),
    })
  }

  // ── Aggregations & Metrics ────────────────────────────────────────────────
  const rows = returnsData?.rows ?? []
  const totalCount = returnsData?.count ?? 0

  const grossRefundAmount = useMemo(() => {
    return rows.reduce((acc, r) => acc + (Number(r.grand_total) || 0), 0)
  }, [rows])

  const postedCount = useMemo(() => {
    return rows.filter((r) => r.status === 'posted').length
  }, [rows])

  const draftCount = useMemo(() => {
    return rows.filter((r) => r.status === 'draft').length
  }, [rows])

  const reversedCount = useMemo(() => {
    return rows.filter((r) => r.status === 'reversed').length
  }, [rows])

  const storeCreditIssued = useMemo(() => {
    return rows
      .filter((r) => r.settlement_type === 'customer_credit' || r.settlement_type === 'reduce_receivable')
      .reduce((acc, r) => acc + (Number(r.grand_total) || 0), 0)
  }, [rows])

  const cashRefundsDisbursed = useMemo(() => {
    return rows
      .filter((r) => r.settlement_type === 'cash_refund' || r.settlement_type === 'bank_refund')
      .reduce((acc, r) => acc + (Number(r.grand_total) || 0), 0)
  }, [rows])

  // ── Export CSV Handler ────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (rows.length === 0) {
      notify('No sales return records to export for the active filters.', true)
      return
    }

    const headers = [
      'Return Number',
      'Return Date',
      'Original Invoice',
      'Customer Name',
      'Customer Code',
      'Branch',
      'Settlement Mode',
      'Grand Total (LKR)',
      'Status',
      'Reason',
      'Notes',
    ]

    const csvRows = rows.map((r) => [
      `"${r.return_number}"`,
      `"${r.return_date ? r.return_date.slice(0, 10) : ''}"`,
      `"${r.invoice_number || 'Standalone'}"`,
      `"${(r.customer_name || 'Walk-in Customer').replace(/"/g, '""')}"`,
      `"${r.customer_code || 'CUST'}"`,
      `"${(r.branch_name || 'Main Branch').replace(/"/g, '""')}"`,
      `"${r.settlement_type.replace(/_/g, ' ').toUpperCase()}"`,
      (Number(r.grand_total) || 0).toFixed(2),
      `"${r.status.toUpperCase()}"`,
      `"${(r.reason || '').replace(/"/g, '""')}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `sales_returns_credit_notes_register_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    notify('Sales returns register exported to CSV successfully!')
  }

  // ── Status & Settlement Badges ────────────────────────────────────────────
  const renderStatusBadge = (st: string) => {
    switch (st) {
      case 'posted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#092920] text-[#34d399] border border-[#059669]/40">
            <CheckCircle2 size={11} /> Posted
          </span>
        )
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#241f0b] text-[#fbbf24] border border-[#d97706]/40">
            Draft
          </span>
        )
      case 'reversed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#1a1c23] text-[#9ca3af] border border-[#4b5563]/40">
            <RotateCcw size={11} /> Reversed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#0e3b37] text-[#a0c4c0]">
            {st}
          </span>
        )
    }
  }

  const renderSettlementBadge = (type: string) => {
    switch (type) {
      case 'cash_refund':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-[#063026] text-[#34d399] border border-[#10b981]/30">
            <Banknote size={12} /> Cash Refund
          </span>
        )
      case 'bank_refund':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-[#0a273b] text-[#38bdf8] border border-[#0284c7]/30">
            <CreditCard size={12} /> Bank / Card
          </span>
        )
      case 'customer_credit':
      case 'reduce_receivable':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-[#2b2408] text-[#facc15] border border-[#ca8a04]/30">
            <Coins size={12} /> Credit Note
          </span>
        )
    }
  }

  const activePrintDetail = quickPrint ? quickPrintDetail : returnDetail

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 transition-all duration-300 ${
            toast.isError
              ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
              : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
          }`}
        >
          {toast.isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6 no-print">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <RotateCcw className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Sales Returns & Credit Notes Register
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Restock & Settlements
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Review returned merchandise, customer credit note slips, cash refunds, and stock reinstatement ledger
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors cursor-pointer"
            disabled={isRefetching}
            onClick={() => refetch()}
            title="Refresh returns ledger"
          >
            <RefreshCw size={15} className={isRefetching ? 'animate-spin text-[#38d4c5]' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors cursor-pointer"
            onClick={handleExportCsv}
            title="Export filtered returns register to CSV"
          >
            <Download size={15} className="text-[#38d4c5]" />
            Export CSV
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors cursor-pointer"
            onClick={() => setRegisterPrintModal(true)}
            title="Print formal Audit Ledger Summary report"
          >
            <Printer size={15} className="text-[#38d4c5]" />
            Print Register
          </button>

          <Link
            to="/sales/invoices"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] rounded-xl text-sm font-semibold transition-colors"
          >
            Sales Invoices
          </Link>

          <Link
            to="/sales/new-return"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#059669]/20 transition-all active:scale-[0.98]"
          >
            <Plus size={16} />
            Process New Return
          </Link>
        </div>
      </div>

      {/* ── 6 KPI Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 no-print">
        {/* Card 1: Total Returns */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7aa5a0]">Total Returns</span>
            <span className="p-1.5 bg-[#103e39] rounded-lg text-[#38d4c5]">
              <RotateCcw className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{totalCount}</div>
          <div className="mt-1 text-[11px] text-[#527d78]">
            {reversedCount > 0 ? `${reversedCount} reversed` : 'Vouchers logged'}
          </div>
        </div>

        {/* Card 2: Refund Volume */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#f87171]">Refund Volume</span>
            <span className="p-1.5 bg-[#290d13] rounded-lg text-[#f87171]">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-[#f87171] truncate" title={formatCurrency(grossRefundAmount)}>
            Rs. {grossRefundAmount.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">Credits + cash disbursed</div>
        </div>

        {/* Card 3: Posted & Restocked */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#34d399]">Posted / Restocked</span>
            <span className="p-1.5 bg-[#0d3327] rounded-lg text-[#34d399]">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#34d399]">{postedCount}</div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">Inventory restored to stock</div>
        </div>

        {/* Card 4: Pending Drafts */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#facc15]">Pending Drafts</span>
            <span className="p-1.5 bg-[#2b2408] rounded-lg text-[#facc15]">
              <FileText className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#facc15]">{draftCount}</div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">Awaiting warehouse posting</div>
        </div>

        {/* Card 5: Store Credits Issued */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#facc15]">Store Credits</span>
            <span className="p-1.5 bg-[#2b2408] rounded-lg text-[#facc15]">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-[#facc15] truncate" title={formatCurrency(storeCreditIssued)}>
            Rs. {storeCreditIssued.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">Customer account credits</div>
        </div>

        {/* Card 6: Cash & Bank Disbursed */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#38bdf8]">Cash Disbursed</span>
            <span className="p-1.5 bg-[#0a273b] rounded-lg text-[#38bdf8]">
              <Banknote className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-[#38bdf8] truncate" title={formatCurrency(cashRefundsDisbursed)}>
            Rs. {cashRefundsDisbursed.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">Paid via drawer / bank</div>
        </div>
      </div>

      {/* ── Status Navigation Tabs ───────────────────────────────────────────── */}
      <div className="flex border-b border-[#164e48] overflow-x-auto gap-2 pb-1 no-print">
        {[
          { id: 'all', label: 'All Returns', count: totalCount },
          { id: 'posted', label: 'Posted & Restocked', count: postedCount },
          { id: 'draft', label: 'Draft Returns', count: draftCount },
          { id: 'reversed', label: 'Reversed', count: reversedCount },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
              statusFilter === tab.id
                ? 'bg-[#0e3b37] text-[#38d4c5] border-t-2 border-x-2 border-[#164e48] border-b-transparent shadow-sm'
                : 'text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]'
            }`}
            onClick={() => {
              setStatusFilter(tab.id)
              setPage(1)
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  statusFilter === tab.id ? 'bg-[#103e39] text-[#38d4c5]' : 'bg-[#041917] text-[#7aa5a0]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Comprehensive Filter Bar ────────────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 p-4 rounded-2xl border border-[#164e48] shadow-md flex flex-col md:flex-row gap-3 items-center justify-between backdrop-blur-sm no-print">
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#527d78]" size={16} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white placeholder-[#527d78] focus:outline-none focus:border-[#38d4c5]"
            placeholder="Search return #, customer, inv #..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
          />
        </div>

        {/* Dropdowns & Date Pickers */}
        <div className="flex flex-wrap gap-2.5 w-full md:w-auto items-center">
          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 bg-[#031413] border border-[#164e48] rounded-xl px-2.5 py-1 text-xs text-white">
            <Building2 size={13} className="text-[#38d4c5] shrink-0" />
            <select
              className="bg-transparent border-0 text-white focus:outline-none cursor-pointer text-xs"
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Branches</option>
              {branchOptions.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Filter */}
          <div className="flex items-center gap-1.5 bg-[#031413] border border-[#164e48] rounded-xl px-2.5 py-1 text-xs text-white">
            <Users size={13} className="text-[#38d4c5] shrink-0" />
            <select
              className="bg-transparent border-0 text-white focus:outline-none cursor-pointer text-xs max-w-[150px] truncate"
              value={selectedCustomer}
              onChange={(e) => {
                setSelectedCustomer(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Customers</option>
              {customerOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Settlement Mode Filter */}
          <select
            className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5] cursor-pointer"
            value={settlementType}
            onChange={(e) => {
              setSettlementType(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">All Settlements</option>
            <option value="customer_credit">Credit Note</option>
            <option value="cash_refund">Cash Refund</option>
            <option value="bank_refund">Bank / Card</option>
          </select>

          {/* Date Range */}
          <div className="flex items-center gap-1.5 bg-[#031413] border border-[#164e48] rounded-xl px-2.5 py-1 text-xs">
            <input
              type="date"
              className="bg-transparent text-white focus:outline-none cursor-pointer text-xs"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              title="From date"
            />
            <span className="text-[#527d78]">to</span>
            <input
              type="date"
              className="bg-transparent text-white focus:outline-none cursor-pointer text-xs"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              title="To date"
            />
          </div>

          {/* Reset Filters */}
          {(searchTerm ||
            selectedBranch ||
            selectedCustomer ||
            settlementType !== 'all' ||
            statusFilter !== 'all' ||
            dateFrom ||
            dateTo) && (
            <button
              type="button"
              className="text-xs text-[#f87171] hover:text-white px-2 py-1 underline cursor-pointer"
              onClick={() => {
                setSearchTerm('')
                setSelectedBranch('')
                setSelectedCustomer('')
                setSettlementType('all')
                setStatusFilter('all')
                setDateFrom('')
                setDateTo('')
                setPage(1)
              }}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* ── Main Returns Table ──────────────────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 rounded-2xl border border-[#164e48] shadow-2xl overflow-hidden backdrop-blur-md no-print">
        {isLoading ? (
          <div className="p-16 text-center text-sm text-[#7aa5a0] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 text-[#38d4c5] animate-spin" />
            <span>Loading sales returns and restock records...</span>
          </div>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#092925] border-b border-[#164e48] text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Return #</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Original Invoice</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">Settlement Mode</th>
                  <th className="px-5 py-3.5 text-right">Grand Total</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#113e3a]/60">
                {rows.map((ret) => (
                  <tr key={ret.id} className="hover:bg-[#0c312d]/60 transition-colors">
                    {/* Return # */}
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        className="font-bold text-[#38d4c5] hover:text-white hover:underline flex items-center gap-1.5 cursor-pointer font-mono"
                        onClick={() => {
                          setViewingReturnId(ret.id)
                          setViewingFormat('details')
                        }}
                      >
                        {ret.return_number}
                      </button>
                    </td>

                    {/* Return Date */}
                    <td className="px-5 py-3.5 text-xs text-[#a0c4c0] whitespace-nowrap">
                      {formatBusinessDate(ret.return_date)}
                    </td>

                    {/* Original Invoice */}
                    <td className="px-5 py-3.5 text-xs">
                      {ret.invoice_number ? (
                        <Link
                          to={`/sales/invoices/${ret.sales_invoice_id || ret.invoice_id}`}
                          className="font-mono text-[#38d4c5] hover:underline"
                        >
                          {ret.invoice_number}
                        </Link>
                      ) : (
                        <span className="text-[#527d78] italic">Standalone Return</span>
                      )}
                    </td>

                    {/* Customer */}
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{ret.customer_name || 'Walk-in Customer'}</div>
                      <div className="text-[11px] text-[#527d78] font-mono">{ret.customer_code}</div>
                    </td>

                    {/* Branch */}
                    <td className="px-5 py-3.5 text-xs text-[#a0c4c0]">
                      {ret.branch_name || 'Main Branch'}
                    </td>

                    {/* Settlement Mode */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {renderSettlementBadge(ret.settlement_type)}
                    </td>

                    {/* Grand Total */}
                    <td className="px-5 py-3.5 text-right font-bold text-white whitespace-nowrap font-mono">
                      {formatCurrency(ret.grand_total)}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {renderStatusBadge(ret.status)}
                    </td>

                    {/* Quick Action Buttons */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {/* View Details */}
                        <button
                          type="button"
                          className="p-1.5 text-[#7aa5a0] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48] cursor-pointer"
                          title="View Return Slip & Items"
                          onClick={() => {
                            setViewingReturnId(ret.id)
                            setViewingFormat('details')
                          }}
                        >
                          <Eye size={15} />
                        </button>

                        {/* Quick Print Thermal */}
                        <button
                          type="button"
                          className="p-1.5 text-[#38d4c5] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48] cursor-pointer"
                          title="Quick Print 80mm Thermal Receipt Docket"
                          onClick={() => {
                            setQuickPrint({ id: ret.id, format: 'thermal' })
                          }}
                        >
                          <Printer size={15} />
                        </button>

                        {/* Quick Print A4 */}
                        <button
                          type="button"
                          className="p-1.5 text-[#facc15] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48] cursor-pointer"
                          title="Quick Print A4 Commercial Credit Note Voucher"
                          onClick={() => {
                            setQuickPrint({ id: ret.id, format: 'a4' })
                          }}
                        >
                          <FileText size={15} />
                        </button>

                        {/* Post Return (Draft) */}
                        {ret.status === 'draft' && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#092920] text-[#34d399] hover:bg-[#0e3b2e] border border-[#059669]/40 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                            disabled={postMutation.isPending}
                            onClick={() => postMutation.mutate(ret.id)}
                            title="Post Return & Restock Stock into Inventory"
                          >
                            <CheckCircle2 size={12} /> Post
                          </button>
                        )}

                        {/* Reverse Return (Posted) */}
                        {ret.status === 'posted' && (
                          <button
                            type="button"
                            className="p-1.5 text-[#f87171] hover:text-white hover:bg-[#3b1119] rounded-lg transition-colors border border-transparent hover:border-[#5e1624] cursor-pointer"
                            title="Reverse Return"
                            onClick={() => handleOpenReverse(ret)}
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center">
            <RotateCcw size={44} className="mx-auto text-[#38d4c5] mb-3 opacity-60" />
            <h3 className="text-base font-semibold text-white">No sales return records found</h3>
            <p className="text-sm text-[#7aa5a0] mt-1 max-w-sm mx-auto">
              No return transactions matched your current filters. Process a new return from customer invoices.
            </p>
            <div className="mt-5">
              <Link
                to="/sales/new-return"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-md transition-all"
              >
                <Plus size={16} />
                Process First Return
              </Link>
            </div>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="px-5 py-3.5 bg-[#031413] border-t border-[#164e48] flex items-center justify-between text-xs text-[#7aa5a0]">
          <div>
            Showing {rows.length} of {totalCount} records (Page {page})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 rounded-lg border border-[#164e48] bg-[#0c2e2a] hover:bg-[#12423c] text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-semibold text-white px-2">Page {page}</span>
            <button
              type="button"
              className="p-1.5 rounded-lg border border-[#164e48] bg-[#0c2e2a] hover:bg-[#12423c] text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              disabled={rows.length < pageSize}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL 1: Return Details & Multi-Format Inspector ─────────────────── */}
      {viewingReturnId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#164e48] bg-[#0c2e2a] no-print">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5]">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Return Slip: {returnDetail?.header?.return_number || 'Loading...'}</span>
                    {returnDetail?.header && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#092920] text-[#34d399] border border-[#059669]/40">
                        {returnDetail.header.status.toUpperCase()}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Customer: {returnDetail?.header?.customer_name || '...'}
                  </p>
                </div>
              </div>

              {/* Format Toggle & Close */}
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl p-1 bg-[#031413] border border-[#164e48]">
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      viewingFormat === 'details'
                        ? 'bg-[#103e39] text-[#38d4c5] shadow-sm'
                        : 'text-[#7aa5a0] hover:text-white'
                    }`}
                    onClick={() => setViewingFormat('details')}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      viewingFormat === 'thermal'
                        ? 'bg-[#103e39] text-[#38d4c5] shadow-sm'
                        : 'text-[#7aa5a0] hover:text-white'
                    }`}
                    onClick={() => setViewingFormat('thermal')}
                  >
                    80mm Thermal
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      viewingFormat === 'a4'
                        ? 'bg-[#103e39] text-[#38d4c5] shadow-sm'
                        : 'text-[#7aa5a0] hover:text-white'
                    }`}
                    onClick={() => setViewingFormat('a4')}
                  >
                    A4 Voucher
                  </button>
                </div>

                <button
                  type="button"
                  className="text-[#7aa5a0] hover:text-white p-1 rounded-lg cursor-pointer"
                  onClick={() => setViewingReturnId(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            {loadingDetail || !returnDetail ? (
              <div className="p-16 text-center text-[#7aa5a0] flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-7 h-7 text-[#38d4c5] animate-spin" />
                <span>Loading return items and credit note details...</span>
              </div>
            ) : viewingFormat === 'thermal' ? (
              <div className="p-6 overflow-y-auto max-h-[68vh] bg-[#031413] flex justify-center">
                <ThermalReceiptDocket
                  receipt={{
                    number: returnDetail.header.return_number,
                    date: returnDetail.header.return_date,
                    cashier: returnDetail.header.created_user || 'Cashier / Admin',
                    storeName: 'BABY BLOOM RETAIL',
                    addressLine1: 'No 45, Galle Road, Colombo 03',
                    addressLine2: `Branch: ${returnDetail.header.branch_name || 'Colombo Store'}`,
                    phoneLine: '011-2345678 | 077-1234567',
                    customerName: returnDetail.header.customer_name,
                    customerPhone: '',
                    items: returnDetail.items.map((it) => ({
                      name: `${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ''} [${(it.restock_condition || 'good').toUpperCase()}]`,
                      qty: it.quantity,
                      price: it.unit_price,
                      total: it.quantity * it.unit_price,
                    })),
                    subtotal: returnDetail.header.grand_total,
                    grandTotal: returnDetail.header.grand_total,
                    itemsQty: returnDetail.items.reduce((s, it) => s + it.quantity, 0),
                    paymentMethodName:
                      returnDetail.header.settlement_type === 'cash_refund'
                        ? 'CASH REFUND'
                        : returnDetail.header.settlement_type === 'bank_refund'
                        ? 'BANK REVERSAL'
                        : 'CREDIT NOTE',
                    paid: returnDetail.header.grand_total,
                    footerNote: '*** SALES RETURN / CREDIT MEMO ***\nStock restocked into inventory.\nPlease retain this voucher for ledger adjustment.',
                    softwareAttribution: 'Baby Bloom ERP POS',
                  }}
                />
              </div>
            ) : viewingFormat === 'a4' ? (
              <div className="p-6 overflow-y-auto max-h-[68vh] bg-[#031413]">
                <div
                  id="sales-return-voucher-printable"
                  className="bg-white text-black p-8 rounded-xl shadow-lg border border-gray-300 font-sans text-xs"
                >
                  <div className="flex justify-between items-start border-b-2 border-emerald-800 pb-4 mb-4">
                    <div>
                      <div className="text-xl font-black tracking-wider text-emerald-900 uppercase">
                        BABY BLOOM PVT LTD
                      </div>
                      <div className="text-[11px] text-gray-600 mt-0.5">
                        Premier Baby & Maternity Retail Specialists
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        No. 124, Galle Road, Colombo 03, Sri Lanka | Tel: +94 11 234 5678
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        VAT/TIN: 104829104-7000 | Co. Reg: PV-98421
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 font-bold text-xs uppercase tracking-widest rounded border border-emerald-300">
                        CREDIT NOTE / RETURN
                      </div>
                      <div className="text-sm font-black text-gray-900 mt-1.5 font-mono">
                        #{returnDetail.header.return_number}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Date: {formatBusinessDate(returnDetail.header.return_date)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-[11px]">
                    <div>
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Customer Information</div>
                      <div className="font-bold text-gray-900 text-xs mt-0.5">{returnDetail.header.customer_name}</div>
                      <div className="text-gray-600 font-mono text-[10px]">
                        Code: {returnDetail.header.customer_code || 'CUST'}
                      </div>
                      {returnDetail.header.invoice_number && (
                        <div className="text-emerald-700 font-bold mt-1 text-[10px]">
                          Original Invoice Ref: #{returnDetail.header.invoice_number}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Branch & Logistics</div>
                      <div className="font-semibold text-gray-800 text-[11px] mt-0.5">
                        {returnDetail.header.branch_name || 'Main Flagship Store'}
                      </div>
                      <div className="text-gray-700 font-medium text-[10px] mt-1">
                        Settlement: <span className="font-bold text-emerald-800 capitalize">{returnDetail.header.settlement_type.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-[10px] border-b border-gray-200">
                        <tr>
                          <th className="p-2 w-8 text-center">#</th>
                          <th className="p-2">Description</th>
                          <th className="p-2 text-center">Condition</th>
                          <th className="p-2 text-right">Unit Rate</th>
                          <th className="p-2 text-center">Qty Returned</th>
                          <th className="p-2 text-right">Refund Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {returnDetail.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-2 text-center font-mono text-gray-400">{idx + 1}</td>
                            <td className="p-2">
                              <div className="font-bold text-gray-900">{it.product_name}</div>
                              {it.variant_name && <div className="text-[10px] text-gray-500">{it.variant_name}</div>}
                              {it.sku && <div className="text-[9px] font-mono text-gray-400">{it.sku}</div>}
                            </td>
                            <td className="p-2 text-center">
                              <span className="capitalize px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                                {it.restock_condition}
                              </span>
                            </td>
                            <td className="p-2 text-right font-mono text-gray-700">
                              {formatCurrency(it.unit_price)}
                            </td>
                            <td className="p-2 text-center font-bold text-gray-900">
                              {it.quantity} PCS
                            </td>
                            <td className="p-2 text-right font-bold text-gray-900 font-mono">
                              {formatCurrency(it.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-2 gap-4 items-start mb-6">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-[10px] space-y-1">
                      <div className="font-bold text-gray-700 uppercase text-[9px]">Return Authorization Note</div>
                      <div className="text-gray-800">
                        <span className="font-semibold">Reason:</span> {returnDetail.header.reason}
                      </div>
                      {returnDetail.header.notes && (
                        <div className="text-gray-600">
                          <span className="font-semibold">Notes:</span> {returnDetail.header.notes}
                        </div>
                      )}
                      <div className="text-gray-500 pt-1 text-[9px]">
                        Returned items verified and re-entered into inventory stock register.
                      </div>
                    </div>

                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-right space-y-1.5">
                      <div className="flex justify-between text-gray-600 text-[11px]">
                        <span>Total Items Returned:</span>
                        <span className="font-bold text-gray-900">{returnDetail.items.length} lines</span>
                      </div>
                      <div className="flex justify-between text-gray-600 text-[11px]">
                        <span>Total Units Restocked:</span>
                        <span className="font-bold text-gray-900">
                          {returnDetail.items.reduce((s, it) => s + it.quantity, 0)} PCS
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-emerald-950 pt-2 border-t border-emerald-200">
                        <span>Total Credit / Refund:</span>
                        <span className="font-mono">{formatCurrency(returnDetail.header.grand_total)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-12 pt-6 border-t border-gray-200 text-[10px] text-gray-600">
                    <div>
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Customer Signature / Acknowledgment</div>
                      <div className="text-[9px] text-gray-400">Received refund / credit memo voucher</div>
                    </div>
                    <div className="text-right">
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Authorized Officer / Branch Manager</div>
                      <div className="text-[9px] text-gray-400">Baby Bloom (Pvt) Ltd Restock Control</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4 overflow-y-auto text-xs">
                {/* Header Summary Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#031413] p-4 rounded-xl border border-[#164e48]">
                  <div>
                    <span className="text-[#7aa5a0]">Customer:</span>
                    <div className="font-semibold text-white mt-1">{returnDetail.header.customer_name}</div>
                    <div className="text-[11px] text-[#527d78] font-mono">{returnDetail.header.customer_code}</div>
                  </div>
                  <div>
                    <span className="text-[#7aa5a0]">Return Date:</span>
                    <div className="font-semibold text-white mt-1">
                      {formatBusinessDate(returnDetail.header.return_date)}
                    </div>
                    <div className="text-[11px] text-[#527d78]">{returnDetail.header.branch_name}</div>
                  </div>
                  <div>
                    <span className="text-[#7aa5a0]">Original Invoice:</span>
                    <div className="font-mono text-[#38d4c5] font-semibold mt-1">
                      {returnDetail.header.invoice_number || 'Standalone Return'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#7aa5a0]">Settlement:</span>
                    <div className="mt-1">{renderSettlementBadge(returnDetail.header.settlement_type)}</div>
                  </div>
                </div>

                {/* Returned Line Items */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#a0c4c0] mb-2">
                    Returned Line Items & Restock Condition
                  </h4>
                  <div className="border border-[#164e48] rounded-xl overflow-hidden bg-[#031413]">
                    <table className="w-full text-left">
                      <thead className="bg-[#092925] border-b border-[#164e48] text-[#7aa5a0] uppercase text-[11px]">
                        <tr>
                          <th className="p-2.5">Item</th>
                          <th className="p-2.5 text-center">Condition</th>
                          <th className="p-2.5 text-center">Qty</th>
                          <th className="p-2.5 text-right">Unit Price</th>
                          <th className="p-2.5 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#113e3a]/60">
                        {returnDetail.items.map((it) => (
                          <tr key={it.id} className="hover:bg-[#082321]">
                            <td className="p-2.5">
                              <div className="font-semibold text-white">{it.product_name}</div>
                              <div className="text-[11px] text-[#527d78] font-mono">
                                {it.sku || it.product_code}
                              </div>
                            </td>
                            <td className="p-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  it.restock_condition === 'good'
                                    ? 'bg-[#092920] text-[#34d399] border border-[#059669]/30'
                                    : 'bg-[#290d13] text-[#f87171] border border-[#dc2626]/30'
                                }`}
                              >
                                {it.restock_condition === 'good'
                                  ? 'Good (Restocked)'
                                  : it.restock_condition === 'damaged'
                                  ? 'Damaged'
                                  : 'Write-off'}
                              </span>
                            </td>
                            <td className="p-2.5 text-center font-bold text-[#38d4c5]">{it.quantity}</td>
                            <td className="p-2.5 text-right text-[#a0c4c0]">{formatCurrency(it.unit_price)}</td>
                            <td className="p-2.5 text-right font-bold text-white font-mono">
                              {formatCurrency(it.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Refund Disbursements if any */}
                {returnDetail.refunds && returnDetail.refunds.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-[#092925] border border-[#164e48] space-y-1.5">
                    <div className="font-bold text-[#38d4c5] flex items-center gap-1.5">
                      <Banknote size={14} /> Customer Refund Disbursement Record
                    </div>
                    {returnDetail.refunds.map((rf) => (
                      <div key={rf.id} className="flex justify-between items-center text-[11px] text-white">
                        <span>
                          Paid via {rf.payment_method.toUpperCase()} {rf.bank_account_name ? `(${rf.bank_account_name})` : ''} on {formatBusinessDate(rf.refund_date)}
                        </span>
                        <strong className="text-[#34d399] font-mono">{formatCurrency(rf.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bottom Financial & Notes */}
                <div className="flex justify-between items-start pt-3 border-t border-[#164e48]">
                  <div className="max-w-xs space-y-1">
                    <div className="text-[#7aa5a0]">Return Reason:</div>
                    <div className="text-white font-medium">{returnDetail.header.reason}</div>
                    {returnDetail.header.notes && (
                      <div className="text-[#527d78] italic">Note: {returnDetail.header.notes}</div>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-sm font-bold text-white">
                      <span>Total Credit / Refund: </span>
                      <span className="text-[#f87171] font-mono">{formatCurrency(returnDetail.header.grand_total)}</span>
                    </div>
                    <div className="text-[11px] text-[#7aa5a0]">
                      Status: {renderStatusBadge(returnDetail.header.status)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-between items-center gap-2.5 no-print">
              <button
                type="button"
                className="px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print {viewingFormat === 'thermal' ? 'Thermal Docket' : viewingFormat === 'a4' ? 'A4 Voucher' : 'Document'}
              </button>

              <div className="flex items-center gap-2">
                {returnDetail?.header?.status === 'draft' && (
                  <button
                    type="button"
                    className="px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                    disabled={postMutation.isPending}
                    onClick={() => postMutation.mutate(returnDetail.header.id)}
                  >
                    <CheckCircle2 size={14} /> {postMutation.isPending ? 'Posting...' : 'Post Return Now'}
                  </button>
                )}
                <button
                  type="button"
                  className="px-4 py-2 border border-[#164e48] rounded-xl text-xs font-semibold text-[#a0c4c0] bg-[#082321] hover:bg-[#12423c] hover:text-white cursor-pointer"
                  onClick={() => setViewingReturnId(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Quick Print (Thermal Docket or A4 Voucher directly) ─────── */}
      {quickPrint && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-2xl w-full overflow-hidden text-white flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#164e48] bg-[#0c2e2a] no-print">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-[#38d4c5]" />
                <h3 className="text-sm font-bold text-white">
                  {quickPrint.format === 'thermal' ? '80mm Thermal Receipt Docket' : 'Commercial Credit Note Voucher (A4)'}
                </h3>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setQuickPrint(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 bg-slate-900/60 overflow-y-auto flex justify-center max-h-[75vh]">
              {loadingQuickPrint || !activePrintDetail ? (
                <div className="p-12 text-center text-sm text-[#7aa5a0]">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#38d4c5] mb-2" />
                  Loading return document...
                </div>
              ) : quickPrint.format === 'thermal' ? (
                <div className="shadow-2xl rounded border border-gray-400 bg-white">
                  <ThermalReceiptDocket
                    receipt={{
                      number: activePrintDetail.header.return_number,
                      date: activePrintDetail.header.return_date,
                      cashier: activePrintDetail.header.created_user || 'Cashier',
                      storeName: 'BABY BLOOM RETAIL',
                      addressLine1: 'No 45, Galle Road, Colombo 03',
                      addressLine2: `Branch: ${activePrintDetail.header.branch_name || 'Colombo Store'}`,
                      phoneLine: '011-2345678 | 077-1234567',
                      customerName: activePrintDetail.header.customer_name,
                      customerPhone: '',
                      items: activePrintDetail.items.map((it) => ({
                        name: `${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ''} [${(it.restock_condition || 'good').toUpperCase()}]`,
                        qty: it.quantity,
                        price: it.unit_price,
                        total: it.quantity * it.unit_price,
                      })),
                      subtotal: activePrintDetail.header.grand_total,
                      grandTotal: activePrintDetail.header.grand_total,
                      itemsQty: activePrintDetail.items.reduce((s, it) => s + it.quantity, 0),
                      paymentMethodName:
                        activePrintDetail.header.settlement_type === 'cash_refund'
                          ? 'CASH REFUND'
                          : activePrintDetail.header.settlement_type === 'bank_refund'
                          ? 'BANK REVERSAL'
                          : 'CREDIT NOTE',
                      paid: activePrintDetail.header.grand_total,
                      footerNote: '*** SALES RETURN / CREDIT MEMO ***\nStock restocked into inventory.\nPlease retain this voucher for ledger adjustment.',
                      softwareAttribution: 'Baby Bloom ERP POS',
                    }}
                  />
                </div>
              ) : (
                <div
                  id="sales-return-voucher-printable"
                  className="bg-white text-black p-8 rounded-xl shadow-lg border border-gray-300 font-sans text-xs w-full"
                >
                  <div className="flex justify-between items-start border-b-2 border-emerald-800 pb-4 mb-4">
                    <div>
                      <div className="text-xl font-black tracking-wider text-emerald-900 uppercase">
                        BABY BLOOM PVT LTD
                      </div>
                      <div className="text-[11px] text-gray-600 mt-0.5">
                        Premier Baby & Maternity Retail Specialists
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        No. 124, Galle Road, Colombo 03, Sri Lanka | Tel: +94 11 234 5678
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        VAT/TIN: 104829104-7000 | Co. Reg: PV-98421
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 font-bold text-xs uppercase tracking-widest rounded border border-emerald-300">
                        CREDIT NOTE / RETURN
                      </div>
                      <div className="text-sm font-black text-gray-900 mt-1.5 font-mono">
                        #{activePrintDetail.header.return_number}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Date: {formatBusinessDate(activePrintDetail.header.return_date)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-[11px]">
                    <div>
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Customer Information</div>
                      <div className="font-bold text-gray-900 text-xs mt-0.5">{activePrintDetail.header.customer_name}</div>
                      <div className="text-gray-600 font-mono text-[10px]">
                        Code: {activePrintDetail.header.customer_code || 'CUST'}
                      </div>
                      {activePrintDetail.header.invoice_number && (
                        <div className="text-emerald-700 font-bold mt-1 text-[10px]">
                          Original Invoice Ref: #{activePrintDetail.header.invoice_number}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Branch & Logistics</div>
                      <div className="font-semibold text-gray-800 text-[11px] mt-0.5">
                        {activePrintDetail.header.branch_name || 'Main Flagship Store'}
                      </div>
                      <div className="text-gray-700 font-medium text-[10px] mt-1">
                        Settlement: <span className="font-bold text-emerald-800 capitalize">{activePrintDetail.header.settlement_type.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-[10px] border-b border-gray-200">
                        <tr>
                          <th className="p-2 w-8 text-center">#</th>
                          <th className="p-2">Description</th>
                          <th className="p-2 text-center">Condition</th>
                          <th className="p-2 text-right">Unit Rate</th>
                          <th className="p-2 text-center">Qty Returned</th>
                          <th className="p-2 text-right">Refund Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {activePrintDetail.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-2 text-center font-mono text-gray-400">{idx + 1}</td>
                            <td className="p-2">
                              <div className="font-bold text-gray-900">{it.product_name}</div>
                              {it.variant_name && <div className="text-[10px] text-gray-500">{it.variant_name}</div>}
                              {it.sku && <div className="text-[9px] font-mono text-gray-400">{it.sku}</div>}
                            </td>
                            <td className="p-2 text-center">
                              <span className="capitalize px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                                {it.restock_condition}
                              </span>
                            </td>
                            <td className="p-2 text-right font-mono text-gray-700">
                              {formatCurrency(it.unit_price)}
                            </td>
                            <td className="p-2 text-center font-bold text-gray-900">
                              {it.quantity} PCS
                            </td>
                            <td className="p-2 text-right font-bold text-gray-900 font-mono">
                              {formatCurrency(it.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-2 gap-4 items-start mb-6">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-[10px] space-y-1">
                      <div className="font-bold text-gray-700 uppercase text-[9px]">Return Authorization Note</div>
                      <div className="text-gray-800">
                        <span className="font-semibold">Reason:</span> {activePrintDetail.header.reason}
                      </div>
                      {activePrintDetail.header.notes && (
                        <div className="text-gray-600">
                          <span className="font-semibold">Notes:</span> {activePrintDetail.header.notes}
                        </div>
                      )}
                    </div>

                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-right space-y-1.5">
                      <div className="flex justify-between text-gray-600 text-[11px]">
                        <span>Total Items Returned:</span>
                        <span className="font-bold text-gray-900">{activePrintDetail.items.length} lines</span>
                      </div>
                      <div className="flex justify-between text-gray-600 text-[11px]">
                        <span>Total Units Restocked:</span>
                        <span className="font-bold text-gray-900">
                          {activePrintDetail.items.reduce((s, it) => s + it.quantity, 0)} PCS
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-emerald-950 pt-2 border-t border-emerald-200">
                        <span>Total Credit / Refund:</span>
                        <span className="font-mono">{formatCurrency(activePrintDetail.header.grand_total)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-12 pt-6 border-t border-gray-200 text-[10px] text-gray-600">
                    <div>
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Customer Signature / Acknowledgment</div>
                    </div>
                    <div className="text-right">
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Authorized Officer / Branch Manager</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-end gap-2.5 no-print">
              <button
                type="button"
                className="px-3.5 py-1.5 text-xs text-[#a0c4c0] hover:text-white rounded-lg bg-[#082321] border border-[#164e48] cursor-pointer"
                onClick={() => setQuickPrint(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer shadow-md"
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Audit Ledger Register Summary Report ─────────────────────── */}
      {registerPrintModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-4xl w-full overflow-hidden text-white flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#164e48] bg-[#0c2e2a] no-print">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-[#38d4c5]" />
                <h3 className="text-sm font-bold text-white">Sales Returns & Credit Notes Register Audit Report</h3>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setRegisterPrintModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 bg-slate-900/60 overflow-y-auto flex justify-center max-h-[75vh]">
              <div
                id="returns-register-summary-printable"
                className="w-full bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl border border-gray-300 rounded-xl"
              >
                {/* Header */}
                <div className="text-center pb-4 border-b-2 border-black mb-4">
                  <h1 className="text-2xl font-black uppercase tracking-wider text-black">BABY BLOOM (PVT) LTD</h1>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-900 mt-0.5">
                    Sales Returns & Credit Notes Register • Audit Ledger Summary
                  </h2>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Generated: {new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })} • Official Finance & Inventory Ledger
                  </p>
                </div>

                {/* Audit KPIs */}
                <div className="grid grid-cols-4 gap-3 bg-gray-50 border border-gray-300 p-3 rounded mb-4 text-center">
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">TOTAL RETURNS</span>
                    <strong className="text-base text-black font-mono">{rows.length}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">GROSS REFUND VALUE</span>
                    <strong className="text-base text-rose-800 font-mono">{formatCurrency(grossRefundAmount)}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">STORE CREDITS ISSUED</span>
                    <strong className="text-base text-amber-800 font-mono">{formatCurrency(storeCreditIssued)}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">CASH & BANK REFUNDS</span>
                    <strong className="text-base text-emerald-800 font-mono">{formatCurrency(cashRefundsDisbursed)}</strong>
                  </div>
                </div>

                {/* Register Table */}
                <table className="w-full text-left text-[11px] border border-gray-300 mb-6">
                  <thead className="bg-gray-100 font-bold border-b border-gray-300 text-[10px] uppercase">
                    <tr>
                      <th className="p-1.5 border-r border-gray-300 text-center">#</th>
                      <th className="p-1.5 border-r border-gray-300">Return No</th>
                      <th className="p-1.5 border-r border-gray-300">Date</th>
                      <th className="p-1.5 border-r border-gray-300">Ref Invoice</th>
                      <th className="p-1.5 border-r border-gray-300">Customer</th>
                      <th className="p-1.5 border-r border-gray-300">Branch</th>
                      <th className="p-1.5 border-r border-gray-300 text-center">Settlement</th>
                      <th className="p-1.5 border-r border-gray-300 text-center">Status</th>
                      <th className="p-1.5 text-right">Return Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((r, idx) => (
                      <tr key={r.id || idx}>
                        <td className="p-1.5 border-r border-gray-200 text-center font-mono">{idx + 1}</td>
                        <td className="p-1.5 border-r border-gray-200 font-mono font-bold">{r.return_number}</td>
                        <td className="p-1.5 border-r border-gray-200 whitespace-nowrap">
                          {formatBusinessDate(r.return_date)}
                        </td>
                        <td className="p-1.5 border-r border-gray-200 font-mono">
                          {r.invoice_number || 'Standalone'}
                        </td>
                        <td className="p-1.5 border-r border-gray-200 font-medium">
                          {r.customer_name || 'Walk-in'}
                        </td>
                        <td className="p-1.5 border-r border-gray-200">{r.branch_name || 'Main Branch'}</td>
                        <td className="p-1.5 border-r border-gray-200 text-center uppercase text-[9px] font-bold">
                          {r.settlement_type.replace(/_/g, ' ')}
                        </td>
                        <td className="p-1.5 border-r border-gray-200 text-center uppercase text-[9px] font-bold">
                          {r.status}
                        </td>
                        <td className="p-1.5 text-right font-mono font-bold text-rose-800">
                          {formatCurrency(r.grand_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Certified Sign-Off Blocks */}
                <div className="grid grid-cols-2 gap-12 pt-8 mt-6 border-t border-gray-300 text-center text-xs">
                  <div>
                    <div className="border-b border-black w-48 mx-auto mb-1.5" />
                    <span className="font-semibold">Prepared by (Returns & Restock Custodian)</span>
                  </div>
                  <div>
                    <div className="border-b border-black w-48 mx-auto mb-1.5" />
                    <span className="font-semibold">Audited & Approved (Finance Controller / Branch Manager)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-end gap-2.5 no-print">
              <button
                type="button"
                className="px-3.5 py-1.5 text-xs text-[#a0c4c0] hover:text-white rounded-lg bg-[#082321] border border-[#164e48] cursor-pointer"
                onClick={() => setRegisterPrintModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer shadow-md"
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print Audit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: Return Reversal Confirmation ───────────────────────────── */}
      {reverseModal.open && reverseModal.returnItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-md w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#164e48] bg-[#0c2e2a]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#290d13] border border-[#dc2626]/40 rounded-xl text-[#f87171]">
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Reverse Return #{reverseModal.returnItem.return_number}
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Total Refund: {formatCurrency(reverseModal.returnItem.grand_total)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1.5 rounded-lg cursor-pointer"
                onClick={() => setReverseModal({ open: false, returnItem: null, reason: '' })}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Reason for Reversal
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:outline-none focus:border-[#f87171]"
                  rows={3}
                  placeholder="Specify why this sales return is being reversed..."
                  value={reverseModal.reason}
                  onChange={(e) => setReverseModal((m) => ({ ...m, reason: e.target.value }))}
                />
              </div>

              <div className="p-3 bg-[#290d13] rounded-xl text-xs text-[#fca5a5] border border-[#dc2626]/40">
                Warning: Reversing this return will reverse stock reinstatement movements and void customer credit notes or refund disbursement entries.
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#164e48] bg-[#0c2e2a]">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#082321] hover:bg-[#12423c] hover:text-white cursor-pointer"
                onClick={() => setReverseModal({ open: false, returnItem: null, reason: '' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-gradient-to-r from-[#e11d48] to-[#be123c] hover:from-[#be123c] hover:to-[#9f1239] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#e11d48]/20 transition-all disabled:opacity-50 cursor-pointer"
                disabled={reverseMutation.isPending || !reverseModal.reason.trim()}
                onClick={handleConfirmReverse}
              >
                {reverseMutation.isPending ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
