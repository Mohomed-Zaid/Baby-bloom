import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BadgeDollarSign,
  Barcode,
  BookOpen,
  Calendar,
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
    <div className="page-stack" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER SECTION */}
      <PageHeader
        title="Executive Dashboard"
        description="Real-time financial status, inward cheques due, daily sales, and quick operations."
        breadcrumbs={[{ label: 'Executive Workspace' }]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#ffffff',
                border: '1px solid #cfd9d4',
                borderRadius: '8px',
                padding: '4px 10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <Building2 size={16} style={{ color: '#1d684f' }} />
              <select
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#17211d',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                value={branchId || ''}
                onChange={(e) => {
                  const bId = e.target.value
                  const b = branchList.find((x) => x.value === bId)
                  setBranch(bId, b ? b.label : '')
                }}
              >
                <option value="">All Branches (Consolidated)</option>
                {branchList.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="button secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '34px',
                padding: '0 12px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              onClick={() => void refetch()}
              disabled={isLoading || isRefetching}
              title="Refresh real-time data"
            >
              <RefreshCw
                size={14}
                style={{
                  animation: isRefetching ? 'spin 0.8s linear infinite' : 'none',
                }}
              />
              <span>{isRefetching ? 'Syncing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* TOP 5 KPI SUMMARY CARDS (5-COLUMN GRID) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
        }}
      >
        {/* Card 1: Inward Cheques */}
        <div
          onClick={() => navigate('/banking/cheques')}
          style={{
            background: '#ffffff',
            border: '1px solid #d8e2dc',
            borderTop: '4px solid #0d9488',
            borderRadius: '10px',
            padding: '16px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(13, 148, 136, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '138px',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(13, 148, 136, 0.12)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(13, 148, 136, 0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: '750',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '3px 8px',
                borderRadius: '99px',
                background: '#ccfbf1',
                color: '#0f766e',
              }}
            >
              In Hand
            </span>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: '#f0fdfa',
                border: '1px solid #ccfbf1',
                display: 'grid',
                placeItems: 'center',
                color: '#0d9488',
              }}
            >
              <Landmark size={18} />
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
              Inward Cheques Tally
            </span>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '3px 0 6px' }}>
              {isLoading ? '...' : formatCurrency(metrics?.inward_cheques_total || 0)}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#64748b',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '8px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <Clock size={12} /> {metrics?.inward_cheques_count || 0} in hand
            </span>
            <span style={{ fontWeight: '700', color: '#0d9488', display: 'flex', alignItems: 'center', gap: '2px' }}>
              View <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 2: Day Book Balance */}
        <div
          onClick={() => navigate('/finance/journals')}
          style={{
            background: '#ffffff',
            border: '1px solid #d8e2dc',
            borderTop: '4px solid #059669',
            borderRadius: '10px',
            padding: '16px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '138px',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(5, 150, 105, 0.12)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(5, 150, 105, 0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: '750',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '3px 8px',
                borderRadius: '99px',
                background: '#d1fae5',
                color: '#047857',
              }}
            >
              Cash & Bank
            </span>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: '#ecfdf5',
                border: '1px solid #d1fae5',
                display: 'grid',
                placeItems: 'center',
                color: '#059669',
              }}
            >
              <BookOpen size={18} />
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
              Day Book Balance
            </span>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '3px 0 6px' }}>
              {isLoading ? '...' : formatCurrency(metrics?.day_book_balance || 0)}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#64748b',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '8px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <Building2 size={12} /> {branchName || 'All Branch Net'}
            </span>
            <span style={{ fontWeight: '700', color: '#059669', display: 'flex', alignItems: 'center', gap: '2px' }}>
              Day Book <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 3: Day Sales */}
        <div
          onClick={() => navigate('/sales/invoices')}
          style={{
            background: '#ffffff',
            border: '1px solid #d8e2dc',
            borderTop: '4px solid #16a34a',
            borderRadius: '10px',
            padding: '16px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(22, 163, 74, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '138px',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(22, 163, 74, 0.12)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(22, 163, 74, 0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: '750',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '3px 8px',
                borderRadius: '99px',
                background: '#dcfce7',
                color: '#15803d',
              }}
            >
              Today
            </span>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: '#f0fdf4',
                border: '1px solid #dcfce7',
                display: 'grid',
                placeItems: 'center',
                color: '#16a34a',
              }}
            >
              <TrendingUp size={18} />
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
              Day Sales (Posted)
            </span>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '3px 0 6px' }}>
              {isLoading ? '...' : formatCurrency(metrics?.day_sales || 0)}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#64748b',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '8px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <Calendar size={12} /> Live Asia/Colombo
            </span>
            <span style={{ fontWeight: '700', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '2px' }}>
              Invoices <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 4: Petty Cash */}
        <div
          onClick={() => navigate('/finance/journals')}
          style={{
            background: '#ffffff',
            border: '1px solid #d8e2dc',
            borderTop: '4px solid #d97706',
            borderRadius: '10px',
            padding: '16px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(217, 119, 6, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '138px',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(217, 119, 6, 0.12)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(217, 119, 6, 0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: '750',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '3px 8px',
                borderRadius: '99px',
                background: '#fef3c7',
                color: '#b45309',
              }}
            >
              Cash Drawer
            </span>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                display: 'grid',
                placeItems: 'center',
                color: '#d97706',
              }}
            >
              <Wallet size={18} />
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
              Petty Cash Balance
            </span>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '3px 0 6px' }}>
              {isLoading ? '...' : formatCurrency(metrics?.petty_cash_balance || 0)}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#64748b',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '8px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <BadgeDollarSign size={12} /> Discretionary Float
            </span>
            <span style={{ fontWeight: '700', color: '#d97706', display: 'flex', alignItems: 'center', gap: '2px' }}>
              Ledger <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 5: Expiry Counter */}
        <div
          onClick={() => navigate('/inventory/current-stock')}
          style={{
            background: '#ffffff',
            border: '1px solid #d8e2dc',
            borderTop: '4px solid #e11d48',
            borderRadius: '10px',
            padding: '16px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(225, 29, 72, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '138px',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(225, 29, 72, 0.12)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(225, 29, 72, 0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: '750',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '3px 8px',
                borderRadius: '99px',
                background: '#ffe4e6',
                color: '#be123c',
              }}
            >
              &le; 30 Days
            </span>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: '#fff1f2',
                border: '1px solid #ffe4e6',
                display: 'grid',
                placeItems: 'center',
                color: '#e11d48',
              }}
            >
              <AlertTriangle size={18} />
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
              Expiry Date Counter
            </span>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '3px 0 6px' }}>
              {isLoading ? '...' : `${metrics?.expiring_soon_count || 0} Batches`}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#64748b',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '8px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <ShieldCheck size={12} /> Stock Freshness
            </span>
            <span style={{ fontWeight: '700', color: '#e11d48', display: 'flex', alignItems: 'center', gap: '2px' }}>
              Stock <ArrowUpRight size={12} />
            </span>
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN SPLIT: INWARD CHEQUES SCHEDULE + FAST OPERATIONS LAUNCHER */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)',
          gap: '18px',
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: INWARD CHEQUES MATURITY SCHEDULE */}
        <section
          style={{
            background: '#ffffff',
            border: '1px solid #d8e2dc',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: '1px solid #eef2f0',
              background: '#fcfdfd',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: '800',
                  color: '#1d684f',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  display: 'block',
                }}
              >
                Receivables Pipeline
              </span>
              <h2 style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: '750', color: '#17211d' }}>
                Inward Cheques Maturity Schedule
              </h2>
            </div>

            <button
              className="button secondary"
              style={{ minHeight: '30px', padding: '0 10px', fontSize: '11.5px', fontWeight: '600', borderRadius: '6px' }}
              onClick={() => navigate('/banking/cheques')}
            >
              <ExternalLink size={13} /> Full Registry
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8faf9', borderBottom: '1px solid #e5ebe7' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#5b6b63', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Maturity Date
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#5b6b63', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Customer / Payer
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#5b6b63', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Cheque No
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#5b6b63', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Bank
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '10px', fontWeight: '700', color: '#5b6b63', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Amount
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '10px', fontWeight: '700', color: '#5b6b63', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Status
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '10px', fontWeight: '700', color: '#5b6b63', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#65746d' }}>
                      Loading inward cheques schedule...
                    </td>
                  </tr>
                ) : !metrics?.upcoming_inward_cheques || metrics.upcoming_inward_cheques.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#65746d' }}>
                      <Landmark size={28} style={{ margin: '0 auto 8px', opacity: 0.4, color: '#1d684f' }} />
                      <div style={{ fontWeight: '600', color: '#17211d' }}>No pending inward cheques in hand</div>
                      <small style={{ color: '#829088' }}>Inward customer cheques registered in Banking will appear here.</small>
                    </td>
                  </tr>
                ) : (
                  metrics.upcoming_inward_cheques.map((c) => {
                    const isDueToday = c.due_date <= todayIso
                    return (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: '1px solid #edf2ef',
                          background: isDueToday ? '#fffdf7' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <strong style={{ color: '#17211d', fontSize: '12px' }}>{c.due_date}</strong>
                            {isDueToday && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: '750',
                                  color: '#b91c1c',
                                  background: '#fee2e2',
                                  borderRadius: '3px',
                                  padding: '1px 5px',
                                  width: 'fit-content',
                                }}
                              >
                                Mature / Due
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '10px 14px' }}>
                          <strong style={{ color: '#111827', fontSize: '12.5px' }}>{c.customer_name}</strong>
                        </td>

                        <td style={{ padding: '10px 14px' }}>
                          <code
                            style={{
                              fontFamily: "'Courier New', monospace",
                              fontWeight: '700',
                              background: '#f1f5f3',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              color: '#1e293b',
                            }}
                          >
                            {c.cheque_number}
                          </code>
                        </td>

                        <td style={{ padding: '10px 14px', color: '#64748b' }}>{c.bank_name || 'N/A'}</td>

                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <strong style={{ color: '#0f766e', fontSize: '13px' }}>{formatCurrency(c.amount)}</strong>
                        </td>

                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              padding: '3px 8px',
                              borderRadius: '99px',
                              textTransform: 'capitalize',
                              background: c.status === 'in_hand' ? '#eef7f2' : '#fef3c7',
                              color: c.status === 'in_hand' ? '#166534' : '#b45309',
                            }}
                          >
                            {c.status.replace('_', ' ')}
                          </span>
                        </td>

                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                            {c.status === 'in_hand' && (
                              <button
                                className="button primary"
                                style={{ minHeight: '26px', padding: '0 8px', fontSize: '11px', borderRadius: '5px' }}
                                onClick={() => setDepositCheque(c)}
                                title="Deposit into Bank Account"
                              >
                                Deposit
                              </button>
                            )}
                            <button
                              className="button secondary"
                              style={{ minHeight: '26px', padding: '0 8px', fontSize: '11px', borderRadius: '5px' }}
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
        <section
          style={{
            background: '#ffffff',
            border: '1px solid #d8e2dc',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid #eef2f0',
              background: '#fcfdfd',
            }}
          >
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: '800',
                color: '#1d684f',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                display: 'block',
              }}
            >
              Quick Jump
            </span>
            <h2 style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: '750', color: '#17211d' }}>
              Fast Operations Launcher
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
              padding: '16px',
            }}
          >
            {/* Action 1: POS Billing */}
            <div
              onClick={() => navigate('/sales/pos')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#fbfdfc',
                border: '1px solid #dbe6e0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffffff'
                e.currentTarget.style.borderColor = '#8db7a5'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(18,48,36,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fbfdfc'
                e.currentTarget.style.borderColor = '#dbe6e0'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#dcfce7',
                  color: '#15803d',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <ReceiptText size={20} />
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '12.5px', color: '#111827' }}>POS Billing</strong>
                <small style={{ display: 'block', fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                  Fast cashier invoice
                </small>
              </div>
            </div>

            {/* Action 2: Barcode Generator */}
            <div
              onClick={() => navigate('/inventory/generate-barcode')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#fbfdfc',
                border: '1px solid #dbe6e0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffffff'
                e.currentTarget.style.borderColor = '#8db7a5'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(18,48,36,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fbfdfc'
                e.currentTarget.style.borderColor = '#dbe6e0'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#ccfbf1',
                  color: '#0f766e',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Barcode size={20} />
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '12.5px', color: '#111827' }}>Barcode Labels</strong>
                <small style={{ display: 'block', fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                  Thermal roll designer
                </small>
              </div>
            </div>

            {/* Action 3: Price Check */}
            <div
              onClick={() => navigate('/extras/price-check')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#fbfdfc',
                border: '1px solid #dbe6e0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffffff'
                e.currentTarget.style.borderColor = '#8db7a5'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(18,48,36,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fbfdfc'
                e.currentTarget.style.borderColor = '#dbe6e0'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#e0f2fe',
                  color: '#0369a1',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Scan size={20} />
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '12.5px', color: '#111827' }}>Floor Price Check</strong>
                <small style={{ display: 'block', fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                  Rapid item scanner
                </small>
              </div>
            </div>

            {/* Action 4: Journal & Day Book */}
            <div
              onClick={() => navigate('/finance/journals')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#fbfdfc',
                border: '1px solid #dbe6e0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffffff'
                e.currentTarget.style.borderColor = '#8db7a5'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(18,48,36,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fbfdfc'
                e.currentTarget.style.borderColor = '#dbe6e0'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#fef3c7',
                  color: '#b45309',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <BookOpen size={20} />
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '12.5px', color: '#111827' }}>Journal & Day Book</strong>
                <small style={{ display: 'block', fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                  Debit/Credit entries
                </small>
              </div>
            </div>

            {/* Action 5: Financial Reports */}
            <div
              onClick={() => navigate('/finance/reports')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#fbfdfc',
                border: '1px solid #dbe6e0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffffff'
                e.currentTarget.style.borderColor = '#8db7a5'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(18,48,36,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fbfdfc'
                e.currentTarget.style.borderColor = '#dbe6e0'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#f3e8ff',
                  color: '#7e22ce',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '12.5px', color: '#111827' }}>Financial Reports</strong>
                <small style={{ display: 'block', fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                  Trial Balance & P&L
                </small>
              </div>
            </div>

            {/* Action 6: POS Shortcut Keys */}
            <div
              onClick={() => navigate('/extras/shortcut-keys')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#fbfdfc',
                border: '1px solid #dbe6e0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffffff'
                e.currentTarget.style.borderColor = '#8db7a5'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(18,48,36,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fbfdfc'
                e.currentTarget.style.borderColor = '#dbe6e0'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#ffe4e6',
                  color: '#be123c',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <PlusCircle size={20} />
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '12.5px', color: '#111827' }}>POS Shortcuts</strong>
                <small style={{ display: 'block', fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
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