import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Coins,
  Search,
  RotateCcw,
  Printer,
  Eye,
  RefreshCw,
  Plus,
  TrendingDown,
  CreditCard,
  Banknote,
  Building2,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
  Users,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { listCustomerRefunds } from '../services/sales'
import { listLookup } from '../services/masterData'
import { MOCK_BRANCHES, MOCK_CUSTOMERS } from '../services/mockData'
import { formatBusinessDate } from '../lib/dates'
import { ThermalReceiptDocket } from '../components/common/ThermalReceiptDocket'
import type { CustomerRefundRow } from '../types/sales'

const formatCurrency = (n: number | null | undefined) => {
  if (n === null || n === undefined) return 'Rs. 0.00'
  return `Rs. ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const RefundsPage: React.FC = () => {
  // ── Filter State ──────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // ── Modals & Notifications State ──────────────────────────────────────────
  const [selectedRefund, setSelectedRefund] = useState<CustomerRefundRow | null>(null)
  const [viewingFormat, setViewingFormat] = useState<'details' | 'thermal' | 'a4'>('details')
  const [quickPrint, setQuickPrint] = useState<{ refund: CustomerRefundRow; format: 'thermal' | 'a4' } | null>(null)
  const [registerPrintModal, setRegisterPrintModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)

  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Lookups ───────────────────────────────────────────────────────────────
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

  // ── Refunds Query ─────────────────────────────────────────────────────────
  const { data: refundResult, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customer-refunds', page, searchTerm, selectedBranch, selectedCustomer, methodFilter, dateFrom, dateTo],
    queryFn: () =>
      listCustomerRefunds({
        page,
        pageSize,
        search: searchTerm || undefined,
        branchId: selectedBranch !== 'all' && selectedBranch ? selectedBranch : undefined,
        customerId: selectedCustomer || undefined,
        paymentMethod: methodFilter !== 'all' ? methodFilter : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  })

  const rows = refundResult?.rows ?? []
  const totalCount = refundResult?.count ?? 0

  // ── Executive KPI Calculations ────────────────────────────────────────────
  const totalRefundAmount = useMemo(() => {
    return rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
  }, [rows])

  const cashRows = useMemo(() => rows.filter((r) => r.payment_method === 'cash'), [rows])
  const cashPayouts = useMemo(() => cashRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0), [cashRows])

  const bankRows = useMemo(() => rows.filter((r) => r.payment_method === 'bank_transfer'), [rows])
  const bankPayouts = useMemo(() => bankRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0), [bankRows])

  const cardRows = useMemo(() => rows.filter((r) => r.payment_method === 'card'), [rows])
  const cardPayouts = useMemo(() => cardRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0), [cardRows])

  const averageRefund = useMemo(() => {
    return rows.length > 0 ? totalRefundAmount / rows.length : 0
  }, [rows, totalRefundAmount])

  // ── Export CSV Handler ────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (rows.length === 0) {
      notify('No refund disbursement records to export for active filters.', true)
      return
    }

    const headers = [
      'Date',
      'Associated Return #',
      'Customer Name',
      'Customer Code',
      'Branch',
      'Disbursement Channel',
      'Bank Account',
      'Reference Number',
      'Amount (LKR)',
      'Disbursed By',
      'Notes',
    ]

    const csvRows = rows.map((r) => [
      `"${r.refund_date ? r.refund_date.slice(0, 10) : ''}"`,
      `"${r.return_number || 'Direct Refund'}"`,
      `"${(r.customer_name || 'Walk-in Customer').replace(/"/g, '""')}"`,
      `"${r.customer_code || 'CUST'}"`,
      `"${(r.branch_name || 'Main Branch').replace(/"/g, '""')}"`,
      `"${r.payment_method.toUpperCase()}"`,
      `"${(r.bank_account_name || 'Cash Register').replace(/"/g, '""')}"`,
      `"${(r.reference_number || '').replace(/"/g, '""')}"`,
      (Number(r.amount) || 0).toFixed(2),
      `"${(r.created_user || 'Cashier').replace(/"/g, '""')}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `customer_refunds_disbursements_${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    notify('Disbursements register exported to CSV successfully!')
  }

  // ── Render Method Badges ──────────────────────────────────────────────────
  const renderMethodBadge = (m: string) => {
    switch (m) {
      case 'cash':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#063026] text-[#34d399] border border-[#10b981]/30 shadow-sm">
            <Banknote size={13} /> Cash Payout
          </span>
        )
      case 'bank_transfer':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0a273b] text-[#38bdf8] border border-[#0284c7]/30 shadow-sm">
            <Building2 size={13} /> Bank Transfer
          </span>
        )
      case 'card':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#26153b] text-[#c084fc] border border-[#9333ea]/30 shadow-sm">
            <CreditCard size={13} /> Card Reversal
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0e3b37] text-[#a0c4c0]">
            {m}
          </span>
        )
    }
  }

  const activePrintRefund = quickPrint?.refund || selectedRefund

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

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6 no-print">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <Coins className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Customer Refunds & Disbursements
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Disbursement Subledger
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Audit ledger of cash drawer payouts, bank transfers, and card merchant refund entries disbursed against sales returns
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors cursor-pointer"
            disabled={isRefetching}
            onClick={() => refetch()}
            title="Refresh disbursements ledger"
          >
            <RefreshCw size={15} className={isRefetching ? 'animate-spin text-[#38d4c5]' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors cursor-pointer"
            onClick={handleExportCsv}
            title="Export filtered records to CSV"
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
            to="/sales/returns"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] rounded-xl text-sm font-semibold transition-colors"
          >
            <RotateCcw size={15} /> Returns Register
          </Link>

          <Link
            to="/sales/new-return"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#059669]/20 transition-all active:scale-[0.98]"
          >
            <Plus size={16} /> Process Sales Return
          </Link>
        </div>
      </div>

      {/* ── 6 KPI Metric Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 no-print">
        {/* Card 1: Total Disbursements */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7aa5a0]">Total Payouts</span>
            <span className="p-1.5 bg-[#103e39] rounded-lg text-[#38d4c5]">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{totalCount}</div>
          <div className="mt-1 text-[11px] text-[#527d78]">Disbursement entries</div>
        </div>

        {/* Card 2: Total Disbursed Volume */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#f87171]">Gross Disbursed</span>
            <span className="p-1.5 bg-[#290d13] rounded-lg text-[#f87171]">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-[#f87171] truncate" title={formatCurrency(totalRefundAmount)}>
            Rs. {totalRefundAmount.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">Total cash & bank refunds</div>
        </div>

        {/* Card 3: Cash Drawer Payouts */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#34d399]">Cash Payouts</span>
            <span className="p-1.5 bg-[#0d3327] rounded-lg text-[#34d399]">
              <Banknote className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-[#34d399] truncate" title={formatCurrency(cashPayouts)}>
            Rs. {cashPayouts.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">{cashRows.length} cash drawer slips</div>
        </div>

        {/* Card 4: Bank Transfers */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#38bdf8]">Bank Transfers</span>
            <span className="p-1.5 bg-[#0a273b] rounded-lg text-[#38bdf8]">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-[#38bdf8] truncate" title={formatCurrency(bankPayouts)}>
            Rs. {bankPayouts.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">{bankRows.length} online transfers</div>
        </div>

        {/* Card 5: Card Reversals */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#c084fc]">Card Reversals</span>
            <span className="p-1.5 bg-[#26153b] rounded-lg text-[#c084fc]">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-[#c084fc] truncate" title={formatCurrency(cardPayouts)}>
            Rs. {cardPayouts.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">{cardRows.length} card gateway credits</div>
        </div>

        {/* Card 6: Average Refund Size */}
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#fbbf24]">Avg Ticket Size</span>
            <span className="p-1.5 bg-[#2b2408] rounded-lg text-[#fbbf24]">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-[#fbbf24] truncate" title={formatCurrency(averageRefund)}>
            Rs. {averageRefund.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-[11px] text-[#7aa5a0]">Mean per disbursement</div>
        </div>
      </div>

      {/* ── Method Navigation Tabs ───────────────────────────────────────────── */}
      <div className="flex border-b border-[#164e48] overflow-x-auto gap-2 pb-1 no-print">
        {[
          { id: 'all', label: 'All Disbursements', count: totalCount },
          { id: 'cash', label: 'Cash Payouts', count: cashRows.length },
          { id: 'bank_transfer', label: 'Bank Transfers', count: bankRows.length },
          { id: 'card', label: 'Card Reversals', count: cardRows.length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
              methodFilter === tab.id
                ? 'bg-[#0e3b37] text-[#38d4c5] border-t-2 border-x-2 border-[#164e48] border-b-transparent shadow-sm'
                : 'text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]'
            }`}
            onClick={() => {
              setMethodFilter(tab.id)
              setPage(1)
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  methodFilter === tab.id ? 'bg-[#103e39] text-[#38d4c5]' : 'bg-[#041917] text-[#7aa5a0]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Multi-Dimensional Filter Bar ────────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 p-4 rounded-2xl border border-[#164e48] shadow-md flex flex-col md:flex-row gap-3 items-center justify-between backdrop-blur-sm no-print">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#527d78]" size={16} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white placeholder-[#527d78] focus:outline-none focus:border-[#38d4c5]"
            placeholder="Search customer, return #, ref #..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
          />
        </div>

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

          {/* Date Range Picker */}
          <div className="flex items-center gap-1.5 bg-[#031413] border border-[#164e48] rounded-xl px-2.5 py-1 text-xs">
            <input
              type="date"
              className="bg-transparent text-white focus:outline-none cursor-pointer text-xs"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              title="Date From"
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
              title="Date To"
            />
          </div>

          {/* Clear Filters */}
          {(searchTerm || selectedBranch || selectedCustomer || methodFilter !== 'all' || dateFrom || dateTo) && (
            <button
              type="button"
              className="text-xs text-[#f87171] hover:text-white px-2 py-1 underline cursor-pointer"
              onClick={() => {
                setSearchTerm('')
                setSelectedBranch('')
                setSelectedCustomer('')
                setMethodFilter('all')
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

      {/* ── Main Disbursements Table ────────────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 rounded-2xl border border-[#164e48] shadow-2xl overflow-hidden backdrop-blur-md no-print">
        {isLoading ? (
          <div className="p-16 text-center text-sm text-[#7aa5a0] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 text-[#38d4c5] animate-spin" />
            <span>Loading customer refund disbursement records...</span>
          </div>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#092925] border-b border-[#164e48] text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Disbursement Date</th>
                  <th className="px-5 py-3.5">Associated Return #</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">Channel</th>
                  <th className="px-5 py-3.5">Account / Reference</th>
                  <th className="px-5 py-3.5 text-right">Refund Amount</th>
                  <th className="px-5 py-3.5">Disbursed By</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#113e3a]/60">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#0c312d]/60 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-[#a0c4c0] whitespace-nowrap">
                      {formatBusinessDate(row.refund_date)}
                    </td>

                    <td className="px-5 py-3.5 text-xs whitespace-nowrap">
                      {row.return_number ? (
                        <Link
                          to="/sales/returns"
                          className="font-mono font-bold text-[#38d4c5] hover:underline"
                        >
                          {row.return_number}
                        </Link>
                      ) : (
                        <span className="text-[#527d78] italic">Direct Refund</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{row.customer_name || 'Walk-in Customer'}</div>
                      <div className="text-[11px] text-[#527d78] font-mono">{row.customer_code}</div>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-[#a0c4c0]">
                      {row.branch_name || 'Main Branch'}
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {renderMethodBadge(row.payment_method)}
                    </td>

                    <td className="px-5 py-3.5 text-xs">
                      {row.bank_account_name && (
                        <div className="text-white font-medium">{row.bank_account_name}</div>
                      )}
                      {row.reference_number && (
                        <div className="text-[11px] text-[#527d78] font-mono">Ref: {row.reference_number}</div>
                      )}
                      {!row.bank_account_name && !row.reference_number && (
                        <span className="text-[#527d78]">Cash Register / Drawer</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right font-bold text-[#f87171] whitespace-nowrap font-mono">
                      {formatCurrency(row.amount)}
                    </td>

                    <td className="px-5 py-3.5 text-xs text-[#a0c4c0]">
                      {row.created_user || 'Cashier / Admin'}
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {/* View Voucher */}
                        <button
                          type="button"
                          className="p-1.5 text-[#7aa5a0] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48] cursor-pointer"
                          title="View Refund Voucher Details"
                          onClick={() => {
                            setSelectedRefund(row)
                            setViewingFormat('details')
                          }}
                        >
                          <Eye size={15} />
                        </button>

                        {/* Quick Print Thermal Slip */}
                        <button
                          type="button"
                          className="p-1.5 text-[#38d4c5] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48] cursor-pointer"
                          title="Print 80mm Thermal Receipt Slip"
                          onClick={() => {
                            setQuickPrint({ refund: row, format: 'thermal' })
                          }}
                        >
                          <Printer size={15} />
                        </button>

                        {/* Quick Print A4 Commercial Voucher */}
                        <button
                          type="button"
                          className="p-1.5 text-[#facc15] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48] cursor-pointer"
                          title="Print A4 Commercial Disbursement Voucher"
                          onClick={() => {
                            setQuickPrint({ refund: row, format: 'a4' })
                          }}
                        >
                          <FileText size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center">
            <Coins size={44} className="mx-auto text-[#38d4c5] mb-3 opacity-60" />
            <h3 className="text-base font-semibold text-white">No customer refunds recorded</h3>
            <p className="text-sm text-[#7aa5a0] mt-1 max-w-sm mx-auto">
              No refund transactions found for this selection. Refunds are generated when sales returns are settled with cash or bank payout.
            </p>
            <div className="mt-5">
              <Link
                to="/sales/new-return"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-md transition-all"
              >
                <Plus size={16} />
                Process Sales Return
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

      {/* ── MODAL 1: Refund Voucher Slip & Inspector ─────────────────────────── */}
      {selectedRefund && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#164e48] bg-[#0c2e2a] no-print">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5]">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Customer Refund Voucher
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Date: {formatBusinessDate(selectedRefund.refund_date)} • Ref: {selectedRefund.return_number || 'Direct'}
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
                  onClick={() => setSelectedRefund(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            {viewingFormat === 'thermal' ? (
              <div className="p-6 overflow-y-auto max-h-[68vh] bg-[#031413] flex justify-center">
                <ThermalReceiptDocket
                  receipt={{
                    number: selectedRefund.return_number ? `RFD-${selectedRefund.return_number}` : `RFD-${selectedRefund.id.slice(0, 8)}`,
                    date: selectedRefund.refund_date,
                    cashier: selectedRefund.created_user || 'Cashier',
                    storeName: 'BABY BLOOM RETAIL',
                    addressLine1: 'No 45, Galle Road, Colombo 03',
                    addressLine2: `Branch: ${selectedRefund.branch_name || 'Colombo Store'}`,
                    phoneLine: '011-2345678 | 077-1234567',
                    customerName: selectedRefund.customer_name || 'Walk-in Customer',
                    customerPhone: '',
                    items: [
                      {
                        name: `CUSTOMER REFUND DISBURSEMENT (${selectedRefund.payment_method.toUpperCase()})`,
                        qty: 1,
                        price: selectedRefund.amount,
                        total: selectedRefund.amount,
                      },
                    ],
                    subtotal: selectedRefund.amount,
                    grandTotal: selectedRefund.amount,
                    itemsQty: 1,
                    paymentMethodName: selectedRefund.payment_method === 'cash' ? 'CASH PAYOUT' : 'BANK / CARD REVERSAL',
                    paid: selectedRefund.amount,
                    footerNote: '*** CUSTOMER REFUND SLIP ***\nFunds disbursed to customer.\nPlease retain this voucher for records.',
                    softwareAttribution: 'Baby Bloom ERP POS',
                  }}
                />
              </div>
            ) : viewingFormat === 'a4' ? (
              <div className="p-6 overflow-y-auto max-h-[68vh] bg-[#031413]">
                <div
                  id="refund-voucher-printable"
                  className="bg-white text-black p-8 rounded-xl shadow-lg border border-gray-300 font-sans text-xs w-full"
                >
                  {/* Letterhead */}
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
                      <div className="inline-block px-3 py-1 bg-rose-100 text-rose-900 font-bold text-xs uppercase tracking-widest rounded border border-rose-300">
                        REFUND DISBURSEMENT VOUCHER
                      </div>
                      <div className="text-sm font-black text-gray-900 mt-1.5 font-mono">
                        VOUCHER: #{selectedRefund.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Date: {formatBusinessDate(selectedRefund.refund_date)}
                      </div>
                    </div>
                  </div>

                  {/* Customer and Logistics Info */}
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4 text-[11px]">
                    <div>
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Customer (Payee)</div>
                      <div className="font-bold text-gray-900 text-sm mt-0.5">{selectedRefund.customer_name || 'Walk-in Customer'}</div>
                      <div className="text-gray-600 font-mono text-[10px]">
                        Code: {selectedRefund.customer_code || 'CUST'}
                      </div>
                      {selectedRefund.return_number && (
                        <div className="text-emerald-800 font-bold mt-1 text-[11px]">
                          Sales Return Ref: #{selectedRefund.return_number}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Disbursement Routing</div>
                      <div className="font-semibold text-gray-800 text-[11px] mt-0.5">
                        Branch: {selectedRefund.branch_name || 'Main Flagship Store'}
                      </div>
                      <div className="text-emerald-800 font-bold text-[11px] mt-1 capitalize">
                        Channel: {selectedRefund.payment_method.replace(/_/g, ' ')}
                      </div>
                      {selectedRefund.bank_account_name && (
                        <div className="text-gray-700 font-mono text-[10px]">
                          Bank Account: {selectedRefund.bank_account_name}
                        </div>
                      )}
                      {selectedRefund.reference_number && (
                        <div className="text-gray-600 font-mono text-[10px]">
                          Reference / Cheque: {selectedRefund.reference_number}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Amount Breakdown Box */}
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg mb-6 flex justify-between items-center">
                    <div>
                      <span className="text-xs uppercase font-bold text-rose-900">Total Refund Disbursed</span>
                      <p className="text-[10px] text-rose-700 mt-0.5">
                        Settled against return of merchandise into inventory
                      </p>
                    </div>
                    <div className="text-2xl font-black text-rose-900 font-mono">
                      {formatCurrency(selectedRefund.amount)}
                    </div>
                  </div>

                  {selectedRefund.notes && (
                    <div className="p-3 bg-gray-50 rounded border border-gray-200 text-[10px] text-gray-700 mb-6">
                      <strong className="text-gray-900">Remarks / Authorization: </strong>
                      {selectedRefund.notes}
                    </div>
                  )}

                  {/* Sign-off Blocks */}
                  <div className="grid grid-cols-2 gap-12 pt-8 border-t border-gray-200 text-[10px] text-gray-600">
                    <div>
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Customer Signature / Acknowledgment</div>
                      <div className="text-[9px] text-gray-400">Received full refund settlement</div>
                    </div>
                    <div className="text-right">
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Disbursing Cashier / Finance Officer</div>
                      <div className="text-[9px] text-gray-400">Baby Bloom (Pvt) Ltd Accounts</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4 text-xs overflow-y-auto">
                <div className="bg-[#031413] p-4 rounded-xl border border-[#164e48] space-y-3">
                  <div className="flex justify-between">
                    <span className="text-[#7aa5a0]">Customer:</span>
                    <span className="font-semibold text-white">{selectedRefund.customer_name}</span>
                  </div>
                  {selectedRefund.customer_code && (
                    <div className="flex justify-between">
                      <span className="text-[#7aa5a0]">Customer Code:</span>
                      <span className="font-mono text-[#a0c4c0]">{selectedRefund.customer_code}</span>
                    </div>
                  )}
                  {selectedRefund.return_number && (
                    <div className="flex justify-between">
                      <span className="text-[#7aa5a0]">Associated Return:</span>
                      <span className="font-mono text-[#38d4c5] font-semibold">{selectedRefund.return_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[#7aa5a0]">Branch:</span>
                    <span className="text-white">{selectedRefund.branch_name || 'Main Branch'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7aa5a0]">Disbursement Channel:</span>
                    <div>{renderMethodBadge(selectedRefund.payment_method)}</div>
                  </div>
                  {selectedRefund.bank_account_name && (
                    <div className="flex justify-between">
                      <span className="text-[#7aa5a0]">Bank Account:</span>
                      <span className="text-white font-medium">{selectedRefund.bank_account_name}</span>
                    </div>
                  )}
                  {selectedRefund.reference_number && (
                    <div className="flex justify-between">
                      <span className="text-[#7aa5a0]">Reference / Cheque #:</span>
                      <span className="font-mono text-white">{selectedRefund.reference_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[#7aa5a0]">Disbursed By:</span>
                    <span className="text-[#a0c4c0]">{selectedRefund.created_user || 'Cashier / Admin'}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold pt-2.5 border-t border-[#164e48]">
                    <span className="text-white">Refund Disbursed:</span>
                    <span className="text-[#f87171] font-mono">{formatCurrency(selectedRefund.amount)}</span>
                  </div>
                </div>

                {selectedRefund.notes && (
                  <div className="p-3.5 rounded-xl bg-[#031413] border border-[#164e48] text-xs text-[#a0c4c0]">
                    <span className="font-semibold text-white">Remarks / Notes: </span>
                    {selectedRefund.notes}
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-between items-center no-print">
              <button
                type="button"
                className="px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print {viewingFormat === 'thermal' ? 'Thermal Slip' : viewingFormat === 'a4' ? 'A4 Voucher' : 'Document'}
              </button>

              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] rounded-xl text-xs font-semibold text-[#a0c4c0] bg-[#082321] hover:bg-[#12423c] hover:text-white cursor-pointer"
                onClick={() => setSelectedRefund(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Quick Print Modal (Thermal Slip or A4 Voucher) ─────────── */}
      {quickPrint && activePrintRefund && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-2xl w-full overflow-hidden text-white flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#164e48] bg-[#0c2e2a] no-print">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-[#38d4c5]" />
                <h3 className="text-sm font-bold text-white">
                  {quickPrint.format === 'thermal' ? '80mm Thermal Receipt Slip' : 'Commercial Refund Voucher (A4)'}
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
              {quickPrint.format === 'thermal' ? (
                <div className="shadow-2xl rounded border border-gray-400 bg-white">
                  <ThermalReceiptDocket
                    receipt={{
                      number: activePrintRefund.return_number ? `RFD-${activePrintRefund.return_number}` : `RFD-${activePrintRefund.id.slice(0, 8)}`,
                      date: activePrintRefund.refund_date,
                      cashier: activePrintRefund.created_user || 'Cashier',
                      storeName: 'BABY BLOOM RETAIL',
                      addressLine1: 'No 45, Galle Road, Colombo 03',
                      addressLine2: `Branch: ${activePrintRefund.branch_name || 'Colombo Store'}`,
                      phoneLine: '011-2345678 | 077-1234567',
                      customerName: activePrintRefund.customer_name || 'Walk-in Customer',
                      customerPhone: '',
                      items: [
                        {
                          name: `CUSTOMER REFUND DISBURSEMENT (${activePrintRefund.payment_method.toUpperCase()})`,
                          qty: 1,
                          price: activePrintRefund.amount,
                          total: activePrintRefund.amount,
                        },
                      ],
                      subtotal: activePrintRefund.amount,
                      grandTotal: activePrintRefund.amount,
                      itemsQty: 1,
                      paymentMethodName: activePrintRefund.payment_method === 'cash' ? 'CASH PAYOUT' : 'BANK / CARD REVERSAL',
                      paid: activePrintRefund.amount,
                      footerNote: '*** CUSTOMER REFUND SLIP ***\nFunds disbursed to customer.\nPlease retain this voucher for records.',
                      softwareAttribution: 'Baby Bloom ERP POS',
                    }}
                  />
                </div>
              ) : (
                <div
                  id="refund-voucher-printable"
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
                      <div className="inline-block px-3 py-1 bg-rose-100 text-rose-900 font-bold text-xs uppercase tracking-widest rounded border border-rose-300">
                        REFUND DISBURSEMENT VOUCHER
                      </div>
                      <div className="text-sm font-black text-gray-900 mt-1.5 font-mono">
                        VOUCHER: #{activePrintRefund.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Date: {formatBusinessDate(activePrintRefund.refund_date)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4 text-[11px]">
                    <div>
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Customer (Payee)</div>
                      <div className="font-bold text-gray-900 text-sm mt-0.5">{activePrintRefund.customer_name || 'Walk-in Customer'}</div>
                      <div className="text-gray-600 font-mono text-[10px]">
                        Code: {activePrintRefund.customer_code || 'CUST'}
                      </div>
                      {activePrintRefund.return_number && (
                        <div className="text-emerald-800 font-bold mt-1 text-[11px]">
                          Sales Return Ref: #{activePrintRefund.return_number}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Disbursement Routing</div>
                      <div className="font-semibold text-gray-800 text-[11px] mt-0.5">
                        Branch: {activePrintRefund.branch_name || 'Main Flagship Store'}
                      </div>
                      <div className="text-emerald-800 font-bold text-[11px] mt-1 capitalize">
                        Channel: {activePrintRefund.payment_method.replace(/_/g, ' ')}
                      </div>
                      {activePrintRefund.bank_account_name && (
                        <div className="text-gray-700 font-mono text-[10px]">
                          Bank Account: {activePrintRefund.bank_account_name}
                        </div>
                      )}
                      {activePrintRefund.reference_number && (
                        <div className="text-gray-600 font-mono text-[10px]">
                          Reference / Cheque: {activePrintRefund.reference_number}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg mb-6 flex justify-between items-center">
                    <div>
                      <span className="text-xs uppercase font-bold text-rose-900">Total Refund Disbursed</span>
                      <p className="text-[10px] text-rose-700 mt-0.5">
                        Settled against return of merchandise into inventory
                      </p>
                    </div>
                    <div className="text-2xl font-black text-rose-900 font-mono">
                      {formatCurrency(activePrintRefund.amount)}
                    </div>
                  </div>

                  {activePrintRefund.notes && (
                    <div className="p-3 bg-gray-50 rounded border border-gray-200 text-[10px] text-gray-700 mb-6">
                      <strong className="text-gray-900">Remarks / Authorization: </strong>
                      {activePrintRefund.notes}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-12 pt-8 border-t border-gray-200 text-[10px] text-gray-600">
                    <div>
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Customer Signature / Acknowledgment</div>
                    </div>
                    <div className="text-right">
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Disbursing Cashier / Finance Officer</div>
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
                <h3 className="text-sm font-bold text-white">Customer Refunds & Disbursements Audit Report</h3>
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
                id="refunds-register-summary-printable"
                className="w-full bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl border border-gray-300 rounded-xl"
              >
                {/* Header */}
                <div className="text-center pb-4 border-b-2 border-black mb-4">
                  <h1 className="text-2xl font-black uppercase tracking-wider text-black">BABY BLOOM (PVT) LTD</h1>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-900 mt-0.5">
                    Customer Refunds & Disbursements Audit Ledger Summary
                  </h2>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Generated: {new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })} • Official Finance & Cash Subledger
                  </p>
                </div>

                {/* Audit KPIs */}
                <div className="grid grid-cols-4 gap-3 bg-gray-50 border border-gray-300 p-3 rounded mb-4 text-center">
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">TOTAL DISBURSEMENTS</span>
                    <strong className="text-base text-black font-mono">{rows.length}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">TOTAL DISBURSED (LKR)</span>
                    <strong className="text-base text-rose-800 font-mono">{formatCurrency(totalRefundAmount)}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">CASH PAYOUTS</span>
                    <strong className="text-base text-emerald-800 font-mono">{formatCurrency(cashPayouts)}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">BANK & CARD TRANSFERS</span>
                    <strong className="text-base text-sky-800 font-mono">{formatCurrency(bankPayouts + cardPayouts)}</strong>
                  </div>
                </div>

                {/* Breakdown by Method */}
                <div className="grid grid-cols-3 gap-2 bg-gray-100 p-2.5 rounded border border-gray-300 mb-4 text-[10px]">
                  <div>
                    <span className="text-gray-600 font-bold">Cash Drawer Payouts:</span>{' '}
                    <span className="font-mono font-bold text-gray-900">{cashRows.length} slips ({formatCurrency(cashPayouts)})</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-bold">Bank Transfers:</span>{' '}
                    <span className="font-mono font-bold text-gray-900">{bankRows.length} transfers ({formatCurrency(bankPayouts)})</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-bold">Card Gateways:</span>{' '}
                    <span className="font-mono font-bold text-gray-900">{cardRows.length} reversals ({formatCurrency(cardPayouts)})</span>
                  </div>
                </div>

                {/* Register Table */}
                <table className="w-full text-left text-[11px] border border-gray-300 mb-6">
                  <thead className="bg-gray-100 font-bold border-b border-gray-300 text-[10px] uppercase">
                    <tr>
                      <th className="p-1.5 border-r border-gray-300 text-center">#</th>
                      <th className="p-1.5 border-r border-gray-300">Date</th>
                      <th className="p-1.5 border-r border-gray-300">Return Ref</th>
                      <th className="p-1.5 border-r border-gray-300">Customer</th>
                      <th className="p-1.5 border-r border-gray-300">Branch</th>
                      <th className="p-1.5 border-r border-gray-300 text-center">Channel</th>
                      <th className="p-1.5 border-r border-gray-300">Reference / Account</th>
                      <th className="p-1.5 text-right">Disbursed (LKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((r, idx) => (
                      <tr key={r.id || idx}>
                        <td className="p-1.5 border-r border-gray-200 text-center font-mono">{idx + 1}</td>
                        <td className="p-1.5 border-r border-gray-200 whitespace-nowrap">
                          {formatBusinessDate(r.refund_date)}
                        </td>
                        <td className="p-1.5 border-r border-gray-200 font-mono font-bold text-emerald-800">
                          {r.return_number || 'Direct'}
                        </td>
                        <td className="p-1.5 border-r border-gray-200 font-medium">
                          {r.customer_name || 'Walk-in'}
                        </td>
                        <td className="p-1.5 border-r border-gray-200">{r.branch_name || 'Main Branch'}</td>
                        <td className="p-1.5 border-r border-gray-200 text-center uppercase text-[9px] font-bold">
                          {r.payment_method.replace(/_/g, ' ')}
                        </td>
                        <td className="p-1.5 border-r border-gray-200 text-[10px] font-mono">
                          {r.bank_account_name || r.reference_number || 'Cash Register'}
                        </td>
                        <td className="p-1.5 text-right font-mono font-bold text-rose-800">
                          {formatCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Dual Signature Blocks */}
                <div className="grid grid-cols-2 gap-12 pt-8 mt-6 border-t border-gray-300 text-center text-xs">
                  <div>
                    <div className="border-b border-black w-48 mx-auto mb-1.5" />
                    <span className="font-semibold">Prepared by (Disbursing Officer / Cashier)</span>
                  </div>
                  <div>
                    <div className="border-b border-black w-48 mx-auto mb-1.5" />
                    <span className="font-semibold">Audited & Certified (Finance Controller / Auditor)</span>
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
    </div>
  )
}
