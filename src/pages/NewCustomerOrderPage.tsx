import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  Package,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowLeft,
  Info,
} from 'lucide-react'
import {
  fetchCustomersLookup,
  fetchBranchesLookup,
  fetchWarehousesAndLocations,
  fetchVariantsLookup,
  fetchCustomerCreditStatus,
  fetchCustomerTierPrice,
  createCustomerOrder,
} from '../services/orderService'
import type {
  CustomerCreditStatus,
  PricingTier,
  DeliveryType,
} from '../types/orders'

interface OrderLineDraft {
  product_variant_id: string
  variant_name: string
  sku: string
  available_stock: number
  ordered_quantity: number
  unit_price: number
  discount_amount: number
  line_total: number
}

export function NewCustomerOrderPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Header State
  const [branchId, setBranchId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [pricingTier, setPricingTier] = useState<PricingTier>('retail')
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('courier')
  const [courierName, setCourierName] = useState('PromptX Courier')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')

  // Payment State
  const [advancePaid, setAdvancePaid] = useState<number>(0)

  // Items State
  const [lines, setLines] = useState<OrderLineDraft[]>([])

  // Lookup queries
  const { data: branches } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  // Active Locations
  const activeBranchId = branchId || (branches?.[0]?.id ?? '')
  const { data: whLocData } = useQuery({
    queryKey: ['lookup', 'warehouses-locations', activeBranchId],
    queryFn: () => fetchWarehousesAndLocations(activeBranchId),
    enabled: !!activeBranchId,
  })

  const activeWarehouseId = warehouseId || (whLocData?.warehouses?.[0]?.id ?? '')
  const activeLocationId = locationId || (whLocData?.locations?.[0]?.id ?? '')

  const { data: customers } = useQuery({
    queryKey: ['lookup', 'customers'],
    queryFn: fetchCustomersLookup,
  })

  const { data: variants } = useQuery({
    queryKey: ['lookup', 'variants', activeLocationId],
    queryFn: () => fetchVariantsLookup(activeLocationId),
    enabled: !!activeLocationId,
  })

  // Customer Credit Status
  const { data: creditStatus, isLoading: creditLoading } = useQuery<CustomerCreditStatus | null>({
    queryKey: ['customer-credit', customerId],
    queryFn: () => (customerId ? fetchCustomerCreditStatus(customerId) : null),
    enabled: !!customerId,
  })

  const handleCustomerChange = (selectedId: string) => {
    setCustomerId(selectedId)
    if (selectedId && customers) {
      const cust = customers.find((c) => c.id === selectedId)
      if (cust) {
        setDeliveryAddress(cust.address || '')
        setContactPhone(cust.phone || '')
        if (cust.pricing_tier) {
          setPricingTier(cust.pricing_tier as PricingTier)
        }
      }
    }
  }

  // Calculations
  const subtotal = lines.reduce((acc, l) => acc + l.ordered_quantity * l.unit_price, 0)
  const discountTotal = lines.reduce((acc, l) => acc + l.discount_amount, 0)
  const grandTotal = Math.max(0, subtotal - discountTotal)
  const balanceAmount = Math.max(0, grandTotal - advancePaid)

  // Credit limit check
  const isCreditBlocked = creditStatus?.is_credit_blocked ?? false
  const currentOutstanding = creditStatus?.total_outstanding ?? 0
  const creditLimit = creditStatus?.credit_limit ?? 0
  const projectedBalance = currentOutstanding + balanceAmount
  const isOverLimit = creditLimit > 0 && projectedBalance > creditLimit

  // Add Item to Lines
  const handleAddLine = async (variantId: string) => {
    if (!variantId || !variants) return
    const v = variants.find((item) => item.id === variantId)
    if (!v) return

    // Check if already in lines
    if (lines.some((l) => l.product_variant_id === variantId)) {
      alert('This variant is already added. Increase quantity instead.')
      return
    }

    // Resolve tier price
    let resolvedPrice = v.retail_price
    if (customerId) {
      try {
        const tierPrice = await fetchCustomerTierPrice(customerId, variantId)
        if (tierPrice > 0) resolvedPrice = tierPrice
      } catch {
        // fallback
      }
    } else {
      if (pricingTier === 'wholesale') resolvedPrice = v.wholesale_price || v.retail_price
      if (pricingTier === 'special' || pricingTier === 'tier_1') resolvedPrice = v.special_price || v.retail_price
    }

    setLines((prev) => [
      ...prev,
      {
        product_variant_id: v.id,
        variant_name: `${v.product?.name || ''} - ${v.variant_name}`,
        sku: v.sku,
        available_stock: (v as unknown as { available_quantity?: number }).available_quantity ?? 50,
        ordered_quantity: 1,
        unit_price: resolvedPrice,
        discount_amount: 0,
        line_total: resolvedPrice,
      },
    ])
  }

  const updateLine = (
    idx: number,
    field: 'ordered_quantity' | 'unit_price' | 'discount_amount',
    val: number
  ) => {
    setLines((prev) => {
      const next = [...prev]
      const current = next[idx]
      if (!current) return prev
      const updated: OrderLineDraft = {
        ...current,
        [field]: val,
      }
      updated.line_total = Math.max(0, updated.ordered_quantity * updated.unit_price - updated.discount_amount)
      next[idx] = updated
      return next
    })
  }

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  // Create Order Mutation
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createCustomerOrder(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      alert(`Customer Order #${data.order_number} confirmed successfully! Inventory has been allocated.`)
      navigate('/sales/orders')
    },
    onError: (err: Error) => {
      alert('Failed to create order: ' + err.message)
    },
  })

  const handleSubmitOrder = () => {
    const finalBranchId = branchId || activeBranchId
    const finalWarehouseId = warehouseId || activeWarehouseId
    const finalLocationId = locationId || activeLocationId

    if (!finalBranchId || !finalWarehouseId || !finalLocationId) {
      alert('Please select branch, warehouse, and stock location.')
      return
    }
    if (!customerId) {
      alert('Please select a customer.')
      return
    }
    if (lines.length === 0) {
      alert('Please add at least one line item to the order.')
      return
    }
    if (isCreditBlocked) {
      alert('This customer account is credit blocked. Order cannot be placed without administrative override.')
      return
    }

    const payload = {
      branch_id: finalBranchId,
      warehouse_id: finalWarehouseId,
      stock_location_id: finalLocationId,
      customer_id: customerId,
      pricing_tier: pricingTier,
      delivery_type: deliveryType,
      courier_name: courierName,
      tracking_number: trackingNumber,
      delivery_address: deliveryAddress,
      contact_phone: contactPhone,
      expected_delivery_date: expectedDeliveryDate || null,
      subtotal,
      discount_total: discountTotal,
      tax_total: 0,
      grand_total: grandTotal,
      advance_paid: advancePaid,
      notes,
      items: lines.map((l) => ({
        product_variant_id: l.product_variant_id,
        ordered_quantity: l.ordered_quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
        tax_amount: 0,
        line_total: l.line_total,
      })),
    }

    createMutation.mutate(payload)
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/sales/orders"
            className="p-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <Package className="text-emerald-700" size={26} />
              New Customer Order & Delivery Booking
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Book customer orders with live credit verification, wholesale pricing tiers, and inventory reservations.
            </p>
          </div>
        </div>
      </div>

      {/* ── Order Setup & Customer Section ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Customer & Delivery Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection & Credit Status Card */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Customer & Credit Control
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Select Customer *
                </label>
                <select
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
                  value={customerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                >
                  <option value="">-- Choose Customer --</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customer_code}) {c.credit_limit > 0 ? `• Limit: Rs. ${c.credit_limit}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Pricing Tier
                </label>
                <select
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 uppercase font-semibold"
                  value={pricingTier}
                  onChange={(e) => setPricingTier(e.target.value as PricingTier)}
                >
                  <option value="retail">Retail Tier</option>
                  <option value="wholesale">Wholesale Tier</option>
                  <option value="tier_1">Tier 1 (Distributor)</option>
                  <option value="tier_2">Tier 2 (Bulk)</option>
                  <option value="special">Special / Key Account</option>
                </select>
              </div>
            </div>

            {/* Credit Health Banner */}
            {customerId && creditStatus && !creditLoading && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
                  isCreditBlocked
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : isOverLimit
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {isCreditBlocked ? (
                  <ShieldAlert size={20} className="text-rose-600 shrink-0 mt-0.5" />
                ) : isOverLimit ? (
                  <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                )}

                <div className="space-y-1 w-full">
                  <div className="font-bold flex items-center justify-between">
                    <span>
                      {isCreditBlocked
                        ? 'CUSTOMER IS CREDIT BLOCKED'
                        : isOverLimit
                        ? 'CREDIT LIMIT WARNING'
                        : 'CREDIT STANDING APPROVED'}
                    </span>
                    <span className="font-mono">
                      Tier: {creditStatus.pricing_tier.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <span className="text-gray-500">Credit Limit:</span>
                      <div className="font-semibold">Rs. {creditStatus.credit_limit.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Current Outstanding:</span>
                      <div className="font-semibold">Rs. {creditStatus.total_outstanding.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Available Allowance:</span>
                      <div className="font-bold">Rs. {creditStatus.available_credit.toFixed(2)}</div>
                    </div>
                  </div>

                  {isOverLimit && (
                    <div className="pt-1 text-[11px] text-amber-900 font-medium">
                      Notice: This new order balance (Rs. {balanceAmount.toFixed(2)}) brings the customer's total receivable to Rs. {projectedBalance.toFixed(2)}, which exceeds their credit limit of Rs. {creditLimit.toFixed(2)}. Requires override permission.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Delivery Specifications */}
            <div className="pt-3 border-t border-gray-100">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">
                Delivery Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Delivery Type
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
                    value={deliveryType}
                    onChange={(e) => setDeliveryType(e.target.value as DeliveryType)}
                  >
                    <option value="courier">Courier Partner</option>
                    <option value="store_pickup">Store Pickup</option>
                    <option value="internal_delivery">Internal Delivery Van</option>
                  </select>
                </div>

                {deliveryType === 'courier' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Courier Partner
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900"
                        placeholder="e.g. PromptX, Domex, Pronto"
                        value={courierName}
                        onChange={(e) => setCourierName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Tracking / Waybill #
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900 font-mono"
                        placeholder="Waybill reference"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Delivery Address
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900"
                    placeholder="Recipient delivery address..."
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900"
                    placeholder="077-XXXXXXX"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Order Notes / Special Handling
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900"
                    placeholder="Fragile, call prior to dispatch..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Card */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                Order Items & Inventory Allocation
              </h3>

              <div className="w-72">
                <select
                  className="w-full px-3 py-1.5 border border-emerald-300 rounded-xl text-xs bg-emerald-50/50 text-emerald-900 font-medium focus:ring-2 focus:ring-emerald-600"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddLine(e.target.value)
                      e.target.value = ''
                    }
                  }}
                >
                  <option value="">+ Add Product Variant to Order...</option>
                  {variants?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.product?.name} - {v.variant_name} ({v.sku})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {lines.length > 0 ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Product / SKU</th>
                      <th className="p-3 text-center">Available Stock</th>
                      <th className="p-3 text-center">Order Qty</th>
                      <th className="p-3 text-right">Unit Price (Rs.)</th>
                      <th className="p-3 text-right">Line Disc.</th>
                      <th className="p-3 text-right">Total (Rs.)</th>
                      <th className="p-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((line, idx) => (
                      <tr key={line.product_variant_id} className="hover:bg-gray-50/50">
                        <td className="p-3">
                          <div className="font-semibold text-gray-900">{line.variant_name}</div>
                          <div className="font-mono text-[11px] text-gray-400">{line.sku}</div>
                        </td>

                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              line.available_stock > 10
                                ? 'bg-emerald-50 text-emerald-700'
                                : line.available_stock > 0
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {line.available_stock} in stock
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            className="w-20 px-2.5 py-1 border border-gray-300 rounded-lg text-center font-bold text-gray-900"
                            value={line.ordered_quantity}
                            onChange={(e) =>
                              updateLine(idx, 'ordered_quantity', Math.max(1, parseFloat(e.target.value) || 1))
                            }
                          />
                        </td>

                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-24 px-2.5 py-1 border border-gray-300 rounded-lg text-right font-medium text-gray-900"
                            value={line.unit_price}
                            onChange={(e) =>
                              updateLine(idx, 'unit_price', Math.max(0, parseFloat(e.target.value) || 0))
                            }
                          />
                        </td>

                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-right text-gray-700"
                            value={line.discount_amount}
                            onChange={(e) =>
                              updateLine(idx, 'discount_amount', Math.max(0, parseFloat(e.target.value) || 0))
                            }
                          />
                        </td>

                        <td className="p-3 text-right font-bold text-gray-900 text-sm">
                          Rs. {line.line_total.toFixed(2)}
                        </td>

                        <td className="p-3 text-center">
                          <button
                            type="button"
                            className="text-gray-400 hover:text-rose-600 p-1"
                            onClick={() => removeLine(idx)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-2xl">
                <Package size={32} className="mx-auto text-gray-400 mb-2" />
                <div className="text-xs font-semibold text-gray-600">No items added to this order yet</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Use the dropdown selector above to add products to the customer order.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Branch, Warehouse & Summary */}
        <div className="space-y-6">
          {/* Fulfillment Origin Card */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3.5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Fulfillment Location
            </h3>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Branch</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
                value={branchId || activeBranchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Warehouse</label>
                <select
                  className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
                  value={warehouseId || activeWarehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {whLocData?.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Location / Bin</label>
                <select
                  className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
                  value={locationId || activeLocationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  {whLocData?.locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Payment & Grand Total Summary */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Order Financial Summary
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span className="font-semibold text-gray-900">Rs. {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Discount Total:</span>
                <span className="font-semibold text-emerald-700">- Rs. {discountTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Estimated Tax:</span>
                <span className="font-semibold text-gray-900">Rs. 0.00</span>
              </div>

              <div className="pt-2 border-t border-gray-200 flex justify-between text-base font-bold text-gray-900">
                <span>Grand Total:</span>
                <span className="text-emerald-800">Rs. {grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Advance Payment Input */}
            <div className="pt-3 border-t border-gray-100">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Advance Deposit Paid (Rs.)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  step="0.01"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 font-bold focus:ring-2 focus:ring-emerald-600"
                  value={advancePaid}
                  onChange={(e) => setAdvancePaid(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="mt-2.5 p-3 bg-gray-50 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Advance Paid:</span>
                  <span className="font-semibold text-emerald-700">Rs. {advancePaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-gray-800">Balance on Delivery:</span>
                  <span className="text-rose-600">Rs. {balanceAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="button"
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={createMutation.isPending || lines.length === 0 || !customerId}
              onClick={handleSubmitOrder}
            >
              <CheckCircle2 size={18} />
              {createMutation.isPending ? 'Confirming Order...' : 'Confirm Order & Reserve Stock'}
            </button>

            <div className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
              <Info size={12} />
              Stock is immediately allocated and reserved upon confirmation.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
