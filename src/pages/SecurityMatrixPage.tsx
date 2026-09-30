import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  UserCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Search,
  ExternalLink,
  Download,
  RotateCcw,
  Lock,
  Unlock,
  AlertCircle,
  SlidersHorizontal,
  Building,
  Mail,
  User,
  BadgeCheck,
} from 'lucide-react'
import {
  fetchUserPrivilegeMatrix,
  toggleUserPermissionOverride,
  batchSetUserPermissionOverrides,
  fetchStaffUsersForPrivilegeMatrix,
} from '../services/adminService'

export const SecurityMatrixPage: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // ── Global Toast ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [activeModuleFilter, setActiveModuleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'overrides_only' | 'allowed_only' | 'denied_only'>('all')
  const [search, setSearch] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // ── Load Staff Users ──────────────────────────────────────────────────────
  const { data: staffUsers = [], isLoading: loadingStaff } = useQuery({
    queryKey: ['staff-privilege-users'],
    queryFn: () => fetchStaffUsersForPrivilegeMatrix(),
  })

  // Automatically select first staff member if none selected
  React.useEffect(() => {
    if (!selectedUserId && staffUsers.length > 0) {
      setSelectedUserId(staffUsers[0]?.value || '')
    }
  }, [staffUsers, selectedUserId])

  const selectedStaff = useMemo(() => {
    return staffUsers.find((u) => u.value === selectedUserId)
  }, [staffUsers, selectedUserId])

  // ── Load Privilege Matrix for Selected User ───────────────────────────────
  const {
    data: matrix = [],
    isLoading: loadingMatrix,
    isFetching: fetchingMatrix,
    refetch,
  } = useQuery({
    queryKey: ['security-matrix', selectedUserId],
    queryFn: () => fetchUserPrivilegeMatrix(selectedUserId),
    enabled: !!selectedUserId,
  })

  // ── Single Toggle Mutation ────────────────────────────────────────────────
  const overrideMutation = useMutation({
    mutationFn: async ({ permissionId, isAllowed }: { permissionId: string; isAllowed: boolean | null }) => {
      await toggleUserPermissionOverride(selectedUserId, permissionId, isAllowed)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['security-matrix', selectedUserId] })
      if (variables.isAllowed === true) notify('Override granted successfully!')
      else if (variables.isAllowed === false) notify('Override revoked successfully!')
      else notify('Reverted to role default.')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to update privilege override', true)
    },
  })

  // ── Batch Toggle Mutation ─────────────────────────────────────────────────
  const batchOverrideMutation = useMutation({
    mutationFn: async ({ permissionIds, isAllowed }: { permissionIds: string[]; isAllowed: boolean | null }) => {
      await batchSetUserPermissionOverrides(selectedUserId, permissionIds, isAllowed)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['security-matrix', selectedUserId] })
      setShowResetConfirm(false)
      if (variables.isAllowed === true) notify(`Granted ${variables.permissionIds.length} permissions in module!`)
      else if (variables.isAllowed === false) notify(`Revoked ${variables.permissionIds.length} permissions in module!`)
      else notify(`Reset ${variables.permissionIds.length} permissions to role defaults!`)
    },
    onError: (err: Error) => {
      notify(err.message || 'Batch update failed', true)
    },
  })

  // ── Modules List ──────────────────────────────────────────────────────────
  const modules = useMemo(() => {
    return Array.from(new Set(matrix.map((row) => row.module)))
  }, [matrix])

  // ── KPI Summary Calculations ──────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = matrix.length
    const allowed = matrix.filter((r) => r.effective_allowed).length
    const denied = total - allowed
    const grantedOverrides = matrix.filter((r) => r.user_override === true).length
    const revokedOverrides = matrix.filter((r) => r.user_override === false).length
    const totalOverrides = grantedOverrides + revokedOverrides
    const inherited = total - totalOverrides

    return {
      total,
      allowed,
      denied,
      grantedOverrides,
      revokedOverrides,
      totalOverrides,
      inherited,
    }
  }, [matrix])

  // ── Filtered Matrix Rows ──────────────────────────────────────────────────
  const filteredMatrix = useMemo(() => {
    return matrix.filter((row) => {
      // 1. Module filter
      if (activeModuleFilter !== 'all' && row.module !== activeModuleFilter) {
        return false
      }

      // 2. Status filter
      if (statusFilter === 'overrides_only' && row.user_override === null) {
        return false
      }
      if (statusFilter === 'allowed_only' && !row.effective_allowed) {
        return false
      }
      if (statusFilter === 'denied_only' && row.effective_allowed) {
        return false
      }

      // 3. Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = row.name.toLowerCase().includes(q)
        const matchKey = row.permission_key.toLowerCase().includes(q)
        const matchDesc = row.description ? row.description.toLowerCase().includes(q) : false
        const matchModule = row.module.toLowerCase().includes(q)
        if (!matchName && !matchKey && !matchDesc && !matchModule) return false
      }

      return true
    })
  }, [matrix, activeModuleFilter, statusFilter, search])

  // ── Batch Action Handlers ─────────────────────────────────────────────────
  const activeModulePermissionIds = useMemo(() => {
    if (activeModuleFilter === 'all') {
      return filteredMatrix.map((r) => r.permission_id)
    }
    return matrix.filter((r) => r.module === activeModuleFilter).map((r) => r.permission_id)
  }, [matrix, filteredMatrix, activeModuleFilter])

  const handleGrantAllInModule = () => {
    if (activeModulePermissionIds.length === 0) return
    batchOverrideMutation.mutate({
      permissionIds: activeModulePermissionIds,
      isAllowed: true,
    })
  }

  const handleRevokeAllInModule = () => {
    if (activeModulePermissionIds.length === 0) return
    batchOverrideMutation.mutate({
      permissionIds: activeModulePermissionIds,
      isAllowed: false,
    })
  }

  const handleResetToDefaults = () => {
    const idsToReset = matrix.filter((r) => r.user_override !== null).map((r) => r.permission_id)
    if (idsToReset.length === 0) {
      notify('All permissions are already inheriting role defaults')
      setShowResetConfirm(false)
      return
    }
    batchOverrideMutation.mutate({
      permissionIds: idsToReset,
      isAllowed: null,
    })
  }

  // ── Export Matrix to CSV ──────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (filteredMatrix.length === 0) {
      notify('No records to export', true)
      return
    }
    const staffName = selectedStaff?.fullName || 'Staff'
    const headers = [
      'Module',
      'Permission Name',
      'Permission Key',
      'Role Baseline',
      'User Override',
      'Effective Right',
      'Description',
    ]
    const rows = filteredMatrix.map((r) => [
      `"${r.module}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.permission_key}"`,
      r.role_allowed ? 'Allowed' : 'Denied',
      r.user_override === true ? 'Granted Override' : r.user_override === false ? 'Revoked Override' : 'Inherited',
      r.effective_allowed ? 'Active (Allowed)' : 'Inactive (Denied)',
      `"${(r.description || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `privilege_matrix_${staffName.replace(/\s+/g, '_')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notify('Privilege matrix exported to CSV')
  }

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* ── TOAST NOTIFICATION ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 transition-all duration-300 ${
            toast.isError
              ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
              : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
          }`}
        >
          {toast.isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Granular User Privilege Matrix
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Access Control & Security Policy
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Configure user-level permission overrides for Page Rights, POS Control Rights & Financial Audits
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={fetchingMatrix}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingMatrix ? 'animate-spin text-[#38d4c5]' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => navigate('/admin/staff')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Staff Directory
          </button>

          <button
            onClick={() => navigate('/admin/audit-trail')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Security Audit Trail
          </button>
        </div>
      </div>

      {/* ── USER SELECTOR & PROFILE BANNER ──────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-5 shadow-sm backdrop-blur-md space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-[#38d4c5]" />
            <div>
              <span className="text-xs uppercase font-semibold text-[#7aa5a0] tracking-wider block">
                Target Staff User
              </span>
              <span className="text-sm text-white font-medium">
                Select a user to review role inheritance and customize granular overrides
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full md:w-80 px-3.5 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white font-medium focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
            >
              {loadingStaff && <option value="">Loading staff members...</option>}
              {staffUsers.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Staff Badge Detail Strip */}
        {selectedStaff && (
          <div className="pt-3 border-t border-[#164e48]/60 flex flex-wrap items-center justify-between gap-3 text-xs text-[#a0c4c0]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5 text-white font-semibold">
                <User className="w-3.5 h-3.5 text-[#38d4c5]" />
                {selectedStaff.fullName}
              </span>
              {selectedStaff.code && (
                <span className="font-mono text-[#38d4c5] bg-[#0c2e2a] px-2 py-0.5 rounded border border-[#164e48]">
                  ID: {selectedStaff.code}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5 text-amber-400" />
                Role: <span className="text-white font-medium">{selectedStaff.designation || 'Staff'}</span>
              </span>
              {selectedStaff.branchName && (
                <span className="flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-[#7aa5a0]" />
                  Branch: <span className="text-white font-medium">{selectedStaff.branchName}</span>
                </span>
              )}
              {selectedStaff.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#7aa5a0]" />
                  {selectedStaff.email}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                {kpis.allowed} Active Rights
              </span>
              {kpis.totalOverrides > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  {kpis.totalOverrides} Custom Overrides
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── KPI METRICS CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Rights in Catalog */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Catalog Rights</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5]">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {kpis.total}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            Total granular security permissions
          </div>
        </div>

        {/* 2. Effective Allowed */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Active (Allowed)</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-emerald-400 tracking-tight">
              {kpis.allowed}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5 flex justify-between">
            <span>Effective operational rights</span>
            <span className="font-mono text-emerald-300">
              {Math.round((kpis.allowed / (kpis.total || 1)) * 100)}%
            </span>
          </div>
        </div>

        {/* 3. Explicit Overrides */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Custom Overrides</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-indigo-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {kpis.totalOverrides}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5 flex items-center justify-between">
            <span className="text-emerald-400 font-mono">+{kpis.grantedOverrides} Granted</span>
            <span className="text-rose-400 font-mono">-{kpis.revokedOverrides} Revoked</span>
          </div>
        </div>

        {/* 4. Inherited from Role */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Role Baseline</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-slate-400">
              <MinusCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-slate-300 tracking-tight">
              {kpis.inherited}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            Inheriting standard role permissions
          </div>
        </div>
      </div>

      {/* ── MODULE TABS ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 border-b border-[#164e48] pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveModuleFilter('all')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg flex items-center gap-1.5 border-b-2 transition-all shrink-0 ${
            activeModuleFilter === 'all'
              ? 'border-[#38d4c5] text-[#38d4c5] bg-[#0c2e2a]/50'
              : 'border-transparent text-[#7aa5a0] hover:text-white'
          }`}
        >
          All Modules
          <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-[#113e3a] text-[#38d4c5] font-mono">
            {matrix.length}
          </span>
        </button>

        {modules.map((mod) => {
          const count = matrix.filter((r) => r.module === mod).length
          const modOverrides = matrix.filter((r) => r.module === mod && r.user_override !== null).length
          return (
            <button
              key={mod}
              onClick={() => setActiveModuleFilter(mod)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg capitalize flex items-center gap-1.5 border-b-2 transition-all shrink-0 ${
                activeModuleFilter === mod
                  ? 'border-[#38d4c5] text-[#38d4c5] bg-[#0c2e2a]/50'
                  : 'border-transparent text-[#7aa5a0] hover:text-white'
              }`}
            >
              {mod}
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-[#113e3a] text-[#38d4c5] font-mono">
                {count}
              </span>
              {modOverrides > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" title={`${modOverrides} custom overrides`} />
              )}
            </button>
          )
        })}
      </div>

      {/* ── CONTROLS & BATCH ACTIONS BAR ─────────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7aa5a0]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by right name, key (e.g. sales.create), or description..."
            className="w-full pl-9 pr-4 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white placeholder-[#7aa5a0] focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider">Filter:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
          >
            <option value="all">All Permissions ({matrix.length})</option>
            <option value="overrides_only">Only Custom Overrides ({kpis.totalOverrides})</option>
            <option value="allowed_only">Effective Allowed ({kpis.allowed})</option>
            <option value="denied_only">Effective Denied ({kpis.denied})</option>
          </select>
        </div>

        {/* Batch Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleGrantAllInModule}
            disabled={batchOverrideMutation.isPending || activeModulePermissionIds.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors disabled:opacity-50"
            title="Grant all permissions currently in view"
          >
            <Unlock className="w-3.5 h-3.5" />
            Grant Module
          </button>

          <button
            onClick={handleRevokeAllInModule}
            disabled={batchOverrideMutation.isPending || activeModulePermissionIds.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors disabled:opacity-50"
            title="Revoke all permissions currently in view"
          >
            <Lock className="w-3.5 h-3.5" />
            Revoke Module
          </button>

          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={batchOverrideMutation.isPending || kpis.totalOverrides === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] text-[#a0c4c0] border border-[#164e48] transition-colors disabled:opacity-50"
            title="Reset all user overrides back to role defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
            title="Export filtered matrix to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── PRIVILEGE MATRIX TABLE ───────────────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl overflow-hidden shadow-sm backdrop-blur-md">
        {loadingMatrix ? (
          <div className="p-12 text-center text-[#7aa5a0]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#38d4c5] mb-2" />
            <p className="text-sm">Loading security privilege matrix...</p>
          </div>
        ) : filteredMatrix.length === 0 ? (
          <div className="p-12 text-center text-[#7aa5a0]">
            <ShieldCheck className="w-10 h-10 mx-auto text-[#164e48] mb-3" />
            <p className="text-base font-semibold text-white">No Permissions Match Your Criteria</p>
            <p className="text-xs text-[#7aa5a0] mt-1">
              {search ? 'Try clearing your search query or adjusting filters.' : 'No permissions registered in this module.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-[#082824] text-[#7aa5a0] text-xs uppercase tracking-wider font-semibold border-b border-[#164e48]">
                <tr>
                  <th className="px-5 py-3">Module</th>
                  <th className="px-5 py-3">Permission Right / Key</th>
                  <th className="px-5 py-3 text-center">Role Baseline</th>
                  <th className="px-5 py-3 text-center">User Override</th>
                  <th className="px-5 py-3 text-center">Effective Right</th>
                  <th className="px-5 py-3 text-right">Granular Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#164e48]/50 text-[#e2f1ef]">
                {filteredMatrix.map((row) => (
                  <tr key={row.permission_id} className="hover:bg-[#0a2e2a]/50 transition-colors">
                    {/* Module */}
                    <td className="px-5 py-3.5 font-semibold text-[#38d4c5] capitalize text-xs whitespace-nowrap">
                      {row.module}
                    </td>

                    {/* Permission details */}
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white text-sm">{row.name}</div>
                      <div className="text-xs text-[#7aa5a0] mt-0.5">{row.description}</div>
                      <div className="font-mono text-[11px] text-[#38d4c5]/70 mt-1">{row.permission_key}</div>
                    </td>

                    {/* Role Baseline */}
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {row.role_allowed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Allowed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-500/10 px-2.5 py-1 rounded-full border border-slate-500/20">
                          <XCircle className="w-3.5 h-3.5 text-slate-400" /> Denied
                        </span>
                      )}
                    </td>

                    {/* User Override */}
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {row.user_override === true ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-full border border-indigo-500/40">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" /> Granted
                        </span>
                      ) : row.user_override === false ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-300 bg-rose-500/20 px-2.5 py-1 rounded-full border border-rose-500/40">
                          <XCircle className="w-3.5 h-3.5 text-rose-400" /> Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-[#7aa5a0]">
                          <MinusCircle className="w-3.5 h-3.5" /> Inherited
                        </span>
                      )}
                    </td>

                    {/* Effective Status */}
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {row.effective_allowed ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-rose-500/10 text-rose-300/80 border border-rose-500/20">
                          <span className="w-2 h-2 rounded-full bg-rose-400" />
                          LOCKED
                        </span>
                      )}
                    </td>

                    {/* Granular Action Buttons */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => overrideMutation.mutate({ permissionId: row.permission_id, isAllowed: true })}
                          disabled={overrideMutation.isPending || row.user_override === true}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                            row.user_override === true
                              ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400 cursor-default'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                          title="Explicitly grant this permission to the user"
                        >
                          Grant
                        </button>

                        <button
                          onClick={() => overrideMutation.mutate({ permissionId: row.permission_id, isAllowed: false })}
                          disabled={overrideMutation.isPending || row.user_override === false}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                            row.user_override === false
                              ? 'bg-rose-500/30 text-rose-200 border border-rose-400 cursor-default'
                              : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                          title="Explicitly revoke this permission from the user"
                        >
                          Revoke
                        </button>

                        <button
                          onClick={() => overrideMutation.mutate({ permissionId: row.permission_id, isAllowed: null })}
                          disabled={overrideMutation.isPending || row.user_override === null}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            row.user_override === null
                              ? 'opacity-40 cursor-not-allowed text-[#7aa5a0]'
                              : 'bg-[#0c2e2a] hover:bg-[#12423c] text-[#a0c4c0] border border-[#164e48]'
                          }`}
                          title="Revert override and inherit role default"
                        >
                          Inherit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL: CONFIRM RESET ALL DEFAULTS ─────────────────────────────────── */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#082321] border border-[#164e48] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#e2f1ef]">
            <div className="flex items-center gap-3 text-amber-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Reset All Permission Overrides?</h3>
            </div>
            <p className="text-sm text-[#7aa5a0]">
              This will remove all <span className="text-white font-bold">{kpis.totalOverrides} custom overrides</span> for{' '}
              <span className="text-white font-bold">{selectedStaff?.fullName}</span>. The user will immediately inherit
              default permissions from their assigned role.
            </p>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#164e48]">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-[#164e48] rounded-lg text-sm font-medium text-[#7aa5a0] hover:bg-[#0c2e2a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleResetToDefaults}
                disabled={batchOverrideMutation.isPending}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-sm shadow-md"
              >
                {batchOverrideMutation.isPending ? 'Resetting...' : 'Yes, Reset Overrides'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default SecurityMatrixPage
