import { useState } from 'react'
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
import type {
  BranchTransferShipment,
  TransferShipmentStatus,
} from '../types/orders'

export function InTransitTransfersPage() {
  const queryClient = useQueryClient()
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')

  // Modals
  const [receiveModal, setReceiveModal] = useState(false)
  const [dispatchModal, setDispatchModal] = useState(false)
  const [detailsModal, setDetailsModal] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<BranchTransferShipment | null>(null)

  // Receive stock wizard state
  const [receivedLines, setReceivedLines] = useState<
    Array<{
      product_variant_id: string
      variant_name: string
      dispatched_quantity: number
      received_quantity: number
      discrepancy_reason: string
    }>
  >([])

  // New transfer modal state
  const [srcBranch, setSrcBranch] = useState('')
  const [srcWh, setSrcWh] = useState('')
  const [srcLoc, setSrcLoc] = useState('')
  const [destBranch, setDestBranch] = useState('')
  const [destWh, setDestWh] = useState('')
  const [destLoc, setDestLoc] = useState('')
  const [carrier, setCarrier] = useState('Internal Fleet Van')
  const [tracking, setTracking] = useState('')
  const [transferNotes, setTransferNotes] = useState('')
  const [newLines, setNewLines] = useState<Array<{ product_variant_id: string; quantity: number }>>([])

  // Branches
  const { data: branches } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  // Source Warehouses & Locations
  const { data: srcWhData } = useQuery({
    queryKey: ['lookup', 'warehouses-locations', srcBranch],
    queryFn: () => fetchWarehousesAndLocations(srcBranch),
    enabled: !!srcBranch,
  })

  // Destination Warehouses & Locations
  const { data: destWhData } = useQuery({
    queryKey: ['lookup', 'warehouses-locations', destBranch],
    queryFn: () => fetchWarehousesAndLocations(destBranch),
    enabled: !!destBranch,
  })

  // Variants for source location
  const { data: variants } = useQuery({
    queryKey: ['lookup', 'variants', srcLoc],
    queryFn: () => fetchVariantsLookup(srcLoc),
    enabled: !!srcLoc,
  })

  // Shipments query
  const { data: shipments, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['branch-transfer-shipments', selectedBranch, selectedStatus],
    queryFn: () => fetchBranchTransferShipments(selectedBranch, selectedStatus),
    refetchInterval: 15000,
  })

  // Mutations
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
      setReceiveModal(false)
      setSelectedShipment(null)
      alert(
        res.has_discrepancy
          ? 'Transfer received with discrepancies recorded into the security audit log.'
          : 'Transfer stock verified and posted into destination warehouse successfully!'
      )
    },
    onError: (err: Error) => alert('Receipt confirmation failed: ' + err.message),
  })

  const dispatchMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createBranchTransferShipment>[0]) => createBranchTransferShipment(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['branch-transfer-shipments'] })
      setDispatchModal(false)
      alert(`Transfer shipment #${res.transfer_number} created in transit!`)
    },
    onError: (err: Error) => alert('Dispatch failed: ' + err.message),
  })

  const handleOpenReceive = (s: BranchTransferShipment) => {
    setSelectedShipment(s)
    setReceivedLines(
      s.items?.map((it) => ({
        product_variant_id: it.product_variant_id,
        variant_name: `${it.variant?.product?.name || ''} - ${it.variant?.variant_name || ''}`,
        dispatched_quantity: it.dispatched_quantity,
        received_quantity: it.dispatched_quantity,
        discrepancy_reason: '',
      })) || []
    )
    setReceiveModal(true)
  }

  const inTransitCount = shipments?.filter((s) => s.status === 'in_transit').length ?? 0
  const discrepancyCount = shipments?.filter((s) => s.status === 'discrepancy_reported').length ?? 0
  const receivedCount = shipments?.filter((s) => s.status === 'received_fully').length ?? 0

  const getStatusBadge = (status: TransferShipmentStatus) => {
    switch (status) {
      case 'in_transit':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Truck size={12} /> In Transit
          </span>
        )
      case 'received_fully':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} /> Received Fully
          </span>
        )
      case 'discrepancy_reported':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle size={12} /> Discrepancy Flagged
          </span>
        )
      case 'cancelled':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
            Cancelled
          </span>
        )
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <ArrowRightLeft className="text-emerald-700" size={28} />
            Inter-Branch In-Transit Stock Transfers
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track goods in transit between branch warehouses, verify received quantities, and document discrepancies.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            <RefreshCw size={15} className={isRefetching ? 'animate-spin text-emerald-700' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm"
            onClick={() => setDispatchModal(true)}
          >
            <Plus size={16} />
            New Inter-Branch Shipment
          </button>
        </div>
      </div>

      {/* ── Summary KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-purple-600 uppercase tracking-wider">Active In-Transit</div>
          <div className="text-2xl font-bold text-purple-700 mt-1.5">{inTransitCount}</div>
          <div className="text-xs text-gray-400 mt-1">Awaiting destination warehouse receipt</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Completed Receipts</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1.5">{receivedCount}</div>
          <div className="text-xs text-gray-400 mt-1">Inventory confirmed in destination</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wider">Discrepancies Reported</div>
          <div className="text-2xl font-bold text-amber-600 mt-1.5">{discrepancyCount}</div>
          <div className="text-xs text-gray-400 mt-1">Shortages, breakage or damage logged</div>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex gap-2 w-full md:w-auto">
          <select
            className="px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800 font-medium"
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="all">All Branches</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select
            className="px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800 font-medium"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">All Shipment Statuses</option>
            <option value="in_transit">In Transit Only</option>
            <option value="received_fully">Received Fully</option>
            <option value="discrepancy_reported">Discrepancy Reported</option>
          </select>
        </div>
      </div>

      {/* ── In-Transit Shipments Table ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading transfer shipments...</div>
        ) : shipments && shipments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Transfer #</th>
                  <th className="px-5 py-3.5">Origin Branch</th>
                  <th className="px-5 py-3.5">Destination Branch</th>
                  <th className="px-5 py-3.5">Carrier / Tracking</th>
                  <th className="px-5 py-3.5">Dispatched Date</th>
                  <th className="px-5 py-3.5 text-center">Items</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-gray-900 font-mono">
                      {shipment.transfer_number}
                    </td>

                    <td className="px-5 py-3.5 text-xs text-gray-800">
                      <div className="font-semibold">{shipment.source_branch?.name}</div>
                      <div className="text-gray-400 font-mono">{shipment.source_branch?.code}</div>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-gray-800">
                      <div className="font-semibold text-emerald-800">{shipment.destination_branch?.name}</div>
                      <div className="text-gray-400 font-mono">{shipment.destination_branch?.code}</div>
                    </td>

                    <td className="px-5 py-3.5 text-xs">
                      <div className="font-medium text-gray-900">{shipment.carrier_name || 'Fleet'}</div>
                      {shipment.tracking_number && (
                        <div className="font-mono text-gray-400">{shipment.tracking_number}</div>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-xs text-gray-600">
                      {new Date(shipment.dispatched_at).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>

                    <td className="px-5 py-3.5 text-center font-bold text-gray-800">
                      {shipment.items?.length ?? 0}
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      {getStatusBadge(shipment.status)}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                          title="Inspect Transfer"
                          onClick={() => {
                            setSelectedShipment(shipment)
                            setDetailsModal(true)
                          }}
                        >
                          <Eye size={15} />
                        </button>

                        {shipment.status === 'in_transit' && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                            onClick={() => handleOpenReceive(shipment)}
                          >
                            <Check size={13} /> Receive Stock
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center">
            <Truck size={44} className="mx-auto text-emerald-700 mb-3" />
            <h3 className="text-base font-semibold text-gray-900">No transfer shipments in transit</h3>
            <p className="text-sm text-gray-500 mt-1">
              Dispatch a transfer between branches to start in-transit tracking.
            </p>
          </div>
        )}
      </div>

      {/* ── MODAL: Receive Stock Wizard ─────────────────────────────────── */}
      {receiveModal && selectedShipment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Receive Stock: {selectedShipment.transfer_number}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Verify counts arriving from {selectedShipment.source_branch?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setReceiveModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="text-xs text-gray-600">
                Confirm the actual counted quantities. If a count differs from what was dispatched, please state the reason (e.g. damaged in transit, shortage).
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="p-2.5">Variant</th>
                      <th className="p-2.5 text-center">Dispatched</th>
                      <th className="p-2.5 text-center">Received Count</th>
                      <th className="p-2.5">Discrepancy Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {receivedLines.map((it, idx) => {
                      const diff = it.dispatched_quantity - it.received_quantity
                      return (
                        <tr key={it.product_variant_id}>
                          <td className="p-2.5 font-medium text-gray-900">{it.variant_name}</td>
                          <td className="p-2.5 text-center font-bold text-gray-700">{it.dispatched_quantity}</td>
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center font-bold text-emerald-800"
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
                          <td className="p-2.5">
                            {diff !== 0 && (
                              <input
                                type="text"
                                className="w-full px-2 py-1 border border-amber-300 rounded-lg text-xs bg-amber-50/50 text-amber-900"
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
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => setReceiveModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
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
                {receiveMutation.isPending ? 'Confirming...' : 'Confirm Receipt into Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: New Inter-Branch Transfer Shipment ────────────────────── */}
      {dispatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Dispatch Inter-Branch Transfer
                  </h3>
                  <p className="text-xs text-gray-500">
                    Transfer inventory from one branch warehouse into in-transit status.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setDispatchModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                {/* Source */}
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                  <div className="text-xs font-bold text-gray-700 uppercase">Origin (Dispatch)</div>
                  <select
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    value={srcBranch}
                    onChange={(e) => setSrcBranch(e.target.value)}
                  >
                    <option value="">-- Source Branch --</option>
                    {branches?.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>

                  <select
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    value={srcWh}
                    onChange={(e) => setSrcWh(e.target.value)}
                  >
                    <option value="">-- Source Warehouse --</option>
                    {srcWhData?.warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>

                  <select
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    value={srcLoc}
                    onChange={(e) => setSrcLoc(e.target.value)}
                  >
                    <option value="">-- Source Location --</option>
                    {srcWhData?.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                {/* Destination */}
                <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2">
                  <div className="text-xs font-bold text-emerald-800 uppercase">Destination (Receiving)</div>
                  <select
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    value={destBranch}
                    onChange={(e) => setDestBranch(e.target.value)}
                  >
                    <option value="">-- Destination Branch --</option>
                    {branches
                      ?.filter((b) => b.id !== srcBranch)
                      .map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                  </select>

                  <select
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    value={destWh}
                    onChange={(e) => setDestWh(e.target.value)}
                  >
                    <option value="">-- Destination Warehouse --</option>
                    {destWhData?.warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>

                  <select
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    value={destLoc}
                    onChange={(e) => setDestLoc(e.target.value)}
                  >
                    <option value="">-- Destination Location --</option>
                    {destWhData?.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Transit Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Carrier / Vehicle</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tracking / Trip #</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-mono"
                    placeholder="e.g. TR-2026-081"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Transfer Notes</label>
                <input
                  type="text"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                  placeholder="Notes or reason for inter-branch transfer..."
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                />
              </div>

              {/* Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-gray-700 uppercase">Items to Transfer</div>
                  <select
                    className="px-2.5 py-1 border border-emerald-300 rounded-lg text-xs bg-emerald-50 text-emerald-900"
                    onChange={(e) => {
                      if (e.target.value) {
                        const vid = e.target.value
                        if (!newLines.some((l) => l.product_variant_id === vid)) {
                          setNewLines((prev) => [...prev, { product_variant_id: vid, quantity: 1 }])
                        }
                        e.target.value = ''
                      }
                    }}
                  >
                    <option value="">+ Add Variant...</option>
                    {variants?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.product?.name} - {v.variant_name}
                      </option>
                    ))}
                  </select>
                </div>

                {newLines.length > 0 && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                        <tr>
                          <th className="p-2">Variant</th>
                          <th className="p-2 text-center">Transfer Qty</th>
                          <th className="p-2 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {newLines.map((line, idx) => {
                          const v = variants?.find((item) => item.id === line.product_variant_id)
                          return (
                            <tr key={line.product_variant_id}>
                              <td className="p-2 font-medium">{v?.product?.name} - {v?.variant_name}</td>
                              <td className="p-2 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center font-bold"
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseFloat(e.target.value) || 1)
                                     setNewLines((prev) => {
                                       const next = [...prev]
                                       const cur = next[idx]
                                       if (cur) cur.quantity = val
                                       return next
                                     })
                                  }}
                                />
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  className="text-gray-400 hover:text-rose-600"
                                  onClick={() => setNewLines((prev) => prev.filter((_, i) => i !== idx))}
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => setDispatchModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                disabled={
                  dispatchMutation.isPending ||
                  !srcBranch ||
                  !destBranch ||
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
                    items: newLines,
                  })
                }
              >
                {dispatchMutation.isPending ? 'Dispatching...' : 'Dispatch Transfer Shipment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Details Inspector ─────────────────────────────────────── */}
      {detailsModal && selectedShipment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-xl w-full p-6 text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-lg">Transfer #{selectedShipment.transfer_number}</h3>
                <p className="text-xs text-gray-500">Status: {getStatusBadge(selectedShipment.status)}</p>
              </div>
              <button type="button" onClick={() => setDetailsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl">
                <div>
                  <span className="text-gray-500">From:</span>
                  <div className="font-semibold">{selectedShipment.source_branch?.name}</div>
                </div>
                <div>
                  <span className="text-gray-500">To:</span>
                  <div className="font-semibold">{selectedShipment.destination_branch?.name}</div>
                </div>
                <div>
                  <span className="text-gray-500">Carrier:</span>
                  <div className="font-medium">{selectedShipment.carrier_name || 'In-House'}</div>
                </div>
                <div>
                  <span className="text-gray-500">Tracking #:</span>
                  <div className="font-mono">{selectedShipment.tracking_number || '-'}</div>
                </div>
              </div>

              <div>
                <div className="font-bold uppercase tracking-wider text-gray-600 mb-1">Shipment Contents</div>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="p-2">Item</th>
                        <th className="p-2 text-center">Dispatched</th>
                        <th className="p-2 text-center">Received</th>
                        <th className="p-2 text-center">Discrepancy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedShipment.items?.map((it) => (
                        <tr key={it.id}>
                          <td className="p-2">{it.variant?.product?.name} - {it.variant?.variant_name}</td>
                          <td className="p-2 text-center font-medium">{it.dispatched_quantity}</td>
                          <td className="p-2 text-center font-medium text-emerald-800">{it.received_quantity}</td>
                          <td className="p-2 text-center font-bold text-amber-600">
                            {it.discrepancy_quantity && it.discrepancy_quantity !== 0 ? it.discrepancy_quantity : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50"
                onClick={() => setDetailsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
