import { useQuery } from '@tanstack/react-query'
import {
  Download,
  Package,
  Layers,
  AlertTriangle,
  DollarSign,
  ShoppingCart,
  PlusCircle,
  History,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { permissions } from '../config/permissions'
import { formatLkr } from '../lib/currency'
import { listCurrentStock, listLowStock } from '../services/inventory'
import { listLookup } from '../services/masterData'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import type { CurrentStockRow } from '../types/inventory'

export function CurrentStockPage({ mode = 'current' }: { mode?: 'current' | 'low' | 'valuation' }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const currentBranchId = useBranchStore(s => s.branchId) ?? ''

  const urlBranch = searchParams.get('branch')
  const urlWarehouse = searchParams.get('warehouse')
  const urlLocation = searchParams.get('location')

  // ── Filter State ───────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [branch, setBranch] = useState(urlBranch || currentBranchId)
  const [warehouse, setWarehouse] = useState(urlWarehouse || '')
  const [location, setLocation] = useState(urlLocation || '')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [status, setStatus] = useState('')
  const [stockLevelTab, setStockLevelTab] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>(
    mode === 'low' ? 'low_stock' : 'all'
  )
  const [sort, setSort] = useState('product_name:asc')

  // Keep branch state in sync with global branch store if not manually changed or in URL
  useEffect(() => {
    if (urlBranch) {
      setBranch(urlBranch)
    } else if (currentBranchId && !branch) {
      setBranch(currentBranchId)
    }
  }, [currentBranchId, branch, urlBranch])

  useEffect(() => {
    if (urlWarehouse) setWarehouse(urlWarehouse)
    if (urlLocation) setLocation(urlLocation)
  }, [urlWarehouse, urlLocation])

  // ── Permissions ────────────────────────────────────────────────────────────
  const userPermissions = useAuthStore(s => s.user?.permissions)
  const canCost = userPermissions?.includes(permissions.inventoryViewCost) || userPermissions?.includes('products.view_cost')
  const canExport = userPermissions?.includes(permissions.inventoryExport)
  const canPurchase = userPermissions?.includes(permissions.purchasesCreate)
  const canSale = userPermissions?.includes(permissions.salesCreate)

  // ── Lookups ────────────────────────────────────────────────────────────────
  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  const effectiveBranch = branch || branches.data?.[0]?.value || ''

  const warehouses = useQuery({
    queryKey: ['lookup', 'warehouses', effectiveBranch],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: effectiveBranch, is_active: true }),
    enabled: Boolean(effectiveBranch),
  })

  const locations = useQuery({
    queryKey: ['lookup', 'locations', warehouse],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: warehouse, is_active: true }),
    enabled: Boolean(warehouse),
  })

  const categories = useQuery({
    queryKey: ['lookup', 'categories'],
    queryFn: () => listLookup('categories', 'name', { is_active: true }),
  })

  const brands = useQuery({
    queryKey: ['lookup', 'brands'],
    queryFn: () => listLookup('brands', 'name', { is_active: true }),
  })

  // ── Stock Query ────────────────────────────────────────────────────────────
  const pageSize = 40
  const [sortBy, sortDirection] = sort.split(':')
  const isLowStockOnly = stockLevelTab === 'low_stock' || mode === 'low'

  const filters = {
    search: appliedSearch,
    branchId: branch || undefined,
    warehouseId: warehouse || undefined,
    locationId: location || undefined,
    categoryId: category || undefined,
    brandId: brand || undefined,
    status: status || undefined,
    lowStock: isLowStockOnly,
    sortBy,
    sortAscending: sortDirection === 'asc',
    page,
    pageSize,
  }

  const stock = useQuery({
    queryKey: ['current-stock', mode, filters, stockLevelTab],
    queryFn: () => (isLowStockOnly ? listLowStock(filters) : listCurrentStock(filters)),
  })

  // Filter rows locally if 'in_stock' or 'out_of_stock' selected
  const displayedRows = useMemo(() => {
    const raw = stock.data?.rows ?? []
    if (stockLevelTab === 'in_stock') {
      return raw.filter(r => Number(r.available_quantity) > 0)
    }
    if (stockLevelTab === 'out_of_stock') {
      return raw.filter(r => Number(r.available_quantity) <= 0)
    }
    return raw
  }, [stock.data?.rows, stockLevelTab])

  // ── KPI Summary Totals ─────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const rows = stock.data?.rows ?? []
    let onHand = 0
    let available = 0
    let valuation = 0
    let lowCount = 0

    for (const r of rows) {
      onHand += Number(r.quantity_on_hand || 0)
      available += Number(r.available_quantity || 0)
      valuation += Number(r.inventory_value || 0)
      if (r.low_stock || (r.shortage_quantity && Number(r.shortage_quantity) > 0)) {
        lowCount++
      }
    }

    return {
      totalRecords: stock.data?.count ?? 0,
      onHand,
      available,
      valuation,
      lowCount,
    }
  }, [stock.data])

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const exportPage = () => {
    const rows = displayedRows
    const keys = [
      'product_code',
      'product_name',
      'variant_name',
      'sku',
      'barcode',
      'branch_name',
      'warehouse_name',
      'location_name',
      'quantity_on_hand',
      'reserved_quantity',
      'available_quantity',
      'retail_price',
      'weighted_average_cost',
      'inventory_value',
    ]
    const header = [
      'Product Code',
      'Product Name',
      'Variant',
      'SKU',
      'Barcode',
      'Branch',
      'Warehouse',
      'Location',
      'On Hand',
      'Reserved',
      'Available',
      'Retail Price',
      'Weighted Avg Cost',
      'Inventory Value',
    ]
    const csv = [
      header.join(','),
      ...rows.map(row => keys.map(key => JSON.stringify(row[key as keyof CurrentStockRow] ?? '')).join(',')),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `current-stock-${branch || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const totalCount = stock.data?.count ?? displayedRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
            Current Stock Details
          </h2>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {canPurchase && (
              <button
                type="button"
                onClick={() => navigate('/purchases/new')}
                style={{
                  backgroundColor: '#00b4d8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 20px',
                  fontWeight: 800,
                  fontSize: '12px',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
              >
                <PlusCircle size={14} />
                ADD STOCK
              </button>
            )}

            {canSale && (
              <button
                type="button"
                onClick={() => navigate('/sales/pos')}
                style={{
                  backgroundColor: '#0e7472',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 18px',
                  fontWeight: 800,
                  fontSize: '12px',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(14, 116, 114, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ShoppingCart size={14} />
                POS SALE
              </button>
            )}

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
              <History size={14} />
              Stock Movement
            </button>

            {canExport && (
              <button
                type="button"
                onClick={exportPage}
                disabled={!displayedRows.length}
                style={{
                  backgroundColor: '#0c2e2a',
                  border: '1px solid #164e48',
                  color: '#ffffff',
                  borderRadius: '4px',
                  padding: '8px 14px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: !displayedRows.length ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: !displayedRows.length ? 0.5 : 1,
                }}
              >
                <Download size={14} />
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Filter Dropdowns + Search Box on Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Branch Dropdown */}
          <select
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value)
              setWarehouse('')
              setLocation('')
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Branches</option>
            {branches.data?.map((b) => (
              <option key={b.value} value={b.value} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                {b.label}
              </option>
            ))}
          </select>

          {/* Warehouse Dropdown */}
          <select
            value={warehouse}
            onChange={(e) => {
              setWarehouse(e.target.value)
              setLocation('')
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Warehouses</option>
            {warehouses.data?.map((w) => (
              <option key={w.value} value={w.value} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                {w.label}
              </option>
            ))}
          </select>

          {/* Location Dropdown */}
          <select
            value={location}
            onChange={(e) => {
              setLocation(e.target.value)
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Locations</option>
            {locations.data?.map((l) => (
              <option key={l.value} value={l.value} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                {l.label}
              </option>
            ))}
          </select>

          {/* Stock Level Dropdown */}
          <select
            value={stockLevelTab}
            onChange={(e) => {
              setStockLevelTab(e.target.value as any)
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Stock Levels</option>
            <option value="in_stock" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>In Stock (&gt; 0)</option>
            <option value="low_stock" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Low Stock</option>
            <option value="out_of_stock" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Out of Stock</option>
          </select>

          {/* Category Dropdown */}
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Categories</option>
            {categories.data?.map((c) => (
              <option key={c.value} value={c.value} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Brand Dropdown */}
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value)
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Brands</option>
            {brands.data?.map((b) => (
              <option key={b.value} value={b.value} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                {b.label}
              </option>
            ))}
          </select>

          {/* Status Dropdown */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Statuses</option>
            <option value="active" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Active</option>
            <option value="inactive" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Inactive</option>
            <option value="discontinued" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Discontinued</option>
          </select>

          {/* Sort Dropdown */}
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="product_name:asc" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>A–Z</option>
            <option value="quantity_on_hand:desc" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>On Hand: High</option>
            <option value="available_quantity:desc" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Available: High</option>
            {canCost && (
              <option value="inventory_value:desc" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Value: High</option>
            )}
          </select>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => stock.refetch()}
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
            title="Refresh Stock"
          >
            <RefreshCw size={15} className={stock.isFetching ? 'animate-spin' : ''} />
          </button>

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
              placeholder="Search Stock..."
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
                padding: '8px 12px',
                fontSize: '13px',
                width: '180px',
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

      {/* ── Compact KPI Metrics Strip ───────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '4px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Package size={22} color="#38d4c5" />
          <div>
            <div style={{ fontSize: '10px', color: '#38d4c5', fontWeight: 800, letterSpacing: '0.05em' }}>
              TOTAL VARIANTS
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
              {summary.totalRecords}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '4px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Layers size={22} color="#00b4d8" />
          <div>
            <div style={{ fontSize: '10px', color: '#00b4d8', fontWeight: 800, letterSpacing: '0.05em' }}>
              ON HAND UNITS
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
              {summary.onHand.toLocaleString()}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '4px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <CheckCircle2 size={22} color="#34d399" />
          <div>
            <div style={{ fontSize: '10px', color: '#34d399', fontWeight: 800, letterSpacing: '0.05em' }}>
              AVAILABLE UNITS
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399' }}>
              {summary.available.toLocaleString()}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '4px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertTriangle size={22} color="#fcd34d" />
          <div>
            <div style={{ fontSize: '10px', color: '#fcd34d', fontWeight: 800, letterSpacing: '0.05em' }}>
              LOW STOCK ALERTS
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fcd34d' }}>
              {summary.lowCount}
            </div>
          </div>
        </div>

        {canCost && (
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '4px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <DollarSign size={22} color="#38d4c5" />
            <div>
              <div style={{ fontSize: '10px', color: '#38d4c5', fontWeight: 800, letterSpacing: '0.05em' }}>
                STOCK VALUATION
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                {formatLkr(summary.valuation)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Main Stock Table ────────────────────────────────────────────────── */}
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
              <th style={{ padding: '12px 14px' }}>PRODUCT NAME</th>
              <th style={{ padding: '12px 14px' }}>VARIANT / SKU</th>
              <th style={{ padding: '12px 14px' }}>LOCATION</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>ON HAND</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>AVAILABLE</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>RETAIL PRICE</th>
              {canCost && <th style={{ padding: '12px 14px', textAlign: 'right' }}>VALUE</th>}
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {stock.isLoading ? (
              <tr>
                <td colSpan={canCost ? 10 : 9} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading stock data...
                </td>
              </tr>
            ) : displayedRows.length === 0 ? (
              <tr>
                <td colSpan={canCost ? 10 : 9} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No stock records found matching criteria.
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => {
                const available = Number(row.available_quantity || 0)
                const onHand = Number(row.quantity_on_hand || 0)
                const reorder = Number(row.reorder_level || 0)
                const isLow = row.low_stock || (reorder > 0 && available <= reorder)
                const isOut = available <= 0

                return (
                  <tr
                    key={`${row.stock_location_id}-${row.product_variant_id}`}
                    style={{
                      borderBottom: '1px solid #092f2b',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#082d29')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Code */}
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#00b4d8', fontFamily: 'monospace' }}>
                      {row.product_code}
                    </td>

                    {/* Product Name */}
                    <td style={{ padding: '12px 14px', color: '#ffffff', fontWeight: 600 }}>
                      <div>{row.product_name}</div>
                      {row.category_name && (
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{row.category_name}</div>
                      )}
                    </td>

                    {/* Variant / SKU */}
                    <td style={{ padding: '12px 14px', color: '#e2e8f0' }}>
                      <div style={{ fontWeight: 500 }}>{row.variant_name || 'Standard'}</div>
                      <div style={{ fontSize: '10px', color: '#38d4c5', fontFamily: 'monospace' }}>
                        {row.sku || row.barcode || '-'}
                      </div>
                    </td>

                    {/* Location */}
                    <td style={{ padding: '12px 14px', color: '#e2e8f0' }}>
                      <div style={{ fontWeight: 600 }}>{row.branch_name}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                        {row.warehouse_name} · {row.location_name}
                      </div>
                    </td>

                    {/* On Hand */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                      {onHand.toFixed(row.decimal_places ?? 0)}
                    </td>

                    {/* Available */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace' }}>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '13px',
                          color: isOut ? '#f87171' : isLow ? '#fcd34d' : '#34d399',
                        }}
                      >
                        {available.toFixed(row.decimal_places ?? 0)}
                      </span>
                    </td>

                    {/* Retail Price */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#ffffff', fontWeight: 600, fontFamily: 'monospace' }}>
                      {formatLkr(row.retail_price)}
                    </td>

                    {/* Value */}
                    {canCost && (
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#38d4c5', fontWeight: 600, fontFamily: 'monospace' }}>
                        {formatLkr(Number(row.inventory_value ?? 0))}
                      </td>
                    )}

                    {/* Status Capsule */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          backgroundColor: isOut ? '#7f1d1d' : isLow ? '#78350f' : '#065f46',
                          color: isOut ? '#f87171' : isLow ? '#fcd34d' : '#34d399',
                          border: `1px solid ${isOut ? '#b91c1c' : isLow ? '#b45309' : '#059669'}`,
                        }}
                      >
                        {isOut ? 'OUT OF STOCK' : isLow ? 'LOW STOCK' : 'ACTIVE'}
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        {/* Buy / Purchase */}
                        {canPurchase && (
                          <button
                            type="button"
                            title="Create Purchase for this product"
                            onClick={() => navigate('/purchases/new')}
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
                              fontWeight: 800,
                              fontSize: '14px',
                            }}
                          >
                            +
                          </button>
                        )}

                        {/* Sell in POS */}
                        {canSale && (
                          <button
                            type="button"
                            title="Sell in POS"
                            onClick={() => navigate('/sales/pos')}
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
                            <ShoppingCart size={13} />
                          </button>
                        )}
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
            Showing {displayedRows.length} of {totalCount} stock records
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
    </div>
  )
}
