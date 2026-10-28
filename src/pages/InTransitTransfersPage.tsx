import React, { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Eye,
  Check,
  X,
  Search,
  Printer,
  Copy,
  Sparkles,
  ArrowRight,
  Package,
  AlertCircle,
  XCircle,
  Trash2,
  Download,
  Boxes,
} from 'lucide-react'
import {
  fetchBranchTransferShipments,
  createBranchTransferShipment,
  confirmBranchTransferReceipt,
} from '../services/transferService'
import {
  fetchBranchesLookup,
  fetchWarehousesAndLocations,
  fetchVariantsLookup,
} from '../services/orderService'
import { getErrorMessage } from '../lib/errors'
import type {
  BranchTransferShipment,
  TransferShipmentStatus,
} from '../types/orders'

export function InTransitTransfersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Filters State ────────────────────────────────────────────────────────────
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedDestBranch, setSelectedDestBranch] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // ── Modals State ─────────────────────────────────────────────────────────────
  const [receiveModal, setReceiveModal] = useState(false)
  const [dispatchModal, setDispatchModal] = useState(false)
  const [detailsModal, setDetailsModal] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<BranchTransferShipment | null>(null)
  const [printShipment, setPrintShipment] = useState<BranchTransferShipment | null>(null)
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4')
  const [printRegisterModalOpen, setPrintRegisterModalOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── Toast State ──────────────────────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4500)
  }

  // ── Receive Stock Wizard State ───────────────────────────────────────────────
  const [receivedLines, setReceivedLines] = useState<
    Array<{
      product_variant_id: string
      variant_name: string
      sku?: string
      dispatched_quantity: number
      received_quantity: number
      discrepancy_reason: string
    }>
  >([])

  // ── New Transfer Modal State ─────────────────────────────────────────────────
  const [srcBranch, setSrcBranch] = useState('')
  const [srcWh, setSrcWh] = useState('')
  const [srcLoc, setSrcLoc] = useState('')
  const [destBranch, setDestBranch] = useState('')
  const [destWh, setDestWh] = useState('')
  const [destLoc, setDestLoc] = useState('')
  const [carrier, setCarrier] = useState('Internal Fleet Van')
  const [tracking, setTracking] = useState('')
  const [transferNotes, setTransferNotes] = useState('')

  // Line item selector state inside Dispatch Modal
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [variantQuantity, setVariantQuantity] = useState<number>(1)
  const [newLines, setNewLines] = useState<
    Array<{
      product_variant_id: string
      variant_name: string
      sku: string
      quantity: number
      available_stock?: number
    }>
  >([])

  // ── Queries & Lookups ────────────────────────────────────────────────────────
  const { data: branches } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  // Source Warehouses & Locations
  const { data: srcWhData } = useQuery({
    queryKey: ['lookup', 'warehouses-locations', srcBranch],
    queryFn: () => fetchWarehousesAndLocations(srcBranch),
    enabled: Boolean(srcBranch),
  })

  // Destination Warehouses & Locations
  const { data: destWhData } = useQuery({
    queryKey: ['lookup', 'warehouses-locations', destBranch],
    queryFn: () => fetchWarehousesAndLocations(destBranch),
    enabled: Boolean(destBranch),
  })

  // Variants available at source location
  const { data: variants } = useQuery({
    queryKey: ['lookup', 'variants', srcLoc],
    queryFn: () => fetchVariantsLookup(srcLoc),
    enabled: Boolean(srcLoc),
  })

  // Shipments query
  const { data: shipments, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['branch-transfer-shipments', selectedBranch, selectedStatus],
    queryFn: () => fetchBranchTransferShipments(selectedBranch, selectedStatus),
    refetchInterval: 15000,
  })

  // Set default source and destination branch when branches load
  React.useEffect(() => {
    if (branches && branches.length > 0) {
      if (!srcBranch) setSrcBranch(branches[0]?.id || '')
      if (!destBranch && branches.length > 1) setDestBranch(branches[1]?.id || '')
    }
  }, [branches, srcBranch, destBranch])

  // Set default warehouses
  React.useEffect(() => {
    if (srcWhData?.warehouses?.length) {
      setSrcWh(srcWhData.warehouses[0]?.id || '')
    } else {
      setSrcWh('')
    }
    if (srcWhData?.locations?.length) {
      setSrcLoc(srcWhData.locations[0]?.id || '')
    } else {
      setSrcLoc('')
    }
  }, [srcWhData])

  React.useEffect(() => {
    if (destWhData?.warehouses?.length) {
      setDestWh(destWhData.warehouses[0]?.id || '')
    } else {
      setDestWh('')
    }
    if (destWhData?.locations?.length) {
      setDestLoc(destWhData.locations[0]?.id || '')
    } else {
      setDestLoc('')
    }
  }, [destWhData])

  // ── Filtered Shipments ───────────────────────────────────────────────────────
  const filteredShipments = useMemo(() => {
    if (!shipments) return []
    return shipments.filter((s) => {
      // Branch filter
      if (selectedBranch !== 'all' && s.source_branch_id !== selectedBranch && s.destination_branch_id !== selectedBranch) {
        return false
      }
      if (selectedDestBranch !== 'all' && s.destination_branch_id !== selectedDestBranch) {
        return false
      }
      // Status filter
      if (selectedStatus !== 'all' && s.status !== selectedStatus) {
        return false
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesNumber = s.transfer_number.toLowerCase().includes(q)
        const matchesCarrier = s.carrier_name?.toLowerCase().includes(q) || false
        const matchesTracking = s.tracking_number?.toLowerCase().includes(q) || false
        const matchesNotes = s.notes?.toLowerCase().includes(q) || false
        const matchesSource = s.source_branch?.name.toLowerCase().includes(q) || false
        const matchesDest = s.destination_branch?.name.toLowerCase().includes(q) || false
        if (!matchesNumber && !matchesCarrier && !matchesTracking && !matchesNotes && !matchesSource && !matchesDest) {
          return false
        }
      }
      return true
    })
  }, [shipments, selectedBranch, selectedDestBranch, selectedStatus, searchQuery])

  // ── KPI Calculations ─────────────────────────────────────────────────────────
  const inTransitCount = shipments?.filter((s) => s.status === 'in_transit').length ?? 0
  const discrepancyCount = shipments?.filter((s) => s.status === 'discrepancy_reported').length ?? 0
  const receivedCount = shipments?.filter((s) => s.status === 'received_fully').length ?? 0
  const totalUnitsMoved = useMemo(() => {
    if (!shipments) return 0
    return shipments.reduce((acc, s) => {
      const units = s.items?.reduce((sum, it) => sum + (it.dispatched_quantity || 0), 0) || 0
      return acc + units
    }, 0)
  }, [shipments])

  // ── Mutations ────────────────────────────────────────────────────────────────
  const receiveMutation = useMutation({
    mutationFn: ({
      shipmentId,
      items,
    }: {
      shipmentId: string
      items: Array<{ product_variant_id: string; received_quantity: number; discrepancy_reason?: string }>
    }) => confirmBranchTransferReceipt(shipmentId, items),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['branch-transfer-shipments'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      setReceiveModal(false)
      setSelectedShipment(null)
      if (res.has_discrepancy) {
        showToast('Transfer received with discrepancies recorded into the security audit log.', 'info')
      } else {
        showToast('Transfer stock verified and posted into destination warehouse successfully!', 'success')
      }
    },
    onError: (err) => showToast('Receipt confirmation failed: ' + getErrorMessage(err), 'error'),
  })

  const dispatchMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createBranchTransferShipment>[0]) => createBranchTransferShipment(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['branch-transfer-shipments'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      setDispatchModal(false)
      setNewLines([])
      setTracking('')
      setTransferNotes('')
      showToast(`Transfer shipment #${res.transfer_number} dispatched in-transit!`, 'success')
    },
    onError: (err) => showToast('Dispatch failed: ' + getErrorMessage(err), 'error'),
  })

  // ── Open Receive Wizard ──────────────────────────────────────────────────────
  const handleOpenReceive = (s: BranchTransferShipment) => {
    setSelectedShipment(s)
    setReceivedLines(
      s.items?.map((it) => ({
        product_variant_id: it.product_variant_id,
        variant_name: `${it.variant?.product?.name || ''} - ${it.variant?.variant_name || ''}`,
        sku: it.variant?.sku,
        dispatched_quantity: it.dispatched_quantity,
        received_quantity: it.dispatched_quantity,
        discrepancy_reason: '',
      })) || []
    )
    setReceiveModal(true)
  }

  // ── Add Item Line to Dispatch Form ───────────────────────────────────────────
  const handleAddDispatchLine = () => {
    if (!selectedVariantId) {
      showToast('Select a product variant to dispatch.', 'error')
      return
    }
    if (variantQuantity <= 0) {
      showToast('Quantity must be greater than zero.', 'error')
      return
    }

    const vItem = variants?.find((v) => v.id === selectedVariantId)
    if (!vItem) return

    setNewLines((prev) => [
      ...prev,
      {
        product_variant_id: vItem.id,
        variant_name: `${vItem.product?.name || vItem.variant_name} - ${vItem.variant_name}`,
        sku: vItem.sku,
        quantity: Number(variantQuantity),
        available_stock: vItem.available_quantity,
      },
    ])

    setSelectedVariantId('')
    setVariantQuantity(1)
  }

  const handleRemoveDispatchLine = (id: string) => {
    setNewLines((prev) => prev.filter((l) => l.product_variant_id !== id))
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── CSV Export for In-Transit Shipments ───────────────────────────────────────
  const handleExportCsv = () => {
    if (!filteredShipments || filteredShipments.length === 0) {
      showToast('No shipments available to export.', 'info')
      return
    }

    const headers = [
      'Shipment Number',
      'Dispatched At',
      'Origin Branch',
      'Destination Branch',
      'Carrier Name',
      'Tracking / Trip',
      'Dispatched Units',
      'Received Units',
      'Status',
      'Notes',
    ]

    const csvData = [
      headers.join(','),
      ...filteredShipments.map((s) => {
        const dispatchedUnits = s.items?.reduce((sum, it) => sum + (it.dispatched_quantity || 0), 0) || 0
        const receivedUnits =
          s.status === 'in_transit'
            ? 0
            : s.items?.reduce((sum, it) => sum + (it.received_quantity ?? it.dispatched_quantity ?? 0), 0) || 0
        return [
          JSON.stringify(s.transfer_number || ''),
          JSON.stringify(s.dispatched_at || ''),
          JSON.stringify(s.source_branch?.name || ''),
          JSON.stringify(s.destination_branch?.name || ''),
          JSON.stringify(s.carrier_name || ''),
          JSON.stringify(s.tracking_number || ''),
          dispatchedUnits,
          receivedUnits,
          JSON.stringify(s.status || ''),
          JSON.stringify(s.notes || ''),
        ].join(',')
      }),
    ].join('\n')

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `inter-branch-in-transit-transfers-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${filteredShipments.length} in-transit shipments to CSV.`, 'success')
  }

  // ── Status Badges ────────────────────────────────────────────────────────────
  const getStatusBadge = (status: TransferShipmentStatus) => {
    switch (status) {
      case 'in_transit':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">
            <Truck size={12} /> In Transit
          </span>
        )
      case 'received_fully':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={12} /> Received Fully
          </span>
        )
      case 'discrepancy_reported':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle size={12} /> Discrepancy Flagged
          </span>
        )
      case 'cancelled':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/30">
            <XCircle size={12} /> Cancelled
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
            <span className="text-teal-200">Inter-Branch Logistics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            Inter-Branch In-Transit Stock Transfers
            <span className="text-xs px-2.5 py-1 rounded-md bg-[#164e48]/60 text-teal-300 font-mono font-medium border border-teal-500/30">
              Live Fleet Tracking
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Track goods in transit between branch warehouses, verify received physical counts at arrival gates, document transit discrepancies, and authorize carrier manifests.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setDispatchModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg shadow-emerald-950/40 transition-all"
          >
            <Plus size={16} />
            + New Inter-Branch Shipment
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Export filtered shipments to CSV"
          >
            <Download size={15} /> Export CSV
          </button>

          <button
            type="button"
            onClick={() => setPrintRegisterModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Print formal A4 Inter-Branch In-Transit Stock Transfers Register"
          >
            <Printer size={15} /> Print Register
          </button>

          <Link
            to="/inventory/stock-transfer"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-teal-300 border border-[#164e48] transition-all"
            title="Location to Location Stock Transfers"
          >
            <ArrowRightLeft size={15} /> Stock Transfers (STN)
          </Link>

          <button
            type="button"
            onClick={() => navigate('/inventory/current-stock')}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[#061e1c] hover:bg-[#0c312e] text-slate-300 border border-[#164e48] transition-all"
            title="Jump to Current Stock Master"
          >
            <Boxes size={15} /> Current Stock
          </button>

          <button
            type="button"
            onClick={() => {
              refetch()
              showToast('Refreshed in-transit shipments', 'info')
            }}
            disabled={isRefetching}
            className="p-2.5 rounded-xl bg-[#061e1c] hover:bg-[#0c312e] text-teal-400 border border-[#164e48] transition-colors"
            title="Refresh Shipments"
          >
            <RefreshCw size={16} className={isRefetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 4 Glassmorphic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-purple-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Active In-Transit</span>
            <div className="p-2 rounded-xl bg-purple-950/80 border border-purple-500/30 text-purple-400">
              <Truck size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-purple-300 tracking-tight">
            {inTransitCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Awaiting destination warehouse arrival
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Completed Receipts</span>
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-300 tracking-tight">
            {receivedCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Inventory verified into receiving stock
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Discrepancies Flagged</span>
            <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-amber-300 tracking-tight">
            {discrepancyCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Shortages, damage, or breakage reported
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-teal-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Moved Volume</span>
            <div className="p-2 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400">
              <Package size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {totalUnitsMoved.toLocaleString()} <span className="text-sm font-normal text-slate-400">units</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Physical items shifted through network
          </div>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {[
          { id: 'all', label: 'All Shipments' },
          { id: 'in_transit', label: 'In Transit Only' },
          { id: 'received_fully', label: 'Received Fully' },
          { id: 'discrepancy_reported', label: 'Discrepancy Reported' },
          { id: 'cancelled', label: 'Cancelled' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedStatus(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedStatus === tab.id
                ? 'bg-[#164e48] text-teal-200 border border-teal-500/50 shadow-md shadow-teal-950/50'
                : 'bg-[#061e1c]/60 text-slate-400 hover:text-slate-200 hover:bg-[#0c312e] border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-4 shadow-md backdrop-blur-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Transfer #, Carrier, Trip, Notes..."
            className="w-full pl-9 pr-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400 transition-colors"
          />
        </div>

        {/* Origin Branch */}
        <div>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors"
          >
            <option value="all">Origin Branch: All</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                From: {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Destination Branch */}
        <div>
          <select
            value={selectedDestBranch}
            onChange={(e) => setSelectedDestBranch(e.target.value)}
            className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 transition-colors"
          >
            <option value="all">Destination Branch: All</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                To: {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Filter Button */}
        <div>
          {(searchQuery || selectedBranch !== 'all' || selectedDestBranch !== 'all' || selectedStatus !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedBranch('all')
                setSelectedDestBranch('all')
                setSelectedStatus('all')
              }}
              className="w-full py-2 px-3 rounded-xl text-xs bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* In-Transit Shipments Table */}
      <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-teal-400" />
            Loading transfer shipments...
          </div>
        ) : filteredShipments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#164e48] bg-[#082926]/70 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Transfer #</th>
                  <th className="py-3.5 px-4">Origin Facility</th>
                  <th className="py-3.5 px-4">Destination Facility</th>
                  <th className="py-3.5 px-4">Carrier / Vehicle</th>
                  <th className="py-3.5 px-4">Dispatched At</th>
                  <th className="py-3.5 px-4 text-center">Items</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                {filteredShipments.map((shipment) => (
                  <tr
                    key={shipment.id}
                    className="hover:bg-[#0e3b37]/40 transition-colors group cursor-pointer"
                    onClick={() => {
                      setSelectedShipment(shipment)
                      setDetailsModal(true)
                    }}
                  >
                    <td className="py-3.5 px-4 font-mono font-medium text-teal-300">
                      <div className="flex items-center gap-1.5">
                        <span>{shipment.transfer_number}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            copyToClipboard(shipment.transfer_number, shipment.id)
                          }}
                          className="text-slate-500 hover:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Copy Transfer #"
                        >
                          {copiedId === shipment.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{shipment.source_branch?.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{shipment.source_branch?.code}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-teal-300 flex items-center gap-1">
                        <ArrowRight size={11} className="text-slate-500" />
                        {shipment.destination_branch?.name}
                      </div>
                      <div className="text-[11px] text-slate-400 ml-4 font-mono">{shipment.destination_branch?.code}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200">{shipment.carrier_name || 'Fleet Van'}</div>
                      {shipment.tracking_number && (
                        <div className="text-[11px] text-slate-400 font-mono">Trip: {shipment.tracking_number}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-300">
                      {new Date(shipment.dispatched_at).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold text-white font-mono">
                      {shipment.items?.length ?? 0}
                    </td>

                    <td className="py-3.5 px-4 text-center">{getStatusBadge(shipment.status)}</td>

                    <td
                      className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShipment(shipment)
                          setDetailsModal(true)
                        }}
                        className="p-1.5 rounded-lg bg-[#061e1c] hover:bg-[#164e48] text-slate-300 hover:text-teal-200 transition-colors"
                        title="Inspect Transfer Manifest"
                      >
                        <Eye size={14} />
                      </button>

                      {shipment.status === 'in_transit' && (
                        <button
                          type="button"
                          onClick={() => handleOpenReceive(shipment)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                        >
                          <Check size={13} /> Receive Stock
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPrintShipment(shipment)}
                        className="p-1.5 rounded-lg bg-[#061e1c] hover:bg-[#164e48] text-slate-300 hover:text-teal-200 transition-colors"
                        title="Print Gate Pass & Waybill"
                      >
                        <Printer size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center">
            <Truck size={42} className="mx-auto text-teal-500/60 mb-3" />
            <h3 className="text-base font-semibold text-white">No transfer shipments found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Dispatch a transfer between branches to initiate real-time in-transit logistics tracking.
            </p>
          </div>
        )}
      </div>

      {/* ── MODAL: Receive Stock Wizard ─────────────────────────────────── */}
      {receiveModal && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#164e48] bg-[#082926]/70">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-teal-950 border border-teal-500/40 text-teal-400">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Receive Stock: {selectedShipment.transfer_number}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Arriving from {selectedShipment.source_branch?.name} ➔ Receiving at {selectedShipment.destination_branch?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#164e48]"
                onClick={() => setReceiveModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="text-xs text-slate-300 bg-[#031413]/70 p-3 rounded-xl border border-[#164e48]">
                Please enter the actual counted physical quantities arriving at the destination loading dock. If an item count differs from what was dispatched, provide the reason (e.g. damaged during transit, carton missing, packaging leak).
              </div>

              <div className="border border-[#164e48] rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#082926] text-slate-300 font-semibold border-b border-[#164e48]">
                    <tr>
                      <th className="p-3">Item Variant</th>
                      <th className="p-3 text-center">Dispatched</th>
                      <th className="p-3 text-center">Counted Received</th>
                      <th className="p-3">Discrepancy Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                    {receivedLines.map((it, idx) => {
                      const diff = it.dispatched_quantity - it.received_quantity
                      return (
                        <tr key={it.product_variant_id} className="hover:bg-[#0e3b37]/20">
                          <td className="p-3 font-medium text-white">
                            <div>{it.variant_name}</div>
                            {it.sku && <div className="text-[10px] text-slate-500 font-mono">{it.sku}</div>}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-300 font-mono">
                            {it.dispatched_quantity}
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              className="w-20 px-2 py-1.5 bg-[#031413] border border-[#164e48] rounded-lg text-center font-bold text-emerald-400 focus:outline-none focus:border-teal-400"
                              value={it.received_quantity}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0
                                setReceivedLines((prev) => {
                                  const next = [...prev]
                                  const cur = next[idx]
                                  if (cur) cur.received_quantity = val
                                  return next
                                })
                              }}
                            />
                          </td>
                          <td className="p-3">
                            {diff !== 0 ? (
                              <input
                                type="text"
                                className="w-full px-2.5 py-1.5 border border-amber-500/50 rounded-lg text-xs bg-amber-950/40 text-amber-200 placeholder-amber-400/50 focus:outline-none"
                                placeholder={`Diff of ${diff > 0 ? '-' : '+'}${Math.abs(diff)}: reason?`}
                                value={it.discrepancy_reason}
                                onChange={(e) => {
                                  const reason = e.target.value
                                  setReceivedLines((prev) => {
                                    const next = [...prev]
                                    const cur = next[idx]
                                    if (cur) cur.discrepancy_reason = reason
                                    return next
                                  })
                                }}
                              />
                            ) : (
                              <span className="text-slate-500 text-[11px]">— Exact Count —</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-4 border-t border-[#164e48] bg-[#082926]/70">
              <button
                type="button"
                className="px-4 py-2 bg-[#061e1c] hover:bg-[#164e48] rounded-xl text-xs font-medium text-slate-300"
                onClick={() => setReceiveModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 transition-all"
                disabled={receiveMutation.isPending}
                onClick={() =>
                  receiveMutation.mutate({
                    shipmentId: selectedShipment.id,
                    items: receivedLines.map((l) => ({
                      product_variant_id: l.product_variant_id,
                      received_quantity: l.received_quantity,
                      discrepancy_reason: l.discrepancy_reason,
                    })),
                  })
                }
              >
                <Check size={14} />
                {receiveMutation.isPending ? 'Confirming...' : 'Confirm Receipt into Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: New Inter-Branch Shipment Dispatch ───────────────────── */}
      {dispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#164e48] bg-[#082926]/70">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-teal-950 border border-teal-500/40 text-teal-400">
                  <Truck size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Dispatch Inter-Branch Transfer Shipment
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Stage inventory out of origin facility and dispatch into carrier in-transit tracking.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#164e48]"
                onClick={() => setDispatchModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Source Facility */}
                <div className="p-4 bg-[#031413]/70 rounded-xl border border-[#164e48] space-y-2.5">
                  <div className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" /> Origin Branch (Dispatch)
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Branch</label>
                    <select
                      className="w-full px-2.5 py-1.5 border border-[#164e48] rounded-lg text-xs bg-[#061e1c] text-white focus:outline-none focus:border-teal-400"
                      value={srcBranch}
                      onChange={(e) => setSrcBranch(e.target.value)}
                    >
                      {branches?.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Warehouse</label>
                    <select
                      className="w-full px-2.5 py-1.5 border border-[#164e48] rounded-lg text-xs bg-[#061e1c] text-white focus:outline-none focus:border-teal-400"
                      value={srcWh}
                      onChange={(e) => setSrcWh(e.target.value)}
                    >
                      {srcWhData?.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Stock Location</label>
                    <select
                      className="w-full px-2.5 py-1.5 border border-[#164e48] rounded-lg text-xs bg-[#061e1c] text-white focus:outline-none focus:border-teal-400"
                      value={srcLoc}
                      onChange={(e) => setSrcLoc(e.target.value)}
                    >
                      {srcWhData?.locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Destination Facility */}
                <div className="p-4 bg-[#031413]/70 rounded-xl border border-[#164e48] space-y-2.5">
                  <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Destination Branch (Receiving)
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Branch</label>
                    <select
                      className="w-full px-2.5 py-1.5 border border-[#164e48] rounded-lg text-xs bg-[#061e1c] text-white focus:outline-none focus:border-teal-400"
                      value={destBranch}
                      onChange={(e) => setDestBranch(e.target.value)}
                    >
                      {branches
                        ?.filter((b) => b.id !== srcBranch)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Warehouse</label>
                    <select
                      className="w-full px-2.5 py-1.5 border border-[#164e48] rounded-lg text-xs bg-[#061e1c] text-white focus:outline-none focus:border-teal-400"
                      value={destWh}
                      onChange={(e) => setDestWh(e.target.value)}
                    >
                      {destWhData?.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Stock Location</label>
                    <select
                      className="w-full px-2.5 py-1.5 border border-[#164e48] rounded-lg text-xs bg-[#061e1c] text-white focus:outline-none focus:border-teal-400"
                      value={destLoc}
                      onChange={(e) => setDestLoc(e.target.value)}
                    >
                      {destWhData?.locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Transit Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#031413]/50 rounded-xl border border-[#164e48]">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Carrier / Vehicle</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 bg-[#061e1c] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:border-teal-400"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g. Internal Fleet Van #04"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tracking / Trip #</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 bg-[#061e1c] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:border-teal-400"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                    placeholder="e.g. TRIP-2026-90"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Shipment Notes</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 bg-[#061e1c] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:border-teal-400"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="Special transit instructions"
                  />
                </div>
              </div>

              {/* Items Dispatch Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
                    Shipment Line Items ({newLines.length})
                  </span>
                </div>

                <div className="flex gap-2">
                  <select
                    className="flex-1 px-3 py-1.5 bg-[#031413] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:border-teal-400"
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                  >
                    <option value="">Select variant available in source...</option>
                    {variants?.map((v) => (
                      <option key={v.id} value={v.id}>
                        [{v.sku}] {v.product?.name || v.variant_name} - {v.variant_name} (Avail: {v.available_quantity})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    className="w-20 px-3 py-1.5 bg-[#031413] border border-[#164e48] rounded-lg text-xs text-center text-white focus:outline-none focus:border-teal-400"
                    value={variantQuantity}
                    onChange={(e) => setVariantQuantity(parseFloat(e.target.value) || 1)}
                  />

                  <button
                    type="button"
                    onClick={handleAddDispatchLine}
                    className="px-3 py-1.5 bg-[#164e48] hover:bg-[#1f665e] text-teal-200 rounded-lg text-xs font-semibold"
                  >
                    + Add
                  </button>
                </div>

                {newLines.length > 0 && (
                  <div className="border border-[#164e48] rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#082926] text-slate-300 border-b border-[#164e48]">
                        <tr>
                          <th className="p-2.5">Item</th>
                          <th className="p-2.5 text-center">Quantity</th>
                          <th className="p-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                        {newLines.map((l) => (
                          <tr key={l.product_variant_id}>
                            <td className="p-2.5">
                              <div className="font-medium text-white">{l.variant_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{l.sku}</div>
                            </td>
                            <td className="p-2.5 text-center font-bold text-emerald-400 font-mono">
                              {l.quantity}
                            </td>
                            <td className="p-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveDispatchLine(l.product_variant_id)}
                                className="text-rose-400 hover:text-rose-200"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-4 border-t border-[#164e48] bg-[#082926]/70">
              <button
                type="button"
                className="px-4 py-2 bg-[#061e1c] hover:bg-[#164e48] rounded-xl text-xs font-medium text-slate-300"
                onClick={() => setDispatchModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 transition-all"
                disabled={
                  dispatchMutation.isPending ||
                  !srcBranch ||
                  !destBranch ||
                  !srcWh ||
                  !destWh ||
                  !srcLoc ||
                  !destLoc ||
                  newLines.length === 0
                }
                onClick={() =>
                  dispatchMutation.mutate({
                    source_branch_id: srcBranch,
                    source_warehouse_id: srcWh,
                    source_location_id: srcLoc,
                    destination_branch_id: destBranch,
                    destination_warehouse_id: destWh,
                    destination_location_id: destLoc,
                    carrier_name: carrier,
                    tracking_number: tracking,
                    notes: transferNotes,
                    items: newLines.map((l) => ({
                      product_variant_id: l.product_variant_id,
                      quantity: l.quantity,
                    })),
                  })
                }
              >
                <Truck size={14} />
                {dispatchMutation.isPending ? 'Dispatching...' : 'Dispatch Shipment In-Transit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Shipment Details Inspector ─────────────────────────────── */}
      {detailsModal && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#164e48] bg-[#082926]/70">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-teal-950 border border-teal-500/40 text-teal-400">
                  <Eye size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Shipment #{selectedShipment.transfer_number}
                    {getStatusBadge(selectedShipment.status)}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedShipment.source_branch?.name} ➔ {selectedShipment.destination_branch?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#164e48]"
                onClick={() => setDetailsModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[#031413]/70 rounded-xl border border-[#164e48] text-xs">
                <div>
                  <span className="text-slate-500">Carrier</span>
                  <div className="font-semibold text-white">{selectedShipment.carrier_name || 'Fleet'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Tracking / Trip</span>
                  <div className="font-mono text-teal-300">{selectedShipment.tracking_number || '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Dispatched At</span>
                  <div className="text-slate-300">
                    {new Date(selectedShipment.dispatched_at).toLocaleString([], {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Received At</span>
                  <div className="text-slate-300">
                    {selectedShipment.received_at
                      ? new Date(selectedShipment.received_at).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : 'En Route'}
                  </div>
                </div>
              </div>

              {selectedShipment.notes && (
                <div className="text-xs text-slate-300 bg-[#031413]/50 p-3 rounded-xl border border-[#164e48]">
                  <strong>Notes:</strong> {selectedShipment.notes}
                </div>
              )}

              <div className="border border-[#164e48] rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#082926] text-slate-300 border-b border-[#164e48]">
                    <tr>
                      <th className="p-2.5">Item</th>
                      <th className="p-2.5 text-center">Dispatched</th>
                      <th className="p-2.5 text-center">Received</th>
                      <th className="p-2.5">Discrepancy / Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#164e48]/50 text-slate-200">
                    {selectedShipment.items?.map((it) => (
                      <tr key={it.id}>
                        <td className="p-2.5">
                          <div className="font-medium text-white">{it.variant?.product?.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {it.variant?.sku} · {it.variant?.variant_name}
                          </div>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-300 font-mono">
                          {it.dispatched_quantity}
                        </td>
                        <td className="p-2.5 text-center font-bold font-mono">
                          {selectedShipment.status === 'in_transit' ? (
                            <span className="text-purple-400">—</span>
                          ) : (
                            <span
                              className={
                                it.received_quantity !== it.dispatched_quantity
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }
                            >
                              {it.received_quantity}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-[11px]">
                          {it.discrepancy_reason ? (
                            <span className="text-amber-300 font-medium">
                              ⚠️ {it.discrepancy_reason} ({it.discrepancy_quantity} units)
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center p-4 border-t border-[#164e48] bg-[#082926]/70">
              <button
                type="button"
                onClick={() => {
                  setDetailsModal(false)
                  setPrintShipment(selectedShipment)
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#061e1c] hover:bg-[#164e48] text-teal-300 border border-[#164e48]"
              >
                <Printer size={14} /> Print Waybill
              </button>

              <button
                type="button"
                className="px-4 py-2 bg-[#061e1c] hover:bg-[#164e48] rounded-xl text-xs font-medium text-slate-300"
                onClick={() => setDetailsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Printable Waybill / Gate Pass ───────────────────────────── */}
      {printShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#061e1c] border border-[#164e48] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#164e48] bg-[#082926]">
              <div className="flex items-center gap-3">
                <Printer size={18} className="text-teal-400" />
                <span className="text-sm font-bold text-white">Inter-Branch Waybill Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#031413] rounded-lg p-0.5 border border-[#164e48] text-xs">
                  <button
                    onClick={() => setPrintFormat('a4')}
                    className={`px-3 py-1 rounded-md ${
                      printFormat === 'a4' ? 'bg-[#164e48] text-teal-200' : 'text-slate-400'
                    }`}
                  >
                    A4 Manifest
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
                  onClick={() => setPrintShipment(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-[#164e48] rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Document Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-900/60">
              <div
                id="printable-intransit-waybill"
                className={`mx-auto bg-white text-slate-900 rounded-lg shadow-xl p-6 ${
                  printFormat === 'thermal' ? 'max-w-xs font-mono text-[11px]' : 'max-w-2xl text-xs'
                }`}
              >
                {/* Header */}
                <div className="text-center border-b border-slate-300 pb-3 mb-4">
                  <h2 className="text-base font-bold tracking-tight uppercase">BABY BLOOM LOGISTICS</h2>
                  <p className="text-[10px] text-slate-600">Inter-Branch Transfer Waybill & Gate Pass</p>
                  <div className="mt-2 text-xs font-semibold text-slate-800">
                    SHIPMENT #{printShipment.transfer_number}
                  </div>
                </div>

                {/* Facilities */}
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-4 text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div>
                    <strong>Dispatched:</strong>{' '}
                    {new Date(printShipment.dispatched_at).toLocaleString([], {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </div>
                  <div>
                    <strong>Status:</strong> {printShipment.status.toUpperCase()}
                  </div>
                  <div>
                    <strong>Origin Branch:</strong> {printShipment.source_branch?.name}
                  </div>
                  <div>
                    <strong>Destination Branch:</strong> {printShipment.destination_branch?.name}
                  </div>
                  <div>
                    <strong>Carrier:</strong> {printShipment.carrier_name || 'Fleet'}
                  </div>
                  <div>
                    <strong>Tracking / Trip:</strong> {printShipment.tracking_number || 'N/A'}
                  </div>
                </div>

                {/* Items */}
                <table className="w-full text-left border-collapse text-[11px] mb-4">
                  <thead>
                    <tr className="border-b-2 border-slate-800">
                      <th className="py-1">Item</th>
                      <th className="py-1 text-center">Dispatched</th>
                      <th className="py-1 text-center">Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printShipment.items?.map((it) => (
                      <tr key={it.id}>
                        <td className="py-1.5">
                          <div className="font-semibold">{it.variant?.product?.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {it.variant?.sku} · {it.variant?.variant_name}
                          </div>
                        </td>
                        <td className="py-1.5 text-center font-bold">{it.dispatched_quantity}</td>
                        <td className="py-1.5 text-center font-bold">
                          {printShipment.status === 'in_transit' ? 'En Route' : it.received_quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signatures */}
                {printFormat === 'a4' && (
                  <div className="grid grid-cols-3 gap-4 pt-10 border-t border-slate-300 text-center text-[10px] text-slate-600">
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-8" />
                      Dispatched By (Origin Storekeeper)
                    </div>
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-8" />
                      Carrier / Van Driver
                    </div>
                    <div>
                      <div className="border-b border-slate-400 mb-1 h-8" />
                      Received By (Destination Warehouse)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#164e48] bg-[#082926] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPrintShipment(null)}
                className="px-4 py-2 rounded-xl text-xs bg-[#061e1c] text-slate-400 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg"
              >
                <Printer size={15} /> Print Manifest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PRINTABLE INTER-BRANCH IN-TRANSIT TRANSFERS REGISTER ── */}
      {printRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          {/* Top screen-only toolbar */}
          <div className="no-print w-full max-w-[210mm] flex items-center justify-between p-3.5 mb-4 bg-[#072421] border border-[#164e48] rounded-xl text-white shadow-xl">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 text-white">
                <Printer size={16} className="text-teal-400" />
                Inter-Branch In-Transit Stock Transfers Register Preview
              </h3>
              <span className="text-[11px] text-teal-300/80">
                A4 Summary Document • {filteredShipments.length} Shipments In Current Scope
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
            id="intransit-register-summary-printable"
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
                  Inter-Branch In-Transit Stock Transfers Register
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                  Ref: TRN-REG-{new Date().getFullYear()}-{Math.floor(Date.now() / 1000).toString().slice(-4)}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Date: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB')}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Scope: {selectedBranch !== 'all' ? (branches?.find((b) => b.id === selectedBranch)?.name || selectedBranch) : 'All Origins'} → {selectedDestBranch !== 'all' ? (branches?.find((b) => b.id === selectedDestBranch)?.name || selectedDestBranch) : 'All Destinations'}
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
                  Active In-Transit
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#7c3aed' }}>
                  {inTransitCount}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Completed Receipts
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#047857' }}>
                  {receivedCount}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Discrepancies Flagged
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#d97706' }}>
                  {discrepancyCount}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  Total Moved Volume
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f766e' }}>
                  {totalUnitsMoved.toLocaleString()} units
                </div>
              </div>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f766e', color: '#ffffff' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '25px' }}>#</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '105px' }}>SHIPMENT #</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '80px' }}>DISPATCHED</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '110px' }}>ORIGIN BRANCH</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '110px' }}>DESTINATION</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>CARRIER / TRACKING</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '70px' }}>DISPATCHED</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '70px' }}>RECEIVED</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '80px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      No in-transit shipments found matching the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredShipments.map((s, idx) => {
                    const dispUnits = s.items?.reduce((sum, it) => sum + (it.dispatched_quantity || 0), 0) || 0
                    const recUnits =
                      s.status === 'in_transit'
                        ? '—'
                        : s.items?.reduce((sum, it) => sum + (it.received_quantity ?? it.dispatched_quantity ?? 0), 0) || 0
                    return (
                      <tr
                        key={s.id}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                        }}
                      >
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700 }}>
                          {s.transfer_number}
                        </td>
                        <td style={{ padding: '6px 8px', fontSize: '9px' }}>
                          {new Date(s.dispatched_at).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#334155' }}>
                          <div style={{ fontWeight: 600 }}>{s.source_branch?.name}</div>
                          <div style={{ fontSize: '8.5px', color: '#64748b' }}>{s.source_branch?.code}</div>
                        </td>
                        <td style={{ padding: '6px 8px', color: '#0f766e' }}>
                          <div style={{ fontWeight: 600 }}>{s.destination_branch?.name}</div>
                          <div style={{ fontSize: '8.5px', color: '#64748b' }}>{s.destination_branch?.code}</div>
                        </td>
                        <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '9px' }}>
                          <div>{s.carrier_name || 'Internal Fleet'}</div>
                          {s.tracking_number && (
                            <div style={{ fontFamily: 'monospace', fontSize: '8.5px' }}>{s.tracking_number}</div>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                          {dispUnits}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: s.status === 'in_transit' ? '#94a3b8' : '#047857' }}>
                          {recUnits}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '8px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '3px',
                              backgroundColor:
                                s.status === 'received_fully'
                                  ? '#dcfce7'
                                  : s.status === 'in_transit'
                                  ? '#f3e8ff'
                                  : s.status === 'discrepancy_reported'
                                  ? '#fef3c7'
                                  : '#f1f5f9',
                              color:
                                s.status === 'received_fully'
                                  ? '#15803d'
                                  : s.status === 'in_transit'
                                  ? '#7e22ce'
                                  : s.status === 'discrepancy_reported'
                                  ? '#b45309'
                                  : '#475569',
                            }}
                          >
                            {s.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #0f766e', backgroundColor: '#f1f5f9', fontWeight: 800 }}>
                  <td colSpan={6} style={{ padding: '8px', textAlign: 'right', textTransform: 'uppercase' }}>
                    Total Listed Volumes:
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', color: '#042f2e' }}>
                    {filteredShipments.reduce((sum, s) => {
                      const u = s.items?.reduce((acc, it) => acc + (it.dispatched_quantity || 0), 0) || 0
                      return sum + u
                    }, 0)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', color: '#047857' }}>
                    {filteredShipments.reduce((sum, s) => {
                      if (s.status === 'in_transit') return sum
                      const u = s.items?.reduce((acc, it) => acc + (it.received_quantity ?? it.dispatched_quantity ?? 0), 0) || 0
                      return sum + u
                    }, 0)}
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
                <strong>Central Logistics Dispatch Officer</strong>
                <div>Fleet Movement & Waybill Authorization</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Carrier / Van Fleet Supervisor</strong>
                <div>Custody & Road Transit Verification</div>
              </div>
              <div>
                <div style={{ height: '35px', borderBottom: '1px solid #94a3b8', marginBottom: '4px' }}></div>
                <strong>Destination Receiving Officer</strong>
                <div>Physical Receiving Inspection & Post</div>
              </div>
            </div>

            <div style={{ marginTop: '14px', fontSize: '9px', color: '#94a3b8', textAlign: 'center' }}>
              This is an audited Inter-Branch In-Transit Stock Transfers Register generated under ISO/LKAS Supply Chain Standards. Confidential & Proprietary to Baby Bloom (Pvt) Ltd.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
