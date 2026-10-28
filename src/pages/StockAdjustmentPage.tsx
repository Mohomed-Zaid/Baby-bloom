import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SlidersHorizontal,
  Search,
  Plus,
  Trash2,
  Printer,
  RotateCcw,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Eye,
  Barcode,
  Building2,
  DollarSign,
  AlertCircle,
  X,
  RefreshCw,
  ShieldCheck,
  Clock,
  Package,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  FileText,
  Download,
} from 'lucide-react'
import {
  listStockAdjustmentDocuments,
  getStockAdjustmentDocument,
  getStockAdjustmentKPIs,
  createInventoryDraft,
  inventoryAction,
  postStockAdjustmentImmediate,
  listCurrentStock,
  listOpeningStockVariants,
  type StockAdjustmentDocumentWithItems,
} from '../services/inventory'
import { listLookup, resolveBarcode } from '../services/masterData'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { permissions } from '../config/permissions'
import { formatLkr } from '../lib/currency'
import { colomboNow } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { logSystemAction } from '../services/auditService'
import type { InventoryDocument, InventoryDocumentType } from '../types/inventory'

interface AdjustmentLineItem {
  key: string
  product_variant_id: string
  product_name: string
  variant_name: string
  sku: string
  barcode: string
  source_location_id: string
  source_location_name: string
  expected_quantity: number
  counted_quantity: number
  quantity: number // absolute quantity to move
  direction: 'in' | 'out'
  unit_cost: number
  batch_reference: string
  expiry_date: string
  remarks: string
}

