import { useQuery } from '@tanstack/react-query'
import {
  Download,
  Package,
  Layers,
  AlertTriangle,
  ShoppingCart,
  PlusCircle,
  History,
  RefreshCw,
  Search,
  CheckCircle2,
  Printer,
  Eye,
  X,
  SlidersHorizontal,
  Clock,
  TrendingUp,
  Boxes,
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

  // ── Filter & Modal State ───────────────────────────────────────────────────
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
  const [selectedStockRow, setSelectedStockRow] = useState<CurrentStockRow | null>(null)
  const [printModalOpen, setPrintModalOpen] = useState(false)

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
    let reserved = 0
    let valuation = 0
    let retailValuation = 0
    let lowCount = 0
    let outCount = 0

    for (const r of rows) {
      const oh = Number(r.quantity_on_hand || 0)
      const av = Number(r.available_quantity || 0)
      const res = Number(r.reserved_quantity ?? (oh - av > 0 ? oh - av : 0))
      onHand += oh
      available += av
      reserved += res
      valuation += Number(r.inventory_value || 0)
      retailValuation += oh * Number(r.retail_price || 0)
      if (r.low_stock || (r.shortage_quantity && Number(r.shortage_quantity) > 0) || (r.reorder_level > 0 && av <= r.reorder_level)) {
        lowCount++
      }
      if (av <= 0) {
        outCount++
      }
    }

    return {
      totalRecords: stock.data?.count ?? rows.length,
      onHand,
      available,
      reserved,
      valuation,
      retailValuation,
      lowCount,
      outCount,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }} className="no-print">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
              Current Stock Details
            </h2>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', backgroundColor: '#0e3b37', color: '#38d4c5', border: '1px solid #164e48' }}>
              Master Stock Register
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#7aa5a0' }}>
            Live multi-warehouse inventory balances, reserved units, stock valuation, and automated reorder alerts
          </p>
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
                  padding: '8px 16px',
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
                <PlusCircle size={14} />
                ADD STOCK
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/inventory/stock-adjustment')}
              style={{
                backgroundColor: '#7c3aed',
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
                boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
              }}
            >
              <SlidersHorizontal size={14} />
              Stock Adjustment
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
              <History size={14} />
              Stock Movement
            </button>

            <button
              type="button"
              onClick={() => navigate('/inventory/products')}
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
              <Boxes size={14} />
              Product Details
            </button>

            {canSale && (
              <button
                type="button"
                onClick={() => navigate('/sales/pos')}
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
                <ShoppingCart size={14} />
                POS Sale
              </button>
            )}

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
              <Printer size={14} />
              PRINT STOCK REPORT
            </button>
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
        className="no-print"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <Package size={22} color="#38d4c5" />
          <div>
            <div style={{ fontSize: '10px', color: '#38d4c5', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Total SKUs
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
              {summary.totalRecords}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <Layers size={22} color="#00b4d8" />
          <div>
            <div style={{ fontSize: '10px', color: '#00b4d8', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              On Hand Units
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
              {summary.onHand.toLocaleString()}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <CheckCircle2 size={22} color="#34d399" />
          <div>
            <div style={{ fontSize: '10px', color: '#34d399', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Available for Sale
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
              {summary.available.toLocaleString()}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <Clock size={22} color="#fb923c" />
          <div>
            <div style={{ fontSize: '10px', color: '#fb923c', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Reserved Units
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fb923c', marginTop: '2px' }}>
              {summary.reserved.toLocaleString()}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <AlertTriangle size={22} color="#fcd34d" />
          <div>
            <div style={{ fontSize: '10px', color: '#fcd34d', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Low Stock Alerts
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fcd34d', marginTop: '2px' }}>
              {summary.lowCount}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <TrendingUp size={22} color="#38d4c5" />
          <div>
            <div style={{ fontSize: '10px', color: '#38d4c5', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Stock Valuation
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
              {canCost ? formatLkr(summary.valuation) : formatLkr(summary.retailValuation)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Stock Table ────────────────────────────────────────────────── */}
      <div
        className="no-print"
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
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>RESERVED</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>AVAILABLE</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>RETAIL PRICE</th>
              {canCost && <th style={{ padding: '12px 14px', textAlign: 'right' }}>VALUE</th>}
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '130px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {stock.isLoading ? (
              <tr>
                <td colSpan={canCost ? 11 : 10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading stock data...
                </td>
              </tr>
            ) : displayedRows.length === 0 ? (
              <tr>
                <td colSpan={canCost ? 11 : 10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No stock records found matching criteria.
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => {
                const available = Number(row.available_quantity || 0)
                const onHand = Number(row.quantity_on_hand || 0)
                const reserved = Number(row.reserved_quantity ?? (onHand - available > 0 ? onHand - available : 0))
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
                      <span
                        onClick={() => setSelectedStockRow(row)}
                        style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(0,180,216,0.4)' }}
                        title="Click to inspect live stock specifications"
                      >
                        {row.product_code}
                      </span>
                    </td>

                    {/* Product Name */}
                    <td style={{ padding: '12px 14px', color: '#ffffff', fontWeight: 600 }}>
                      <div
                        onClick={() => setSelectedStockRow(row)}
                        style={{ cursor: 'pointer' }}
                        title="Click to inspect live stock specifications"
                      >
                        <span style={{ color: '#ffffff' }}>{row.product_name}</span>
                        {row.category_name && (
                          <div style={{ fontSize: '10px', color: '#7aa5a0' }}>{row.category_name}</div>
                        )}
                      </div>
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

                    {/* Reserved */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '12px',
                          color: reserved > 0 ? '#fb923c' : '#64748b',
                        }}
                      >
                        {reserved.toFixed(row.decimal_places ?? 0)}
                      </span>
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
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
                        {/* Quick View Button (Teal) */}
                        <button
                          type="button"
                          title="View Live Stock Specifications"
                          onClick={() => setSelectedStockRow(row)}
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

                        {/* Stock Adjustment Button (Blue) */}
                        <button
                          type="button"
                          title="Adjust Stock for this Location"
                          onClick={() => navigate('/inventory/stock-adjustment')}
                          style={{
                            backgroundColor: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 7px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(2, 132, 199, 0.3)',
                          }}
                        >
                          <SlidersHorizontal size={13} />
                        </button>

                        {/* Stock Movement Button (Purple) */}
                        <button
                          type="button"
                          title="View Stock Movement Ledger"
                          onClick={() => navigate(`/inventory/stock-movement?search=${encodeURIComponent(row.product_code)}`)}
                          style={{
                            backgroundColor: '#7c3aed',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 7px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(124, 58, 237, 0.3)',
                          }}
                        >
                          <History size={13} />
                        </button>

                        {/* Sell in POS (Green) */}
                        {canSale && (
                          <button
                            type="button"
                            title="Sell in POS"
                            onClick={() => navigate('/sales/pos')}
                            style={{
                              backgroundColor: '#059669',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '5px 7px',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)',
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

      {/* ── Quick Stock Details Inspector Modal ──────────────────────────────── */}
      {selectedStockRow && (() => {
        const available = Number(selectedStockRow.available_quantity || 0)
        const onHand = Number(selectedStockRow.quantity_on_hand || 0)
        const reserved = Number(selectedStockRow.reserved_quantity ?? (onHand - available > 0 ? onHand - available : 0))
        const reorder = Number(selectedStockRow.reorder_level || 0)
        const isLow = selectedStockRow.low_stock || (reorder > 0 && available <= reorder)
        const isOut = available <= 0
        const costPrice = Number(selectedStockRow.weighted_average_cost || 0)
        const retailPrice = Number(selectedStockRow.retail_price || 0)
        const marginPct = (costPrice > 0 && retailPrice > costPrice)
          ? (((retailPrice - costPrice) / retailPrice) * 100).toFixed(1)
          : null

        return (
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
            onClick={() => setSelectedStockRow(null)}
          >
            <div
              style={{
                backgroundColor: '#072421',
                border: '1px solid #164e48',
                borderRadius: '10px',
                width: '740px',
                maxWidth: '96vw',
                maxHeight: '90vh',
                overflowY: 'auto',
                color: '#ffffff',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={e => e.stopPropagation()}
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
                      {selectedStockRow.product_code}
                    </span>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                      {selectedStockRow.product_name}
                    </h3>
                    <span
                      style={{
                        backgroundColor: isOut ? '#7f1d1d' : isLow ? '#78350f' : '#065f46',
                        color: isOut ? '#f87171' : isLow ? '#fcd34d' : '#34d399',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        border: `1px solid ${isOut ? '#b91c1c' : isLow ? '#b45309' : '#059669'}`,
                      }}
                    >
                      {isOut ? 'OUT OF STOCK' : isLow ? 'LOW STOCK' : 'IN STOCK'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#7aa5a0', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>Category: <strong style={{ color: '#ffffff' }}>{selectedStockRow.category_name || 'General'}</strong></span>
                    <span>•</span>
                    <span>Variant: <strong style={{ color: '#ffffff' }}>{selectedStockRow.variant_name || 'Standard'}</strong></span>
                    <span>•</span>
                    <span>SKU: <code style={{ color: '#38d4c5' }}>{selectedStockRow.sku || '-'}</code></span>
                    {selectedStockRow.barcode && (
                      <>
                        <span>•</span>
                        <span>Barcode: <code style={{ color: '#38d4c5' }}>{selectedStockRow.barcode}</code></span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStockRow(null)}
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
                    <span style={{ fontSize: '10px', color: '#34d399', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                      Available for Sale
                    </span>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#34d399', marginTop: '4px', fontFamily: 'monospace' }}>
                      {available.toFixed(selectedStockRow.decimal_places ?? 0)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#7aa5a0', marginTop: '2px' }}>Free to issue or sell</div>
                  </div>

                  <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '8px', padding: '12px 14px' }}>
                    <span style={{ fontSize: '10px', color: '#00b4d8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                      Physical On Hand
                    </span>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '4px', fontFamily: 'monospace' }}>
                      {onHand.toFixed(selectedStockRow.decimal_places ?? 0)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#7aa5a0', marginTop: '2px' }}>Physical inventory count</div>
                  </div>

                  <div style={{ backgroundColor: '#041c19', border: '1px solid #144743', borderRadius: '8px', padding: '12px 14px' }}>
                    <span style={{ fontSize: '10px', color: '#fb923c', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                      Reserved / Committed
                    </span>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#fb923c', marginTop: '4px', fontFamily: 'monospace' }}>
                      {reserved.toFixed(selectedStockRow.decimal_places ?? 0)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#7aa5a0', marginTop: '2px' }}>Orders & in-transit transfers</div>
                  </div>
                </div>

                {/* Row 2: Price Matrix & Valuation */}
                <div style={{ backgroundColor: '#051b19', border: '1px solid #144743', borderRadius: '8px', padding: '14px 16px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 800, color: '#38d4c5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Valuation & Pricing Metrics
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Retail Sales Price</span>
                      <strong style={{ color: '#ffffff', fontSize: '14px' }}>{formatLkr(retailPrice)}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Wholesale Price</span>
                      <strong style={{ color: '#ffffff', fontSize: '14px' }}>
                        {selectedStockRow.wholesale_price ? formatLkr(selectedStockRow.wholesale_price) : 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Weighted Avg Cost</span>
                      <strong style={{ color: '#cbd5e1', fontSize: '14px' }}>
                        {canCost ? (costPrice > 0 ? formatLkr(costPrice) : 'LKR 0.00') : '***'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Profit Margin</span>
                      <strong style={{ color: marginPct ? '#34d399' : '#94a3b8', fontSize: '14px' }}>
                        {marginPct ? `${marginPct}%` : 'N/A'}
                      </strong>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed #144743', marginTop: '12px', paddingTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    <div>
                      <span style={{ color: '#7aa5a0', fontSize: '11px' }}>Holding Inventory Value:</span>{' '}
                      <strong style={{ color: '#38d4c5', fontSize: '13px' }}>
                        {canCost ? formatLkr(Number(selectedStockRow.inventory_value || 0)) : '***'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#7aa5a0', fontSize: '11px' }}>Potential Retail Value:</span>{' '}
                      <strong style={{ color: '#34d399', fontSize: '13px' }}>
                        {formatLkr(onHand * retailPrice)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Row 3: Location & Reorder Controls */}
                <div style={{ backgroundColor: '#051b19', border: '1px solid #144743', borderRadius: '8px', padding: '14px 16px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 800, color: '#38d4c5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Warehouse & Reorder Parameters
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Branch</span>
                      <strong style={{ color: '#ffffff', fontSize: '13px' }}>{selectedStockRow.branch_name}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Warehouse</span>
                      <strong style={{ color: '#ffffff', fontSize: '13px' }}>{selectedStockRow.warehouse_name}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Bin Location</span>
                      <strong style={{ color: '#ffffff', fontSize: '13px' }}>{selectedStockRow.location_name}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#7aa5a0', display: 'block', fontSize: '11px' }}>Reorder Level</span>
                      <strong style={{ color: isLow ? '#fcd34d' : '#ffffff', fontSize: '13px' }}>
                        {selectedStockRow.reorder_level ?? 0} units
                      </strong>
                    </div>
                  </div>

                  <div style={{ marginTop: '10px', display: 'flex', gap: '16px', fontSize: '11px', color: '#7aa5a0' }}>
                    <span>Minimum Stock: <strong style={{ color: '#ffffff' }}>{selectedStockRow.minimum_stock ?? 0}</strong></span>
                    <span>•</span>
                    <span>Preferred Supplier: <strong style={{ color: '#ffffff' }}>{selectedStockRow.preferred_vendor_name || 'Direct Procurement'}</strong></span>
                    {selectedStockRow.shortage_quantity && selectedStockRow.shortage_quantity > 0 && (
                      <>
                        <span>•</span>
                        <span style={{ color: '#f87171', fontWeight: 700 }}>
                          Deficit / Shortage: {selectedStockRow.shortage_quantity} units
                        </span>
                      </>
                    )}
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
                      const code = selectedStockRow.product_code
                      setSelectedStockRow(null)
                      navigate(`/inventory/stock-movement?search=${encodeURIComponent(code)}`)
                    }}
                    style={{
                      backgroundColor: '#7c3aed',
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
                    <History size={14} /> Movement Ledger
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStockRow(null)
                      navigate('/inventory/stock-adjustment')
                    }}
                    style={{
                      backgroundColor: '#0284c7',
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
                    <SlidersHorizontal size={14} /> Adjust Stock
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const pid = selectedStockRow.product_id
                      setSelectedStockRow(null)
                      navigate(`/inventory/products/${pid}`)
                    }}
                    style={{
                      backgroundColor: '#0d9488',
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
                    <Boxes size={14} /> Product Details
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {canSale && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStockRow(null)
                        navigate('/sales/pos')
                      }}
                      style={{
                        backgroundColor: '#059669',
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
                      <ShoppingCart size={14} /> Sell in POS
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedStockRow(null)}
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
          </div>
        )
      })()}

      {/* ── Printable Stock Audit Report Modal ──────────────────────────────── */}
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
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Master Current Stock Audit Report</h3>
              <span style={{ fontSize: '11px', color: '#7aa5a0' }}>A4 Layout Preview ({displayedRows.length} Items Listed)</span>
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
            id="current-stock-printable"
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
                  Current Stock Audit Report
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                  Ref: STK-AUD-{new Date().getFullYear()}-{Math.floor(Date.now() / 1000).toString().slice(-4)}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB')}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Branch: {branch ? (branches.data?.find(b => b.value === branch)?.label || branch) : 'All Branches'}
                </div>
              </div>
            </div>

            {/* Executive Summary Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '16px', backgroundColor: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Total Items</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{displayedRows.length}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>On Hand</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{summary.onHand.toLocaleString()}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Available</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#16a34a' }}>{summary.available.toLocaleString()}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Reserved</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#ea580c' }}>{summary.reserved.toLocaleString()}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Valuation</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0284c7' }}>
                  {canCost ? formatLkr(summary.valuation) : formatLkr(summary.retailValuation)}
                </div>
              </div>
            </div>

            {/* Stock Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f766e', color: '#ffffff' }}>
                  <th style={{ padding: '6px 6px', textAlign: 'center', width: '25px' }}>#</th>
                  <th style={{ padding: '6px 6px', textAlign: 'left', width: '65px' }}>CODE</th>
                  <th style={{ padding: '6px 6px', textAlign: 'left' }}>PRODUCT NAME & VARIANT</th>
                  <th style={{ padding: '6px 6px', textAlign: 'left', width: '90px' }}>SKU / BARCODE</th>
                  <th style={{ padding: '6px 6px', textAlign: 'left', width: '95px' }}>LOCATION</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', width: '50px' }}>ON HAND</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', width: '50px' }}>RESERVED</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', width: '55px' }}>AVAILABLE</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', width: '65px' }}>RETAIL (LKR)</th>
                  {canCost && <th style={{ padding: '6px 6px', textAlign: 'right', width: '70px' }}>VALUE (LKR)</th>}
                  <th style={{ padding: '6px 6px', textAlign: 'center', width: '60px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={canCost ? 11 : 10} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      No current stock records matching query.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((r, idx) => {
                    const av = Number(r.available_quantity || 0)
                    const oh = Number(r.quantity_on_hand || 0)
                    const res = Number(r.reserved_quantity ?? (oh - av > 0 ? oh - av : 0))
                    const reorder = Number(r.reorder_level || 0)
                    const isLow = r.low_stock || (reorder > 0 && av <= reorder)
                    const isOut = av <= 0

                    return (
                      <tr key={`${r.stock_location_id}-${r.product_variant_id}`} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                        <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontWeight: 700 }}>{r.product_code}</td>
                        <td style={{ padding: '5px 6px' }}>
                          <span style={{ fontWeight: 600 }}>{r.product_name}</span>
                          {r.variant_name && r.variant_name !== 'Standard' && (
                            <span style={{ display: 'block', fontSize: '9px', color: '#64748b' }}>{r.variant_name}</span>
                          )}
                        </td>
                        <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontSize: '9px', color: '#475569' }}>
                          {r.sku || r.barcode || '-'}
                        </td>
                        <td style={{ padding: '5px 6px', color: '#475569', fontSize: '9px' }}>
                          <div>{r.branch_name}</div>
                          <div style={{ color: '#64748b' }}>{r.warehouse_name} · {r.location_name}</div>
                        </td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>{oh.toFixed(r.decimal_places ?? 0)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: res > 0 ? '#ea580c' : '#64748b' }}>{res.toFixed(r.decimal_places ?? 0)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: isOut ? '#dc2626' : isLow ? '#d97706' : '#15803d' }}>
                          {av.toFixed(r.decimal_places ?? 0)}
                        </td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: '#475569' }}>{Number(r.retail_price || 0).toFixed(2)}</td>
                        {canCost && (
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                            {Number(r.inventory_value || 0).toFixed(2)}
                          </td>
                        )}
                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '8px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: isOut ? '#fee2e2' : isLow ? '#fef3c7' : '#dcfce7',
                              color: isOut ? '#b91c1c' : isLow ? '#b45309' : '#15803d',
                            }}
                          >
                            {isOut ? 'OUT' : isLow ? 'LOW' : 'IN STOCK'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>

            {/* Verification Signatures */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', fontSize: '10px', color: '#475569' }}>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Stock Auditor / Warehouse Officer</strong>
                <div>Physical Balance Verification</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Inventory Control Manager</strong>
                <div>Stock Reconciled & Approved</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Chief Financial Officer</strong>
                <div>Executive Sign-off & Valuation</div>
              </div>
            </div>

            <div style={{ marginTop: '14px', fontSize: '9px', color: '#94a3b8', textAlign: 'center' }}>
              This is a system generated Current Stock Audit & Valuation Report. Confidential & Proprietary to Baby Bloom (Pvt) Ltd.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
