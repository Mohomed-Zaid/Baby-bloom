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
  Check,
  XCircle,
  FileText,
  MapPin,
  Phone,
  RefreshCw,
  X,
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
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      setDispatchModal(false)
      setSelectedOrder(null)
    },
    onError: (err: Error) => alert('Dispatch failed: ' + err.message),
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
      alert(`Order delivered successfully! Sales Invoice #${data.invoice_number} generated.`)
    },
    onError: (err: Error) => alert('Delivery failed: ' + err.message),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      cancelCustomerOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      setCancelModal(false)
      setSelectedOrder(null)
    },
    onError: (err: Error) => alert('Cancellation failed: ' + err.message),
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

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Check size={12} /> Confirmed
          </span>
        )
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={12} /> Processing
          </span>
        )
      case 'dispatched':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Truck size={12} /> In Transit
          </span>
        )
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} /> Delivered
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
            <XCircle size={12} /> Cancelled
          </span>
        )
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
            <Clock size={12} /> Pending
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
            <Package className="text-emerald-700" size={28} />
            Customer Orders & Delivery Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage customer order intake, warehouse stock allocations, courier dispatch tracking, and delivery invoicing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            <RefreshCw size={15} className={isRefetching ? 'animate-spin text-emerald-700' : ''} />
            Refresh
          </button>

          <Link
            to="/sales/new-order"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus size={16} />
            New Customer Order
          </Link>
        </div>
      </div>

      {/* ── Summary KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Active Orders</div>
          <div className="text-2xl font-bold text-gray-900 mt-1.5">{totalCount}</div>
          <div className="text-xs text-gray-400 mt-1">Filtered timeframe</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wider">Pending / Packing</div>
          <div className="text-2xl font-bold text-amber-600 mt-1.5">{pendingCount}</div>
          <div className="text-xs text-gray-400 mt-1">Ready for dispatch</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-purple-600 uppercase tracking-wider">Dispatched / In Transit</div>
          <div className="text-2xl font-bold text-purple-600 mt-1.5">{inTransitCount}</div>
          <div className="text-xs text-gray-400 mt-1">Courier & field delivery</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Delivered & Invoiced</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1.5">{deliveredCount}</div>
          <div className="text-xs text-gray-400 mt-1">Posted to ledger</div>
        </div>
      </div>

      {/* ── Status Tab Navigation ────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {[
          { id: 'all', label: 'All Orders' },
          { id: 'confirmed', label: 'Confirmed / Packing' },
          { id: 'dispatched', label: 'In Transit / Dispatched' },
          { id: 'delivered', label: 'Delivered' },
          { id: 'cancelled', label: 'Cancelled' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              filters.order_status === tab.id
                ? 'border-emerald-700 text-emerald-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setFilters((f) => ({ ...f, order_status: tab.id }))}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            placeholder="Search order #, customer, phone..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap gap-2.5 w-full md:w-auto items-center">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Filter size={14} /> Filters:
          </div>

          <select
            className="px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800 focus:ring-2 focus:ring-emerald-600"
            value={filters.branch_id}
            onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))}
          >
            <option value="all">All Branches</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select
            className="px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800 focus:ring-2 focus:ring-emerald-600"
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
            className="px-2.5 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
          />
          <span className="text-gray-400 text-xs">-</span>
          <input
            type="date"
            className="px-2.5 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
            value={filters.date_to}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
          />
        </div>
      </div>

      {/* ── Orders Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading customer orders...</div>
        ) : orders && orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Order #</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Delivery & Contact</th>
                  <th className="px-5 py-3.5 text-right">Grand Total</th>
                  <th className="px-5 py-3.5 text-right">Advance / Balance</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-gray-900">{order.order_number}</div>
                      <div className="text-xs text-gray-400">{order.branch?.name}</div>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-gray-600 whitespace-nowrap">
                      <div>{new Date(order.order_date).toLocaleDateString()}</div>
                      {order.expected_delivery_date && (
                        <div className="text-gray-400">Exp: {order.expected_delivery_date}</div>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-gray-900">{order.customer?.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone size={11} className="text-gray-400" />
                        {order.contact_phone || order.customer?.phone || 'No phone'}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-xs">
                      <div className="font-medium text-gray-800 capitalize">
                        {order.delivery_type.replace(/_/g, ' ')}
                      </div>
                      {order.courier_name && (
                        <div className="text-gray-500">
                          {order.courier_name} {order.tracking_number ? `(${order.tracking_number})` : ''}
                        </div>
                      )}
                      {order.delivery_address && (
                        <div className="text-gray-400 truncate max-w-xs flex items-center gap-1 mt-0.5">
                          <MapPin size={11} /> {order.delivery_address}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right font-bold text-gray-900">
                      Rs. {order.grand_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="px-5 py-3.5 text-right text-xs">
                      <div className="text-emerald-700 font-medium">
                        Adv: Rs. {order.advance_paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-rose-600 font-semibold">
                        Bal: Rs. {order.balance_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      {getStatusBadge(order.order_status)}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Inspect details */}
                        <button
                          type="button"
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-semibold transition-colors"
                            onClick={() => handleOpenDispatch(order)}
                          >
                            <Send size={12} /> Dispatch
                          </button>
                        )}

                        {/* Deliver & Invoice Button */}
                        {(order.order_status === 'dispatched' || order.order_status === 'confirmed') && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors"
                            onClick={() => handleOpenDeliver(order)}
                          >
                            <CheckCircle2 size={12} /> Deliver & Invoice
                          </button>
                        )}

                        {/* Cancel Button */}
                        {order.order_status !== 'delivered' && order.order_status !== 'cancelled' && (
                          <button
                            type="button"
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
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
            <Package size={44} className="mx-auto text-emerald-700 mb-3" />
            <h3 className="text-base font-semibold text-gray-900">No customer orders match this filter</h3>
            <p className="text-sm text-gray-500 mt-1">
              Create a new customer order or adjust your filter selection.
            </p>
            <div className="mt-4">
              <Link
                to="/sales/new-order"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Order Details: {selectedOrder.order_number}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Placed on {selectedOrder.order_date} • Customer: {selectedOrder.customer?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setViewDetailsModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-xl text-xs border border-gray-100">
                <div>
                  <span className="text-gray-500">Status:</span>
                  <div className="mt-1">{getStatusBadge(selectedOrder.order_status)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Pricing Tier:</span>
                  <div className="font-semibold uppercase text-emerald-700 mt-1">{selectedOrder.pricing_tier}</div>
                </div>
                <div>
                  <span className="text-gray-500">Advance Paid:</span>
                  <div className="font-semibold text-gray-900 mt-1">Rs. {selectedOrder.advance_paid.toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Balance Due:</span>
                  <div className="font-bold text-rose-600 mt-1">Rs. {selectedOrder.balance_amount.toFixed(2)}</div>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Order Items & Stock Reservations
                </h4>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                      <tr>
                        <th className="p-2.5">Product Variant</th>
                        <th className="p-2.5 text-center">Qty Ordered</th>
                        <th className="p-2.5 text-right">Unit Rate</th>
                        <th className="p-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedOrder.items?.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5">
                            <div className="font-medium text-gray-900">
                              {it.variant?.product?.name || 'Item'} - {it.variant?.variant_name}
                            </div>
                            <div className="text-[11px] text-gray-400 font-mono">{it.variant?.sku}</div>
                          </td>
                          <td className="p-2.5 text-center font-bold text-gray-800">
                            {it.ordered_quantity}
                          </td>
                          <td className="p-2.5 text-right">
                            Rs. {it.unit_price.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-right font-semibold text-gray-900">
                            Rs. {it.line_total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Delivery Details */}
              <div className="bg-gray-50 p-3.5 rounded-xl text-xs space-y-1.5 border border-gray-100">
                <div className="font-semibold text-gray-800">Delivery Information:</div>
                <div>Type: <span className="capitalize font-medium">{selectedOrder.delivery_type.replace(/_/g, ' ')}</span></div>
                {selectedOrder.courier_name && <div>Courier: <span className="font-medium">{selectedOrder.courier_name}</span></div>}
                {selectedOrder.tracking_number && <div>Tracking #: <span className="font-mono font-bold text-emerald-700">{selectedOrder.tracking_number}</span></div>}
                {selectedOrder.delivery_address && <div>Address: <span className="font-medium">{selectedOrder.delivery_address}</span></div>}
                {selectedOrder.notes && <div>Notes: <span className="italic text-gray-600">{selectedOrder.notes}</span></div>}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-700">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Dispatch Order #{selectedOrder.order_number}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Attach courier tracking info and move to In-Transit status.
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

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Courier / Delivery Partner
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                  placeholder="e.g. PromptX, Domex, Pronto, Koombiyo, In-house"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tracking / Waybill Number
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
                  placeholder="e.g. PRX-9982481"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </div>

              <div className="p-3 bg-purple-50 rounded-xl text-xs text-purple-900 border border-purple-100">
                Dispatching will hold the items as reserved in-transit. Once the courier or recipient receives them, mark delivery to auto-generate the sales invoice.
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
                className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Complete Delivery & Invoicing
                  </h3>
                  <p className="text-xs text-gray-500">
                    Order #{selectedOrder.order_number} • Customer: {selectedOrder.customer?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setDeliverModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 p-3.5 rounded-xl text-xs space-y-1 border border-gray-100">
                <div className="flex justify-between">
                  <span className="text-gray-500">Order Grand Total:</span>
                  <span className="font-bold text-gray-900">Rs. {selectedOrder.grand_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Advance Paid:</span>
                  <span className="font-semibold text-emerald-700">Rs. {selectedOrder.advance_paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                  <span className="font-semibold text-gray-800">Remaining Balance:</span>
                  <span className="font-bold text-rose-600">Rs. {selectedOrder.balance_amount.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Payment Collected at Delivery (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  value={deliveryPaymentAmount}
                  onChange={(e) => setDeliveryPaymentAmount(parseFloat(e.target.value) || 0)}
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Any uncollected balance will be posted to the customer's credit ledger.
                </span>
              </div>

              {deliveryPaymentAmount > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Method</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800 focus:ring-2 focus:ring-emerald-600"
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
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Ref / Receipt #</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900 focus:ring-2 focus:ring-emerald-600"
                      placeholder="Receipt reference..."
                      value={deliveryPaymentRef}
                      onChange={(e) => setDeliveryPaymentRef(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-900 border border-emerald-100">
                Confirming delivery releases reserved inventory, creates formal outward stock movements, and generates an official posted sales invoice.
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => setDeliverModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-50 rounded-lg text-rose-700">
                  <XCircle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Cancel Order #{selectedOrder.order_number}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Release reserved inventory back to available stock.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setCancelModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reason for Cancellation
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-600"
                  rows={3}
                  placeholder="Customer requested cancellation, item out of stock, payment rejected..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>

              <div className="p-3 bg-rose-50 rounded-xl text-xs text-rose-900 border border-rose-100">
                Warning: Cancelling this order will release all active stock reservations. This action is permanently logged to the security audit trail.
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => setCancelModal(false)}
              >
                Go Back
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
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
