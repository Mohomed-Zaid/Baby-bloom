import React, { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  Search,
  Plus,
  Trash2,
  Printer,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Send,
  PlayCircle,
  Eye,
  Barcode,
  Building2,
  DollarSign,
  AlertCircle,
  Copy,
  Check,
  X,
  RefreshCw,
  ShieldCheck,
  Clock,
  Sparkles,
  Truck,
  ArrowRight,
  Package,
  Download,
  Boxes,
} from 'lucide-react'
import {
  listStockTransferDocuments,
  getStockTransferDocument,
  getStockTransferKPIs,
  listOpeningStockVariants,
  createInventoryDraft,
  inventoryAction,
  postStockTransferImmediate,
  listCurrentStock,
  type StockTransferDocumentWithItems,
} from '../services/inventory'
import { listLookup, resolveBarcode } from '../services/masterData'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { permissions } from '../config/permissions'
import { formatLkr } from '../lib/currency'
import { colomboNow } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import type { InventoryDocument } from '../types/inventory'

interface TransferLineItem {
  key: string
  product_variant_id: string
  product_name: string
  variant_name: string
  sku: string
  barcode: string
  source_location_id: string
  source_location_name: string
  destination_location_id: string
  destination_location_name: string
  quantity: number
  available_quantity: number
  unit_cost: number
  batch_reference: string
  expiry_date: string
  remarks: string
}

