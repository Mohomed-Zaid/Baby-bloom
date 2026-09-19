import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertOctagon,
  AlertTriangle,
  Eye,
  FileCode,
  Info,
  RefreshCw,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react'
import { fetchAuditTrail, fetchStaffLookup } from '../services/auditService'
import type { SystemAuditLogEntry, AuditSeverity, AuditFilterState } from '../types/audit'

export function AuditTrailPage() {
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

  // ── Lookups ─────────────────────────────────────────────────────────────
  const users = useQuery({
    queryKey: ['lookup', 'profiles'],
    queryFn: () => fetchStaffLookup(),
  })

  const { data: auditLogs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['audit-trail', filters],
    queryFn: () => fetchAuditTrail(filters, 150),
    refetchInterval: 20000,
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

  const getSeverityBadge = (sev: AuditSeverity) => {
    switch (sev) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertOctagon size={12} /> CRITICAL
          </span>
        )
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle size={12} /> WARNING
          </span>
        )
      case 'info':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Info size={12} /> INFO
          </span>
        )
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Shield className="text-emerald-700" size={28} />
            Security Audit Trail & Activity Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Immutable, tamper-proof security log recording sensitive user events, cash shifts, privilege modifications, and financial overrides.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            <RefreshCw size={15} className={isRefetching ? 'animate-spin text-emerald-700' : ''} />
            Refresh Logs
          </button>
        </div>
      </div>

      {/* ── Filter Controls ──────────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3.5 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Search Logs</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              placeholder="Search event, user, table, IP..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Event Type</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              value={filters.event_type}
              onChange={(e) => setFilters((f) => ({ ...f, event_type: e.target.value }))}
            >
              <option value="all">All Events</option>
              <option value="session_open">Shift Open</option>
              <option value="session_close">Shift Close (Z-Report)</option>
              <option value="cash_movement">Cash In / Safe Drop</option>
              <option value="petty_cash_post">Petty Cash Post</option>
              <option value="manual_journal">Manual Journal</option>
              <option value="user_privilege_change">Privilege Change</option>
              <option value="invoice_void">Invoice Void</option>
              <option value="price_override">Price Override</option>
              <option value="cheque_bounce">Cheque Bounce</option>
              <option value="stock_reversal">Stock Reversal</option>
              <option value="login">User Login</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Severity</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              value={filters.severity}
              onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">User / Staff</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              value={filters.user_id}
              onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
            >
              <option value="all">All Staff</option>
              {users.data?.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* ── Audit Logs Table ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading security audit records...</div>
        ) : auditLogs && auditLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-5 py-3.5">Severity</th>
                  <th className="px-5 py-3.5">Event Type</th>
                  <th className="px-5 py-3.5">Actor / User</th>
                  <th className="px-5 py-3.5">Target Table</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">IP Address</th>
                  <th className="px-5 py-3.5 text-center">Payload / Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditLogs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-gray-600 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'medium',
                      })}
                    </td>
                    <td className="px-5 py-3.5">{getSeverityBadge(entry.severity)}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-emerald-800 text-xs uppercase tracking-wide">
                        {entry.event_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">{entry.user_name || 'System / Service'}</div>
                      {entry.user_email && (
                        <div className="text-xs text-gray-400">{entry.user_email}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {entry.target_table ? (
                        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {entry.target_table} {entry.target_id ? `(#${entry.target_id.slice(0, 8)})` : ''}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-600">{entry.branch_name || 'Global / All'}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-500">
                      {entry.ip_address || '127.0.0.1'}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
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
            <ShieldCheck size={44} className="mx-auto text-emerald-700 mb-3" />
            <h3 className="text-base font-semibold text-gray-900">No audit records match the current filter</h3>
            <p className="text-sm text-gray-500 mt-1">
              Try adjusting the date range or clearing the event filters.
            </p>
          </div>
        )}
      </div>

      {/* ── MODAL: JSON Diff & Record Inspector ─────────────────────────── */}
      {showDiffModal && selectedEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <FileCode size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Audit Record Inspector & JSON Diff
                  </h3>
                  <p className="text-xs text-gray-500">
                    Event: <span className="font-semibold uppercase text-emerald-700">{selectedEntry.event_type.toUpperCase()}</span> • Log ID: {selectedEntry.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                onClick={() => setShowDiffModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Event Metadata Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-xl text-xs border border-gray-100">
                <div>
                  <div className="text-gray-500 mb-1">Severity:</div>
                  {getSeverityBadge(selectedEntry.severity)}
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Actor:</div>
                  <div className="font-semibold text-gray-900">{selectedEntry.user_name || 'System'}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Timestamp:</div>
                  <div className="text-gray-800">{new Date(selectedEntry.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Target:</div>
                  <div className="font-mono text-gray-800">{selectedEntry.target_table || 'N/A'}</div>
                </div>
              </div>

              {/* Side-by-Side Diff or New Values */}
              <div className={`grid gap-4 ${selectedEntry.old_values ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {selectedEntry.old_values && (
                  <div>
                    <h4 className="text-xs font-bold text-rose-600 mb-2 uppercase tracking-wide">
                      Previous State (old_values)
                    </h4>
                    <pre className="bg-slate-900 text-rose-300 p-3.5 rounded-xl font-mono text-xs overflow-x-auto max-h-64 border border-slate-800">
                      {JSON.stringify(selectedEntry.old_values, null, 2)}
                    </pre>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold text-emerald-600 mb-2 uppercase tracking-wide">
                    {selectedEntry.old_values ? 'New State (new_values)' : 'Recorded Payload & Changes'}
                  </h4>
                  <pre className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl font-mono text-xs overflow-x-auto max-h-64 border border-slate-800">
                    {JSON.stringify(selectedEntry.new_values || {}, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Metadata JSON if present */}
              {selectedEntry.metadata && Object.keys(selectedEntry.metadata).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-blue-600 mb-2 uppercase tracking-wide">
                    Context Metadata
                  </h4>
                  <pre className="bg-slate-900 text-sky-300 p-3 rounded-xl font-mono text-xs overflow-x-auto max-h-40 border border-slate-800">
                    {JSON.stringify(selectedEntry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-4 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm"
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
