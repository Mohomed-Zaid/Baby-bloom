import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpenCheck,
  Search,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  Calendar,
  Layers,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Eye,
  X,
} from 'lucide-react'
import { listLookup } from '../services/masterData'
import {
  fetchGeneralLedgerReport,
  fetchAccountsForLedger,
  fetchLedgerSummaryByAccount,
  exportLedgerToCsv,
  type GeneralLedgerLine,
} from '../services/generalLedger'

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

export const GeneralLedgerPage: React.FC = () => {
  // ── Filters State ──────────────────────────────────────────────────────────
  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const todayStr = now.toISOString().slice(0, 10)

  const [datePreset, setDatePreset] = useState<'today' | 'month' | 'quarter' | 'year' | 'custom'>('month')
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth)
  const [dateTo, setDateTo] = useState<string>(todayStr)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all')
  const [selectedEntryType, setSelectedEntryType] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'ledger' | 'accounts'>('ledger')

  // Pagination for transaction table
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Modal inspection
  const [inspectLine, setInspectLine] = useState<GeneralLedgerLine | null>(null)

  // ── Preset Date Handlers ───────────────────────────────────────────────────
  const applyPreset = (preset: 'today' | 'month' | 'quarter' | 'year') => {
    setDatePreset(preset)
    const current = new Date()
    if (preset === 'today') {
      const d = current.toISOString().slice(0, 10)
      setDateFrom(d)
      setDateTo(d)
    } else if (preset === 'month') {
      const f = new Date(current.getFullYear(), current.getMonth(), 1).toISOString().slice(0, 10)
      const t = current.toISOString().slice(0, 10)
      setDateFrom(f)
      setDateTo(t)
    } else if (preset === 'quarter') {
      const qMonth = Math.floor(current.getMonth() / 3) * 3
      const f = new Date(current.getFullYear(), qMonth, 1).toISOString().slice(0, 10)
      const t = current.toISOString().slice(0, 10)
      setDateFrom(f)
      setDateTo(t)
    } else if (preset === 'year') {
      const f = new Date(current.getFullYear(), 0, 1).toISOString().slice(0, 10)
      const t = current.toISOString().slice(0, 10)
      setDateFrom(f)
      setDateTo(t)
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: accounts = [] } = useQuery({
    queryKey: ['gl-accounts-lookup'],
    queryFn: fetchAccountsForLedger,
  })

  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => (await listLookup('branches', 'name')) || [],
  })

  const {
    data: glReport,
    isLoading: loadingReport,
    refetch: refetchReport,
    isFetching: fetchingReport,
  } = useQuery({
    queryKey: [
      'general-ledger-report',
      selectedAccountId,
      selectedBranchId,
      dateFrom,
      dateTo,
      selectedEntryType,
      search,
    ],
    queryFn: () =>
      fetchGeneralLedgerReport({
        accountId: selectedAccountId,
        branchId: selectedBranchId,
        dateFrom,
        dateTo,
        entryType: selectedEntryType,
        search,
      }),
  })

  const { data: accountSummaries = [], isLoading: loadingSummaries } = useQuery({
    queryKey: ['general-ledger-summaries', dateFrom, dateTo, selectedBranchId],
    queryFn: () =>
      fetchLedgerSummaryByAccount(
        dateFrom,
        dateTo,
        selectedBranchId === 'all' ? undefined : selectedBranchId
      ),
    enabled: activeTab === 'accounts',
  })

  // ── Pagination Calculation ─────────────────────────────────────────────────
  const lines = glReport?.lines || []
  const totalLines = lines.length
  const totalPages = Math.ceil(totalLines / pageSize) || 1
  const paginatedLines = useMemo(() => {
    const start = (page - 1) * pageSize
    return lines.slice(start, start + pageSize)
  }, [lines, page, pageSize])

  // Reset page on search/filter changes
  React.useEffect(() => {
    setPage(1)
  }, [selectedAccountId, selectedBranchId, selectedEntryType, search, dateFrom, dateTo])

  // ── Entry Type Badges ──────────────────────────────────────────────────────
  const renderEntryTypeBadge = (type: string) => {
    switch (type) {
      case 'customer_payment':
        return <span className="px-2 py-0.5 text-xs rounded font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">Cust Payment</span>
      case 'vendor_payment':
        return <span className="px-2 py-0.5 text-xs rounded font-medium bg-blue-950/80 text-blue-300 border border-blue-800/60">Vendor Pmt</span>
      case 'journal':
        return <span className="px-2 py-0.5 text-xs rounded font-medium bg-purple-950/80 text-purple-300 border border-purple-800/60">Journal</span>
      case 'expense':
        return <span className="px-2 py-0.5 text-xs rounded font-medium bg-rose-950/80 text-rose-300 border border-rose-800/60">Expense</span>
      case 'income':
        return <span className="px-2 py-0.5 text-xs rounded font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">Income</span>
      case 'petty_cash':
        return <span className="px-2 py-0.5 text-xs rounded font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60">Petty Cash</span>
      case 'reversal':
        return <span className="px-2 py-0.5 text-xs rounded font-medium bg-orange-950/80 text-orange-300 border border-orange-800/60">Reversal</span>
      default:
        return <span className="px-2 py-0.5 text-xs rounded font-medium bg-[#113e3a] text-[#a0c4c0] border border-[#1a5b54]">{type}</span>
    }
  }

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <BookOpenCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">General Ledger</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Double-Entry Engine
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Audited transaction records, fiscal double-entry journals, and running balances
            </p>
          </div>
        </div>

        {/* Global Header Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => refetchReport()}
            disabled={fetchingReport}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingReport ? 'animate-spin text-[#38d4c5]' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => glReport && exportLedgerToCsv(glReport)}
            disabled={!glReport || glReport.lines.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] hover:text-[#38d4c5] transition-colors disabled:opacity-50"
            title="Export to CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#38d4c5]" />
            Export CSV
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] font-semibold transition-all shadow-md shadow-[#00b4d8]/20"
          >
            <Printer className="w-4 h-4" />
            Print Statement
          </button>
        </div>
      </div>

      {/* ── KPI METRIC CARDS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Opening Balance */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Opening Balance</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5]">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              LKR {formatCurrency(Math.abs(glReport?.opening_balance || 0))}
            </span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#113e3a] text-[#7aa5a0]">
              {(glReport?.opening_balance || 0) >= 0 ? 'Dr' : 'Cr'}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5 flex items-center gap-1">
            Prior to <span className="font-mono text-[#a0c4c0]">{dateFrom}</span>
          </div>
        </div>

        {/* 2. Total Period Debits (Inflow) */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Period Debits (Inflow)</span>
            <div className="p-2 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-emerald-400 tracking-tight">
              LKR {formatCurrency(glReport?.total_debit || 0)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            Total debit transactions in period
          </div>
        </div>

        {/* 3. Total Period Credits (Outflow) */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Period Credits (Outflow)</span>
            <div className="p-2 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-800/40">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-rose-400 tracking-tight">
              LKR {formatCurrency(glReport?.total_credit || 0)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            Total credit transactions in period
          </div>
        </div>

        {/* 4. Closing Balance */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Closing Balance</span>
            <div className="p-2 rounded-lg bg-[#00b4d8]/10 text-[#00b4d8] border border-[#00b4d8]/30">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-[#00b4d8] tracking-tight">
              LKR {formatCurrency(Math.abs(glReport?.closing_balance || 0))}
            </span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#113e3a] text-[#38d4c5]">
              {(glReport?.closing_balance || 0) >= 0 ? 'Dr' : 'Cr'}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5 flex items-center gap-1">
            As of <span className="font-mono text-[#a0c4c0]">{dateTo}</span>
          </div>
        </div>
      </div>

      {/* ── FILTER CONTROLS BAR ──────────────────────────────────────────────── */}
      <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
          {/* Account Selector */}
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-[#7aa5a0] mb-1.5">
              General Ledger Account
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#38d4c5] focus:outline-none"
            >
              <option value="all">★ Consolidated All Accounts (Full GL)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_code} - {acc.account_name} ({acc.account_type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Branch Selector */}
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-[#7aa5a0] mb-1.5">
              Operating Branch
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#38d4c5] focus:outline-none"
            >
              <option value="all">All Branches</option>
              {branches.map((b: any) => (
                <option key={b.value || b.id} value={b.value || b.id}>
                  {b.label || b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Entry Type Filter */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#7aa5a0] mb-1.5">
              Entry Type
            </label>
            <select
              value={selectedEntryType}
              onChange={(e) => setSelectedEntryType(e.target.value)}
              className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#38d4c5] focus:outline-none"
            >
              <option value="all">All Entry Types</option>
              <option value="journal">Manual Journal (JV)</option>
              <option value="customer_payment">Customer Payment</option>
              <option value="vendor_payment">Vendor Payment</option>
              <option value="expense">Direct Expense</option>
              <option value="income">Direct Income</option>
              <option value="petty_cash">Petty Cash</option>
              <option value="reversal">Reversals</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-[#7aa5a0] mb-1.5">
              Live Search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#7aa5a0]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ref #, memo, account..."
                className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-[#38d4c5] focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-[#7aa5a0] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Date Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#164e48]/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[#7aa5a0] mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date Range:
            </span>
            <button
              onClick={() => applyPreset('today')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                datePreset === 'today'
                  ? 'bg-[#38d4c5] text-[#031413] font-bold'
                  : 'bg-[#0c2e2a] text-[#a0c4c0] hover:bg-[#12423c] border border-[#164e48]'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => applyPreset('month')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                datePreset === 'month'
                  ? 'bg-[#38d4c5] text-[#031413] font-bold'
                  : 'bg-[#0c2e2a] text-[#a0c4c0] hover:bg-[#12423c] border border-[#164e48]'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => applyPreset('quarter')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                datePreset === 'quarter'
                  ? 'bg-[#38d4c5] text-[#031413] font-bold'
                  : 'bg-[#0c2e2a] text-[#a0c4c0] hover:bg-[#12423c] border border-[#164e48]'
              }`}
            >
              This Quarter
            </button>
            <button
              onClick={() => applyPreset('year')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                datePreset === 'year'
                  ? 'bg-[#38d4c5] text-[#031413] font-bold'
                  : 'bg-[#0c2e2a] text-[#a0c4c0] hover:bg-[#12423c] border border-[#164e48]'
              }`}
            >
              This Year
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDatePreset('custom')
                setDateFrom(e.target.value)
              }}
              className="bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded px-2.5 py-1 focus:outline-none"
            />
            <span className="text-xs text-[#7aa5a0]">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDatePreset('custom')
                setDateTo(e.target.value)
              }}
              className="bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded px-2.5 py-1 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── VIEW TABS ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[#164e48]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'ledger'
                ? 'border-[#38d4c5] text-[#38d4c5]'
                : 'border-transparent text-[#7aa5a0] hover:text-white'
            }`}
          >
            <BookOpenCheck className="w-4 h-4" />
            Detailed Ledger Transactions ({lines.length})
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'accounts'
                ? 'border-[#38d4c5] text-[#38d4c5]'
                : 'border-transparent text-[#7aa5a0] hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            Account Balances Overview ({accounts.length})
          </button>
        </div>

        {activeTab === 'ledger' && (
          <div className="text-xs text-[#7aa5a0]">
            Viewing account: <span className="font-semibold text-white">{glReport?.account_code} - {glReport?.account_name}</span>
          </div>
        )}
      </div>

      {/* ── TAB 1: DETAILED LEDGER TABLE ─────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0a2f2b] text-[#7aa5a0] text-xs uppercase tracking-wider border-b border-[#164e48]">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Ref Number</th>
                  <th className="py-3 px-4">Type</th>
                  {selectedAccountId === 'all' && <th className="py-3 px-4">Account</th>}
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Narration / Memo</th>
                  <th className="py-3 px-4 text-right">Debit (LKR)</th>
                  <th className="py-3 px-4 text-right">Credit (LKR)</th>
                  <th className="py-3 px-4 text-right">Running Balance</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#164e48]/50">
                {/* Opening Balance Row if single account */}
                {selectedAccountId !== 'all' && (
                  <tr className="bg-[#0a2f2b]/40 font-medium">
                    <td className="py-2.5 px-4 font-mono text-xs text-[#7aa5a0]">{dateFrom}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-[#38d4c5]">OPENING-BAL</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 text-xs rounded bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                        Opening
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[#7aa5a0]">All Selected</td>
                    <td className="py-2.5 px-4 text-xs italic text-[#7aa5a0]">
                      Carried forward balance prior to {dateFrom}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-gray-500">-</td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-gray-500">-</td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-white">
                      LKR {formatCurrency(Math.abs(glReport?.opening_balance || 0))}{' '}
                      <span className="text-[#7aa5a0] text-[10px]">
                        {(glReport?.opening_balance || 0) >= 0 ? 'Dr' : 'Cr'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center text-gray-600">-</td>
                  </tr>
                )}

                {loadingReport ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-[#7aa5a0]">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#38d4c5] mb-2" />
                      Loading general ledger journal lines...
                    </td>
                  </tr>
                ) : paginatedLines.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-[#7aa5a0]">
                      No journal entries or transactions found for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedLines.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-[#0c2e2a]/60 transition-colors cursor-pointer"
                      onClick={() => setInspectLine(row)}
                    >
                      <td className="py-3 px-4 font-mono text-xs text-[#a0c4c0] whitespace-nowrap">
                        {row.entry_date}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-[#00b4d8] whitespace-nowrap">
                        {row.reference_number}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderEntryTypeBadge(row.entry_type)}
                      </td>
                      {selectedAccountId === 'all' && (
                        <td className="py-3 px-4 whitespace-nowrap text-xs">
                          <span className="font-mono text-[#38d4c5] mr-1.5">{row.account_code}</span>
                          <span className="text-white truncate max-w-[150px] inline-block align-bottom">{row.account_name}</span>
                        </td>
                      )}
                      <td className="py-3 px-4 text-xs text-[#7aa5a0] whitespace-nowrap">
                        {row.branch_name}
                      </td>
                      <td className="py-3 px-4 text-xs text-white max-w-xs truncate" title={row.narration}>
                        {row.narration || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-400 font-medium whitespace-nowrap">
                        {row.debit > 0 ? `LKR ${formatCurrency(row.debit)}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-rose-400 font-medium whitespace-nowrap">
                        {row.credit > 0 ? `LKR ${formatCurrency(row.credit)}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold text-white whitespace-nowrap">
                        LKR {formatCurrency(Math.abs(row.running_balance))}{' '}
                        <span className="text-[10px] text-[#7aa5a0]">
                          {row.running_balance >= 0 ? 'Dr' : 'Cr'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setInspectLine(row)
                          }}
                          className="p-1.5 hover:bg-[#12423c] rounded text-[#7aa5a0] hover:text-[#38d4c5] transition-colors"
                          title="View Voucher"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-[#0a2f2b]/70 border-t border-[#164e48] text-xs text-[#7aa5a0]">
            <div>
              Showing <span className="text-white font-medium">{lines.length === 0 ? 0 : (page - 1) * pageSize + 1}</span> to{' '}
              <span className="text-white font-medium">{Math.min(page * pageSize, lines.length)}</span> of{' '}
              <span className="text-white font-medium">{lines.length}</span> transactions
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded bg-[#0c2e2a] hover:bg-[#12423c] text-white disabled:opacity-40 border border-[#164e48]"
              >
                Previous
              </button>
              <span className="px-2 py-1 text-white font-semibold">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded bg-[#0c2e2a] hover:bg-[#12423c] text-white disabled:opacity-40 border border-[#164e48]"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: ACCOUNTS OVERVIEW & TRIAL BALANCES ─────────────────────────── */}
      {activeTab === 'accounts' && (
        <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0a2f2b] text-[#7aa5a0] text-xs uppercase tracking-wider border-b border-[#164e48]">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-center">Normal</th>
                  <th className="py-3 px-4 text-right">Opening Bal</th>
                  <th className="py-3 px-4 text-right">Period Debit</th>
                  <th className="py-3 px-4 text-right">Period Credit</th>
                  <th className="py-3 px-4 text-right">Net Movement</th>
                  <th className="py-3 px-4 text-right">Closing Balance</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#164e48]/50">
                {loadingSummaries ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-[#7aa5a0]">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#38d4c5] mb-2" />
                      Loading chart of accounts balance summaries...
                    </td>
                  </tr>
                ) : (
                  accountSummaries.map((acc) => (
                    <tr key={acc.id} className="hover:bg-[#0c2e2a]/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#00b4d8]">
                        {acc.account_code}
                      </td>
                      <td className="py-3 px-4 font-medium text-white">
                        {acc.account_name}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="px-2 py-0.5 rounded font-mono uppercase bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                          {acc.account_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-xs text-[#7aa5a0] uppercase">
                        {acc.normal_balance}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#a0c4c0]">
                        {formatCurrency(acc.opening_balance)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-400 font-medium">
                        {formatCurrency(acc.total_debit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-rose-400 font-medium">
                        {formatCurrency(acc.total_credit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-white">
                        {formatCurrency(acc.net_movement)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold text-[#00b4d8]">
                        LKR {formatCurrency(acc.closing_balance)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id)
                            setActiveTab('ledger')
                          }}
                          className="px-2.5 py-1 text-xs rounded bg-[#113e3a] hover:bg-[#164e48] text-[#38d4c5] font-semibold border border-[#1a5b54] transition-colors"
                        >
                          View Ledger
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TRANSACTION DETAIL INSPECTION MODAL ──────────────────────────────── */}
      {inspectLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#082321] border border-[#164e48] rounded-xl max-w-xl w-full p-6 space-y-6 shadow-2xl relative text-left">
            <button
              onClick={() => setInspectLine(null)}
              className="absolute right-4 top-4 text-[#7aa5a0] hover:text-white p-1 rounded-lg hover:bg-[#113e3a]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#0e3b37] border border-[#164e48] rounded-lg text-[#38d4c5]">
                <BookOpenCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Transaction Voucher Detail</h3>
                <p className="text-xs text-[#7aa5a0]">Reference: {inspectLine.reference_number}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-[#051817] p-4 rounded-lg border border-[#164e48]/70 text-xs">
              <div>
                <span className="text-[#7aa5a0]">Entry Date:</span>
                <p className="font-mono text-white mt-0.5">{inspectLine.entry_date}</p>
              </div>
              <div>
                <span className="text-[#7aa5a0]">Entry Type:</span>
                <p className="mt-0.5">{renderEntryTypeBadge(inspectLine.entry_type)}</p>
              </div>
              <div>
                <span className="text-[#7aa5a0]">Operating Branch:</span>
                <p className="text-white mt-0.5">{inspectLine.branch_name}</p>
              </div>
              <div>
                <span className="text-[#7aa5a0]">Account Affected:</span>
                <p className="font-mono text-[#38d4c5] mt-0.5">
                  {inspectLine.account_code} - {inspectLine.account_name}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-[#7aa5a0]">Transaction Memo / Narration:</span>
              <p className="p-3 bg-[#051817] rounded border border-[#164e48]/70 text-sm text-white">
                {inspectLine.narration || 'No memo provided'}
              </p>
            </div>

            {/* Financial Line Impact */}
            <div className="border border-[#164e48] rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 bg-[#0a2f2b] p-2.5 text-xs font-semibold text-[#7aa5a0] border-b border-[#164e48]">
                <span>Debit Amount</span>
                <span>Credit Amount</span>
                <span className="text-right">Balance Delta</span>
              </div>
              <div className="grid grid-cols-3 p-3 bg-[#061e1c] text-sm font-mono items-center">
                <span className="text-emerald-400 font-semibold">
                  {inspectLine.debit > 0 ? `LKR ${formatCurrency(inspectLine.debit)}` : '-'}
                </span>
                <span className="text-rose-400 font-semibold">
                  {inspectLine.credit > 0 ? `LKR ${formatCurrency(inspectLine.credit)}` : '-'}
                </span>
                <span className="text-right text-white font-bold">
                  LKR {formatCurrency(Math.abs(inspectLine.running_balance))}{' '}
                  <span className="text-xs text-[#7aa5a0]">
                    {inspectLine.running_balance >= 0 ? 'Dr' : 'Cr'}
                  </span>
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-semibold rounded bg-[#0c2e2a] hover:bg-[#12423c] text-[#a0c4c0] border border-[#164e48] transition-colors"
              >
                Print Voucher
              </button>
              <button
                onClick={() => setInspectLine(null)}
                className="px-4 py-2 text-xs font-semibold rounded bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