export function StockAdjustmentPage() {
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
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBranch, setFilterBranch] = useState(activeBranchId || '')
  const [filterWarehouse, setFilterWarehouse] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // ── Form State for New Stock Adjustment ──────────────────────────────────────
  const [adjustmentBranchId, setAdjustmentBranchId] = useState(activeBranchId || '')
  const [adjustmentWarehouseId, setAdjustmentWarehouseId] = useState('')
  const [adjustmentLocationId, setAdjustmentLocationId] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<InventoryDocumentType>('stock_count')
  const [adjustmentDate, setAdjustmentDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [adjustmentReasonPreset, setAdjustmentReasonPreset] = useState('Physical Inventory Count Discrepancy')
  const [customReason, setCustomReason] = useState('')
  const [adjustmentNotes, setAdjustmentNotes] = useState('')
  const [supportingReference, setSupportingReference] = useState('')
  const [negativeStockOverride, setNegativeStockOverride] = useState(false)

  // ── Line Entry State ─────────────────────────────────────────────────────────
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lineLocationId, setLineLocationId] = useState('')

  // Specific inputs per adjustment mode
  const [itemCountedQty, setItemCountedQty] = useState<number>(0)
  const [itemDirectQty, setItemDirectQty] = useState<number>(1)
  const [itemUnitCost, setItemUnitCost] = useState<number>(0)
  const [itemBatch, setItemBatch] = useState('')
  const [itemExpiry, setItemExpiry] = useState('')
  const [itemRemarks, setItemRemarks] = useState('')

  // ── Draft Lines ──────────────────────────────────────────────────────────────
  const [adjustmentLines, setAdjustmentLines] = useState<AdjustmentLineItem[]>([])

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

  // ── CSV Export Handler ───────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const rows = adjustmentsList.data?.rows || []
    if (rows.length === 0) {
      showToast('No adjustment records found to export.', 'info')
      return
    }

    const headers = [
      'Document Number',
      'Date',
      'Branch',
      'Warehouse',
      'Adjustment Type',
      'Reason',
      'Supporting Reference',
      'Total Valuation (LKR)',
      'Status',
    ]

    const csvData = [
      headers.join(','),
      ...rows.map((r) => [
        JSON.stringify(r.document_number || ''),
        JSON.stringify(r.document_date || ''),
        JSON.stringify(r.branch_name || ''),
        JSON.stringify(r.warehouse_name || ''),
        JSON.stringify(r.document_type || ''),
        JSON.stringify(r.reason || ''),
        JSON.stringify(r.supporting_reference || ''),
        r.total_cost || 0,
        JSON.stringify(r.status || ''),
      ].join(',')),
    ].join('\n')

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `stock-adjustments-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${rows.length} adjustment vouchers to CSV.`, 'success')
  }

  // ── Queries ──────────────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  // Set default branch when loaded
  React.useEffect(() => {
    if (!adjustmentBranchId && branchesQuery.data && branchesQuery.data.length > 0) {
      setAdjustmentBranchId(branchesQuery.data[0]?.value || '')
    }
    if (!filterBranch && branchesQuery.data && branchesQuery.data.length > 0) {
      setFilterBranch(branchesQuery.data[0]?.value || '')
    }
  }, [branchesQuery.data, adjustmentBranchId, filterBranch])

  const warehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', adjustmentBranchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: adjustmentBranchId, is_active: true }),
    enabled: !!adjustmentBranchId,
  })

  React.useEffect(() => {
    if (warehousesQuery.data && warehousesQuery.data.length > 0) {
      setAdjustmentWarehouseId(warehousesQuery.data[0]?.value || '')
    } else {
      setAdjustmentWarehouseId('')
    }
  }, [warehousesQuery.data])

  const locationsQuery = useQuery({
    queryKey: ['lookup', 'locations', adjustmentWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: adjustmentWarehouseId, is_active: true }),
    enabled: !!adjustmentWarehouseId,
  })

  React.useEffect(() => {
    if (locationsQuery.data && locationsQuery.data.length > 0) {
      setAdjustmentLocationId(locationsQuery.data[0]?.value || '')
    } else {
      setAdjustmentLocationId('')
    }
  }, [locationsQuery.data])

  const variantsQuery = useQuery({
    queryKey: ['opening-stock-variants-lookup'],
    queryFn: () => listOpeningStockVariants(),
    staleTime: 60000,
  })

  // Selected variant details
  const selectedVariantDetails = useMemo(() => {
    if (!selectedVariantId || !variantsQuery.data) return null
    return variantsQuery.data.find((v) => v.id === selectedVariantId)
  }, [selectedVariantId, variantsQuery.data])

  // Current stock check for the selected location and variant
  const effectiveLocationId = lineLocationId || adjustmentLocationId
  const currentStockCheck = useQuery({
    queryKey: ['stock-available-for-adjustment', effectiveLocationId, selectedVariantId],
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

  // Auto-populate unit cost & counted qty when variant changes
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
      setItemCountedQty(onHandQuantity)
    }
  }, [selectedVariantDetails, currentWeightedCost, onHandQuantity])

  // ── List Adjustments Query ───────────────────────────────────────────────────
  const adjustmentsList = useQuery({
    queryKey: [
      'stock-adjustments-list',
      page,
      searchQuery,
      statusFilter,
      typeFilter,
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
        documentType: typeFilter,
        status: statusFilter,
        dateFrom,
        dateTo,
      }),
  })

  // ── KPIs Query ───────────────────────────────────────────────────────────────
  const kpisQuery = useQuery({
    queryKey: ['stock-adjustments-kpis', filterBranch],
    queryFn: () => getStockAdjustmentKPIs(filterBranch),
  })

  // ── Document Detail Query ────────────────────────────────────────────────────
  const detailQuery = useQuery({
    queryKey: ['stock-adjustment-detail', detailDocId],
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
          showToast(`No product matching barcode "${barcodeInput}"`, 'error')
        }
      }
    } catch (err) {
      showToast(getErrorMessage(err), 'error')
    }
  }

  // ── Add Item Line ────────────────────────────────────────────────────────────
  const handleAddLine = () => {
    if (!selectedVariantDetails) {
      showToast('Please select a product variant to adjust.', 'error')
      return
    }

    const locId = lineLocationId || adjustmentLocationId
    if (!locId) {
      showToast('Please select a stock location.', 'error')
      return
    }

    const locName = locationsQuery.data?.find((l) => l.value === locId)?.label || 'Warehouse Location'

    let computedQty = 0
    let dir: 'in' | 'out' = 'in'

    if (adjustmentType === 'stock_count') {
      const diff = Number(itemCountedQty) - Number(onHandQuantity)
      if (diff === 0) {
        showToast('Counted quantity equals system on-hand quantity. No adjustment needed for this item.', 'info')
        return
      }
      computedQty = Math.abs(diff)
      dir = diff > 0 ? 'in' : 'out'
    } else if (adjustmentType === 'stock_adjustment_in') {
      if (itemDirectQty <= 0) {
        showToast('Adjustment quantity must be greater than 0.', 'error')
        return
      }
      if (itemUnitCost <= 0) {
        showToast('Stock adjustment in requires a unit cost greater than 0.', 'error')
        return
      }
      computedQty = Number(itemDirectQty)
      dir = 'in'
    } else {
      // adjustment_out, damaged_stock, stock_write_off
      if (itemDirectQty <= 0) {
        showToast('Adjustment quantity must be greater than 0.', 'error')
        return
      }
      computedQty = Number(itemDirectQty)
      dir = 'out'
    }

    const newLine: AdjustmentLineItem = {
      key: crypto.randomUUID(),
      product_variant_id: selectedVariantDetails.id,
      product_name: selectedVariantDetails.product_name,
      variant_name: selectedVariantDetails.variant_name,
      sku: selectedVariantDetails.sku,
      barcode: selectedVariantDetails.barcode || '',
      source_location_id: locId,
      source_location_name: locName,
      expected_quantity: onHandQuantity,
      counted_quantity: adjustmentType === 'stock_count' ? Number(itemCountedQty) : onHandQuantity + (dir === 'in' ? computedQty : -computedQty),
      quantity: computedQty,
      direction: dir,
      unit_cost: Number(itemUnitCost),
      batch_reference: itemBatch.trim(),
      expiry_date: itemExpiry,
      remarks: itemRemarks.trim(),
    }

    setAdjustmentLines((prev) => [...prev, newLine])

    // Reset line form
    setSelectedVariantId('')
    setItemDirectQty(1)
    setItemCountedQty(0)
    setItemBatch('')
    setItemExpiry('')
    setItemRemarks('')
    setBarcodeInput('')
    showToast(`Added ${selectedVariantDetails.sku} (${newLine.direction === 'in' ? '+' : '-'}${newLine.quantity} units)`, 'success')
  }

  const handleRemoveLine = (key: string) => {
    setAdjustmentLines((prev) => prev.filter((l) => l.key !== key))
  }

  // ── Calculation Summary ──────────────────────────────────────────────────────
  const draftSummary = useMemo(() => {
    const totalLines = adjustmentLines.length
    const totalInUnits = adjustmentLines.filter((l) => l.direction === 'in').reduce((acc, l) => acc + l.quantity, 0)
    const totalOutUnits = adjustmentLines.filter((l) => l.direction === 'out').reduce((acc, l) => acc + l.quantity, 0)
    const totalValuation = adjustmentLines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0)
    return { totalLines, totalInUnits, totalOutUnits, totalValuation }
  }, [adjustmentLines])

  // ── Save Draft Mutation ──────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!adjustmentBranchId) throw new Error('Please select a Branch.')
      if (!adjustmentWarehouseId) throw new Error('Please select a Warehouse.')
      if (adjustmentLines.length === 0) throw new Error('Add at least one item line to save adjustment.')

      const finalReason = customReason.trim() ? customReason.trim() : adjustmentReasonPreset

      return await createInventoryDraft({
        branch_id: adjustmentBranchId,
        warehouse_id: adjustmentWarehouseId,
        document_type: adjustmentType,
        document_date: adjustmentDate,
        supporting_reference: supportingReference || undefined,
        notes: adjustmentNotes || undefined,
        reason: finalReason,
        negative_stock_override: negativeStockOverride,
        items: adjustmentLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          expected_quantity: l.expected_quantity,
          counted_quantity: l.counted_quantity,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: l.remarks || undefined,
        })),
      })
    },
    onSuccess: (draftRes) => {
      showToast('Adjustment draft saved successfully!', 'success')
      void logSystemAction({
        branchId: adjustmentBranchId || activeBranchId,
        eventType: 'other',
        severity: 'info',
        targetTable: 'inventory_documents',
        targetId: draftRes,
        action: 'stock_adjustment_draft',
        title: `Stock Adjustment Draft (${adjustmentType})`,
        details: {
          document_number: draftRes,
          type: adjustmentType,
          reason: customReason.trim() || adjustmentReasonPreset,
          lines: adjustmentLines.length,
          total_units: adjustmentLines.reduce((acc, l) => acc + l.quantity, 0),
        },
      })
      setAdjustmentLines([])
      setCustomReason('')
      setAdjustmentNotes('')
      setSupportingReference('')
      setActiveTab('register')
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments-list'] })
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments-kpis'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // ── Post Immediate Mutation ──────────────────────────────────────────────────
  const postImmediateMutation = useMutation({
    mutationFn: async () => {
      if (!adjustmentBranchId) throw new Error('Please select a Branch.')
      if (!adjustmentWarehouseId) throw new Error('Please select a Warehouse.')
      if (adjustmentLines.length === 0) throw new Error('Add at least one item line to post adjustment.')

      const finalReason = customReason.trim() ? customReason.trim() : adjustmentReasonPreset

      return await postStockAdjustmentImmediate({
        branch_id: adjustmentBranchId,
        warehouse_id: adjustmentWarehouseId,
        document_type: adjustmentType,
        document_date: adjustmentDate,
        supporting_reference: supportingReference || undefined,
        notes: adjustmentNotes || undefined,
        reason: finalReason,
        negative_stock_override: negativeStockOverride,
        items: adjustmentLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          expected_quantity: l.expected_quantity,
          counted_quantity: l.counted_quantity,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: l.remarks || undefined,
        })),
      })
    },
    onSuccess: (result) => {
      showToast(`Stock Adjustment ${result.document_number} posted and committed to inventory!`, 'success')
      void logSystemAction({
        branchId: adjustmentBranchId || activeBranchId,
        eventType: 'other',
        severity: 'info',
        targetTable: 'inventory_documents',
        targetId: result.id,
        action: 'stock_adjustment_posted',
        title: `Stock Adjustment #${result.document_number} Posted`,
        details: {
          document_number: result.document_number,
          type: adjustmentType,
          reason: customReason.trim() || adjustmentReasonPreset,
          lines: adjustmentLines.length,
          total_valuation: adjustmentLines.reduce((acc, l) => acc + (l.quantity * l.unit_cost), 0),
        },
      })
      setAdjustmentLines([])
      setCustomReason('')
      setAdjustmentNotes('')
      setSupportingReference('')
      setActiveTab('register')
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments-list'] })
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments-kpis'] })
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
    onSuccess: (res, vars) => {
      showToast(`Voucher ${res.document_number} marked as ${res.status.toUpperCase()}!`, 'success')
      void logSystemAction({
        branchId: activeBranchId,
        eventType: res.status === 'reversed' ? 'stock_reversal' : 'other',
        severity: res.status === 'reversed' || res.status === 'cancelled' ? 'warning' : 'info',
        targetTable: 'inventory_documents',
        targetId: res.id,
        action: `stock_adjustment_${res.status}`,
        title: `Stock Adjustment #${res.document_number} ${res.status.toUpperCase()}`,
        details: {
          document_number: res.document_number,
          status: res.status,
          workflow_action: vars.action,
          reason: vars.reason || undefined,
        },
      })
      setActionReasonModal({ open: false, action: 'cancel', doc: null, reason: '' })
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments-list'] })
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments-kpis'] })
      queryClient.invalidateQueries({ queryKey: ['stock-adjustment-detail', detailDocId] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // Type badge styling helper
  const renderTypeBadge = (t: string) => {
    switch (t) {
      case 'stock_count':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-950/80 text-purple-300 border border-purple-500/40">
            <SlidersHorizontal size={11} /> Count Reconciliation
          </span>
        )
      case 'stock_adjustment_in':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
            <ArrowDownRight size={11} /> Adjustment IN (+)
          </span>
        )
      case 'stock_adjustment_out':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-950/80 text-rose-300 border border-rose-500/40">
            <ArrowUpRight size={11} /> Adjustment OUT (-)
          </span>
        )
      case 'damaged_stock':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40">
            <AlertTriangle size={11} /> Damaged Stock
          </span>
        )
      case 'stock_write_off':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-950/80 text-red-300 border border-red-500/40">
            <Trash2 size={11} /> Write-Off
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-600">
            {t}
          </span>
        )
    }
  }

  // Status badge styling helper
  const renderStatusBadge = (st: string) => {
    switch (st) {
      case 'posted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#063026] text-[#10b981] border border-[#10b981]/30">
            <CheckCircle2 size={12} /> Posted
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
            <Clock size={12} /> Submitted
          </span>
        )
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#1a1c23] text-[#9ca3af] border border-[#4b5563]/40">
            Draft
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
      {/* ── Toast Message ──────────────────────────────────────────────── */}
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
            <span className="text-teal-200">Stock Control</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            Stock Adjustments & Count Reconciliation
            <span className="text-xs px-2.5 py-1 rounded-md bg-[#164e48]/60 text-teal-300 font-mono font-medium border border-teal-500/30">
              Audit Control
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Reconcile physical stock counts, record inventory write-offs, handle warehouse damages, and adjust stock quantities with automated cost-layer tracking.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Tab Switcher Pills */}
          <div className="bg-[#061e1c] border border-[#164e48] p-1 rounded-xl inline-flex gap-1">
            <button
              type="button"
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-md'
                  : 'text-teal-300/80 hover:text-white hover:bg-[#0c312e]'
              }`}
              onClick={() => setActiveTab('register')}
            >
              <FileText className="w-3.5 h-3.5" />
              Adjustments Register
            </button>
            <button
              type="button"
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'new_entry'
                  ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-md'
                  : 'text-teal-300/80 hover:text-white hover:bg-[#0c312e]'
              }`}
              onClick={() => setActiveTab('new_entry')}
            >
              <Plus className="w-3.5 h-3.5" />
              + New Stock Adjustment
            </button>
          </div>

          {/* Action Toolbar Buttons */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] hover:border-teal-500/50 transition-all cursor-pointer shadow-sm"
            title="Export Stock Adjustment Register to CSV Spreadsheet"
          >
            <Download size={14} className="text-teal-400" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setPrintRegisterModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] hover:border-teal-500/50 transition-all cursor-pointer shadow-sm"
            title="Generate Formal A4 Physical Count & Adjustment Audit Report"
          >
            <Printer size={14} className="text-teal-400" />
            <span>Print Register</span>
          </button>

          <Link
            to="/inventory/current-stock"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="View Real-Time Available Stock"
          >
            <Package size={14} /> Current Stock
          </Link>

          <Link
            to="/inventory/stock-movement"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Audit Full Movement History"
          >
            <Layers size={14} /> Movement Logs
          </Link>

          <button
            type="button"
            onClick={() => {
              adjustmentsList.refetch()
              kpisQuery.refetch()
              showToast('Refreshed stock adjustments', 'info')
            }}
            disabled={adjustmentsList.isRefetching}
            className="p-2.5 rounded-xl bg-[#061e1c] hover:bg-[#0c312e] text-teal-400 border border-[#164e48] transition-colors cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw size={15} className={adjustmentsList.isRefetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── 4 KPI Glassmorphic Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Adjustments */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-teal-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Adjustments</span>
            <div className="p-2 rounded-xl bg-[#0e3b37] border border-[#164e48] text-teal-300">
              <SlidersHorizontal size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {kpisQuery.data?.totalAdjustments ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">All registered adjustment documents</div>
        </div>

        {/* Card 2: Posted & Committed */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Posted & Committed</span>
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-400 tracking-tight">
            {kpisQuery.data?.postedAdjustments ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">Inventory levels updated in ledger</div>
        </div>

        {/* Card 3: Pending Approval */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Pending Review</span>
            <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-amber-400 tracking-tight">
            {kpisQuery.data?.pendingAdjustments ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">Drafts and submitted vouchers</div>
        </div>

        {/* Card 4: Total Adjusted Valuation */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Adjusted Valuation</span>
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-cyan-300 tracking-tight font-mono">
            {formatLkr(kpisQuery.data?.totalValuation ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-400">Cumulative financial adjustment value</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: ADJUSTMENTS REGISTER (LIST & AUDIT TRAIL)                    */}
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
                placeholder="Search document #, reason, remarks..."
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

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
            >
              <option value="all">All Adjustment Types</option>
              <option value="stock_count">Stock Count Difference</option>
              <option value="stock_adjustment_in">Adjustment IN (+)</option>
              <option value="stock_adjustment_out">Adjustment OUT (-)</option>
              <option value="damaged_stock">Damaged Stock</option>
              <option value="stock_write_off">Stock Write-Off</option>
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
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="posted">Posted</option>
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

            {(searchQuery || filterBranch !== 'all' || typeFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setFilterBranch('all')
                  setTypeFilter('all')
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
                    <th className="p-3.5">Document #</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Branch / Warehouse</th>
                    <th className="p-3.5">Adjustment Type</th>
                    <th className="p-3.5">Reason / Reference</th>
                    <th className="p-3.5 text-right">Total Valuation</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#164e48]/40">
                  {adjustmentsList.isLoading ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-teal-300 text-sm">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-teal-400" />
                        Loading stock adjustment vouchers...
                      </td>
                    </tr>
                  ) : adjustmentsList.data?.rows && adjustmentsList.data.rows.length > 0 ? (
                    adjustmentsList.data.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-[#0c312e]/50 transition-colors">
                        {/* Doc Number */}
                        <td className="p-3.5 font-mono font-bold text-white">
                          <button
                            type="button"
                            onClick={() => setDetailDocId(row.id)}
                            className="text-teal-300 hover:text-white underline decoration-teal-500/40 cursor-pointer"
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

                        {/* Type */}
                        <td className="p-3.5">
                          {renderTypeBadge(row.document_type)}
                        </td>

                        {/* Reason */}
                        <td className="p-3.5 text-slate-300 max-w-xs truncate" title={row.reason || ''}>
                          <span className="font-medium text-slate-200">{row.reason || 'Inventory Adjustment'}</span>
                          {row.supporting_reference && (
                            <span className="block text-[10px] text-teal-400 font-mono mt-0.5">
                              Ref: {row.supporting_reference}
                            </span>
                          )}
                        </td>

                        {/* Valuation */}
                        <td className="p-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
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
                              title="View Document Details"
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
                              title="Print A4 Voucher"
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
                                title="Submit Draft for Approval"
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
                                title="Authorize & Approve Voucher"
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
                                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white text-[11px] font-bold shadow-md transition-colors cursor-pointer"
                                title="Commit & Post to Inventory"
                              >
                                Post
                              </button>
                            )}

                            {/* Cancel (if draft or submitted) */}
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
                                title="Cancel Voucher"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}

                            {/* Reverse (if posted) */}
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
                                title="Reverse Posted Stock Movement"
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
                      <td colSpan={8} className="p-12 text-center text-slate-400 text-sm">
                        No stock adjustment records found matching your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            <div className="p-4 bg-[#082b27] border-t border-[#164e48] flex items-center justify-between text-xs text-slate-300">
              <div>
                Showing Page <strong className="text-white">{page}</strong> (
                {adjustmentsList.data?.count ?? 0} total records)
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
                  disabled={(adjustmentsList.data?.count ?? 0) <= page * 15}
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
      {/* TAB 2: NEW STOCK ADJUSTMENT ENTRY FORM                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'new_entry' && (
        <div className="space-y-6">
          {/* Header Configuration Panel */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-[#164e48] pb-3">
              <Building2 className="w-5 h-5 text-teal-400" />
              1. Location & Adjustment Parameters
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Branch Selection */}
              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Operating Branch <span className="text-rose-400">*</span>
                </label>
                <select
                  value={adjustmentBranchId}
                  onChange={(e) => setAdjustmentBranchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  {branchesQuery.data?.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse Selection */}
              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Warehouse <span className="text-rose-400">*</span>
                </label>
                <select
                  value={adjustmentWarehouseId}
                  onChange={(e) => setAdjustmentWarehouseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  {warehousesQuery.data?.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Default Location Selection */}
              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Default Bin / Location <span className="text-rose-400">*</span>
                </label>
                <select
                  value={adjustmentLocationId}
                  onChange={(e) => setAdjustmentLocationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  {locationsQuery.data?.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Document Date */}
              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Document Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  value={adjustmentDate}
                  onChange={(e) => setAdjustmentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                />
              </div>
            </div>

            {/* Adjustment Type Selection Ribbon */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-2">
                Adjustment Type & Workflow Mode <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {[
                  {
                    id: 'stock_count' as const,
                    label: 'Count Reconciliation',
                    desc: 'Physical count vs system',
                    icon: SlidersHorizontal,
                    color: 'purple',
                  },
                  {
                    id: 'stock_adjustment_in' as const,
                    label: 'Adjustment IN (+)',
                    desc: 'Add stock / surplus found',
                    icon: ArrowDownRight,
                    color: 'emerald',
                  },
                  {
                    id: 'stock_adjustment_out' as const,
                    label: 'Adjustment OUT (-)',
                    desc: 'Reduce stock / shortage',
                    icon: ArrowUpRight,
                    color: 'rose',
                  },
                  {
                    id: 'damaged_stock' as const,
                    label: 'Damaged Stock (-)',
                    desc: 'Remove defective units',
                    icon: AlertTriangle,
                    color: 'amber',
                  },
                  {
                    id: 'stock_write_off' as const,
                    label: 'Stock Write-Off (-)',
                    desc: 'Obsolete / condemned loss',
                    icon: Trash2,
                    color: 'red',
                  },
                ].map((type) => {
                  const Icon = type.icon
                  const active = adjustmentType === type.id
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setAdjustmentType(type.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-[#0e3b37] border-teal-400 text-white shadow-lg ring-1 ring-teal-400'
                          : 'bg-[#031413] border-[#164e48] text-slate-300 hover:text-white hover:bg-[#0c2e2a]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={16} className={active ? 'text-teal-300' : 'text-slate-400'} />
                        <span className="text-xs font-bold">{type.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block">{type.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Reason Presets & Reference */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Adjustment Reason Preset
                </label>
                <select
                  value={adjustmentReasonPreset}
                  onChange={(e) => setAdjustmentReasonPreset(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                >
                  <option value="Physical Inventory Count Discrepancy">Physical Inventory Count Discrepancy</option>
                  <option value="Warehouse Handling Damage / Breakage">Warehouse Handling Damage / Breakage</option>
                  <option value="Product Expiration / Spoilage">Product Expiration / Spoilage</option>
                  <option value="Supplier Delivery Discrepancy">Supplier Delivery Discrepancy</option>
                  <option value="Showroom Sample / Marketing Display">Showroom Sample / Marketing Display</option>
                  <option value="Unrecorded Returns Found in Stock">Unrecorded Returns Found in Stock</option>
                  <option value="Inventory Shrinkage / Theft Investigation">Inventory Shrinkage / Theft Investigation</option>
                  <option value="Administrative SKU Correction">Administrative SKU Correction</option>
                  <option value="Other">Other (Custom Reason)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Custom Reason / Explanation
                </label>
                <input
                  type="text"
                  placeholder="Additional details for audit trail..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Supporting Reference / Incident #
                </label>
                <input
                  type="text"
                  placeholder="e.g. AUDIT-2026-Q3 / INC-094"
                  value={supportingReference}
                  onChange={(e) => setSupportingReference(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:border-teal-400 outline-none font-mono"
                />
              </div>
            </div>

            {/* Negative stock override checkbox */}
            <div className="pt-2 flex items-center justify-between bg-[#031413] p-3 rounded-xl border border-[#164e48]">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={negativeStockOverride}
                  onChange={(e) => setNegativeStockOverride(e.target.checked)}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 bg-[#082321] border-[#164e48]"
                />
                <span>Request audited negative-stock override (Permitted only for authorized stock controllers)</span>
              </label>
              <span className="text-[11px] text-teal-400 font-mono">Asia/Colombo Continuous Costing</span>
            </div>
          </div>

          {/* ── Line Item Builder ────────────────────────────────────────── */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#164e48] pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-teal-400" />
                2. Select Product Variant & Quantities
              </h2>
              {selectedVariantDetails && (
                <div className="flex items-center gap-3 text-xs bg-[#031413] border border-[#164e48] px-3 py-1.5 rounded-xl font-mono">
                  <span className="text-slate-400">System On-Hand:</span>
                  <strong className="text-teal-300">{onHandQuantity} PCS</strong>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400">Available:</span>
                  <strong className="text-emerald-400">{availableQuantity} PCS</strong>
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
                placeholder="Scan or enter barcode / SKU and press Enter..."
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
                  <option value="">-- Choose Product Variant (SKU / Name) --</option>
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
                  value={lineLocationId || adjustmentLocationId}
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

            {/* Dynamic Quantity & Cost Inputs */}
            {selectedVariantDetails && (
              <div className="p-4 bg-[#031413] rounded-2xl border border-[#164e48] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {/* If Count Reconciliation Mode */}
                  {adjustmentType === 'stock_count' ? (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          System Expected Qty
                        </label>
                        <div className="px-3.5 py-2.5 bg-[#061e1c] border border-[#164e48] rounded-xl text-sm text-white font-mono font-bold">
                          {onHandQuantity} PCS
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1">
                          Physical Counted Qty <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          value={itemCountedQty}
                          onChange={(e) => setItemCountedQty(Number(e.target.value))}
                          step="1"
                          min="0"
                          className="w-full px-3.5 py-2.5 bg-[#082321] border border-teal-500/50 rounded-xl text-sm text-white font-mono font-bold focus:border-teal-400 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          Calculated Discrepancy
                        </label>
                        <div className="px-3.5 py-2.5 bg-[#061e1c] border border-[#164e48] rounded-xl text-sm font-mono font-bold">
                          {itemCountedQty - onHandQuantity === 0 ? (
                            <span className="text-slate-400">0 (Balanced)</span>
                          ) : itemCountedQty - onHandQuantity > 0 ? (
                            <span className="text-emerald-400">+{itemCountedQty - onHandQuantity} PCS (Surplus / In)</span>
                          ) : (
                            <span className="text-rose-400">{itemCountedQty - onHandQuantity} PCS (Shortage / Out)</span>
                          )}
                        </div>
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
                    </>
                  ) : (
                    /* Other Modes: Direct Quantity Input */
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          Current On-Hand
                        </label>
                        <div className="px-3.5 py-2.5 bg-[#061e1c] border border-[#164e48] rounded-xl text-sm text-white font-mono font-bold">
                          {onHandQuantity} PCS
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1">
                          Quantity to Adjust <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          value={itemDirectQty}
                          onChange={(e) => setItemDirectQty(Number(e.target.value))}
                          step="1"
                          min="1"
                          className="w-full px-3.5 py-2.5 bg-[#082321] border border-teal-500/50 rounded-xl text-sm text-white font-mono font-bold focus:border-teal-400 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          Projected Stock After
                        </label>
                        <div className="px-3.5 py-2.5 bg-[#061e1c] border border-[#164e48] rounded-xl text-sm font-mono font-bold">
                          {adjustmentType === 'stock_adjustment_in' ? (
                            <span className="text-emerald-400">
                              {onHandQuantity + Number(itemDirectQty)} PCS (+{itemDirectQty})
                            </span>
                          ) : (
                            <span className="text-rose-400">
                              {onHandQuantity - Number(itemDirectQty)} PCS (-{itemDirectQty})
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1">
                          Unit Cost (LKR) <span className="text-rose-400">*</span>
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
                    </>
                  )}
                </div>

                {/* Batch, Expiry, Remarks & Add Button */}
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
                      Line Remarks
                    </label>
                    <input
                      type="text"
                      placeholder="Reason for line adjustment..."
                      value={itemRemarks}
                      onChange={(e) => setItemRemarks(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#082321] border border-[#164e48] rounded-xl text-xs text-white focus:border-teal-400 outline-none"
                    />
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="w-full py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={15} /> Add Line Item
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Table of Staged Draft Lines ───────────────────────────── */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal size={14} />
                  Adjusted Line Items ({adjustmentLines.length})
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  Net Units: +{draftSummary.totalInUnits} / -{draftSummary.totalOutUnits} • Valuation: {formatLkr(draftSummary.totalValuation)}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#164e48]/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#082b27] border-b border-[#164e48] text-teal-300 uppercase font-semibold">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Product / SKU</th>
                      <th className="p-3">Location</th>
                      <th className="p-3 text-right">System Qty</th>
                      <th className="p-3 text-right">Counted Qty</th>
                      <th className="p-3 text-right">Adjusted Qty</th>
                      <th className="p-3 text-right">Unit Cost</th>
                      <th className="p-3 text-right">Line Valuation</th>
                      <th className="p-3">Remarks</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#164e48]/40 font-mono">
                    {adjustmentLines.length > 0 ? (
                      adjustmentLines.map((line, idx) => (
                        <tr key={line.key} className="hover:bg-[#0c312e]/50 transition-colors">
                          <td className="p-3 text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-sans">
                            <div className="font-semibold text-white">{line.product_name}</div>
                            <div className="text-[11px] text-teal-300 font-mono">
                              SKU: {line.sku} {line.variant_name ? `• ${line.variant_name}` : ''}
                            </div>
                          </td>
                          <td className="p-3 font-sans text-slate-300">{line.source_location_name}</td>
                          <td className="p-3 text-right text-slate-400">{line.expected_quantity}</td>
                          <td className="p-3 text-right text-slate-200">{line.counted_quantity}</td>
                          <td className="p-3 text-right font-bold">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] ${
                                line.direction === 'in'
                                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-rose-950/80 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              {line.direction === 'in' ? '+' : '-'}
                              {line.quantity}
                            </span>
                          </td>
                          <td className="p-3 text-right text-slate-300">{formatLkr(line.unit_cost)}</td>
                          <td className="p-3 text-right font-bold text-white">
                            {formatLkr(line.quantity * line.unit_cost)}
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
                        <td colSpan={10} className="p-8 text-center text-slate-400 text-xs font-sans">
                          No items added yet. Select a product variant above or scan barcode to add lines.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Actions & Finalize */}
            <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[#164e48]">
              <div className="text-xs text-slate-300">
                Total Valuation Impact:{' '}
                <strong className="text-lg text-emerald-300 font-mono font-bold">
                  {formatLkr(draftSummary.totalValuation)}
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
                  disabled={saveDraftMutation.isPending || adjustmentLines.length === 0}
                  onClick={() => saveDraftMutation.mutate()}
                  className="px-5 py-2.5 bg-[#082b27] hover:bg-[#0c3b36] border border-teal-500/40 text-teal-300 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
                >
                  {saveDraftMutation.isPending ? 'Saving Draft...' : 'Save as Draft'}
                </button>

                <button
                  type="button"
                  disabled={postImmediateMutation.isPending || adjustmentLines.length === 0}
                  onClick={() => postImmediateMutation.mutate()}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  <PlayCircle size={15} />
                  {postImmediateMutation.isPending ? 'Posting & Committing...' : 'Post & Commit Immediately'}
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
            {/* Header */}
            <div className="p-5 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-teal-400" />
                  Stock Adjustment Voucher #{detailQuery.data?.document_number}
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

            {/* Body */}
            <div className="p-6 bg-[#061e1c] overflow-y-auto space-y-6">
              {detailQuery.isLoading ? (
                <div className="p-12 text-center text-teal-300">Loading voucher details...</div>
              ) : detailQuery.data ? (
                <>
                  {/* Metadata Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#031413] p-4 rounded-xl border border-[#164e48] text-xs">
                    <div>
                      <span className="text-slate-400 block">Status:</span>
                      <div className="mt-1">{renderStatusBadge(detailQuery.data.status)}</div>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Type:</span>
                      <div className="mt-1">{renderTypeBadge(detailQuery.data.document_type)}</div>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Document Date:</span>
                      <span className="font-semibold text-white mt-1 block">{detailQuery.data.document_date}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Total Valuation:</span>
                      <span className="font-bold font-mono text-emerald-300 mt-1 block">
                        {formatLkr(detailQuery.data.total_cost || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Reason & Reference */}
                  <div className="bg-[#031413] p-4 rounded-xl border border-[#164e48] text-xs space-y-1">
                    <div>
                      <span className="text-slate-400 font-semibold">Reason: </span>
                      <span className="text-white">{detailQuery.data.reason || 'None specified'}</span>
                    </div>
                    {detailQuery.data.supporting_reference && (
                      <div>
                        <span className="text-slate-400 font-semibold">Supporting Reference: </span>
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

                  {/* Line Items Table */}
                  <div>
                    <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider mb-2">
                      Adjusted Items ({detailQuery.data.items?.length || 0})
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-[#164e48]/60">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#082b27] border-b border-[#164e48] text-teal-300 uppercase">
                          <tr>
                            <th className="p-2.5">Item</th>
                            <th className="p-2.5">Location</th>
                            <th className="p-2.5 text-right">System Qty</th>
                            <th className="p-2.5 text-right">Counted Qty</th>
                            <th className="p-2.5 text-right">Adjusted Qty</th>
                            <th className="p-2.5 text-right">Unit Cost</th>
                            <th className="p-2.5 text-right">Line Total</th>
                            <th className="p-2.5">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#164e48]/40">
                          {detailQuery.data.items?.map((item) => (
                            <tr key={item.id} className="hover:bg-[#0c312e]/50">
                              <td className="p-2.5 font-sans">
                                <div className="font-semibold text-white">{item.product_name}</div>
                                <div className="text-[11px] text-teal-300 font-mono">
                                  {item.sku} {item.variant_name ? `• ${item.variant_name}` : ''}
                                </div>
                              </td>
                              <td className="p-2.5 font-sans text-slate-300">{item.source_location_name}</td>
                              <td className="p-2.5 text-right text-slate-400">{item.expected_quantity ?? '—'}</td>
                              <td className="p-2.5 text-right text-slate-200">{item.counted_quantity ?? '—'}</td>
                              <td className="p-2.5 text-right font-bold text-emerald-300">{item.quantity}</td>
                              <td className="p-2.5 text-right text-slate-300">{formatLkr(item.unit_cost)}</td>
                              <td className="p-2.5 text-right font-bold text-white">{formatLkr(item.total_cost || item.quantity * item.unit_cost)}</td>
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

            {/* Footer */}
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
                    <Printer size={14} /> Print Voucher
                  </button>

                  {detailQuery.data.status === 'draft' && canSubmit && (
                    <button
                      type="button"
                      onClick={() => workflowMutation.mutate({ action: 'submit', doc: detailQuery.data! })}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                    >
                      Submit for Approval
                    </button>
                  )}

                  {detailQuery.data.status === 'submitted' && canApprove && (
                    <button
                      type="button"
                      onClick={() => workflowMutation.mutate({ action: 'approve', doc: detailQuery.data! })}
                      className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                    >
                      Approve Voucher
                    </button>
                  )}

                  {detailQuery.data.status === 'approved' && canPost && (
                    <button
                      type="button"
                      onClick={() => workflowMutation.mutate({ action: 'post', doc: detailQuery.data! })}
                      className="px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                    >
                      Post to Ledger
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Action Reason Modal (Cancel / Reverse / Reject) ──────── */}
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
                You are about to <strong>{actionReasonModal.action}</strong> voucher{' '}
                <strong className="text-teal-300 font-mono">{actionReasonModal.doc.document_number}</strong>. Please
                provide an audited justification:
              </p>

              <div>
                <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider mb-1.5">
                  Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={actionReasonModal.reason}
                  onChange={(e) =>
                    setActionReasonModal((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Required justification for audit trail..."
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

      {/* ── MODAL 3: Printable A4 Stock Adjustment Voucher ───────────────── */}
      {printDoc && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-3xl w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Printer className="w-4 h-4 text-teal-400" />
                Stock Adjustment Voucher Preview
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setPrintDoc(null)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Paper Box */}
            <div className="p-6 bg-slate-900/60 flex justify-center max-h-[75vh] overflow-y-auto">
              <div
                id="stock-adjustment-voucher-printable"
                className="w-full bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl border border-gray-300 rounded-xl"
              >
                {/* Header */}
                <div className="text-center pb-4 border-b-2 border-black mb-4">
                  <h2 className="text-xl font-black uppercase tracking-wider">Baby Bloom</h2>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-700">
                    Stock Adjustment Voucher
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {printDoc.branch_name} • Physical Inventory Discrepancy & Valuation Audit
                  </p>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-4 pb-3 border-b border-gray-200">
                  <div>
                    <span className="text-gray-600">Voucher Number: </span>
                    <strong className="font-mono">{printDoc.document_number}</strong>
                  </div>
                  <div>
                    <span className="text-gray-600">Date: </span>
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
                    <span className="text-gray-600">Adjustment Type: </span>
                    <strong className="uppercase">{printDoc.document_type.replace(/_/g, ' ')}</strong>
                  </div>
                  <div>
                    <span className="text-gray-600">Status: </span>
                    <strong className="uppercase">{printDoc.status}</strong>
                  </div>
                </div>

                {/* Reason & Reference */}
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded mb-4 text-xs">
                  <div>
                    <span className="font-semibold text-gray-600">Reason: </span>
                    <span>{printDoc.reason || 'Not specified'}</span>
                  </div>
                  {printDoc.supporting_reference && (
                    <div>
                      <span className="font-semibold text-gray-600">Reference: </span>
                      <span className="font-mono">{printDoc.supporting_reference}</span>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <div className="mb-4">
                  <table className="w-full text-left text-xs border border-gray-300">
                    <thead className="bg-gray-100 border-b border-gray-300 font-semibold text-[11px]">
                      <tr>
                        <th className="p-2">Item / SKU</th>
                        <th className="p-2">Location</th>
                        <th className="p-2 text-right">System Qty</th>
                        <th className="p-2 text-right">Counted Qty</th>
                        <th className="p-2 text-right">Adjusted Qty</th>
                        <th className="p-2 text-right">Unit Cost</th>
                        <th className="p-2 text-right">Total (LKR)</th>
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
                          <td className="p-2 text-right">{it.expected_quantity ?? '—'}</td>
                          <td className="p-2 text-right">{it.counted_quantity ?? '—'}</td>
                          <td className="p-2 text-right font-bold">{it.quantity}</td>
                          <td className="p-2 text-right">{formatLkr(it.unit_cost)}</td>
                          <td className="p-2 text-right font-bold">{formatLkr(it.total_cost || it.quantity * it.unit_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary Total */}
                <div className="border-t-2 border-black pt-2 flex justify-between font-black text-sm mb-8">
                  <span>Total Financial Adjustment:</span>
                  <span>{formatLkr(printDoc.total_cost || 0)}</span>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-6 pt-6 border-t border-gray-300 text-center text-xs">
                  <div>
                    <div className="border-b border-black w-32 mx-auto mb-1.5" />
                    <span className="font-semibold">Prepared By</span>
                  </div>
                  <div>
                    <div className="border-b border-black w-32 mx-auto mb-1.5" />
                    <span className="font-semibold">Storekeeper</span>
                  </div>
                  <div>
                    <div className="border-b border-black w-32 mx-auto mb-1.5" />
                    <span className="font-semibold">Audited / Approved By</span>
                  </div>
                </div>

                <div className="text-center text-[10px] text-gray-400 mt-6 pt-3 border-t border-gray-200">
                  Baby Bloom Inventory Management System • Colombo Sri Lanka
                </div>
              </div>
            </div>

            {/* Modal Actions */}
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
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4" />
                Print Voucher
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
              <div className="p-2.5 rounded-xl bg-teal-950/80 border border-teal-500/40 text-teal-300">
                <Printer size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Stock Adjustments & Count Reconciliation Register Preview
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-900/50 text-teal-300 border border-teal-500/30">
                    A4 Master Audit
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Ready for physical printing or PDF archival • {(adjustmentsList.data?.rows || []).length} vouchers in current scope
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
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
            id="stock-adjustments-register-printable"
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
                <span className="inline-block px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-wider rounded mb-1">
                  Stock Reconciliation Register
                </span>
                <div className="text-[10px] font-mono text-gray-600">
                  REF: ADJ-REG-{new Date().getFullYear()}-{Math.floor(Date.now() / 1000).toString().slice(-4)}
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
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Adjustment Type</span>
                <span className="font-semibold text-gray-800">
                  {typeFilter === 'all' ? 'All Adjustment Types' : typeFilter.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Audit Status</span>
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
                <div className="text-[10px] uppercase text-gray-500 font-bold">Total Vouchers</div>
                <div className="text-base font-extrabold text-gray-900 mt-0.5">
                  {kpisQuery.data?.totalAdjustments ?? adjustmentsList.data?.count ?? (adjustmentsList.data?.rows || []).length}
                </div>
              </div>
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <div className="text-[10px] uppercase text-gray-500 font-bold">Posted & Committed</div>
                <div className="text-base font-extrabold text-emerald-700 mt-0.5">
                  {kpisQuery.data?.postedAdjustments ?? 0}
                </div>
              </div>
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <div className="text-[10px] uppercase text-gray-500 font-bold">Pending Review</div>
                <div className="text-base font-extrabold text-amber-700 mt-0.5">
                  {kpisQuery.data?.pendingAdjustments ?? 0}
                </div>
              </div>
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <div className="text-[10px] uppercase text-gray-500 font-bold">Cumulative Valuation</div>
                <div className="text-base font-extrabold text-gray-900 font-mono mt-0.5">
                  {formatLkr(kpisQuery.data?.totalValuation ?? (adjustmentsList.data?.rows || []).reduce((acc, r) => acc + (r.total_cost || 0), 0))}
                </div>
              </div>
            </div>

            {/* Itemized Table */}
            <table className="w-full text-left text-[10px] border border-gray-300 mb-6">
              <thead className="bg-gray-100 border-b border-gray-300 font-bold uppercase text-[9px]">
                <tr>
                  <th className="p-2 border-r border-gray-200 text-center w-8">#</th>
                  <th className="p-2 border-r border-gray-200">Doc Number</th>
                  <th className="p-2 border-r border-gray-200">Date</th>
                  <th className="p-2 border-r border-gray-200">Branch & Warehouse</th>
                  <th className="p-2 border-r border-gray-200">Adjustment Type</th>
                  <th className="p-2 border-r border-gray-200">Reason / Reference</th>
                  <th className="p-2 border-r border-gray-200 text-right">Valuation (LKR)</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {(adjustmentsList.data?.rows || []).map((row, idx) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="p-1.5 border-r border-gray-200 text-center text-gray-500 font-sans">{idx + 1}</td>
                    <td className="p-1.5 border-r border-gray-200 font-bold text-gray-900">{row.document_number}</td>
                    <td className="p-1.5 border-r border-gray-200 text-gray-700 whitespace-nowrap">{row.document_date}</td>
                    <td className="p-1.5 border-r border-gray-200 text-gray-800 font-sans">
                      <div className="font-semibold">{row.branch_name}</div>
                      <div className="text-[9px] text-gray-500">{row.warehouse_name}</div>
                    </td>
                    <td className="p-1.5 border-r border-gray-200 font-sans uppercase font-bold text-[9px] text-gray-700">
                      {row.document_type.replace(/_/g, ' ')}
                    </td>
                    <td className="p-1.5 border-r border-gray-200 font-sans text-gray-700 max-w-xs truncate">
                      <div>{row.reason || 'Inventory Adjustment'}</div>
                      {row.supporting_reference && (
                        <div className="text-[9px] text-gray-500 font-mono">Ref: {row.supporting_reference}</div>
                      )}
                    </td>
                    <td className="p-1.5 border-r border-gray-200 text-right font-bold text-gray-900 whitespace-nowrap">
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
                    Total Financial Valuation of Scope:
                  </td>
                  <td className="p-2 text-right font-mono text-xs font-black text-black whitespace-nowrap">
                    {formatLkr((adjustmentsList.data?.rows || []).reduce((acc, r) => acc + (r.total_cost || 0), 0))}
                  </td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
            </table>

            {/* Dual Authorization Signatures */}
            <div className="grid grid-cols-3 gap-8 pt-6 border-t border-gray-300 text-center text-xs mt-8">
              <div>
                <div className="border-b border-black w-40 mx-auto mb-1.5" />
                <span className="font-bold text-gray-800">Inventory Controller</span>
                <p className="text-[9px] text-gray-500 mt-0.5">Physical Stock Count Verified</p>
              </div>
              <div>
                <div className="border-b border-black w-40 mx-auto mb-1.5" />
                <span className="font-bold text-gray-800">Internal Audit & Compliance</span>
                <p className="text-[9px] text-gray-500 mt-0.5">Discrepancy Investigation Cleared</p>
              </div>
              <div>
                <div className="border-b border-black w-40 mx-auto mb-1.5" />
                <span className="font-bold text-gray-800">General Manager / Finance</span>
                <p className="text-[9px] text-gray-500 mt-0.5">Cost Adjustment Authorized</p>
              </div>
            </div>

            {/* Official Disclaimer */}
            <div className="text-center text-[9px] text-gray-400 mt-6 pt-3 border-t border-gray-200">
              Baby Bloom ERP • Stock Adjustments & Count Reconciliation Register • Subject to LKAS/IAS 2 Regulatory Compliance
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
