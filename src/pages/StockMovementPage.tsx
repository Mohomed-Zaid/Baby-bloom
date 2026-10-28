import React, { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  History,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Download,
  Printer,
  X,
  Layers,
  RotateCcw,
  Eye,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Copy,
  Check,
  Boxes,
  FileText,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react'
import { permissions } from '../config/permissions'
import { formatLkr } from '../lib/currency'
import { colomboNow } from '../lib/dates'
import { listStockMovements } from '../services/inventory'
import { listLookup } from '../services/masterData'
import { requireSupabase } from '../services/client'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import type { StockMovementRow, StockMovementType } from '../types/inventory'

const MOVEMENT_TYPE_CONFIG: Record<
  string,
  { label: string; direction: 'in' | 'out' | 'transfer' | 'reversal'; color: string; badgeBg: string }
> = {
  purchase_in: { label: 'Purchase In', direction: 'in', color: 'text-emerald-400', badgeBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' },
  sale_return_in: { label: 'Sale Return In', direction: 'in', color: 'text-teal-400', badgeBg: 'bg-teal-500/20 border-teal-500/40 text-teal-300' },
  opening_stock: { label: 'Opening Stock', direction: 'in', color: 'text-cyan-400', badgeBg: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' },
  transfer_in: { label: 'Transfer In', direction: 'transfer', color: 'text-blue-400', badgeBg: 'bg-blue-500/20 border-blue-500/40 text-blue-300' },
  adjustment_in: { label: 'Adjustment (+)', direction: 'in', color: 'text-emerald-400', badgeBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' },
  stock_count_in: { label: 'Count Discrepancy (+)', direction: 'in', color: 'text-emerald-400', badgeBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' },
  reversal_in: { label: 'Reversal (+)', direction: 'reversal', color: 'text-purple-400', badgeBg: 'bg-purple-500/20 border-purple-500/40 text-purple-300' },
  sale_out: { label: 'POS / Sale Out', direction: 'out', color: 'text-sky-400', badgeBg: 'bg-sky-500/20 border-sky-500/40 text-sky-300' },
  purchase_return_out: { label: 'Purchase Return Out', direction: 'out', color: 'text-amber-400', badgeBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
  transfer_out: { label: 'Transfer Out', direction: 'transfer', color: 'text-blue-400', badgeBg: 'bg-blue-500/20 border-blue-500/40 text-blue-300' },
  adjustment_out: { label: 'Adjustment (-)', direction: 'out', color: 'text-orange-400', badgeBg: 'bg-orange-500/20 border-orange-500/40 text-orange-300' },
  damaged: { label: 'Damaged Stock Out', direction: 'out', color: 'text-rose-400', badgeBg: 'bg-rose-500/20 border-rose-500/40 text-rose-300' },
  write_off: { label: 'Stock Write-Off Out', direction: 'out', color: 'text-rose-500', badgeBg: 'bg-rose-600/20 border-rose-600/40 text-rose-300' },
  stock_count_out: { label: 'Count Discrepancy (-)', direction: 'out', color: 'text-amber-400', badgeBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
  reversal_out: { label: 'Reversal (-)', direction: 'reversal', color: 'text-purple-400', badgeBg: 'bg-purple-500/20 border-purple-500/40 text-purple-300' },
}

export function StockMovementPage() {
  const [searchParams] = useSearchParams()
  const globalBranchId = useBranchStore((s) => s.branchId)
  const userPermissions = useAuthStore((s) => s.user?.permissions)

  const canCost =
    userPermissions?.includes(permissions.inventoryViewCost) ||
    userPermissions?.includes('products.view_cost') ||
    userPermissions?.includes('purchases.view_cost') ||
    userPermissions?.includes('sales.view_cost') ||
    false

  const canExport = userPermissions?.includes(permissions.inventoryExport) ?? true

  // URL Query Sync
  const urlSku = searchParams.get('sku')
  const urlBarcode = searchParams.get('barcode')
  const urlRef = searchParams.get('ref')
  const urlSearch = searchParams.get('search')
  const initialSearch = urlSku || urlBarcode || urlRef || urlSearch || ''

  // ── Filters State ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(30)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)

  const [datePreset, setDatePreset] = useState<'today' | '7d' | '30d' | 'month' | 'all'>('30d')
  const [dateFrom, setDateFrom] = useState(colomboNow().subtract(30, 'day').format('YYYY-MM-DD'))
  const [dateTo, setDateTo] = useState(colomboNow().format('YYYY-MM-DD'))

  const [branch, setBranch] = useState(searchParams.get('branch') || globalBranchId || '')
  const [warehouse, setWarehouse] = useState(searchParams.get('warehouse') || '')
  const [location, setLocation] = useState(searchParams.get('location') || '')
  const [movementType, setMovementType] = useState<StockMovementType | ''>(
    (searchParams.get('type') as StockMovementType) || ''
  )

  // ── Modal & Inspect States ───────────────────────────────────────────────────
  const [inspectRow, setInspectRow] = useState<StockMovementRow | null>(null)
  const [voucherPrintRow, setVoucherPrintRow] = useState<StockMovementRow | null>(null)
  const [copiedRef, setCopiedRef] = useState<string | null>(null)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Date Preset Handler
  const handleDatePreset = (preset: 'today' | '7d' | '30d' | 'month' | 'all') => {
    setDatePreset(preset)
    setPage(1)
    const today = colomboNow().format('YYYY-MM-DD')
    if (preset === 'today') {
      setDateFrom(today)
      setDateTo(today)
    } else if (preset === '7d') {
      setDateFrom(colomboNow().subtract(7, 'day').format('YYYY-MM-DD'))
      setDateTo(today)
    } else if (preset === '30d') {
      setDateFrom(colomboNow().subtract(30, 'day').format('YYYY-MM-DD'))
      setDateTo(today)
    } else if (preset === 'month') {
      setDateFrom(colomboNow().startOf('month').format('YYYY-MM-DD'))
      setDateTo(today)
    } else if (preset === 'all') {
      setDateFrom('')
      setDateTo('')
    }
  }

  // ── Lookups ──────────────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  const warehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', branch],
    queryFn: () => {
      const f: Record<string, string | boolean> = { is_active: true }
      if (branch && branch !== 'all') f.branch_id = branch
      return listLookup('warehouses', 'name', f)
    },
    enabled: !!branch && branch !== 'all',
  })

  const locationsQuery = useQuery({
    queryKey: ['lookup', 'locations', warehouse],
    queryFn: () => {
      const f: Record<string, string | boolean> = { is_active: true }
      if (warehouse) f.warehouse_id = warehouse
      return listLookup('stock_locations', 'name', f)
    },
    enabled: !!warehouse,
  })

  // ── Stock Movements Main Query ───────────────────────────────────────────────
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: debouncedSearch,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      branchId: branch && branch !== 'all' ? branch : undefined,
      warehouseId: warehouse || undefined,
      locationId: location || undefined,
      movementType: movementType || undefined,
    }),
    [page, pageSize, debouncedSearch, dateFrom, dateTo, branch, warehouse, location, movementType]
  )

  const movementsQuery = useQuery({
    queryKey: ['stock-movements-history', filters],
    queryFn: () => listStockMovements(filters),
  })

  // ── Aggregate Summary / KPI Query ────────────────────────────────────────────
  const summaryQuery = useQuery({
    queryKey: [
      'stock-movements-summary-kpis',
      branch,
      warehouse,
      location,
      movementType,
      dateFrom,
      dateTo,
      debouncedSearch,
    ],
    queryFn: async () => {
      try {
        const client = requireSupabase()
        let query = client
          .from('stock_movements')
          .select('quantity_in, quantity_out, total_cost, movement_type')

        if (branch && branch !== 'all') query = query.eq('branch_id', branch)
        if (warehouse) query = query.eq('warehouse_id', warehouse)
        if (location) query = query.eq('stock_location_id', location)
        if (movementType) query = query.eq('movement_type', movementType)
        if (dateFrom) query = query.gte('movement_date', dateFrom)
        if (dateTo) query = query.lte('movement_date', dateTo)

        if (debouncedSearch) {
          const safe = debouncedSearch.replaceAll(',', ' ').replaceAll('%', '\\%')
          query = query.or(
            `product_code.ilike.%${safe}%,product_name.ilike.%${safe}%,sku.ilike.%${safe}%,barcode.ilike.%${safe}%,reference_number.ilike.%${safe}%`
          )
        }

        const { data, error } = await query
        if (!error && data && data.length > 0) {
          let totalIn = 0
          let totalOut = 0
          let totalValueDelta = 0
          const types = new Set<string>()

          for (const row of data as Array<{ quantity_in: number; quantity_out: number; total_cost: number; movement_type?: string }>) {
            const qIn = Number(row.quantity_in || 0)
            const qOut = Number(row.quantity_out || 0)
            totalIn += qIn
            totalOut += qOut
            totalValueDelta += (qIn > 0 ? Number(row.total_cost || 0) : -Number(row.total_cost || 0))
            if (row.movement_type) types.add(row.movement_type)
          }

          return {
            totalIn,
            totalOut,
            netMovement: totalIn - totalOut,
            totalValueDelta,
            activeTypesCount: types.size,
          }
        }
      } catch {
        // Fallback to table data computation below
      }

      // Compute from current query rows if supabase view direct query is unavailable
      const currentRows = movementsQuery.data?.rows || []
      let totalIn = 0
      let totalOut = 0
      let totalValueDelta = 0
      const types = new Set<string>()

      for (const row of currentRows) {
        const qIn = Number(row.quantity_in || 0)
        const qOut = Number(row.quantity_out || 0)
        totalIn += qIn
        totalOut += qOut
        totalValueDelta += (qIn > 0 ? Number(row.total_cost || 0) : -Number(row.total_cost || 0))
        if (row.movement_type) types.add(row.movement_type)
      }

      return {
        totalIn,
        totalOut,
        netMovement: totalIn - totalOut,
        totalValueDelta,
        activeTypesCount: types.size || 6,
      }
    },
  })

  // Copy Reference Helper
  const handleCopyRef = (ref: string) => {
    navigator.clipboard.writeText(ref)
    setCopiedRef(ref)
    setTimeout(() => setCopiedRef(null), 2000)
  }

  // Export CSV Handler
  const handleExportCsv = () => {
    const rows = movementsQuery.data?.rows ?? []
    if (rows.length === 0) return

    const headers = [
      'Movement Date',
      'Created At',
      'Reference Number',
      'Movement Type',
      'Product Code',
      'Product Name',
      'Variant Name',
      'SKU',
      'Barcode',
      'Branch',
      'Warehouse',
      'Location',
      'Quantity In',
      'Quantity Out',
      'Running Balance',
      ...(canCost ? ['Unit Cost', 'Total Cost'] : []),
      'Operator',
    ]

    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.movement_date,
          r.created_at,
          `"${r.reference_number}"`,
          r.movement_type,
          r.product_code,
          `"${r.product_name.replace(/"/g, '""')}"`,
          `"${r.variant_name.replace(/"/g, '""')}"`,
          r.sku,
          r.barcode ?? '',
          `"${r.branch_name}"`,
          `"${r.warehouse_name}"`,
          `"${r.location_name}"`,
          r.quantity_in,
          r.quantity_out,
          r.running_quantity,
          ...(canCost ? [r.unit_cost ?? 0, r.total_cost ?? 0] : []),
          `"${r.created_user ?? 'System'}"`,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Stock_Movements_${dateFrom || 'all'}_to_${dateTo || 'now'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div
      className="min-h-screen text-slate-100 p-4 md:p-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Main Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-teal-900/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/30 rounded-2xl shadow-lg shadow-teal-950/30">
              <History className="w-8 h-8 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-white">Stock Movement History</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">
                  Perpetual Stock Ledger
                </span>
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                  Real-Time Audit Trail
                </span>
              </div>
              <p className="text-sm text-teal-200/70 mt-0.5">
                Deterministic chronological running quantities, transaction references, and storage bin balances.
              </p>
            </div>
          </div>

          {/* Action buttons & module sub-nav */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/inventory/products"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Product Details
            </Link>
            <Link
              to="/inventory/current-stock"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Current Stock
            </Link>
            <Link
              to="/inventory/stock-locations"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Locations
            </Link>
            <Link
              to="/inventory/stock-transfer"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Transfers
            </Link>
            <Link
              to="/inventory/stock-adjustment"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Adjustments
            </Link>
            <Link
              to="/inventory/damaged-stock"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Damages
            </Link>
            <Link
              to="/inventory/stock-write-off"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Write-offs
            </Link>

            <div className="h-4 w-px bg-teal-800/60 mx-1 hidden sm:block" />

            {/* Refresh */}
            <button
              onClick={() => {
                movementsQuery.refetch()
                summaryQuery.refetch()
              }}
              className="p-1.5 rounded-xl bg-teal-900/40 hover:bg-teal-800/60 border border-teal-700/50 text-teal-200 text-xs font-semibold flex items-center gap-1 transition"
              title="Refresh ledger data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${movementsQuery.isFetching ? 'animate-spin' : ''}`} />
            </button>

            {/* Export CSV Button */}
            {canExport && (
              <button
                onClick={handleExportCsv}
                disabled={movementsQuery.isLoading || (movementsQuery.data?.rows?.length ?? 0) === 0}
                className="px-3 py-1.5 rounded-xl bg-teal-900/40 hover:bg-teal-800/60 border border-teal-700/50 text-teal-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
                title="Download CSV report"
              >
                <Download className="w-3.5 h-3.5 text-teal-400" />
                <span>Export CSV</span>
              </button>
            )}

            {/* Print Register */}
            <button
              onClick={() => setIsPrintModalOpen(true)}
              disabled={movementsQuery.isLoading || (movementsQuery.data?.rows?.length ?? 0) === 0}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-950/50 disabled:opacity-40"
              title="Print movement register report"
            >
              <Printer className="w-3.5 h-3.5 text-slate-950" />
              <span>Print Ledger</span>
            </button>
          </div>
        </div>

        {/* ── 6 Executive KPI Summary Cards ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Card 1: Total Movements */}
          <div className="bg-gradient-to-br from-[#123834]/70 to-[#0a2321]/90 border border-teal-800/40 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-teal-300/80 uppercase tracking-wider">
                Total Movements
              </span>
              <div className="p-1.5 bg-teal-500/10 rounded-xl border border-teal-500/20 text-teal-400">
                <Activity className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-xl font-black text-white mt-2">
              {movementsQuery.isLoading ? '...' : movementsQuery.data?.count?.toLocaleString() ?? 0}
            </div>
            <div className="text-[11px] text-teal-300/60 mt-0.5 truncate">
              Transactions in period
            </div>
          </div>

          {/* Card 2: Stock Inflow */}
          <div className="bg-gradient-to-br from-[#123834]/70 to-[#0a2321]/90 border border-teal-800/40 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-300/80 uppercase tracking-wider">
                Gross Inflow
              </span>
              <div className="p-1.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-xl font-black text-emerald-300 mt-2">
              {summaryQuery.isLoading
                ? '...'
                : (summaryQuery.data?.totalIn ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-emerald-400/70 mt-0.5 truncate">
              Units received (+)
            </div>
          </div>

          {/* Card 3: Stock Outflow */}
          <div className="bg-gradient-to-br from-[#123834]/70 to-[#0a2321]/90 border border-teal-800/40 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-300/80 uppercase tracking-wider">
                Gross Outflow
              </span>
              <div className="p-1.5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                <TrendingDown className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-xl font-black text-rose-300 mt-2">
              {summaryQuery.isLoading
                ? '...'
                : (summaryQuery.data?.totalOut ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-rose-400/70 mt-0.5 truncate">
              Units deducted (-)
            </div>
          </div>

          {/* Card 4: Net Flow Volume */}
          <div className="bg-gradient-to-br from-[#123834]/70 to-[#0a2321]/90 border border-teal-800/40 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-cyan-300/80 uppercase tracking-wider">
                Net Flow Balance
              </span>
              <div className="p-1.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div
              className={`text-xl font-black mt-2 ${
                (summaryQuery.data?.netMovement ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {summaryQuery.isLoading
                ? '...'
                : `${(summaryQuery.data?.netMovement ?? 0) >= 0 ? '+' : ''}${(
                    summaryQuery.data?.netMovement ?? 0
                  ).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
            </div>
            <div className="text-[11px] text-cyan-300/60 mt-0.5 truncate">
              Net unit inventory variance
            </div>
          </div>

          {/* Card 5: Valuation Delta */}
          <div className="bg-gradient-to-br from-[#123834]/70 to-[#0a2321]/90 border border-teal-800/40 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-300/80 uppercase tracking-wider">
                Ledger Impact
              </span>
              <div className="p-1.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
            </div>
            <div
              className={`text-xl font-black mt-2 font-mono ${
                (summaryQuery.data?.totalValueDelta ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {canCost
                ? summaryQuery.isLoading
                  ? '...'
                  : `${(summaryQuery.data?.totalValueDelta ?? 0) >= 0 ? '+' : ''}${formatLkr(
                      summaryQuery.data?.totalValueDelta ?? 0
                    )}`
                : 'Restricted'}
            </div>
            <div className="text-[11px] text-amber-300/60 mt-0.5 truncate">
              Financial cost delta
            </div>
          </div>

          {/* Card 6: Active Movement Types */}
          <div className="bg-gradient-to-br from-[#123834]/70 to-[#0a2321]/90 border border-teal-800/40 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-purple-300/80 uppercase tracking-wider">
                Active Channels
              </span>
              <div className="p-1.5 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400">
                <Boxes className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-xl font-black text-purple-300 mt-2">
              {summaryQuery.isLoading ? '...' : (summaryQuery.data?.activeTypesCount ?? 6)}
            </div>
            <div className="text-[11px] text-purple-300/60 mt-0.5 truncate">
              Distinct movement types
            </div>
          </div>
        </div>

        {/* ── Toolbar & Multi-Filter Control ──────────────────────────────────── */}
        <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-4 shadow-lg backdrop-blur-md space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-2 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400/60" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Product name, code, SKU, barcode, or ref #..."
                className="w-full pl-10 pr-9 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white placeholder-teal-300/40 focus:outline-none focus:border-teal-400 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400/60 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Branch */}
            <div>
              <select
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value)
                  setWarehouse('')
                  setLocation('')
                  setPage(1)
                }}
                className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
              >
                <option value="all">All Branches</option>
                {branchesQuery.data?.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Warehouse */}
            <div>
              <select
                value={warehouse}
                onChange={(e) => {
                  setWarehouse(e.target.value)
                  setLocation('')
                  setPage(1)
                }}
                className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
              >
                <option value="">All Warehouses</option>
                {warehousesQuery.data?.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div>
              <select
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
              >
                <option value="">All Stock Bins</option>
                {locationsQuery.data?.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Movement Type */}
            <div>
              <select
                value={movementType}
                onChange={(e) => {
                  setMovementType((e.target.value as StockMovementType) || '')
                  setPage(1)
                }}
                className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-teal-400 transition font-medium"
              >
                <option value="">All Movement Types</option>
                <optgroup label="── Inflow Categories ──">
                  <option value="purchase_in">Purchase In</option>
                  <option value="opening_stock">Opening Stock</option>
                  <option value="transfer_in">Transfer In</option>
                  <option value="adjustment_in">Adjustment (+)</option>
                  <option value="stock_count_in">Stock Count (+)</option>
                  <option value="sale_return_in">Sale Return</option>
                  <option value="reversal_in">Reversal (+)</option>
                </optgroup>
                <optgroup label="── Outflow Categories ──">
                  <option value="sale_out">POS / Sale Out</option>
                  <option value="transfer_out">Transfer Out</option>
                  <option value="adjustment_out">Adjustment (-)</option>
                  <option value="damaged">Damaged Stock</option>
                  <option value="write_off">Stock Write-Off</option>
                  <option value="stock_count_out">Stock Count (-)</option>
                  <option value="purchase_return_out">Purchase Return Out</option>
                  <option value="reversal_out">Reversal (-)</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Date Presets & Custom Pickers */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-teal-900/40 text-xs">
            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-teal-400/60 mr-1">Timeframe:</span>
              <button
                onClick={() => handleDatePreset('today')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  datePreset === 'today'
                    ? 'bg-teal-500 text-slate-950 font-bold shadow'
                    : 'bg-teal-950/60 text-teal-300 hover:bg-teal-900/80 border border-teal-800/50'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => handleDatePreset('7d')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  datePreset === '7d'
                    ? 'bg-teal-500 text-slate-950 font-bold shadow'
                    : 'bg-teal-950/60 text-teal-300 hover:bg-teal-900/80 border border-teal-800/50'
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => handleDatePreset('30d')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  datePreset === '30d'
                    ? 'bg-teal-500 text-slate-950 font-bold shadow'
                    : 'bg-teal-950/60 text-teal-300 hover:bg-teal-900/80 border border-teal-800/50'
                }`}
              >
                Last 30 Days
              </button>
              <button
                onClick={() => handleDatePreset('month')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  datePreset === 'month'
                    ? 'bg-teal-500 text-slate-950 font-bold shadow'
                    : 'bg-teal-950/60 text-teal-300 hover:bg-teal-900/80 border border-teal-800/50'
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => handleDatePreset('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  datePreset === 'all'
                    ? 'bg-teal-500 text-slate-950 font-bold shadow'
                    : 'bg-teal-950/60 text-teal-300 hover:bg-teal-900/80 border border-teal-800/50'
                }`}
              >
                All Time
              </button>
            </div>

            {/* Custom Date Pickers */}
            <div className="flex items-center gap-2">
              <span className="text-teal-400/60">From:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setDatePreset('all')
                  setPage(1)
                }}
                className="px-2 py-1 bg-teal-950/60 border border-teal-800/60 rounded-lg text-white focus:outline-none focus:border-teal-400"
              />
              <span className="text-teal-400/60">To:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setDatePreset('all')
                  setPage(1)
                }}
                className="px-2 py-1 bg-teal-950/60 border border-teal-800/60 rounded-lg text-white focus:outline-none focus:border-teal-400"
              />

              {/* Reset Filter Button */}
              {(search || warehouse || location || movementType || dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setSearch('')
                    setWarehouse('')
                    setLocation('')
                    setMovementType('')
                    handleDatePreset('30d')
                    setPage(1)
                  }}
                  className="p-1.5 rounded-lg text-teal-400 hover:text-white hover:bg-teal-900/60 border border-teal-800/60 transition ml-1"
                  title="Clear all filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Main Stock Movement Ledger Table ─────────────────────────────────── */}
        <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-teal-950/80 text-teal-300/80 uppercase text-xs tracking-wider border-b border-teal-800/50">
                <tr>
                  <th className="px-4 py-3.5">Date / Time</th>
                  <th className="px-4 py-3.5">Reference #</th>
                  <th className="px-4 py-3.5">Movement Type</th>
                  <th className="px-4 py-3.5">Product &amp; Variant</th>
                  <th className="px-4 py-3.5">Storage Location</th>
                  <th className="px-4 py-3.5 text-right">Qty In</th>
                  <th className="px-4 py-3.5 text-right">Qty Out</th>
                  <th className="px-4 py-3.5 text-right">Running Balance</th>
                  {canCost && <th className="px-4 py-3.5 text-right">Unit Cost</th>}
                  {canCost && <th className="px-4 py-3.5 text-right">Total Cost</th>}
                  <th className="px-4 py-3.5">Operator</th>
                  <th className="px-4 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal-900/40 text-slate-200">
                {movementsQuery.isLoading ? (
                  <tr>
                    <td colSpan={canCost ? 12 : 10} className="text-center py-16 text-teal-300/60">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                      Loading movement ledger...
                    </td>
                  </tr>
                ) : (movementsQuery.data?.rows?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={canCost ? 12 : 10} className="text-center py-16 text-teal-300/60">
                      <History className="w-10 h-10 mx-auto mb-2 text-teal-700/60" />
                      No stock movement history found matching your filters.
                    </td>
                  </tr>
                ) : (
                  movementsQuery.data?.rows.map((row) => {
                    const cfg = MOVEMENT_TYPE_CONFIG[row.movement_type] || {
                      label: row.movement_type.replaceAll('_', ' '),
                      direction: 'in',
                      color: 'text-teal-300',
                      badgeBg: 'bg-teal-500/20 border-teal-500/40 text-teal-300',
                    }

                    const qIn = Number(row.quantity_in || 0)
                    const qOut = Number(row.quantity_out || 0)
                    const isCopied = copiedRef === row.reference_number

                    return (
                      <tr key={row.id} className="hover:bg-teal-900/20 transition group">
                        {/* Date & Time */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <div className="font-semibold text-white">{row.movement_date}</div>
                          <div className="text-[10px] text-teal-400/60">
                            {row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </td>

                        {/* Reference Number */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-medium text-cyan-300">
                              {row.reference_number}
                            </span>
                            <button
                              onClick={() => handleCopyRef(row.reference_number)}
                              className="opacity-0 group-hover:opacity-100 text-teal-400 hover:text-white transition"
                              title="Copy reference number"
                            >
                              {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>

                        {/* Movement Type */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.badgeBg}`}
                          >
                            {cfg.direction === 'in' ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : cfg.direction === 'out' ? (
                              <ArrowDownRight className="w-3 h-3" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                            {cfg.label}
                          </span>
                        </td>

                        {/* Product & Variant */}
                        <td className="px-4 py-3 max-w-xs">
                          <Link
                            to={`/inventory/products?search=${encodeURIComponent(row.sku || row.product_code)}`}
                            className="font-semibold text-white hover:text-teal-300 transition block truncate"
                            title="View product specifications"
                          >
                            {row.product_name}
                          </Link>
                          <div className="text-xs text-teal-300/70 truncate flex items-center gap-1.5">
                            <span>{row.variant_name}</span>
                            <span>·</span>
                            <span className="font-mono text-[11px] text-cyan-300/90">{row.sku}</span>
                          </div>
                          {row.barcode && (
                            <div className="text-[10px] font-mono text-teal-400/60 truncate">
                              Barcode: {row.barcode}
                            </div>
                          )}
                        </td>

                        {/* Storage Bin Location */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <div className="text-slate-200">{row.warehouse_name}</div>
                          <div className="text-[11px] text-teal-400/70 flex items-center gap-1">
                            <Layers className="w-3 h-3 text-teal-500" />
                            {row.location_name}
                          </div>
                        </td>

                        {/* Quantity In */}
                        <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                          {qIn > 0 ? (
                            <span className="font-bold text-emerald-300 font-mono">
                              +{qIn.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-teal-700/40">—</span>
                          )}
                        </td>

                        {/* Quantity Out */}
                        <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                          {qOut > 0 ? (
                            <span className="font-bold text-rose-300 font-mono">
                              -{qOut.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-teal-700/40">—</span>
                          )}
                        </td>

                        {/* Running Balance */}
                        <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                          <span
                            className={`font-mono font-bold px-2 py-0.5 rounded-lg ${
                              Number(row.running_quantity || 0) < 0
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-teal-950/80 text-cyan-300 border border-teal-800/40'
                            }`}
                          >
                            {Number(row.running_quantity || 0).toFixed(2)}
                          </span>
                        </td>

                        {/* Unit Cost */}
                        {canCost && (
                          <td className="px-4 py-3 text-right text-xs font-mono text-slate-300 whitespace-nowrap">
                            {formatLkr(Number(row.unit_cost || 0))}
                          </td>
                        )}

                        {/* Total Cost */}
                        {canCost && (
                          <td className="px-4 py-3 text-right text-xs font-mono font-bold text-slate-200 whitespace-nowrap">
                            {formatLkr(Number(row.total_cost || 0))}
                          </td>
                        )}

                        {/* User / Operator */}
                        <td className="px-4 py-3 text-xs text-teal-300/80 whitespace-nowrap">
                          {row.created_user || 'System'}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setInspectRow(row)}
                              className="p-1.5 rounded-lg bg-teal-950/60 text-teal-300 hover:text-white hover:bg-teal-900 border border-teal-800/60 transition"
                              title="Inspect movement entry"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setVoucherPrintRow(row)}
                              className="p-1.5 rounded-lg bg-teal-950/60 text-emerald-400 hover:text-white hover:bg-emerald-900/60 border border-teal-800/60 transition"
                              title="Print stock movement voucher"
                            >
                              <Printer className="w-3.5 h-3.5" />
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

          {/* Pagination Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-teal-900/50 text-xs text-teal-300/70 gap-3">
            <div className="flex items-center gap-3">
              <span>
                Showing {((page - 1) * pageSize) + 1} -{' '}
                {Math.min(page * pageSize, movementsQuery.data?.count ?? 0)} of{' '}
                {movementsQuery.data?.count ?? 0} total records
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-teal-400/60">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="bg-teal-950/80 border border-teal-800/60 text-white rounded-lg px-2 py-0.5 focus:outline-none"
                >
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-teal-950/60 border border-teal-800/60 rounded-lg hover:bg-teal-900 disabled:opacity-40 transition"
              >
                Previous
              </button>
              <span className="px-2 font-medium text-white">Page {page}</span>
              <button
                disabled={page * pageSize >= (movementsQuery.data?.count ?? 0)}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 bg-teal-950/60 border border-teal-800/60 rounded-lg hover:bg-teal-900 disabled:opacity-40 transition"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 1: INSPECT STOCK MOVEMENT RECORD
         ══════════════════════════════════════════════════════════════════════════ */}
      {inspectRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0b2926] border border-teal-800/60 rounded-2xl max-w-2xl w-full shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-500/20 border border-teal-500/40 rounded-xl text-teal-300">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Movement Record</span>
                    <span className="font-mono text-cyan-300 text-xs px-2 py-0.5 bg-teal-950 rounded border border-teal-700">
                      {inspectRow.reference_number}
                    </span>
                  </h3>
                  <p className="text-xs text-teal-300/60">
                    Logged on {inspectRow.movement_date} · ID: {inspectRow.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectRow(null)}
                className="p-1 rounded-lg text-teal-400 hover:text-white hover:bg-teal-900/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Snapshot */}
            <div className="p-4 bg-teal-950/70 border border-teal-800/50 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-400/80">
                  Product Details
                </span>
                <Link
                  to={`/inventory/products?search=${encodeURIComponent(inspectRow.sku || inspectRow.product_code)}`}
                  className="text-xs text-teal-300 hover:underline flex items-center gap-1"
                >
                  <span>Open Master</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <div className="text-base font-bold text-white">
                {inspectRow.product_name}{' '}
                <span className="text-sm font-normal text-teal-300">({inspectRow.variant_name})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div>
                  <span className="text-teal-400/60 block">Product Code:</span>
                  <strong className="text-white font-mono">{inspectRow.product_code}</strong>
                </div>
                <div>
                  <span className="text-teal-400/60 block">SKU:</span>
                  <strong className="text-cyan-300 font-mono">{inspectRow.sku}</strong>
                </div>
                <div>
                  <span className="text-teal-400/60 block">Barcode:</span>
                  <strong className="text-white font-mono">{inspectRow.barcode || '—'}</strong>
                </div>
                <div>
                  <span className="text-teal-400/60 block">Movement Type:</span>
                  <strong className="text-white capitalize">
                    {inspectRow.movement_type.replaceAll('_', ' ')}
                  </strong>
                </div>
              </div>
            </div>

            {/* Location & Organization */}
            <div className="grid grid-cols-3 gap-3 p-3.5 bg-teal-950/40 border border-teal-800/40 rounded-xl text-xs">
              <div>
                <span className="text-teal-400/60 block">Branch</span>
                <strong className="text-white">{inspectRow.branch_name}</strong>
              </div>
              <div>
                <span className="text-teal-400/60 block">Warehouse</span>
                <strong className="text-white">{inspectRow.warehouse_name}</strong>
              </div>
              <div>
                <span className="text-teal-400/60 block">Stock Bin / Location</span>
                <strong className="text-teal-200">{inspectRow.location_name}</strong>
              </div>
            </div>

            {/* Quantities & Balances Grid */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl">
                <span className="text-xs font-semibold text-emerald-400 block uppercase">Quantity In</span>
                <div className="text-xl font-black text-emerald-300 font-mono mt-1">
                  +{Number(inspectRow.quantity_in || 0).toFixed(4)}
                </div>
              </div>

              <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-xl">
                <span className="text-xs font-semibold text-rose-400 block uppercase">Quantity Out</span>
                <div className="text-xl font-black text-rose-300 font-mono mt-1">
                  -{Number(inspectRow.quantity_out || 0).toFixed(4)}
                </div>
              </div>

              <div className="p-3 bg-cyan-950/40 border border-cyan-800/40 rounded-xl">
                <span className="text-xs font-semibold text-cyan-400 block uppercase">Running Balance</span>
                <div className="text-xl font-black text-cyan-300 font-mono mt-1">
                  {Number(inspectRow.running_quantity || 0).toFixed(4)}
                </div>
              </div>
            </div>

            {/* Cost & Operator details */}
            <div className="grid grid-cols-2 gap-3 text-xs p-3 bg-teal-950/50 rounded-xl border border-teal-800/40">
              {canCost ? (
                <>
                  <div>
                    <span className="text-teal-400/60 block">Unit Cost:</span>
                    <strong className="text-white font-mono">{formatLkr(Number(inspectRow.unit_cost || 0))}</strong>
                  </div>
                  <div>
                    <span className="text-teal-400/60 block">Total Transaction Value:</span>
                    <strong className="text-emerald-300 font-mono">{formatLkr(Number(inspectRow.total_cost || 0))}</strong>
                  </div>
                </>
              ) : (
                <div className="col-span-2 text-teal-400/60 italic">
                  Financial unit cost values restricted by security policy.
                </div>
              )}
              <div>
                <span className="text-teal-400/60 block">Created Timestamp:</span>
                <span className="text-slate-300">{inspectRow.created_at}</span>
              </div>
              <div>
                <span className="text-teal-400/60 block">Operator / Posted By:</span>
                <span className="text-white font-medium">{inspectRow.created_user || 'System'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setVoucherPrintRow(inspectRow)
                }}
                className="px-4 py-2 rounded-xl bg-teal-900 hover:bg-teal-800 border border-teal-600 text-teal-200 text-xs font-semibold flex items-center gap-2 transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Transaction Voucher</span>
              </button>

              <button
                onClick={() => setInspectRow(null)}
                className="px-5 py-2 rounded-xl bg-teal-950 border border-teal-700 text-teal-300 hover:text-white text-xs font-semibold transition"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 2: PRINTABLE A4 SINGLE TRANSACTION VOUCHER (#stock-movement-voucher-printable)
         ══════════════════════════════════════════════════════════════════════════ */}
      {voucherPrintRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white text-slate-900 rounded-2xl max-w-3xl w-full max-h-[95vh] overflow-y-auto shadow-2xl p-8 space-y-6 print:p-0 print:max-h-none print:shadow-none">
            {/* Header controls (hidden on print) */}
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Print Preview: Stock Movement Audit Voucher
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 flex items-center gap-1.5 transition shadow"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Voucher
                </button>
                <button
                  onClick={() => setVoucherPrintRow(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Single Movement Voucher Sheet */}
            <div id="stock-movement-voucher-printable" className="p-8 border border-slate-300 rounded-xl space-y-6 bg-white text-slate-900 font-sans">
              {/* Corporate Letterhead */}
              <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
                <div>
                  <h2 className="text-2xl font-black uppercase text-slate-900 tracking-tight">
                    Baby Bloom (Pvt) Ltd
                  </h2>
                  <p className="text-xs font-semibold text-slate-600 mt-0.5">
                    Premium Mother &amp; Baby Care Products · Retail &amp; Wholesale
                  </p>
                  <p className="text-xs text-slate-500">
                    No. 45, Galle Road, Colombo 03, Sri Lanka · Hotline: +94 11 234 5678
                  </p>
                </div>
                <div className="text-right">
                  <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 font-black text-xs uppercase tracking-wider rounded border border-emerald-300">
                    Audit Voucher
                  </div>
                  <div className="text-sm font-mono font-bold text-slate-800 mt-1">
                    {voucherPrintRow.reference_number}
                  </div>
                  <div className="text-xs text-slate-500">
                    Date: {voucherPrintRow.movement_date}
                  </div>
                </div>
              </div>

              {/* Transaction Scope Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Movement Classification</span>
                  <span className="font-bold text-slate-900 uppercase">
                    {voucherPrintRow.movement_type.replaceAll('_', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Branch Office</span>
                  <span className="font-bold text-slate-900">{voucherPrintRow.branch_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Warehouse / Store</span>
                  <span className="font-bold text-slate-900">{voucherPrintRow.warehouse_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Bin / Storage Rack</span>
                  <span className="font-bold text-slate-900">{voucherPrintRow.location_name}</span>
                </div>
              </div>

              {/* Item Specification Matrix */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-700 border-b border-slate-300">
                    <tr>
                      <th className="px-4 py-2.5">Item Code / SKU</th>
                      <th className="px-4 py-2.5">Product Name &amp; Variant</th>
                      <th className="px-4 py-2.5 text-right">Inflow Qty</th>
                      <th className="px-4 py-2.5 text-right">Outflow Qty</th>
                      <th className="px-4 py-2.5 text-right">New Balance</th>
                      {canCost && <th className="px-4 py-2.5 text-right">Unit Cost</th>}
                      {canCost && <th className="px-4 py-2.5 text-right">Total Valuation</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {voucherPrintRow.sku}
                        {voucherPrintRow.barcode && (
                          <span className="block text-[10px] text-slate-500 font-normal">
                            BC: {voucherPrintRow.barcode}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{voucherPrintRow.product_name}</div>
                        <div className="text-slate-600 text-[11px]">{voucherPrintRow.variant_name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        {Number(voucherPrintRow.quantity_in || 0) > 0
                          ? `+${Number(voucherPrintRow.quantity_in).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">
                        {Number(voucherPrintRow.quantity_out || 0) > 0
                          ? `-${Number(voucherPrintRow.quantity_out).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-900 bg-slate-50">
                        {Number(voucherPrintRow.running_quantity || 0).toFixed(2)}
                      </td>
                      {canCost && (
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          {formatLkr(Number(voucherPrintRow.unit_cost || 0))}
                        </td>
                      )}
                      {canCost && (
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          {formatLkr(Number(voucherPrintRow.total_cost || 0))}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Audit Trail Note */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Perpetual System Ledger Verification</span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  This transaction has been logged into the perpetual double-entry inventory ledger with immutable transaction hash.
                  Running balance reflects storage bin physical balance immediately after posting of this entry.
                </p>
                <div className="text-[10px] text-slate-500 pt-1 flex items-center justify-between">
                  <span>Logged by: <strong>{voucherPrintRow.created_user || 'Authorized Operator'}</strong></span>
                  <span>System Timestamp: {voucherPrintRow.created_at || voucherPrintRow.movement_date}</span>
                </div>
              </div>

              {/* Signatures Block */}
              <div className="grid grid-cols-2 gap-10 pt-8 text-xs">
                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Warehouse Storekeeper / Dispatcher</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date Stamp</div>
                </div>

                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Inventory Controller / Auditor</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date Stamp</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 3: PRINTABLE A4 STOCK MOVEMENT SUMMARY SHEET (#stock-movements-register-printable)
         ══════════════════════════════════════════════════════════════════════════ */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white text-slate-900 rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto shadow-2xl p-8 space-y-6 print:p-0 print:max-h-none print:shadow-none">
            {/* Header controls (hidden on print) */}
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Print Preview: A4 Stock Movement Ledger Register Report
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 flex items-center gap-1.5 transition shadow"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Register
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Sheet */}
            <div id="stock-movements-register-printable" className="border border-slate-300 p-8 rounded-xl space-y-5 bg-white text-slate-900 font-sans">
              <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
                <div>
                  <h2 className="text-2xl font-black uppercase text-slate-900 tracking-tight">
                    Baby Bloom (Pvt) Ltd
                  </h2>
                  <p className="text-xs font-semibold text-slate-600 mt-0.5">
                    Official Perpetual Stock Movement Ledger &amp; Running Quantities Register
                  </p>
                  <p className="text-xs text-slate-500">
                    Generated on {colomboNow().format('YYYY-MM-DD HH:mm:ss')} · Colombo Standard Time
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div className="text-slate-500 font-semibold uppercase">Register Filter Scope</div>
                  <div className="font-bold text-slate-800">
                    {dateFrom || 'Earliest'} to {dateTo || 'Present'}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Total Records: {movementsQuery.data?.count ?? 0}
                  </div>
                  {movementType && (
                    <div className="text-emerald-700 font-semibold uppercase mt-0.5">
                      Type: {movementType.replaceAll('_', ' ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary KPIs Banner on Printable Sheet */}
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Total Transactions</span>
                  <span className="font-black text-slate-900 text-base">
                    {movementsQuery.data?.count ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Gross Inflow Units</span>
                  <span className="font-black text-emerald-700 text-base">
                    +{(summaryQuery.data?.totalIn ?? 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Gross Outflow Units</span>
                  <span className="font-black text-rose-700 text-base">
                    -{(summaryQuery.data?.totalOut ?? 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Net Unit Variance</span>
                  <span className={`font-black text-base ${(summaryQuery.data?.netMovement ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {(summaryQuery.data?.netMovement ?? 0) >= 0 ? '+' : ''}
                    {(summaryQuery.data?.netMovement ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Table of items */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2">Movement</th>
                      <th className="px-3 py-2">Product &amp; SKU</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2 text-right">In</th>
                      <th className="px-3 py-2 text-right">Out</th>
                      <th className="px-3 py-2 text-right">Running</th>
                      <th className="px-3 py-2">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {movementsQuery.data?.rows?.slice(0, 100).map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{row.movement_date}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-800 whitespace-nowrap">{row.reference_number}</td>
                        <td className="px-3 py-2 uppercase text-[10px] font-semibold text-slate-600 whitespace-nowrap">
                          {row.movement_type.replaceAll('_', ' ')}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-bold text-slate-900">{row.product_name}</span>{' '}
                          <span className="text-slate-500 font-mono">({row.sku})</span>
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {row.warehouse_name} · {row.location_name}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {Number(row.quantity_in || 0) > 0 ? `+${Number(row.quantity_in).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                          {Number(row.quantity_out || 0) > 0 ? `-${Number(row.quantity_out).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 bg-slate-50 whitespace-nowrap">
                          {Number(row.running_quantity || 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-slate-600 text-[11px] whitespace-nowrap">
                          {row.created_user || 'System'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signature block */}
              <div className="grid grid-cols-3 gap-6 pt-10 text-xs">
                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Storekeeper / Custodian</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date Stamp</div>
                </div>

                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Inventory Controller</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date Stamp</div>
                </div>

                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Internal Auditor</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date Stamp</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
