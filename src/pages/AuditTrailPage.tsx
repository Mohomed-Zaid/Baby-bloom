import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Shield,
  ShieldCheck,
  AlertOctagon,
  AlertTriangle,
  Info,
  RefreshCw,
  Search,
  X,
  Eye,
  FileCode,
  Download,
  User,
  Activity,
  Key,
  Copy,
  Check,
  Terminal,
  LogIn,
  LogOut,
  Receipt,
  CreditCard,
  Package,
  Barcode as BarcodeIcon,
} from 'lucide-react'
import { fetchAuditTrail, fetchStaffLookup } from '../services/auditService'
import { formatBusinessDate, colomboNow } from '../lib/dates'
import type { SystemAuditLogEntry, AuditSeverity, AuditFilterState } from '../types/audit'

export function AuditTrailPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'auth' | 'critical' | 'pos_shift' | 'operations'>('all')

  const [filters, setFilters] = useState<AuditFilterState>({
    search: '',
    event_type: 'all',
    severity: 'all',
    user_id: 'all',
    date_from: '',
    date_to: '',
  })

  const [selectedEntry, setSelectedEntry] = useState<SystemAuditLogEntry | null>(null)
  const [showDiffModal, setShowDiffModal] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // ── Lookups ─────────────────────────────────────────────────────────────
  const users = useQuery({
    queryKey: ['lookup', 'profiles'],
    queryFn: () => fetchStaffLookup(),
  })

  const {
    data: auditLogs,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['audit-trail', filters],
    queryFn: () => fetchAuditTrail(filters, 200),
    refetchInterval: autoRefresh ? 15000 : false,
  })

  const handleResetFilters = () => {
    setFilters({
      search: '',
      event_type: 'all',
      severity: 'all',
      user_id: 'all',
      date_from: '',
      date_to: '',
    })
  }

  // ── Filtered by Active Tab ──────────────────────────────────────────────
  const displayedLogs = useMemo(() => {
    if (!auditLogs) return []
    if (activeTab === 'auth') {
      return auditLogs.filter((l) => {
        const act = (l.metadata as Record<string, unknown> | null)?.action
        return (
          l.event_type === 'login' ||
          act === 'login' ||
          act === 'logout' ||
          (l.event_type === 'session_close' && act === 'logout')
        )
      })
    }
    if (activeTab === 'operations') {
      return auditLogs.filter((l) => {
        const act = String((l.metadata as Record<string, unknown> | null)?.action || '')
        return (
          l.event_type === 'stock_reversal' ||
          act.includes('stock_adjustment') ||
          act.includes('receipt') ||
          act.includes('payment') ||
          act.includes('barcode') ||
          act.includes('invoice')
        )
      })
    }
    if (activeTab === 'critical') {
      return auditLogs.filter((l) => l.severity === 'critical' || l.severity === 'warning')
    }
    if (activeTab === 'pos_shift') {
      const shiftEvents = [
        'session_open',
        'session_close',
        'cash_movement',
        'petty_cash_post',
        'invoice_void',
        'price_override',
      ]
      return auditLogs.filter((l) => {
        const act = (l.metadata as Record<string, unknown> | null)?.action
        if (act === 'logout') return false
        return shiftEvents.includes(l.event_type)
      })
    }
    return auditLogs
  }, [auditLogs, activeTab])

  // ── KPI Metrics ─────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const list = auditLogs || []
    let criticalCount = 0
    let warningCount = 0
    const uniqueActors = new Set<string>()

    for (const log of list) {
      if (log.severity === 'critical') criticalCount++
      if (log.severity === 'warning') warningCount++
      if (log.user_name) uniqueActors.add(log.user_name)
      else if (log.user_id) uniqueActors.add(log.user_id)
    }

    return {
      totalEvents: list.length,
      criticalCount,
      warningCount,
      activeActors: uniqueActors.size,
    }
  }, [auditLogs])

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // ── CSV Export for Auditing ─────────────────────────────────────────────
  const handleExportCsv = () => {
    if (!displayedLogs || displayedLogs.length === 0) return

    const headers = [
      'Timestamp',
      'Severity',
      'Event Type',
      'Action Title',
      'Actor',
      'Email',
      'Target Table',
      'Target ID',
      'Branch',
      'IP Address',
      'Payload / Details',
    ]

    const rows = displayedLogs.map((log) => [
      `"${log.created_at}"`,
      log.severity.toUpperCase(),
      log.event_type,
      `"${String((log.metadata as Record<string, unknown> | null)?.title ?? '').replace(/"/g, '""')}"`,
      `"${log.user_name || 'System'}"`,
      `"${log.user_email || ''}"`,
      `"${log.target_table || ''}"`,
      `"${log.target_id || ''}"`,
      `"${log.branch_name || 'Global'}"`,
      `"${log.ip_address || ''}"`,
      `"${JSON.stringify(log.new_values || log.metadata || {}).replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Security_Audit_Trail_${colomboNow().format('YYYYMMDD_HHmm')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getSeverityBadge = (sev: AuditSeverity) => {
    switch (sev) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs">
            <AlertOctagon size={12} className="animate-pulse" /> CRITICAL
          </span>
        )
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle size={12} /> WARNING
          </span>
        )
      case 'info':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <Info size={12} /> INFO
          </span>
        )
    }
  }

  const getEventBadge = (eventType: string, metadata?: Record<string, unknown> | null) => {
    const action = String(metadata?.action || '')

    if (eventType === 'login' || action === 'login') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border bg-emerald-950/80 text-emerald-300 border-emerald-600/60 shadow-xs">
          <LogIn size={11} className="text-emerald-400" />
          USER LOGIN
        </span>
      )
    }

    if (action === 'logout' || (eventType === 'session_close' && action === 'logout')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border bg-sky-950/80 text-sky-300 border-sky-600/60 shadow-xs">
          <LogOut size={11} className="text-sky-400" />
          USER LOGOUT
        </span>
      )
    }

    if (action === 'customer_receipt_posted' || action.includes('customer_receipt')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border bg-teal-950/80 text-teal-300 border-teal-600/60 shadow-xs">
          <Receipt size={11} className="text-teal-400" />
          CUSTOMER RECEIPT
        </span>
      )
    }

    if (action === 'vendor_payment_posted' || action.includes('supplier_payment') || action.includes('vendor_payment')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border bg-amber-950/80 text-amber-300 border-amber-600/60 shadow-xs">
          <CreditCard size={11} className="text-amber-400" />
          SUPPLIER PAYMENT
        </span>
      )
    }

    if (action.includes('stock_adjustment') || eventType === 'stock_reversal') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border bg-indigo-950/80 text-indigo-300 border-indigo-600/60 shadow-xs">
          <Package size={11} className="text-indigo-400" />
          {eventType === 'stock_reversal' ? 'STOCK REVERSAL' : 'STOCK ADJUSTMENT'}
        </span>
      )
    }

    if (action.includes('barcode')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border bg-purple-950/80 text-purple-300 border-purple-600/60 shadow-xs">
          <BarcodeIcon size={11} className="text-purple-400" />
          BARCODE PRINT
        </span>
      )
    }

    let colorClass = 'bg-teal-900/60 text-teal-200 border-teal-700/50'
    let Icon = Shield

    if (eventType.includes('void') || eventType.includes('bounce') || eventType.includes('reversal')) {
      colorClass = 'bg-rose-950/70 text-rose-300 border-rose-800/60'
      Icon = AlertTriangle
    } else if (eventType.includes('privilege') || eventType.includes('security')) {
      colorClass = 'bg-purple-950/70 text-purple-300 border-purple-800/60'
      Icon = Key
    } else if (eventType.includes('price') || eventType.includes('override')) {
      colorClass = 'bg-amber-950/70 text-amber-300 border-amber-800/60'
      Icon = AlertOctagon
    } else if (eventType.includes('session') || eventType.includes('shift') || eventType.includes('cash')) {
      colorClass = 'bg-cyan-950/70 text-cyan-300 border-cyan-800/60'
      Icon = Activity
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${colorClass}`}>
        <Icon size={11} />
        {eventType.replace(/_/g, ' ').toUpperCase()}
      </span>
    )
  }

  return (
    <div
      className="min-h-screen text-slate-100 p-4 md:p-6 lg:p-8"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ── Main Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-teal-900/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/30 rounded-2xl shadow-lg shadow-teal-950/30">
              <Shield className="w-8 h-8 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Security Audit Trail &amp; Activity Log
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">
                  Immutable Subledger
                </span>
              </div>
              <p className="text-sm text-teal-200/70 mt-0.5">
                Tamper-proof compliance log recording sensitive user events, cash drawer shifts, privilege escalations, and financial overrides.
              </p>
            </div>
          </div>

          {/* Quick Sub-navigation Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-800/60 border border-teal-500/40 shadow-sm">
              Audit Trail
            </div>
            <Link
              to="/admin/security"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Security Matrix
            </Link>
            <Link
              to="/admin/counters"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Counter Registers
            </Link>
            <Link
              to="/staff"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Staff
            </Link>
            <Link
              to="/finance/general-ledger"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              General Ledger
            </Link>
          </div>
        </div>

        {/* ── KPI Summary Cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Events */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300/80 uppercase tracking-wider">
                Total Audit Events
              </span>
              <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20 text-teal-400">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {isLoading ? '...' : metrics.totalEvents}
            </div>
            <div className="text-xs text-teal-300/60 mt-1">
              Events indexed in current audit scope
            </div>
          </div>

          {/* Card 2: Critical Alerts */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300/80 uppercase tracking-wider">
                Critical Security Alerts
              </span>
              <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                <AlertOctagon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-300 mt-2">
              {isLoading ? '...' : metrics.criticalCount}
            </div>
            <div className="text-xs text-rose-300/70 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Requires administrative review
            </div>
          </div>

          {/* Card 3: Warning Events */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300/80 uppercase tracking-wider">
                Warning Events
              </span>
              <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-300 mt-2">
              {isLoading ? '...' : metrics.warningCount}
            </div>
            <div className="text-xs text-amber-300/70 mt-1">
              Cash discrepancies &amp; bill reversals
            </div>
          </div>

          {/* Card 4: Active Actors */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300/80 uppercase tracking-wider">
                Active Actors Tracked
              </span>
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <User className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-2">
              {isLoading ? '...' : metrics.activeActors}
            </div>
            <div className="text-xs text-cyan-300/60 mt-1">
              Staff members &amp; automated processes
            </div>
          </div>
        </div>

        {/* ── Sub-module Tabs & Action Bar ─────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-teal-900/50 pb-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40 shadow-md shadow-teal-950/40'
                  : 'text-teal-300/60 hover:text-teal-200 hover:bg-teal-900/30'
              }`}
            >
              <Shield className="w-4 h-4" />
              All Events
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-teal-950/60 border border-teal-800/40">
                {auditLogs?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('auth')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'auth'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 shadow-md shadow-emerald-950/40'
                  : 'text-emerald-300/60 hover:text-emerald-200 hover:bg-emerald-950/30'
              }`}
            >
              <LogIn className="w-4 h-4 text-emerald-400" />
              Logins &amp; Sessions
            </button>

            <button
              onClick={() => setActiveTab('operations')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'operations'
                  ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/40 shadow-md shadow-indigo-950/40'
                  : 'text-indigo-300/60 hover:text-indigo-200 hover:bg-indigo-950/30'
              }`}
            >
              <Package className="w-4 h-4 text-indigo-400" />
              Stock &amp; Payments
            </button>

            <button
              onClick={() => setActiveTab('pos_shift')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'pos_shift'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-md shadow-cyan-950/40'
                  : 'text-cyan-300/60 hover:text-cyan-200 hover:bg-cyan-900/30'
              }`}
            >
              <Activity className="w-4 h-4" />
              Cash Shifts &amp; POS
            </button>

            <button
              onClick={() => setActiveTab('critical')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'critical'
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-400/40 shadow-md shadow-rose-950/40'
                  : 'text-rose-300/60 hover:text-rose-200 hover:bg-rose-950/30'
              }`}
            >
              <AlertOctagon className="w-4 h-4" />
              Critical &amp; Warnings
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-rose-950/60 border border-rose-800/40">
                {metrics.criticalCount + metrics.warningCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition ${
                autoRefresh
                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40'
                  : 'bg-teal-950/40 text-teal-400/60 border-teal-800/40'
              }`}
              title="Toggle 15s auto-refresh"
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              Auto-sync
            </button>

            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 rounded-xl bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 text-teal-300 hover:text-white transition"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-teal-400' : ''}`} />
            </button>

            <button
              onClick={handleExportCsv}
              disabled={!displayedLogs || displayedLogs.length === 0}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 transition disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* ── Filter Controls ──────────────────────────────────────────────── */}
        <div className="bg-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            {/* Search Input */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                Search Audit Trail
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teal-400/60" />
                <input
                  type="text"
                  className="w-full pl-9 pr-8 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-500"
                  placeholder="Event, user, table, IP address, payload..."
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
                {filters.search && (
                  <button
                    onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-teal-400/60 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Event Type Filter */}
            <div>
              <label className="block text-xs font-semibold text-teal-300/80 mb-1">Event Type</label>
              <select
                className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                value={filters.event_type}
                onChange={(e) => setFilters((f) => ({ ...f, event_type: e.target.value }))}
              >
                <option value="all">All Events</option>
                <option value="login">User Login</option>
                <option value="logout">User Logout</option>
                <option value="session_open">Shift Open</option>
                <option value="session_close">Shift Close (Z-Report)</option>
                <option value="customer_payment">Customer Receipt</option>
                <option value="vendor_payment">Supplier Payment</option>
                <option value="stock_adjustment">Stock Adjustment</option>
                <option value="barcode">Barcode Printed</option>
                <option value="cash_movement">Cash In / Safe Drop</option>
                <option value="petty_cash_post">Petty Cash Post</option>
                <option value="manual_journal">Manual Journal</option>
                <option value="user_privilege_change">Privilege Change</option>
                <option value="invoice_void">Invoice Void</option>
                <option value="price_override">Price Override</option>
                <option value="cheque_bounce">Cheque Bounce</option>
                <option value="stock_reversal">Stock Reversal</option>
              </select>
            </div>

            {/* Severity Filter */}
            <div>
              <label className="block text-xs font-semibold text-teal-300/80 mb-1">Severity</label>
              <select
                className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                value={filters.severity}
                onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
              >
                <option value="all">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Staff Filter */}
            <div>
              <label className="block text-xs font-semibold text-teal-300/80 mb-1">Staff / Actor</label>
              <select
                className="w-full px-3 py-2 bg-teal-950/60 border border-teal-800/50 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
                value={filters.user_id}
                onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
              >
                <option value="all">All Staff</option>
                {users.data?.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Button */}
            <div>
              <button
                type="button"
                className="w-full px-4 py-2 border border-teal-800/50 rounded-xl text-sm font-medium text-teal-300 bg-teal-950/50 hover:bg-teal-900/50 hover:text-white transition flex items-center justify-center gap-1.5"
                onClick={handleResetFilters}
              >
                <X className="w-3.5 h-3.5" />
                Reset Filters
              </button>
            </div>
          </div>

          {/* Date Range Sub-row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-teal-900/40 text-xs text-teal-300/80">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span>From:</span>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
                  className="px-2.5 py-1 bg-teal-950/70 border border-teal-800/50 rounded-lg text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span>To:</span>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
                  className="px-2.5 py-1 bg-teal-950/70 border border-teal-800/50 rounded-lg text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Date Presets */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const today = colomboNow().format('YYYY-MM-DD')
                    setFilters((f) => ({ ...f, date_from: today, date_to: today }))
                  }}
                  className="px-2 py-1 bg-teal-950/40 hover:bg-teal-900/40 rounded text-[11px] text-teal-300"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilters((f) => ({
                      ...f,
                      date_from: colomboNow().subtract(7, 'day').format('YYYY-MM-DD'),
                      date_to: colomboNow().format('YYYY-MM-DD'),
                    }))
                  }}
                  className="px-2 py-1 bg-teal-950/40 hover:bg-teal-900/40 rounded text-[11px] text-teal-300"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilters((f) => ({
                      ...f,
                      date_from: colomboNow().subtract(30, 'day').format('YYYY-MM-DD'),
                      date_to: colomboNow().format('YYYY-MM-DD'),
                    }))
                  }}
                  className="px-2 py-1 bg-teal-950/40 hover:bg-teal-900/40 rounded text-[11px] text-teal-300"
                >
                  Last 30 Days
                </button>
              </div>
            </div>

            <div>
              Showing <strong>{displayedLogs.length}</strong> of{' '}
              <strong>{auditLogs?.length || 0}</strong> events
            </div>
          </div>
        </div>

        {/* ── Audit Logs Table ────────────────────────────────────────────── */}
        <div className="bg-[#0a2321]/90 border border-teal-800/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
          {isLoading ? (
            <div className="p-16 text-center text-teal-300/60">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
              Loading security audit records...
            </div>
          ) : displayedLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-teal-950/70 border-b border-teal-800/50 text-teal-300/80 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Timestamp</th>
                    <th className="py-3.5 px-4">Severity</th>
                    <th className="py-3.5 px-4">Event Type</th>
                    <th className="py-3.5 px-4">Actor / Staff</th>
                    <th className="py-3.5 px-4">Action &amp; Target</th>
                    <th className="py-3.5 px-4">Branch</th>
                    <th className="py-3.5 px-4">Terminal / IP</th>
                    <th className="py-3.5 px-4 text-center">Payload &amp; Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-900/30">
                  {displayedLogs.map((entry) => (
                    <tr key={entry.id} className="hover:bg-teal-900/20 transition-colors group">
                      {/* Timestamp */}
                      <td className="py-3 px-4 text-xs font-mono text-teal-200 whitespace-nowrap">
                        <div>{formatBusinessDate(entry.created_at)}</div>
                        <div className="text-[11px] text-teal-400/60 font-mono">
                          {new Date(entry.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="py-3 px-4">{getSeverityBadge(entry.severity)}</td>

                      {/* Event Type */}
                      <td className="py-3 px-4">{getEventBadge(entry.event_type, entry.metadata)}</td>

                      {/* Actor */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white group-hover:text-teal-200 transition">
                          {entry.user_name || 'System / Automated'}
                        </div>
                        {entry.user_email && (
                          <div className="text-[11px] text-teal-400/60 truncate max-w-[180px]">
                            {entry.user_email}
                          </div>
                        )}
                      </td>

                      {/* Action & Target Entity */}
                      <td className="py-3 px-4">
                        {entry.metadata && (entry.metadata as Record<string, unknown>).title ? (
                          <div>
                            <div className="font-medium text-xs text-white group-hover:text-teal-200 transition">
                              {String((entry.metadata as Record<string, unknown>).title)}
                            </div>
                            <div className="text-[11px] text-teal-400/60 font-mono flex items-center gap-1 mt-0.5">
                              {entry.target_table && <span>{entry.target_table}</span>}
                              {entry.target_id && <span>#{entry.target_id.slice(0, 8)}</span>}
                            </div>
                          </div>
                        ) : entry.target_table ? (
                          <span className="font-mono text-xs bg-teal-950/70 border border-teal-800/40 text-teal-200 px-2 py-0.5 rounded">
                            {entry.target_table}
                            {entry.target_id ? ` (#${entry.target_id.slice(0, 8)})` : ''}
                          </span>
                        ) : (
                          <span className="text-teal-600/40">—</span>
                        )}
                      </td>

                      {/* Branch */}
                      <td className="py-3 px-4 text-xs text-teal-300/80">
                        {entry.branch_name || 'Global / All'}
                      </td>

                      {/* IP Address */}
                      <td className="py-3 px-4 font-mono text-xs text-teal-400/70">
                        {entry.ip_address || '127.0.0.1'}
                      </td>

                      {/* Inspect Diff */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 transition-colors"
                          onClick={() => {
                            setSelectedEntry(entry)
                            setShowDiffModal(true)
                          }}
                        >
                          <Eye size={13} /> Inspect Diff
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-16 text-center">
              <ShieldCheck size={48} className="mx-auto text-teal-500/40 mb-3" />
              <h3 className="text-base font-semibold text-white">No security audit records found</h3>
              <p className="text-xs text-teal-300/60 mt-1">
                No events match the active filter criteria or date range.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: JSON DIFF & SECURITY PAYLOAD INSPECTOR                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showDiffModal && selectedEntry && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] border border-teal-700/60 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 text-white my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-teal-800/50 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-500/20 border border-teal-500/40 rounded-xl text-teal-300">
                  <FileCode size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">Security Record Inspector</h3>
                    {getSeverityBadge(selectedEntry.severity)}
                  </div>
                  <p className="text-xs text-teal-300/70 mt-0.5">
                    Event:{' '}
                    <span className="font-semibold text-teal-200 uppercase">
                      {selectedEntry.event_type.replace(/_/g, ' ')}
                    </span>{' '}
                    • Log ID: <span className="font-mono text-teal-400">{selectedEntry.id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-lg text-teal-400 hover:text-white hover:bg-teal-900/50 transition"
                onClick={() => setShowDiffModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Event Metadata Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-teal-950/60 border border-teal-800/40 p-3.5 rounded-xl text-xs">
              <div>
                <div className="text-teal-400/80 mb-0.5">Actor / User:</div>
                <div className="font-semibold text-white">{selectedEntry.user_name || 'System / Service'}</div>
                {selectedEntry.user_email && (
                  <div className="text-[11px] text-teal-400/60">{selectedEntry.user_email}</div>
                )}
              </div>
              <div>
                <div className="text-teal-400/80 mb-0.5">Target Table:</div>
                <div className="font-mono font-semibold text-teal-200">
                  {selectedEntry.target_table || 'None'}
                </div>
                {selectedEntry.target_id && (
                  <div className="text-[11px] font-mono text-teal-400/60 truncate">
                    ID: {selectedEntry.target_id}
                  </div>
                )}
              </div>
              <div>
                <div className="text-teal-400/80 mb-0.5">Branch / Scope:</div>
                <div className="font-semibold text-white">{selectedEntry.branch_name || 'Global'}</div>
                <div className="text-[11px] font-mono text-teal-400/60">
                  IP: {selectedEntry.ip_address || '127.0.0.1'}
                </div>
              </div>
              <div>
                <div className="text-teal-400/80 mb-0.5">Timestamp:</div>
                <div className="font-mono text-white">
                  {new Date(selectedEntry.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Side-by-Side Diff */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div
                className={`grid gap-4 ${
                  selectedEntry.old_values ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {selectedEntry.old_values && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        Previous State (old_values)
                      </h4>
                      <button
                        onClick={() =>
                          copyToClipboard(JSON.stringify(selectedEntry.old_values, null, 2), 'old')
                        }
                        className="p-1 text-teal-400 hover:text-white rounded text-[11px] flex items-center gap-1"
                      >
                        {copiedKey === 'old' ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                        Copy
                      </button>
                    </div>
                    <pre className="bg-[#031413] text-rose-300 p-3.5 rounded-xl font-mono text-xs overflow-x-auto max-h-72 border border-rose-900/40">
                      {JSON.stringify(selectedEntry.old_values, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {selectedEntry.old_values ? 'New State (new_values)' : 'Recorded Payload & Changes'}
                    </h4>
                    <button
                      onClick={() =>
                        copyToClipboard(JSON.stringify(selectedEntry.new_values || {}, null, 2), 'new')
                      }
                      className="p-1 text-teal-400 hover:text-white rounded text-[11px] flex items-center gap-1"
                    >
                      {copiedKey === 'new' ? (
                        <Check size={12} className="text-emerald-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                      Copy
                    </button>
                  </div>
                  <pre className="bg-[#031413] text-emerald-300 p-3.5 rounded-xl font-mono text-xs overflow-x-auto max-h-72 border border-emerald-900/40">
                    {JSON.stringify(selectedEntry.new_values || {}, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Context Metadata JSON */}
              {selectedEntry.metadata && Object.keys(selectedEntry.metadata).length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Terminal size={13} />
                      Context Metadata
                    </h4>
                    <button
                      onClick={() =>
                        copyToClipboard(JSON.stringify(selectedEntry.metadata, null, 2), 'meta')
                      }
                      className="p-1 text-teal-400 hover:text-white rounded text-[11px] flex items-center gap-1"
                    >
                      {copiedKey === 'meta' ? (
                        <Check size={12} className="text-emerald-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                      Copy
                    </button>
                  </div>
                  <pre className="bg-[#031413] text-cyan-300 p-3.5 rounded-xl font-mono text-xs overflow-x-auto max-h-48 border border-cyan-900/40">
                    {JSON.stringify(selectedEntry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-teal-800/50">
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(JSON.stringify(selectedEntry, null, 2), 'all')
                }
                className="px-3.5 py-1.5 bg-teal-950/60 border border-teal-800/50 hover:bg-teal-900/60 text-teal-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              >
                {copiedKey === 'all' ? (
                  <Check size={13} className="text-emerald-400" />
                ) : (
                  <Copy size={13} />
                )}
                Copy Full Audit Record (JSON)
              </button>

              <button
                type="button"
                className="px-4 py-1.5 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-semibold shadow transition"
                onClick={() => setShowDiffModal(false)}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
