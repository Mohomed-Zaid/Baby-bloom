import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileX,
  Search,
  Plus,
  Trash2,
  Printer,
  Download,
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
  SlidersHorizontal,
  Flame,
  Scale,
  ShieldAlert,
  Building,
  AlertTriangle,
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

interface WriteOffLineItem {
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
  writeoff_cause: string
  disposal_method: string
  batch_reference: string
  expiry_date: string
  remarks: string
}

export function StockWriteOffPage() {
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

  // ── Form State for New Stock Write-off Entry ─────────────────────────────────
  const [branchId, setBranchId] = useState(activeBranchId || '')
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [documentDate, setDocumentDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [writeoffCausePreset, setWriteoffCausePreset] = useState('Theft, Shoplifting & Pilferage')
  const [customCause, setCustomCause] = useState('')
  const [disposalMethodPreset, setDisposalMethodPreset] = useState('Certified Eco-Destruction & Landfill')
  const [supportingReference, setSupportingReference] = useState('')
  const [notes, setNotes] = useState('')
  const [negativeStockOverride, setNegativeStockOverride] = useState(false)

  // ── Line Entry State ─────────────────────────────────────────────────────────
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lineLocationId, setLineLocationId] = useState('')
  const [itemQuantity, setItemQuantity] = useState<number>(1)
  const [itemUnitCost, setItemUnitCost] = useState<number>(0)
  const [itemBatch, setItemBatch] = useState('')
  const [itemExpiry, setItemExpiry] = useState('')
  const [itemRemarks, setItemRemarks] = useState('')

  // ── Draft Lines ──────────────────────────────────────────────────────────────
  const [writeOffLines, setWriteOffLines] = useState<WriteOffLineItem[]>([])

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

  const effectiveBranchId = activeTab === 'new_entry' ? branchId : filterBranch

  const warehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', effectiveBranchId],
    queryFn: () => {
      const f: Record<string, string | boolean> = { is_active: true }
      if (effectiveBranchId && effectiveBranchId !== 'all') f.branch_id = effectiveBranchId
      return listLookup('warehouses', 'name', f)
    },
    enabled: !!effectiveBranchId && effectiveBranchId !== 'all',
  })

  const effectiveWarehouseId = activeTab === 'new_entry' ? warehouseId : filterWarehouse

  const locationsQuery = useQuery({
    queryKey: ['lookup', 'locations', effectiveWarehouseId],
    queryFn: () => {
      const f: Record<string, string | boolean> = { is_active: true }
      if (effectiveWarehouseId) f.warehouse_id = effectiveWarehouseId
      return listLookup('stock_locations', 'name', f)
    },
    enabled: !!effectiveWarehouseId,
  })

  // Auto-select first warehouse / location
  React.useEffect(() => {
    if (activeTab === 'new_entry' && warehousesQuery.data && warehousesQuery.data.length > 0 && !warehouseId) {
      const firstWh = warehousesQuery.data[0]
      if (firstWh) setWarehouseId(firstWh.value)
    }
  }, [activeTab, warehousesQuery.data, warehouseId])

  React.useEffect(() => {
    if (activeTab === 'new_entry' && locationsQuery.data && locationsQuery.data.length > 0 && !locationId) {
      const firstLoc = locationsQuery.data[0]
      if (firstLoc) setLocationId(firstLoc.value)
    }
  }, [activeTab, locationsQuery.data, locationId])

  // Products / Variants catalog
  const variantsQuery = useQuery({
    queryKey: ['variants-lookup-catalog'],
    queryFn: () => listOpeningStockVariants(),
  })

  const selectedVariantDetails = useMemo(() => {
    if (!selectedVariantId || !variantsQuery.data) return null
    return variantsQuery.data.find((v) => v.id === selectedVariantId)
  }, [selectedVariantId, variantsQuery.data])

  const filteredCatalogVariants = useMemo(() => {
    if (!variantsQuery.data) return []
    if (!variantSearch.trim()) return variantsQuery.data
    const q = variantSearch.toLowerCase().trim()
    return variantsQuery.data.filter(
      (v) =>
        v.product_name.toLowerCase().includes(q) ||
        v.sku.toLowerCase().includes(q) ||
        v.variant_name.toLowerCase().includes(q) ||
        (v.barcode && v.barcode.toLowerCase().includes(q))
    )
  }, [variantsQuery.data, variantSearch])

  const effectiveLocationId = lineLocationId || locationId
  const currentStockCheck = useQuery({
    queryKey: ['stock-available-for-writeoff', effectiveLocationId, selectedVariantId],
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

  // ── Write-Off Documents Query ────────────────────────────────────────────────
  const writeoffList = useQuery({
    queryKey: [
      'writeoff-stock-documents-list',
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
        documentType: 'stock_write_off',
        status: statusFilter,
        dateFrom,
        dateTo,
      }),
  })

  // ── CSV Export ───────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const rows = writeoffList.data?.rows || []
    if (rows.length === 0) {
      showToast('No stock write-off records available to export', 'error')
      return
    }

    const headers = [
      'Document Number',
      'Date',
      'Branch',
      'Warehouse',
      'Write-Off Cause',
      'Disposal Method / Details',
      'Supporting Reference / Police Entry',
      'Line Items Count',
      'Total Asset Loss Valuation (LKR)',
      'Status',
    ]

    const csvRows = [
      headers.join(','),
      ...rows.map((r) =>
        [
          `"${r.document_number}"`,
          `"${r.document_date}"`,
          `"${(r.branch?.name || 'Main Branch').replace(/"/g, '""')}"`,
          `"${(r.warehouse?.name || 'Main Warehouse').replace(/"/g, '""')}"`,
          `"${(r.reason || 'Asset Derecognition').replace(/"/g, '""')}"`,
          `"${(r.notes || '').replace(/"/g, '""')}"`,
          `"${(r.supporting_reference || '').replace(/"/g, '""')}"`,
          r.items?.length || 0,
          Number(r.total_cost || 0).toFixed(2),
          `"${r.status}"`,
        ].join(',')
      ),
    ]

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `stock_writeoff_register_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast(`Exported ${rows.length} stock write-off records to CSV`, 'success')
  }

  // ── Write-off KPIs Query ─────────────────────────────────────────────────────
  const kpisQuery = useQuery({
    queryKey: ['stock-writeoff-kpis', filterBranch],
    queryFn: async () => {
      const client = requireSupabase()
      let query = client
        .from('inventory_documents')
        .select('id, status, total_cost, document_date, supporting_reference')
        .eq('document_type', 'stock_write_off')

      if (filterBranch && filterBranch !== 'all') {
        query = query.eq('branch_id', filterBranch)
      }

      const { data, error } = await query
      if (error || !data) {
        return { totalIncidents: 0, postedCount: 0, pendingCount: 0, totalLossValuation: 0, highRiskCount: 0 }
      }

      const rows = data as unknown as Array<{ id: string; status: string; total_cost: number; supporting_reference?: string }>
      let totalLossValuation = 0
      let postedCount = 0
      let pendingCount = 0
      let highRiskCount = 0

      for (const doc of rows) {
        if (doc.supporting_reference && doc.supporting_reference.trim().length > 0) {
          highRiskCount++
        }
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
        highRiskCount,
      }
    },
  })

  // ── Document Detail Query ────────────────────────────────────────────────────
  const detailQuery = useQuery({
    queryKey: ['stock-writeoff-detail', detailDocId],
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
      showToast('Write-off quantity must be greater than zero.', 'error')
      return
    }

    const locName = locationsQuery.data?.find((l) => l.value === locId)?.label || 'Warehouse Location'

    const newLine: WriteOffLineItem = {
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
      writeoff_cause: customCause.trim() ? `${writeoffCausePreset} - ${customCause.trim()}` : writeoffCausePreset,
      disposal_method: disposalMethodPreset,
      batch_reference: itemBatch.trim(),
      expiry_date: itemExpiry,
      remarks: itemRemarks.trim(),
    }

    setWriteOffLines((prev) => [...prev, newLine])

    // Reset line inputs
    setSelectedVariantId('')
    setItemQuantity(1)
    setItemBatch('')
    setItemExpiry('')
    setItemRemarks('')
    setBarcodeInput('')
    showToast(`Added ${selectedVariantDetails.sku} (${newLine.quantity} units to write-off)`, 'success')
  }

  const handleRemoveLine = (key: string) => {
    setWriteOffLines((prev) => prev.filter((l) => l.key !== key))
  }

  // ── Calculation Summary ──────────────────────────────────────────────────────
  const draftSummary = useMemo(() => {
    const totalLines = writeOffLines.length
    const totalUnits = writeOffLines.reduce((acc, l) => acc + l.quantity, 0)
    const totalLoss = writeOffLines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0)
    return { totalLines, totalUnits, totalLoss }
  }, [writeOffLines])

  // ── Save Draft Mutation ──────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('Please select a Branch.')
      if (!warehouseId) throw new Error('Please select a Warehouse.')
      if (writeOffLines.length === 0) throw new Error('Add at least one product line to write off.')

      const finalReason = customCause.trim()
        ? `${customCause.trim()} [Method: ${disposalMethodPreset}]`
        : `${writeoffCausePreset} [Method: ${disposalMethodPreset}]`

      return await createInventoryDraft({
        branch_id: branchId,
        warehouse_id: warehouseId,
        document_type: 'stock_write_off',
        document_date: documentDate,
        supporting_reference: supportingReference || undefined,
        notes: notes || undefined,
        reason: finalReason,
        negative_stock_override: negativeStockOverride,
        items: writeOffLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: `${l.writeoff_cause} | ${l.disposal_method} ${l.remarks ? `| ${l.remarks}` : ''}`.trim(),
        })),
      })
    },
    onSuccess: () => {
      showToast('Stock write-off proposal saved as draft!', 'success')
      setWriteOffLines([])
      setCustomCause('')
      setNotes('')
      setSupportingReference('')
      setActiveTab('register')
      queryClient.invalidateQueries({ queryKey: ['writeoff-stock-documents-list'] })
      queryClient.invalidateQueries({ queryKey: ['stock-writeoff-kpis'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // ── Post Immediate Mutation ──────────────────────────────────────────────────
  const postImmediateMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('Please select a Branch.')
      if (!warehouseId) throw new Error('Please select a Warehouse.')
      if (writeOffLines.length === 0) throw new Error('Add at least one product line to write off.')

      const finalReason = customCause.trim()
        ? `${customCause.trim()} [Method: ${disposalMethodPreset}]`
        : `${writeoffCausePreset} [Method: ${disposalMethodPreset}]`

      return await postStockAdjustmentImmediate({
        branch_id: branchId,
        warehouse_id: warehouseId,
        document_type: 'stock_write_off',
        document_date: documentDate,
        supporting_reference: supportingReference || undefined,
        notes: notes || undefined,
        reason: finalReason,
        negative_stock_override: negativeStockOverride,
        items: writeOffLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: `${l.writeoff_cause} | ${l.disposal_method} ${l.remarks ? `| ${l.remarks}` : ''}`.trim(),
        })),
      })
    },
    onSuccess: (result) => {
      showToast(`Write-Off ${result.document_number} executed & stock derecognized!`, 'success')
      setWriteOffLines([])
      setCustomCause('')
      setNotes('')
      setSupportingReference('')
      setActiveTab('register')
      queryClient.invalidateQueries({ queryKey: ['writeoff-stock-documents-list'] })
      queryClient.invalidateQueries({ queryKey: ['stock-writeoff-kpis'] })
      queryClient.invalidateQueries({ queryKey: ['stock-available-for-writeoff'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  // ── Workflow Action Mutation (Submit, Approve, Post, Cancel, Reverse) ────────
  const workflowActionMutation = useMutation({
    mutationFn: async ({
      name,
      document,
      reason,
    }: {
      name: 'submit' | 'approve' | 'post' | 'reverse' | 'reject' | 'cancel'
      document: InventoryDocument
      reason?: string
    }) => {
      return await inventoryAction(name, document, reason || '')
    },
    onSuccess: (result) => {
      showToast(`${result.document_number}: Status changed to ${result.status.toUpperCase()}`, 'success')
      setActionReasonModal({ open: false, action: 'cancel', doc: null, reason: '' })
      queryClient.invalidateQueries({ queryKey: ['writeoff-stock-documents-list'] })
      queryClient.invalidateQueries({ queryKey: ['stock-writeoff-kpis'] })
      queryClient.invalidateQueries({ queryKey: ['stock-available-for-writeoff'] })
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  })

  const openActionPrompt = (doc: InventoryDocument, action: 'reject' | 'cancel' | 'reverse') => {
    setActionReasonModal({
      open: true,
      action,
      doc,
      reason: '',
    })
  }

  // ── Cause Presets ────────────────────────────────────────────────────────────
  const causePresets = [
    { label: 'Theft, Shoplifting & Pilferage', icon: ShieldAlert, color: 'text-rose-400' },
    { label: 'Expired Shelf-Life / Baby Formula & Food Spoilage', icon: Clock, color: 'text-amber-400' },
    { label: 'Severe Water, Humidity & Moisture Infiltration', icon: AlertCircle, color: 'text-cyan-400' },
    { label: 'Fire, Smoke or Thermal Damage Loss', icon: Flame, color: 'text-orange-400' },
    { label: 'Dead Stock, Obsolete & Discontinued Inventory', icon: Package, color: 'text-yellow-400' },
    { label: 'Health Authority / Regulatory Ban & Mandatory Recall', icon: Scale, color: 'text-purple-400' },
    { label: 'Inbound Logistics / Transit Consignment Loss', icon: Building, color: 'text-blue-400' },
    { label: 'Marketing Samples & Non-Returnable Testing', icon: FileText, color: 'text-teal-400' },
    { label: 'Administrative / Physical Stocktake Shrinkage', icon: SlidersHorizontal, color: 'text-slate-400' },
  ]

  const disposalMethods = [
    'Certified Eco-Destruction & Landfill',
    'Hazardous / Chemical Discard (Strict Protocol)',
    'Charitable Donation / Non-Profit Grant',
    'Surrendered to Insurance Loss Adjuster',
    'Recycled / Industrial Scrap Reclamation',
    'Returned to Authority / Quarantine Hold',
  ]

  return (
    <div
      className="min-h-screen text-slate-100 p-4 md:p-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 backdrop-blur-md transition-all duration-300 ${
            toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : toastMessage.type === 'info'
              ? 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
              : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <XCircle className="w-5 h-5 text-rose-400" />
          ) : toastMessage.type === 'info' ? (
            <AlertCircle className="w-5 h-5 text-cyan-400" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Top Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-teal-900/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-rose-500/20 to-teal-500/20 border border-rose-500/30 rounded-2xl shadow-lg shadow-rose-950/30">
              <FileX className="w-8 h-8 text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-white">Stock Write-Off & Disposal Register</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300">
                  Asset Derecognition & Casualty Loss
                </span>
              </div>
              <p className="text-sm text-teal-200/70 mt-0.5">
                Formally write off theft, expired baby food, catastrophic casualties, or obsolete unsellable inventory.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['writeoff-stock-documents-list'] })
                queryClient.invalidateQueries({ queryKey: ['stock-writeoff-kpis'] })
                showToast('Write-off records refreshed', 'info')
              }}
              className="p-2.5 rounded-xl text-teal-300 bg-teal-950/60 border border-teal-800/60 hover:bg-teal-900/60 hover:text-white transition cursor-pointer"
              title="Refresh Register"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-teal-950/80 border border-teal-800/60 hover:bg-teal-900/80 hover:text-white transition cursor-pointer shadow-sm"
              title="Export current write-off records to CSV"
            >
              <Download className="w-3.5 h-3.5 text-teal-400" />
              <span>EXPORT CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setPrintRegisterModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-amber-200 bg-amber-950/60 border border-amber-600/50 hover:bg-amber-900/70 hover:text-white transition cursor-pointer shadow-sm"
              title="Print formal A4 Stock Write-Off & Casualty Audit Register"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>PRINT REGISTER</span>
            </button>

            {activeTab === 'register' ? (
              <button
                type="button"
                onClick={() => setActiveTab('new_entry')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 border border-rose-500/50 transition cursor-pointer shadow-lg shadow-rose-950/40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ AUTHORIZE WRITE-OFF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('register')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-teal-200 bg-teal-950/80 border border-teal-800/60 hover:bg-teal-900/80 hover:text-white transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>VIEW REGISTER</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Sub-navigation Bar */}
        <div className="flex items-center gap-2 flex-wrap -mt-2">
          <Link
            to="/inventory/current-stock"
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
          >
            Current Stock
          </Link>
          <Link
            to="/inventory/stock-adjustment"
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
          >
            Stock Adjustment
          </Link>
          <Link
            to="/inventory/damaged-stock"
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
          >
            Damaged Stock
          </Link>
          <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-300 bg-rose-950/50 border border-rose-500/40">
            Stock Write-off
          </div>
        </div>

        {/* ── KPI Summary Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Incidents */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300/80 uppercase tracking-wider">
                Total Write-Offs
              </span>
              <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                <FileX className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              {kpisQuery.isLoading ? '...' : kpisQuery.data?.totalIncidents ?? 0}
            </div>
            <div className="text-xs text-teal-300/60 mt-1 flex items-center gap-1.5">
              <span>Lifetime logged casualty & loss events</span>
            </div>
          </div>

          {/* Card 2: Written-Off Asset Valuation */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300/80 uppercase tracking-wider">
                Written-Off Asset Value
              </span>
              <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-300 mt-2">
              {kpisQuery.isLoading
                ? '...'
                : formatLkr(kpisQuery.data?.totalLossValuation ?? 0)}
            </div>
            <div className="text-xs text-rose-400/70 mt-1 flex items-center gap-1">
              <span>Derecognized at weighted cost</span>
            </div>
          </div>

          {/* Card 3: Pending Authorization */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300/80 uppercase tracking-wider">
                Pending Authorization
              </span>
              <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-300 mt-2">
              {kpisQuery.isLoading ? '...' : kpisQuery.data?.pendingCount ?? 0}
            </div>
            <div className="text-xs text-amber-300/60 mt-1">
              <span>Drafts & documents awaiting review</span>
            </div>
          </div>

          {/* Card 4: High-Risk / Reference Backed */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300/80 uppercase tracking-wider">
                With Audit / Police Ref
              </span>
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-2">
              {kpisQuery.isLoading ? '...' : kpisQuery.data?.highRiskCount ?? 0}
            </div>
            <div className="text-xs text-cyan-300/60 mt-1">
              <span>Documents with police / insurance ref</span>
            </div>
          </div>
        </div>

        {/* ── Mode Navigation Tabs ────────────────────────────────────────────── */}
        <div className="flex border-b border-teal-900/60 gap-2">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'register'
                ? 'border-rose-400 text-rose-300 bg-rose-500/10 rounded-t-xl'
                : 'border-transparent text-teal-300/60 hover:text-white hover:bg-teal-900/20 rounded-t-xl'
            }`}
          >
            <FileText className="w-4 h-4" />
            Stock Write-Off Register
            <span className="px-2 py-0.5 text-xs bg-teal-900/80 rounded-full text-teal-300 border border-teal-700/50">
              {writeoffList.data?.count ?? 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('new_entry')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'new_entry'
                ? 'border-rose-400 text-rose-300 bg-rose-500/10 rounded-t-xl'
                : 'border-transparent text-teal-300/60 hover:text-white hover:bg-teal-900/20 rounded-t-xl'
            }`}
          >
            <Plus className="w-4 h-4" />
            Authorize New Write-Off
            {writeOffLines.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-rose-600 rounded-full text-white font-bold animate-pulse">
                {writeOffLines.length}
              </span>
            )}
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: STOCK WRITE-OFF REGISTER
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'register' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-4 shadow-lg backdrop-blur-md">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* Search */}
                <div className="lg:col-span-2 relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Search Doc #, reason, police ref..."
                    className="w-full pl-10 pr-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white placeholder-teal-300/40 focus:outline-none focus:border-rose-400 transition"
                  />
                </div>

                {/* Branch */}
                <div>
                  <select
                    value={filterBranch}
                    onChange={(e) => {
                      setFilterBranch(e.target.value)
                      setFilterWarehouse('')
                      setPage(1)
                    }}
                    className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
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
                    value={filterWarehouse}
                    onChange={(e) => {
                      setFilterWarehouse(e.target.value)
                      setPage(1)
                    }}
                    className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  >
                    <option value="">All Warehouses</option>
                    {warehousesQuery.data?.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value)
                      setPage(1)
                    }}
                    className="w-full px-3 py-2 text-sm bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft (Pending Review)</option>
                    <option value="submitted">Submitted (For Approval)</option>
                    <option value="approved">Approved</option>
                    <option value="posted">Posted & Derecognized</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="reversed">Reversed</option>
                  </select>
                </div>

                {/* Date Filter & Clear */}
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value)
                      setPage(1)
                    }}
                    className="w-full px-2.5 py-2 text-xs bg-teal-950/60 border border-teal-800/60 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  />
                  {(searchQuery || filterWarehouse || statusFilter !== 'all' || dateFrom || dateTo) && (
                    <button
                      onClick={() => {
                        setSearchQuery('')
                        setFilterWarehouse('')
                        setStatusFilter('all')
                        setDateFrom('')
                        setDateTo('')
                        setPage(1)
                      }}
                      className="p-2 rounded-xl text-teal-400 hover:text-white hover:bg-teal-900/50 border border-teal-800/60 transition"
                      title="Clear Filters"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-teal-950/80 text-teal-300/80 uppercase text-xs tracking-wider border-b border-teal-800/50">
                    <tr>
                      <th className="px-4 py-3.5">Document #</th>
                      <th className="px-4 py-3.5">Date & Branch</th>
                      <th className="px-4 py-3.5">Warehouse</th>
                      <th className="px-4 py-3.5">Write-Off Cause / Method</th>
                      <th className="px-4 py-3.5">Audit / Police Ref</th>
                      <th className="px-4 py-3.5 text-right">Written-Off Loss</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/40 text-slate-200">
                    {writeoffList.isLoading ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-teal-300/60">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                          Loading stock write-off documents...
                        </td>
                      </tr>
                    ) : (writeoffList.data?.rows?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-teal-300/60">
                          <FileX className="w-10 h-10 mx-auto mb-2 text-teal-700/60" />
                          No stock write-off incidents found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      writeoffList.data?.rows.map((doc) => {
                        return (
                          <tr key={doc.id} className="hover:bg-teal-900/20 transition">
                            <td className="px-4 py-3.5">
                              <button
                                type="button"
                                onClick={() => setDetailDocId(doc.id)}
                                className="font-semibold text-white hover:text-rose-300 flex items-center gap-1.5 transition text-left cursor-pointer"
                              >
                                <span>{doc.document_number}</span>
                                {doc.negative_stock_override && (
                                  <span
                                    title="Negative Stock Override Requested"
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                  >
                                    NEG-OVR
                                  </span>
                                )}
                              </button>
                              <span className="text-[11px] text-teal-400/60">
                                {doc.items?.length || 0} line items
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="text-slate-200 font-medium">{doc.document_date}</div>
                              <div className="text-[11px] text-teal-400/70">{doc.branch?.name || 'Main Branch'}</div>
                            </td>

                            <td className="px-4 py-3.5">
                              <span className="text-sm text-teal-100">{doc.warehouse?.name || 'Main Warehouse'}</span>
                            </td>

                            <td className="px-4 py-3.5 max-w-xs">
                              <div className="text-xs text-rose-300 font-medium truncate" title={doc.reason || 'Casualty Loss'}>
                                {doc.reason || 'Casualty Loss'}
                              </div>
                              {doc.notes && (
                                <div className="text-[11px] text-teal-300/50 truncate" title={doc.notes}>
                                  {doc.notes}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              {doc.supporting_reference ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-700/50">
                                  <Scale className="w-3 h-3" />
                                  {doc.supporting_reference}
                                </span>
                              ) : (
                                <span className="text-xs text-teal-500/40 italic">None logged</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 text-right">
                              <div className="font-bold text-rose-300">
                                {formatLkr(Number(doc.total_cost || 0))}
                              </div>
                              <span className="text-[10px] text-teal-400/60">Asset Loss</span>
                            </td>

                            <td className="px-4 py-3.5 text-center">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                                  doc.status === 'posted'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : doc.status === 'approved'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : doc.status === 'submitted'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : doc.status === 'reversed'
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                    : doc.status === 'cancelled'
                                    ? 'bg-slate-500/20 text-slate-400 border border-slate-500/40'
                                    : 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                                }`}
                              >
                                {doc.status === 'posted' ? 'Written-Off' : doc.status}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Inspect */}
                                <button
                                  onClick={() => setDetailDocId(doc.id)}
                                  className="p-1.5 rounded-lg bg-teal-950/60 text-teal-300 hover:text-white hover:bg-teal-900 border border-teal-800/60 transition"
                                  title="View Write-off Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {/* Print Certificate */}
                                <button
                                  onClick={() => setPrintDoc(doc)}
                                  className="p-1.5 rounded-lg bg-teal-950/60 text-teal-300 hover:text-white hover:bg-teal-900 border border-teal-800/60 transition"
                                  title="Print Formal Destruction & Write-off Certificate"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>

                                {/* Submit */}
                                {doc.status === 'draft' && canSubmit && (
                                  <button
                                    onClick={() => workflowActionMutation.mutate({ name: 'submit', document: doc })}
                                    disabled={workflowActionMutation.isPending}
                                    className="p-1.5 rounded-lg bg-teal-800/40 text-teal-200 hover:bg-teal-700/60 border border-teal-600/50 transition"
                                    title="Submit for Write-Off Authorization"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Approve */}
                                {doc.status === 'submitted' && canApprove && (
                                  <button
                                    onClick={() => workflowActionMutation.mutate({ name: 'approve', document: doc })}
                                    disabled={workflowActionMutation.isPending}
                                    className="p-1.5 rounded-lg bg-emerald-800/40 text-emerald-200 hover:bg-emerald-700/60 border border-emerald-600/50 transition"
                                    title="Approve Write-off Proposal"
                                  >
                                    <ShieldCheck className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Post Write-off (Commit Deduction) */}
                                {doc.status === 'approved' && canPost && (
                                  <button
                                    onClick={() => workflowActionMutation.mutate({ name: 'post', document: doc })}
                                    disabled={workflowActionMutation.isPending}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50 transition flex items-center gap-1"
                                    title="Execute Write-off & Deduct Stock"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Write Off
                                  </button>
                                )}

                                {/* Cancel */}
                                {['draft', 'submitted', 'approved'].includes(doc.status) && canSubmit && (
                                  <button
                                    onClick={() => openActionPrompt(doc, 'cancel')}
                                    disabled={workflowActionMutation.isPending}
                                    className="p-1.5 rounded-lg bg-rose-950/40 text-rose-300 hover:text-rose-100 hover:bg-rose-900/60 border border-rose-800/50 transition"
                                    title="Cancel Proposal"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Reverse */}
                                {doc.status === 'posted' && canReverse && (
                                  <button
                                    onClick={() => openActionPrompt(doc, 'reverse')}
                                    disabled={workflowActionMutation.isPending}
                                    className="p-1.5 rounded-lg bg-purple-950/40 text-purple-300 hover:text-purple-100 hover:bg-purple-900/60 border border-purple-800/50 transition"
                                    title="Reverse Write-Off Entry"
                                  >
                                    <RotateCcw className="w-4 h-4" />
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
              </div>

              {/* Pagination */}
              {writeoffList.data?.count && writeoffList.data.count > 15 ? (
                <div className="flex items-center justify-between px-4 py-3 border-t border-teal-900/50 text-xs text-teal-300/70">
                  <div>
                    Showing {(page - 1) * 15 + 1} -{' '}
                    {Math.min(page * 15, writeoffList.data.count)} of {writeoffList.data.count}
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 bg-teal-950/60 border border-teal-800/60 rounded-lg hover:bg-teal-900 disabled:opacity-40 transition"
                    >
                      Previous
                    </button>
                    <button
                      disabled={page * 15 >= writeoffList.data.count}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1 bg-teal-950/60 border border-teal-800/60 rounded-lg hover:bg-teal-900 disabled:opacity-40 transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: AUTHORIZE NEW STOCK WRITE-OFF ENTRY FORM
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'new_entry' && (
          <div className="space-y-6">
            {/* Top Document Context */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <FileX className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-white text-base">Write-Off Location & Audit Parameters</h3>
                </div>
                <div className="text-xs text-rose-300/80 bg-rose-950/60 border border-rose-500/30 px-3 py-1 rounded-full font-medium">
                  Permanent Asset Derecognition
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Branch */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1.5">
                    Operating Branch *
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => {
                      setBranchId(e.target.value)
                      setWarehouseId('')
                      setLocationId('')
                    }}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  >
                    <option value="">Select Branch</option>
                    {branchesQuery.data?.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Warehouse */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1.5">
                    Storage Warehouse *
                  </label>
                  <select
                    value={warehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value)
                      setLocationId('')
                    }}
                    disabled={!branchId}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 disabled:opacity-50 transition"
                  >
                    <option value="">Select Warehouse</option>
                    {warehousesQuery.data?.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Stock Location */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1.5">
                    Default Bin / Rack *
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    disabled={!warehouseId}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 disabled:opacity-50 transition"
                  >
                    <option value="">Select Stock Location</option>
                    {locationsQuery.data?.map((loc) => (
                      <option key={loc.value} value={loc.value}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1.5">
                    Derecognition Date *
                  </label>
                  <input
                    type="date"
                    value={documentDate}
                    onChange={(e) => setDocumentDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  />
                </div>
              </div>

              {/* Write-off Cause Presets */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-teal-300/80 mb-2">
                  Select Write-Off Cause Category:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {causePresets.map((preset) => {
                    const Icon = preset.icon
                    const isSelected = writeoffCausePreset === preset.label
                    return (
                      <button
                        type="button"
                        key={preset.label}
                        onClick={() => setWriteoffCausePreset(preset.label)}
                        className={`text-left p-2.5 rounded-xl border text-xs flex items-center gap-2.5 transition ${
                          isSelected
                            ? 'bg-rose-500/20 border-rose-500 text-white shadow-md shadow-rose-950/40 font-semibold'
                            : 'bg-teal-950/40 border-teal-800/40 text-teal-200/80 hover:bg-teal-900/40 hover:text-white'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${preset.color}`} />
                        <span className="truncate">{preset.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Disposal / Destruction Method */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1.5">
                    Authorized Destruction / Disposal Protocol *
                  </label>
                  <select
                    value={disposalMethodPreset}
                    onChange={(e) => setDisposalMethodPreset(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  >
                    {disposalMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1.5">
                    Police / Insurance / Audit Reference #
                  </label>
                  <input
                    type="text"
                    value={supportingReference}
                    onChange={(e) => setSupportingReference(e.target.value)}
                    placeholder="e.g. POLICE-ENTRY-2026/894, INS-CLM-44"
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-rose-400 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1.5">
                    Specific Cause Clarification / Memo
                  </label>
                  <input
                    type="text"
                    value={customCause}
                    onChange={(e) => setCustomCause(e.target.value)}
                    placeholder="e.g. Broken water pipe flooded aisle 3; formula ruined"
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-rose-400 transition"
                  />
                </div>
              </div>

              {/* Negative Stock Override & Internal Notes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1.5">
                    Board / Audit Committee Internal Justification
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Audit trail memo, witness notes, or authorized officer statement..."
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-rose-400 transition"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="relative flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={negativeStockOverride}
                      onChange={(e) => setNegativeStockOverride(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-500 bg-teal-950 border-teal-700 focus:ring-0"
                    />
                    <div>
                      <span className="text-xs font-bold text-rose-300 block">
                        Audited Negative-Stock Override
                      </span>
                      <span className="text-[10px] text-teal-400/60 block">
                        Allows write-off even if stock balance is zero/negative
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* ── Product Variant Line Item Picker ──────────────────────────────── */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-teal-400" />
                  <h3 className="font-bold text-white text-base">Stage Merchandise for Write-Off</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-teal-300/70">Scan or Search SKU</span>
                </div>
              </div>

              {/* Barcode Search, Instant Filter & Variant Selection */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                {/* Barcode input */}
                <div className="md:col-span-4 relative">
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Barcode Fast-Scan
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" />
                      <input
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleBarcodeResolve()
                          }
                        }}
                        placeholder="Scan or enter barcode..."
                        className="w-full pl-9 pr-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-rose-400 transition"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleBarcodeResolve}
                      className="px-3 py-2 bg-teal-800/50 hover:bg-teal-700/60 border border-teal-600/50 text-white rounded-xl text-xs font-semibold transition"
                    >
                      Scan
                    </button>
                  </div>
                </div>

                {/* Instant Filter by name / SKU */}
                <div className="md:col-span-3 relative">
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Filter by Name / SKU
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teal-400/60" />
                    <input
                      type="text"
                      value={variantSearch}
                      onChange={(e) => setVariantSearch(e.target.value)}
                      placeholder="Type name or SKU..."
                      className="w-full pl-9 pr-7 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-rose-400 transition"
                    />
                    {variantSearch && (
                      <button
                        type="button"
                        onClick={() => setVariantSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-teal-400/60 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Variant Selector */}
                <div className="md:col-span-5">
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Product / Variant Catalog * ({filteredCatalogVariants.length} matched)
                  </label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  >
                    <option value="">-- Choose Product Variant to Write-off --</option>
                    {filteredCatalogVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.sku} · {v.product_name} ({v.variant_name}) {v.barcode ? `[${v.barcode}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live stock & pricing status if variant is selected */}
              {selectedVariantDetails && (
                <div className="p-3 bg-teal-950/90 border border-teal-700/40 rounded-xl flex items-center justify-between flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-teal-400/80">Selected Product:</span>{' '}
                    <strong className="text-white">{selectedVariantDetails.product_name}</strong>{' '}
                    <span className="text-teal-300/70">({selectedVariantDetails.variant_name})</span> ·{' '}
                    <span className="font-mono text-cyan-300">{selectedVariantDetails.sku}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-teal-400/80">On Hand:</span>{' '}
                      <strong className="text-white">{onHandQuantity}</strong>
                    </div>
                    <div>
                      <span className="text-teal-400/80">Available in Bin:</span>{' '}
                      <strong
                        className={`font-bold ${
                          availableQuantity <= 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {availableQuantity} units
                      </strong>
                    </div>
                    <div>
                      <span className="text-teal-400/80">Cost/Unit:</span>{' '}
                      <strong className="text-rose-300 font-mono">
                        {formatLkr(itemUnitCost)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Line Attributes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Specific Stock Bin
                  </label>
                  <select
                    value={lineLocationId || locationId}
                    onChange={(e) => setLineLocationId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  >
                    <option value="">Default Location</option>
                    {locationsQuery.data?.map((loc) => (
                      <option key={loc.value} value={loc.value}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Write-Off Quantity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 font-bold transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Unit Cost (LKR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={itemUnitCost}
                    onChange={(e) => setItemUnitCost(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Batch / Lot Reference
                  </label>
                  <input
                    type="text"
                    value={itemBatch}
                    onChange={(e) => setItemBatch(e.target.value)}
                    placeholder="e.g. LOT-2026-09"
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-rose-400 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={itemExpiry}
                    onChange={(e) => setItemExpiry(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-rose-400 transition"
                  />
                </div>
              </div>

              {/* Remarks & Add Button */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <input
                  type="text"
                  value={itemRemarks}
                  onChange={(e) => setItemRemarks(e.target.value)}
                  placeholder="Line-level notes (e.g., ruined seal, completely soaked packaging, expired baby food)"
                  className="flex-1 w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-rose-400 transition"
                />

                <button
                  type="button"
                  onClick={handleAddLine}
                  disabled={!selectedVariantId}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2 disabled:opacity-40 transition"
                >
                  <Plus className="w-4 h-4" />
                  Add to Write-Off
                </button>
              </div>
            </div>

            {/* ── Staged Items Table ────────────────────────────────────────────── */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
              <div className="p-4 border-b border-teal-900/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileX className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-white text-base">Staged Write-Off Items ({writeOffLines.length})</h3>
                </div>
                {writeOffLines.length > 0 && (
                  <button
                    onClick={() => setWriteOffLines([])}
                    className="text-xs text-rose-300 hover:text-rose-100 flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-teal-950/80 text-teal-300/80 uppercase text-xs tracking-wider border-b border-teal-800/50">
                    <tr>
                      <th className="px-4 py-3">Product / Variant</th>
                      <th className="px-4 py-3">Stock Location</th>
                      <th className="px-4 py-3 text-center">Write-off Qty</th>
                      <th className="px-4 py-3 text-right">Unit Cost</th>
                      <th className="px-4 py-3 text-right">Subtotal Loss</th>
                      <th className="px-4 py-3">Cause & Disposal</th>
                      <th className="px-4 py-3">Batch / Expiry</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/40 text-slate-200">
                    {writeOffLines.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-teal-400/60">
                          <Package className="w-8 h-8 mx-auto mb-2 text-teal-700/60" />
                          No items staged for write-off yet. Select a product above and click &quot;Add to Write-Off&quot;.
                        </td>
                      </tr>
                    ) : (
                      writeOffLines.map((line) => {
                        const lineSubtotal = line.quantity * line.unit_cost
                        return (
                          <tr key={line.key} className="hover:bg-teal-900/20 transition">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-white">
                                {line.product_name}{' '}
                                <span className="text-xs text-teal-300/70">({line.variant_name})</span>
                              </div>
                              <div className="text-xs font-mono text-cyan-300/80">{line.sku}</div>
                            </td>

                            <td className="px-4 py-3">
                              <span className="text-xs text-teal-100">{line.source_location_name}</span>
                            </td>

                            <td className="px-4 py-3 text-center">
                              <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                {line.quantity} units
                              </span>
                            </td>

                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {formatLkr(line.unit_cost)}
                            </td>

                            <td className="px-4 py-3 text-right font-bold text-rose-300 font-mono">
                              {formatLkr(lineSubtotal)}
                            </td>

                            <td className="px-4 py-3 max-w-xs">
                              <div className="text-xs text-rose-300 truncate" title={line.writeoff_cause}>
                                {line.writeoff_cause}
                              </div>
                              <div className="text-[11px] text-teal-400/70 truncate" title={line.disposal_method}>
                                Method: {line.disposal_method}
                              </div>
                              {line.remarks && (
                                <div className="text-[10px] text-teal-300/50 truncate" title={line.remarks}>
                                  {line.remarks}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 text-xs">
                              {line.batch_reference && (
                                <div>
                                  <span className="text-teal-400/70">Batch:</span> {line.batch_reference}
                                </div>
                              )}
                              {line.expiry_date && (
                                <div>
                                  <span className="text-teal-400/70">Exp:</span> {line.expiry_date}
                                </div>
                              )}
                              {!line.batch_reference && !line.expiry_date && (
                                <span className="text-teal-600/60">—</span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleRemoveLine(line.key)}
                                className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-900/60 transition"
                                title="Remove line"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Summary Bar */}
              {writeOffLines.length > 0 && (
                <div className="p-4 bg-teal-950/90 border-t border-teal-800/60 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-6 text-xs">
                    <div>
                      <span className="text-teal-400/70">Total Lines:</span>{' '}
                      <strong className="text-white text-sm">{draftSummary.totalLines}</strong>
                    </div>
                    <div>
                      <span className="text-teal-400/70">Total Units:</span>{' '}
                      <strong className="text-white text-sm">{draftSummary.totalUnits}</strong>
                    </div>
                    <div>
                      <span className="text-rose-400/90 font-semibold">Total Asset Derecognition Loss:</span>{' '}
                      <strong className="text-rose-300 text-base font-bold font-mono">
                        {formatLkr(draftSummary.totalLoss)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Save Draft */}
                    <button
                      type="button"
                      onClick={() => saveDraftMutation.mutate()}
                      disabled={saveDraftMutation.isPending || postImmediateMutation.isPending}
                      className="px-4 py-2.5 rounded-xl border border-teal-700/60 text-teal-200 hover:bg-teal-900/60 text-sm font-semibold transition flex items-center gap-2 disabled:opacity-40"
                    >
                      <Clock className="w-4 h-4" />
                      Save Draft for Audit Review
                    </button>

                    {/* Authorize & Post Immediately */}
                    {canPost && (
                      <button
                        type="button"
                        onClick={() => postImmediateMutation.mutate()}
                        disabled={saveDraftMutation.isPending || postImmediateMutation.isPending}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-sm font-bold shadow-lg shadow-rose-950/60 transition flex items-center gap-2 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                        Authorize &amp; Post Write-Off Immediately
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 1: STOCK WRITE-OFF DOCUMENT DETAILS
         ══════════════════════════════════════════════════════════════════════════ */}
      {detailDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0b2926] border border-teal-800/60 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-teal-900/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-400">
                  <FileX className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>{detailQuery.data?.document_number || 'Loading...'}</span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wider font-semibold ${
                        detailQuery.data?.status === 'posted'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                      }`}
                    >
                      {detailQuery.data?.status === 'posted' ? 'Written-Off' : detailQuery.data?.status}
                    </span>
                  </h3>
                  <p className="text-xs text-teal-300/70">
                    Casualty Loss &amp; Asset Derecognition Record · {detailQuery.data?.document_date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailDocId(null)}
                className="p-1.5 rounded-lg text-teal-400 hover:text-white hover:bg-teal-900/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailQuery.isLoading ? (
              <div className="text-center py-12 text-teal-300">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                Loading document specifics...
              </div>
            ) : detailQuery.data ? (
              <div className="space-y-5">
                {/* Meta details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-teal-950/60 rounded-xl border border-teal-800/40 text-xs">
                  <div>
                    <span className="text-teal-400/60 block">Branch</span>
                    <strong className="text-white text-sm">{detailQuery.data.branch?.name || 'Main Branch'}</strong>
                  </div>
                  <div>
                    <span className="text-teal-400/60 block">Warehouse</span>
                    <strong className="text-white text-sm">{detailQuery.data.warehouse?.name || 'Main Warehouse'}</strong>
                  </div>
                  <div>
                    <span className="text-teal-400/60 block">Total Derecognized Value</span>
                    <strong className="text-rose-300 text-sm font-bold font-mono">
                      {formatLkr(Number(detailQuery.data.total_cost || 0))}
                    </strong>
                  </div>
                  <div>
                    <span className="text-teal-400/60 block">Supporting Reference</span>
                    <strong className="text-cyan-300 text-sm font-mono">
                      {detailQuery.data.supporting_reference || 'None'}
                    </strong>
                  </div>
                </div>

                {/* Reason & Notes */}
                <div className="p-3.5 bg-teal-950/40 rounded-xl border border-teal-800/30 text-xs space-y-1.5">
                  <div>
                    <span className="text-teal-400/70 font-semibold">Write-Off Cause &amp; Disposal:</span>{' '}
                    <span className="text-rose-300">{detailQuery.data.reason || 'General Loss'}</span>
                  </div>
                  {detailQuery.data.notes && (
                    <div>
                      <span className="text-teal-400/70 font-semibold">Audit Memo:</span>{' '}
                      <span className="text-slate-200">{detailQuery.data.notes}</span>
                    </div>
                  )}
                  {detailQuery.data.negative_stock_override && (
                    <div className="text-amber-300 text-[11px] font-medium flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Audited Negative-Stock Override was enabled for this transaction.
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <div className="border border-teal-800/40 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-teal-950/80 text-teal-300/80 uppercase tracking-wider border-b border-teal-800/50">
                      <tr>
                        <th className="px-3 py-2.5">Product &amp; SKU</th>
                        <th className="px-3 py-2.5">Location</th>
                        <th className="px-3 py-2.5 text-center">Quantity</th>
                        <th className="px-3 py-2.5 text-right">Cost/Unit</th>
                        <th className="px-3 py-2.5 text-right">Line Total</th>
                        <th className="px-3 py-2.5">Remarks / Batch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-teal-900/40 text-slate-200">
                      {detailQuery.data.items?.map((item) => (
                        <tr key={item.id} className="hover:bg-teal-900/20">
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-white">
                              {item.product_name || 'Product'} {item.variant_name ? `(${item.variant_name})` : ''}
                            </div>
                            <span className="font-mono text-cyan-300 text-[11px]">
                              {item.sku}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-teal-200/80">
                            {item.source_location_name || 'Default Bin'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {formatLkr(Number(item.unit_cost || 0))}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-300">
                            {formatLkr(Number(item.quantity || 0) * Number(item.unit_cost || 0))}
                          </td>
                          <td className="px-3 py-2.5 text-teal-300/70">
                            {item.remarks || item.batch_reference || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => {
                      setPrintDoc(detailQuery.data || null)
                      setDetailDocId(null)
                    }}
                    className="px-4 py-2 rounded-xl bg-teal-800/40 hover:bg-teal-700/60 border border-teal-600/50 text-white text-xs font-semibold flex items-center gap-2 transition"
                  >
                    <Printer className="w-4 h-4" />
                    Print Formal Certificate
                  </button>

                  <button
                    onClick={() => setDetailDocId(null)}
                    className="px-4 py-2 rounded-xl bg-teal-950 border border-teal-800 text-teal-300 hover:text-white text-xs transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 2: ACTION REASON PROMPT (REJECT, CANCEL, REVERSE)
         ══════════════════════════════════════════════════════════════════════════ */}
      {actionReasonModal.open && actionReasonModal.doc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0b2926] border border-teal-800/60 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                <span>Confirm {actionReasonModal.action.toUpperCase()}</span>
              </h3>
              <button
                onClick={() => setActionReasonModal({ open: false, action: 'cancel', doc: null, reason: '' })}
                className="text-teal-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-teal-200/80">
              Please enter an audited justification for {actionReasonModal.action}ing document{' '}
              <strong className="text-white font-mono">{actionReasonModal.doc.document_number}</strong>:
            </p>

            <textarea
              rows={3}
              value={actionReasonModal.reason}
              onChange={(e) =>
                setActionReasonModal((prev) => ({ ...prev, reason: e.target.value }))
              }
              placeholder="Provide obligatory reason for audit compliance..."
              className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-rose-400 transition"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setActionReasonModal({ open: false, action: 'cancel', doc: null, reason: '' })}
                className="px-4 py-2 rounded-xl bg-teal-950 border border-teal-800 text-teal-300 text-xs hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (actionReasonModal.doc) {
                    workflowActionMutation.mutate({
                      name: actionReasonModal.action,
                      document: actionReasonModal.doc,
                      reason: actionReasonModal.reason,
                    })
                  }
                }}
                disabled={workflowActionMutation.isPending || !actionReasonModal.reason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/50 disabled:opacity-40 transition"
              >
                {workflowActionMutation.isPending ? 'Processing...' : `Confirm ${actionReasonModal.action}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 3: PRINTABLE A4 CERTIFICATE OF WRITE-OFF & DESTRUCTION
         ══════════════════════════════════════════════════════════════════════════ */}
      {printDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white text-slate-900 rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto shadow-2xl p-8 space-y-6 print:p-0 print:max-h-none print:shadow-none">
            {/* Header controls (hidden when printed) */}
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Print Preview: A4 Official Write-Off Certificate
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 flex items-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Now
                </button>
                <button
                  onClick={() => setPrintDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* A4 Document Layout */}
            <div
              id="stock-write-off-certificate-printable"
              className="w-full max-w-4xl bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl rounded-xl border border-gray-300 space-y-6"
              style={{ width: '210mm', maxWidth: '96vw', backgroundColor: '#ffffff', color: '#000000', padding: '12mm 15mm' }}
            >
              {/* Company & Document Title */}
              <div className="flex items-start justify-between border-b-2 border-slate-800 pb-5">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                    Baby Bloom (Pvt) Ltd
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Official Certificate of Inventory Write-Off &amp; Asset Derecognition
                  </p>
                  <p className="text-xs text-slate-500">
                    Reg No: PV-00293841 · Inland Revenue Dept Audited Record
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 uppercase tracking-widest">Document Ref</div>
                  <div className="text-lg font-mono font-bold text-rose-700">
                    {printDoc.document_number}
                  </div>
                  <div className="text-xs font-semibold text-slate-600 mt-1">
                    Date: {printDoc.document_date}
                  </div>
                </div>
              </div>

              {/* Context Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg text-xs border border-slate-200">
                <div>
                  <span className="text-slate-500 block uppercase text-[10px] font-bold">Branch</span>
                  <span className="font-semibold text-slate-800">{printDoc.branch?.name || 'Main Branch'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[10px] font-bold">Warehouse</span>
                  <span className="font-semibold text-slate-800">{printDoc.warehouse?.name || 'Main Warehouse'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[10px] font-bold">Supporting Audit Ref</span>
                  <span className="font-semibold font-mono text-cyan-800">
                    {printDoc.supporting_reference || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[10px] font-bold">Status</span>
                  <span className="font-bold uppercase text-rose-700">
                    {printDoc.status === 'posted' ? 'WRITTEN-OFF & EXECUTED' : printDoc.status}
                  </span>
                </div>
              </div>

              {/* Loss Cause & Disposal Info */}
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-1">
                <div>
                  <span className="font-bold text-rose-900">Write-Off Cause / Reason:</span>{' '}
                  <span className="text-rose-800">{printDoc.reason || 'Asset Derecognition'}</span>
                </div>
                {printDoc.notes && (
                  <div>
                    <span className="font-bold text-rose-900">Board / Audit Notes:</span>{' '}
                    <span className="text-slate-700">{printDoc.notes}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Item Description &amp; SKU</th>
                      <th className="px-3 py-2">Stock Location</th>
                      <th className="px-3 py-2 text-center">Derecognized Qty</th>
                      <th className="px-3 py-2 text-right">Cost/Unit (LKR)</th>
                      <th className="px-3 py-2 text-right">Total Loss (LKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printDoc.items?.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2">
                          <span className="font-bold text-slate-900">{it.product_name}</span>{' '}
                          {it.variant_name && (
                            <span className="text-slate-500">({it.variant_name})</span>
                          )}
                          <div className="font-mono text-[10px] text-slate-500">{it.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {it.source_location_name || 'Default Location'}
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-slate-900">
                          {it.quantity}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatLkr(Number(it.unit_cost || 0))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                          {formatLkr(Number(it.quantity || 0) * Number(it.unit_cost || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 text-right uppercase text-[11px] text-slate-700">
                        Total Casualty Loss Valuation:
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-rose-800">
                        {formatLkr(Number(printDoc.total_cost || 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Formal Tripartite Signature Blocks */}
              <div className="grid grid-cols-3 gap-6 pt-10 text-xs">
                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Warehouse Controller</div>
                  <div className="text-[10px] text-slate-500">Inspection &amp; Destruction Officer</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date Stamp</div>
                </div>

                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Internal Auditor</div>
                  <div className="text-[10px] text-slate-500">Inventory Verification</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date Stamp</div>
                </div>

                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-bold text-slate-900">Financial Controller / Director</div>
                  <div className="text-[10px] text-slate-500">Final Asset Derecognition Sign-off</div>
                  <div className="mt-8 text-[10px] text-slate-400">Signature &amp; Date Stamp</div>
                </div>
              </div>

              {/* Legal Notice */}
              <div className="text-[10px] text-slate-400 text-center border-t pt-4">
                This document constitutes a legal derecognition certificate under Sri Lankan accounting standards (LKAS 2 / IAS 2 Inventories).
                All listed merchandise has been inspected and condemned from commercial valuation.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL 4: PRINTABLE A4 STOCK WRITE-OFF & ASSET DERECOGNITION REGISTER
         ══════════════════════════════════════════════════════════════════════════ */}
      {printRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0b2926] border border-teal-800/60 rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto shadow-2xl p-6 space-y-4 print:p-0 print:border-none print:bg-white print:max-h-none print:shadow-none">
            {/* Header controls (hidden on print) */}
            <div className="flex items-center justify-between border-b border-teal-900/60 pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <FileX className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold text-white">Stock Write-Off &amp; Disposal Audit Register</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  A4 Print &amp; PDF Report
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-lg shadow-rose-950/50 transition cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintRegisterModalOpen(false)}
                  className="p-2 rounded-xl bg-teal-950 hover:bg-teal-900 border border-teal-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Close Preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Printable Sheet */}
            <div
              id="stock-write-off-register-printable"
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
                    Premium Infant &amp; Children Apparel, Toys &amp; Nursery Essentials
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    No. 123 Galle Road, Colombo 03, Sri Lanka • Hotline: +94 11 234 5678 • info@babybloom.lk
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded mb-1">
                    Stock Write-Off &amp; Disposal Register
                  </span>
                  <div className="text-[10px] font-mono text-gray-600">
                    REF: SWO-REG-{new Date().getFullYear()}-{Math.floor(Date.now() / 1000).toString().slice(-4)}
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
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Document Status</span>
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
                  <div className="text-[10px] uppercase text-gray-500 font-bold">Total Write-Off Incidents</div>
                  <div className="text-base font-extrabold text-gray-900 mt-0.5">
                    {kpisQuery.data?.totalIncidents ?? (writeoffList.data?.rows || []).length}
                  </div>
                </div>
                <div className="border border-gray-300 p-2 rounded bg-gray-50">
                  <div className="text-[10px] uppercase text-gray-500 font-bold">Posted &amp; Derecognized</div>
                  <div className="text-base font-extrabold text-rose-700 mt-0.5">
                    {kpisQuery.data?.postedCount ?? (writeoffList.data?.rows || []).filter(r => r.status === 'posted').length}
                  </div>
                </div>
                <div className="border border-gray-300 p-2 rounded bg-gray-50">
                  <div className="text-[10px] uppercase text-gray-500 font-bold">Pending Review / Approval</div>
                  <div className="text-base font-extrabold text-amber-700 mt-0.5">
                    {kpisQuery.data?.pendingCount ?? (writeoffList.data?.rows || []).filter(r => ['draft', 'submitted', 'approved'].includes(r.status)).length}
                  </div>
                </div>
                <div className="border border-gray-300 p-2 rounded bg-gray-50">
                  <div className="text-[10px] uppercase text-gray-500 font-bold">Cumulative Loss Valuation</div>
                  <div className="text-base font-extrabold text-rose-700 font-mono mt-0.5">
                    {formatLkr(kpisQuery.data?.totalLossValuation ?? (writeoffList.data?.rows || []).reduce((acc, r) => acc + (r.total_cost || 0), 0))}
                  </div>
                </div>
              </div>

              {/* Itemized Table */}
              <table className="w-full text-left text-[10px] border border-gray-300 mb-6">
                <thead className="bg-gray-100 border-b border-gray-300 font-bold uppercase text-[9px]">
                  <tr>
                    <th className="p-2 border-r border-gray-300">Document #</th>
                    <th className="p-2 border-r border-gray-300">Date</th>
                    <th className="p-2 border-r border-gray-300">Branch &amp; Warehouse</th>
                    <th className="p-2 border-r border-gray-300">Write-Off Cause / Method</th>
                    <th className="p-2 border-r border-gray-300">Audit / Police Ref</th>
                    <th className="p-2 border-r border-gray-300 text-center">Lines</th>
                    <th className="p-2 border-r border-gray-300 text-right">Written-Off Loss</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(!writeoffList.data?.rows || writeoffList.data.rows.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-gray-500 italic">
                        No write-off transactions recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    writeoffList.data.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="p-2 border-r border-gray-200 font-mono font-bold text-gray-900">
                          {row.document_number}
                        </td>
                        <td className="p-2 border-r border-gray-200 text-gray-700">
                          {row.document_date}
                        </td>
                        <td className="p-2 border-r border-gray-200 text-gray-800">
                          <div>{row.branch?.name || 'Main Branch'}</div>
                          <div className="text-[9px] text-gray-500">{row.warehouse?.name || 'Main Warehouse'}</div>
                        </td>
                        <td className="p-2 border-r border-gray-200 text-rose-800 font-medium">
                          {row.reason || 'Casualty Loss'}
                        </td>
                        <td className="p-2 border-r border-gray-200 font-mono text-gray-600">
                          {row.supporting_reference || '—'}
                        </td>
                        <td className="p-2 border-r border-gray-200 text-center font-bold text-gray-800">
                          {row.items?.length || 0}
                        </td>
                        <td className="p-2 border-r border-gray-200 text-right font-mono font-bold text-rose-700">
                          {formatLkr(Number(row.total_cost || 0))}
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                              row.status === 'posted'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : row.status === 'approved'
                                ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                : row.status === 'submitted'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-gray-100 text-gray-700 border border-gray-300'
                            }`}
                          >
                            {row.status === 'posted' ? 'WRITTEN-OFF' : row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-400">
                  <tr>
                    <td colSpan={6} className="p-2.5 text-right uppercase text-[10px] text-gray-700">
                      Cumulative Asset Derecognition Loss:
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs text-rose-800">
                      {formatLkr((writeoffList.data?.rows || []).reduce((acc, r) => acc + Number(r.total_cost || 0), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>

              {/* Dual / Tripartite Authorization Signatures */}
              <div className="grid grid-cols-3 gap-6 pt-8 border-t border-gray-300 text-[10px]">
                <div className="text-center">
                  <div className="border-b border-gray-400 pb-1 font-bold text-gray-800">
                    Prepared By: Warehouse Officer
                  </div>
                  <div className="text-gray-500 mt-1">Inspection &amp; Condemnation Officer</div>
                  <div className="mt-8 text-[9px] text-gray-400">Signature &amp; Date Stamp</div>
                </div>
                <div className="text-center">
                  <div className="border-b border-gray-400 pb-1 font-bold text-gray-800">
                    Audited By: Internal Auditor
                  </div>
                  <div className="text-gray-500 mt-1">Verification &amp; Physical Compliance</div>
                  <div className="mt-8 text-[9px] text-gray-400">Signature &amp; Date Stamp</div>
                </div>
                <div className="text-center">
                  <div className="border-b border-gray-400 pb-1 font-bold text-gray-800">
                    Authorized By: CFO / Managing Director
                  </div>
                  <div className="text-gray-500 mt-1">Final Statutory Derecognition Sign-Off</div>
                  <div className="mt-8 text-[9px] text-gray-400">Signature &amp; Date Stamp</div>
                </div>
              </div>

              {/* Statutory Note */}
              <div className="text-[9px] text-gray-400 text-center border-t border-gray-200 pt-3 mt-6">
                This register constitutes a legal audit record under Sri Lanka Accounting Standard LKAS 2 (IAS 2 Inventories) and Inland Revenue Act provisions for verified business casualty deductions. Generated by Baby Bloom Cloud ERP.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
