import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UserCheck, RefreshCw, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { listLookup } from '../services/masterData'
import { fetchUserPrivilegeMatrix, toggleUserPermissionOverride } from '../services/adminService'

export const SecurityMatrixPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [activeModuleFilter, setActiveModuleFilter] = useState<string>('all')

  // Load profiles / staff users
  const { data: users = [] } = useQuery({
    queryKey: ['lookup', 'profiles'],
    queryFn: async () => {
      const list = await listLookup('customers', 'name') // generic lookup fallback or profiles
      return list || []
    },
  })

  // Load privilege matrix for selected user
  const { data: matrix = [], isLoading: loadingMatrix, refetch } = useQuery({
    queryKey: ['security-matrix', selectedUserId],
    queryFn: () => fetchUserPrivilegeMatrix(selectedUserId),
    enabled: !!selectedUserId,
  })

  const overrideMutation = useMutation({
    mutationFn: async ({ permissionId, isAllowed }: { permissionId: string; isAllowed: boolean | null }) => {
      await toggleUserPermissionOverride(selectedUserId, permissionId, isAllowed)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-matrix', selectedUserId] })
    },
  })

  const modules = Array.from(new Set(matrix.map((row) => row.module)))

  const filteredMatrix = matrix.filter((row) => {
    if (activeModuleFilter === 'all') return true
    return row.module === activeModuleFilter
  })

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Granular User Privilege Matrix</h1>
            <p className="text-sm text-gray-500">Manage user-level permission overrides (Page Rights, Control Rights, Report Rights)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Select Staff User:</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">-- Choose User --</option>

            {/* Default system user option if lookup is populating */}
            <option value="00000000-0000-0000-0000-000000000000">System Admin / Default Staff</option>

            {users.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>

          {selectedUserId && (
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-600 hover:text-indigo-600 rounded-lg hover:bg-gray-100"
              title="Refresh Matrix"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {!selectedUserId ? (
        <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-gray-100">
          <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-700">No User Selected</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
            Please select a staff member from the dropdown above to view and configure their specific granular privileges.
          </p>
        </div>
      ) : loadingMatrix ? (
        <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-gray-100 text-gray-500">
          Loading permission matrix...
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Module Filters */}
          <div className="flex items-center gap-2 p-4 border-b border-gray-100 overflow-x-auto bg-gray-50/50">
            <button
              onClick={() => setActiveModuleFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeModuleFilter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              All Modules ({matrix.length})
            </button>
            {modules.map((mod) => {
              const count = matrix.filter((r) => r.module === mod).length
              return (
                <button
                  key={mod}
                  onClick={() => setActiveModuleFilter(mod)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    activeModuleFilter === mod
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {mod} ({count})
                </button>
              )
            })}
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Module</th>
                  <th className="px-6 py-3">Permission Key / Right</th>
                  <th className="px-6 py-3 text-center">Role Default</th>
                  <th className="px-6 py-3 text-center">User Override</th>
                  <th className="px-6 py-3 text-center">Effective Right</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMatrix.map((row) => (
                  <tr key={row.permission_id} className="hover:bg-gray-50/80">
                    <td className="px-6 py-3.5 font-medium text-indigo-600 capitalize">{row.module}</td>
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-gray-900">{row.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{row.permission_key}</div>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {row.role_allowed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Allowed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                          <XCircle className="w-3.5 h-3.5" /> Denied
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {row.user_override === true ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" /> Granted
                        </span>
                      ) : row.user_override === false ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" /> Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <MinusCircle className="w-3.5 h-3.5" /> Inherited
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {row.effective_allowed ? (
                        <span className="inline-block w-3 h-3 bg-emerald-500 rounded-full shadow-sm" title="Active (Granted)" />
                      ) : (
                        <span className="inline-block w-3 h-3 bg-gray-300 rounded-full" title="Inactive (Denied)" />
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => overrideMutation.mutate({ permissionId: row.permission_id, isAllowed: true })}
                        disabled={overrideMutation.isPending}
                        className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs font-semibold"
                      >
                        Grant
                      </button>
                      <button
                        onClick={() => overrideMutation.mutate({ permissionId: row.permission_id, isAllowed: false })}
                        disabled={overrideMutation.isPending}
                        className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs font-semibold"
                      >
                        Revoke
                      </button>
                      <button
                        onClick={() => overrideMutation.mutate({ permissionId: row.permission_id, isAllowed: null })}
                        disabled={overrideMutation.isPending}
                        className="px-2.5 py-1 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded text-xs font-semibold"
                      >
                        Inherit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
