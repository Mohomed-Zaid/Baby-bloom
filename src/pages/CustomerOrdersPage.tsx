import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Filter,
  Eye,
  Send,
  XCircle,
  FileText,
  MapPin,
  Phone,
  RefreshCw,
  X,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'
import {
  fetchCustomerOrders,
  dispatchCustomerOrder,
  deliverCustomerOrder,
  cancelCustomerOrder,
  fetchBranchesLookup,
} from '../services/orderService'
import type {
  CustomerOrder,
  CustomerOrderFilterState,
  OrderStatus,
} from '../types/orders'

export function CustomerOrdersPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<CustomerOrderFilterState>({
    search: '',
    order_status: 'all',
    delivery_type: 'all',
    branch_id: 'all',
    date_from: '',
    date_to: '',
  })

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // Selected order state for modals
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null)
  const [viewDetailsModal, setViewDetailsModal] = useState(false)
  const [dispatchModal, setDispatchModal] = useState(false)
  const [deliverModal, setDeliverModal] = useState(false)
  const [cancelModal, setCancelModal] = useState(false)

  // Dispatch modal form
  const [courierName, setCourierName] = useState('PromptX Courier')
  const [trackingNumber, setTrackingNumber] = useState('')

  // Deliver modal form
  const [deliveryPaymentAmount, setDeliveryPaymentAmount] = useState<number>(0)
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState('cash')
  const [deliveryPaymentRef, setDeliveryPaymentRef] = useState('')

  // Cancel modal form
  const [cancelReason, setCancelReason] = useState('')

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  // Fetch orders
  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customer-orders', filters],
    queryFn: () => fetchCustomerOrders(filters),
    refetchInterval: 15000,
  })

  // Mutations
  const dispatchMutation = useMutation({
    mutationFn: ({ orderId, tracking }: { orderId: string; tracking: { courier_name: string; tracking_number: string } }) =>
      dispatchCustomerOrder(orderId, tracking),
    onSuccess: () => {
      const orderNum = selectedOrder?.order_number ? ` #${selectedOrder.order_number}` : ''
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      setDispatchModal(false)
      setSelectedOrder(null)
      notify(`Order${orderNum} marked as In-Transit with ${courierName}!`)
    },
    onError: (err: Error) => notify('Dispatch failed: ' + err.message, true),
  })

  const deliverMutation = useMutation({
    mutationFn: ({
      orderId,
      payment,
    }: {
      orderId: string
      payment: { amount: number; payment_method: string; payment_reference?: string }
    }) => deliverCustomerOrder(orderId, payment),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      setDeliverModal(false)
      setSelectedOrder(null)
      notify(`Order delivered successfully! Sales Invoice #${data.invoice_number} generated.`)
    },
    onError: (err: Error) => notify('Delivery failed: ' + err.message, true),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      cancelCustomerOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      setCancelModal(false)
      setSelectedOrder(null)
      notify('Customer order cancelled and stock reservations released.')
    },
    onError: (err: Error) => notify('Cancellation failed: ' + err.message, true),
  })

  const handleOpenDispatch = (order: CustomerOrder) => {
    setSelectedOrder(order)
    setCourierName(order.courier_name || 'PromptX Courier')
    setTrackingNumber(order.tracking_number || '')
    setDispatchModal(true)
  }

  const handleOpenDeliver = (order: CustomerOrder) => {
    setSelectedOrder(order)
    setDeliveryPaymentAmount(order.balance_amount)
    setDeliveryPaymentMethod('cash')
    setDeliveryPaymentRef('')
    setDeliverModal(true)
  }

  const handleOpenCancel = (order: CustomerOrder) => {
    setSelectedOrder(order)
    setCancelReason('')
    setCancelModal(true)
  }

  // Summary Metrics
  const totalCount = orders?.length ?? 0
  const pendingCount = orders?.filter((o) => o.order_status === 'pending' || o.order_status === 'confirmed').length ?? 0
  const inTransitCount = orders?.filter((o) => o.order_status === 'dispatched').length ?? 0
  const deliveredCount = orders?.filter((o) => o.order_status === 'delivered').length ?? 0
  const totalValue = orders?.reduce((acc, o) => acc + (o.grand_total || 0), 0) ?? 0

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0d2f40] text-[#38bdf8] border border-[#0284c7]/40 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
            Confirmed
          </span>
        )
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#2a240c] text-[#facc15] border border-[#ca8a04]/40 shadow-sm">
            <Clock size={12} /> Processing
          </span>
        )
      case 'dispatched':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#26153b] text-[#c084fc] border border-[#9333ea]/40 shadow-sm">
            <Truck size={12} /> In Transit
          </span>
        )
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#092920] text-[#34d399] border border-[#059669]/40 shadow-sm">
            <CheckCircle2 size={12} /> Delivered
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#290d13] text-[#f87171] border border-[#dc2626]/40 shadow-sm">
            <XCircle size={12} /> Cancelled
          </span>
        )
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#241f0b] text-[#fbbf24] border border-[#d97706]/40 shadow-sm">
            <Clock size={12} /> Pending
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
      {/* ── TOAST NOTIFICATION ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 transition-all duration-300 ${
            toast.isError
              ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
              : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
          }`}
        >
          {toast.isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <Package className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Customer Orders & Delivery Management
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Fulfillment Hub
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Manage order intake, reserved warehouse allocations, courier tracking, and invoice settlement
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            <RefreshCw size={15} className={isRefetching ? 'animate-spin text-[#38d4c5]' : ''} />
            Refresh
          </button>

          <Link
            to="/sales/new-order"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#059669]/20 transition-all active:scale-[0.98]"
          >
            <Plus size={16} />
            New Customer Order
          </Link>
        </div>
      </div>

      {/* ── Summary KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Orders */}
        <div className="p-5 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7aa5a0]">Active Orders</span>
            <span className="p-1.5 bg-[#103e39] rounded-lg text-[#38d4c5]">
              <Package className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{totalCount}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#527d78]">
            <TrendingUp size={13} className="text-[#38d4c5]" />
            <span>Valued at Rs. {totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        {/* Card 2: Pending / Processing */}
        <div className="p-5 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#facc15]">Pending / Packing</span>
            <span className="p-1.5 bg-[#2b2408] rounded-lg text-[#facc15]">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#facc15]">{pendingCount}</div>
          <div className="mt-1 text-xs text-[#7aa5a0]">Ready for courier dispatch</div>
        </div>

        {/* Card 3: Dispatched / In Transit */}
        <div className="p-5 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#c084fc]">In Transit / Courier</span>
            <span className="p-1.5 bg-[#28153e] rounded-lg text-[#c084fc]">
              <Truck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#c084fc]">{inTransitCount}</div>
          <div className="mt-1 text-xs text-[#7aa5a0]">Active waybills out for delivery</div>
        </div>

        {/* Card 4: Delivered */}
        <div className="p-5 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#34d399]">Delivered & Invoiced</span>
            <span className="p-1.5 bg-[#0d3327] rounded-lg text-[#34d399]">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#34d399]">{deliveredCount}</div>
          <div className="mt-1 text-xs text-[#7aa5a0]">Stock deducted & ledger posted</div>
        </div>
      </div>

      {/* ── Status Tab Navigation ────────────────────────────────────────── */}
      <div className="flex border-b border-[#164e48] overflow-x-auto gap-2 pb-1">
        {[
          { id: 'all', label: 'All Orders' },
          { id: 'confirmed', label: 'Confirmed / Packing' },
          { id: 'dispatched', label: 'In Transit / Dispatched' },
          { id: 'delivered', label: 'Delivered & Closed' },
          { id: 'cancelled', label: 'Cancelled' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap ${
              filters.order_status === tab.id
                ? 'bg-[#0e3b37] text-[#38d4c5] border-t-2 border-x-2 border-[#164e48] border-b-transparent shadow-sm'
                : 'text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]'
            }`}
            onClick={() => setFilters((f) => ({ ...f, order_status: tab.id }))}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 p-4 rounded-2xl border border-[#164e48] shadow-md flex flex-col md:flex-row gap-3 items-center justify-between backdrop-blur-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#527d78]" size={16} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white placeholder-[#527d78] focus:outline-none focus:border-[#38d4c5]"
            placeholder="Search order #, customer, phone..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap gap-2.5 w-full md:w-auto items-center">
          <div className="flex items-center gap-1.5 text-xs text-[#7aa5a0]">
            <Filter size={14} /> Filter By:
          </div>

          <select
            className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={filters.branch_id}
            onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))}
          >
            <option value="all">All Branches</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select
            className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={filters.delivery_type}
            onChange={(e) => setFilters((f) => ({ ...f, delivery_type: e.target.value }))}
          >
            <option value="all">All Delivery Types</option>
            <option value="store_pickup">Store Pickup</option>
            <option value="courier">Courier Service</option>
            <option value="internal_delivery">Internal Delivery</option>
          </select>

          <input
            type="date"
            className="px-2.5 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
          />
          <span className="text-[#527d78] text-xs">to</span>
          <input
            type="date"
            className="px-2.5 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={filters.date_to}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
          />
        </div>
      </div>

      {/* ── Orders Table ─────────────────────────────────────────────────── */}
      <div className="bg-[#061e1c]/80 rounded-2xl border border-[#164e48] shadow-2xl overflow-hidden backdrop-blur-md">
        {isLoading ? (
          <div className="p-16 text-center text-sm text-[#7aa5a0] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 text-[#38d4c5] animate-spin" />
            <span>Loading customer orders and inventory reservations...</span>
          </div>
        ) : orders && orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#092925] border-b border-[#164e48] text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Order #</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Delivery & Tracking</th>
                  <th className="px-5 py-3.5 text-right">Grand Total</th>
                  <th className="px-5 py-3.5 text-right">Advance / Balance</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#113e3a]/60">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#0c312d]/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-white tracking-wide">{order.order_number}</div>
                      <div className="text-xs text-[#527d78]">{order.branch?.name || 'Main Branch'}</div>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-[#a0c4c0] whitespace-nowrap">
                      <div>{new Date(order.order_date).toLocaleDateString()}</div>
                      {order.expected_delivery_date && (
                        <div className="text-[#527d78] font-mono text-[11px]">Exp: {order.expected_delivery_date}</div>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{order.customer?.name}</div>
                      <div className="text-xs text-[#7aa5a0] flex items-center gap-1.5 mt-0.5">
                        <Phone size={11} className="text-[#38d4c5]" />
                        {order.contact_phone || order.customer?.phone || 'No phone'}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-xs">
                      <div className="font-medium text-[#e2f1ef] capitalize">
                        {order.delivery_type.replace(/_/g, ' ')}
                      </div>
                      {order.courier_name && (
                        <div className="text-[#38d4c5] font-medium flex items-center gap-1 mt-0.5">
                          <Truck size={12} />
                          {order.courier_name} {order.tracking_number ? `(${order.tracking_number})` : ''}
                        </div>
                      )}
                      {order.delivery_address && (
                        <div className="text-[#7aa5a0] truncate max-w-xs flex items-center gap-1 mt-0.5" title={order.delivery_address}>
                          <MapPin size={11} className="shrink-0 text-[#527d78]" /> {order.delivery_address}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right font-bold text-white whitespace-nowrap">
                      Rs. {order.grand_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="px-5 py-3.5 text-right text-xs whitespace-nowrap">
                      <div className="text-[#34d399] font-medium">
                        Adv: Rs. {order.advance_paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className={order.balance_amount > 0 ? 'text-[#f87171] font-semibold' : 'text-[#7aa5a0]'}>
                        COD Bal: Rs. {order.balance_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {getStatusBadge(order.order_status)}
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Inspect details */}
                        <button
                          type="button"
                          className="p-1.5 text-[#7aa5a0] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48]"
                          title="View Order Details"
                          onClick={() => {
                            setSelectedOrder(order)
                            setViewDetailsModal(true)
                          }}
                        >
                          <Eye size={15} />
                        </button>

                        {/* Dispatch Button */}
                        {(order.order_status === 'pending' || order.order_status === 'confirmed' || order.order_status === 'processing') && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#26153b] text-[#c084fc] hover:bg-[#341b52] border border-[#9333ea]/30 rounded-lg text-xs font-semibold transition-colors"
                            onClick={() => handleOpenDispatch(order)}
                          >
                            <Send size={12} /> Dispatch
                          </button>
                        )}

                        {/* Deliver & Invoice Button */}
                        {(order.order_status === 'dispatched' || order.order_status === 'confirmed') && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#092920] text-[#34d399] hover:bg-[#0e3b2e] border border-[#059669]/40 rounded-lg text-xs font-semibold transition-colors"
                            onClick={() => handleOpenDeliver(order)}
                          >
                            <CheckCircle2 size={12} /> Deliver & Settle
                          </button>
                        )}

                        {/* Cancel Button */}
                        {order.order_status !== 'delivered' && order.order_status !== 'cancelled' && (
                          <button
                            type="button"
                            className="p-1.5 text-[#f87171] hover:text-white hover:bg-[#3b1119] rounded-lg transition-colors border border-transparent hover:border-[#5e1624]"
                            title="Cancel Order"
                            onClick={() => handleOpenCancel(order)}
                          >
                            <XCircle size={15} />
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
            <Package size={44} className="mx-auto text-[#38d4c5] mb-3 opacity-60" />
            <h3 className="text-base font-semibold text-white">No customer orders match this filter</h3>
            <p className="text-sm text-[#7aa5a0] mt-1 max-w-sm mx-auto">
              Create a new customer order or adjust your branch/status filter selection.
            </p>
            <div className="mt-5">
              <Link
                to="/sales/new-order"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-md transition-all"
              >
                <Plus size={16} />
                Create New Order
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: Order Details & Reserved Stock Inspector ──────────────── */}
      {viewDetailsModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#164e48] bg-[#0c2e2a]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#082321] border border-[#164e48] rounded-xl text-[#38d4c5]">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Order Details: {selectedOrder.order_number}
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Placed on {selectedOrder.order_date} • Customer: {selectedOrder.customer?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1.5 rounded-lg hover:bg-[#12423c]"
                onClick={() => setViewDetailsModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#031413] p-3.5 rounded-xl text-xs border border-[#164e48]">
                <div>
                  <span className="text-[#7aa5a0]">Status:</span>
                  <div className="mt-1">{getStatusBadge(selectedOrder.order_status)}</div>
                </div>
                <div>
                  <span className="text-[#7aa5a0]">Pricing Tier:</span>
                  <div className="font-semibold uppercase text-[#38d4c5] mt-1">{selectedOrder.pricing_tier}</div>
                </div>
                <div>
                  <span className="text-[#7aa5a0]">Advance Paid:</span>
                  <div className="font-semibold text-[#34d399] mt-1">Rs. {selectedOrder.advance_paid.toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-[#7aa5a0]">Balance Due:</span>
                  <div className="font-bold text-[#f87171] mt-1">Rs. {selectedOrder.balance_amount.toFixed(2)}</div>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-xs font-bold text-[#a0c4c0] uppercase tracking-wider mb-2">
                  Order Items & Stock Reservations
                </h4>
                <div className="border border-[#164e48] rounded-xl overflow-hidden bg-[#031413]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#092925] text-[#7aa5a0] border-b border-[#164e48]">
                      <tr>
                        <th className="p-2.5">Product Variant</th>
                        <th className="p-2.5 text-center">Qty Ordered</th>
                        <th className="p-2.5 text-right">Unit Rate</th>
                        <th className="p-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#113e3a]/60">
                      {selectedOrder.items?.map((it, idx) => (
                        <tr key={idx} className="hover:bg-[#082321]">
                          <td className="p-2.5">
                            <div className="font-medium text-white">
                              {it.variant?.product?.name || 'Item'} - {it.variant?.variant_name}
                            </div>
                            <div className="text-[11px] text-[#527d78] font-mono">{it.variant?.sku}</div>
                          </td>
                          <td className="p-2.5 text-center font-bold text-[#38d4c5]">
                            {it.ordered_quantity}
                          </td>
                          <td className="p-2.5 text-right text-[#a0c4c0]">
                            Rs. {it.unit_price.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-right font-semibold text-white">
                            Rs. {it.line_total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Delivery Details */}
              <div className="bg-[#031413] p-3.5 rounded-xl text-xs space-y-1.5 border border-[#164e48]">
                <div className="font-semibold text-white">Delivery Information:</div>
                <div className="text-[#a0c4c0]">Type: <span className="capitalize font-medium text-white">{selectedOrder.delivery_type.replace(/_/g, ' ')}</span></div>
                {selectedOrder.courier_name && <div className="text-[#a0c4c0]">Courier: <span className="font-medium text-[#38d4c5]">{selectedOrder.courier_name}</span></div>}
                {selectedOrder.tracking_number && <div className="text-[#a0c4c0]">Tracking #: <span className="font-mono font-bold text-[#38d4c5]">{selectedOrder.tracking_number}</span></div>}
                {selectedOrder.delivery_address && <div className="text-[#a0c4c0]">Address: <span className="font-medium text-white">{selectedOrder.delivery_address}</span></div>}
                {selectedOrder.notes && <div className="text-[#a0c4c0]">Notes: <span className="italic text-[#7aa5a0]">{selectedOrder.notes}</span></div>}
              </div>
            </div>

            <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-end">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#082321] hover:bg-[#12423c] hover:text-white shadow-sm"
                onClick={() => setViewDetailsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Dispatch Customer Order ───────────────────────────────── */}
      {dispatchModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-md w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#164e48] bg-[#0c2e2a]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#28153e] border border-[#9333ea]/30 rounded-xl text-[#c084fc]">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Dispatch Order #{selectedOrder.order_number}
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Attach courier tracking info and move to In-Transit status.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1.5 rounded-lg hover:bg-[#12423c]"
                onClick={() => setDispatchModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Courier / Delivery Partner
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:outline-none focus:border-[#c084fc]"
                  placeholder="e.g. PromptX, Domex, Pronto, Koombiyo, In-house"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Tracking / Waybill Number
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#c084fc]"
                  placeholder="e.g. PRX-9982481"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </div>

              <div className="p-3 bg-[#26153b] rounded-xl text-xs text-[#e9d5ff] border border-[#9333ea]/30">
                Dispatching maintains reserved inventory in-transit. Once the recipient or courier confirms delivery, mark delivery to generate the sales invoice.
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#164e48] bg-[#0c2e2a]">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#082321] hover:bg-[#12423c] hover:text-white"
                onClick={() => setDispatchModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-gradient-to-r from-[#9333ea] to-[#7e22ce] hover:from-[#7e22ce] hover:to-[#6b21a8] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#9333ea]/20 transition-all disabled:opacity-50"
                disabled={dispatchMutation.isPending}
                onClick={() =>
                  dispatchMutation.mutate({
                    orderId: selectedOrder.id,
                    tracking: { courier_name: courierName, tracking_number: trackingNumber },
                  })
                }
              >
                {dispatchMutation.isPending ? 'Dispatching...' : 'Confirm Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Deliver & Invoice Customer Order ──────────────────────── */}
      {deliverModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-md w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#164e48] bg-[#0c2e2a]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#092920] border border-[#059669]/40 rounded-xl text-[#34d399]">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Complete Delivery & Invoicing
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Order #{selectedOrder.order_number} • Customer: {selectedOrder.customer?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1.5 rounded-lg hover:bg-[#12423c]"
                onClick={() => setDeliverModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-[#031413] p-3.5 rounded-xl text-xs space-y-1.5 border border-[#164e48]">
                <div className="flex justify-between">
                  <span className="text-[#7aa5a0]">Order Grand Total:</span>
                  <span className="font-bold text-white">Rs. {selectedOrder.grand_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7aa5a0]">Advance Paid:</span>
                  <span className="font-semibold text-[#34d399]">Rs. {selectedOrder.advance_paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1.5 border-t border-[#164e48]">
                  <span className="font-semibold text-[#e2f1ef]">Remaining COD Balance:</span>
                  <span className="font-bold text-[#f87171]">Rs. {selectedOrder.balance_amount.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Payment Collected at Delivery (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white font-bold focus:outline-none focus:border-[#38d4c5]"
                  value={deliveryPaymentAmount}
                  onChange={(e) => setDeliveryPaymentAmount(parseFloat(e.target.value) || 0)}
                />
                <span className="text-[11px] text-[#527d78] mt-1 block">
                  Any uncollected balance will remain on the customer's credit ledger.
                </span>
              </div>

              {deliveryPaymentAmount > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Payment Method</label>
                    <select
                      className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                      value={deliveryPaymentMethod}
                      onChange={(e) => setDeliveryPaymentMethod(e.target.value)}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card POS</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Ref / Receipt #</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                      placeholder="Receipt reference..."
                      value={deliveryPaymentRef}
                      onChange={(e) => setDeliveryPaymentRef(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="p-3 bg-[#092920] rounded-xl text-xs text-[#a7f3d0] border border-[#059669]/40">
                Confirming delivery releases reserved inventory, creates formal stock movements, and generates an official sales invoice.
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#164e48] bg-[#0c2e2a]">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#082321] hover:bg-[#12423c] hover:text-white"
                onClick={() => setDeliverModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#059669]/20 transition-all disabled:opacity-50"
                disabled={deliverMutation.isPending}
                onClick={() =>
                  deliverMutation.mutate({
                    orderId: selectedOrder.id,
                    payment: {
                      amount: deliveryPaymentAmount,
                      payment_method: deliveryPaymentMethod,
                      payment_reference: deliveryPaymentRef,
                    },
                  })
                }
              >
                {deliverMutation.isPending ? 'Invoicing...' : 'Confirm Delivery & Post Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Cancel Customer Order ─────────────────────────────────── */}
      {cancelModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-md w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#164e48] bg-[#0c2e2a]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#290d13] border border-[#dc2626]/40 rounded-xl text-[#f87171]">
                  <XCircle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Cancel Order #{selectedOrder.order_number}
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Release reserved inventory back to available stock.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1.5 rounded-lg hover:bg-[#12423c]"
                onClick={() => setCancelModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Reason for Cancellation
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:outline-none focus:border-[#f87171]"
                  rows={3}
                  placeholder="Customer requested cancellation, item out of stock, payment rejected..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>

              <div className="p-3 bg-[#290d13] rounded-xl text-xs text-[#fca5a5] border border-[#dc2626]/40">
                Warning: Cancelling this order will release all active stock reservations. This action is permanently logged to the audit trail.
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#164e48] bg-[#0c2e2a]">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#082321] hover:bg-[#12423c] hover:text-white"
                onClick={() => setCancelModal(false)}
              >
                Go Back
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-gradient-to-r from-[#e11d48] to-[#be123c] hover:from-[#be123c] hover:to-[#9f1239] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#e11d48]/20 transition-all disabled:opacity-50"
                disabled={cancelMutation.isPending || !cancelReason.trim()}
                onClick={() =>
                  cancelMutation.mutate({
                    orderId: selectedOrder.id,
                    reason: cancelReason,
                  })
                }
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
