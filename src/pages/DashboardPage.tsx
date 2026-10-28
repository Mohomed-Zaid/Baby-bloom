import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BadgeDollarSign,
  Barcode,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Landmark,
  PlusCircle,
  ReceiptText,
  Scan,
  TrendingUp,
  Wallet,
  AlertTriangle,
  RefreshCw,
  Building2,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { useBranchStore } from '../stores/branchStore'
import { fetchDashboardSummary, type UpcomingInwardCheque } from '../services/dashboardService'
import { transitionCheque } from '../services/bankingService'
import { listLookup } from '../services/masterData'

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const branchId = useBranchStore((state) => state.branchId)
  const branchName = useBranchStore((state) => state.branchName)
  const setBranch = useBranchStore((state) => state.setBranch)

  const [depositCheque, setDepositCheque] = useState<UpcomingInwardCheque | null>(null)
  const [depositDate, setDepositDate] = useState(new Date().toISOString().split('T')[0] || '')

  // Branches lookup
  const { data: branchList = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => (await listLookup('branches', 'name')) || [],
  })

  // Executive Dashboard Metrics query
  const {
    data: metrics,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['executive-dashboard', branchId],
    queryFn: () => fetchDashboardSummary(branchId || undefined),
    refetchInterval: 30000,
  })

  // Deposit mutation
  const depositMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      await transitionCheque(id, 'deposited', { depositDate: date })
    },
    onSuccess: () => {
      setDepositCheque(null)
      void queryClient.invalidateQueries({ queryKey: ['executive-dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['cheques'] })
    },
  })

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
    }).format(val).replace('LKR', 'Rs.')
  }

  const todayIso = new Date().toISOString().split('T')[0] || ''

  return (
    <div className="page-stack flex flex-col gap-5">
      {/* HEADER SECTION */}
      <PageHeader
        title="Executive Dashboard"
        description="Real-time financial status, inward cheques due, daily sales, and quick operations."
        breadcrumbs={[{ label: 'Executive Workspace' }]}
        actions={
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 bg-[#061e1c] border border-[#164e48] rounded-xl px-3 py-1.5 shadow-sm">
              <Building2 size={16} className="text-teal-400" />
              <select
                className="bg-transparent text-xs font-semibold text-teal-200 outline-none cursor-pointer border-none"
                value={branchId || ''}
                onChange={(e) => {
                  const bId = e.target.value
                  const b = branchList.find((x) => x.value === bId)
                  setBranch(bId, b ? b.label : '')
                }}
              >
                <option value="" className="bg-[#061e1c] text-white">All Branches (Consolidated)</option>
                {branchList.map((b) => (
                  <option key={b.value} value={b.value} className="bg-[#061e1c] text-white">
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="button secondary flex items-center gap-1.5 min-h-[34px] px-3 text-xs font-semibold rounded-xl cursor-pointer"
              onClick={() => void refetch()}
              disabled={isLoading || isRefetching}
              title="Refresh real-time data"
            >
              <RefreshCw
                size={14}
                className={isRefetching ? 'animate-spin' : ''}
              />
              <span>{isRefetching ? 'Syncing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* TOP 5 KPI SUMMARY CARDS (5-COLUMN GRID) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Inward Cheques */}
        <div
          onClick={() => navigate('/banking/cheques')}
          className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-teal-400/50 cursor-pointer flex flex-col justify-between min-h-[142px] transition-all"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-950/80 border border-teal-500/30 text-teal-300">
              In Hand
            </span>
            <div className="p-2 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400">
              <Landmark size={16} />
            </div>
          </div>

          <div className="mt-2.5">
            <span className="text-[11px] font-semibold text-[#8fa89e] uppercase tracking-wider block">
              Inward Cheques Tally
            </span>
            <div className="text-xl font-bold text-white tracking-tight mt-1">
              {isLoading ? '...' : formatCurrency(metrics?.inward_cheques_total || 0)}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#8fa89e] border-t border-[#164e48]/60 pt-2 mt-2">
            <span className="flex items-center gap-1 text-[11px]">
              <Clock size={12} className="text-teal-400" /> {metrics?.inward_cheques_count || 0} in hand
            </span>
            <span className="font-semibold text-teal-400 flex items-center gap-0.5 text-[11px] group-hover:translate-x-0.5 transition-transform">
              View <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 2: Day Book Balance */}
        <div
          onClick={() => navigate('/finance/journals')}
          className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-emerald-400/50 cursor-pointer flex flex-col justify-between min-h-[142px] transition-all"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
              Cash & Bank
            </span>
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
              <BookOpen size={16} />
            </div>
          </div>

          <div className="mt-2.5">
            <span className="text-[11px] font-semibold text-[#8fa89e] uppercase tracking-wider block">
              Day Book Balance
            </span>
            <div className="text-xl font-bold text-white tracking-tight mt-1">
              {isLoading ? '...' : formatCurrency(metrics?.day_book_balance || 0)}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#8fa89e] border-t border-[#164e48]/60 pt-2 mt-2">
            <span className="flex items-center gap-1 text-[11px] truncate max-w-[130px]">
              <Building2 size={12} className="text-emerald-400" /> {branchName || 'All Branch Net'}
            </span>
            <span className="font-semibold text-emerald-400 flex items-center gap-0.5 text-[11px] group-hover:translate-x-0.5 transition-transform">
              Day Book <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 3: Day Sales */}
        <div
          onClick={() => navigate('/sales/invoices')}
          className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-teal-400/50 cursor-pointer flex flex-col justify-between min-h-[142px] transition-all"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-950/80 border border-teal-500/30 text-teal-300">
              Today
            </span>
            <div className="p-2 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400">
              <TrendingUp size={16} />
            </div>
          </div>

          <div className="mt-2.5">
            <span className="text-[11px] font-semibold text-[#8fa89e] uppercase tracking-wider block">
              Daily Sales Gross
            </span>
            <div className="text-xl font-bold text-white tracking-tight mt-1">
              {isLoading ? '...' : formatCurrency(metrics?.day_sales || 0)}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#8fa89e] border-t border-[#164e48]/60 pt-2 mt-2">
            <span className="flex items-center gap-1 text-[11px]">
              <ReceiptText size={12} className="text-teal-400" /> Daily Revenue
            </span>
            <span className="font-semibold text-teal-400 flex items-center gap-0.5 text-[11px] group-hover:translate-x-0.5 transition-transform">
              Sales <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 4: Petty Cash Balance */}
        <div
          onClick={() => navigate('/banking/petty-cash')}
          className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-amber-400/50 cursor-pointer flex flex-col justify-between min-h-[142px] transition-all"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/30 text-amber-300">
              Cash Drawer
            </span>
            <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400">
              <Wallet size={16} />
            </div>
          </div>

          <div className="mt-2.5">
            <span className="text-[11px] font-semibold text-[#8fa89e] uppercase tracking-wider block">
              Petty Cash Balance
            </span>
            <div className="text-xl font-bold text-white tracking-tight mt-1">
              {isLoading ? '...' : formatCurrency(metrics?.petty_cash_balance || 0)}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#8fa89e] border-t border-[#164e48]/60 pt-2 mt-2">
            <span className="flex items-center gap-1 text-[11px]">
              <BadgeDollarSign size={12} className="text-amber-400" /> Discretionary Float
            </span>
            <span className="font-semibold text-amber-400 flex items-center gap-0.5 text-[11px] group-hover:translate-x-0.5 transition-transform">
              Ledger <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 5: Expiry Counter */}
        <div
          onClick={() => navigate('/inventory/current-stock')}
          className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-rose-400/50 cursor-pointer flex flex-col justify-between min-h-[142px] transition-all"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/30 text-rose-300">
              &le; 30 Days
            </span>
            <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/30 text-rose-400">
              <AlertTriangle size={16} />
            </div>
          </div>

          <div className="mt-2.5">
            <span className="text-[11px] font-semibold text-[#8fa89e] uppercase tracking-wider block">
              Expiry Date Counter
            </span>
            <div className="text-xl font-bold text-white tracking-tight mt-1">
              {isLoading ? '...' : `${metrics?.expiring_soon_count || 0} Batches`}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#8fa89e] border-t border-[#164e48]/60 pt-2 mt-2">
            <span className="flex items-center gap-1 text-[11px]">
              <ShieldCheck size={12} className="text-rose-400" /> Stock Freshness
            </span>
            <span className="font-semibold text-rose-400 flex items-center gap-0.5 text-[11px] group-hover:translate-x-0.5 transition-transform">
              Stock <ArrowUpRight size={12} />
            </span>
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN SPLIT: INWARD CHEQUES SCHEDULE + FAST OPERATIONS LAUNCHER */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 items-start">
        {/* LEFT COLUMN: INWARD CHEQUES MATURITY SCHEDULE */}
        <section className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#164e48] bg-[#041917]/90">
            <div>
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block">
                Receivables Pipeline
              </span>
              <h2 className="text-base font-bold text-white mt-0.5">
                Inward Cheques Maturity Schedule
              </h2>
            </div>

            <button
              className="button secondary flex items-center gap-1.5 min-h-[30px] px-3 text-xs font-semibold rounded-xl"
              onClick={() => navigate('/banking/cheques')}
            >
              <ExternalLink size={13} /> Full Registry
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#041917] text-teal-300 font-semibold uppercase text-[11px] tracking-wider border-b border-[#164e48]">
                  <th className="py-3 px-4">Maturity Date</th>
                  <th className="py-3 px-4">Customer / Payer</th>
                  <th className="py-3 px-4">Cheque No</th>
                  <th className="py-3 px-4">Bank</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0c3830]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#8fa89e]">
                      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      Loading inward cheques schedule...
                    </td>
                  </tr>
                ) : !metrics?.upcoming_inward_cheques || metrics.upcoming_inward_cheques.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#8fa89e]">
                      <Landmark size={28} className="mx-auto mb-2 opacity-40 text-teal-400" />
                      <div className="font-semibold text-white">No pending inward cheques in hand</div>
                      <small className="text-[#8fa89e]">Inward customer cheques registered in Banking will appear here.</small>
                    </td>
                  </tr>
                ) : (
                  metrics.upcoming_inward_cheques.map((c) => {
                    const isDueToday = c.due_date <= todayIso
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-[#0c312e]/50 transition-colors ${
                          isDueToday ? 'bg-amber-950/20' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <strong className="text-white text-xs">{c.due_date}</strong>
                            {isDueToday && (
                              <span className="text-[9px] font-bold text-amber-300 bg-amber-950/80 border border-amber-500/30 rounded px-1.5 py-0.5 w-fit">
                                Mature / Due
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <strong className="text-white text-xs">{c.customer_name}</strong>
                        </td>

                        <td className="py-3 px-4">
                          <code className="font-mono font-bold bg-[#041917] border border-[#164e48] px-2 py-0.5 rounded text-teal-300 text-xs">
                            {c.cheque_number}
                          </code>
                        </td>

                        <td className="py-3 px-4 text-[#8fa89e]">{c.bank_name || 'N/A'}</td>

                        <td className="py-3 px-4 text-right">
                          <strong className="text-teal-300 text-xs font-bold">{formatCurrency(c.amount)}</strong>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize border ${
                            c.status === 'in_hand'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
                              : 'bg-amber-950/80 text-amber-300 border-amber-500/30'
                          }`}>
                            {c.status.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            {c.status === 'in_hand' && (
                              <button
                                className="button primary min-h-[26px] px-2 text-[11px] rounded-lg"
                                onClick={() => setDepositCheque(c)}
                                title="Deposit into Bank Account"
                              >
                                Deposit
                              </button>
                            )}
                            <button
                              className="button secondary min-h-[26px] px-2 text-[11px] rounded-lg"
                              onClick={() => navigate('/banking/cheques')}
                              title="View details"
                            >
                              View
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
        </section>

        {/* RIGHT COLUMN: FAST OPERATIONS LAUNCHER */}
        <section className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
          <div className="px-5 py-4 border-b border-[#164e48] bg-[#041917]/90">
            <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block">
              Quick Jump
            </span>
            <h2 className="text-base font-bold text-white mt-0.5">
              Fast Operations Launcher
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5 p-4">
            {/* Action 1: POS Billing */}
            <div
              onClick={() => navigate('/sales/pos')}
              className="flex items-center gap-3 p-3 bg-[#041917] hover:bg-[#0c312e] border border-[#164e48] hover:border-teal-400/50 rounded-xl cursor-pointer transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <ReceiptText size={18} />
              </div>
              <div>
                <strong className="block text-xs font-bold text-white">POS Billing</strong>
                <small className="block text-[10px] text-[#8fa89e] mt-0.5">
                  Fast cashier invoice
                </small>
              </div>
            </div>

            {/* Action 2: Barcode Generator */}
            <div
              onClick={() => navigate('/inventory/generate-barcode')}
              className="flex items-center gap-3 p-3 bg-[#041917] hover:bg-[#0c312e] border border-[#164e48] hover:border-teal-400/50 rounded-xl cursor-pointer transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <Barcode size={18} />
              </div>
              <div>
                <strong className="block text-xs font-bold text-white">Barcode Labels</strong>
                <small className="block text-[10px] text-[#8fa89e] mt-0.5">
                  Thermal roll designer
                </small>
              </div>
            </div>

            {/* Action 3: Price Check */}
            <div
              onClick={() => navigate('/extras/price-check')}
              className="flex items-center gap-3 p-3 bg-[#041917] hover:bg-[#0c312e] border border-[#164e48] hover:border-teal-400/50 rounded-xl cursor-pointer transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <Scan size={18} />
              </div>
              <div>
                <strong className="block text-xs font-bold text-white">Floor Price Check</strong>
                <small className="block text-[10px] text-[#8fa89e] mt-0.5">
                  Rapid item scanner
                </small>
              </div>
            </div>

            {/* Action 4: Journal & Day Book */}
            <div
              onClick={() => navigate('/finance/journals')}
              className="flex items-center gap-3 p-3 bg-[#041917] hover:bg-[#0c312e] border border-[#164e48] hover:border-teal-400/50 rounded-xl cursor-pointer transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <BookOpen size={18} />
              </div>
              <div>
                <strong className="block text-xs font-bold text-white">Journal & Day Book</strong>
                <small className="block text-[10px] text-[#8fa89e] mt-0.5">
                  Debit/Credit entries
                </small>
              </div>
            </div>

            {/* Action 5: Financial Reports */}
            <div
              onClick={() => navigate('/finance/reports')}
              className="flex items-center gap-3 p-3 bg-[#041917] hover:bg-[#0c312e] border border-[#164e48] hover:border-teal-400/50 rounded-xl cursor-pointer transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <strong className="block text-xs font-bold text-white">Financial Reports</strong>
                <small className="block text-[10px] text-[#8fa89e] mt-0.5">
                  Trial Balance & P&L
                </small>
              </div>
            </div>

            {/* Action 6: POS Shortcut Keys */}
            <div
              onClick={() => navigate('/extras/shortcut-keys')}
              className="flex items-center gap-3 p-3 bg-[#041917] hover:bg-[#0c312e] border border-[#164e48] hover:border-teal-400/50 rounded-xl cursor-pointer transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <PlusCircle size={18} />
              </div>
              <div>
                <strong className="block text-xs font-bold text-white">POS Shortcuts</strong>
                <small className="block text-[10px] text-[#8fa89e] mt-0.5">
                  Hotkey definitions
                </small>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* DEPOSIT MODAL */}
      {depositCheque && (
        <div className="modal-overlay">
          <div className="modal-box deposit-modal-box">
            <div className="modal-header">
              <h3>Deposit Inward Cheque</h3>
              <button
                className="modal-close"
                onClick={() => setDepositCheque(null)}
              >
                &times;
              </button>
            </div>
            <div className="deposit-modal-content">
              <div className="deposit-info-card">
                <div>
                  <span className="text-muted">Cheque Number</span>
                  <strong>{depositCheque.cheque_number}</strong>
                </div>
                <div>
                  <span className="text-muted">Payer</span>
                  <strong>{depositCheque.customer_name}</strong>
                </div>
                <div>
                  <span className="text-muted">Amount</span>
                  <strong className="text-emerald-700">
                    {formatCurrency(depositCheque.amount)}
                  </strong>
                </div>
              </div>

              <div className="form-group mt-3">
                <label className="field-label">Deposit Slip Date</label>
                <input
                  type="date"
                  className="text-input"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                />
              </div>

              <div className="dialog-actions mt-4">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDepositCheque(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={depositMutation.isPending}
                  onClick={() => {
                    if (depositCheque) {
                      depositMutation.mutate({
                        id: depositCheque.id,
                        date: depositDate,
                      })
                    }
                  }}
                >
                  <CheckCircle2 size={15} />
                  {depositMutation.isPending
                    ? 'Processing...'
                    : 'Confirm Deposit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}