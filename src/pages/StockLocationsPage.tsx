import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Edit2,
  X,
  Boxes,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import {
  listStockLocationsPaginated,
  listBranchesForLocation,
  listWarehousesForLocation,
  createStockLocation,
  updateStockLocation,
  toggleStockLocationStatus,
  deleteStockLocation,
  type StockLocationRow,
} from '../services/stockLocations'
import { getErrorMessage } from '../lib/errors'

interface LocationFormData {
  id?: string
  branch_id: string
  warehouse_id: string
  code: string
  name: string
  description: string
  is_active: boolean
}

const defaultFormData: LocationFormData = {
  branch_id: '',
  warehouse_id: '',
  code: '',
  name: '',
  description: '',
  is_active: true,
}

export const StockLocationsPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Filters & State ────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'inactive'>('active')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // ── Modal State ────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState<LocationFormData>(defaultFormData)
  const [isEditing, setIsEditing] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // ── Delete Confirmation ────────────────────────────────────────────────────
  const [locationToDelete, setLocationToDelete] = useState<StockLocationRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Lookups ────────────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['branches-for-location'],
    queryFn: () => listBranchesForLocation(),
  })

  const warehousesQuery = useQuery({
    queryKey: ['warehouses-for-location', branchFilter],
    queryFn: () => listWarehousesForLocation(branchFilter || undefined),
  })

  const modalWarehousesQuery = useQuery({
    queryKey: ['modal-warehouses', formData.branch_id],
    queryFn: () => listWarehousesForLocation(formData.branch_id || undefined),
    enabled: Boolean(formData.branch_id),
  })

  // ── Locations Query ────────────────────────────────────────────────────────
  const locationsQuery = useQuery({
    queryKey: [
      'stock-locations-paginated',
      appliedSearch,
      branchFilter,
      warehouseFilter,
      statusFilter,
      page,
    ],
    queryFn: () =>
      listStockLocationsPaginated({
        search: appliedSearch || undefined,
        branchId: branchFilter || undefined,
        warehouseId: warehouseFilter || undefined,
        status: statusFilter,
        page,
        pageSize,
      }),
  })

  const locationRows = locationsQuery.data?.rows ?? []
  const totalCount = locationsQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Auto-code suggestion
  const getNextLocationCode = () => {
    if (locationRows.length === 0) return 'LOC-001'
    const numericCodes = locationRows
      .map((l) => parseInt(l.code.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const maxNum = numericCodes.length > 0 ? Math.max(...numericCodes) : 0
    return `LOC-${String(maxNum + 1).padStart(3, '0')}`
  }

  const handleOpenAdd = () => {
    setIsEditing(false)
    const defaultBranchId = branchFilter || branchesQuery.data?.[0]?.id || ''
    setFormData({
      ...defaultFormData,
      branch_id: defaultBranchId,
      warehouse_id: warehouseFilter || '',
      code: getNextLocationCode(),
    })
    setModalError(null)
    setShowModal(true)
  }

  const handleOpenEdit = (loc: StockLocationRow) => {
    setIsEditing(true)
    setFormData({
      id: loc.id,
      branch_id: loc.branch_id,
      warehouse_id: loc.warehouse_id,
      code: loc.code,
      name: loc.name,
      description: loc.description || '',
      is_active: loc.is_active,
    })
    setModalError(null)
    setShowModal(true)
  }

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.branch_id) throw new Error('Please select a Branch.')
      if (!formData.warehouse_id) throw new Error('Please select a Warehouse.')
      if (!formData.name.trim()) throw new Error('Location Name is required.')

      if (isEditing && formData.id) {
        return updateStockLocation({
          id: formData.id,
          branch_id: formData.branch_id,
          warehouse_id: formData.warehouse_id,
          code: formData.code.trim() || undefined,
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          is_active: formData.is_active,
        })
      } else {
        return createStockLocation({
          branch_id: formData.branch_id,
          warehouse_id: formData.warehouse_id,
          code: formData.code.trim() || undefined,
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          is_active: formData.is_active,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-locations-paginated'] })
      notify(isEditing ? 'Stock location updated successfully' : 'Stock location added successfully')
      setShowModal(false)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteStockLocation(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-locations-paginated'] })
      setLocationToDelete(null)
      notify('Stock location deleted successfully')
    },
    onError: (err) => {
      setDeleteError(getErrorMessage(err))
    },
  })

  // Toggle Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: boolean }) => {
      return toggleStockLocationStatus(id, currentStatus)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-locations-paginated'] })
      notify('Status updated')
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
            Stock Location Details
          </h2>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
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
              ADD LOCATION
            </button>
          </div>
        </div>

        {/* Filter Dropdowns + Search Box on Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Branch Dropdown */}
          <select
            value={branchFilter}
            onChange={(e) => {
              setBranchFilter(e.target.value)
              setWarehouseFilter('')
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
            {branchesQuery.data?.map((b) => (
              <option key={b.id} value={b.id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Warehouse Dropdown */}
          <select
            value={warehouseFilter}
            onChange={(e) => {
              setWarehouseFilter(e.target.value)
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
            <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Warehouses</option>
            {warehousesQuery.data?.map((w) => (
              <option key={w.id} value={w.id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                {w.name} {w.code ? `(${w.code})` : ''}
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
              placeholder="Search Location"
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
                width: '220px',
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

      {/* ── Main Stock Locations Table ──────────────────────────────────────── */}
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
              <th style={{ padding: '12px 14px' }}>LOCATION NAME</th>
              <th style={{ padding: '12px 14px' }}>WAREHOUSE</th>
              <th style={{ padding: '12px 14px' }}>BRANCH</th>
              <th style={{ padding: '12px 14px' }}>DESCRIPTION</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', width: '120px' }}>CURRENT STOCK</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '110px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {locationsQuery.isLoading ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading stock locations...
                </td>
              </tr>
            ) : locationRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No stock locations found matching criteria.
                </td>
              </tr>
            ) : (
              locationRows.map((loc) => {
                const hasStock = (loc.total_stock_qty ?? 0) > 0
                return (
                  <tr
                    key={loc.id}
                    style={{
                      borderBottom: '1px solid #092f2b',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#082d29')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Code */}
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                      {loc.code}
                    </td>

                    {/* Location Name */}
                    <td style={{ padding: '12px 14px', color: '#e2e8f0', fontWeight: 600 }}>
                      {loc.name}
                    </td>

                    {/* Warehouse */}
                    <td style={{ padding: '12px 14px', color: '#38d4c5' }}>
                      {loc.warehouse_name}
                    </td>

                    {/* Branch */}
                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                      {loc.branch_name}
                    </td>

                    {/* Description */}
                    <td style={{ padding: '12px 14px', color: '#94a3b8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {loc.description || '-'}
                    </td>

                    {/* Current Stock */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      {hasStock ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: '#0c3a35',
                            color: '#38d4c5',
                            border: '1px solid #185a52',
                          }}
                        >
                          <Boxes size={11} /> {loc.total_stock_qty} units
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>0 units</span>
                      )}
                    </td>

                    {/* Status Capsule */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        title="Click to toggle status"
                        onClick={() => toggleStatusMutation.mutate({ id: loc.id, currentStatus: loc.is_active })}
                        style={{
                          display: 'inline-block',
                          padding: '3px 12px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          backgroundColor: loc.is_active ? '#065f46' : '#7f1d1d',
                          color: loc.is_active ? '#34d399' : '#f87171',
                          border: `1px solid ${loc.is_active ? '#059669' : '#b91c1c'}`,
                          cursor: 'pointer',
                        }}
                      >
                        {loc.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        {/* View Stock in Location */}
                        <button
                          type="button"
                          title="View current stock in this location"
                          onClick={() =>
                            navigate(
                              `/inventory/current-stock?branch=${loc.branch_id}&warehouse=${loc.warehouse_id}&location=${loc.id}`
                            )
                          }
                          style={{
                            backgroundColor: '#0e7472',
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
                          <ArrowRight size={13} />
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          title="Edit Location"
                          onClick={() => handleOpenEdit(loc)}
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
                          title="Delete Location"
                          onClick={() => {
                            setDeleteError(null)
                            setLocationToDelete(loc)
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
                )
              })
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
            Showing {locationRows.length} of {totalCount} locations
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

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #164e48',
              borderRadius: '6px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                backgroundColor: '#031413',
                borderBottom: '1px solid #144743',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                {isEditing ? 'Edit Stock Location' : 'Add Stock Location'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                saveMutation.mutate()
              }}
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {modalError && (
                <div
                  style={{
                    backgroundColor: '#7f1d1d',
                    border: '1px solid #ef4444',
                    color: '#ffffff',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  {modalError}
                </div>
              )}

              {/* Branch */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#38d4c5', marginBottom: '4px' }}>
                  BRANCH *
                </label>
                <select
                  value={formData.branch_id}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      branch_id: e.target.value,
                      warehouse_id: '',
                    }))
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '8px 12px',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                  required
                >
                  <option value="">-- Select Branch --</option>
                  {branchesQuery.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#38d4c5', marginBottom: '4px' }}>
                  WAREHOUSE *
                </label>
                <select
                  value={formData.warehouse_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, warehouse_id: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '8px 12px',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                  required
                  disabled={!formData.branch_id}
                >
                  <option value="">-- Select Warehouse --</option>
                  {modalWarehousesQuery.data?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.code ? `(${w.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Code */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#38d4c5' }}>LOCATION CODE</label>
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, code: getNextLocationCode() }))}
                      style={{ background: 'none', border: 'none', color: '#00b4d8', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Auto
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="e.g. LOC-001"
                  value={formData.code}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '8px 12px',
                    fontSize: '12px',
                    outline: 'none',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#38d4c5', marginBottom: '4px' }}>
                  LOCATION NAME *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rack A Shelf 1, Display Bin"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '8px 12px',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#38d4c5', marginBottom: '4px' }}>
                  DESCRIPTION
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional description or storage notes..."
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '8px 12px',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Active Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="loc_modal_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="loc_modal_active" style={{ fontSize: '12px', color: '#ffffff', cursor: 'pointer' }}>
                  Active
                </label>
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: '#144743',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '7px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '7px 18px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0, 180, 216, 0.4)',
                  }}
                >
                  {saveMutation.isPending ? 'Saving...' : isEditing ? 'UPDATE' : 'SAVE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────────────────── */}
      {locationToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #b91c1c',
              borderRadius: '6px',
              maxWidth: '440px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', marginBottom: '12px' }}>
              <AlertTriangle size={20} />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                Delete Stock Location?
              </h3>
            </div>

            <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>
              Are you sure you want to delete stock location{' '}
              <strong style={{ color: '#ffffff' }}>
                {locationToDelete.name} ({locationToDelete.code})
              </strong>
              ?
            </p>

            {locationToDelete.total_stock_qty && locationToDelete.total_stock_qty > 0 ? (
              <div
                style={{
                  backgroundColor: '#7f1d1d',
                  border: '1px solid #ef4444',
                  color: '#ffffff',
                  padding: '10px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginTop: '12px',
                }}
              >
                Warning: This location still contains {locationToDelete.total_stock_qty} stock units.
              </div>
            ) : null}

            {deleteError && (
              <div
                style={{
                  backgroundColor: '#7f1d1d',
                  border: '1px solid #ef4444',
                  color: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginTop: '12px',
                }}
              >
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setLocationToDelete(null)}
                style={{
                  backgroundColor: '#144743',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(locationToDelete.id)}
                style={{
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '7px 18px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
