import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Search,
  Plus,
  Trash2,
  Printer,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Eye,
  Barcode,
  DollarSign,
  AlertCircle,
  X,
  RefreshCw,
  ShieldCheck,
  Clock,
  Package,
  FileText,
  Flame,
  ShieldAlert,
  SlidersHorizontal,
  Download,
} from 'lucide-react'
import {
  listStockAdjustmentDocuments,
  getStockAdjustmentDocument,
  createInventoryDraft,
  inventoryAction,
  postStockAdjustmentImmediate,
  listCurrentStock,
  listOpeningStockVariants,
  type StockAdjustmentDocumentWithItems,
} from '../services/inventory'
import { listLookup, resolveBarcode } from '../services/masterData'
import { requireSupabase } from '../services/client'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { permissions } from '../config/permissions'
import { formatLkr } from '../lib/currency'
import { colomboNow } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import type { InventoryDocument } from '../types/inventory'

interface DamagedLineItem {
  key: string
  product_variant_id: string
  product_name: string
  variant_name: string
  sku: string
  barcode: string
  source_location_id: string
  source_location_name: string
  quantity: number
  available_quantity: number
  unit_cost: number
  damage_cause: string
  disposal_action: string
  batch_reference: string
  expiry_date: string
  remarks: string
}

export function DamagedStockPage() {
  const queryClient = useQueryClient()
  const activeBranchId = useBranchStore((s) => s.branchId)
  const userPermissions = useAuthStore((s) => s.user?.permissions)

  const canSubmit = userPermissions?.includes(permissions.inventorySubmit) ?? true
  const canApprove = userPermissions?.includes(permissions.inventoryApprove) ?? true
  const canPost = userPermissions?.includes(permissions.inventoryPost) ?? true
  const canReverse = userPermissions?.includes(permissions.inventoryReverse) ?? true

  // ── Navigation Tabs ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'register' | 'new_entry'>('register')

  // ── Filters State ────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBranch, setFilterBranch] = useState(activeBranchId || '')
  const [filterWarehouse, setFilterWarehouse] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // ── Form State for New Damaged Stock Entry ────────────────────────────────────
  const [branchId, setBranchId] = useState(activeBranchId || '')
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [documentDate, setDocumentDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [damageCausePreset, setDamageCausePreset] = useState('Warehouse Handling Damage / Dropped')
  const [customCause, setCustomCause] = useState('')
  const [disposalActionPreset, setDisposalActionPreset] = useState('Scrap & Safe Physical Disposal')
  const [supportingReference, setSupportingReference] = useState('')
  const [notes, setNotes] = useState('')
  const [negativeStockOverride, setNegativeStockOverride] = useState(false)

  // ── Line Entry State ─────────────────────────────────────────────────────────
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lineLocationId, setLineLocationId] = useState('')
  const [itemQuantity, setItemQuantity] = useState<number>(1)
  const [itemUnitCost, setItemUnitCost] = useState<number>(0)
  const [itemBatch, setItemBatch] = useState('')
  const [itemExpiry, setItemExpiry] = useState('')
  const [itemRemarks, setItemRemarks] = useState('')

  // ── Draft Lines ──────────────────────────────────────────────────────────────
  const [damagedLines, setDamagedLines] = useState<DamagedLineItem[]>([])

  // ── Modals & View States ─────────────────────────────────────────────────────
  const [detailDocId, setDetailDocId] = useState<string | null>(null)
  const [printDoc, setPrintDoc] = useState<StockAdjustmentDocumentWithItems | null>(null)
  const [printRegisterModalOpen, setPrintRegisterModalOpen] = useState(false)
  const [actionReasonModal, setActionReasonModal] = useState<{
    open: boolean
    action: 'reject' | 'cancel' | 'reverse'
    doc: InventoryDocument | null
    reason: string
  }>({ open: false, action: 'cancel', doc: null, reason: '' })

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  // ── Lookups ──────────────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  React.useEffect(() => {
    if (!branchId && branchesQuery.data && branchesQuery.data.length > 0) {
      setBranchId(branchesQuery.data[0]?.value || '')
    }
    if (!filterBranch && branchesQuery.data && branchesQuery.data.length > 0) {
      setFilterBranch(branchesQuery.data[0]?.value || '')
    }
  }, [branchesQuery.data, branchId, filterBranch])

  const warehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', branchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: branchId, is_active: true }),
    enabled: !!branchId,
  })

  React.useEffect(() => {
    if (warehousesQuery.data && warehousesQuery.data.length > 0) {
      setWarehouseId(warehousesQuery.data[0]?.value || '')
    } else {
      setWarehouseId('')
    }
  }, [warehousesQuery.data])

  const locationsQuery = useQuery({
    queryKey: ['lookup', 'locations', warehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: warehouseId, is_active: true }),
    enabled: !!warehouseId,
  })

  React.useEffect(() => {
    if (locationsQuery.data && locationsQuery.data.length > 0) {
      setLocationId(locationsQuery.data[0]?.value || '')
    } else {
      setLocationId('')
    }
  }, [locationsQuery.data])

  const variantsQuery = useQuery({
    queryKey: ['opening-stock-variants-lookup'],
    queryFn: () => listOpeningStockVariants(),
    staleTime: 60000,
  })

  const selectedVariantDetails = useMemo(() => {
    if (!selectedVariantId || !variantsQuery.data) return null
    return variantsQuery.data.find((v) => v.id === selectedVariantId)
  }, [selectedVariantId, variantsQuery.data])

  const effectiveLocationId = lineLocationId || locationId
  const currentStockCheck = useQuery({
    queryKey: ['stock-available-for-damage', effectiveLocationId, selectedVariantId],
    queryFn: () =>
      listCurrentStock({
        page: 1,
        pageSize: 1,
        locationId: effectiveLocationId,
        variantId: selectedVariantId,
      }),
    enabled: !!effectiveLocationId && !!selectedVariantId,
  })

  const availableQuantity = currentStockCheck.data?.rows[0]?.available_quantity ?? 0
  const onHandQuantity = currentStockCheck.data?.rows[0]?.quantity_on_hand ?? 0
  const currentWeightedCost = currentStockCheck.data?.rows[0]?.weighted_average_cost ?? 0

  React.useEffect(() => {
    if (selectedVariantDetails) {
      const defaultCost =
        currentWeightedCost > 0
          ? currentWeightedCost
          : selectedVariantDetails.average_cost > 0
          ? selectedVariantDetails.average_cost
          : selectedVariantDetails.purchase_price > 0
          ? selectedVariantDetails.purchase_price
          : 0
      setItemUnitCost(defaultCost)
    }
  }, [selectedVariantDetails, currentWeightedCost])

  // ── Damaged Documents Query ──────────────────────────────────────────────────
  const damagedList = useQuery({
    queryKey: [
      'damaged-stock-documents-list',
      page,
      searchQuery,
      statusFilter,
      filterBranch,
      filterWarehouse,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      listStockAdjustmentDocuments({
        page,
        pageSize: 15,
        search: searchQuery,
        branchId: filterBranch,
        warehouseId: filterWarehouse,
        documentType: 'damaged_stock',
        status: statusFilter,
        dateFrom,
        dateTo,
      }),
  })

  // ── CSV Export Handler ────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const rows = damagedList.data?.rows || []
    if (rows.length === 0) {
      showToast('No damaged stock records found to export', 'error')
      return
    }

    const headers = [
      'Voucher Number',
      'Incident Date',
      'Branch',
      'Warehouse',
      'Damage Cause & Action',
      'Supporting Reference',
      'Scrap Loss Valuation (LKR)',
      'Status',
      'Created At',
    ]

    const csvRows = rows.map((r) => [
      `"${r.document_number}"`,
      `"${r.document_date}"`,
      `"${(r.branch_name || '').replace(/"/g, '""')}"`,
      `"${(r.warehouse_name || '').replace(/"/g, '""')}"`,
      `"${(r.reason || '').replace(/"/g, '""')}"`,
      `"${(r.supporting_reference || '').replace(/"/g, '""')}"`,
      (r.total_cost || 0).toFixed(2),
      `"${r.status.toUpperCase()}"`,
      `"${r.created_at || ''}"`,
    ])

    const csvContent = [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `BabyBloom_Damaged_Stock_Register_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast(`Exported ${rows.length} damaged stock records to CSV`, 'success')
  }

  // ── Damaged KPIs Query ───────────────────────────────────────────────────────
  const kpisQuery = useQuery({
    queryKey: ['damaged-stock-kpis', filterBranch],
    queryFn: async () => {
      const client = requireSupabase()
      let query = client
        .from('inventory_documents')
        .select('id, status, total_cost, document_date')
        .eq('document_type', 'damaged_stock')

      if (filterBranch && filterBranch !== 'all') {
        query = query.eq('branch_id', filterBranch)
      }

      const { data, error } = await query
      if (error || !data) {
        return { totalIncidents: 0, postedCount: 0, pendingCount: 0, totalLossValuation: 0 }
      }

      const rows = data as unknown as Array<{ id: string; status: string; total_cost: number }>
      let totalLossValuation = 0
      let postedCount = 0
      let pendingCount = 0

      for (const doc of rows) {
        if (doc.status === 'posted') {
          postedCount++
          totalLossValuation += Number(doc.total_cost || 0)
        } else if (['draft', 'submitted', 'approved'].includes(doc.status)) {
          pendingCount++
        }
      }

      return {
        totalIncidents: rows.length,
        postedCount,
        pendingCount,
        totalLossValuation,
      }
    },
  })

  // ── Document Detail Query ────────────────────────────────────────────────────
  const detailQuery = useQuery({
    queryKey: ['damaged-stock-detail', detailDocId],
    queryFn: () => (detailDocId ? getStockAdjustmentDocument(detailDocId) : null),
    enabled: !!detailDocId,
  })

  // ── Barcode Resolve ──────────────────────────────────────────────────────────
  const handleBarcodeResolve = async () => {
    if (!barcodeInput.trim()) return
    try {
      const results = await resolveBarcode(barcodeInput.trim())
      if (results && results.length > 0) {
        const item = results[0]
        if (item) {
          setSelectedVariantId(item.product_variant_id)
          showToast(`Resolved SKU: ${item.sku} (${item.variant_name})`, 'info')
        }
      } else {
        const found = variantsQuery.data?.find(
          (v) => v.barcode === barcodeInput.trim() || v.sku.toLowerCase() === barcodeInput.trim().toLowerCase()
        )
        if (found) {
          setSelectedVariantId(found.id)
          showToast(`Resolved ${found.sku} · ${found.product_name}`, 'info')
        } else {
          showToast(`No product found matching barcode "${barcodeInput}"`, 'error')
        }
      }
    } catch (err) {
      showToast(getErrorMessage(err), 'error')
    }
  }

  // ── Add Item Line ────────────────────────────────────────────────────────────
  const handleAddLine = () => {
    if (!selectedVariantDetails) {
      showToast('Please select a product variant.', 'error')
      return
    }

    const locId = lineLocationId || locationId
    if (!locId) {
      showToast('Please select a stock location.', 'error')
      return
    }

    if (itemQuantity <= 0) {
      showToast('Damaged quantity must be greater than zero.', 'error')
      return
    }

    const locName = locationsQuery.data?.find((l) => l.value === locId)?.label || 'Warehouse Location'

    const newLine: DamagedLineItem = {
      key: crypto.randomUUID(),
      product_variant_id: selectedVariantDetails.id,
      product_name: selectedVariantDetails.product_name,
      variant_name: selectedVariantDetails.variant_name,
      sku: selectedVariantDetails.sku,
      barcode: selectedVariantDetails.barcode || '',
      source_location_id: locId,
      source_location_name: locName,
      quantity: Number(itemQuantity),
      available_quantity: availableQuantity,
      unit_cost: Number(itemUnitCost),
      damage_cause: customCause.trim() ? `${damageCausePreset} - ${customCause.trim()}` : damageCausePreset,
      disposal_action: disposalActionPreset,
      batch_reference: itemBatch.trim(),
      expiry_date: itemExpiry,
      remarks: itemRemarks.trim(),
    }

    setDamagedLines((prev) => [...prev, newLine])

    // Reset line inputs
    setSelectedVariantId('')
    setItemQuantity(1)
    setItemBatch('')
    setItemExpiry('')
    setItemRemarks('')
    setBarcodeInput('')
    showToast(`Added ${selectedVariantDetails.sku} (${newLine.quantity} damaged units)`, 'success')
  }

  const handleRemoveLine = (key: string) => {
    setDamagedLines((prev) => prev.filter((l) => l.key !== key))
  }

  // ── Calculation Summary ──────────────────────────────────────────────────────
  const draftSummary = useMemo(() => {
    const totalLines = damagedLines.length
    const totalUnits = damagedLines.reduce((acc, l) => acc + l.quantity, 0)
    const totalLoss = damagedLines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0)
    return { totalLines, totalUnits, totalLoss }
  }, [damagedLines])

  // ── Save Draft Mutation ──────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('Please select a Branch.')
      if (!warehouseId) throw new Error('Please select a Warehouse.')
      if (damagedLines.length === 0) throw new Error('Add at least one damaged product line.')

      const finalReason = customCause.trim()
        ? `${customCause.trim()} [Action: ${disposalActionPreset}]`
        : `${damageCausePreset} [Action: ${disposalActionPreset}]`

      return await createInventoryDraft({
        branch_id: branchId,
        warehouse_id: warehouseId,
        document_type: 'damaged_stock',
        document_date: documentDate,
        supporting_reference: supportingReference || undefined,
        notes: notes || undefined,
        reason: finalReason,
        negative_stock_override: negativeStockOverride,
        items: damagedLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: `${l.damage_cause} | ${l.disposal_action} ${l.remarks ? `| ${l.remarks}` : ''}`.trim(),
        })),
      })
    },
    onSuccess: () => {
      showToast('Damaged stock incident saved as draft!', 'success')
      setDamagedLines([])
      setCustomCause('')
      setNotes('')
      setSupportingReference('')
      setActiveTab('register')
      queryClient.invalidateQueries({ queryKey: ['damaged-stock-documents-list'] })
      queryClient.invalidateQueries({ queryKey: ['damaged-stock-kpis'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // ── Post Immediate Mutation ──────────────────────────────────────────────────
  const postImmediateMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('Please select a Branch.')
      if (!warehouseId) throw new Error('Please select a Warehouse.')
      if (damagedLines.length === 0) throw new Error('Add at least one damaged product line.')

      const finalReason = customCause.trim()
        ? `${customCause.trim()} [Action: ${disposalActionPreset}]`
        : `${damageCausePreset} [Action: ${disposalActionPreset}]`

      return await postStockAdjustmentImmediate({
        branch_id: branchId,
        warehouse_id: warehouseId,
        document_type: 'damaged_stock',
        document_date: documentDate,
        supporting_reference: supportingReference || undefined,
        notes: notes || undefined,
        reason: finalReason,
        negative_stock_override: negativeStockOverride,
        items: damagedLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: `${l.damage_cause} | ${l.disposal_action} ${l.remarks ? `| ${l.remarks}` : ''}`.trim(),
        })),
      })
    },
    onSuccess: (result) => {
      showToast(`Damaged stock voucher ${result.document_number} posted and deducted from inventory!`, 'success')
      setDamagedLines([])
      setCustomCause('')
      setNotes('')
      setSupportingReference('')
      setActiveTab('register')
      queryClient.invalidateQueries({ queryKey: ['damaged-stock-documents-list'] })
      queryClient.invalidateQueries({ queryKey: ['damaged-stock-kpis'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // ── Workflow Action Mutation (Submit / Approve / Post / Cancel / Reverse) ────
  const workflowMutation = useMutation({
    mutationFn: async ({
      action,
      doc,
      reason,
    }: {
      action: 'submit' | 'approve' | 'post' | 'reverse' | 'reject' | 'cancel'
      doc: InventoryDocument
      reason?: string
    }) => {
      return await inventoryAction(action, doc, reason)
    },
    onSuccess: (res) => {
      showToast(`Damaged voucher ${res.document_number} updated to ${res.status.toUpperCase()}!`, 'success')
      setActionReasonModal({ open: false, action: 'cancel', doc: null, reason: '' })
      queryClient.invalidateQueries({ queryKey: ['damaged-stock-documents-list'] })
      queryClient.invalidateQueries({ queryKey: ['damaged-stock-kpis'] })
      queryClient.invalidateQueries({ queryKey: ['damaged-stock-detail', detailDocId] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  const renderStatusBadge = (st: string) => {
    switch (st) {
      case 'posted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#063026] text-[#10b981] border border-[#10b981]/30">
            <CheckCircle2 size={12} /> Posted / Written-Off
          </span>
        )
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#0a2f40] text-[#38bdf8] border border-[#38bdf8]/30">
            <ShieldCheck size={12} /> Approved
          </span>
        )
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#322307] text-[#f59e0b] border border-[#f59e0b]/30">
            <Clock size={12} /> Under Review
          </span>
        )
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#1a1c23] text-[#9ca3af] border border-[#4b5563]/40">
            Draft Report
          </span>
        )
      case 'cancelled':
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#360d13] text-[#f43f5e] border border-[#f43f5e]/30">
            <XCircle size={12} /> {st}
          </span>
        )
      case 'reversed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#2a133d] text-[#c084fc] border border-[#c084fc]/30">
            <RotateCcw size={12} /> Reversed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
            {st}
          </span>
        )
    }
  }

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* ── Toast Notification ─────────────────────────────────────────── */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 transition-all duration-300 ${
            toastMessage.type === 'error'
              ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
              : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-5 h-5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-teal-400/80 font-semibold mb-1">
            <span>Inventory</span>
            <span>/</span>
            <span className="text-teal-200">Quality & Loss Control</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            Damaged & Defective Stock Management
            <span className="text-xs px-2.5 py-1 rounded-md bg-amber-950/80 text-amber-300 font-mono font-medium border border-amber-500/40">
              Quarantine & Scrap Log
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Document damaged, broken, or expired merchandise, quarantine defective stock away from active POS sales, authorize scrap disposal, and audit loss valuations.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Tab Switcher Pills */}
          <div className="bg-[#061e1c] border border-[#164e48] p-1 rounded-xl inline-flex gap-1">
            <button
              type="button"
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-md'
                  : 'text-teal-300/80 hover:text-white hover:bg-[#0c312e]'
              }`}
              onClick={() => setActiveTab('register')}
            >
              <FileText className="w-3.5 h-3.5" />
              Damaged Stock Register
            </button>
            <button
              type="button"
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'new_entry'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-md'
                  : 'text-teal-300/80 hover:text-white hover:bg-[#0c312e]'
              }`}
              onClick={() => setActiveTab('new_entry')}
            >
              <Plus className="w-3.5 h-3.5" />
              + Report Damaged Goods
            </button>
          </div>

          {/* Export CSV button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#061e1c] hover:bg-[#0c312e] text-amber-300 hover:text-amber-200 border border-amber-600/40 hover:border-amber-500/60 transition-all shadow-sm cursor-pointer"
            title="Download CSV spreadsheet of damaged stock vouchers"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          {/* Print Register button */}
          <button
            type="button"
            onClick={() => setPrintRegisterModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 hover:text-white border border-[#164e48] transition-all shadow-sm cursor-pointer"
            title="Print formal A4 register audit report"
          >
            <Printer size={14} />
            <span>Print Register</span>
          </button>

          <Link
            to="/inventory/stock-adjustment"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="General Physical Count Stock Adjustments"
          >
            <SlidersHorizontal size={14} /> Stock Adjustments
          </Link>

          <Link
            to="/inventory/current-stock"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="View Real-Time Available Stock"
          >
            <Package size={14} /> Current Stock
          </Link>

          <button
            type="button"
            onClick={() => {
              damagedList.refetch()
              kpisQuery.refetch()
              showToast('Refreshed damaged stock records', 'info')
            }}
            disabled={damagedList.isRefetching}
            className="p-2.5 rounded-xl bg-[#061e1c] hover:bg-[#0c312e] text-teal-400 border border-[#164e48] transition-colors cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw size={15} className={damagedList.isRefetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── 4 KPI Glassmorphic Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Incidents */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Damage Incidents</span>
            <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {kpisQuery.data?.totalIncidents ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">Total registered incident vouchers</div>
        </div>

        {/* Card 2: Written-Off & Disposed */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-rose-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Written-Off / Disposed</span>
            <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/30 text-rose-400">
              <Flame size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-rose-400 tracking-tight">
            {kpisQuery.data?.postedCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">Defective units deducted from balance</div>
        </div>

        {/* Card 3: Pending Quarantine */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-sky-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Pending Authorization</span>
            <div className="p-2 rounded-xl bg-sky-950/80 border border-sky-500/30 text-sky-400">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-sky-400 tracking-tight">
            {kpisQuery.data?.pendingCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">Awaiting manager scrap approval</div>
        </div>

        {/* Card 4: Total Scrap Valuation Loss */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-red-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Scrap Loss</span>
            <div className="p-2 rounded-xl bg-red-950/80 border border-red-500/30 text-red-400">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-red-300 tracking-tight font-mono">
            {formatLkr(kpisQuery.data?.totalLossValuation ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-400">Cumulative financial write-off loss</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: DAMAGED STOCK REGISTER (LIST & AUDIT TRAIL)                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Search voucher #, cause, remarks..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                className="w-full pl-9 pr-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-500 focus:border-teal-400 outline-none"
              />
            </div>

            {/* Branch Filter */}
            <select
              value={filterBranch}
              onChange={(e) => {
                setFilterBranch(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
            >
              <option value="all">All Branches</option>
              {branchesQuery.data?.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>

            {/* Warehouse Filter */}
            <select
              value={filterWarehouse}
              onChange={(e) => {
                setFilterWarehouse(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
            >
              <option value="all">All Warehouses</option>
              {warehousesQuery.data?.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Under Review</option>
              <option value="approved">Approved</option>
              <option value="posted">Posted / Disposed</option>
              <option value="cancelled">Cancelled</option>
              <option value="reversed">Reversed</option>
            </select>

            {/* Date From */}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
              title="From Date"
            />

            {/* Date To */}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
              title="To Date"
            />

            {(searchQuery || filterBranch !== 'all' || filterWarehouse !== 'all' || statusFilter !== 'all' || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setFilterBranch('all')
                  setFilterWarehouse('all')
                  setStatusFilter('all')
                  setDateFrom('')
                  setDateTo('')
                  setPage(1)
                }}
                className="px-3 py-2 bg-[#082b27] hover:bg-[#0c3b36] border border-[#164e48] text-teal-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Table Container */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#082b27] border-b border-[#164e48] text-teal-300 uppercase font-semibold">
                  <tr>
                    <th className="p-3.5">Voucher #</th>
                    <th className="p-3.5">Incident Date</th>
                    <th className="p-3.5">Branch / Warehouse</th>
                    <th className="p-3.5">Damage Cause & Action</th>
                    <th className="p-3.5 text-right">Scrap Loss Valuation</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#164e48]/40">
                  {damagedList.isLoading ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-teal-300 text-sm">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-teal-400" />
                        Loading damaged stock vouchers...
                      </td>
                    </tr>
                  ) : damagedList.data?.rows && damagedList.data.rows.length > 0 ? (
                    damagedList.data.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-[#0c312e]/50 transition-colors">
                        {/* Doc Number */}
                        <td className="p-3.5 font-mono font-bold text-white">
                          <button
                            type="button"
                            onClick={() => setDetailDocId(row.id)}
                            className="text-amber-400 hover:text-white underline decoration-amber-500/40 cursor-pointer"
                          >
                            {row.document_number}
                          </button>
                        </td>

                        {/* Date */}
                        <td className="p-3.5 text-slate-300 whitespace-nowrap">
                          {row.document_date}
                        </td>

                        {/* Branch & Warehouse */}
                        <td className="p-3.5 text-slate-200">
                          <div className="font-semibold text-white">{row.branch_name}</div>
                          <div className="text-[11px] text-teal-400/80">{row.warehouse_name}</div>
                        </td>

                        {/* Cause & Reference */}
                        <td className="p-3.5 text-slate-300 max-w-sm truncate" title={row.reason || ''}>
                          <span className="font-medium text-amber-300 flex items-center gap-1.5">
                            <AlertTriangle size={12} className="shrink-0 text-amber-400" />
                            {row.reason || 'Damaged Stock Scrap'}
                          </span>
                          {row.supporting_reference && (
                            <span className="block text-[10px] text-teal-400 font-mono mt-0.5">
                              Incident Ref: {row.supporting_reference}
                            </span>
                          )}
                        </td>

                        {/* Valuation */}
                        <td className="p-3.5 text-right font-mono font-bold text-red-400 whitespace-nowrap">
                          {formatLkr(row.total_cost || 0)}
                        </td>

                        {/* Status */}
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {renderStatusBadge(row.status)}
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* View Detail */}
                            <button
                              type="button"
                              onClick={() => setDetailDocId(row.id)}
                              className="p-1.5 rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] text-teal-300 border border-[#164e48] transition-colors cursor-pointer"
                              title="View Incident Report"
                            >
                              <Eye size={13} />
                            </button>

                            {/* Print Voucher */}
                            <button
                              type="button"
                              onClick={async () => {
                                const fullDoc = await getStockAdjustmentDocument(row.id)
                                setPrintDoc(fullDoc)
                              }}
                              className="p-1.5 rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] text-teal-300 border border-[#164e48] transition-colors cursor-pointer"
                              title="Print A4 Damage Certificate"
                            >
                              <Printer size={13} />
                            </button>

                            {/* Submit (if draft) */}
                            {row.status === 'draft' && canSubmit && (
                              <button
                                type="button"
                                onClick={() => workflowMutation.mutate({ action: 'submit', doc: row })}
                                disabled={workflowMutation.isPending}
                                className="px-2 py-1 rounded-lg bg-teal-900/60 hover:bg-teal-800 text-teal-200 border border-teal-600/40 text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Submit for Scrap Authorization"
                              >
                                Submit
                              </button>
                            )}

                            {/* Approve (if submitted) */}
                            {row.status === 'submitted' && canApprove && (
                              <button
                                type="button"
                                onClick={() => workflowMutation.mutate({ action: 'approve', doc: row })}
                                disabled={workflowMutation.isPending}
                                className="px-2 py-1 rounded-lg bg-sky-900/60 hover:bg-sky-800 text-sky-200 border border-sky-600/40 text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Approve Scrap Disposal"
                              >
                                Approve
                              </button>
                            )}

                            {/* Post (if approved) */}
                            {row.status === 'approved' && canPost && (
                              <button
                                type="button"
                                onClick={() => workflowMutation.mutate({ action: 'post', doc: row })}
                                disabled={workflowMutation.isPending}
                                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-[11px] font-bold shadow-md transition-colors cursor-pointer"
                                title="Write-Off and Deduct from Inventory"
                              >
                                Post Scrap
                              </button>
                            )}

                            {/* Cancel */}
                            {['draft', 'submitted', 'approved'].includes(row.status) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActionReasonModal({
                                    open: true,
                                    action: 'cancel',
                                    doc: row,
                                    reason: '',
                                  })
                                }
                                className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/40 transition-colors cursor-pointer"
                                title="Cancel Report"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}

                            {/* Reverse */}
                            {row.status === 'posted' && canReverse && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActionReasonModal({
                                    open: true,
                                    action: 'reverse',
                                    doc: row,
                                    reason: '',
                                  })
                                }
                                className="p-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-800/40 transition-colors cursor-pointer"
                                title="Reverse Write-Off"
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400 text-sm">
                        No damaged stock incident reports found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            <div className="p-4 bg-[#082b27] border-t border-[#164e48] flex items-center justify-between text-xs text-slate-300">
              <div>
                Showing Page <strong className="text-white">{page}</strong> ({damagedList.data?.count ?? 0} total records)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg bg-[#061e1c] border border-[#164e48] text-teal-300 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={(damagedList.data?.count ?? 0) <= page * 15}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg bg-[#061e1c] border border-[#164e48] text-teal-300 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: NEW DAMAGED GOODS INCIDENT REPORT                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'new_entry' && (
        <div className="space-y-6">
          {/* Header Panel */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-[#164e48] pb-3">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              1. Incident Details & Disposal Action
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Operating Branch <span className="text-rose-400">*</span>
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  {branchesQuery.data?.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Warehouse <span className="text-rose-400">*</span>
                </label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  {warehousesQuery.data?.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Quarantine Bin / Location <span className="text-rose-400">*</span>
                </label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  {locationsQuery.data?.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Incident Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                />
              </div>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Primary Cause of Damage <span className="text-rose-400">*</span>
                </label>
                <select
                  value={damageCausePreset}
                  onChange={(e) => setDamageCausePreset(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  <option value="Warehouse Handling Damage / Dropped">Warehouse Handling Damage / Dropped</option>
                  <option value="In-Transit Delivery Damage / Transit Vibration">In-Transit Delivery Damage / Transit Vibration</option>
                  <option value="Water Leakage / Moisture / Weather Exposure">Water Leakage / Moisture / Weather Exposure</option>
                  <option value="Expired / Decomposed / Past Use-By Date">Expired / Decomposed / Past Use-By Date</option>
                  <option value="Defective Factory Seal / Packaging Breach">Defective Factory Seal / Packaging Breach</option>
                  <option value="Customer Return in Unsellable / Broken Condition">Customer Return in Unsellable / Broken Condition</option>
                  <option value="Pest / Rodent Contamination">Pest / Rodent Contamination</option>
                  <option value="Showroom Display Wear & Tear">Showroom Display Wear & Tear</option>
                  <option value="Other">Other (Custom Reason Below)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Authorized Disposal Action <span className="text-rose-400">*</span>
                </label>
                <select
                  value={disposalActionPreset}
                  onChange={(e) => setDisposalActionPreset(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  <option value="Scrap & Safe Physical Disposal">Scrap & Safe Physical Disposal</option>
                  <option value="Quarantine Hold (Pending Vendor Claim)">Quarantine Hold (Pending Vendor Claim)</option>
                  <option value="Condemn & Incinerate">Condemn & Incinerate</option>
                  <option value="Salvage for Parts / Discounted Clearance">Salvage for Parts / Discounted Clearance</option>
                  <option value="Return to Supplier (Debit Note Required)">Return to Supplier (Debit Note Required)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Detailed Damage Explanation
                </label>
                <input
                  type="text"
                  placeholder="e.g. Forklift impacted pallet rack B-12 causing bottle breakage"
                  value={customCause}
                  onChange={(e) => setCustomCause(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Incident Reference # / Witness
                </label>
                <input
                  type="text"
                  placeholder="e.g. INC-2026-091 / Witnessed by Security"
                  value={supportingReference}
                  onChange={(e) => setSupportingReference(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none font-mono"
                />
              </div>
            </div>

            {/* Negative stock override */}
            <div className="pt-2 flex items-center justify-between bg-[#031413] p-3 rounded-xl border border-[#164e48]">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={negativeStockOverride}
                  onChange={(e) => setNegativeStockOverride(e.target.checked)}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 bg-[#082321] border-[#164e48]"
                />
                <span>Allow audited negative-stock override for damaged removal</span>
              </label>
              <span className="text-[11px] text-teal-400 font-mono">Weighted Average Cost Deduction</span>
            </div>
          </div>

          {/* ── Line Item Builder ────────────────────────────────────────── */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#164e48] pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                2. Damaged Product Line Builder
              </h2>
              {selectedVariantDetails && (
                <div className="flex items-center gap-3 text-xs bg-[#031413] border border-[#164e48] px-3 py-1.5 rounded-xl font-mono">
                  <span className="text-slate-400">Available in Location:</span>
                  <strong className="text-emerald-400">{availableQuantity} PCS</strong>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400">On Hand:</span>
                  <strong className="text-teal-300">{onHandQuantity} PCS</strong>
                </div>
              )}
            </div>

            {/* Quick Barcode Scanner Box */}
            <div className="flex items-center gap-3 bg-[#031413] p-3 rounded-xl border border-[#164e48]">
              <div className="p-2 bg-[#0e3b37] border border-[#164e48] rounded-lg text-teal-300">
                <Barcode size={18} />
              </div>
              <input
                type="text"
                placeholder="Scan or enter barcode / SKU of damaged item and press Enter..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleBarcodeResolve()
                  }
                }}
                className="flex-1 bg-transparent border-none text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleBarcodeResolve}
                className="px-3.5 py-1.5 bg-[#0e3b37] hover:bg-[#12423c] text-teal-300 border border-[#164e48] rounded-lg text-xs font-semibold cursor-pointer"
              >
                Resolve
              </button>
            </div>

            {/* Product Variant Search & Location Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Select Product Variant
                </label>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  <option value="">-- Choose Damaged Product Variant --</option>
                  {variantsQuery.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} • {v.product_name} ({v.variant_name}) {v.barcode ? `[${v.barcode}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Stock Bin / Location
                </label>
                <select
                  value={lineLocationId || locationId}
                  onChange={(e) => setLineLocationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  {locationsQuery.data?.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quantity, Cost & Line Details */}
            {selectedVariantDetails && (
              <div className="p-4 bg-[#031413] rounded-2xl border border-[#164e48] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Current Sellable On-Hand
                    </label>
                    <div className="px-3.5 py-2.5 bg-[#061e1c] border border-[#164e48] rounded-xl text-sm text-white font-mono font-bold">
                      {onHandQuantity} PCS
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wider mb-1">
                      Damaged Quantity <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(Number(e.target.value))}
                      step="1"
                      min="1"
                      className="w-full px-3.5 py-2.5 bg-[#082321] border border-amber-500/50 rounded-xl text-sm text-white font-mono font-bold focus:border-amber-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1">
                      Unit Cost (LKR)
                    </label>
                    <input
                      type="number"
                      value={itemUnitCost}
                      onChange={(e) => setItemUnitCost(Number(e.target.value))}
                      step="0.01"
                      min="0"
                      className="w-full px-3.5 py-2.5 bg-[#082321] border border-[#164e48] rounded-xl text-sm text-white font-mono focus:border-teal-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">
                      Scrap Line Total Loss
                    </label>
                    <div className="px-3.5 py-2.5 bg-[#061e1c] border border-rose-900/50 rounded-xl text-sm font-mono font-bold text-rose-300">
                      {formatLkr(itemQuantity * itemUnitCost)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1">
                      Batch / Lot #
                    </label>
                    <input
                      type="text"
                      placeholder="Optional batch..."
                      value={itemBatch}
                      onChange={(e) => setItemBatch(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#082321] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1">
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      value={itemExpiry}
                      onChange={(e) => setItemExpiry(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#082321] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1">
                      Specific Defect Remarks
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Broken cap, leaked liquid"
                      value={itemRemarks}
                      onChange={(e) => setItemRemarks(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#082321] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
                    />
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-950/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={15} /> Add Damaged Line
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Staged Items Table ───────────────────────────────────── */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  Damaged Items Quarantined ({damagedLines.length})
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  Total Units: {draftSummary.totalUnits} • Total Loss: {formatLkr(draftSummary.totalLoss)}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#164e48]/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#082b27] border-b border-[#164e48] text-teal-300 uppercase font-semibold">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Product / SKU</th>
                      <th className="p-3">Location</th>
                      <th className="p-3 text-right">Damaged Qty</th>
                      <th className="p-3 text-right">Unit Cost</th>
                      <th className="p-3 text-right">Scrap Loss</th>
                      <th className="p-3">Cause & Action</th>
                      <th className="p-3">Remarks</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#164e48]/40 font-mono">
                    {damagedLines.length > 0 ? (
                      damagedLines.map((line, idx) => (
                        <tr key={line.key} className="hover:bg-[#0c312e]/50 transition-colors">
                          <td className="p-3 text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-sans">
                            <div className="font-semibold text-white">{line.product_name}</div>
                            <div className="text-[11px] text-amber-300 font-mono">
                              SKU: {line.sku} {line.variant_name ? `• ${line.variant_name}` : ''}
                            </div>
                          </td>
                          <td className="p-3 font-sans text-slate-300">{line.source_location_name}</td>
                          <td className="p-3 text-right font-bold text-amber-300">-{line.quantity} PCS</td>
                          <td className="p-3 text-right text-slate-300">{formatLkr(line.unit_cost)}</td>
                          <td className="p-3 text-right font-bold text-rose-400">
                            {formatLkr(line.quantity * line.unit_cost)}
                          </td>
                          <td className="p-3 font-sans text-slate-300 text-[11px]">
                            <div>{line.damage_cause}</div>
                            <div className="text-[10px] text-teal-400">{line.disposal_action}</div>
                          </td>
                          <td className="p-3 font-sans text-slate-400 max-w-xs truncate">
                            {line.remarks || '—'}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.key)}
                              className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400 text-xs font-sans">
                          No damaged items added. Scan a barcode or select a variant above to log damaged units.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[#164e48]">
              <div className="text-xs text-slate-300">
                Total Scrap Loss Valuation:{' '}
                <strong className="text-lg text-rose-400 font-mono font-bold">
                  {formatLkr(draftSummary.totalLoss)}
                </strong>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className="px-4 py-2.5 bg-[#061e1c] hover:bg-[#0c312e] text-slate-300 border border-[#164e48] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={saveDraftMutation.isPending || damagedLines.length === 0}
                  onClick={() => saveDraftMutation.mutate()}
                  className="px-5 py-2.5 bg-[#082b27] hover:bg-[#0c3b36] border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
                >
                  {saveDraftMutation.isPending ? 'Saving Report...' : 'Save Draft Report'}
                </button>

                <button
                  type="button"
                  disabled={postImmediateMutation.isPending || damagedLines.length === 0}
                  onClick={() => postImmediateMutation.mutate()}
                  className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-950/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  <Flame size={15} />
                  {postImmediateMutation.isPending ? 'Authorizing Scrap...' : 'Authorize & Scrap Immediately'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 1: Document Details Modal ─────────────────────────────── */}
      {detailDocId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Damaged Stock Report #{detailQuery.data?.document_number}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Branch: <strong className="text-white">{detailQuery.data?.branch_name}</strong> • Warehouse:{' '}
                  <strong className="text-teal-300">{detailQuery.data?.warehouse_name}</strong>
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setDetailDocId(null)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-[#061e1c] overflow-y-auto space-y-6">
              {detailQuery.isLoading ? (
                <div className="p-12 text-center text-teal-300">Loading incident details...</div>
              ) : detailQuery.data ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#031413] p-4 rounded-xl border border-[#164e48] text-xs">
                    <div>
                      <span className="text-slate-400 block">Status:</span>
                      <div className="mt-1">{renderStatusBadge(detailQuery.data.status)}</div>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Incident Date:</span>
                      <span className="font-semibold text-white mt-1 block">{detailQuery.data.document_date}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Items Quarantined:</span>
                      <span className="font-bold text-amber-300 mt-1 block font-mono">
                        {detailQuery.data.items?.length || 0} items
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Total Scrap Loss:</span>
                      <span className="font-bold font-mono text-red-400 mt-1 block">
                        {formatLkr(detailQuery.data.total_cost || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#031413] p-4 rounded-xl border border-[#164e48] text-xs space-y-1">
                    <div>
                      <span className="text-slate-400 font-semibold">Damage Cause & Action: </span>
                      <span className="text-amber-300 font-medium">{detailQuery.data.reason || 'None specified'}</span>
                    </div>
                    {detailQuery.data.supporting_reference && (
                      <div>
                        <span className="text-slate-400 font-semibold">Incident Reference: </span>
                        <span className="text-teal-300 font-mono">{detailQuery.data.supporting_reference}</span>
                      </div>
                    )}
                    {detailQuery.data.notes && (
                      <div>
                        <span className="text-slate-400 font-semibold">Notes: </span>
                        <span className="text-slate-300">{detailQuery.data.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Items List */}
                  <div>
                    <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider mb-2">
                      Defective Line Items ({detailQuery.data.items?.length || 0})
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-[#164e48]/60">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#082b27] border-b border-[#164e48] text-teal-300 uppercase">
                          <tr>
                            <th className="p-2.5">Item</th>
                            <th className="p-2.5">Location</th>
                            <th className="p-2.5 text-right">Damaged Qty</th>
                            <th className="p-2.5 text-right">Unit Cost</th>
                            <th className="p-2.5 text-right">Total Loss</th>
                            <th className="p-2.5">Remarks / Cause</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#164e48]/40">
                          {detailQuery.data.items?.map((item) => (
                            <tr key={item.id} className="hover:bg-[#0c312e]/50">
                              <td className="p-2.5 font-sans">
                                <div className="font-semibold text-white">{item.product_name}</div>
                                <div className="text-[11px] text-amber-300 font-mono">
                                  {item.sku} {item.variant_name ? `• ${item.variant_name}` : ''}
                                </div>
                              </td>
                              <td className="p-2.5 font-sans text-slate-300">{item.source_location_name}</td>
                              <td className="p-2.5 text-right font-bold text-amber-400">-{item.quantity} PCS</td>
                              <td className="p-2.5 text-right text-slate-300">{formatLkr(item.unit_cost)}</td>
                              <td className="p-2.5 text-right font-bold text-rose-400">
                                {formatLkr(item.total_cost || item.quantity * item.unit_cost)}
                              </td>
                              <td className="p-2.5 font-sans text-slate-400">{item.remarks || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="p-4 bg-[#0c2e2a] border-t border-[#164e48] flex items-center justify-between">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setDetailDocId(null)}
              >
                Close
              </button>

              {detailQuery.data && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintDoc(detailQuery.data)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#082b27] hover:bg-[#0c3b36] border border-[#164e48] text-teal-300 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    <Printer size={14} /> Print Certificate
                  </button>

                  {detailQuery.data.status === 'draft' && canSubmit && (
                    <button
                      type="button"
                      onClick={() => workflowMutation.mutate({ action: 'submit', doc: detailQuery.data! })}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                    >
                      Submit for Scrap Approval
                    </button>
                  )}

                  {detailQuery.data.status === 'submitted' && canApprove && (
                    <button
                      type="button"
                      onClick={() => workflowMutation.mutate({ action: 'approve', doc: detailQuery.data! })}
                      className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                    >
                      Approve Scrap Disposal
                    </button>
                  )}

                  {detailQuery.data.status === 'approved' && canPost && (
                    <button
                      type="button"
                      onClick={() => workflowMutation.mutate({ action: 'post', doc: detailQuery.data! })}
                      className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                    >
                      Post Scrap to Ledger
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Action Reason Modal (Cancel / Reverse) ─────────────── */}
      {actionReasonModal.open && actionReasonModal.doc && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-md w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Confirm {actionReasonModal.action.toUpperCase()} Action
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setActionReasonModal({ open: false, action: 'cancel', doc: null, reason: '' })}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-[#061e1c] space-y-4">
              <p className="text-xs text-slate-300">
                You are about to <strong>{actionReasonModal.action}</strong> damaged stock voucher{' '}
                <strong className="text-amber-400 font-mono">{actionReasonModal.doc.document_number}</strong>.
              </p>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Audited Justification <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={actionReasonModal.reason}
                  onChange={(e) =>
                    setActionReasonModal((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Reason for audit trail..."
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
                />
              </div>
            </div>

            <div className="p-4 bg-[#0c2e2a] border-t border-[#164e48] flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setActionReasonModal({ open: false, action: 'cancel', doc: null, reason: '' })}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!actionReasonModal.reason.trim() || workflowMutation.isPending}
                onClick={() =>
                  workflowMutation.mutate({
                    action: actionReasonModal.action,
                    doc: actionReasonModal.doc!,
                    reason: actionReasonModal.reason.trim(),
                  })
                }
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-md transition-colors cursor-pointer disabled:opacity-40"
              >
                {workflowMutation.isPending ? 'Processing...' : `Confirm ${actionReasonModal.action.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Printable A4 Damaged Goods Inspection & Scrap Certificate ── */}
      {printDoc && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-3xl w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Printer className="w-4 h-4 text-teal-400" />
                Damaged Goods & Scrap Certificate Preview
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setPrintDoc(null)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-slate-900/60 flex justify-center max-h-[75vh] overflow-y-auto">
              <div
                id="damaged-stock-certificate-printable"
                className="w-full bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl border border-gray-300 rounded-xl"
              >
                {/* Header */}
                <div className="text-center pb-4 border-b-2 border-black mb-4">
                  <h2 className="text-xl font-black uppercase tracking-wider">Baby Bloom</h2>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-red-700">
                    Damaged Goods & Scrap Disposal Certificate
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {printDoc.branch_name} • Physical Quarantine & Write-Off Authorization
                  </p>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-4 pb-3 border-b border-gray-200">
                  <div>
                    <span className="text-gray-600">Certificate #: </span>
                    <strong className="font-mono">{printDoc.document_number}</strong>
                  </div>
                  <div>
                    <span className="text-gray-600">Incident Date: </span>
                    <strong>{printDoc.document_date}</strong>
                  </div>
                  <div>
                    <span className="text-gray-600">Branch: </span>
                    <strong>{printDoc.branch_name}</strong>
                  </div>
                  <div>
                    <span className="text-gray-600">Warehouse: </span>
                    <strong>{printDoc.warehouse_name}</strong>
                  </div>
                  <div>
                    <span className="text-gray-600">Document Type: </span>
                    <strong className="uppercase">DAMAGED STOCK SCRAP</strong>
                  </div>
                  <div>
                    <span className="text-gray-600">Status: </span>
                    <strong className="uppercase">{printDoc.status}</strong>
                  </div>
                </div>

                {/* Cause */}
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded mb-4 text-xs">
                  <div>
                    <span className="font-semibold text-gray-600">Cause & Action: </span>
                    <span className="font-medium text-red-800">{printDoc.reason || 'Damaged Stock'}</span>
                  </div>
                  {printDoc.supporting_reference && (
                    <div>
                      <span className="font-semibold text-gray-600">Reference: </span>
                      <span className="font-mono">{printDoc.supporting_reference}</span>
                    </div>
                  )}
                </div>

                {/* Table */}
                <div className="mb-4">
                  <table className="w-full text-left text-xs border border-gray-300">
                    <thead className="bg-gray-100 border-b border-gray-300 font-semibold text-[11px]">
                      <tr>
                        <th className="p-2">Item / SKU</th>
                        <th className="p-2">Location</th>
                        <th className="p-2 text-right">Damaged Qty</th>
                        <th className="p-2 text-right">Unit Cost</th>
                        <th className="p-2 text-right">Loss Total (LKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-mono text-[11px]">
                      {printDoc.items?.map((it) => (
                        <tr key={it.id}>
                          <td className="p-2 font-sans">
                            <div className="font-bold">{it.product_name}</div>
                            <div className="text-[10px] text-gray-500 font-mono">{it.sku}</div>
                          </td>
                          <td className="p-2 font-sans">{it.source_location_name}</td>
                          <td className="p-2 text-right font-bold text-red-700">-{it.quantity}</td>
                          <td className="p-2 text-right">{formatLkr(it.unit_cost)}</td>
                          <td className="p-2 text-right font-bold">{formatLkr(it.total_cost || it.quantity * it.unit_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary Total */}
                <div className="border-t-2 border-black pt-2 flex justify-between font-black text-sm mb-8">
                  <span>Total Financial Loss from Damage:</span>
                  <span className="text-red-700">{formatLkr(printDoc.total_cost || 0)}</span>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-6 pt-6 border-t border-gray-300 text-center text-xs">
                  <div>
                    <div className="border-b border-black w-32 mx-auto mb-1.5" />
                    <span className="font-semibold">Inspector / Storekeeper</span>
                  </div>
                  <div>
                    <div className="border-b border-black w-32 mx-auto mb-1.5" />
                    <span className="font-semibold">Warehouse Supervisor</span>
                  </div>
                  <div>
                    <div className="border-b border-black w-32 mx-auto mb-1.5" />
                    <span className="font-semibold">Management Authorization</span>
                  </div>
                </div>

                <div className="text-center text-[10px] text-gray-400 mt-6 pt-3 border-t border-gray-200">
                  Baby Bloom Inventory Management System • Colombo Sri Lanka
                </div>
              </div>
            </div>

            <div className="p-4 bg-[#0c2e2a] border-t border-[#164e48] flex items-center justify-between">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setPrintDoc(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-950/40 transition-colors cursor-pointer"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4" />
                Print Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Formal Printable Register Modal (A4 Master Audit) ──────────── */}
      {printRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          {/* Top Actions Bar (Hidden on print) */}
          <div className="w-full max-w-5xl bg-[#061e1c] border border-[#164e48] rounded-2xl p-4 mb-4 flex items-center justify-between shadow-2xl no-print">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-300">
                <Printer size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Damaged & Defective Stock Register Preview
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-500/30">
                    A4 Quarantine & Scrap Audit
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Ready for physical printing or PDF archival • {(damagedList.data?.rows || []).length} vouchers in current scope
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow-lg shadow-amber-950/50 transition-all cursor-pointer"
              >
                <Printer size={14} />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintRegisterModalOpen(false)}
                className="p-2 rounded-xl bg-[#082b27] hover:bg-[#0c3b36] border border-[#164e48] text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Close Preview"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Printable Sheet */}
          <div
            id="damaged-stock-register-printable"
            className="w-full max-w-5xl bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl rounded-xl border border-gray-300"
            style={{ width: '210mm', maxWidth: '96vw', backgroundColor: '#ffffff', color: '#000000', padding: '12mm 15mm' }}
          >
            {/* Header Letterhead */}
            <div className="flex items-start justify-between pb-4 border-b-2 border-black mb-4">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-gray-900 uppercase">
                  Baby Bloom (Pvt) Ltd
                </h1>
                <p className="text-[11px] text-gray-600 font-medium">
                  Premium Infant & Children Apparel, Toys & Nursery Essentials
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  No. 123 Galle Road, Colombo 03, Sri Lanka • Hotline: +94 11 234 5678 • info@babybloom.lk
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded mb-1">
                  Damaged Stock Quarantine Register
                </span>
                <div className="text-[10px] font-mono text-gray-600">
                  REF: DMG-REG-{new Date().getFullYear()}-{Math.floor(Date.now() / 1000).toString().slice(-4)}
                </div>
                <div className="text-[10px] text-gray-500">
                  Generated: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB')}
                </div>
              </div>
            </div>

            {/* Scope / Filter Description */}
            <div className="grid grid-cols-4 gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded text-[11px] mb-4">
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Branch / Facility</span>
                <span className="font-semibold text-gray-800">
                  {filterBranch !== 'all' && filterBranch
                    ? branchesQuery.data?.find((b) => b.value === filterBranch)?.label || filterBranch
                    : 'All Outlets & Central Warehouses'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Storage Warehouse</span>
                <span className="font-semibold text-gray-800">
                  {filterWarehouse !== 'all' && filterWarehouse
                    ? warehousesQuery.data?.find((w) => w.value === filterWarehouse)?.label || filterWarehouse
                    : 'All Warehouses & Holding Bays'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Quarantine Status</span>
                <span className="font-semibold text-gray-800 uppercase">
                  {statusFilter === 'all' ? 'All Document Statuses' : statusFilter}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Accounting Period</span>
                <span className="font-semibold text-gray-800">
                  {dateFrom || dateTo ? `${dateFrom || 'Start'} to ${dateTo || 'Present'}` : 'All Recorded Dates'}
                </span>
              </div>
            </div>

            {/* KPI Metric Strip */}
            <div className="grid grid-cols-4 gap-3 mb-4 text-center">
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <div className="text-[10px] uppercase text-gray-500 font-bold">Total Damage Incidents</div>
                <div className="text-base font-extrabold text-gray-900 mt-0.5">
                  {kpisQuery.data?.totalIncidents ?? (damagedList.data?.rows || []).length}
                </div>
              </div>
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <div className="text-[10px] uppercase text-gray-500 font-bold">Posted / Disposed</div>
                <div className="text-base font-extrabold text-red-700 mt-0.5">
                  {kpisQuery.data?.postedCount ?? 0}
                </div>
              </div>
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <div className="text-[10px] uppercase text-gray-500 font-bold">Pending Review</div>
                <div className="text-base font-extrabold text-amber-700 mt-0.5">
                  {kpisQuery.data?.pendingCount ?? 0}
                </div>
              </div>
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <div className="text-[10px] uppercase text-gray-500 font-bold">Cumulative Loss Valuation</div>
                <div className="text-base font-extrabold text-red-700 font-mono mt-0.5">
                  {formatLkr(kpisQuery.data?.totalLossValuation ?? (damagedList.data?.rows || []).reduce((acc, r) => acc + (r.total_cost || 0), 0))}
                </div>
              </div>
            </div>

            {/* Itemized Table */}
            <table className="w-full text-left text-[10px] border border-gray-300 mb-6">
              <thead className="bg-gray-100 border-b border-gray-300 font-bold uppercase text-[9px]">
                <tr>
                  <th className="p-2 border-r border-gray-200 text-center w-8">#</th>
                  <th className="p-2 border-r border-gray-200">Voucher Number</th>
                  <th className="p-2 border-r border-gray-200">Date</th>
                  <th className="p-2 border-r border-gray-200">Branch & Warehouse</th>
                  <th className="p-2 border-r border-gray-200">Damage Cause & Disposal</th>
                  <th className="p-2 border-r border-gray-200">Reference</th>
                  <th className="p-2 border-r border-gray-200 text-right">Scrap Loss (LKR)</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {(damagedList.data?.rows || []).map((row, idx) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="p-1.5 border-r border-gray-200 text-center text-gray-500 font-sans">{idx + 1}</td>
                    <td className="p-1.5 border-r border-gray-200 font-bold text-gray-900">{row.document_number}</td>
                    <td className="p-1.5 border-r border-gray-200 text-gray-700 whitespace-nowrap">{row.document_date}</td>
                    <td className="p-1.5 border-r border-gray-200 text-gray-800 font-sans">
                      <div className="font-semibold">{row.branch_name}</div>
                      <div className="text-[9px] text-gray-500">{row.warehouse_name}</div>
                    </td>
                    <td className="p-1.5 border-r border-gray-200 font-sans text-gray-800 max-w-xs truncate">
                      <div className="font-semibold text-red-900">{row.reason || 'Damaged Stock'}</div>
                    </td>
                    <td className="p-1.5 border-r border-gray-200 font-mono text-gray-600">
                      {row.supporting_reference || '—'}
                    </td>
                    <td className="p-1.5 border-r border-gray-200 text-right font-bold text-red-700 whitespace-nowrap">
                      {formatLkr(row.total_cost || 0)}
                    </td>
                    <td className="p-1.5 text-center font-sans">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-100 text-gray-800 border border-gray-300">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold border-t-2 border-black">
                <tr>
                  <td colSpan={6} className="p-2 text-right uppercase text-[10px] font-extrabold text-gray-800">
                    Total Financial Scrap & Damage Loss:
                  </td>
                  <td className="p-2 text-right font-mono text-xs font-black text-red-700 whitespace-nowrap">
                    {formatLkr((damagedList.data?.rows || []).reduce((acc, r) => acc + (r.total_cost || 0), 0))}
                  </td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
            </table>

            {/* Triple Authorization Signatures */}
            <div className="grid grid-cols-3 gap-8 pt-6 border-t border-gray-300 text-center text-xs mt-8">
              <div>
                <div className="border-b border-black w-40 mx-auto mb-1.5" />
                <span className="font-bold text-gray-800">Quality Inspector / Storekeeper</span>
                <p className="text-[9px] text-gray-500 mt-0.5">Defect & Physical Condition Inspected</p>
              </div>
              <div>
                <div className="border-b border-black w-40 mx-auto mb-1.5" />
                <span className="font-bold text-gray-800">Internal Audit & Safety Officer</span>
                <p className="text-[9px] text-gray-500 mt-0.5">Quarantine & Cause Verified</p>
              </div>
              <div>
                <div className="border-b border-black w-40 mx-auto mb-1.5" />
                <span className="font-bold text-gray-800">General Manager / Finance</span>
                <p className="text-[9px] text-gray-500 mt-0.5">Scrap Write-Off Authorized</p>
              </div>
            </div>

            {/* Official Disclaimer */}
            <div className="text-center text-[9px] text-gray-400 mt-6 pt-3 border-t border-gray-200">
              Baby Bloom ERP • Damaged & Defective Stock Quarantine Register • Certified Under LKAS/IAS 2 Inventory Valuation Loss Standard
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
