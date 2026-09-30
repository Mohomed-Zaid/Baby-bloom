import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Edit2,
  X,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import {
  listWarehousesPaginated,
  listBranchesForWarehouse,
  createWarehouse,
  updateWarehouse,
  toggleWarehouseStatus,
  softDeleteWarehouse,
  type WarehouseRow,
  type BranchOption,
} from '../services/warehouses'
import { getErrorMessage } from '../lib/errors'

interface WarehouseFormData {
  id?: string
  branch_id: string
  code: string
  name: string
  address: string
  is_default: boolean
  is_active: boolean
}

const defaultFormData: WarehouseFormData = {
  branch_id: '',
  code: '',
  name: '',
  address: '',
  is_default: false,
  is_active: true,
}

export const WarehousesPage: React.FC = () => {
  const queryClient = useQueryClient()

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'inactive'>('active')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState<WarehouseFormData>(defaultFormData)
  const [isEditing, setIsEditing] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // Load Branches
  const branchesQuery = useQuery({
    queryKey: ['branches-for-warehouse'],
    queryFn: () => listBranchesForWarehouse(),
  })

  // Load Warehouses Query
  const warehousesQuery = useQuery({
    queryKey: ['warehouses-paginated', appliedSearch, branchFilter, statusFilter, page],
    queryFn: () =>
      listWarehousesPaginated({
        search: appliedSearch || undefined,
        branchId: branchFilter || undefined,
        status: statusFilter,
        page,
        pageSize,
      }),
  })

  const warehouseRows = warehousesQuery.data?.rows ?? []
  const totalCount = warehousesQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Next Warehouse Code Auto-suggest
  const getNextWarehouseCode = () => {
    if (warehouseRows.length === 0) return '001'
    const numericCodes = warehouseRows
      .map((w) => parseInt(w.code.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const maxNum = numericCodes.length > 0 ? Math.max(...numericCodes) : 0
    return String(maxNum + 1).padStart(3, '0')
  }

  const handleOpenAdd = () => {
    setIsEditing(false)
    setFormData({
      ...defaultFormData,
      branch_id: branchesQuery.data?.[0]?.id || '',
      code: getNextWarehouseCode(),
    })
    setModalError(null)
    setShowModal(true)
  }

  const handleOpenEdit = (w: WarehouseRow) => {
    setIsEditing(true)
    setFormData({
      id: w.id,
      branch_id: w.branch_id,
      code: w.code,
      name: w.name,
      address: w.address || '',
      is_default: w.is_default,
      is_active: w.is_active,
    })
    setModalError(null)
    setShowModal(true)
  }

  // Save Mutation
  const saveWarehouseMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) {
        throw new Error('Warehouse Name is required.')
      }
      if (!formData.branch_id) {
        throw new Error('Please select a branch.')
      }

      if (isEditing && formData.id) {
        return updateWarehouse({
          id: formData.id,
          branch_id: formData.branch_id,
          code: formData.code.trim(),
          name: formData.name.trim(),
          address: formData.address.trim(),
          is_default: formData.is_default,
          is_active: formData.is_active,
        })
      } else {
        return createWarehouse({
          branch_id: formData.branch_id,
          code: formData.code.trim() || undefined,
          name: formData.name.trim(),
          address: formData.address.trim(),
          is_default: formData.is_default,
          is_active: formData.is_active,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses-paginated'] })
      notify(isEditing ? 'Warehouse updated successfully' : 'Warehouse registered successfully')
      setShowModal(false)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return softDeleteWarehouse(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses-paginated'] })
      notify('Warehouse deleted successfully')
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  // Toggle Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: boolean }) => {
      return toggleWarehouseStatus(id, currentStatus)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses-paginated'] })
      notify('Warehouse status updated successfully')
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  return (
    <div
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
        minHeight: 'calc(100vh - 80px)',
        color: '#e2e8f0',
        padding: '20px 24px',
        borderRadius: '8px',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
            Warehouse Details
          </h2>
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                backgroundColor: '#00b4d8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 22px',
                fontWeight: 800,
                fontSize: '12px',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
            >
              ADD WAREHOUSE
            </button>
          </div>
        </div>

        {/* Filter Controls on Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Branch Dropdown */}
          <select
            value={branchFilter}
            onChange={(e) => {
              setBranchFilter(e.target.value)
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 14px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Branches</option>
            {(branchesQuery.data ?? []).map((br: BranchOption) => (
              <option key={br.id} value={br.id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                {br.name}
              </option>
            ))}
          </select>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'active' | 'all' | 'inactive')
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 14px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="active" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Active</option>
            <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All</option>
            <option value="inactive" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Inactive</option>
          </select>

          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              overflow: 'hidden',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <input
              type="text"
              placeholder="Search Warehouse"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setAppliedSearch(searchTerm)
                  setPage(1)
                }
              }}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#ffffff',
                padding: '8px 14px',
                fontSize: '13px',
                width: '240px',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => {
                setAppliedSearch(searchTerm)
                setPage(1)
              }}
              style={{
                backgroundColor: '#13443e',
                border: 'none',
                color: '#94a3b8',
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Search size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Toast Banner ────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            backgroundColor: toast.isError ? '#7f1d1d' : '#064e3b',
            border: `1px solid ${toast.isError ? '#ef4444' : '#10b981'}`,
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Main Warehouse Table ─────────────────────────────────────────────── */}
      <div
        style={{
          border: '1px solid #144743',
          borderRadius: '4px',
          overflow: 'hidden',
          backgroundColor: '#041c19',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid #144743',
                backgroundColor: '#031413',
                color: '#38d4c5',
                fontWeight: 800,
                letterSpacing: '0.05em',
                fontSize: '11px',
              }}
            >
              <th style={{ padding: '12px 14px', width: '90px' }}>CODE</th>
              <th style={{ padding: '12px 14px' }}>WAREHOUSE NAME</th>
              <th style={{ padding: '12px 14px', width: '180px' }}>BRANCH</th>
              <th style={{ padding: '12px 14px' }}>ADDRESS</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>DEFAULT</th>
              <th style={{ padding: '12px 14px', width: '110px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {warehousesQuery.isLoading ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading warehouses...
                </td>
              </tr>
            ) : warehouseRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No warehouses found matching criteria.
                </td>
              </tr>
            ) : (
              warehouseRows.map((warehouse) => (
                <tr
                  key={warehouse.id}
                  style={{
                    borderBottom: '1px solid #092f2b',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#082d29')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Code */}
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#f8fafc' }}>
                    {warehouse.code}
                  </td>

                  {/* Name */}
                  <td style={{ padding: '12px 14px', color: '#e2e8f0', fontWeight: 600 }}>
                    {warehouse.name}
                  </td>

                  {/* Branch */}
                  <td style={{ padding: '12px 14px', color: '#38d4c5', fontWeight: 600 }}>
                    {warehouse.branch_name}
                  </td>

                  {/* Address */}
                  <td style={{ padding: '12px 14px', color: '#94a3b8', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {warehouse.address || '-'}
                  </td>

                  {/* Default Tag */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    {warehouse.is_default ? (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 800,
                          backgroundColor: '#0369a1',
                          color: '#e0f2fe',
                        }}
                      >
                        DEFAULT
                      </span>
                    ) : (
                      <span style={{ color: '#64748b' }}>-</span>
                    )}
                  </td>

                  {/* Status Capsule */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <button
                      type="button"
                      title="Click to toggle status"
                      onClick={() => toggleStatusMutation.mutate({ id: warehouse.id, currentStatus: warehouse.is_active })}
                      style={{
                        display: 'inline-block',
                        padding: '3px 12px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        backgroundColor: warehouse.is_active ? '#065f46' : '#7f1d1d',
                        color: warehouse.is_active ? '#34d399' : '#f87171',
                        border: `1px solid ${warehouse.is_active ? '#059669' : '#b91c1c'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {warehouse.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </button>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                      {/* Edit Button */}
                      <button
                        type="button"
                        title="Edit Warehouse"
                        onClick={() => handleOpenEdit(warehouse)}
                        style={{
                          backgroundColor: '#00b4d8',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '3px',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Edit2 size={13} />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        title="Delete Warehouse"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete warehouse "${warehouse.name}" (${warehouse.code})?`
                            )
                          ) {
                            deleteMutation.mutate(warehouse.id)
                          }
                        }}
                        style={{
                          backgroundColor: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '3px',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Pagination ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            backgroundColor: '#031413',
            borderTop: '1px solid #144743',
            fontSize: '12px',
            color: '#94a3b8',
          }}
        >
          <div>
            Showing {warehouseRows.length} of {totalCount} warehouses
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                backgroundColor: page <= 1 ? '#0c2e2a' : '#144743',
                color: page <= 1 ? '#475569' : '#ffffff',
                border: 'none',
                borderRadius: '3px',
                padding: '4px 10px',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              Prev
            </button>
            <span style={{ padding: '4px 8px', color: '#38d4c5', fontWeight: 700 }}>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                backgroundColor: page >= totalPages ? '#0c2e2a' : '#144743',
                color: page >= totalPages ? '#475569' : '#ffffff',
                border: 'none',
                borderRadius: '3px',
                padding: '4px 10px',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── WAREHOUSE REGISTRATION MODAL ────────────────────────────────────── */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #17534c',
              borderRadius: '6px',
              width: '680px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 180, 216, 0.1)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #144743',
                backgroundColor: '#031413',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em' }}>
                {isEditing ? 'UPDATE WAREHOUSE' : 'WAREHOUSE REGISTRATION'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Register / Update Button */}
                <button
                  type="button"
                  disabled={saveWarehouseMutation.isPending}
                  onClick={() => saveWarehouseMutation.mutate()}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 18px',
                    fontWeight: 800,
                    fontSize: '12px',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                  }}
                >
                  <FileText size={14} />
                  {saveWarehouseMutation.isPending ? 'SAVING...' : isEditing ? 'UPDATE' : 'REGISTER'}
                </button>

                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 18px',
                    fontWeight: 800,
                    fontSize: '12px',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                  }}
                >
                  CANCEL
                </button>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    marginLeft: '6px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Error Message if any */}
            {modalError && (
              <div
                style={{
                  margin: '16px 20px 0 20px',
                  padding: '10px 14px',
                  backgroundColor: '#450a0a',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                  color: '#fca5a5',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal Body */}
            <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Row 1: Code and Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                    WAREHOUSE CODE <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                    WAREHOUSE NAME <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Warehouse Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Row 2: Branch Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  BRANCH <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formData.branch_id}
                  onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Select Branch</option>
                  {(branchesQuery.data ?? []).map((br: BranchOption) => (
                    <option key={br.id} value={br.id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                      {br.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 3: Address */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  ADDRESS / LOCATION DETAILS
                </label>
                <textarea
                  rows={3}
                  placeholder="Address or location details of this warehouse..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Row 4: Flags */}
              <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    style={{ accentColor: '#00b4d8', width: '16px', height: '16px' }}
                  />
                  DEFAULT WAREHOUSE FOR THIS BRANCH
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    style={{ accentColor: '#00b4d8', width: '16px', height: '16px' }}
                  />
                  ACTIVE
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WarehousesPage
