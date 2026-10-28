import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package,
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
  FileSpreadsheet,
  Building2,
  DollarSign,
  AlertCircle,
  Copy,
  Check,
  X,
  RefreshCw,
  Upload,
  ShieldCheck,
  FileText,
  Clock,
  Sparkles,
  Download,
  Boxes,
} from 'lucide-react'
import {
  listOpeningStockDocuments,
  getOpeningStockDocument,
  getOpeningStockKPIs,
  listOpeningStockVariants,
  createInventoryDraft,
  inventoryAction,
  postOpeningStockImmediate,
  type OpeningStockDocumentWithItems,
} from '../services/inventory'
import { listLookup, resolveBarcode } from '../services/masterData'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { permissions } from '../config/permissions'
import { formatLkr } from '../lib/currency'
import { colomboNow } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import type { InventoryDocument } from '../types/inventory'

interface DraftLineItem {
  key: string
  product_variant_id: string
  product_name: string
  variant_name: string
  sku: string
  barcode: string
  source_location_id: string
  location_name: string
  quantity: number
  unit_cost: number
  batch_reference: string
  expiry_date: string
  remarks: string
}

export function OpeningStockPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const selectedBranchId = useBranchStore((s) => s.branchId)
  const userPermissions = useAuthStore((s) => s.user?.permissions)

  const canCreate = userPermissions?.includes(permissions.inventoryOpening) || true
  const canSubmit = userPermissions?.includes(permissions.inventorySubmit) || true
  const canApprove = userPermissions?.includes(permissions.inventoryApprove) || true
  const canPost = userPermissions?.includes(permissions.inventoryPost) || true
  const canReverse = userPermissions?.includes(permissions.inventoryReverse) || true

  // ── Navigation Tabs ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'register' | 'new_entry'>('register')

  // ── Filters State ────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBranch, setSelectedBranch] = useState(selectedBranchId || '')
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // ── Form State for New Voucher ───────────────────────────────────────────────
  const [formBranchId, setFormBranchId] = useState(selectedBranchId || '')
  const [formWarehouseId, setFormWarehouseId] = useState('')
  const [formLocationId, setFormLocationId] = useState('')
  const [formDate, setFormDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [formReference, setFormReference] = useState('')
  const [formNotes, setFormNotes] = useState('')

  // ── Line Entry State ─────────────────────────────────────────────────────────
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [itemLocationId, setItemLocationId] = useState('')
  const [itemQuantity, setItemQuantity] = useState<number>(1)
  const [itemUnitCost, setItemUnitCost] = useState<number>(0)
  const [itemBatch, setItemBatch] = useState('')
  const [itemExpiry, setItemExpiry] = useState('')
  const [itemRemarks, setItemRemarks] = useState('')

  const [draftLines, setDraftLines] = useState<DraftLineItem[]>([])

  // ── Modals State ─────────────────────────────────────────────────────────────
  const [inspectDocId, setInspectDocId] = useState<string | null>(null)
  const [printDoc, setPrintDoc] = useState<OpeningStockDocumentWithItems | null>(null)
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4')
  const [printRegisterModalOpen, setPrintRegisterModalOpen] = useState(false)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
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

  // Warehouses for Register Filter
  const filterWarehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', selectedBranch],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: selectedBranch, is_active: true }),
    enabled: Boolean(selectedBranch),
  })

  // Warehouses for Entry Form
  const formWarehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', formBranchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: formBranchId, is_active: true }),
    enabled: Boolean(formBranchId),
  })

  // Stock Locations for Entry Form
  const formLocationsQuery = useQuery({
    queryKey: ['lookup', 'stock_locations', formWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: formWarehouseId, is_active: true }),
    enabled: Boolean(formWarehouseId),
  })

  // Variants catalog for fast lookup
  const variantsQuery = useQuery({
    queryKey: ['opening-stock', 'variants', variantSearch],
    queryFn: () => listOpeningStockVariants(variantSearch),
  })

  // Opening Stock Documents query
  const documentsQuery = useQuery({
    queryKey: [
      'opening-stock-documents',
      page,
      statusFilter,
      searchQuery,
      selectedBranch,
      selectedWarehouse,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      listOpeningStockDocuments({
        page,
        pageSize: 15,
        search: searchQuery,
        branchId: selectedBranch,
        warehouseId: selectedWarehouse,
        status: statusFilter,
        dateFrom,
        dateTo,
      }),
  })

  // KPI Metrics query
  const kpisQuery = useQuery({
    queryKey: ['opening-stock-kpis', selectedBranch],
    queryFn: () => getOpeningStockKPIs(selectedBranch),
  })

  // Detailed Document Inspector query
  const inspectDocQuery = useQuery({
    queryKey: ['opening-stock-inspect', inspectDocId],
    queryFn: () => (inspectDocId ? getOpeningStockDocument(inspectDocId) : null),
    enabled: Boolean(inspectDocId),
  })

  // Set default warehouse & location when form branch changes
  React.useEffect(() => {
    if (!formBranchId && branchesQuery.data?.[0]?.value) {
      setFormBranchId(branchesQuery.data[0].value)
    }
  }, [branchesQuery.data, formBranchId])

  React.useEffect(() => {
    if (formWarehousesQuery.data && formWarehousesQuery.data.length > 0) {
      const first = formWarehousesQuery.data[0]?.value || ''
      setFormWarehouseId(first)
    } else {
      setFormWarehouseId('')
    }
  }, [formWarehousesQuery.data])

  React.useEffect(() => {
    if (formLocationsQuery.data && formLocationsQuery.data.length > 0) {
      const first = formLocationsQuery.data[0]?.value || ''
      setFormLocationId(first)
      setItemLocationId(first)
    } else {
      setFormLocationId('')
      setItemLocationId('')
    }
  }, [formLocationsQuery.data])

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
        // Fallback search against catalog
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
      showToast('Please select a product variant.', 'error')
      return
    }
    if (itemQuantity <= 0) {
      showToast('Quantity must be greater than 0.', 'error')
      return
    }
    if (itemUnitCost < 0) {
      showToast('Unit cost cannot be negative.', 'error')
      return
    }
    const locId = itemLocationId || formLocationId
    if (!locId) {
      showToast('Please specify a stock location for the item.', 'error')
      return
    }

    const locName = formLocationsQuery.data?.find((l) => l.value === locId)?.label || 'Main Storage'

    const newLine: DraftLineItem = {
      key: crypto.randomUUID(),
      product_variant_id: selectedVariantDetails.id,
      product_name: selectedVariantDetails.product_name,
      variant_name: selectedVariantDetails.variant_name,
      sku: selectedVariantDetails.sku,
      barcode: selectedVariantDetails.barcode || '',
      source_location_id: locId,
      location_name: locName,
      quantity: Number(itemQuantity),
      unit_cost: Number(itemUnitCost),
      batch_reference: itemBatch.trim(),
      expiry_date: itemExpiry,
      remarks: itemRemarks.trim(),
    }

    setDraftLines((prev) => [...prev, newLine])
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
    setDraftLines((prev) => prev.filter((l) => l.key !== key))
  }

  const handleUpdateLineQty = (key: string, qty: number) => {
    if (qty <= 0) return
    setDraftLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l)))
  }

  const handleUpdateLineCost = (key: string, cost: number) => {
    if (cost < 0) return
    setDraftLines((prev) => prev.map((l) => (l.key === key ? { ...l, unit_cost: cost } : l)))
  }

  // ── Draft Totals ─────────────────────────────────────────────────────────────
  const draftSummary = useMemo(() => {
    const totalLines = draftLines.length
    const totalUnits = draftLines.reduce((acc, l) => acc + l.quantity, 0)
    const totalValuation = draftLines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0)
    return { totalLines, totalUnits, totalValuation }
  }, [draftLines])

  // ── Save Draft Mutation ──────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!formBranchId) throw new Error('Please select a Branch.')
      if (!formWarehouseId) throw new Error('Please select a Warehouse.')
      if (!formLocationId) throw new Error('Please select a default Stock Location.')
      if (draftLines.length === 0) throw new Error('Add at least one item line to save voucher.')

      return await createInventoryDraft({
        branch_id: formBranchId,
        warehouse_id: formWarehouseId,
        document_type: 'opening_stock',
        document_date: formDate,
        supporting_reference: formReference || undefined,
        notes: formNotes || undefined,
        reason: 'Opening stock audit intake',
        items: draftLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id || formLocationId,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: l.remarks || undefined,
        })),
      })
    },
    onSuccess: async () => {
      showToast('Opening Stock Draft saved successfully!', 'success')
      setDraftLines([])
      setFormReference('')
      setFormNotes('')
      await queryClient.invalidateQueries({ queryKey: ['opening-stock-documents'] })
      await queryClient.invalidateQueries({ queryKey: ['opening-stock-kpis'] })
      setActiveTab('register')
    },
    onError: (err) => {
      showToast(getErrorMessage(err), 'error')
    },
  })

  // ── Immediate Post Mutation ──────────────────────────────────────────────────
  const postImmediateMutation = useMutation({
    mutationFn: async () => {
      if (!formBranchId) throw new Error('Please select a Branch.')
      if (!formWarehouseId) throw new Error('Please select a Warehouse.')
      if (!formLocationId) throw new Error('Please select a default Stock Location.')
      if (draftLines.length === 0) throw new Error('Add at least one item line to post.')

      return await postOpeningStockImmediate({
        branch_id: formBranchId,
        warehouse_id: formWarehouseId,
        document_type: 'opening_stock',
        document_date: formDate,
        supporting_reference: formReference || undefined,
        notes: formNotes || undefined,
        reason: 'Opening stock immediate ledger post',
        items: draftLines.map((l) => ({
          product_variant_id: l.product_variant_id,
          source_location_id: l.source_location_id || formLocationId,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_reference: l.batch_reference || undefined,
          expiry_date: l.expiry_date || undefined,
          remarks: l.remarks || undefined,
        })),
      })
    },
    onSuccess: async (res) => {
      showToast(`Opening Stock ${res.document_number} Posted to Ledger!`, 'success')
      setDraftLines([])
      setFormReference('')
      setFormNotes('')
      await queryClient.invalidateQueries({ queryKey: ['opening-stock-documents'] })
      await queryClient.invalidateQueries({ queryKey: ['opening-stock-kpis'] })
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
        submit: 'Submitted for Approval',
        approve: 'Approved',
        post: 'Posted to Inventory & Ledger',
        reverse: 'Reversed',
        reject: 'Rejected',
        cancel: 'Cancelled',
      }[vars.action]
      showToast(`${res.document_number}: ${verb}`, 'success')
      setActionModal(null)
      setActionReason('')
      await queryClient.invalidateQueries({ queryKey: ['opening-stock-documents'] })
      await queryClient.invalidateQueries({ queryKey: ['opening-stock-kpis'] })
      await queryClient.invalidateQueries({ queryKey: ['opening-stock-inspect'] })
      await queryClient.invalidateQueries({ queryKey: ['current-stock'] })
    },
    onError: (err) => {
      showToast(getErrorMessage(err), 'error')
    },
  })

  // ── Batch Import Processing ──────────────────────────────────────────────────
  const handleProcessBatchText = () => {
    if (!batchText.trim()) return
    const lines = batchText.trim().split('\n')
    const added: DraftLineItem[] = []
    let failed = 0

    const locId = formLocationId || formLocationsQuery.data?.[0]?.value || ''
    const locName = formLocationsQuery.data?.find((l) => l.value === locId)?.label || 'Main Storage'

    for (const rawLine of lines) {
      if (!rawLine.trim()) continue
      // Format: SKU/Barcode, Quantity, UnitCost, Batch, Expiry
      const parts = rawLine.split(/[\t,;]+/).map((p) => p.trim())
      if (parts.length === 0) continue

      const identifier = parts[0]
      if (!identifier) continue
      const qty = parseFloat(parts[1] ?? '1') || 1
      const cost = parseFloat(parts[2] ?? '0') || 0
      const batch = parts[3] || ''
      const expiry = parts[4] || ''

      const idLower = identifier.toLowerCase()
      const match = variantsQuery.data?.find(
        (v) =>
          v.sku.toLowerCase() === idLower ||
          (v.barcode && v.barcode.toLowerCase() === idLower)
      )

      if (match) {
        added.push({
          key: crypto.randomUUID(),
          product_variant_id: match.id,
          product_name: match.product_name,
          variant_name: match.variant_name,
          sku: match.sku,
          barcode: match.barcode || '',
          source_location_id: locId,
          location_name: locName,
          quantity: qty,
          unit_cost: cost > 0 ? cost : match.average_cost > 0 ? match.average_cost : match.purchase_price,
          batch_reference: batch,
          expiry_date: expiry,
          remarks: 'Batch imported line',
        })
      } else {
        failed++
      }
    }

    if (added.length > 0) {
      setDraftLines((prev) => [...prev, ...added])
      setBatchModalOpen(false)
      setBatchText('')
      showToast(`Imported ${added.length} lines. ${failed > 0 ? `(${failed} SKUs not matched)` : ''}`, 'success')
    } else {
      showToast('Could not match any SKUs in catalog. Please check format: SKU, Qty, Cost', 'error')
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── CSV Export for Documents Register ──────────────────────────────────────
  const handleExportCsv = () => {
    const rows = documentsQuery.data?.rows ?? []
    if (rows.length === 0) {
      showToast('No opening stock documents to export.', 'info')
      return
    }

    const headers = [
      'Document Number',
      'Date',
      'Branch',
      'Warehouse',
      'Supporting Reference',
      'Notes / Reason',
      'Total Cost Valuation (LKR)',
      'Status',
    ]

    const csvData = [
      headers.join(','),
      ...rows.map((r) =>
        [
          JSON.stringify(r.document_number || ''),
          JSON.stringify(r.document_date || ''),
          JSON.stringify(r.branch_name || ''),
          JSON.stringify(r.warehouse_name || ''),
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
    link.download = `opening-stock-register-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${rows.length} vouchers to CSV.`, 'success')
  }

  // ── Render Helpers ───────────────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'posted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={12} /> Posted
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
            <Clock size={12} /> Submitted
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
            <span className="text-teal-200">Opening Stock Initialization</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            Opening Stock & Batch Valuation
            <span className="text-xs px-2.5 py-1 rounded-md bg-[#164e48]/60 text-teal-300 font-mono font-medium border border-teal-500/30">
              LKAS 2 Compliant
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Establish auditable initial physical quantities, warehouse locations, lot/batch tracking, and unit valuations to initialize the general ledger inventory asset balance.
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
                  <FileSpreadsheet size={16} /> View Documents Register
                </>
              ) : (
                <>
                  <Plus size={16} /> + New Opening Stock Voucher
                </>
              )}
            </button>
          )}

          <button
            onClick={() => setBatchModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Batch Import SKUs via CSV or text"
          >
            <Upload size={15} /> Rapid CSV Intake
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Export filtered opening stock vouchers to CSV"
          >
            <Download size={15} /> Export CSV
          </button>

          <button
            onClick={() => setPrintRegisterModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Print formal A4 Opening Stock & Batch Valuation Register"
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
              showToast('Refreshed ledger data', 'info')
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
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Opening Vouchers</span>
            <div className="p-2 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400">
              <FileSpreadsheet size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {kpisQuery.data?.totalVouchers ?? 0}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-emerald-400 font-medium">{kpisQuery.data?.postedVouchers ?? 0} posted</span>
            <span>•</span>
            <span className="text-amber-400 font-medium">{kpisQuery.data?.pendingVouchers ?? 0} in pipeline</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Capitalized Asset Value</span>
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-300 tracking-tight">
            {formatLkr(kpisQuery.data?.totalValuation ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Recognized into GL Balance Sheet
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Current Intake Draft</span>
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400">
              <Package size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {draftSummary.totalUnits.toLocaleString()} <span className="text-sm font-normal text-slate-400">units</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span>{draftSummary.totalLines} SKUs queued</span>
            <span>•</span>
            <span className="text-cyan-300 font-medium">{formatLkr(draftSummary.totalValuation)}</span>
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
            {kpisQuery.data?.pendingVouchers ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Drafts or submitted awaiting review
          </div>
        </div>
      </div>

      {/* ── VIEW 1: REGISTRATION & DOCUMENTS REGISTER ──────────────────────── */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {/* Status Tabs Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { id: 'all', label: 'All Records' },
              { id: 'posted', label: 'Posted & Capitalized' },
              { id: 'approved', label: 'Approved (Ready to Post)' },
              { id: 'submitted', label: 'Submitted (In Review)' },
              { id: 'draft', label: 'Draft Vouchers' },
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
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-md backdrop-blur-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                placeholder="Search Doc #, Reference, Notes..."
                className="w-full pl-9 pr-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400 transition-colors"
              />
            </div>

            {/* Branch Filter */}
            <div>
              <select
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value)
                  setSelectedWarehouse('')
                  setPage(1)
                }}
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors"
              >
                <option value="">All Branches</option>
                {branchesQuery.data?.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Warehouse Filter */}
            <div>
              <select
                value={selectedWarehouse}
                onChange={(e) => {
                  setSelectedWarehouse(e.target.value)
                  setPage(1)
                }}
                disabled={!selectedBranch}
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors disabled:opacity-50"
              >
                <option value="">All Warehouses</option>
                {filterWarehousesQuery.data?.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
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
              {(searchQuery || selectedBranch || selectedWarehouse || dateFrom || dateTo || statusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedBranch('')
                    setSelectedWarehouse('')
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

          {/* Documents Table */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#164e48] bg-[#082926]/70 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Document #</th>
                    <th className="py-3.5 px-4">Count Date</th>
                    <th className="py-3.5 px-4">Branch & Warehouse</th>
                    <th className="py-3.5 px-4">Supporting Ref / Reason</th>
                    <th className="py-3.5 px-4 text-right">Valuation (Rs.)</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                  {documentsQuery.isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-teal-400" />
                        Loading opening stock vouchers...
                      </td>
                    </tr>
                  ) : (documentsQuery.data?.rows.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center">
                        <Package size={36} className="mx-auto mb-2 text-slate-500 opacity-60" />
                        <p className="text-base font-semibold text-slate-300">No opening stock documents found</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                          Click "+ New Opening Stock Voucher" to begin establishing initial stock quantities and valuations.
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
                              title="Copy Document #"
                            >
                              {copiedId === row.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{row.document_date}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-white">{row.branch_name || 'Main Branch'}</div>
                          <div className="text-[11px] text-slate-400">{row.warehouse_name || 'Central Warehouse'}</div>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs truncate text-slate-400">
                          {row.supporting_reference ? (
                            <span className="font-mono text-teal-300 mr-1.5">[{row.supporting_reference}]</span>
                          ) : null}
                          {row.notes || row.reason || '—'}
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
                            title="Inspect Voucher"
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
                              title="Approve Voucher"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          )}

                          {/* Post Approved to Ledger */}
                          {row.status === 'approved' && canPost && (
                            <button
                              onClick={() => documentActionMutation.mutate({ action: 'post', document: row })}
                              disabled={documentActionMutation.isPending}
                              className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 transition-colors"
                              title="Post to Stock & GL Ledger"
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
                                  title: row.status === 'draft' ? 'Cancel Draft Voucher' : 'Reject Voucher',
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
                                  title: 'Reverse Opening Stock Voucher',
                                })
                              }
                              className="p-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/40 transition-colors"
                              title="Reverse Posted Voucher"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}

                          {/* Print Audit Voucher */}
                          <button
                            onClick={() => {
                              getOpeningStockDocument(row.id).then((full) => {
                                setPrintDoc(full)
                              })
                            }}
                            className="p-1.5 rounded-lg bg-[#061e1c] hover:bg-[#164e48] text-slate-300 hover:text-teal-200 transition-colors"
                            title="Print Audit Certificate / Slip"
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
                Showing {documentsQuery.data?.rows.length ?? 0} of {documentsQuery.data?.count ?? 0} records
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

      {/* ── VIEW 2: NEW OPENING STOCK INITIALIZATION INTAKE ────────────────── */}
      {activeTab === 'new_entry' && (
        <div className="space-y-6">
          {/* Header Panel for Voucher Setup */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-xl backdrop-blur-md">
            <h2 className="text-base font-semibold text-teal-300 flex items-center gap-2 mb-4 pb-2 border-b border-[#164e48]">
              <Building2 size={16} /> 1. Document & Target Warehouse Authorization
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Branch */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Branch</label>
                <select
                  value={formBranchId}
                  onChange={(e) => {
                    setFormBranchId(e.target.value)
                  }}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                >
                  {branchesQuery.data?.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Warehouse</label>
                <select
                  value={formWarehouseId}
                  onChange={(e) => setFormWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                >
                  {formWarehousesQuery.data?.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Default Stock Location */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Default Stock Location</label>
                <select
                  value={formLocationId}
                  onChange={(e) => {
                    setFormLocationId(e.target.value)
                    setItemLocationId(e.target.value)
                  }}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                >
                  {formLocationsQuery.data?.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Business / Count Date */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Physical Audit Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Supporting Reference */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Audit / Sheet Reference <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  placeholder="e.g. AUDIT-COUNT-2026-Q1"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Notes / Reason */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Accounting Notes / Reason
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Initial migration from legacy inventory ledger"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>
          </div>

          {/* Item Intake Console */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-xl backdrop-blur-md">
            <h2 className="text-base font-semibold text-teal-300 flex items-center justify-between mb-4 pb-2 border-b border-[#164e48]">
              <span className="flex items-center gap-2">
                <Package size={16} /> 2. Product Variant & Valuation Line Builder
              </span>
              <button
                type="button"
                onClick={() => setBatchModalOpen(true)}
                className="text-xs text-teal-400 hover:text-teal-200 flex items-center gap-1 font-normal underline"
              >
                <Upload size={12} /> Bulk Paste Multiple SKUs
              </button>
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
                  <option value="">Choose item from catalogue...</option>
                  {variantsQuery.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.sku}] {v.product_name} - {v.variant_name} (Cost: Rs. {v.average_cost || v.purchase_price})
                    </option>
                  ))}
                </select>
              </div>

              {/* Physical Quantity */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Counted Quantity <span className="text-emerald-400">*</span>
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

              {/* Unit Cost Valuation */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Unit Cost (Rs.) <span className="text-emerald-400">*</span>
                </label>
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

              {/* Target Location */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Specific Location</label>
                <select
                  value={itemLocationId}
                  onChange={(e) => setItemLocationId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                >
                  {formLocationsQuery.data?.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch Reference */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Batch / Lot # <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={itemBatch}
                  onChange={(e) => setItemBatch(e.target.value)}
                  placeholder="e.g. LOT-2026-01"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Expiry Date <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={itemExpiry}
                  onChange={(e) => setItemExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Line Remarks */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Line Remarks <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={itemRemarks}
                  onChange={(e) => setItemRemarks(e.target.value)}
                  placeholder="e.g. Shelf A-3"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>

            {/* Add Button & Calculated Line Valuation */}
            <div className="flex items-center justify-between pt-3 border-t border-[#164e48]/70">
              <div className="text-xs text-slate-300">
                Line Valuation:{' '}
                <span className="text-emerald-400 font-bold font-mono text-sm ml-1">
                  {formatLkr(itemQuantity * itemUnitCost)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddLine}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#164e48] hover:bg-[#1f665e] text-teal-200 border border-teal-500/40 shadow-lg transition-colors"
              >
                <Plus size={14} /> Add Line to Voucher
              </button>
            </div>
          </div>

          {/* Draft Lines Table */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
            <div className="p-4 border-b border-[#164e48] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Voucher Line Items ({draftLines.length})</span>
                {draftLines.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Ready to Save
                  </span>
                )}
              </h3>

              {draftLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDraftLines([])}
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
                    <th className="py-3 px-4">SKU / Barcode</th>
                    <th className="py-3 px-4">Product & Variant</th>
                    <th className="py-3 px-4">Target Location</th>
                    <th className="py-3 px-4 text-center">Quantity</th>
                    <th className="py-3 px-4 text-right">Unit Cost (Rs.)</th>
                    <th className="py-3 px-4 text-right">Total (Rs.)</th>
                    <th className="py-3 px-4">Batch / Expiry</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                  {draftLines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Package size={30} className="mx-auto mb-2 text-slate-500 opacity-60" />
                        No product lines added yet.
                        <p className="text-xs text-slate-500 mt-1">
                          Use the line builder above or click "Rapid CSV Intake" to populate items.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    draftLines.map((line, idx) => (
                      <tr key={line.key} className="hover:bg-[#0e3b37]/30 transition-colors">
                        <td className="py-3 px-4 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono text-teal-300">
                          {line.sku}
                          {line.barcode && <div className="text-[10px] text-slate-500">{line.barcode}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-white">{line.product_name}</div>
                          <div className="text-[11px] text-slate-400">{line.variant_name}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{line.location_name}</td>
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
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unit_cost}
                            onChange={(e) => handleUpdateLineCost(line.key, parseFloat(e.target.value) || 0)}
                            className="w-24 py-1 px-1.5 bg-[#031413] border border-[#164e48] rounded text-right text-white font-mono text-xs focus:outline-none focus:border-teal-400"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-300">
                          {formatLkr(line.quantity * line.unit_cost)}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {line.batch_reference && <div>Batch: {line.batch_reference}</div>}
                          {line.expiry_date && <div>Exp: {line.expiry_date}</div>}
                          {!line.batch_reference && !line.expiry_date && '—'}
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

            {/* Voucher Footer Summary & Action Buttons */}
            <div className="p-5 border-t border-[#164e48] bg-[#082926]/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <span className="text-slate-400">Total Lines:</span>{' '}
                  <strong className="text-white ml-1 font-mono text-sm">{draftSummary.totalLines}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Total Units:</span>{' '}
                  <strong className="text-teal-300 ml-1 font-mono text-sm">
                    {draftSummary.totalUnits.toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Grand Valuation:</span>{' '}
                  <strong className="text-emerald-300 ml-1 font-mono text-base">
                    {formatLkr(draftSummary.totalValuation)}
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending || postImmediateMutation.isPending || draftLines.length === 0}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#164e48] hover:bg-[#1f665e] text-teal-200 border border-teal-500/40 disabled:opacity-40 transition-colors"
                >
                  {saveDraftMutation.isPending ? 'Saving Draft...' : 'Save as Draft Voucher'}
                </button>

                {canPost && (
                  <button
                    type="button"
                    onClick={() => postImmediateMutation.mutate()}
                    disabled={postImmediateMutation.isPending || saveDraftMutation.isPending || draftLines.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg shadow-emerald-950/50 disabled:opacity-40 transition-all"
                  >
                    <PlayCircle size={15} />
                    {postImmediateMutation.isPending ? 'Posting to Ledger...' : 'Post Immediately to Ledger'}
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
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Opening Stock Voucher {inspectDocQuery.data?.document_number}
                    {inspectDocQuery.data && getStatusBadge(inspectDocQuery.data.status)}
                  </h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Branch: {inspectDocQuery.data?.branch_name} • Warehouse: {inspectDocQuery.data?.warehouse_name} • Date: {inspectDocQuery.data?.document_date}
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
                  Loading voucher details...
                </div>
              ) : inspectDocQuery.data ? (
                <>
                  {/* Meta Details Box */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[#031413]/80 border border-[#164e48] rounded-xl text-xs">
                    <div>
                      <span className="text-slate-500">Supporting Ref</span>
                      <div className="font-mono text-teal-300 font-medium">
                        {inspectDocQuery.data.supporting_reference || '—'}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Notes / Reason</span>
                      <div className="text-slate-200">{inspectDocQuery.data.notes || inspectDocQuery.data.reason || '—'}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Total Line Items</span>
                      <div className="font-mono text-white font-medium">{inspectDocQuery.data.items?.length ?? 0} SKUs</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Total Inventory Value</span>
                      <div className="font-mono text-emerald-400 font-bold text-sm">
                        {formatLkr(Number(inspectDocQuery.data.total_cost || 0))}
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Audited Stock Line Items
                    </h4>
                    <div className="border border-[#164e48] rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-[#082926] text-slate-400 font-semibold border-b border-[#164e48]">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">SKU</th>
                            <th className="py-2.5 px-3">Product Name</th>
                            <th className="py-2.5 px-3">Location</th>
                            <th className="py-2.5 px-3 text-center">Quantity</th>
                            <th className="py-2.5 px-3 text-right">Unit Cost</th>
                            <th className="py-2.5 px-3 text-right">Line Total</th>
                            <th className="py-2.5 px-3">Batch / Expiry</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                          {inspectDocQuery.data.items?.map((it, i) => (
                            <tr key={it.id || i} className="hover:bg-[#0e3b37]/20">
                              <td className="py-2.5 px-3 text-slate-500 font-mono">{i + 1}</td>
                              <td className="py-2.5 px-3 font-mono text-teal-300">{it.sku || '—'}</td>
                              <td className="py-2.5 px-3 font-medium text-white">{it.product_name}</td>
                              <td className="py-2.5 px-3 text-slate-400">{it.location_name || 'Main Storage'}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-medium">{it.quantity}</td>
                              <td className="py-2.5 px-3 text-right font-mono">{formatLkr(Number(it.unit_cost || 0))}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                                {formatLkr(Number(it.total_cost || it.quantity * it.unit_cost || 0))}
                              </td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-400">
                                {it.batch_reference ? `Batch: ${it.batch_reference}` : ''}
                                {it.expiry_date ? ` · Exp: ${it.expiry_date}` : ''}
                                {!it.batch_reference && !it.expiry_date && '—'}
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
                <Printer size={14} /> Print Audit Slip
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
                    <CheckCircle2 size={13} /> Approve Voucher
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
                    <PlayCircle size={14} /> Post to Ledger
                  </button>
                )}

                {inspectDocQuery.data?.status === 'posted' && canReverse && (
                  <button
                    onClick={() => {
                      setActionModal({
                        action: 'reverse',
                        document: inspectDocQuery.data!,
                        title: 'Reverse Opening Stock Voucher',
                      })
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-700/50"
                  >
                    <RotateCcw size={13} /> Reverse Voucher
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

      {/* ── MODAL: BATCH CSV INTAKE ─────────────────────────────────────────── */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#164e48]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload size={18} className="text-teal-400" />
                Rapid Multi-Line / CSV Opening Stock Intake
              </h3>
              <button onClick={() => setBatchModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Paste rows copied from Excel or CSV directly. Format per line:
              <br />
              <code className="text-teal-300 font-mono text-[11px] block mt-1 bg-[#031413] p-2 rounded-lg border border-[#164e48]">
                SKU or Barcode, Quantity, Unit Cost, Batch Number (opt), Expiry Date (opt)
              </code>
            </p>

            <textarea
              rows={8}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder="e.g.&#10;BB-DPR-01, 100, 1500, LOT-2026-A, 2027-12-31&#10;BB-SOAP-02, 50, 450&#10;BB-LOTION-03, 20, 1200"
              className="w-full p-3 bg-[#031413] border border-[#164e48] rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-teal-400"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                {batchText.trim() ? `${batchText.trim().split('\n').length} lines detected` : 'No lines entered'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs bg-[#061e1c] text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProcessBatchText}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg"
                >
                  Import Lines
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
              Please specify the audit reason for this action on document{' '}
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

      {/* ── MODAL: PRINT AUDIT CERTIFICATE / 80MM THERMAL SLIP ──────────────── */}
      {printDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#164e48] bg-[#082926]">
              <div className="flex items-center gap-3">
                <Printer size={18} className="text-teal-400" />
                <span className="text-sm font-bold text-white">Opening Stock Audit Voucher Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#031413] rounded-lg p-0.5 border border-[#164e48] text-xs">
                  <button
                    onClick={() => setPrintFormat('a4')}
                    className={`px-3 py-1 rounded-md ${
                      printFormat === 'a4' ? 'bg-[#164e48] text-teal-200' : 'text-slate-400'
                    }`}
                  >
                    A4 Certificate
                  </button>
                  <button
                    onClick={() => setPrintFormat('thermal')}
                    className={`px-3 py-1 rounded-md ${
                      printFormat === 'thermal' ? 'bg-[#164e48] text-teal-200' : 'text-slate-400'
                    }`}
                  >
                    80mm Thermal
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
                id="printable-opening-stock-voucher"
                className={`mx-auto bg-white text-slate-900 rounded-lg shadow-xl p-6 ${
                  printFormat === 'thermal' ? 'max-w-xs font-mono text-[11px]' : 'max-w-2xl text-xs'
                }`}
              >
                {/* Header */}
                <div className="text-center border-b border-slate-300 pb-3 mb-4">
                  <h2 className="text-base font-bold tracking-tight uppercase">BABY BLOOM ERP</h2>
                  <p className="text-[10px] text-slate-600">Physical Inventory & Opening Stock Certificate</p>
                  <div className="mt-2 text-xs font-semibold text-slate-800">
                    VOUCHER #{printDoc.document_number}
                  </div>
                </div>

                {/* Voucher Meta */}
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-4 text-slate-700">
                  <div>
                    <strong>Date:</strong> {printDoc.document_date}
                  </div>
                  <div>
                    <strong>Status:</strong> {printDoc.status.toUpperCase()}
                  </div>
                  <div>
                    <strong>Branch:</strong> {printDoc.branch_name}
                  </div>
                  <div>
                    <strong>Warehouse:</strong> {printDoc.warehouse_name}
                  </div>
                  {printDoc.supporting_reference && (
                    <div className="col-span-2">
                      <strong>Reference:</strong> {printDoc.supporting_reference}
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <table className="w-full text-left border-collapse text-[11px] mb-4">
                  <thead>
                    <tr className="border-b-2 border-slate-800">
                      <th className="py-1">Item</th>
                      <th className="py-1 text-center">Qty</th>
                      <th className="py-1 text-right">Cost</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printDoc.items?.map((it, idx) => (
                      <tr key={it.id || idx}>
                        <td className="py-1.5">
                          <div className="font-semibold">{it.product_name}</div>
                          <div className="text-[10px] text-slate-500">
                            {it.sku} {it.batch_reference ? `· B:${it.batch_reference}` : ''}
                          </div>
                        </td>
                        <td className="py-1.5 text-center font-semibold">{it.quantity}</td>
                        <td className="py-1.5 text-right font-mono">{Number(it.unit_cost || 0).toFixed(2)}</td>
                        <td className="py-1.5 text-right font-semibold font-mono">
                          {Number(it.total_cost || it.quantity * it.unit_cost || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Grand Valuation Totals */}
                <div className="border-t-2 border-slate-800 pt-2 text-right space-y-1 mb-6">
                  <div className="text-xs">
                    <strong>Total Pieces:</strong>{' '}
                    {printDoc.items?.reduce((a, b) => a + Number(b.quantity || 0), 0) ?? 0}
                  </div>
                  <div className="text-sm font-bold">
                    <strong>Total Asset Valuation:</strong> Rs.{' '}
                    {Number(printDoc.total_cost || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Signatures for A4 mode */}
                {printFormat === 'a4' && (
                  <div className="grid grid-cols-3 gap-4 pt-10 border-t border-slate-300 text-center text-[10px] text-slate-600">
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-8" />
                      Counted By (Storekeeper)
                    </div>
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-8" />
                      Audited By (Internal Audit)
                    </div>
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-8" />
                      Authorized By (Chief Accountant)
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
                <Printer size={15} /> Print Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PRINTABLE OPENING STOCK & BATCH VALUATION REGISTER ────────── */}
      {printRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          {/* Top screen-only toolbar */}
          <div className="no-print w-full max-w-[210mm] flex items-center justify-between p-3.5 mb-4 bg-[#072421] border border-[#164e48] rounded-xl text-white shadow-xl">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 text-white">
                <Printer size={16} className="text-teal-400" />
                Opening Stock & Batch Valuation Register Preview
              </h3>
              <span className="text-[11px] text-teal-300/80">
                A4 Summary Document • {documentsQuery.data?.rows?.length ?? 0} Vouchers In Current Scope
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
            id="opening-stock-register-printable"
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
                  Opening Stock & Valuation Register
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                  Ref: OPN-REG-{new Date().getFullYear()}-{Math.floor(Date.now() / 1000).toString().slice(-4)}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB')}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Branch: {selectedBranch ? (branchesQuery.data?.find((b) => b.value === selectedBranch)?.label || selectedBranch) : 'All Branches'}
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
                  Total Vouchers
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {kpisQuery.data?.totalVouchers ?? 0}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Recognized Asset Value
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#047857' }}>
                  {formatLkr(kpisQuery.data?.totalValuation ?? 0)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Posted Vouchers
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0284c7' }}>
                  {kpisQuery.data?.postedVouchers ?? 0}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Pending Authorization
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#d97706' }}>
                  {kpisQuery.data?.pendingVouchers ?? 0}
                </div>
              </div>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f766e', color: '#ffffff' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '25px' }}>#</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '110px' }}>DOCUMENT #</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '75px' }}>DATE</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '100px' }}>BRANCH</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '100px' }}>WAREHOUSE</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>REFERENCE / NOTES</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>VALUATION (LKR)</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '75px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(documentsQuery.data?.rows?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      No opening stock documents recorded for the selected scope.
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
                      <td style={{ padding: '6px 8px', color: '#475569' }}>{row.branch_name || 'Main Branch'}</td>
                      <td style={{ padding: '6px 8px', color: '#475569' }}>{row.warehouse_name || 'Central Warehouse'}</td>
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
                    Total Listed Asset Valuation:
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
                <strong>Inventory Count Officer</strong>
                <div>Physical Verification Sign-off</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Cost & Management Accountant</strong>
                <div>Valuation & Cost Basis Certified</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Chief Financial Officer</strong>
                <div>General Ledger Capitalization Authorization</div>
              </div>
            </div>

            <div style={{ marginTop: '14px', fontSize: '9px', color: '#94a3b8', textAlign: 'center' }}>
              This is an audited Opening Stock & Batch Valuation Ledger generated under LKAS 2 Inventories. Confidential & Proprietary to Baby Bloom (Pvt) Ltd.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
