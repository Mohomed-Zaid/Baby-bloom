import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Edit2,
  X,
  Boxes,
  AlertTriangle,
  Download,
  Printer,
  Eye,
  RefreshCw,
  Layers,
  Package,
  CheckCircle2,
  Warehouse,
  History,
} from 'lucide-react'
import {
  listStockLocationsPaginated,
  listBranchesForLocation,
  listWarehousesForLocation,
  createStockLocation,
  updateStockLocation,
  toggleStockLocationStatus,
  deleteStockLocation,
  getStoredStockLocationsList,
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
  const [selectedLocationDetail, setSelectedLocationDetail] = useState<StockLocationRow | null>(null)
  const [printModalOpen, setPrintModalOpen] = useState(false)

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

  // ── Executive KPI Summary Totals ───────────────────────────────────────────
  const kpiSummary = useMemo(() => {
    let active = 0
    let inactive = 0
    let occupied = 0
    let empty = 0
    let totalUnits = 0

    for (const r of locationRows) {
      if (r.is_active) active++
      else inactive++

      const units = Number(r.total_stock_qty || 0)
      totalUnits += units
      if (units > 0) occupied++
      else empty++
    }

    return {
      total: totalCount || locationRows.length,
      active,
      inactive,
      occupied,
      empty,
      totalUnits,
    }
  }, [locationRows, totalCount])

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const rows = locationRows
    const headers = [
      'Location Code',
      'Location Name',
      'Warehouse',
      'Branch',
      'Description',
      'Stock Units',
      'Status',
    ]
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        JSON.stringify(r.code || ''),
        JSON.stringify(r.name || ''),
        JSON.stringify(r.warehouse_name || ''),
        JSON.stringify(r.branch_name || ''),
        JSON.stringify(r.description || ''),
        JSON.stringify(r.total_stock_qty || 0),
        JSON.stringify(r.is_active ? 'Active' : 'Inactive'),
      ].join(',')),
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stock-locations-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Auto-code suggestion
  const getNextLocationCode = () => {
    const list = getStoredStockLocationsList()
    const numericCodes = list
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

  // Auto-select warehouse when branch changes or modal opens
  React.useEffect(() => {
    if (showModal && !isEditing && modalWarehousesQuery.data && modalWarehousesQuery.data.length > 0) {
      if (!formData.warehouse_id || !modalWarehousesQuery.data.some(w => w.id === formData.warehouse_id)) {
        const firstWh = modalWarehousesQuery.data[0]
        if (firstWh) {
          setFormData((prev) => ({
            ...prev,
            warehouse_id: firstWh.id,
          }))
        }
      }
    }
  }, [showModal, isEditing, modalWarehousesQuery.data, formData.warehouse_id])

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }} className="no-print">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
              Stock Location Details
            </h2>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', backgroundColor: '#0e3b37', color: '#38d4c5', border: '1px solid #164e48' }}>
              Warehouse Bin Register
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#7aa5a0' }}>
            Live multi-warehouse bin management, storage rack allocations, capacity metrics, and stock distribution
          </p>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                backgroundColor: '#00b4d8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 18px',
                fontWeight: 800,
                fontSize: '12px',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              + ADD LOCATION
            </button>

            <button
              type="button"
              onClick={() => navigate('/inventory/current-stock')}
              style={{
                backgroundColor: '#0e7472',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 14px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Boxes size={14} /> Current Stock
            </button>

            <button
              type="button"
              onClick={() => navigate('/inventory/stock-movement')}
              style={{
                backgroundColor: '#0c2e2a',
                border: '1px solid #164e48',
                color: '#38d4c5',
                borderRadius: '4px',
                padding: '8px 14px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <History size={14} /> Stock Movement
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!locationRows.length}
              style={{
                backgroundColor: '#0c2e2a',
                border: '1px solid #164e48',
                color: '#ffffff',
                borderRadius: '4px',
                padding: '8px 14px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: !locationRows.length ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: !locationRows.length ? 0.5 : 1,
              }}
            >
              <Download size={14} /> Export CSV
            </button>

            <button
              type="button"
              onClick={() => setPrintModalOpen(true)}
              style={{
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
              }}
            >
              <Printer size={14} /> PRINT REGISTER
            </button>

            <button
              type="button"
              onClick={() => locationsQuery.refetch()}
              style={{
                backgroundColor: '#0c2e2a',
                border: '1px solid #164e48',
                color: '#38d4c5',
                borderRadius: '4px',
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Refresh Locations"
            >
              <RefreshCw size={15} className={locationsQuery.isFetching ? 'animate-spin' : ''} />
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
                width: '200px',
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

      {/* ── Executive KPI Metrics Strip ───────────────────────────────────────── */}
      <div
        className="no-print"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '6px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          <Warehouse size={22} color="#38d4c5" />
          <div>
            <div style={{ fontSize: '10px', color: '#38d4c5', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Total Locations / Bins
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
              {kpiSummary.total}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '6px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          <CheckCircle2 size={22} color="#34d399" />
          <div>
            <div style={{ fontSize: '10px', color: '#34d399', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Active Locations
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
              {kpiSummary.active}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '6px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          <Boxes size={22} color="#00b4d8" />
          <div>
            <div style={{ fontSize: '10px', color: '#00b4d8', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Occupied Bins
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#00b4d8', marginTop: '2px' }}>
              {kpiSummary.occupied}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '6px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          <Package size={22} color="#94a3b8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Empty (Available)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
              {kpiSummary.empty}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '6px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          <Layers size={22} color="#fb923c" />
          <div>
            <div style={{ fontSize: '10px', color: '#fb923c', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Stored Stock Units
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fb923c', marginTop: '2px' }}>
              {kpiSummary.totalUnits.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '6px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          <AlertTriangle size={22} color="#f87171" />
          <div>
            <div style={{ fontSize: '10px', color: '#f87171', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Inactive Bins
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
              {kpiSummary.inactive}
            </div>
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
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#38d4c5', fontFamily: 'monospace' }}>
                      <span
                        onClick={() => setSelectedLocationDetail(loc)}
                        style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(56,212,197,0.4)' }}
                        title="Click to inspect location specifications"
                      >
                        {loc.code}
                      </span>
                    </td>

                    {/* Location Name */}
                    <td style={{ padding: '12px 14px', color: '#ffffff', fontWeight: 600 }}>
                      <div
                        onClick={() => setSelectedLocationDetail(loc)}
                        style={{ cursor: 'pointer' }}
                        title="Click to inspect location specifications"
                      >
                        <span>{loc.name}</span>
                      </div>
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
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
                        {/* Quick View */}
                        <button
                          type="button"
                          title="View location specifications"
                          onClick={() => setSelectedLocationDetail(loc)}
                          style={{
                            backgroundColor: '#0f766e',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 7px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(15, 118, 110, 0.3)',
                          }}
                        >
                          <Eye size={13} />
                        </button>

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
                            borderRadius: '4px',
                            padding: '5px 7px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(14, 116, 114, 0.3)',
                          }}
                        >
                          <Boxes size={13} />
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
                            borderRadius: '4px',
                            padding: '5px 7px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0, 180, 216, 0.3)',
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
                            borderRadius: '4px',
                            padding: '5px 7px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          <X size={13} />
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

      {/* ── Quick Stock Location Inspector Modal ────────────────────────────── */}
      {selectedLocationDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setSelectedLocationDetail(null)}
        >
          <div
            style={{
              backgroundColor: '#072421',
              border: '1px solid #164e48',
              borderRadius: '10px',
              width: '640px',
              maxWidth: '96vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              color: '#ffffff',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #164e48',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                backgroundColor: '#051b19',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      backgroundColor: '#09332e',
                      border: '1px solid #164e48',
                      color: '#5eead4',
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                    }}
                  >
                    {selectedLocationDetail.code}
                  </span>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                    {selectedLocationDetail.name}
                  </h3>
                  <span
                    style={{
                      backgroundColor: selectedLocationDetail.is_active ? '#065f46' : '#7f1d1d',
                      color: selectedLocationDetail.is_active ? '#34d399' : '#f87171',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '10px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      border: `1px solid ${selectedLocationDetail.is_active ? '#059669' : '#b91c1c'}`,
                    }}
                  >
                    {selectedLocationDetail.is_active ? 'ACTIVE BIN' : 'INACTIVE'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#7aa5a0', marginTop: '4px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span>Warehouse: <strong style={{ color: '#ffffff' }}>{selectedLocationDetail.warehouse_name}</strong></span>
                  <span>•</span>
                  <span>Branch: <strong style={{ color: '#ffffff' }}>{selectedLocationDetail.branch_name}</strong></span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLocationDetail(null)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#7aa5a0',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Row 1: Stock Counters */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '8px', padding: '12px 14px' }}>
                  <span style={{ fontSize: '10px', color: '#38d4c5', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    Stored Stock Units
                  </span>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#38d4c5', marginTop: '4px', fontFamily: 'monospace' }}>
                    {Number(selectedLocationDetail.total_stock_qty || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '10px', color: '#7aa5a0', marginTop: '2px' }}>Physical inventory count</div>
                </div>

                <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '8px', padding: '12px 14px' }}>
                  <span style={{ fontSize: '10px', color: '#00b4d8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    Occupancy State
                  </span>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: (selectedLocationDetail.total_stock_qty || 0) > 0 ? '#34d399' : '#94a3b8', marginTop: '8px' }}>
                    {(selectedLocationDetail.total_stock_qty || 0) > 0 ? 'OCCUPIED' : 'EMPTY & READY'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#7aa5a0', marginTop: '4px' }}>
                    {(selectedLocationDetail.total_stock_qty || 0) > 0 ? 'Contains active units' : 'No items allocated'}
                  </div>
                </div>

                <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '8px', padding: '12px 14px' }}>
                  <span style={{ fontSize: '10px', color: '#fb923c', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    Distinct SKUs Housed
                  </span>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#fb923c', marginTop: '4px', fontFamily: 'monospace' }}>
                    {selectedLocationDetail.total_skus ?? ((selectedLocationDetail.total_stock_qty || 0) > 0 ? 1 : 0)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#7aa5a0', marginTop: '2px' }}>Assorted item variants</div>
                </div>
              </div>

              {/* Row 2: Location Specifications */}
              <div style={{ backgroundColor: '#051b19', border: '1px solid #144743', borderRadius: '8px', padding: '14px 16px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 800, color: '#38d4c5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Storage Bay Specifications
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Location Code:</span>
                    <strong style={{ color: '#38d4c5', fontFamily: 'monospace' }}>{selectedLocationDetail.code}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Location Name:</span>
                    <strong style={{ color: '#ffffff' }}>{selectedLocationDetail.name}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Warehouse Facility:</span>
                    <strong style={{ color: '#ffffff' }}>{selectedLocationDetail.warehouse_name}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Operating Branch:</span>
                    <strong style={{ color: '#ffffff' }}>{selectedLocationDetail.branch_name}</strong>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed #144743', marginTop: '12px', paddingTop: '10px' }}>
                  <span style={{ color: '#7aa5a0', fontSize: '11px', display: 'block' }}>Bay Notes / Description:</span>
                  <p style={{ margin: '4px 0 0', color: '#cbd5e1', fontSize: '12px', lineHeight: '1.4' }}>
                    {selectedLocationDetail.description || 'Standard warehouse storage rack / bin'}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #164e48',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#051b19',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const loc = selectedLocationDetail
                    setSelectedLocationDetail(null)
                    navigate(`/inventory/current-stock?branch=${loc.branch_id}&warehouse=${loc.warehouse_id}&location=${loc.id}`)
                  }}
                  style={{
                    backgroundColor: '#0e7472',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Boxes size={14} /> View Stock in Location
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const loc = selectedLocationDetail
                    setSelectedLocationDetail(null)
                    handleOpenEdit(loc)
                  }}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Edit2 size={14} /> Edit Location
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLocationDetail(null)}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Printable Stock Locations Register Modal ────────────────────────── */}
      {printModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px',
            overflowY: 'auto',
          }}
        >
          {/* Top screen-only toolbar */}
          <div
            className="no-print"
            style={{
              width: '210mm',
              maxWidth: '96vw',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#072421',
              border: '1px solid #164e48',
              borderRadius: '8px',
              padding: '12px 18px',
              marginBottom: '16px',
              color: '#ffffff',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Master Stock Locations Register</h3>
              <span style={{ fontSize: '11px', color: '#7aa5a0' }}>A4 Layout Preview ({locationRows.length} Locations Listed)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  backgroundColor: '#00c853',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Printer size={15} /> Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Close Preview
              </button>
            </div>
          </div>

          {/* Printable Document Container */}
          <div
            id="stock-locations-printable"
            style={{
              width: '210mm',
              maxWidth: '96vw',
              backgroundColor: '#ffffff',
              color: '#000000',
              padding: '15mm',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              borderRadius: '4px',
              fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            }}
          >
            {/* Header Letterhead */}
            <div style={{ borderBottom: '2px solid #000000', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, letterSpacing: '-0.02em', color: '#042f2e' }}>
                  BABY BLOOM
                </h1>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                  Premium Infant & Children Apparel & Nursery Equipment
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  No. 123 Galle Road, Colombo 03, Sri Lanka • Hotline: +94 11 234 5678 • info@babybloom.lk
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Warehouse Locations & Bin Register
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                  Ref: LOC-REG-{new Date().getFullYear()}-{Math.floor(Date.now() / 1000).toString().slice(-4)}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB')}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Scope: {branchFilter ? (branchesQuery.data?.find(b => b.id === branchFilter)?.name || branchFilter) : 'All Branches'}
                </div>
              </div>
            </div>

            {/* Executive Summary Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '16px', backgroundColor: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Total Bins</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{kpiSummary.total}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Active</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#16a34a' }}>{kpiSummary.active}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Occupied</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0284c7' }}>{kpiSummary.occupied}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Empty</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#64748b' }}>{kpiSummary.empty}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Stored Units</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#ea580c' }}>{kpiSummary.totalUnits.toLocaleString()}</div>
              </div>
            </div>

            {/* Locations Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f766e', color: '#ffffff' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '25px' }}>#</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '80px' }}>CODE</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>LOCATION NAME</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '120px' }}>WAREHOUSE</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '120px' }}>BRANCH</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>DESCRIPTION</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '85px' }}>STORED UNITS</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '60px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {locationRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      No stock location records found.
                    </td>
                  </tr>
                ) : (
                  locationRows.map((loc, idx) => {
                    const units = Number(loc.total_stock_qty || 0)
                    return (
                      <tr key={loc.id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700 }}>{loc.code}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{loc.name}</td>
                        <td style={{ padding: '6px 8px', color: '#475569' }}>{loc.warehouse_name}</td>
                        <td style={{ padding: '6px 8px', color: '#475569' }}>{loc.branch_name}</td>
                        <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '9px' }}>{loc.description || '-'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: units > 0 ? '#0f766e' : '#64748b' }}>
                          {units > 0 ? `${units.toLocaleString()} units` : 'Empty (0)'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '8px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '3px',
                              backgroundColor: loc.is_active ? '#dcfce7' : '#fee2e2',
                              color: loc.is_active ? '#15803d' : '#b91c1c',
                            }}
                          >
                            {loc.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>

            {/* Sign-off Blocks */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', fontSize: '10px', color: '#475569' }}>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Warehouse Superintendent</strong>
                <div>Storage Allocation Verification</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Inventory Control Manager</strong>
                <div>Location Audit & Approved</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Head of Supply Chain</strong>
                <div>Executive Authorization</div>
              </div>
            </div>

            <div style={{ marginTop: '14px', fontSize: '9px', color: '#94a3b8', textAlign: 'center' }}>
              This is a system generated Master Stock Location Register. Confidential & Proprietary to Baby Bloom (Pvt) Ltd.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