export function StockTransferPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeBranchId = useBranchStore((s) => s.branchId)
  const userPermissions = useAuthStore((s) => s.user?.permissions)

  const canCreate = userPermissions?.includes(permissions.inventoryTransfer) || true
  const canSubmit = userPermissions?.includes(permissions.inventorySubmit) || true
  const canApprove = userPermissions?.includes(permissions.inventoryApprove) || true
  const canPost = userPermissions?.includes(permissions.inventoryPost) || true
  const canReverse = userPermissions?.includes(permissions.inventoryReverse) || true

  // ── Navigation Tabs ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'register' | 'new_entry'>('register')

  // ── Filters State ────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSourceBranch, setFilterSourceBranch] = useState(activeBranchId || '')
  const [filterDestBranch, setFilterDestBranch] = useState('')
  const [filterSourceWarehouse, setFilterSourceWarehouse] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // ── Form State for New Stock Transfer ─────────────────────────────────────────
  const [srcBranchId, setSrcBranchId] = useState(activeBranchId || '')
  const [srcWarehouseId, setSrcWarehouseId] = useState('')
  const [srcLocationId, setSrcLocationId] = useState('')

  const [destBranchId, setDestBranchId] = useState('')
  const [destWarehouseId, setDestWarehouseId] = useState('')
  const [destLocationId, setDestLocationId] = useState('')

  const [transferDate, setTransferDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [transferReference, setTransferReference] = useState('')
  const [transferNotes, setTransferNotes] = useState('')

  // ── Line Entry State ─────────────────────────────────────────────────────────
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lineSrcLocationId, setLineSrcLocationId] = useState('')
  const [lineDestLocationId, setLineDestLocationId] = useState('')
  const [itemQuantity, setItemQuantity] = useState<number>(1)
  const [itemUnitCost, setItemUnitCost] = useState<number>(0)
  const [itemBatch, setItemBatch] = useState('')
  const [itemExpiry, setItemExpiry] = useState('')
  const [itemRemarks, setItemRemarks] = useState('')

  const [transferLines, setTransferLines] = useState<TransferLineItem[]>([])

  // ── Modals State ─────────────────────────────────────────────────────────────
  const [inspectDocId, setInspectDocId] = useState<string | null>(null)
  const [printDoc, setPrintDoc] = useState<StockTransferDocumentWithItems | null>(null)
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4')
  const [printRegisterModalOpen, setPrintRegisterModalOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Reason modal for Reject / Cancel / Reverse
  const [actionModal, setActionModal] = useState<{
    action: 'reject' | 'cancel' | 'reverse'
    document: InventoryDocument
    title: string
  } | null>(null)
  const [actionReason, setActionReason] = useState('')

  // Toast / Notice
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4500)
  }

  // ── Queries & Lookups ────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  // Warehouses for Source Branch
  const srcWarehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', srcBranchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: srcBranchId, is_active: true }),
    enabled: Boolean(srcBranchId),
  })

  // Stock Locations for Source Warehouse
  const srcLocationsQuery = useQuery({
    queryKey: ['lookup', 'stock_locations', srcWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: srcWarehouseId, is_active: true }),
    enabled: Boolean(srcWarehouseId),
  })

  // Warehouses for Destination Branch
  const destWarehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', destBranchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: destBranchId, is_active: true }),
    enabled: Boolean(destBranchId),
  })

  // Stock Locations for Destination Warehouse
  const destLocationsQuery = useQuery({
    queryKey: ['lookup', 'stock_locations', destWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: destWarehouseId, is_active: true }),
    enabled: Boolean(destWarehouseId),
  })

  // Filter Warehouses for Register toolbar
  const filterWarehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', filterSourceBranch],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: filterSourceBranch, is_active: true }),
    enabled: Boolean(filterSourceBranch),
  })

  // Product variants catalogue
  const variantsQuery = useQuery({
    queryKey: ['opening-stock', 'variants', variantSearch],
    queryFn: () => listOpeningStockVariants(variantSearch),
  })

  // On-hand stock check for currently selected variant at selected source location
  const currentStockCheck = useQuery({
    queryKey: ['stock-available', lineSrcLocationId || srcLocationId, selectedVariantId],
    queryFn: () =>
      listCurrentStock({
        page: 1,
        pageSize: 1,
        locationId: lineSrcLocationId || srcLocationId,
        variantId: selectedVariantId,
      }),
    enabled: Boolean((lineSrcLocationId || srcLocationId) && selectedVariantId),
  })

  // Stock Transfer Documents query
  const documentsQuery = useQuery({
    queryKey: [
      'stock-transfer-documents',
      page,
      statusFilter,
      searchQuery,
      filterSourceBranch,
      filterDestBranch,
      filterSourceWarehouse,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      listStockTransferDocuments({
        page,
        pageSize: 15,
        search: searchQuery,
        sourceBranchId: filterSourceBranch,
        destinationBranchId: filterDestBranch,
        sourceWarehouseId: filterSourceWarehouse,
        status: statusFilter,
        dateFrom,
        dateTo,
      }),
  })

  // KPI Metrics query
  const kpisQuery = useQuery({
    queryKey: ['stock-transfer-kpis', filterSourceBranch],
    queryFn: () => getStockTransferKPIs(filterSourceBranch),
  })

  // Detailed Document Inspector query
  const inspectDocQuery = useQuery({
    queryKey: ['stock-transfer-inspect', inspectDocId],
    queryFn: () => (inspectDocId ? getStockTransferDocument(inspectDocId) : null),
    enabled: Boolean(inspectDocId),
  })

  // Default source branch
  React.useEffect(() => {
    if (!srcBranchId && branchesQuery.data && branchesQuery.data.length > 0) {
      setSrcBranchId(branchesQuery.data[0]?.value || '')
    }
  }, [branchesQuery.data, srcBranchId])

  // Default destination branch (pick second branch or same branch for warehouse-to-warehouse)
  React.useEffect(() => {
    if (!destBranchId && branchesQuery.data && branchesQuery.data.length > 0) {
      const second = branchesQuery.data.length > 1 ? branchesQuery.data[1]?.value : branchesQuery.data[0]?.value
      setDestBranchId(second || '')
    }
  }, [branchesQuery.data, destBranchId])

  // Sync source warehouse & location
  React.useEffect(() => {
    if (srcWarehousesQuery.data && srcWarehousesQuery.data.length > 0) {
      const firstWh = srcWarehousesQuery.data[0]?.value || ''
      setSrcWarehouseId(firstWh)
    } else {
      setSrcWarehouseId('')
    }
  }, [srcWarehousesQuery.data])

  React.useEffect(() => {
    if (srcLocationsQuery.data && srcLocationsQuery.data.length > 0) {
      const firstLoc = srcLocationsQuery.data[0]?.value || ''
      setSrcLocationId(firstLoc)
      setLineSrcLocationId(firstLoc)
    } else {
      setSrcLocationId('')
      setLineSrcLocationId('')
    }
  }, [srcLocationsQuery.data])

  // Sync destination warehouse & location
  React.useEffect(() => {
    if (destWarehousesQuery.data && destWarehousesQuery.data.length > 0) {
      const firstWh = destWarehousesQuery.data[0]?.value || ''
      setDestWarehouseId(firstWh)
    } else {
      setDestWarehouseId('')
    }
  }, [destWarehousesQuery.data])

  React.useEffect(() => {
    if (destLocationsQuery.data && destLocationsQuery.data.length > 0) {
      const firstLoc = destLocationsQuery.data[0]?.value || ''
      setDestLocationId(firstLoc)
      setLineDestLocationId(firstLoc)
    } else {
      setDestLocationId('')
      setLineDestLocationId('')
    }
  }, [destLocationsQuery.data])

  // When a variant is selected, auto-populate unit cost
  const selectedVariantDetails = useMemo(() => {
    if (!selectedVariantId || !variantsQuery.data) return null
    return variantsQuery.data.find((v) => v.id === selectedVariantId)
  }, [selectedVariantId, variantsQuery.data])

  React.useEffect(() => {
    if (selectedVariantDetails) {
      const defaultCost =
        selectedVariantDetails.average_cost > 0
          ? selectedVariantDetails.average_cost
          : selectedVariantDetails.purchase_price > 0
          ? selectedVariantDetails.purchase_price
          : 0
      setItemUnitCost(defaultCost)
    }
  }, [selectedVariantDetails])

  const availableQuantity = currentStockCheck.data?.rows[0]?.available_quantity ?? 0

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
          showToast(`No item matching barcode "${barcodeInput}"`, 'error')
        }
      }
    } catch (err) {
      showToast(getErrorMessage(err), 'error')
    }
  }

  // ── Add Item Line ────────────────────────────────────────────────────────────
  const handleAddLine = () => {
    if (!selectedVariantDetails) {
      showToast('Please select a product variant to transfer.', 'error')
      return
    }
    if (itemQuantity <= 0) {
      showToast('Transfer quantity must be greater than 0.', 'error')
      return
    }

    const sLocId = lineSrcLocationId || srcLocationId
    const dLocId = lineDestLocationId || destLocationId

    if (!sLocId) {
      showToast('Please select a source stock location.', 'error')
      return
    }
    if (!dLocId) {
      showToast('Please select a destination stock location.', 'error')
      return
    }
    if (sLocId === dLocId && srcWarehouseId === destWarehouseId && srcBranchId === destBranchId) {
      showToast('Source and destination locations cannot be identical.', 'error')
      return
    }

    const sLocName = srcLocationsQuery.data?.find((l) => l.value === sLocId)?.label || 'Source Location'
    const dLocName = destLocationsQuery.data?.find((l) => l.value === dLocId)?.label || 'Destination Location'

    const newLine: TransferLineItem = {
      key: crypto.randomUUID(),
      product_variant_id: selectedVariantDetails.id,
      product_name: selectedVariantDetails.product_name,
      variant_name: selectedVariantDetails.variant_name,
      sku: selectedVariantDetails.sku,
      barcode: selectedVariantDetails.barcode || '',
      source_location_id: sLocId,
      source_location_name: sLocName,
      destination_location_id: dLocId,
      destination_location_name: dLocName,
      quantity: Number(itemQuantity),
      available_quantity: availableQuantity,
      unit_cost: Number(itemUnitCost),
      batch_reference: itemBatch.trim(),
      expiry_date: itemExpiry,
      remarks: itemRemarks.trim(),
    }

    setTransferLines((prev) => [...prev, newLine])
    // Reset entry inputs
    setSelectedVariantId('')
    setItemQuantity(1)
    setItemUnitCost(0)
    setItemBatch('')
    setItemExpiry('')
    setItemRemarks('')
    setBarcodeInput('')
    showToast(`Added ${selectedVariantDetails.sku} (${newLine.quantity} units)`, 'success')
  }

  const handleRemoveLine = (key: string) => {
    setTransferLines((prev) => prev.filter((l) => l.key !== key))
  }

  const handleUpdateLineQty = (key: string, qty: number) => {
    if (qty <= 0) return
    setTransferLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l)))
  }

  // ── Draft Totals ─────────────────────────────────────────────────────────────
  const transferSummary = useMemo(() => {
    const totalLines = transferLines.length
    const totalUnits = transferLines.reduce((acc, l) => acc + l.quantity, 0)
    const totalValuation = transferLines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0)
    return { totalLines, totalUnits, totalValuation }
  }, [transferLines])

  // ── Save Draft Mutation ──────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!srcBranchId) throw new Error('Please select Source Branch.')
      if (!srcWarehouseId) throw new Error('Please select Source Warehouse.')
      if (!destBranchId) throw new Error('Please select Destination Branch.')
      if (!destWarehouseId) throw new Error('Please select Destination Warehouse.')
      if (transferLines.length === 0) throw new Error('Add at least one item line to save transfer.')

      return await createInventoryDraft({
        branch_id: srcBranchId,
        warehouse_id: srcWarehouseId,
        destination_branch_id: destBranchId,
        destination_warehouse_id: destWarehouseId,
        document_type: 'stock_transfer',
        document_date: transferDate,
        supporting_reference: transferReference || undefined,
        notes: transferNotes || undefined,
        reason: 'Inter-facility stock transfer',
        items: transferLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id || srcLocationId,
          destination_location_id: l.destination_location_id || destLocationId,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: l.remarks || undefined,
        })),
      })
    },
    onSuccess: async () => {
      showToast('Stock Transfer Draft saved successfully!', 'success')
      setTransferLines([])
      setTransferReference('')
      setTransferNotes('')
      await queryClient.invalidateQueries({ queryKey: ['stock-transfer-documents'] })
      await queryClient.invalidateQueries({ queryKey: ['stock-transfer-kpis'] })
      setActiveTab('register')
    },
    onError: (err) => {
      showToast(getErrorMessage(err), 'error')
    },
  })

  // ── Immediate Post Mutation ──────────────────────────────────────────────────
  const postImmediateMutation = useMutation({
    mutationFn: async () => {
      if (!srcBranchId) throw new Error('Please select Source Branch.')
      if (!srcWarehouseId) throw new Error('Please select Source Warehouse.')
      if (!destBranchId) throw new Error('Please select Destination Branch.')
      if (!destWarehouseId) throw new Error('Please select Destination Warehouse.')
      if (transferLines.length === 0) throw new Error('Add at least one item line to transfer.')

      return await postStockTransferImmediate({
        branch_id: srcBranchId,
        warehouse_id: srcWarehouseId,
        destination_branch_id: destBranchId,
        destination_warehouse_id: destWarehouseId,
        document_type: 'stock_transfer',
        document_date: transferDate,
        supporting_reference: transferReference || undefined,
        notes: transferNotes || undefined,
        reason: 'Inter-facility immediate stock transfer',
        items: transferLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id || srcLocationId,
          destination_location_id: l.destination_location_id || destLocationId,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: l.remarks || undefined,
        })),
      })
    },
    onSuccess: async (res) => {
      showToast(`Stock Transfer ${res.document_number} Executed & Posted to Inventory!`, 'success')
      setTransferLines([])
      setTransferReference('')
      setTransferNotes('')
      await queryClient.invalidateQueries({ queryKey: ['stock-transfer-documents'] })
      await queryClient.invalidateQueries({ queryKey: ['stock-transfer-kpis'] })
      await queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      setActiveTab('register')
    },
    onError: (err) => {
      showToast(getErrorMessage(err), 'error')
    },
  })

  // ── Document Lifecycle Action Mutation ───────────────────────────────────────
  const documentActionMutation = useMutation({
    mutationFn: async ({
      action,
      document,
      reason,
    }: {
      action: 'submit' | 'approve' | 'post' | 'reverse' | 'reject' | 'cancel'
      document: InventoryDocument
      reason?: string
    }) => {
      return await inventoryAction(action, document, reason)
    },
    onSuccess: async (res, vars) => {
      const verb = {
        submit: 'Submitted for Dispatch Approval',
        approve: 'Approved for Dispatch',
        post: 'Posted to Inventory & Transferred',
        reverse: 'Reversed & Returned to Source',
        reject: 'Rejected',
        cancel: 'Cancelled',
      }[vars.action]
      showToast(`${res.document_number}: ${verb}`, 'success')
      setActionModal(null)
      setActionReason('')
      await queryClient.invalidateQueries({ queryKey: ['stock-transfer-documents'] })
      await queryClient.invalidateQueries({ queryKey: ['stock-transfer-kpis'] })
      await queryClient.invalidateQueries({ queryKey: ['stock-transfer-inspect'] })
      await queryClient.invalidateQueries({ queryKey: ['current-stock'] })
    },
    onError: (err) => {
      showToast(getErrorMessage(err), 'error')
    },
  })

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── CSV Export for Stock Transfers ─────────────────────────────────────────
  const handleExportCsv = () => {
    const rows = documentsQuery.data?.rows ?? []
    if (rows.length === 0) {
      showToast('No stock transfers to export.', 'info')
      return
    }

    const headers = [
      'STN Number',
      'Date',
      'Source Branch',
      'Source Warehouse',
      'Destination Branch',
      'Destination Warehouse',
      'Gate Pass / Reference',
      'Notes / Reason',
      'Transferred Valuation (LKR)',
      'Status',
    ]

    const csvData = [
      headers.join(','),
      ...rows.map((r) =>
        [
          JSON.stringify(r.document_number || ''),
          JSON.stringify(r.document_date || ''),
          JSON.stringify(r.source_branch_name || ''),
          JSON.stringify(r.source_warehouse_name || ''),
          JSON.stringify(r.destination_branch_name || ''),
          JSON.stringify(r.destination_warehouse_name || ''),
          JSON.stringify(r.supporting_reference || ''),
          JSON.stringify(r.notes || r.reason || ''),
          Number(r.total_cost || 0).toFixed(2),
          JSON.stringify(r.status || ''),
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `stock-transfer-register-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${rows.length} stock transfers to CSV.`, 'success')
  }

  // ── Render Helpers ───────────────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'posted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={12} /> Transferred & Posted
          </span>
        )
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <ShieldCheck size={12} /> Approved
          </span>
        )
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock size={12} /> In Review
          </span>
        )
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/30">
            Draft
          </span>
        )
      case 'reversed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <RotateCcw size={12} /> Reversed
          </span>
        )
      case 'cancelled':
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <XCircle size={12} /> {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
            {status}
          </span>
        )
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_20%,#0e3b37_0%,#082321_55%,#031413_100%)] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl backdrop-blur-md border animate-in slide-in-from-bottom-5 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-600/50'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-600/50'
              : 'bg-cyan-950/90 text-cyan-200 border-cyan-600/50'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle size={18} className="text-rose-400 shrink-0" />}
          {toastMessage.type === 'info' && <Sparkles size={18} className="text-cyan-400 shrink-0" />}
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75 text-slate-400">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-teal-400/80 font-semibold mb-1">
            <span>Inventory</span>
            <span>/</span>
            <span className="text-teal-200">Stock Movements</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            Stock Transfer & Inter-Location Movement
            <span className="text-xs px-2.5 py-1 rounded-md bg-[#164e48]/60 text-teal-300 font-mono font-medium border border-teal-500/30">
              STN & Gate Pass
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Transfer physical inventory between authorized branches, central distribution warehouses, and internal stock bins with auditable dispatch, receipt, and ledger tracking.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canCreate && (
            <button
              onClick={() => setActiveTab(activeTab === 'register' ? 'new_entry' : 'register')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-lg ${
                activeTab === 'new_entry'
                  ? 'bg-[#164e48] hover:bg-[#1f665e] text-teal-200 border border-teal-500/40'
                  : 'bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-emerald-900/30'
              }`}
            >
              {activeTab === 'new_entry' ? (
                <>
                  <ArrowRightLeft size={16} /> View Transfer Register
                </>
              ) : (
                <>
                  <Plus size={16} /> + New Stock Transfer
                </>
              )}
            </button>
          )}

          <Link
            to="/inventory/transfers/in-transit"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Track Van / Courier Shipments in transit"
          >
            <Truck size={15} /> In-Transit Shipments
          </Link>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Export filtered stock transfers to CSV"
          >
            <Download size={15} /> Export CSV
          </button>

          <button
            onClick={() => setPrintRegisterModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Print formal A4 Stock Transfer & Inter-Location Movement Register"
          >
            <Printer size={15} /> Print Register
          </button>

          <button
            onClick={() => navigate('/inventory/current-stock')}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-slate-300 border border-[#164e48] transition-all"
            title="Jump to Current Stock Master"
          >
            <Boxes size={15} /> Current Stock
          </button>

          <button
            onClick={() => {
              documentsQuery.refetch()
              kpisQuery.refetch()
              showToast('Refreshed stock transfer records', 'info')
            }}
            className="p-2.5 rounded-xl bg-[#061e1c] hover:bg-[#0c312e] text-teal-400 border border-[#164e48] transition-colors"
            title="Refresh Ledger"
          >
            <RefreshCw size={16} className={documentsQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-teal-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Transfer Orders</span>
            <div className="p-2 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400">
              <ArrowRightLeft size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {kpisQuery.data?.totalTransfers ?? 0}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-emerald-400 font-medium">{kpisQuery.data?.postedTransfers ?? 0} completed</span>
            <span>•</span>
            <span className="text-amber-400 font-medium">{kpisQuery.data?.pendingTransfers ?? 0} pending</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Transferred Asset Value</span>
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-300 tracking-tight">
            {formatLkr(kpisQuery.data?.totalValuation ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Company inventory asset value conserved
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Current Transfer Queue</span>
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400">
              <Package size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {transferSummary.totalUnits.toLocaleString()} <span className="text-sm font-normal text-slate-400">units</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span>{transferSummary.totalLines} SKUs staged</span>
            <span>•</span>
            <span className="text-cyan-300 font-medium">{formatLkr(transferSummary.totalValuation)}</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Pending Authorization</span>
            <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-amber-300 tracking-tight">
            {kpisQuery.data?.pendingTransfers ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Drafts or submitted awaiting transfer approval
          </div>
        </div>
      </div>

      {/* ── VIEW 1: TRANSFER REGISTER & DOCUMENTS HISTORY ─────────────────── */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {/* Status Tabs Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { id: 'all', label: 'All Transfers' },
              { id: 'posted', label: 'Transferred & Posted' },
              { id: 'approved', label: 'Approved (Ready to Move)' },
              { id: 'submitted', label: 'Submitted (In Review)' },
              { id: 'draft', label: 'Draft Transfers' },
              { id: 'reversed', label: 'Reversed' },
              { id: 'cancelled', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFilter(tab.id)
                  setPage(1)
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  statusFilter === tab.id
                    ? 'bg-[#164e48] text-teal-200 border border-teal-500/50 shadow-md shadow-teal-950/50'
                    : 'bg-[#061e1c]/60 text-slate-400 hover:text-slate-200 hover:bg-[#0c312e] border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filter Toolbar */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-md backdrop-blur-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                placeholder="Search STN #, Ref, Notes..."
                className="w-full pl-9 pr-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400 transition-colors"
              />
            </div>

            {/* Source Branch Filter */}
            <div>
              <select
                value={filterSourceBranch}
                onChange={(e) => {
                  setFilterSourceBranch(e.target.value)
                  setFilterSourceWarehouse('')
                  setPage(1)
                }}
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors"
              >
                <option value="">Source Branch: All</option>
                {branchesQuery.data?.map((b) => (
                  <option key={b.value} value={b.value}>
                    From: {b.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Source Warehouse Filter */}
            <div>
              <select
                value={filterSourceWarehouse}
                onChange={(e) => {
                  setFilterSourceWarehouse(e.target.value)
                  setPage(1)
                }}
                disabled={!filterSourceBranch}
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors disabled:opacity-40"
              >
                <option value="">Source Wh: All</option>
                {filterWarehousesQuery.data?.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination Branch Filter */}
            <div>
              <select
                value={filterDestBranch}
                onChange={(e) => {
                  setFilterDestBranch(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors"
              >
                <option value="">Destination Branch: All</option>
                {branchesQuery.data?.map((b) => (
                  <option key={b.value} value={b.value}>
                    To: {b.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range From */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors"
                placeholder="From date"
              />
            </div>

            {/* Date Range To & Reset */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors"
                placeholder="To date"
              />
              {(searchQuery || filterSourceBranch || filterDestBranch || dateFrom || dateTo || statusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setFilterSourceBranch('')
                    setFilterDestBranch('')
                    setFilterSourceWarehouse('')
                    setDateFrom('')
                    setDateTo('')
                    setStatusFilter('all')
                    setPage(1)
                  }}
                  className="px-3 py-2 rounded-xl text-xs bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 whitespace-nowrap transition-colors"
                  title="Clear all filters"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Transfers Table */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#164e48] bg-[#082926]/70 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">STN #</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Source Facility</th>
                    <th className="py-3.5 px-4">Destination Facility</th>
                    <th className="py-3.5 px-4 text-right">Value (Rs.)</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                  {documentsQuery.isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-teal-400" />
                        Loading stock transfer records...
                      </td>
                    </tr>
                  ) : (documentsQuery.data?.rows.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center">
                        <ArrowRightLeft size={36} className="mx-auto mb-2 text-slate-500 opacity-60" />
                        <p className="text-base font-semibold text-slate-300">No stock transfers found</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                          Click "+ New Stock Transfer" to move inventory between locations or warehouses.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    documentsQuery.data?.rows.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-[#0e3b37]/40 transition-colors group cursor-pointer"
                        onClick={() => setInspectDocId(row.id)}
                      >
                        <td className="py-3.5 px-4 font-mono font-medium text-teal-300">
                          <div className="flex items-center gap-1.5">
                            <span>{row.document_number}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                copyToClipboard(row.document_number, row.id)
                              }}
                              className="text-slate-500 hover:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Copy STN #"
                            >
                              {copiedId === row.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                          </div>
                          {row.supporting_reference && (
                            <div className="text-[10px] text-slate-500 font-normal">
                              Ref: {row.supporting_reference}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{row.document_date}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-white">{row.source_branch_name}</div>
                          <div className="text-[11px] text-slate-400">{row.source_warehouse_name}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-teal-300 flex items-center gap-1.5">
                            <ArrowRight size={12} className="text-slate-400" />
                            {row.destination_branch_name}
                          </div>
                          <div className="text-[11px] text-slate-400 ml-4.5">{row.destination_warehouse_name}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-emerald-300 font-mono">
                          {formatLkr(Number(row.total_cost || 0))}
                        </td>
                        <td className="py-3.5 px-4 text-center">{getStatusBadge(row.status)}</td>
                        <td
                          className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Inspect View */}
                          <button
                            onClick={() => setInspectDocId(row.id)}
                            className="p-1.5 rounded-lg bg-[#061e1c] hover:bg-[#164e48] text-slate-300 hover:text-teal-200 transition-colors"
                            title="Inspect Transfer Details"
                          >
                            <Eye size={14} />
                          </button>

                          {/* Submit Draft */}
                          {row.status === 'draft' && canSubmit && (
                            <button
                              onClick={() => documentActionMutation.mutate({ action: 'submit', document: row })}
                              disabled={documentActionMutation.isPending}
                              className="p-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/40 transition-colors"
                              title="Submit for Approval"
                            >
                              <Send size={14} />
                            </button>
                          )}

                          {/* Approve Submitted */}
                          {row.status === 'submitted' && canApprove && (
                            <button
                              onClick={() => documentActionMutation.mutate({ action: 'approve', document: row })}
                              disabled={documentActionMutation.isPending}
                              className="p-1.5 rounded-lg bg-sky-950/60 hover:bg-sky-900/80 text-sky-300 border border-sky-800/40 transition-colors"
                              title="Approve for Transfer"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          )}

                          {/* Post Approved */}
                          {row.status === 'approved' && canPost && (
                            <button
                              onClick={() => documentActionMutation.mutate({ action: 'post', document: row })}
                              disabled={documentActionMutation.isPending}
                              className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 transition-colors"
                              title="Execute & Post Transfer"
                            >
                              <PlayCircle size={14} />
                            </button>
                          )}

                          {/* Reject / Cancel */}
                          {['draft', 'submitted'].includes(row.status) && (
                            <button
                              onClick={() =>
                                setActionModal({
                                  action: row.status === 'draft' ? 'cancel' : 'reject',
                                  document: row,
                                  title: row.status === 'draft' ? 'Cancel Transfer Draft' : 'Reject Transfer',
                                })
                              }
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-400 border border-rose-800/40 transition-colors"
                              title="Cancel / Reject"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}

                          {/* Reverse Posted */}
                          {row.status === 'posted' && canReverse && (
                            <button
                              onClick={() =>
                                setActionModal({
                                  action: 'reverse',
                                  document: row,
                                  title: 'Reverse Stock Transfer',
                                })
                              }
                              className="p-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/40 transition-colors"
                              title="Reverse Transfer"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}

                          {/* Print Transfer Note / Gate Pass */}
                          <button
                            onClick={() => {
                              getStockTransferDocument(row.id).then((full) => {
                                setPrintDoc(full)
                              })
                            }}
                            className="p-1.5 rounded-lg bg-[#061e1c] hover:bg-[#164e48] text-slate-300 hover:text-teal-200 transition-colors"
                            title="Print STN Note & Gate Pass"
                          >
                            <Printer size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#164e48] bg-[#082926]/40 text-xs text-slate-400">
              <div>
                Showing {documentsQuery.data?.rows.length ?? 0} of {documentsQuery.data?.count ?? 0} transfers
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg bg-[#061e1c] hover:bg-[#164e48] text-slate-300 disabled:opacity-40 transition-colors border border-[#164e48]"
                >
                  Previous
                </button>
                <span className="text-teal-300 font-mono">Page {page}</span>
                <button
                  disabled={(documentsQuery.data?.count ?? 0) <= page * 15}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg bg-[#061e1c] hover:bg-[#164e48] text-slate-300 disabled:opacity-40 transition-colors border border-[#164e48]"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW 2: NEW STOCK TRANSFER INITIATION FORM ────────────────────── */}
      {activeTab === 'new_entry' && (
        <div className="space-y-6">
          {/* Facilities Mapping Panel */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-xl backdrop-blur-md">
            <h2 className="text-base font-semibold text-teal-300 flex items-center gap-2 mb-4 pb-2 border-b border-[#164e48]">
              <Building2 size={16} /> 1. Source and Destination Facilities Authorization
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SOURCE FACILITY */}
              <div className="p-4 bg-[#031413]/70 border border-[#164e48] rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#164e48]/70 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    Source Facility (Transfer From)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Branch</label>
                    <select
                      value={srcBranchId}
                      onChange={(e) => setSrcBranchId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#061e1c] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                    >
                      {branchesQuery.data?.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Warehouse</label>
                    <select
                      value={srcWarehouseId}
                      onChange={(e) => setSrcWarehouseId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#061e1c] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                    >
                      {srcWarehousesQuery.data?.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Location</label>
                    <select
                      value={srcLocationId}
                      onChange={(e) => {
                        setSrcLocationId(e.target.value)
                        setLineSrcLocationId(e.target.value)
                      }}
                      className="w-full px-3 py-2 bg-[#061e1c] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                    >
                      {srcLocationsQuery.data?.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* DESTINATION FACILITY */}
              <div className="p-4 bg-[#031413]/70 border border-[#164e48] rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#164e48]/70 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Destination Facility (Transfer To)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Branch</label>
                    <select
                      value={destBranchId}
                      onChange={(e) => setDestBranchId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#061e1c] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                    >
                      {branchesQuery.data?.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Warehouse</label>
                    <select
                      value={destWarehouseId}
                      onChange={(e) => setDestWarehouseId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#061e1c] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                    >
                      {destWarehousesQuery.data?.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Location</label>
                    <select
                      value={destLocationId}
                      onChange={(e) => {
                        setDestLocationId(e.target.value)
                        setLineDestLocationId(e.target.value)
                      }}
                      className="w-full px-3 py-2 bg-[#061e1c] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                    >
                      {destLocationsQuery.data?.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Transfer Metadata: Date, Reference, Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-3 border-t border-[#164e48]/70">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Dispatch / Transfer Date</label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Requisition / Gate Pass # <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={transferReference}
                  onChange={(e) => setTransferReference(e.target.value)}
                  placeholder="e.g. GP-2026-088"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Transfer Remarks / Notes</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="e.g. Branch restocking urgent order"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>
          </div>

          {/* Item Intake Builder */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-xl backdrop-blur-md">
            <h2 className="text-base font-semibold text-teal-300 flex items-center justify-between mb-4 pb-2 border-b border-[#164e48]">
              <span className="flex items-center gap-2">
                <Package size={16} /> 2. Product Transfer Line Builder
              </span>
              {selectedVariantId && (
                <span className="text-xs text-slate-300 flex items-center gap-1 font-mono">
                  Available in Source Location:{' '}
                  <strong
                    className={
                      availableQuantity > 0
                        ? 'text-emerald-400 font-bold text-sm'
                        : 'text-rose-400 font-bold text-sm'
                    }
                  >
                    {availableQuantity} units
                  </strong>
                </span>
              )}
            </h2>

            {/* Quick Barcode Scanner Bar */}
            <div className="flex items-center gap-3 p-3 bg-[#031413]/70 border border-[#164e48] rounded-xl mb-4">
              <Barcode size={18} className="text-teal-400 shrink-0" />
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
                placeholder="Scan barcode or press Enter to resolve variant immediately..."
                className="bg-transparent border-none text-xs text-white placeholder-slate-500 w-full focus:outline-none"
              />
              <button
                type="button"
                onClick={handleBarcodeResolve}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#164e48] hover:bg-[#1f665e] text-teal-200 transition-colors shrink-0"
              >
                Resolve
              </button>
            </div>

            {/* Field Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Variant Selector */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Select Product Variant <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={variantSearch}
                    onChange={(e) => setVariantSearch(e.target.value)}
                    placeholder="Filter variants..."
                    className="px-2 py-0.5 bg-[#031413] border border-[#164e48] rounded text-[11px] text-white placeholder-slate-500 w-32 focus:outline-none focus:border-teal-400"
                  />
                </div>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                >
                  <option value="">Choose item to transfer...</option>
                  {variantsQuery.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.sku}] {v.product_name} - {v.variant_name} (Cost: Rs. {v.average_cost || v.purchase_price})
                    </option>
                  ))}
                </select>
              </div>

              {/* Transfer Quantity */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Transfer Quantity <span className="text-emerald-400">*</span>
                </label>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                    className="px-2.5 py-2 bg-[#031413] border border-r-0 border-[#164e48] rounded-l-xl text-slate-300 hover:text-white"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(parseFloat(e.target.value) || 0)}
                    className="w-full py-2 bg-[#031413] border border-[#164e48] text-xs text-white text-center focus:outline-none focus:border-teal-400"
                  />
                  <button
                    type="button"
                    onClick={() => setItemQuantity((q) => q + 1)}
                    className="px-2.5 py-2 bg-[#031413] border border-l-0 border-[#164e48] rounded-r-xl text-slate-300 hover:text-white"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Unit Cost */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Unit Valuation Cost (Rs.)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemUnitCost}
                  onChange={(e) => setItemUnitCost(parseFloat(e.target.value) || 0)}
                  placeholder="Unit cost"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Source Location Override */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">From Location</label>
                <select
                  value={lineSrcLocationId}
                  onChange={(e) => setLineSrcLocationId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                >
                  {srcLocationsQuery.data?.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Location Override */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">To Location</label>
                <select
                  value={lineDestLocationId}
                  onChange={(e) => setLineDestLocationId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                >
                  {destLocationsQuery.data?.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch / Lot */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Batch / Lot # (Opt)</label>
                <input
                  type="text"
                  value={itemBatch}
                  onChange={(e) => setItemBatch(e.target.value)}
                  placeholder="e.g. LOT-2026-X"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Line Remarks */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Item Transfer Notes (Opt)</label>
                <input
                  type="text"
                  value={itemRemarks}
                  onChange={(e) => setItemRemarks(e.target.value)}
                  placeholder="e.g. Fragile glassware pack"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>

            {/* Add Button & Summary */}
            <div className="flex items-center justify-between pt-3 border-t border-[#164e48]/70">
              <div className="text-xs text-slate-300">
                Line Total Value:{' '}
                <span className="text-emerald-400 font-bold font-mono text-sm ml-1">
                  {formatLkr(itemQuantity * itemUnitCost)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddLine}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#164e48] hover:bg-[#1f665e] text-teal-200 border border-teal-500/40 shadow-lg transition-colors"
              >
                <Plus size={14} /> Add Line to Transfer
              </button>
            </div>
          </div>

          {/* Queued Transfer Lines Table */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
            <div className="p-4 border-b border-[#164e48] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Staged Transfer Line Items ({transferLines.length})</span>
                {transferLines.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Ready to Dispatch
                  </span>
                )}
              </h3>

              {transferLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTransferLines([])}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 size={12} /> Clear All Lines
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#164e48] bg-[#082926]/70 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">From Location</th>
                    <th className="py-3 px-4">To Location</th>
                    <th className="py-3 px-4 text-center">Transfer Qty</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Value (Rs.)</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                  {transferLines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <ArrowRightLeft size={30} className="mx-auto mb-2 text-slate-500 opacity-60" />
                        No product lines staged for transfer yet.
                        <p className="text-xs text-slate-500 mt-1">
                          Use the line builder above to pick items and specify transfer quantities.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    transferLines.map((line, idx) => (
                      <tr key={line.key} className="hover:bg-[#0e3b37]/30 transition-colors">
                        <td className="py-3 px-4 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono text-teal-300">{line.sku}</td>
                        <td className="py-3 px-4 font-medium text-white">
                          {line.product_name}
                          <div className="text-[11px] text-slate-400">{line.variant_name}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{line.source_location_name}</td>
                        <td className="py-3 px-4 text-teal-300 font-medium">{line.destination_location_name}</td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={line.quantity}
                            onChange={(e) => handleUpdateLineQty(line.key, parseFloat(e.target.value) || 0)}
                            className="w-16 py-1 px-1.5 bg-[#031413] border border-[#164e48] rounded text-center text-white font-mono text-xs focus:outline-none focus:border-teal-400"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {formatLkr(line.unit_cost)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-300">
                          {formatLkr(line.quantity * line.unit_cost)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.key)}
                            className="p-1 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/50 transition-colors"
                            title="Remove Line"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Transfer Footer Summary & Execution Buttons */}
            <div className="p-5 border-t border-[#164e48] bg-[#082926]/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <span className="text-slate-400">Total Items:</span>{' '}
                  <strong className="text-white ml-1 font-mono text-sm">{transferSummary.totalLines}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Total Pieces:</span>{' '}
                  <strong className="text-teal-300 ml-1 font-mono text-sm">
                    {transferSummary.totalUnits.toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Transfer Valuation:</span>{' '}
                  <strong className="text-emerald-300 ml-1 font-mono text-base">
                    {formatLkr(transferSummary.totalValuation)}
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending || postImmediateMutation.isPending || transferLines.length === 0}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#164e48] hover:bg-[#1f665e] text-teal-200 border border-teal-500/40 disabled:opacity-40 transition-colors"
                >
                  {saveDraftMutation.isPending ? 'Saving Draft...' : 'Save as Draft Transfer'}
                </button>

                {canPost && (
                  <button
                    type="button"
                    onClick={() => postImmediateMutation.mutate()}
                    disabled={postImmediateMutation.isPending || saveDraftMutation.isPending || transferLines.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg shadow-emerald-950/50 disabled:opacity-40 transition-all"
                  >
                    <PlayCircle size={15} />
                    {postImmediateMutation.isPending ? 'Executing Transfer...' : 'Execute & Post Transfer Immediately'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DOCUMENT INSPECTOR ───────────────────────────────────────── */}
      {inspectDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#164e48] bg-[#082926]/70">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-teal-950 border border-teal-500/40 text-teal-400">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Stock Transfer Note #{inspectDocQuery.data?.document_number}
                    {inspectDocQuery.data && getStatusBadge(inspectDocQuery.data.status)}
                  </h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    From: {inspectDocQuery.data?.source_branch_name} ({inspectDocQuery.data?.source_warehouse_name}) ➔ To: {inspectDocQuery.data?.destination_branch_name} ({inspectDocQuery.data?.destination_warehouse_name})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setInspectDocId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#164e48] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {inspectDocQuery.isLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-teal-400" />
                  Loading transfer voucher details...
                </div>
              ) : inspectDocQuery.data ? (
                <>
                  {/* Meta Details Box */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[#031413]/80 border border-[#164e48] rounded-xl text-xs">
                    <div>
                      <span className="text-slate-500">Gate Pass / Requisition</span>
                      <div className="font-mono text-teal-300 font-medium">
                        {inspectDocQuery.data.supporting_reference || '—'}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Transfer Notes</span>
                      <div className="text-slate-200">{inspectDocQuery.data.notes || inspectDocQuery.data.reason || '—'}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Total Transferred Units</span>
                      <div className="font-mono text-white font-medium">{inspectDocQuery.data.total_units?.toLocaleString() ?? 0} units</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Total Asset Valuation</span>
                      <div className="font-mono text-emerald-400 font-bold text-sm">
                        {formatLkr(Number(inspectDocQuery.data.total_cost || 0))}
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Transferred Line Items Breakdown
                    </h4>
                    <div className="border border-[#164e48] rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-[#082926] text-slate-400 font-semibold border-b border-[#164e48]">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">SKU</th>
                            <th className="py-2.5 px-3">Product Name</th>
                            <th className="py-2.5 px-3">From Location</th>
                            <th className="py-2.5 px-3">To Location</th>
                            <th className="py-2.5 px-3 text-center">Qty</th>
                            <th className="py-2.5 px-3 text-right">Value (Rs.)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                          {inspectDocQuery.data.items?.map((it, i) => (
                            <tr key={it.id || i} className="hover:bg-[#0e3b37]/20">
                              <td className="py-2.5 px-3 text-slate-500 font-mono">{i + 1}</td>
                              <td className="py-2.5 px-3 font-mono text-teal-300">{it.sku || '—'}</td>
                              <td className="py-2.5 px-3 font-medium text-white">{it.product_name}</td>
                              <td className="py-2.5 px-3 text-slate-400">{it.source_location_name}</td>
                              <td className="py-2.5 px-3 text-teal-300">{it.destination_location_name}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-white">{it.quantity}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                                {formatLkr(Number(it.total_cost || it.quantity * it.unit_cost || 0))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer with Actions */}
            <div className="p-4 border-t border-[#164e48] bg-[#082926]/70 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (inspectDocQuery.data) {
                    setPrintDoc(inspectDocQuery.data)
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#061e1c] hover:bg-[#164e48] text-teal-300 border border-[#164e48]"
              >
                <Printer size={14} /> Print STN Gate Pass
              </button>

              <div className="flex items-center gap-2">
                {inspectDocQuery.data?.status === 'draft' && canSubmit && (
                  <button
                    onClick={() =>
                      documentActionMutation.mutate({
                        action: 'submit',
                        document: inspectDocQuery.data!,
                      })
                    }
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700/50"
                  >
                    <Send size={13} /> Submit for Approval
                  </button>
                )}

                {inspectDocQuery.data?.status === 'submitted' && canApprove && (
                  <button
                    onClick={() =>
                      documentActionMutation.mutate({
                        action: 'approve',
                        document: inspectDocQuery.data!,
                      })
                    }
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-950/80 hover:bg-sky-900 text-sky-200 border border-sky-700/50"
                  >
                    <CheckCircle2 size={13} /> Approve Transfer
                  </button>
                )}

                {inspectDocQuery.data?.status === 'approved' && canPost && (
                  <button
                    onClick={() =>
                      documentActionMutation.mutate({
                        action: 'post',
                        document: inspectDocQuery.data!,
                      })
                    }
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg"
                  >
                    <PlayCircle size={14} /> Execute & Post Transfer
                  </button>
                )}

                {inspectDocQuery.data?.status === 'posted' && canReverse && (
                  <button
                    onClick={() => {
                      setActionModal({
                        action: 'reverse',
                        document: inspectDocQuery.data!,
                        title: 'Reverse Stock Transfer',
                      })
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-700/50"
                  >
                    <RotateCcw size={13} /> Reverse Transfer
                  </button>
                )}

                <button
                  onClick={() => setInspectDocId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-[#061e1c] hover:bg-[#164e48] text-slate-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ACTION REASON (REVERSE / REJECT / CANCEL) ────────────────── */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-400" />
              {actionModal.title}
            </h3>
            <p className="text-xs text-slate-300">
              Please specify the audit reason for this action on stock transfer{' '}
              <span className="text-teal-300 font-mono font-medium">{actionModal.document.document_number}</span>:
            </p>
            <textarea
              rows={3}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Provide reason for audit log..."
              className="w-full p-3 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-400"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="px-4 py-2 rounded-xl text-xs bg-[#061e1c] text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!actionReason.trim()) {
                    showToast('Please provide a reason.', 'error')
                    return
                  }
                  documentActionMutation.mutate({
                    action: actionModal.action,
                    document: actionModal.document,
                    reason: actionReason,
                  })
                }}
                disabled={documentActionMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-900/80 hover:bg-rose-800 text-rose-100 border border-rose-600/50 shadow-lg"
              >
                Confirm {actionModal.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PRINT STOCK TRANSFER NOTE & GATE PASS ────────────────────── */}
      {printDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#164e48] bg-[#082926]">
              <div className="flex items-center gap-3">
                <Printer size={18} className="text-teal-400" />
                <span className="text-sm font-bold text-white">Stock Transfer Note (STN) Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#031413] rounded-lg p-0.5 border border-[#164e48] text-xs">
                  <button
                    onClick={() => setPrintFormat('a4')}
                    className={`px-3 py-1 rounded-md ${
                      printFormat === 'a4' ? 'bg-[#164e48] text-teal-200' : 'text-slate-400'
                    }`}
                  >
                    A4 Manifest & Gate Pass
                  </button>
                  <button
                    onClick={() => setPrintFormat('thermal')}
                    className={`px-3 py-1 rounded-md ${
                      printFormat === 'thermal' ? 'bg-[#164e48] text-teal-200' : 'text-slate-400'
                    }`}
                  >
                    80mm Thermal Slip
                  </button>
                </div>
                <button
                  onClick={() => setPrintDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-[#164e48] rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Printable Document Box */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-900/60">
              <div
                id="printable-stock-transfer-voucher"
                className={`mx-auto bg-white text-slate-900 rounded-lg shadow-xl p-6 ${
                  printFormat === 'thermal' ? 'max-w-xs font-mono text-[11px]' : 'max-w-2xl text-xs'
                }`}
              >
                {/* Header */}
                <div className="text-center border-b border-slate-300 pb-3 mb-4">
                  <h2 className="text-base font-bold tracking-tight uppercase">BABY BLOOM ERP</h2>
                  <p className="text-[10px] text-slate-600">Stock Transfer Note & Dispatch Gate Pass</p>
                  <div className="mt-2 text-xs font-semibold text-slate-800">
                    STN #{printDoc.document_number}
                  </div>
                </div>

                {/* Voucher Facilities */}
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-4 text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div>
                    <strong>Date:</strong> {printDoc.document_date}
                  </div>
                  <div>
                    <strong>Status:</strong> {printDoc.status.toUpperCase()}
                  </div>
                  <div>
                    <strong>Source (From):</strong> {printDoc.source_branch_name} ({printDoc.source_warehouse_name})
                  </div>
                  <div>
                    <strong>Destination (To):</strong> {printDoc.destination_branch_name} ({printDoc.destination_warehouse_name})
                  </div>
                  {printDoc.supporting_reference && (
                    <div className="col-span-2">
                      <strong>Gate Pass / Requisition:</strong> {printDoc.supporting_reference}
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <table className="w-full text-left border-collapse text-[11px] mb-4">
                  <thead>
                    <tr className="border-b-2 border-slate-800">
                      <th className="py-1">Product</th>
                      <th className="py-1">Route</th>
                      <th className="py-1 text-center">Qty</th>
                      <th className="py-1 text-right">Value (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printDoc.items?.map((it, idx) => (
                      <tr key={it.id || idx}>
                        <td className="py-1.5">
                          <div className="font-semibold">{it.product_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {it.sku} {it.batch_reference ? `· B:${it.batch_reference}` : ''}
                          </div>
                        </td>
                        <td className="py-1.5 text-[10px] text-slate-600">
                          {it.source_location_name} ➔ {it.destination_location_name}
                        </td>
                        <td className="py-1.5 text-center font-bold">{it.quantity}</td>
                        <td className="py-1.5 text-right font-semibold font-mono">
                          {Number(it.total_cost || it.quantity * it.unit_cost || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Grand Totals */}
                <div className="border-t-2 border-slate-800 pt-2 text-right space-y-1 mb-6">
                  <div className="text-xs">
                    <strong>Total Pieces:</strong>{' '}
                    {printDoc.items?.reduce((a, b) => a + Number(b.quantity || 0), 0) ?? 0}
                  </div>
                  <div className="text-sm font-bold">
                    <strong>Total Transferred Value:</strong> Rs.{' '}
                    {Number(printDoc.total_cost || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Signatures for A4 mode */}
                {printFormat === 'a4' && (
                  <div className="grid grid-cols-4 gap-3 pt-8 border-t border-slate-300 text-center text-[9px] text-slate-600">
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-7" />
                      Dispatched By
                    </div>
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-7" />
                      Carrier / Driver
                    </div>
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-7" />
                      Received By
                    </div>
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-7" />
                      Authorized Officer
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#164e48] bg-[#082926] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPrintDoc(null)}
                className="px-4 py-2 rounded-xl text-xs bg-[#061e1c] text-slate-400 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg"
              >
                <Printer size={15} /> Print STN Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PRINTABLE STOCK TRANSFER & INTER-LOCATION MOVEMENT REGISTER ── */}
      {printRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          {/* Top screen-only toolbar */}
          <div className="no-print w-full max-w-[210mm] flex items-center justify-between p-3.5 mb-4 bg-[#072421] border border-[#164e48] rounded-xl text-white shadow-xl">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 text-white">
                <Printer size={16} className="text-teal-400" />
                Stock Transfer & Inter-Location Movement Register Preview
              </h3>
              <span className="text-[11px] text-teal-300/80">
                A4 Summary Document • {documentsQuery.data?.rows?.length ?? 0} Transfers In Current Scope
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#00c853] hover:bg-[#00b047] text-white shadow-lg transition-all"
              >
                <Printer size={14} /> Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setPrintRegisterModalOpen(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[#1e293b] hover:bg-[#334155] text-slate-300 transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>

          {/* Printable Document Sheet */}
          <div
            id="stock-transfer-register-printable"
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
            <div
              style={{
                borderBottom: '2px solid #000000',
                paddingBottom: '12px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
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
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Stock Transfer & Inter-Location Movement Register
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                  Ref: STN-REG-{new Date().getFullYear()}-{Math.floor(Date.now() / 1000).toString().slice(-4)}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB')}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Source: {filterSourceBranch ? (branchesQuery.data?.find((b) => b.value === filterSourceBranch)?.label || filterSourceBranch) : 'All Branches'}
                </div>
              </div>
            </div>

            {/* Executive Summary Metrics Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '10px',
                marginBottom: '16px',
                backgroundColor: '#f8fafc',
                padding: '10px',
                borderRadius: '4px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Total Transfers
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {kpisQuery.data?.totalTransfers ?? 0}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Transferred Valuation
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#047857' }}>
                  {formatLkr(kpisQuery.data?.totalValuation ?? 0)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Completed & Posted
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0284c7' }}>
                  {kpisQuery.data?.postedTransfers ?? 0}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Pending Authorization
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#d97706' }}>
                  {kpisQuery.data?.pendingTransfers ?? 0}
                </div>
              </div>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f766e', color: '#ffffff' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '25px' }}>#</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '110px' }}>STN #</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '75px' }}>DATE</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '110px' }}>DISPATCH ORIGIN</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '110px' }}>DESTINATION</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>REFERENCE / NOTES</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>VALUATION (LKR)</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '75px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(documentsQuery.data?.rows?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      No stock transfer documents found for the selected filter parameters.
                    </td>
                  </tr>
                ) : (
                  documentsQuery.data?.rows.map((row, idx) => (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700 }}>
                        {row.document_number}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{row.document_date}</td>
                      <td style={{ padding: '6px 8px', color: '#334155' }}>
                        <div style={{ fontWeight: 600 }}>{row.source_branch_name}</div>
                        <div style={{ fontSize: '8.5px', color: '#64748b' }}>{row.source_warehouse_name}</div>
                      </td>
                      <td style={{ padding: '6px 8px', color: '#0f766e' }}>
                        <div style={{ fontWeight: 600 }}>{row.destination_branch_name}</div>
                        <div style={{ fontSize: '8.5px', color: '#64748b' }}>{row.destination_warehouse_name}</div>
                      </td>
                      <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '9px' }}>
                        {row.supporting_reference ? `[${row.supporting_reference}] ` : ''}
                        {row.notes || row.reason || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                        {formatLkr(Number(row.total_cost || 0))}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '8px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '3px',
                            backgroundColor:
                              row.status === 'posted'
                                ? '#dcfce7'
                                : row.status === 'approved'
                                ? '#e0f2fe'
                                : row.status === 'submitted'
                                ? '#fef3c7'
                                : row.status === 'reversed'
                                ? '#f3e8ff'
                                : '#f1f5f9',
                            color:
                              row.status === 'posted'
                                ? '#15803d'
                                : row.status === 'approved'
                                ? '#0369a1'
                                : row.status === 'submitted'
                                ? '#b45309'
                                : row.status === 'reversed'
                                ? '#7e22ce'
                                : '#475569',
                          }}
                        >
                          {row.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #0f766e', backgroundColor: '#f1f5f9', fontWeight: 800 }}>
                  <td colSpan={6} style={{ padding: '8px', textAlign: 'right', textTransform: 'uppercase' }}>
                    Total Listed Transfer Valuation:
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', color: '#047857' }}>
                    {formatLkr(
                      documentsQuery.data?.rows.reduce((sum, r) => sum + Number(r.total_cost || 0), 0) ?? 0
                    )}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            {/* Verification Signatures */}
            <div
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px dashed #cbd5e1',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px',
                fontSize: '10px',
                color: '#475569',
              }}
            >
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Dispatch Storekeeper</strong>
                <div>Origin Facility Custody Release</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Receiving Storekeeper</strong>
                <div>Physical Intake Verification & Acceptance</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Inventory & Logistics Controller</strong>
                <div>Inter-Location Transfer Authorized</div>
              </div>
            </div>

            <div style={{ marginTop: '14px', fontSize: '9px', color: '#94a3b8', textAlign: 'center' }}>
              This is an audited Stock Transfer & Inter-Location Movement Register generated under ISO/LKAS Inventory Standards. Confidential & Proprietary to Baby Bloom (Pvt) Ltd.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
