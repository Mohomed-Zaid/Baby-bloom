import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  RefreshCw,
  Search,
  Building2,
  Calendar,
  Wallet,
  Landmark,
  TrendingDown,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import {
  fetchCashAndBankAccounts,
  fetchCashBankLedger,
} from '../services/financeService'
import { fetchBranchesLookup } from '../services/orderService'

export function CashBankBookPage() {
  const [bookType, setBookType] = useState<'cash' | 'bank'>('cash')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all')

  // Date range defaults: 1st of this month to today
  const today = new Date().toISOString().split('T')[0] ?? ''
  const firstDayOfMonth =
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0] ?? ''
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [search, setSearch] = useState('')

  // Lookups
  const { data: branches } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['cash-bank-accounts'],
    queryFn: fetchCashAndBankAccounts,
  })

  // Filter accounts by tab
  const filteredAccounts = (accounts || []).filter((a) => a.subtype === bookType)

  // Determine active account ID
  const activeAccountId =
    selectedAccountId && filteredAccounts.some((a) => a.id === selectedAccountId)
      ? selectedAccountId
      : filteredAccounts[0]?.id || ''

  // Fetch Ledger Report via RPC
  const {
    data: ledgerReport,
    isLoading: loadingLedger,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['cash-bank-ledger', selectedBranchId, activeAccountId, dateFrom, dateTo],
    queryFn: () =>
      activeAccountId
        ? fetchCashBankLedger(
            selectedBranchId === 'all' ? null : selectedBranchId,
            activeAccountId,
            dateFrom,
            dateTo
          )
        : null,
    enabled: !!activeAccountId,
  })

  // Filter transactions
  const filteredTransactions = (ledgerReport?.transactions || []).filter((t) => {
    const term = search.toLowerCase()
    return (
      t.reference_number.toLowerCase().includes(term) ||
      t.narration.toLowerCase().includes(term) ||
      t.branch_name.toLowerCase().includes(term) ||
      t.entry_type.toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {bookType === 'cash' ? 'Cash Book' : 'Bank Book'} (Running Subledger)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time chronological double-entry movement ledger for cash and bank accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2.5 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Book Mode Switcher & Filter Controls */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
          {/* Cash / Bank Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setBookType('cash')
                setSelectedAccountId('')
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                bookType === 'cash'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Cash Book
            </button>
            <button
              onClick={() => {
                setBookType('bank')
                setSelectedAccountId('')
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                bookType === 'bank'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Landmark className="w-4 h-4" />
              Bank Book
            </button>
          </div>

          {/* Account Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
              Account:
            </label>
            <select
              value={activeAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-gray-50/50"
              disabled={loadingAccounts}
            >
              {filteredAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_code} - {acc.account_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date and Branch Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Branch Filter
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-gray-50/50"
              >
                <option value="all">All Branches (Consolidated)</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              From Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-gray-50/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              To Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-gray-50/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Search Entries
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ref #, narration..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-gray-50/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Opening Balance */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600 shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Opening Balance</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">
              Rs.{' '}
              {Number(ledgerReport?.opening_balance || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        {/* Inflow (Debit) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Inflow (Receipts)</p>
            <p className="text-xl font-bold text-emerald-600 mt-0.5">
              +Rs.{' '}
              {Number(ledgerReport?.total_inflow || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        {/* Outflow (Credit) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Outflow (Payments)</p>
            <p className="text-xl font-bold text-rose-600 mt-0.5">
              -Rs.{' '}
              {Number(ledgerReport?.total_outflow || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        {/* Closing Balance */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Closing Balance</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">
              Rs.{' '}
              {Number(ledgerReport?.closing_balance || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="text-sm font-semibold text-gray-800">
            Ledger Entries: {ledgerReport?.account_name} ({ledgerReport?.account_code})
          </div>
          <div className="text-xs text-gray-500">
            Period: {new Date(dateFrom).toLocaleDateString()} &mdash; {new Date(dateTo).toLocaleDateString()}
          </div>
        </div>

        <div className="overflow-x-auto">
          {loadingLedger ? (
            <div className="text-center py-12 text-sm text-gray-500">Calculating running ledger...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500">
              No transactions recorded in this period.
            </div>
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold uppercase text-gray-500 tracking-wider bg-gray-50/50">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Ref #</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Narration</th>
                  <th className="py-3 px-4 text-right">Inflow (Debit)</th>
                  <th className="py-3 px-4 text-right">Outflow (Credit)</th>
                  <th className="py-3 px-4 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {new Date(t.entry_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-gray-900">{t.reference_number}</td>
                    <td className="py-3 px-4">
                      <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {t.entry_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{t.branch_name}</td>
                    <td className="py-3 px-4 text-gray-700 max-w-xs truncate" title={t.narration}>
                      {t.narration}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {Number(t.inflow) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          Rs. {Number(t.inflow).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-gray-300">&mdash;</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {Number(t.outflow) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-rose-600">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          Rs. {Number(t.outflow).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-gray-300">&mdash;</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900">
                      Rs. {Number(t.running_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
